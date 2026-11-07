/**
 * Bản đồ Kanto — MỘT nguồn dữ liệu cho map canvas, danh sách Pokémon hoang dã, nhiệm vụ.
 * Pokémon chỉ xuất hiện ở khu vực hợp lệ (bảng encounter chính thức FireRed/LeafGreen).
 * Toạ độ x,y trong hệ 1000x640.
 */
import { ENCOUNTERS, SPECIES } from "./db.js";
import { GYMS } from "./gyms.js";
import { BADGES } from "./config.js";

const N = (id, name, kind, x, y, extra = {}) => ({ id, name, kind, x, y, center: false, ...extra });
const u = (badges, level = 0) => ({ badges, level });

// kind: town | route | forest | cave | sea | mountain | tower | building
export const NODES = [
  N("pallet", "Pallet Town", "town", 175, 520, { center: true, start: true, areas: ["pallet-town-area"] }),
  N("r1", "Route 1", "route", 175, 440, { areas: ["kanto-route-1-area"] }),
  N("viridian", "Viridian City", "town", 175, 360, { center: true, areas: ["viridian-city-area"], gym: "viridian" }),
  N("r22", "Route 22", "route", 100, 330, { areas: ["kanto-route-22-area"] }),
  N("r2", "Route 2", "route", 175, 290, { areas: ["kanto-route-2-south-towards-viridian-city", "kanto-route-2-north-towards-pewter-city"] }),
  N("vforest", "Viridian Forest", "forest", 175, 235, { areas: ["viridian-forest-area"] }),
  N("pewter", "Pewter City", "town", 175, 175, { center: true, gym: "pewter" }),
  N("r3", "Route 3", "route", 255, 150, { areas: ["kanto-route-3-area"], unlock: u(1) }),
  N("mtmoon", "Mt. Moon", "cave", 335, 150, { areas: ["mt-moon-1f", "mt-moon-b1f", "mt-moon-b2f"], unlock: u(1) }),
  N("r4", "Route 4", "route", 415, 160, { areas: ["kanto-route-4-area"], unlock: u(1) }),
  N("cerulean", "Cerulean City", "town", 500, 150, { center: true, areas: ["cerulean-city-area"], gym: "cerulean", unlock: u(1) }),
  N("r24", "Route 24", "route", 520, 95, { areas: ["kanto-route-24-area"], unlock: u(1) }),
  N("r25", "Route 25", "route", 600, 70, { areas: ["kanto-route-25-area"], unlock: u(1) }),
  N("r5", "Route 5", "route", 500, 225, { areas: ["kanto-route-5-area"], unlock: u(2) }),
  N("saffron", "Saffron City", "town", 500, 290, { center: true, gym: "saffron", unlock: u(4) }),
  N("r6", "Route 6", "route", 500, 355, { areas: ["kanto-route-6-area"], unlock: u(2) }),
  N("vermilion", "Vermilion City", "town", 500, 420, { center: true, areas: ["vermilion-city-area"], gym: "vermilion", unlock: u(2) }),
  N("r9", "Route 9", "route", 590, 150, { areas: ["kanto-route-9-area"], unlock: u(3) }),
  N("r10", "Route 10", "route", 680, 190, { areas: ["kanto-route-10-area"], unlock: u(3) }),
  N("rocktunnel", "Rock Tunnel", "cave", 710, 235, { areas: ["rock-tunnel-1f", "rock-tunnel-b1f"], unlock: u(3) }),
  N("powerplant", "Power Plant", "building", 770, 190, { areas: ["kanto-power-plant-area"], unlock: u(3) }),
  N("lavender", "Lavender Town", "town", 710, 300, { center: true, unlock: u(3) }),
  N("ptower", "Pokémon Tower", "tower", 770, 270, { areas: ["pokemon-tower-3f", "pokemon-tower-4f", "pokemon-tower-5f", "pokemon-tower-6f", "pokemon-tower-7f"], unlock: u(3) }),
  N("r8", "Route 8", "route", 600, 300, { areas: ["kanto-route-8-area"], unlock: u(3) }),
  N("r7", "Route 7", "route", 440, 300, { areas: ["kanto-route-7-area"], unlock: u(3) }),
  N("celadon", "Celadon City", "town", 375, 300, { center: true, areas: ["celadon-city-area"], gym: "celadon", unlock: u(3) }),
  N("r16", "Route 16", "route", 300, 310, { areas: ["kanto-route-16-area"], unlock: u(4) }),
  N("r17", "Route 17", "route", 270, 400, { areas: ["kanto-route-17-area"], unlock: u(4) }),
  N("r18", "Route 18", "route", 300, 490, { areas: ["kanto-route-18-area"], unlock: u(4) }),
  N("r11", "Route 11", "route", 580, 440, { areas: ["kanto-route-11-area"], unlock: u(2) }),
  N("r12", "Route 12", "route", 690, 380, { areas: ["kanto-route-12-area"], unlock: u(4) }),
  N("r13", "Route 13", "route", 660, 455, { areas: ["kanto-route-13-area"], unlock: u(4) }),
  N("r14", "Route 14", "route", 610, 510, { areas: ["kanto-route-14-area"], unlock: u(4) }),
  N("r15", "Route 15", "route", 540, 540, { areas: ["kanto-route-15-area"], unlock: u(4) }),
  N("fuchsia", "Fuchsia City", "town", 440, 560, { center: true, areas: ["fuchsia-city-area"], gym: "fuchsia", unlock: u(4) }),
  N("safari", "Safari Zone", "forest", 400, 500, { areas: ["kanto-safari-zone-area-1-east", "kanto-safari-zone-area-2-north", "kanto-safari-zone-area-3-west", "kanto-safari-zone-middle"], unlock: u(4) }),
  N("r19", "Route 19 (biển)", "sea", 430, 610, { areas: ["kanto-sea-route-19-area"], unlock: u(5) }),
  N("r20", "Route 20 (biển)", "sea", 330, 600, { areas: ["kanto-sea-route-20-area"], unlock: u(5) }),
  N("seafoam", "Seafoam Islands", "cave", 280, 590, { areas: ["seafoam-islands-1f", "seafoam-islands-b1f", "seafoam-islands-b2f", "seafoam-islands-b3f", "seafoam-islands-b4f"], unlock: u(5) }),
  N("cinnabar", "Cinnabar Island", "town", 175, 600, { center: true, areas: ["cinnabar-island-area"], gym: "cinnabar", unlock: u(6) }),
  N("mansion", "Pokémon Mansion", "building", 100, 585, { areas: ["pokemon-mansion-1f", "pokemon-mansion-2f", "pokemon-mansion-3f", "pokemon-mansion-b1f"], unlock: u(6) }),
  N("r21", "Route 21 (biển)", "sea", 175, 565, { areas: ["kanto-sea-route-21-area"], unlock: u(6) }),
  N("r23", "Route 23", "route", 70, 240, { areas: ["kanto-route-23-area"], unlock: u(8) }),
  N("victoryroad", "Victory Road", "mountain", 60, 170, { areas: ["kanto-victory-road-2-1f", "kanto-victory-road-2-2f", "kanto-victory-road-2-3f"], unlock: u(8) }),
  N("indigo", "Indigo Plateau", "town", 60, 100, { center: true, unlock: u(8), note: "Liên đoàn Pokémon — chưa mở thi đấu (sắp có)." }),
  N("ceruleancave", "Cerulean Cave", "cave", 560, 110, { areas: ["cerulean-cave-1f", "cerulean-cave-2f", "cerulean-cave-b1f"], unlock: u(8, 50), note: "Hang bí ẩn — luật project: 8 huy hiệu + Pokémon Lv50 (trong game cần vô địch Liên đoàn)." }),
];

export const EDGES = [
  ["pallet", "r1"], ["r1", "viridian"], ["viridian", "r22"], ["viridian", "r2"], ["r2", "vforest"], ["vforest", "pewter"],
  ["pewter", "r3"], ["r3", "mtmoon"], ["mtmoon", "r4"], ["r4", "cerulean"], ["cerulean", "r24"], ["r24", "r25"],
  ["cerulean", "r5"], ["r5", "saffron"], ["saffron", "r6"], ["r6", "vermilion"],
  ["cerulean", "r9"], ["r9", "r10"], ["r10", "rocktunnel"], ["r10", "powerplant"], ["rocktunnel", "lavender"], ["lavender", "ptower"],
  ["lavender", "r8"], ["r8", "saffron"], ["saffron", "r7"], ["r7", "celadon"], ["celadon", "r16"], ["r16", "r17"], ["r17", "r18"], ["r18", "fuchsia"],
  ["vermilion", "r11"], ["lavender", "r12"], ["r12", "r13"], ["r13", "r14"], ["r14", "r15"], ["r15", "fuchsia"], ["fuchsia", "safari"],
  ["fuchsia", "r19"], ["r19", "seafoam"], ["seafoam", "r20"], ["r20", "cinnabar"], ["cinnabar", "mansion"], ["cinnabar", "r21"], ["r21", "pallet"],
  ["r22", "r23"], ["r23", "victoryroad"], ["victoryroad", "indigo"], ["cerulean", "ceruleancave"],
];

const BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));
export function getNode(id) { return BY_ID[id] || null; }
export function listNodes() { return NODES; }
export const START_NODE = "pallet";

// ── Habitat: tổng hợp từ encounter chính thức ─────────────────
export function buildHabitats() {
  const out = {};
  for (const n of NODES) {
    const hab = { walk: [], surf: [], rod: [] };
    for (const area of n.areas || []) {
      const data = ENCOUNTERS[area];
      if (!data) continue;
      for (const method of ["walk", "surf", "rod"]) {
        for (const e of data[method] || []) hab[method].push(e);
      }
    }
    // gộp cùng loài/level
    for (const m of Object.keys(hab)) {
      const merged = new Map();
      for (const e of hab[m]) {
        const k = `${e.s}|${e.min}|${e.max}`;
        merged.set(k, { ...e, w: (merged.get(k)?.w || 0) + e.w });
      }
      hab[m] = [...merged.values()].sort((a, b) => b.w - a.w);
    }
    out[n.id] = hab;
  }
  return out;
}
export const HABITATS = buildHabitats();

export const METHOD_LABEL = { walk: "Cỏ / hang", surf: "Lướt sóng", rod: "Câu cá" };

export function availableMethods(nodeId) {
  const h = HABITATS[nodeId];
  if (!h) return [];
  return ["walk", "surf", "rod"].filter((m) => h[m].length);
}

/** Danh sách loài (duy nhất) với tỉ lệ % theo method */
export function wildList(nodeId, method) {
  const list = HABITATS[nodeId]?.[method] || [];
  const total = list.reduce((s, e) => s + e.w, 0) || 1;
  const bySpecies = new Map();
  for (const e of list) {
    const cur = bySpecies.get(e.s) || { s: e.s, min: e.min, max: e.max, w: 0 };
    cur.min = Math.min(cur.min, e.min); cur.max = Math.max(cur.max, e.max); cur.w += e.w;
    bySpecies.set(e.s, cur);
  }
  return [...bySpecies.values()].map((e) => ({ ...e, pct: (e.w / total) * 100 })).sort((a, b) => b.w - a.w);
}

export function spawnWild(nodeId, method = null) {
  const methods = availableMethods(nodeId);
  const m = method && methods.includes(method) ? method : methods[0];
  if (!m) return null;
  const list = HABITATS[nodeId][m];
  const total = list.reduce((s, e) => s + e.w, 0);
  let roll = Math.random() * total;
  let chosen = list[0];
  for (const e of list) { roll -= e.w; if (roll <= 0) { chosen = e; break; } }
  const level = chosen.min + Math.floor(Math.random() * (chosen.max - chosen.min + 1));
  return { species: chosen.s, level, nodeId, method: m };
}

// ── Mở khoá ──────────────────────────────────────────────────
export function unlockStatus(node, trainer) {
  const need = node.unlock || { badges: 0, level: 0 };
  const badges = (trainer.badges || []).length;
  const maxLv = Math.max(0, ...(trainer.collection || []).map((p) => p.level || 0));
  const reasons = [];
  if (badges < (need.badges || 0)) reasons.push(`Cần ${need.badges} huy hiệu (có ${badges})`);
  if (maxLv < (need.level || 0)) reasons.push(`Cần Pokémon Lv.${need.level} (cao nhất ${maxLv})`);
  return { open: reasons.length === 0, reasons, hint: reasons.length ? hintFor(node, need) : "" };
}
function hintFor(node, need) {
  const nextGym = Object.values(GYMS).find((g) => g.order === need.badges);
  if (need.badges && nextGym) return `Gợi ý: đánh bại ${nextGym.leader} ở ${getNode(nextGym.city)?.name}.`;
  if (need.badges >= 8) return "Gợi ý: thu thập đủ 8 huy hiệu Gym Kanto.";
  return "";
}

export function neighbors(id) {
  const out = [];
  for (const [a, b] of EDGES) {
    if (a === id) out.push(b);
    else if (b === id) out.push(a);
  }
  return out;
}

/** Số bước nhảy ngắn nhất (BFS) — dùng cho bước ấp trứng khi di chuyển */
export function hops(from, to, isOpen = () => true) {
  if (from === to) return 0;
  const seen = new Set([from]);
  let frontier = [from], d = 0;
  while (frontier.length) {
    d++;
    const next = [];
    for (const f of frontier) for (const nb of neighbors(f)) {
      if (nb === to) return isOpen(nb) ? d : Infinity;
      if (!seen.has(nb) && isOpen(nb)) { seen.add(nb); next.push(nb); }
    }
    frontier = next;
  }
  return Infinity;
}

export function findNode(query) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return null;
  if (BY_ID[q]) return BY_ID[q];
  const num = Number(q);
  if (Number.isInteger(num) && num >= 1 && num <= NODES.length) return NODES[num - 1];
  return NODES.find((n) => n.name.toLowerCase() === q) || NODES.find((n) => n.name.toLowerCase().includes(q)) || null;
}
export const BADGE_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]));

/** Kiểm tra dữ liệu: mọi loài trong habitat tồn tại trong Pokédex */
export function validateWorld() {
  const errs = [];
  for (const [id, hab] of Object.entries(HABITATS)) for (const m of Object.values(hab)) for (const e of m) if (!SPECIES[e.s]) errs.push(`${id}: loài lạ ${e.s}`);
  for (const [a, b] of EDGES) if (!BY_ID[a] || !BY_ID[b]) errs.push(`edge lỗi ${a}-${b}`);
  return errs;
}
