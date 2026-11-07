/**
 * Pokédex Kanto #1-151 — dữ liệu chính thức (PokeAPI). Không tự bịa Pokémon/chiêu/tiến hóa.
 * Lưu ý: ảnh từng loài ở assets/pokemon/species/{id}.png (xem assets.js)
 */
import { SPECIES, MOVES, GROWTH } from "./db.js";
import { CONFIG } from "./config.js";

export const POKEDEX = SPECIES;
export const STARTERS = ["bulbasaur", "charmander", "squirtle"];
export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
export const STAT_LABEL = { hp: "HP", atk: "ATK", def: "DEF", spa: "SP.ATK", spd: "SP.DEF", spe: "SPEED" };

// Chỉ giữ cách tiến hóa mà hệ thống hỗ trợ (bỏ vật phẩm chỉ có ở vùng khác, ví dụ galarica-cuff)
const SUPPORTED_ITEMS = new Set(["fire-stone", "water-stone", "thunder-stone", "leaf-stone", "moon-stone"]);
for (const s of Object.values(SPECIES)) {
  s.evolutions = (s.evolutions || []).filter((e) => !e.item || SUPPORTED_ITEMS.has(e.item));
}

export function getPokemon(id) {
  return SPECIES[id] || null;
}
export function getMove(id) {
  return MOVES[id] || null;
}
export function listSpecies() {
  return Object.values(SPECIES).sort((a, b) => a.dex - b.dex);
}

// ── EXP ───────────────────────────────────────────────────
export function expForSpeciesLevel(speciesId, level) {
  const s = SPECIES[speciesId];
  const table = GROWTH[s?.growth] || GROWTH.medium;
  const lv = Math.max(1, Math.min(100, level));
  return table[lv] ?? 0;
}
export function levelForSpeciesExp(speciesId, exp) {
  let lv = 1;
  while (lv < 100 && expForSpeciesLevel(speciesId, lv + 1) <= exp) lv++;
  return lv;
}

// ── Chỉ số (công thức chính thức Gen 3+, IV cố định theo cá thể, EV = 0) ──
export function calcStats(speciesId, level, iv = {}, bonus = {}) {
  const s = SPECIES[speciesId];
  if (!s) return { maxHp: 10, hp: 10, atk: 5, def: 5, spa: 5, spd: 5, spe: 5 };
  const lv = Math.max(1, Math.min(100, level));
  const b = s.base;
  const I = (k) => (iv[k] ?? 15);
  const maxHp = Math.floor(((2 * b.hp + I("hp")) * lv) / 100) + lv + 10 + (bonus.hp || 0);
  const other = (k) => Math.floor(((2 * b[k] + I(k)) * lv) / 100) + 5 + (bonus[k] || 0);
  return { maxHp, hp: maxHp, atk: other("atk"), def: other("def"), spa: other("spa"), spd: other("spd"), spe: other("spe") };
}

/** Chiêu học được tại level (hoặc thấp hơn) theo learnset chính thức, loại trùng, ưu tiên bản mới nhất */
export function learnedByLevel(speciesId, level) {
  const s = SPECIES[speciesId];
  if (!s) return [];
  const seen = new Map();
  for (const [lv, mv] of s.learnset) {
    if (lv <= level && MOVES[mv]) seen.set(mv, lv);
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([id, lv]) => ({ id, level: lv }));
}

/** Bộ chiêu mặc định khi sinh ra ở level L: 4 chiêu học gần nhất, ưu tiên chiêu có sức mạnh */
export function defaultMoves(speciesId, level) {
  const learned = learnedByLevel(speciesId, level).reverse();
  const dmg = learned.filter((m) => MOVES[m.id].power);
  const other = learned.filter((m) => !MOVES[m.id].power);
  const pick = [...dmg.slice(0, 3), ...other.slice(0, 1)];
  for (const m of dmg.slice(3)) if (pick.length < 4) pick.push(m);
  for (const m of other.slice(1)) if (pick.length < 4) pick.push(m);
  const res = pick.slice(0, 4).map((m) => m.id);
  return res.length ? res : ["tackle"];
}

export function randomIv() {
  const r = () => Math.floor(Math.random() * 32);
  return { hp: r(), atk: r(), def: r(), spa: r(), spd: r(), spe: r() };
}

export function createInstance(speciesId, level = 5, opts = {}) {
  const s = SPECIES[speciesId];
  if (!s) return null;
  const lv = Math.max(1, Math.min(100, level));
  const iv = opts.iv || randomIv();
  const bonus = opts.bonus || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const st = calcStats(speciesId, lv, iv, bonus);
  return {
    uid: `pk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    species: speciesId,
    name: s.name,
    type: s.types[0],
    types: [...s.types],
    level: lv,
    exp: opts.exp ?? expForSpeciesLevel(speciesId, lv),
    hp: st.maxHp, maxHp: st.maxHp,
    atk: st.atk, def: st.def, spa: st.spa, spd: st.spd, spe: st.spe,
    iv, bonus,
    moves: opts.moves || defaultMoves(speciesId, lv),
    friendship: s.baseHappiness ?? 70,
    status: "healthy",
    isActive: false,
    caughtAt: Date.now(),
    origin: opts.origin || "wild",
    evoHistory: [],
  };
}

/** Tính lại chỉ số khi đổi level/loài, giữ tỉ lệ HP (hoặc cộng phần chênh như game) */
export function refreshStats(pet, { keepRatio = false } = {}) {
  const s = SPECIES[pet.species];
  if (!s) return pet;
  const st = calcStats(pet.species, pet.level, pet.iv || {}, pet.bonus || {});
  const oldMax = pet.maxHp || st.maxHp;
  if (keepRatio) {
    const ratio = oldMax > 0 ? (pet.hp || 0) / oldMax : 1;
    pet.hp = pet.hp <= 0 ? 0 : Math.max(1, Math.min(st.maxHp, Math.round(st.maxHp * ratio)));
  } else if (pet.hp > 0) {
    pet.hp = Math.min(st.maxHp, pet.hp + Math.max(0, st.maxHp - oldMax)); // lên cấp: cộng phần HP tăng thêm
  }
  pet.maxHp = st.maxHp;
  pet.atk = st.atk; pet.def = st.def; pet.spa = st.spa; pet.spd = st.spd; pet.spe = st.spe;
  pet.types = [...s.types];
  pet.type = s.types[0];
  pet.name = pet.nickname || s.name;
  return pet;
}

/** Cộng EXP cho Pokémon. Không tự học chiêu / tiến hóa. */
export function gainPetExp(pet, amount) {
  const res = { gained: 0, levelsGained: 0, from: pet.level, to: pet.level, newMoves: [] };
  if (pet.level >= 100 || amount <= 0) return res;
  const add = Math.floor(amount);
  pet.exp = (pet.exp || 0) + add;
  res.gained = add;
  const before = pet.level;
  while (pet.level < 100 && pet.exp >= expForSpeciesLevel(pet.species, pet.level + 1)) pet.level++;
  if (pet.level >= 100) pet.exp = Math.min(pet.exp, expForSpeciesLevel(pet.species, 100));
  res.levelsGained = pet.level - before;
  res.to = pet.level;
  if (res.levelsGained) {
    refreshStats(pet);
    const known = new Set(pet.moves || []);
    res.newMoves = learnedByLevel(pet.species, pet.level).filter((m) => m.level > before && !known.has(m.id));
  }
  return res;
}

/** Đặt thẳng level (Rare Candy…) — exp về mốc cấp mới */
export function setPetLevel(pet, level) {
  const before = pet.level;
  pet.level = Math.max(1, Math.min(100, level));
  pet.exp = expForSpeciesLevel(pet.species, pet.level);
  refreshStats(pet);
  const known = new Set(pet.moves || []);
  return { from: before, to: pet.level, newMoves: learnedByLevel(pet.species, pet.level).filter((m) => m.level > before && !known.has(m.id)) };
}

export const MAX_PARTY = CONFIG.trainer.maxParty;
