import { ROLE_GROUPS, normalize } from "./_lib.js";

export function assignRoles(participants) {
  for (let attempt = 0; attempt < 1200; attempt += 1) {
    const selectedGroups = pickGroups(participants.length);
    const assignments = backtrackAssign(shuffle(participants), selectedGroups);
    if (assignments) return addStabbingTargets(assignments);
  }

  throw new Error("Could not satisfy the current constraints. Relax a few role clearances or add more broadly eligible guests.");
}

export async function assignLateRole(kv, participant) {
  const usedRoleIds = await getUsedRoleIds(kv);
  const usedGroupKeys = await getUsedGroupKeys(kv);
  const candidates = shuffle(
    ROLE_GROUPS
      .flatMap((group) =>
        group.slots.map((role, slotIndex) => ({ group, role, slotIndex }))
      )
      .filter(({ group, role, slotIndex }) => {
        if (group.type !== "single") return false;
        return !usedRoleIds.has(roleId(group, slotIndex))
          && dependenciesSatisfiedByAssignedRoles(group, usedGroupKeys)
          && eligible(participant, role);
      })
  );

  const candidate = candidates[0];
  if (!candidate) {
    throw new Error("No unused eligible late-arrival roles are available.");
  }

  const assignment = makeAssignment(participant, candidate.group, candidate.slotIndex);
  return withStabbingTarget(assignment, await pickLateStabbingTarget(kv, assignment));
}

function pickGroups(targetSize) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const groups = shuffle(ROLE_GROUPS);
    const selected = [];
    let remaining = targetSize;

    for (const group of groups) {
      const size = group.slots.length;
      if (size <= remaining) {
        selected.push(group);
        remaining -= size;
      }
      if (remaining === 0) break;
    }

    if (remaining === 0 && dependenciesSatisfied(selected)) {
      return selected.sort((a, b) => difficulty(b) - difficulty(a));
    }
  }

  throw new Error("Not enough compatible role slots for the number of registered agents.");
}

function backtrackAssign(participants, groups) {
  const used = new Set();
  const assignments = [];

  function visit(index) {
    if (index === groups.length) return true;
    const group = groups[index];

    if (group.type === "single") {
      const role = group.slots[0];
      const candidates = shuffle(participants.filter((person) => !used.has(person.id) && eligible(person, role)));
      for (const person of candidates) {
        used.add(person.id);
        assignments.push(makeAssignment(person, group, 0));
        if (visit(index + 1)) return true;
        assignments.pop();
        used.delete(person.id);
      }
      return false;
    }

    const pairs = candidatePairs(participants, group, used);
    for (const [first, second] of shuffle(pairs)) {
      used.add(first.id);
      used.add(second.id);
      assignments.push(makeAssignment(first, group, 0, counterpartRoleLabel(group, 1)));
      assignments.push(makeAssignment(second, group, 1, counterpartRoleLabel(group, 0)));
      if (visit(index + 1)) return true;
      assignments.pop();
      assignments.pop();
      used.delete(first.id);
      used.delete(second.id);
    }
    return false;
  }

  return visit(0) ? assignments : null;
}

function candidatePairs(participants, group, used) {
  const pairs = [];
  for (const first of participants) {
    if (used.has(first.id) || !eligible(first, group.slots[0])) continue;
    for (const second of participants) {
      if (first.id === second.id || used.has(second.id) || !eligible(second, group.slots[1])) continue;
      if (!attendanceOverlaps(first, second)) continue;
      if (group.notRealPartners && areRealPartners(first, second)) continue;
      pairs.push([first, second]);
    }
  }
  return pairs;
}

function eligible(person, role) {
  const tags = new Set(role.tags || []);
  if (tags.has("romance") && !person.romanceOk) return false;
  if (tags.has("music") && !person.musicOk) return false;
  if (tags.has("camera") && person.cameraOk === false) return false;
  if ((tags.has("alcohol") || tags.has("food")) && person.foodDrinkOk === false) return false;
  return true;
}

function areRealPartners(first, second) {
  const firstPartner = normalize(first.partnerName);
  const secondPartner = normalize(second.partnerName);
  const firstName = normalize(first.name);
  const secondName = normalize(second.name);
  return (firstPartner && firstPartner === secondName) || (secondPartner && secondPartner === firstName);
}

function attendanceOverlaps(first, second) {
  const firstParts = attendanceParts(first.attendance);
  const secondParts = attendanceParts(second.attendance);
  return firstParts.some((part) => secondParts.includes(part));
}

function attendanceParts(attendance = "both") {
  if (attendance === "barbecue") return ["barbecue"];
  if (attendance === "afterparty") return ["afterparty"];
  return ["barbecue", "afterparty"];
}

function makeAssignment(person, group, slotIndex, partnerName = "") {
  const role = group.slots[slotIndex];
  const partner = partnerName || "your assigned contact";
  return {
    participantId: person.id,
    roleId: roleId(group, slotIndex),
    groupKey: group.key,
    slotIndex,
    partnerRole: group.type === "pair" ? partner : "",
    title: role.title,
    identity: role.identity,
    mission: role.mission.replaceAll("{{partner}}", partner),
    bonus: role.bonus.replaceAll("{{partner}}", partner),
    outfit: (role.outfit || "").replaceAll("{{partner}}", partner)
  };
}

function addStabbingTargets(assignments) {
  if (assignments.length < 2) {
    return assignments.map((assignment) => withStabbingTarget(assignment, null));
  }

  const canAvoidSameGroup = assignments.every((assignment) =>
    assignments.some((target) =>
      target.participantId !== assignment.participantId && target.groupKey !== assignment.groupKey
    )
  );

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const targets = shuffle(assignments);
    if (targets.every((target, index) =>
      target.participantId !== assignments[index].participantId
        && (!canAvoidSameGroup || target.groupKey !== assignments[index].groupKey)
    )) {
      return assignments.map((assignment, index) => withStabbingTarget(assignment, targets[index]));
    }
  }

  const cycle = shuffle(assignments);
  return cycle.map((assignment, index) =>
    withStabbingTarget(assignment, cycle[(index + 1) % cycle.length])
  );
}

async function pickLateStabbingTarget(kv, assignment) {
  const existingAssignments = [];
  let cursor;

  do {
    const page = await kv.list({ prefix: "assignment:", cursor });
    for (const key of page.keys) {
      const raw = await kv.get(key.name);
      if (!raw) continue;
      const existing = JSON.parse(raw);
      if (existing.participantId !== assignment.participantId) {
        existingAssignments.push(existing);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  if (!existingAssignments.length) return null;

  const differentGroupTargets = existingAssignments.filter((target) => target.groupKey !== assignment.groupKey);
  const pool = differentGroupTargets.length ? differentGroupTargets : existingAssignments;
  return shuffle(pool)[0];
}

function withStabbingTarget(assignment, target) {
  return {
    ...assignment,
    stabbingTarget: target ? roleTargetLabel(target) : ""
  };
}

function roleTargetLabel(assignment) {
  return assignment.identity
    ? `${assignment.title} (${assignment.identity})`
    : assignment.title;
}

function counterpartRoleLabel(group, slotIndex) {
  const title = group.slots[slotIndex].title;
  const duplicateTitle = group.slots.some((slot, index) => index !== slotIndex && slot.title === title);
  return duplicateTitle ? duplicateCounterpartLabel(title) : title;
}

function duplicateCounterpartLabel(title) {
  if (/\bcouple\b/i.test(title)) return `the other person in your ${title.toLowerCase()}`;
  return `the other person with your ${title} role`;
}

function roleId(group, slotIndex) {
  return `${group.key}:${slotIndex}`;
}

export async function getUsedRoleIds(kv) {
  const usedRoleIds = new Set();
  let cursor;

  do {
    const page = await kv.list({ prefix: "assignment:", cursor });
    for (const key of page.keys) {
      const raw = await kv.get(key.name);
      if (!raw) continue;
      const assignment = JSON.parse(raw);
      const ids = assignment.roleId ? [assignment.roleId] : inferRoleIds(assignment);
      for (const id of ids) usedRoleIds.add(id);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return usedRoleIds;
}

async function getUsedGroupKeys(kv) {
  const usedGroupKeys = new Set();
  let cursor;

  do {
    const page = await kv.list({ prefix: "assignment:", cursor });
    for (const key of page.keys) {
      const raw = await kv.get(key.name);
      if (!raw) continue;
      const assignment = JSON.parse(raw);
      const groupKeys = assignment.groupKey ? [assignment.groupKey] : inferGroupKeys(assignment);
      for (const groupKey of groupKeys) usedGroupKeys.add(groupKey);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return usedGroupKeys;
}

function inferRoleIds(assignment) {
  const ids = [];
  for (const group of ROLE_GROUPS) {
    group.slots.forEach((role, slotIndex) => {
      if (role.title === assignment.title && role.identity === assignment.identity) {
        ids.push(roleId(group, slotIndex));
      }
    });
  }
  return ids;
}

function inferGroupKeys(assignment) {
  return [...new Set(inferRoleIds(assignment).map((id) => id.split(":")[0]))];
}

function dependenciesSatisfied(groups) {
  const selectedKeys = new Set(groups.map((group) => group.key));
  return groups.every((group) => {
    if (!group.requiresAnyGroupKey?.length) return true;
    return group.requiresAnyGroupKey.some((key) => selectedKeys.has(key));
  });
}

function dependenciesSatisfiedByAssignedRoles(group, usedGroupKeys) {
  if (!group.requiresAnyGroupKey?.length) return true;
  return group.requiresAnyGroupKey.some((key) => usedGroupKeys.has(key));
}

function difficulty(group) {
  const tagCount = group.slots.reduce((total, role) => total + (role.tags || []).length, 0);
  return tagCount + (group.type === "pair" ? 5 : 0);
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
