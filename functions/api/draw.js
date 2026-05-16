import {
  DRAW_KEY,
  ROLE_GROUPS,
  getParticipantIds,
  json,
  normalize,
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

function assignRoles(participants) {
  for (let attempt = 0; attempt < 1200; attempt += 1) {
    const selectedGroups = pickGroups(participants.length);
    const assignments = backtrackAssign(shuffle(participants), selectedGroups);
    if (assignments) return assignments;
  }

  throw new Error("Could not satisfy the current constraints. Relax a few role clearances or add more broadly eligible guests.");
}

function pickGroups(targetSize) {
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

  if (remaining !== 0) {
    throw new Error("Not enough role slots for the number of registered agents.");
  }

  return selected.sort((a, b) => difficulty(b) - difficulty(a));
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
        assignments.push(makeAssignment(person, role));
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
      assignments.push(makeAssignment(first, group.slots[0], second.name));
      assignments.push(makeAssignment(second, group.slots[1], first.name));
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
      if (group.notRealPartners && areRealPartners(first, second)) continue;
      pairs.push([first, second]);
    }
  }
  return pairs;
}

function eligible(person, role) {
  const tags = new Set(role.tags || []);
  if (tags.has("performance") && !person.performanceOk) return false;
  if (tags.has("camera") && !person.cameraOk) return false;
  if (tags.has("music") && !person.musicOk) return false;
  if (tags.has("alcohol") && !person.alcoholOk) return false;

  const avoid = normalize(person.avoidRoles);
  if (!avoid) return true;
  const haystack = normalize(`${role.title} ${role.identity} ${role.mission}`);
  return !avoid
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .some((item) => haystack.includes(item));
}

function areRealPartners(first, second) {
  const firstPartner = normalize(first.partnerName);
  const secondPartner = normalize(second.partnerName);
  const firstName = normalize(first.name);
  const secondName = normalize(second.name);
  return (firstPartner && firstPartner === secondName) || (secondPartner && secondPartner === firstName);
}

function makeAssignment(person, role, partnerName = "") {
  const partner = partnerName || "your assigned contact";
  return {
    participantId: person.id,
    title: role.title,
    identity: role.identity,
    mission: role.mission.replaceAll("{{partner}}", partner),
    bonus: role.bonus.replaceAll("{{partner}}", partner)
  };
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
