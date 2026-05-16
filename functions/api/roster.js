import {
  getParticipantIds,
  json,
  readJson,
  requireKv
} from "./_lib.js";

export async function onRequestPost({ request, env }) {
  try {
    const kv = requireKv(env);
    const body = await readJson(request);
    if (!env.ADMIN_SECRET || body.adminSecret !== env.ADMIN_SECRET) {
      return json({ error: "Unauthorized Mission Control secret." }, 401);
    }

    const ids = await getParticipantIds(kv);
    const names = [];
    for (const id of ids) {
      const raw = await kv.get(`participant:${id}`);
      if (!raw) continue;
      const participant = JSON.parse(raw);
      names.push(String(participant.name || "").trim());
    }

    return json({ participantCount: names.length, names: names.filter(Boolean) });
  } catch (error) {
    return json({ error: error.message || "Roster unavailable" }, 500);
  }
}
