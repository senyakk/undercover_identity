import {
  DRAW_KEY,
  INDEX_KEY,
  ROLE_GROUPS,
  getParticipantIds,
  json,
  makeToken,
  normalize,
  publicOrigin,
  putParticipantIds,
  readJson,
  requireKv,
  sha256
} from "./_lib.js";
import { assignRoles } from "./_assign.js";

export async function onRequestPost({ request, env }) {
  try {
    const kv = requireKv(env);
    const body = await readJson(request);
    if (!env.ADMIN_SECRET || body.adminSecret !== env.ADMIN_SECRET) {
      return json({ error: "Unauthorized Mission Control secret." }, 401);
    }

    if (body.action === "clearRoster") {
      const deleted = await clearRoster(kv);
      return json({ action: "clearRoster", ...deleted });
    }

    if (body.action === "removeParticipant") {
      const result = await removeParticipantByName(kv, body.name);
      return json({ action: "removeParticipant", ...result });
    }

    if (body.action === "removeParticipantById") {
      const result = await removeParticipantById(kv, body.participantId);
      return json({ action: "removeParticipantById", ...result });
    }

    if (body.action === "reissueRevealLink") {
      const result = await reissueRevealLink(kv, body.name, request);
      return json({ action: "reissueRevealLink", ...result });
    }

    if (body.action === "rerollParticipantRole") {
      const result = await rerollParticipantRole(kv, body.name);
      return json({ action: "rerollParticipantRole", ...result });
    }

    if (body.action === "clearDraw") {
      const assignmentCount = await clearDraw(kv);
      const ids = await getParticipantIds(kv);
      return json({ action: "clearDraw", assignmentCount, participantCount: ids.length });
    }

    if (body.action === "redraw") {
      const result = await redraw(kv);
      return json({ action: "redraw", ...result });
    }

    return json({ error: "Unknown reset action." }, 400);
  } catch (error) {
    return json({ error: error.message || "Reset failed" }, 500);
  }
}

async function removeParticipantByName(kv, name) {
  const participant = await findParticipantByName(kv, name);
  return deleteParticipant(kv, participant);
}

async function findParticipantByName(kv, name) {
  const targetName = String(name || "").trim();
  if (!targetName) {
    throw new Error("Enter the exact registered name.");
  }

  const ids = await getParticipantIds(kv);
  const matches = [];
  for (const id of ids) {
    const raw = await kv.get(`participant:${id}`);
    if (!raw) continue;
    const participant = JSON.parse(raw);
    if (normalize(participant.name) === normalize(targetName)) {
      matches.push(participant);
    }
  }

  if (!matches.length) {
    throw new Error(`No registered agent found named "${targetName}".`);
  }

  if (matches.length > 1) {
    throw new Error(`Multiple registered agents are named "${targetName}". Remove by name is ambiguous.`);
  }

  return matches[0];
}

async function removeParticipantById(kv, participantId) {
  const id = String(participantId || "").trim();
  if (!id) {
    throw new Error("Missing participant ID to remove.");
  }

  const raw = await kv.get(`participant:${id}`);
  if (!raw) {
    throw new Error("That registered agent was not found.");
  }

  return deleteParticipant(kv, JSON.parse(raw));
}

async function deleteParticipant(kv, participant) {
  const ids = await getParticipantIds(kv);
  const remainingIds = ids.filter((id) => id !== participant.id);
  await kv.delete(`participant:${participant.id}`);
  await kv.delete(`assignment:${participant.id}`);
  if (participant.tokenHash) {
    await kv.delete(`reveal:${participant.tokenHash}`);
  }
  await putParticipantIds(kv, remainingIds);

  const drawRaw = await kv.get(DRAW_KEY);
  if (drawRaw) {
    if (remainingIds.length) {
      await kv.put(DRAW_KEY, JSON.stringify({ ...JSON.parse(drawRaw), participantCount: remainingIds.length }));
    } else {
      await kv.delete(DRAW_KEY);
    }
  }

  return {
    removedName: participant.name,
    participantCount: remainingIds.length,
    drawComplete: Boolean(drawRaw)
  };
}

async function reissueRevealLink(kv, name, request) {
  const participant = await findParticipantByName(kv, name);
  const { token, tokenHash } = await createRevealCode(kv);
  if (participant.tokenHash) {
    await kv.delete(`reveal:${participant.tokenHash}`);
  }

  const updatedParticipant = {
    ...participant,
    tokenHash,
    revealReissuedAt: new Date().toISOString()
  };
  await kv.put(`participant:${participant.id}`, JSON.stringify(updatedParticipant));
  await kv.put(`reveal:${tokenHash}`, participant.id);

  return {
    name: participant.name,
    revealCode: token,
    revealUrl: `${publicOrigin(request)}/?token=${encodeURIComponent(token)}`
  };
}

async function rerollParticipantRole(kv, name) {
  const participant = await findParticipantByName(kv, name);
  const assignmentRaw = await kv.get(`assignment:${participant.id}`);
  if (!assignmentRaw) {
    throw new Error(`${participant.name} does not have an assigned role yet.`);
  }

  const currentAssignment = JSON.parse(assignmentRaw);
  const currentGroup = ROLE_GROUPS.find((group) => group.key === currentAssignment.groupKey);
  if (!currentGroup) {
    throw new Error(`Could not find ${participant.name}'s current role group.`);
  }
  if (currentGroup.type !== "single") {
    throw new Error(`${participant.name} has a pair role. Rerolling one half of a pair would break the counterpart's mission; use redraw instead.`);
  }

  const usedRoleIds = await getAssignedRoleIds(kv, participant.id);
  const usedGroupKeys = await getAssignedGroupKeys(kv, participant.id);
  const currentRoleId = currentAssignment.roleId || roleId(currentGroup, currentAssignment.slotIndex || 0);
  const candidates = shuffle(
    ROLE_GROUPS
      .flatMap((group) => group.slots.map((role, slotIndex) => ({ group, role, slotIndex })))
      .filter(({ group, role, slotIndex }) =>
        group.type === "single"
          && roleId(group, slotIndex) !== currentRoleId
          && !usedRoleIds.has(roleId(group, slotIndex))
          && dependenciesSatisfiedByAssignedRoles(group, usedGroupKeys)
          && eligible(participant, role)
      )
  );
  const candidate = candidates[0];
  if (!candidate) {
    throw new Error(`No unused eligible single roles are available for ${participant.name}.`);
  }

  const newAssignment = {
    ...makeSingleAssignment(participant, candidate.group, candidate.slotIndex),
    stabbingTarget: String(currentAssignment.stabbingTarget || ""),
    assignedAt: currentAssignment.assignedAt || new Date().toISOString(),
    rerolledAt: new Date().toISOString(),
    previousRoleId: currentRoleId
  };
  await kv.put(`assignment:${participant.id}`, JSON.stringify(newAssignment));

  const updatedTargetCount = await retargetAssassins(
    kv,
    participant.id,
    targetLabelsFor(currentAssignment),
    roleTargetLabel(newAssignment)
  );

  return {
    name: participant.name,
    oldRole: displayRole(currentAssignment),
    newRole: displayRole(newAssignment),
    updatedTargetCount
  };
}

async function getAssignedRoleIds(kv, excludedParticipantId = "") {
  const ids = new Set();
  let cursor;

  do {
    const page = await kv.list({ prefix: "assignment:", cursor });
    for (const key of page.keys) {
      const raw = await kv.get(key.name);
      if (!raw) continue;
      const assignment = JSON.parse(raw);
      if (assignment.participantId === excludedParticipantId) continue;
      if (assignment.roleId) ids.add(assignment.roleId);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return ids;
}

async function getAssignedGroupKeys(kv, excludedParticipantId = "") {
  const keys = new Set();
  let cursor;

  do {
    const page = await kv.list({ prefix: "assignment:", cursor });
    for (const key of page.keys) {
      const raw = await kv.get(key.name);
      if (!raw) continue;
      const assignment = JSON.parse(raw);
      if (assignment.participantId === excludedParticipantId) continue;
      if (assignment.groupKey) keys.add(assignment.groupKey);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return keys;
}

async function retargetAssassins(kv, rerolledParticipantId, oldTargetLabels, newTargetLabel) {
  let updated = 0;
  let cursor;

  do {
    const page = await kv.list({ prefix: "assignment:", cursor });
    for (const key of page.keys) {
      const raw = await kv.get(key.name);
      if (!raw) continue;
      const assignment = JSON.parse(raw);
      if (assignment.participantId === rerolledParticipantId) continue;
      if (!oldTargetLabels.has(String(assignment.stabbingTarget || ""))) continue;
      await kv.put(key.name, JSON.stringify({ ...assignment, stabbingTarget: newTargetLabel }));
      updated += 1;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return updated;
}

function makeSingleAssignment(person, group, slotIndex) {
  const role = group.slots[slotIndex];
  return {
    participantId: person.id,
    roleId: roleId(group, slotIndex),
    groupKey: group.key,
    slotIndex,
    partnerRole: "",
    title: role.title,
    identity: role.identity,
    mission: role.mission,
    bonus: role.bonus,
    outfit: role.outfit || ""
  };
}

function eligible(person, role) {
  const tags = new Set(role.tags || []);
  if (tags.has("romance") && !person.romanceOk) return false;
  if (tags.has("music") && !person.musicOk) return false;
  if (tags.has("camera") && person.cameraOk === false) return false;
  if ((tags.has("alcohol") || tags.has("food")) && person.foodDrinkOk === false) return false;
  return true;
}

function dependenciesSatisfiedByAssignedRoles(group, usedGroupKeys) {
  if (!group.requiresAnyGroupKey?.length) return true;
  return group.requiresAnyGroupKey.some((key) => usedGroupKeys.has(key));
}

function roleTargetLabel(assignment) {
  if (/\bcouple\b/i.test(assignment.title)) {
    return `${assignment.title} (only one person needed)`;
  }
  return assignment.title;
}

function targetLabelsFor(assignment) {
  return new Set([
    roleTargetLabel(assignment),
    String(assignment.title || ""),
    assignment.identity ? `${assignment.title} (${assignment.identity})` : "",
    String(assignment.identity || "")
  ].filter(Boolean));
}

function displayRole(assignment) {
  return assignment.identity
    ? `${assignment.title} (${assignment.identity})`
    : assignment.title;
}

function roleId(group, slotIndex) {
  return `${group.key}:${slotIndex}`;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

async function createRevealCode(kv) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const token = makeToken();
    const tokenHash = await sha256(token);
    if (!(await kv.get(`reveal:${tokenHash}`))) {
      return { token, tokenHash };
    }
  }
  throw new Error("Could not create a unique reveal code. Try again.");
}

async function clearRoster(kv) {
  const participantCount = await deleteByPrefix(kv, "participant:");
  const revealCount = await deleteByPrefix(kv, "reveal:");
  const assignmentCount = await clearDraw(kv);
  await kv.delete(INDEX_KEY);

  return { participantCount, revealCount, assignmentCount };
}

async function redraw(kv) {
  const ids = await getParticipantIds(kv);
  if (!ids.length) {
    throw new Error("No agents registered yet.");
  }

  const participants = [];
  for (const id of ids) {
    const raw = await kv.get(`participant:${id}`);
    if (raw) participants.push(JSON.parse(raw));
  }

  const assignments = assignRoles(participants);
  const assignedAt = new Date().toISOString();
  await clearDraw(kv);
  for (const assignment of assignments) {
    await kv.put(`assignment:${assignment.participantId}`, JSON.stringify({ ...assignment, assignedAt }));
  }
  await kv.put(DRAW_KEY, JSON.stringify({ assignedAt, participantCount: participants.length }));

  return { participantCount: participants.length };
}

async function clearDraw(kv) {
  const assignmentCount = await deleteByPrefix(kv, "assignment:");
  await kv.delete(DRAW_KEY);
  return assignmentCount;
}

async function deleteByPrefix(kv, prefix) {
  let deleted = 0;
  let cursor;

  do {
    const page = await kv.list({ prefix, cursor });
    for (const key of page.keys) {
      await kv.delete(key.name);
      deleted += 1;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return deleted;
}
