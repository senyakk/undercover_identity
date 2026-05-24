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

    if (await participantNameExists(kv, name)) {
      return json({ error: "Contact Senya to get your previous link." }, 409);
    }

    const id = crypto.randomUUID();
    const { token, tokenHash } = await createRevealCode(kv);
    const partnerName = String(body.partnerName || "").trim().slice(0, 80);
    const attendance = normalizeAttendance(body.attendance);

    const participant = {
      id,
      name: name.slice(0, 80),
      attendance,
      hasPartner: Boolean(partnerName),
      partnerName,
      partnerKey: normalize(partnerName),
      romanceOk: Boolean(body.romanceOk),
      musicOk: Boolean(body.musicOk),
      cameraOk: Boolean(body.cameraOk),
      foodDrinkOk: Boolean(body.foodDrinkOk),
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

function normalizeAttendance(value) {
  if (["barbecue", "afterparty", "both"].includes(value)) {
    return value;
  }
  return "both";
}

async function participantNameExists(kv, name) {
  const targetName = normalize(name);
  const ids = await getParticipantIds(kv);
  for (const id of ids) {
    const raw = await kv.get(`participant:${id}`);
    if (!raw) continue;
    const participant = JSON.parse(raw);
    if (normalize(participant.name) === targetName) {
      return true;
    }
  }
  return false;
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
