import {
  ROLE_GROUPS,
  json,
  readJson,
  requireKv
} from "./_lib.js";
import { getUsedRoleIds } from "./_assign.js";

export async function onRequestPost({ request, env }) {
  try {
    const kv = requireKv(env);
    const body = await readJson(request);
    if (!env.ADMIN_SECRET || body.adminSecret !== env.ADMIN_SECRET) {
      return json({ error: "Unauthorized Mission Control secret." }, 401);
    }

    const groups = ROLE_GROUPS.length;
    const totalRoles = ROLE_GROUPS.reduce((total, group) => total + group.slots.length, 0);
    const pairedRoles = ROLE_GROUPS
      .filter((group) => group.type === "pair")
      .reduce((total, group) => total + group.slots.length, 0);
    const singleRoles = totalRoles - pairedRoles;
    const usedRoles = (await getUsedRoleIds(kv)).size;

    return json({
      groups,
      totalRoles,
      singleRoles,
      pairedRoles,
      usedRoles,
      unusedRoles: Math.max(totalRoles - usedRoles, 0),
      ...(body.includePreview ? { previewAssignment: makePreviewAssignment() } : {})
    });
  } catch (error) {
    return json({ error: error.message || "Role count unavailable" }, 500);
  }
}

function makePreviewAssignment() {
  const group = pickPreviewGroup();
  const slotIndex = group.type === "pair" && group.slots.length > 1
    ? Math.floor(Math.random() * group.slots.length)
    : 0;
  const role = group.slots[slotIndex];
  const partnerRole = group.type === "pair" ? counterpartRoleLabel(group, slotIndex) : "";
  const partner = partnerRole || "your assigned contact";
  const stabbingTarget = pickPreviewStabbingTarget(group);

  return {
    title: role.title,
    identity: role.identity,
    partnerRole,
    stabbingTarget,
    mission: role.mission.replaceAll("{{partner}}", partner),
    bonus: role.bonus.replaceAll("{{partner}}", partner),
    outfit: (role.outfit || "").replaceAll("{{partner}}", partner)
  };
}

function pickPreviewGroup() {
  const pairedGroups = ROLE_GROUPS.filter((group) => group.type === "pair");
  const pool = pairedGroups.length ? pairedGroups : ROLE_GROUPS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickPreviewStabbingTarget(ownGroup) {
  const candidates = ROLE_GROUPS
    .filter((group) => group.key !== ownGroup.key)
    .flatMap((group) => group.slots);
  const pool = candidates.length ? candidates : ROLE_GROUPS.flatMap((group) => group.slots);
  const target = pool[Math.floor(Math.random() * pool.length)];
  return target.identity ? `${target.title} (${target.identity})` : target.title;
}

function counterpartRoleLabel(group, slotIndex) {
  const title = group.slots[slotIndex].title;
  const duplicateTitle = group.slots.some((slot, index) => index !== slotIndex && slot.title === title);
  return duplicateTitle ? `the other ${title}` : title;
}
