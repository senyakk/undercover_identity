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

    const includeAssignments = Boolean(body.includeAssignments);
    const ids = await getParticipantIds(kv);
    const agents = [];
    for (const id of ids) {
      const raw = await kv.get(`participant:${id}`);
      if (!raw) continue;
      const participant = JSON.parse(raw);
      const name = String(participant.name || "").trim();
      if (!name) continue;
      const assignment = includeAssignments
        ? await readAssignmentSummary(kv, participant.id)
        : undefined;
      agents.push({
        id: participant.id,
        name,
        attendance: normalizeAttendanceLabel(participant.attendance),
        partnerName: String(participant.partnerName || "").trim(),
        romanceOk: Boolean(participant.romanceOk),
        musicOk: Boolean(participant.musicOk),
        cameraOk: participant.cameraOk !== false,
        foodDrinkOk: participant.foodDrinkOk !== false,
        ...(includeAssignments ? { assignment } : {})
      });
    }

    return json({
      participantCount: agents.length,
      names: agents.map((agent) => agent.name),
      includesAssignments: includeAssignments,
      summary: {
        partnerCount: agents.filter((agent) => agent.partnerName).length,
        romanceOkCount: agents.filter((agent) => agent.romanceOk).length,
        musicOkCount: agents.filter((agent) => agent.musicOk).length,
        cameraOkCount: agents.filter((agent) => agent.cameraOk).length,
        foodDrinkOkCount: agents.filter((agent) => agent.foodDrinkOk).length,
        barbecueOnlyCount: agents.filter((agent) => agent.attendance === "Barbecue only").length,
        afterpartyOnlyCount: agents.filter((agent) => agent.attendance === "Afterparty only").length,
        bothCount: agents.filter((agent) => agent.attendance === "Barbecue + afterparty").length
      },
      agents
    });
  } catch (error) {
    return json({ error: error.message || "Roster unavailable" }, 500);
  }
}

function normalizeAttendanceLabel(value) {
  if (value === "barbecue") return "Barbecue only";
  if (value === "afterparty") return "Afterparty only";
  return "Barbecue + afterparty";
}

async function readAssignmentSummary(kv, participantId) {
  const raw = await kv.get(`assignment:${participantId}`);
  if (!raw) return null;

  const assignment = JSON.parse(raw);
  return {
    title: String(assignment.title || ""),
    identity: String(assignment.identity || ""),
    partnerRole: String(assignment.partnerRole || ""),
    stabbingTarget: String(assignment.stabbingTarget || "")
  };
}
