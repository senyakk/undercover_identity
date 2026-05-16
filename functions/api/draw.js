import {
  DRAW_KEY,
  getParticipantIds,
  json,
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

    if (await kv.get(DRAW_KEY)) {
      const ids = await getParticipantIds(kv);
      return json({ participantCount: ids.length, alreadyComplete: true });
    }

    const ids = await getParticipantIds(kv);
    if (!ids.length) {
      return json({ error: "No agents registered yet." }, 400);
    }

    const participants = [];
    for (const id of ids) {
      const raw = await kv.get(`participant:${id}`);
      if (raw) participants.push(JSON.parse(raw));
    }

    const assignments = assignRoles(participants);
    const assignedAt = new Date().toISOString();
    for (const assignment of assignments) {
      await kv.put(`assignment:${assignment.participantId}`, JSON.stringify({ ...assignment, assignedAt }));
    }
    await kv.put(DRAW_KEY, JSON.stringify({ assignedAt, participantCount: participants.length }));

    return json({ participantCount: participants.length });
  } catch (error) {
    return json({ error: error.message || "Draw failed" }, 500);
  }
}
