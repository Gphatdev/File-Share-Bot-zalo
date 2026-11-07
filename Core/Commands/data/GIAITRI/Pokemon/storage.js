/**
 * Pokemon persistent storage — JSON file, khoá theo người chơi, ghi atomic, migration an toàn có backup.
 * Schema v3: moves chính thức, IV, 6 chỉ số, trứng, nhiệm vụ có tiền, vị trí bản đồ, huy hiệu, dex.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG, randInt } from "./config.js";
import { levelFromExp, expForLevel } from "./constants.js";
import {
  createInstance, refreshStats, getPokemon, expForSpeciesLevel, defaultMoves, gainPetExp, setPetLevel, randomIv,
} from "./pokedex.js";
import { MOVES } from "./db.js";
import { listQuests, getQuest, evalProgress } from "./quests.js";
import { ITEMS, canonicalItemId, getItem, LEGACY_ITEM_MAP } from "./items.js";
import { getEvolutionOptions, applyEvolution } from "./evolution.js";
import { learnMove, getLearnable } from "./moves.js";
import { START_NODE, getNode, unlockStatus, hops } from "./world.js";
import { newEgg, eggStatus, rollHatchling, addStepsToEggs, HATCH_LEVEL, EGG_TIERS } from "./eggs.js";
import { GYMS } from "./gyms.js";
import { BADGES } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_PATH = process.env.POKEMON_USERS_PATH || path.join(__dirname, "users.json");
export const SCHEMA = 3;
const USER_LOCKS = new Map();

let TienGameRef = null;
async function tienGame() {
  if (!TienGameRef) TienGameRef = (await import("../TienGame/index.js")).default;
  return TienGameRef;
}

// ── file I/O ───────────────────────────────────────────────
function ensureFile() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, "{}");
  }
}
function readAll() {
  ensureFile();
  const txt = fs.readFileSync(DATA_PATH, "utf8") || "{}";
  try {
    return JSON.parse(txt);
  } catch (e) {
    // File hỏng: giữ bản hỏng làm backup, KHÔNG ghi đè bằng {} âm thầm
    const bad = `${DATA_PATH}.corrupt-${Date.now()}`;
    fs.writeFileSync(bad, txt);
    console.error("[pokemon storage] users.json hỏng, đã lưu bản sao:", bad);
    throw new Error("users.json bị hỏng — đã backup, cần khôi phục thủ công.");
  }
}
function writeAll(data) {
  ensureFile();
  const tmp = `${DATA_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_PATH);
}

async function withLock(userId, task) {
  const key = String(userId);
  const prev = USER_LOCKS.get(key) || Promise.resolve();
  let release;
  const next = new Promise((r) => { release = r; });
  const tail = prev.then(() => next);
  USER_LOCKS.set(key, tail);
  await prev;
  try {
    return await task();
  } finally {
    release();
    if (USER_LOCKS.get(key) === tail) USER_LOCKS.delete(key);
  }
}
export const withUserLock = withLock;

// ── trainer defaults & migration ───────────────────────────
function defaultInventory() {
  return { pokeball: 3, potion: 2 };
}
function defaultTrainer(userId) {
  return {
    userId: String(userId), schema: SCHEMA, displayName: "",
    trainerLevel: 1, exp: 0,
    selectedPet: null, activePokemon: null, collection: [],
    inventory: defaultInventory(), eggs: [],
    quests: {},
    stats: { wins: 0, losses: 0, draws: 0, captures: 0, power: 0, wildMet: 0, wildWins: 0, learned: 0, evolutions: 0, hatched: 0, gymWins: 0, eggsGot: 0 },
    badges: [], appliedMatches: [], position: START_NODE, visited: [START_NODE], dex: { seen: [], caught: [] },
    starterChosen: false, cooldowns: {},
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

function migratePet(p) {
  if (!p || typeof p !== "object") return null;
  const sp = getPokemon(p.species);
  if (!sp) return p; // loài lạ: giữ nguyên, không xoá dữ liệu người chơi
  const out = { ...p };
  const legacy = p.schema !== SCHEMA && !Array.isArray(p.moves);
  if (legacy) {
    // chiêu cũ (id tự đặt, dạng snake_case) → id chính thức nếu tồn tại
    const mapped = (p.skills || []).map((s) => String(s).replace(/_/g, "-")).filter((m) => MOVES[m]);
    out.moves = [...new Set(mapped)].slice(0, 4);
    if (!out.moves.length) out.moves = defaultMoves(p.species, p.level || 5);
    out.iv = p.iv || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
    const b = p.bonus || {};
    out.bonus = { hp: b.hp || 0, atk: b.atk || 0, def: b.def || 0, spa: 0, spd: 0, spe: b.spd || b.spe || 0 };
    out.level = Math.max(1, Math.min(100, p.level || 5));
    out.exp = expForSpeciesLevel(p.species, out.level);
    out.friendship = p.friendship ?? sp.baseHappiness ?? 70;
    out.evoHistory = p.evoHistory || (p.evolved ? [{ from: null, to: p.species, at: p.caughtAt || Date.now(), via: "legacy" }] : []);
    out.origin = p.origin || "legacy";
    delete out.skills;
    delete out.spd; // spd cũ = tốc độ → tính lại thành SP.DEF/SPEED theo chuẩn mới
    refreshStats(out, { keepRatio: true });
    if (p.hp <= 0) out.hp = 0;
  }
  out.types = [...sp.types];
  out.type = sp.types[0];
  if (!out.moves?.length) out.moves = defaultMoves(p.species, out.level || 5);
  out.moves = out.moves.filter((m) => MOVES[m]).slice(0, 4);
  if (!out.moves.length) out.moves = defaultMoves(p.species, out.level || 5);
  return out;
}

function normalize(userId, raw) {
  const d = defaultTrainer(userId);
  if (!raw || typeof raw !== "object") return d;
  const t = { ...d, ...raw, userId: String(userId) };
  t.stats = { ...d.stats, ...(raw.stats || {}) };
  t.collection = (Array.isArray(raw.collection) ? raw.collection : []).map(migratePet).filter(Boolean);
  // inventory: đổi id cũ → id chuẩn, giữ số lượng
  const inv = {};
  for (const [k, v] of Object.entries({ ...(raw.inventory || {}) })) {
    const id = canonicalItemId(k);
    const n = Math.max(0, Math.floor(Number(v) || 0));
    if (n > 0 || ITEMS[id]) inv[id] = (inv[id] || 0) + n;
  }
  t.inventory = inv;
  t.eggs = Array.isArray(raw.eggs) ? raw.eggs : [];
  t.badges = Array.isArray(raw.badges) ? raw.badges : [];
  t.visited = Array.isArray(raw.visited) && raw.visited.length ? raw.visited : [START_NODE];
  t.position = getNode(raw.position) ? raw.position : START_NODE;
  t.dex = { seen: [...new Set([...(raw.dex?.seen || []), ...t.collection.map((p) => p.species)])], caught: [...new Set([...(raw.dex?.caught || []), ...t.collection.map((p) => p.species)])] };
  t.cooldowns = raw.cooldowns || {};
  // missions (cũ) → quests
  t.quests = { ...(raw.quests || {}) };
  if (raw.missions && raw.schema !== SCHEMA) {
    for (const [id, st] of Object.entries(raw.missions)) {
      if (!t.quests[id]) t.quests[id] = { status: st.claimed ? "claimed" : st.status || "available", progress: st.progress || 0, claimed: !!st.claimed, money: st.claimed ? { legacy: true, value: 0 } : null };
    }
  }
  delete t.missions;
  if (t.starterChosen && !t.activePokemon && t.collection.length) {
    t.activePokemon = t.collection[0].uid;
    t.selectedPet = t.activePokemon;
  }
  t.schema = SCHEMA;
  refreshQuests(t);
  return t;
}

/** Cập nhật trạng thái nhiệm vụ; roll tiền 1 lần khi hoàn thành */
export function refreshQuests(t) {
  t.quests = t.quests || {};
  for (const def of listQuests()) {
    const st = t.quests[def.id] || { status: "locked", progress: 0, claimed: false, money: null };
    if (st.claimed) { st.status = "claimed"; t.quests[def.id] = st; continue; }
    const unlocked = (def.requires || []).every((r) => t.quests[r]?.claimed);
    if (!unlocked) { st.status = "locked"; st.progress = 0; t.quests[def.id] = st; continue; }
    const prog = Math.min(def.target, evalProgress(def, t));
    st.progress = prog;
    if (prog >= def.target) {
      st.status = "completed";
      if (!st.money) st.money = { min: def.money[0], max: def.money[1], value: randInt(def.money[0], def.money[1]), paid: false };
    } else st.status = prog > 0 ? "in_progress" : "available";
    t.quests[def.id] = st;
  }
  return t;
}

function backupFile(suffix) {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const dest = `${DATA_PATH}.backup-${suffix}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      fs.copyFileSync(DATA_PATH, dest);
      return dest;
    }
  } catch (e) { console.error("[pokemon] backup lỗi:", e.message); }
  return null;
}

/** Chạy 1 lần lúc nạp module: nếu có user chưa ở schema 3 → backup rồi migrate toàn bộ */
export function migrateAll() {
  ensureFile();
  const all = readAll();
  const need = Object.values(all).some((t) => t && t.schema !== SCHEMA);
  if (!need) return { migrated: 0, backup: null };
  const backup = backupFile("v2");
  let n = 0;
  for (const [k, v] of Object.entries(all)) {
    if (v && v.schema !== SCHEMA) { all[k] = normalize(k, v); n++; }
  }
  writeAll(all);
  console.log(`[pokemon] migrate schema ${SCHEMA}: ${n} trainer, backup=${backup}`);
  return { migrated: n, backup };
}
try { migrateAll(); } catch (e) { console.error("[pokemon] migrate lỗi:", e); }

// ── primitives ─────────────────────────────────────────────
/** Đọc-sửa-ghi an toàn. fn(t) có thể async; throw → không ghi. */
export async function mutateTrainer(userId, fn) {
  return withLock(userId, async () => {
    const key = String(userId);
    const t = normalize(key, readAll()[key]);
    const result = await fn(t);
    refreshQuests(t);
    t.updatedAt = Date.now();
    t.stats.power = calcPower(t);
    t.trainerLevel = levelFromExp(t.exp);
    const all = readAll();
    all[key] = t;
    writeAll(all);
    return result;
  });
}

export async function getTrainer(userId) {
  return withLock(userId, async () => {
    const key = String(userId);
    const all = readAll();
    const t = normalize(key, all[key]);
    if (!all[key] || all[key].schema !== SCHEMA) { all[key] = t; writeAll(all); }
    return t;
  });
}
export async function saveTrainer(userId, trainer) {
  return mutateTrainer(userId, (t) => { Object.assign(t, trainer); return t; });
}
export async function setDisplayName(userId, name) {
  const n = String(name || "").slice(0, 40);
  if (!n) return;
  const t = await getTrainer(userId);
  if (t.displayName === n) return;
  await mutateTrainer(userId, (x) => { x.displayName = n; });
}

export function calcPower(t) {
  if (!t.collection?.length) return 0;
  return t.collection.reduce((s, p) => s + (p.level || 1) * 10 + (p.atk || 0) + (p.def || 0) + (p.spa || 0) + (p.spd || 0) + (p.spe || 0) + (p.maxHp || 0), 0) + (t.exp || 0);
}

export function noteSeen(t, species) {
  if (!t.dex.seen.includes(species)) t.dex.seen.push(species);
}
function noteCaught(t, species) {
  noteSeen(t, species);
  if (!t.dex.caught.includes(species)) t.dex.caught.push(species);
}

export async function addExp(userId, amount) {
  return mutateTrainer(userId, (t) => { t.exp = Math.max(0, (t.exp || 0) + Math.floor(amount)); return t; });
}

// ── starter / pokemon ─────────────────────────────────────
export async function chooseStarter(userId, speciesId) {
  return mutateTrainer(userId, (t) => {
    if (t.starterChosen) return { ok: false, message: "Bạn đã chọn Pokémon khởi đầu rồi!" };
    const pet = createInstance(speciesId, 5, { origin: "starter" });
    if (!pet) return { ok: false, message: "Pokémon không hợp lệ." };
    pet.isActive = true;
    t.collection = [pet];
    t.activePokemon = pet.uid; t.selectedPet = pet.uid;
    t.starterChosen = true;
    noteCaught(t, pet.species);
    return { ok: true, pet, trainer: t };
  });
}

export async function addPokemon(userId, speciesId, level, opts = {}) {
  return mutateTrainer(userId, (t) => {
    if (t.collection.length >= CONFIG.trainer.maxCollection) return { ok: false, message: `Balo đã đầy (tối đa ${CONFIG.trainer.maxCollection}).` };
    const pet = createInstance(speciesId, level, { origin: opts.origin || "wild" });
    if (!pet) return { ok: false, message: "Pokémon không hợp lệ." };
    if (!t.activePokemon) { pet.isActive = true; t.activePokemon = pet.uid; t.selectedPet = pet.uid; }
    t.collection.push(pet);
    if (opts.countCapture !== false) t.stats.captures = (t.stats.captures || 0) + 1;
    noteCaught(t, pet.species);
    return { ok: true, pet, trainer: t };
  });
}

export async function getActivePet(userId) {
  const t = await getTrainer(userId);
  if (!t.activePokemon) return null;
  return t.collection.find((p) => p.uid === t.activePokemon) || null;
}
export async function setActivePet(userId, petUid) {
  return mutateTrainer(userId, (t) => {
    const pet = t.collection.find((p) => p.uid === petUid);
    if (!pet) return { ok: false, message: "Không tìm thấy Pokémon." };
    t.collection.forEach((p) => { p.isActive = p.uid === petUid; });
    t.activePokemon = petUid; t.selectedPet = petUid;
    return { ok: true, pet, trainer: t };
  });
}
export async function updatePet(userId, petUid, updater) {
  return mutateTrainer(userId, (t) => {
    const idx = t.collection.findIndex((p) => p.uid === petUid);
    if (idx < 0) return { ok: false, message: "Không tìm thấy Pokémon." };
    const updated = typeof updater === "function" ? updater(t.collection[idx], t) : { ...t.collection[idx], ...updater };
    t.collection[idx] = updated;
    return { ok: true, pet: updated, trainer: t };
  });
}

// ── items ──────────────────────────────────────────────────
export async function canStoreItem(userId, itemId, qty = 1) {
  const id = canonicalItemId(itemId);
  if (!ITEMS[id]) return { ok: false, reason: "Vật phẩm không tồn tại." };
  const t = await getTrainer(userId);
  const have = t.inventory[id] || 0;
  if (have + qty > CONFIG.trainer.itemStack) return { ok: false, reason: `Mỗi loại tối đa ${CONFIG.trainer.itemStack} (đang có ${have}).` };
  return { ok: true };
}
export async function addItem(userId, itemId, amount = 1) {
  const id = canonicalItemId(itemId);
  return mutateTrainer(userId, (t) => {
    if (!ITEMS[id]) return { ok: false, message: "Vật phẩm không tồn tại." };
    const have = t.inventory[id] || 0;
    if (have + amount > CONFIG.trainer.itemStack) return { ok: false, message: `Mỗi loại tối đa ${CONFIG.trainer.itemStack}.` };
    t.inventory[id] = have + amount;
    return { ok: true, trainer: t };
  });
}
/** Trừ vật phẩm (bóng...). Nguồn kho duy nhất = trainer.inventory (không còn fallback kho chung). */
export async function useItem(userId, itemId, amount = 1) {
  const id = canonicalItemId(itemId);
  return mutateTrainer(userId, (t) => {
    const have = t.inventory[id] || 0;
    if (have < amount) return { ok: false, message: `Không đủ ${ITEMS[id]?.name || id}. Mua ở .shop` };
    t.inventory[id] = have - amount;
    return { ok: true, trainer: t };
  });
}

/** Dùng vật phẩm hồi phục / kẹo lên 1 Pokémon (ngoài trận). Chỉ trừ vật phẩm khi hiệu ứng thật sự có tác dụng. */
export function applyItemToPet(pet, item) {
  if (item.revive) {
    if (pet.hp > 0) return { ok: false, message: `${pet.name} chưa ngất.` };
    pet.hp = Math.max(1, Math.floor(pet.maxHp * item.revive)); pet.status = "healthy";
    return { ok: true, text: `${pet.name} hồi sinh với ${pet.hp} HP.` };
  }
  if (item.heal || item.healPct) {
    if (pet.hp <= 0) return { ok: false, message: `${pet.name} đã ngất — dùng Revive.` };
    if (pet.hp >= pet.maxHp) return { ok: false, message: `${pet.name} đã đầy HP.` };
    const amt = item.heal || Math.floor(pet.maxHp * item.healPct);
    const before = pet.hp;
    pet.hp = Math.min(pet.maxHp, pet.hp + amt);
    return { ok: true, text: `${pet.name} hồi ${pet.hp - before} HP (${pet.hp}/${pet.maxHp}).` };
  }
  if (item.levelUp) {
    if (pet.level >= 100) return { ok: false, message: `${pet.name} đã đạt Level 100.` };
    const r = setPetLevel(pet, pet.level + item.levelUp);
    return { ok: true, text: `${pet.name} lên Level ${r.to}!`, levelUp: r };
  }
  return { ok: false, message: "Vật phẩm này không dùng trực tiếp lên Pokémon." };
}
export async function useItemOnPet(userId, petUid, itemId) {
  const item = getItem(itemId);
  if (!item) return { ok: false, message: "Vật phẩm không tồn tại." };
  return mutateTrainer(userId, (t) => {
    const pet = t.collection.find((p) => p.uid === petUid);
    if (!pet) return { ok: false, message: "Không tìm thấy Pokémon." };
    if ((t.inventory[item.id] || 0) < 1) return { ok: false, message: `Bạn không có ${item.name}. Mua ở .shop` };
    const r = applyItemToPet(pet, item);
    if (!r.ok) return r;
    t.inventory[item.id]--;
    return { ok: true, pet, item, text: r.text, levelUp: r.levelUp, trainer: t };
  });
}

// ── EXP cho Pokémon + sự kiện chiến đấu ───────────────────
export async function awardPetExp(userId, petUid, amount) {
  return mutateTrainer(userId, (t) => {
    const pet = t.collection.find((p) => p.uid === petUid);
    if (!pet) return { ok: false };
    const r = gainPetExp(pet, amount);
    return { ok: true, pet, ...r };
  });
}
export async function trainWithTrainerExp(userId, petUid, cost) {
  return mutateTrainer(userId, (t) => {
    const pet = t.collection.find((p) => p.uid === petUid);
    if (!pet) return { ok: false, message: "Không tìm thấy Pokémon." };
    if (pet.level >= 100) return { ok: false, message: "Đã đạt Level 100." };
    if (t.exp < cost) return { ok: false, message: `Cần ${cost} EXP Trainer (bạn có ${t.exp}).` };
    t.exp -= cost;
    const r = setPetLevel(pet, pet.level + 1);
    return { ok: true, pet, ...r, trainer: t };
  });
}
/** Sau trận: ghi HP + kinh nghiệm từng con + bộ đếm. results: {survivors:[{uid,hp}], faintedUids:[], expEach, kind} */
export async function settlePveBattle(userId, { hpMap, expMap = {}, wildWin = false, met = false, eggSteps = 0 }) {
  return mutateTrainer(userId, (t) => {
    const levelUps = [];
    for (const p of t.collection) {
      if (hpMap[p.uid] !== undefined) {
        p.hp = Math.max(0, Math.min(p.maxHp, hpMap[p.uid]));
        p.status = p.hp <= 0 ? "fainted" : "healthy";
      }
      if (expMap[p.uid]) {
        const r = gainPetExp(p, expMap[p.uid]);
        if (r.levelsGained) levelUps.push({ uid: p.uid, name: p.name, ...r });
      }
    }
    if (wildWin) t.stats.wildWins = (t.stats.wildWins || 0) + 1;
    if (eggSteps) stepEggs(t, eggSteps);
    return { ok: true, levelUps, trainer: t };
  });
}
export async function noteWildEncounter(userId, speciesId) {
  return mutateTrainer(userId, (t) => {
    t.stats.wildMet = (t.stats.wildMet || 0) + 1;
    noteSeen(t, speciesId);
    stepEggs(t, CONFIG.eggSteps.wildEncounter);
    return true;
  });
}

// ── Chiêu & tiến hóa ──────────────────────────────────────
export async function learnPetMove(userId, petUid, moveId, replaceId = null) {
  return mutateTrainer(userId, (t) => {
    const pet = t.collection.find((p) => p.uid === petUid);
    if (!pet) return { ok: false, message: "Không tìm thấy Pokémon." };
    const r = learnMove(pet, moveId, replaceId);
    if (r.ok) t.stats.learned = (t.stats.learned || 0) + 1;
    return { ...r, pet, trainer: t };
  });
}
export async function evolvePet(userId, petUid, toId) {
  return mutateTrainer(userId, (t) => {
    const pet = t.collection.find((p) => p.uid === petUid);
    if (!pet) return { ok: false, message: "Không tìm thấy Pokémon." };
    const opts = getEvolutionOptions(pet, t.inventory);
    if (!opts.length) return { ok: false, message: "Pokémon này không thể tiến hóa." };
    const opt = toId ? opts.find((o) => o.to === toId) : opts.length === 1 ? opts[0] : null;
    if (!opt) return { ok: false, message: "Cần chọn dạng tiến hóa." };
    if (!opt.ready) return { ok: false, message: `Chưa đủ điều kiện: ${opt.reqs.filter((r) => !r.met).map((r) => r.text).join(", ")}.` };
    const from = pet.species;
    const snapshotBefore = { species: pet.species, name: pet.name, maxHp: pet.maxHp, atk: pet.atk, def: pet.def, spa: pet.spa, spd: pet.spd, spe: pet.spe };
    if (opt.itemId) t.inventory[opt.itemId] = Math.max(0, (t.inventory[opt.itemId] || 0) - 1);
    const r = applyEvolution(pet, opt.to, opt.itemId ? "item" : "level");
    if (!r.ok) return r;
    t.stats.evolutions = (t.stats.evolutions || 0) + 1;
    noteCaught(t, opt.to);
    return { ok: true, pet, from, to: opt.to, before: snapshotBefore, usedItem: opt.itemId, trainer: t };
  });
}

// ── Bản đồ ────────────────────────────────────────────────
function cdLeft(t, key, ms, now = Date.now()) {
  const last = t.cooldowns?.[key] || 0;
  return Math.max(0, last + ms - now);
}
export function cooldownLeft(t, key) {
  return cdLeft(t, key, CONFIG.cooldown[key] ?? 0);
}
export async function markCooldown(userId, key) {
  return mutateTrainer(userId, (t) => { t.cooldowns[key] = Date.now(); });
}
function stepEggs(t, steps) {
  if (!t.eggs.length) return 0;
  const left = cdLeft(t, "eggStep", CONFIG.cooldown.eggStep);
  if (left > 0) return 0;
  t.cooldowns.eggStep = Date.now();
  return addStepsToEggs(t.eggs, steps);
}
export async function travelTo(userId, nodeId) {
  const node = getNode(nodeId);
  if (!node) return { ok: false, message: "Địa điểm không tồn tại." };
  return mutateTrainer(userId, (t) => {
    if (!t.starterChosen) return { ok: false, message: "Hãy chọn Pokémon khởi đầu trước (.pokemon pet)." };
    if (t.position === nodeId) return { ok: false, message: `Bạn đang ở ${node.name} rồi.` };
    const st = unlockStatus(node, t);
    if (!st.open) return { ok: false, locked: true, message: `${node.name} đang khoá: ${st.reasons.join("; ")}. ${st.hint}`.trim() };
    const left = cdLeft(t, "travel", CONFIG.cooldown.travel);
    if (left > 0) return { ok: false, message: `Chờ ${Math.ceil(left / 1000)}s rồi hãy di chuyển tiếp.` };
    const d = hops(t.position, nodeId, (id) => unlockStatus(getNode(id), t).open);
    if (!isFinite(d)) return { ok: false, message: "Không có đường đi tới đó qua các khu vực đã mở." };
    t.cooldowns.travel = Date.now();
    const from = t.position;
    t.position = nodeId;
    if (!t.visited.includes(nodeId)) t.visited.push(nodeId);
    const stepped = stepEggs(t, d * CONFIG.eggSteps.travelPerHop);
    return { ok: true, from, to: nodeId, hops: d, eggsStepped: stepped, trainer: t };
  });
}
export async function healAll(userId, free = true) {
  return mutateTrainer(userId, (t) => {
    const node = getNode(t.position);
    if (free && !node?.center) return { ok: false, message: "Cần ở thị trấn có Pokémon Center (.pokemon map)." };
    const left = cdLeft(t, "heal", CONFIG.cooldown.heal);
    if (left > 0) return { ok: false, message: `Pokémon Center đang bận, thử lại sau ${Math.ceil(left / 1000)}s.` };
    let n = 0;
    for (const p of t.collection) { if (p.hp < p.maxHp || p.status === "fainted") { p.hp = p.maxHp; p.status = "healthy"; n++; } }
    t.cooldowns.heal = Date.now();
    return { ok: true, healed: n, trainer: t };
  });
}

// ── Gym ───────────────────────────────────────────────────
export async function awardBadge(userId, gymCity) {
  const gym = GYMS[gymCity];
  return mutateTrainer(userId, (t) => {
    if (t.badges.includes(gym.badge)) return { ok: true, already: true, trainer: t };
    t.badges.push(gym.badge);
    t.stats.gymWins = (t.stats.gymWins || 0) + 1;
    stepEggs(t, CONFIG.eggSteps.gym);
    return { ok: true, already: false, badge: BADGES.find((b) => b.id === gym.badge), trainer: t };
  });
}

// ── Trứng ─────────────────────────────────────────────────
export async function incubateEgg(userId, tier) {
  return mutateTrainer(userId, (t) => {
    const it = EGG_TIERS[tier];
    if (!it) return { ok: false, message: "Loại trứng không hợp lệ (common/uncommon/rare)." };
    if (t.eggs.length >= CONFIG.trainer.eggSlots) return { ok: false, message: `Chỉ ấp tối đa ${CONFIG.trainer.eggSlots} trứng cùng lúc.` };
    if ((t.inventory[it.item] || 0) < 1) return { ok: false, message: `Bạn không có ${it.name}. Mua ở .shop` };
    t.inventory[it.item]--;
    const egg = newEgg(tier);
    t.eggs.push(egg);
    t.stats.eggsGot = (t.stats.eggsGot || 0) + 1;
    return { ok: true, egg, trainer: t };
  });
}
export async function hatchEgg(userId, eggId) {
  return mutateTrainer(userId, (t) => {
    const idx = t.eggs.findIndex((e) => e.id === eggId);
    if (idx < 0) return { ok: false, message: "Không tìm thấy trứng." };
    const egg = t.eggs[idx];
    const st = eggStatus(egg, t.badges.length);
    if (!st.ready) return { ok: false, message: st.reason, status: st };
    if (t.collection.length >= CONFIG.trainer.maxCollection) return { ok: false, message: "Balo đã đầy, hãy dọn chỗ trước khi nở trứng." };
    const sp = rollHatchling(egg.tier);
    const pet = createInstance(sp.id, HATCH_LEVEL, { origin: "egg" });
    t.eggs.splice(idx, 1);            // xoá trứng và tạo Pokémon trong cùng 1 lần ghi → không thể nở 2 lần
    if (!t.activePokemon) { pet.isActive = true; t.activePokemon = pet.uid; t.selectedPet = pet.uid; }
    t.collection.push(pet);
    t.stats.hatched = (t.stats.hatched || 0) + 1;
    noteCaught(t, pet.species);
    return { ok: true, pet, egg, trainer: t };
  });
}

// ── Nhiệm vụ ──────────────────────────────────────────────
export async function claimQuest(userId, questId) {
  const def = getQuest(questId);
  if (!def) return { ok: false, message: "Nhiệm vụ không tồn tại." };
  // Bước 1: đánh dấu đã nhận (atomic) rồi mới trả tiền → không thể nhận 2 lần dù spam
  const step1 = await mutateTrainer(userId, (t) => {
    refreshQuests(t);
    const st = t.quests[questId];
    if (st.claimed) return { ok: false, message: "Đã nhận thưởng rồi!" };
    if (st.status === "locked") return { ok: false, message: "Nhiệm vụ đang khoá — hoàn thành nhiệm vụ trước đó." };
    if (st.status !== "completed") return { ok: false, message: `Chưa hoàn thành (${st.progress}/${def.target}).` };
    if (def.items) {
      for (const [id, n] of Object.entries(def.items)) {
        if ((t.inventory[id] || 0) + n > CONFIG.trainer.itemStack) return { ok: false, message: `Kho ${ITEMS[id]?.name || id} đã đầy, hãy dùng bớt rồi nhận.` };
      }
    }
    st.claimed = true; st.status = "claimed"; st.claimedAt = Date.now();
    t.exp = (t.exp || 0) + def.expReward;
    for (const [id, n] of Object.entries(def.items || {})) t.inventory[id] = (t.inventory[id] || 0) + n;
    return { ok: true, money: st.money.value, exp: def.expReward, items: def.items || {} };
  });
  if (!step1.ok) return step1;
  // EXP nhiệm vụ cũng cộng vào HỒ SƠ NGƯỜI CHƠI (.hoso) — chỉ chạy khi vừa nhận lần đầu (step1.ok).
  try { const PP = await import("../PlayerProfile/index.js"); if (step1.exp > 0) await PP.addExp(userId, step1.exp, { source: "pokemon_quest" }); }
  catch (e) { console.error("[pokemon] Không cộng EXP nhiệm vụ vào hồ sơ:", e?.message); }
  // Bước 2: trả tiền 1 lần (referenceId chống trùng)
  let paid = true, payError = null;
  try {
    const TG = await tienGame();
    await TG.addMoney(userId, step1.money, { type: "POKEMON_QUEST", description: `Nhiệm vụ Pokémon: ${def.name}`, referenceId: `pkq:${userId}:${questId}` });
  } catch (e) {
    if (e?.code === "DUPLICATE_REFERENCE") paid = true; // đã trả từ trước
    else { paid = false; payError = e?.message || String(e); }
  }
  await mutateTrainer(userId, (t) => { const st = t.quests[questId]; if (st?.money) { st.money.paid = paid; if (paid) st.money.paidAt = Date.now(); else st.money.payError = payError; } });
  return { ok: true, ...step1, paid, payError, trainer: await getTrainer(userId) };
}
/** Thử trả lại tiền nhiệm vụ đã nhận nhưng chưa trả (lỗi ví tạm thời) — idempotent nhờ referenceId */
export async function retryUnpaidQuests(userId) {
  const t = await getTrainer(userId);
  let n = 0;
  for (const [id, st] of Object.entries(t.quests)) {
    if (st.claimed && st.money && st.money.paid === false && st.money.value) {
      try {
        const TG = await tienGame();
        await TG.addMoney(userId, st.money.value, { type: "POKEMON_QUEST", description: `Nhiệm vụ Pokémon (bù): ${getQuest(id)?.name}`, referenceId: `pkq:${userId}:${id}` });
      } catch (e) { if (e?.code !== "DUPLICATE_REFERENCE") continue; }
      await mutateTrainer(userId, (x) => { x.quests[id].money.paid = true; });
      n++;
    }
  }
  return n;
}
export const claimMission = claimQuest;

// ── Xếp hạng ──────────────────────────────────────────────
export async function getRanking(limit = 10) {
  const all = readAll();
  return Object.values(all)
    .map((raw) => normalize(raw.userId, raw))
    .filter((t) => t.starterChosen)
    .map((t) => ({
      userId: t.userId, name: t.displayName || "", trainerLevel: t.trainerLevel, exp: t.exp, power: calcPower(t),
      wins: t.stats.wins || 0, losses: t.stats.losses || 0, captures: t.stats.captures || 0,
      badges: t.badges.length, dexCaught: t.dex.caught.length, pokemonCount: t.collection.length,
    }))
    .sort((a, b) => b.power - a.power || b.exp - a.exp)
    .slice(0, limit);
}

// ── Solo settlement (nội bộ — không có lệnh nào gọi trực tiếp) ──
/** Idempotent: cùng matchId chỉ cộng EXP/thống kê 1 lần (appliedMatches) và tiền 1 lần (referenceId). */
export async function applySoloOutcome(userId, { result, exp, petExp = 0, petUid = null, moneyValue, matchId }) {
  const step1 = await mutateTrainer(userId, (t) => {
    t.appliedMatches = Array.isArray(t.appliedMatches) ? t.appliedMatches : [];
    if (t.appliedMatches.includes(matchId)) return { applied: false, levelUp: null };
    t.appliedMatches.push(matchId);
    if (t.appliedMatches.length > 300) t.appliedMatches = t.appliedMatches.slice(-300);
    t.exp = (t.exp || 0) + exp;
    if (result === "win") t.stats.wins = (t.stats.wins || 0) + 1;
    else if (result === "lose") t.stats.losses = (t.stats.losses || 0) + 1;
    else t.stats.draws = (t.stats.draws || 0) + 1;
    stepEggs(t, CONFIG.eggSteps.solo);
    let levelUp = null;
    const pet = t.collection.find((p) => p.uid === petUid);
    if (pet && petExp > 0) { const r = gainPetExp(pet, petExp); if (r.levelsGained) levelUp = { name: pet.name, ...r }; }
    return { applied: true, levelUp };
  });
  // Cộng EXP + thống kê vào HỒ SƠ NGƯỜI CHƠI (.hoso) đúng 1 lần/trận (chỉ khi trận vừa được áp dụng lần đầu).
  if (step1.applied) {
    try {
      const PP = await import("../PlayerProfile/index.js");
      if (exp > 0) await PP.addExp(userId, exp, { source: "pokemon_solo" });
      await PP.recordMatchResult(userId, result === "win" ? "win" : result === "lose" ? "loss" : "draw");
    } catch (e) { console.error("[pokemon] Không cộng EXP vào hồ sơ:", e?.message); }
  }
  let paid = true, payError = null;
  try {
    const TG = await tienGame();
    await TG.addMoney(userId, moneyValue, { type: "POKEMON_SOLO", description: `Pokémon Solo (${result})`, referenceId: `pksolo:${matchId}:${userId}` });
  } catch (e) {
    if (e?.code === "DUPLICATE_REFERENCE") paid = true; else { paid = false; payError = e?.message; }
  }
  return { ...step1, paid, payError };
}

export function _readAllForTests() { return readAll(); }
export { LEGACY_ITEM_MAP, EGG_TIERS };
