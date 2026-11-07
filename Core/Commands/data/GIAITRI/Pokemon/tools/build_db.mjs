/**
 * Pokemon DB builder — gom dữ liệu chính thức từ PokeAPI (api-data trên GitHub) thành db/*.json
 * Chạy:  node Core/Commands/data/GIAITRI/Pokemon/tools/build_db.mjs [thư_mục_cache]
 * Nguồn: https://github.com/PokeAPI/api-data  (dữ liệu game: stats, chiêu, tiến hóa, tỉ lệ xuất hiện FRLG)
 * Phạm vi: Kanto (Pokédex #1-151). Learnset + encounter lấy từ FireRed/LeafGreen.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "db");
const CACHE = path.resolve(process.argv[2] || path.join(__dirname, ".cache"));
const BASE = "https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2";
const MAX_DEX = 151;
const VG = "firered-leafgreen";
const VERSIONS = ["firered", "leafgreen"];
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

async function get(p) {
  const f = path.join(CACHE, p.replace(/\//g, "_"));
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${BASE}/${p}/index.json`);
      if (!r.ok) throw new Error(`${r.status} ${p}`);
      const t = await r.text();
      fs.writeFileSync(f, t);
      return JSON.parse(t);
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}
const idOf = (url) => Number(String(url).match(/(\d+)\/?$/)[1]);
const en = (names) => (names || []).find((n) => n.language.name === "en")?.name;

const species = {};
const moveIds = new Set();
const chains = new Map();
const dexIds = Array.from({ length: MAX_DEX }, (_, i) => i + 1);
const raw = {};

await pool(dexIds, 10, async (id) => {
  const [p, s] = await Promise.all([get(`pokemon/${id}`), get(`pokemon-species/${id}`)]);
  raw[id] = { p, s };
  chains.set(idOf(s.evolution_chain.url), true);
  for (const m of p.moves) {
    if (m.version_group_details.some((v) => v.version_group.name === VG && v.move_learn_method.name === "level-up")) moveIds.add(idOf(m.move.url));
  }
});
const chainData = {};
await pool([...chains.keys()], 10, async (c) => { chainData[c] = await get(`evolution-chain/${c}`); });
const moves = {};
const moveSlugById = {};
await pool([...moveIds], 10, async (m) => {
  const d = await get(`move/${m}`);
  moveSlugById[m] = d.name;
  moves[d.name] = {
    id: d.name, name: en(d.names) || d.name, type: d.type.name, power: d.power, accuracy: d.accuracy,
    pp: d.pp, cls: d.damage_class.name, priority: d.priority,
  };
});

// evolution edges
const edges = {}; // from -> [{to, ...}]
const evolvesFrom = {};
const slugToDex = {};
for (const id of dexIds) slugToDex[raw[id].s.name] = id;
function walk(node, parent) {
  const from = node.species.name;
  for (const ev of node.evolves_to) {
    const to = ev.species.name;
    if (slugToDex[to]) {
      const seen = new Set();
      for (const d of ev.evolution_details) {
        const e = { to, trigger: d.trigger.name };
        if (d.min_level) e.minLevel = d.min_level;
        if (d.item) e.item = d.item.name;
        if (d.held_item) e.heldItem = d.held_item.name;
        if (d.min_happiness) e.minHappiness = d.min_happiness;
        if (d.time_of_day) e.timeOfDay = d.time_of_day;
        if (d.known_move) e.knownMove = d.known_move.name;
        if (d.trade_species) e.tradeSpecies = d.trade_species.name;
        if (d.min_affection) e.minAffection = d.min_affection;
        const key = JSON.stringify(e);
        if (seen.has(key)) continue;
        seen.add(key);
        (edges[from] ||= []).push(e);
      }
      if (slugToDex[from]) evolvesFrom[to] = from;
    }
    walk(ev, node);
  }
}
for (const c of Object.values(chainData)) walk(c.chain, null);

for (const id of dexIds) {
  const { p, s } = raw[id];
  const st = Object.fromEntries(p.stats.map((x) => [x.stat.name, x.base_stat]));
  const learn = [];
  for (const m of p.moves) {
    for (const v of m.version_group_details) {
      if (v.version_group.name === VG && v.move_learn_method.name === "level-up") {
        const slug = moveSlugById[idOf(m.move.url)];
        if (slug) learn.push([v.level_learned_at, slug]);
      }
    }
  }
  learn.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  species[s.name] = {
    id: s.name, dex: id, name: en(s.names) || s.name,
    types: p.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    base: { hp: st.hp, atk: st.attack, def: st.defense, spa: st["special-attack"], spd: st["special-defense"], spe: st.speed },
    baseExp: p.base_experience, catchRate: s.capture_rate, growth: s.growth_rate.name,
    hatchCounter: s.hatch_counter, baseHappiness: s.base_happiness,
    legendary: !!s.is_legendary, mythical: !!s.is_mythical,
    evolvesFrom: evolvesFrom[s.name] || null,
    evolutions: edges[s.name] || [],
    learnset: learn,
    height: p.height, weight: p.weight,
    flavor: (s.flavor_text_entries.find((f) => f.language.name === "en" && ["firered", "leafgreen"].includes(f.version.name))?.flavor_text || "").replace(/[\n\f]/g, " "),
    artwork: p.sprites.other["official-artwork"].front_default,
  };
}

// growth tables
const growth = {};
for (let g = 1; g <= 6; g++) {
  const d = await get(`growth-rate/${g}`);
  growth[d.name] = [0, ...d.levels.map((l) => l.experience)];
}

// encounters (FRLG, walk/surf/rod (câu), no special conditions)
const METHOD_MAP = { walk: "walk", surf: "surf", "old-rod": "rod", "good-rod": "rod", "super-rod": "rod" };
const enc = {};
await pool(dexIds, 10, async (id) => {
  const list = await get(`pokemon/${id}/encounters`);
  for (const a of list) {
    for (const vd of a.version_details) {
      if (!VERSIONS.includes(vd.version.name)) continue;
      const slotChance = {};
      for (const d of vd.encounter_details) {
        const method = METHOD_MAP[d.method.name];
        if (!method || d.condition_values.length) continue;
        const k = `${method}|${d.min_level}|${d.max_level}`;
        slotChance[k] = (slotChance[k] || 0) + d.chance;
      }
      for (const [k, chance] of Object.entries(slotChance)) {
        const [method, min, max] = k.split("|");
        const area = (enc[a.location_area.name] ||= {});
        const arr = (area[method] ||= {});
        const key = `${raw[id].s.name}|${min}|${max}`;
        // version-exclusive: lấy max giữa 2 bản
        arr[key] = Math.max(arr[key] || 0, chance);
      }
    }
  }
});
const encounters = {};
for (const [area, methods] of Object.entries(enc)) {
  for (const [method, m] of Object.entries(methods)) {
    (encounters[area] ||= {})[method] = Object.entries(m).map(([k, chance]) => {
      const [s, min, max] = k.split("|");
      return { s, min: +min, max: +max, w: chance };
    }).sort((a, b) => b.w - a.w || a.s.localeCompare(b.s));
  }
}

fs.writeFileSync(path.join(OUT, "species.json"), JSON.stringify(species));
fs.writeFileSync(path.join(OUT, "moves.json"), JSON.stringify(moves));
fs.writeFileSync(path.join(OUT, "growth.json"), JSON.stringify(growth));
fs.writeFileSync(path.join(OUT, "encounters.json"), JSON.stringify(encounters));
fs.writeFileSync(path.join(OUT, "SOURCE.txt"), `Generated ${new Date().toISOString()} from PokeAPI/api-data (FireRed/LeafGreen learnsets & encounters, Pokédex #1-151).\n`);
console.log("species", Object.keys(species).length, "moves", Object.keys(moves).length, "areas", Object.keys(encounters).length);
