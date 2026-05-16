import { DRAW_KEY, getParticipantIds, json, requireKv } from "./_lib.js";

export async function onRequestGet({ env }) {
  try {
    const kv = requireKv(env);
    const ids = await getParticipantIds(kv);
    const drawComplete = Boolean(await kv.get(DRAW_KEY));
    return json({ participantCount: ids.length, drawComplete });
  } catch (error) {
    return json({ error: error.message || "State unavailable" }, 500);
  }
}
