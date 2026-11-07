/**
 * Trứng Pokémon — cơ chế của PROJECT (game Gen 1 không có trứng; trứng chính thức bắt đầu từ Gen 2).
 * - Trứng tích bước khi người chơi làm hành động thật (di chuyển, gặp/đánh Pokémon hoang, Solo, Gym).
 * - Chỉ nở khi đủ bước VÀ đủ điều kiện (huy hiệu). Pokémon chỉ được tạo ra tại thời điểm nở.
 * - Loài nở ra là dạng cơ bản (chưa tiến hóa), không phải huyền thoại, lấy từ Pokédex chính thức.
 */
import { SPECIES } from "./db.js";
import { CONFIG, randInt } from "./config.js";

export const EGG_TIERS = {
  common:   { id: "common",   name: "Trứng Thường",   steps: 300,  badges: 0, color: "#38bdf8", accent: "#7dd3fc", item: "egg_common",   desc: "Loài phổ biến (tỉ lệ bắt rất cao)." },
  uncommon: { id: "uncommon", name: "Trứng Hiếm",     steps: 600,  badges: 1, color: "#a855f7", accent: "#d8b4fe", item: "egg_uncommon", desc: "Loài khá hiếm." },
  rare:     { id: "rare",     name: "Trứng Cực Hiếm", steps: 1200, badges: 3, color: "#fbbf24", accent: "#fde68a", item: "egg_rare",     desc: "Loài quý (tỉ lệ bắt thấp: starter, Eevee, Dratini…)." },
};
export const HATCH_LEVEL = 5;
const EXCLUDE = new Set(["omanyte", "kabuto", "aerodactyl", "hitmonlee", "hitmonchan", "porygon"]);

export function tierOf(species) {
  const r = species.catchRate;
  return r >= 225 ? "common" : r >= 150 ? "uncommon" : "rare";
}
export function eggPool(tier) {
  return Object.values(SPECIES)
    .filter((s) => !s.evolvesFrom && !s.legendary && !s.mythical && !EXCLUDE.has(s.id) && tierOf(s) === tier)
    .sort((a, b) => a.dex - b.dex);
}
export function newEgg(tier) {
  const t = EGG_TIERS[tier];
  if (!t) return null;
  return { id: `egg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, tier, steps: 0, need: t.steps, createdAt: Date.now() };
}
export function eggStatus(egg, badges) {
  const t = EGG_TIERS[egg.tier];
  const stepsOk = egg.steps >= egg.need;
  const condOk = badges >= t.badges;
  return {
    stepsOk, condOk, ready: stepsOk && condOk,
    pct: Math.min(1, egg.steps / egg.need),
    reason: !stepsOk ? `Cần thêm ${egg.need - egg.steps} bước` : !condOk ? `Cần ${t.badges} huy hiệu Gym để nở` : "Sẵn sàng nở!",
  };
}
export function rollHatchling(tier) {
  const pool = eggPool(tier);
  return pool[randInt(0, pool.length - 1)];
}
export function addStepsToEggs(eggs, steps, slots = CONFIG.trainer.eggSlots) {
  let n = 0;
  for (const e of eggs.slice(0, slots)) {
    if (e.steps < e.need) { e.steps = Math.min(e.need, e.steps + steps); n++; }
  }
  return n;
}
