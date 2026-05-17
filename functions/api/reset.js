import {
  DRAW_KEY,
  INDEX_KEY,
  getParticipantIds,
  json,
  normalize,
  putParticipantIds,
  readJson,
  requireKv
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
  const targetName = String(name || "").trim();
  if (!targetName) {
    throw new Error("Enter the exact registered name to remove.");
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

  const participant = matches[0];
  return deleteParticipant(kv, participant);
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
