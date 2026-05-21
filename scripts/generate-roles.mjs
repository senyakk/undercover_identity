import { readFile, writeFile } from "node:fs/promises";

const csvPath = new URL("../roles.csv", import.meta.url);
const outputPath = new URL("../functions/api/_roles.generated.js", import.meta.url);

const csv = await readFile(csvPath, "utf8");
const rows = parseCsv(csv);
const groups = buildGroups(rows);

await writeFile(
  outputPath,
  `// Generated from roles.csv. Do not edit by hand.\nexport const ROLE_GROUPS = ${JSON.stringify(groups, null, 2)};\n`
);

console.log(`Generated ${groups.reduce((total, group) => total + group.slots.length, 0)} roles in ${groups.length} groups.`);

function buildGroups(rows) {
  const map = new Map();

  for (const row of rows) {
    const role = cell(row.role);
    if (!role) continue;

    const groupKey = cell(row.group_key) || slug(role);
    const count = cell(row.count);
    const slotCount = count.includes("+") ? count.split("+").length : 1;
    const slotTitles = splitSlots(row.slot_titles);
    const slotIdentities = splitSlots(row.slot_identities);
    const tags = splitList(row.tags);
    const requiresAnyGroupKey = splitList(row.requires_any_group_key);

    if (!map.has(groupKey)) {
      map.set(groupKey, {
        key: groupKey,
        type: cell(row.type) || "single",
        slots: [],
        ...(isTrue(row.not_real_partners) ? { notRealPartners: true } : {}),
        ...(requiresAnyGroupKey.length ? { requiresAnyGroupKey } : {})
      });
    }

    const group = map.get(groupKey);
    if (isTrue(row.not_real_partners)) group.notRealPartners = true;
    if (requiresAnyGroupKey.length) {
      group.requiresAnyGroupKey = [...new Set([...(group.requiresAnyGroupKey || []), ...requiresAnyGroupKey])];
    }

    for (let index = 0; index < slotCount; index += 1) {
      group.slots.push({
        title: slotTitles[index] || role,
        identity: slotIdentities[index] || cell(row.undercover_identity),
        mission: cell(row.mission),
        bonus: cell(row.bonus),
        outfit: cell(row.outfit),
        tags
      });
    }
  }

  return [...map.values()].map((group) => ({
    ...group,
    type: group.slots.length > 1 ? "pair" : "single"
  }));
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const firstLineEnd = input.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? input : input.slice(0, firstLineEnd);
  const delimiter = firstLine.includes(";") ? ";" : ",";

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift().map((header) => header.trim());
  return rows
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function cell(value) {
  return String(value || "").trim();
}

function splitList(value) {
  return cell(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitSlots(value) {
  return splitList(value);
}

function isTrue(value) {
  return ["1", "true", "yes"].includes(cell(value).toLowerCase());
}

function slug(value) {
  return cell(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
