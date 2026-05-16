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
      unusedRoles: Math.max(totalRoles - usedRoles, 0)
    });
  } catch (error) {
    return json({ error: error.message || "Role count unavailable" }, 500);
  }
}
