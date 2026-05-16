import {
  DRAW_KEY,
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
import { assignLateRole } from "./_assign.js";

export async function onRequestPost({ request, env }) {
  try {
    const kv = requireKv(env);
    const drawComplete = Boolean(await kv.get(DRAW_KEY));

    const body = await readJson(request);
    const name = String(body.name || "").trim();
    if (name.length < 2) {
      return json({ error: "Enter a name with at least two characters." }, 400);
    }

    const id = crypto.randomUUID();
    const token = makeToken();
    const tokenHash = await sha256(token);
    const hasPartner = Boolean(body.hasPartner);
    const partnerName = hasPartner ? String(body.partnerName || "").trim().slice(0, 80) : "";

    const participant = {
      id,
      name: name.slice(0, 80),
      hasPartner,
      partnerName,
      partnerKey: normalize(partnerName),
      performanceOk: Boolean(body.performanceOk),
      cameraOk: Boolean(body.cameraOk),
      musicOk: Boolean(body.musicOk),
      alcoholOk: Boolean(body.alcoholOk),
      tokenHash,
      createdAt: new Date().toISOString()
    };

    const lateAssignment = drawComplete
      ? { ...(await assignLateRole(kv, participant)), assignedAt: new Date().toISOString() }
      : null;
    await kv.put(`participant:${id}`, JSON.stringify(participant));
    await kv.put(`reveal:${tokenHash}`, id);
    const ids = await getParticipantIds(kv);
    ids.push(id);
    await putParticipantIds(kv, ids);
    if (lateAssignment) {
      await kv.put(`assignment:${id}`, JSON.stringify(lateAssignment));
    }

    const revealUrl = `${publicOrigin(request)}/?token=${encodeURIComponent(token)}`;
    return json({ revealUrl, revealCode: token, drawComplete, assignment: lateAssignment });
  } catch (error) {
    return json({ error: error.message || "Signup failed" }, 500);
  }
}
