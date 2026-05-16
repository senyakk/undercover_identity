import { DRAW_KEY, json, requireKv, sha256 } from "./_lib.js";

export async function onRequestGet({ request, env }) {
  try {
    const kv = requireKv(env);
    const url = new URL(request.url);
    const token = String(url.searchParams.get("token") || "").trim();
    if (!token) {
      return json({ error: "Missing reveal code." }, 400);
    }

    const participantId = await findParticipantIdByToken(kv, token);
    if (!participantId) {
      return json({ error: "Reveal code not found." }, 404);
    }

    const participant = JSON.parse(await kv.get(`participant:${participantId}`));
    const drawComplete = Boolean(await kv.get(DRAW_KEY));
    if (!drawComplete) {
      return json({ drawComplete: false, name: participant.name });
    }

    const assignmentRaw = await kv.get(`assignment:${participantId}`);
    if (!assignmentRaw) {
      return json({ error: "No assignment found for this code." }, 404);
    }

    return json({ drawComplete: true, assignment: JSON.parse(assignmentRaw) });
  } catch (error) {
    return json({ error: error.message || "Reveal failed" }, 500);
  }
}

async function findParticipantIdByToken(kv, token) {
  const exactHash = await sha256(token);
  const exactMatch = await kv.get(`reveal:${exactHash}`);
  if (exactMatch || !/^[a-z]{5}$/i.test(token)) {
    return exactMatch;
  }

  const uppercaseHash = await sha256(token.toUpperCase());
  return kv.get(`reveal:${uppercaseHash}`);
}
