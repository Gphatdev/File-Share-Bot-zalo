/**
 * Chiến đấu & bắt Pokémon — công thức chính thức (damage Gen 3+, catch Gen 3/4).
 */
import { getTypeMultiplier } from "./constants.js";
import { SPECIES, MOVES } from "./db.js";
import { CONFIG } from "./config.js";
import { ITEMS } from "./items.js";

export function makeCombatant(pet) {
  return {
    uid: pet.uid, species: pet.species, name: pet.name, level: pet.level,
    types: pet.types || [pet.type], maxHp: pet.maxHp, hp: pet.hp,
    atk: pet.atk, def: pet.def, spa: pet.spa, spd: pet.spd, spe: pet.spe,
    moves: (pet.moves || []).filter((m) => MOVES[m]).map((id) => ({ id, pp: MOVES[id].pp || 10, maxPp: MOVES[id].pp || 10 })),
  };
}

const STRUGGLE = { id: "struggle", name: "Struggle", type: "normal", power: 50, accuracy: null, pp: 1, cls: "physical", priority: 0 };

export function getMoveInfo(id) {
  return id === "struggle" ? STRUGGLE : MOVES[id] || null;
}

export function usableMoves(c) {
  return c.moves.filter((m) => m.pp > 0);
}

/** Chọn chiêu cho phía máy */
export function aiPickMove(att, def) {
  const usable = usableMoves(att);
  if (!usable.length) return STRUGGLE.id;
  const dmg = usable.filter((m) => MOVES[m.id].power);
  const pool = dmg.length ? dmg : usable;
  // ưu tiên chiêu mạnh theo hiệu quả hệ nhưng vẫn có ngẫu nhiên
  const scored = pool.map((m) => {
    const mv = MOVES[m.id];
    return { m, score: (mv.power || 0) * getTypeMultiplier(mv.type, def.types) * (att.types.includes(mv.type) ? 1.5 : 1) * (0.7 + Math.random() * 0.6) };
  }).sort((a, b) => b.score - a.score);
  return scored[0].m.id;
}

/**
 * Dùng chiêu. Trừ PP, tính sát thương lên def (mutate def.hp). Trả kết quả để hiển thị.
 */
export function useMove(att, def, moveId) {
  const mv = getMoveInfo(moveId);
  if (!mv) return { ok: false, message: "Chiêu không tồn tại." };
  const slot = att.moves.find((m) => m.id === moveId);
  if (moveId !== "struggle") {
    if (!slot) return { ok: false, message: "Pokémon không biết chiêu này." };
    if (slot.pp <= 0) return { ok: false, message: "Hết PP." };
    slot.pp--;
  }
  const res = { ok: true, move: mv, damage: 0, effectiveness: 1, critical: false, missed: false, noEffect: false, status: !mv.power };
  if (mv.accuracy && Math.random() * 100 >= mv.accuracy) { res.missed = true; return res; }
  if (!mv.power) { res.noEffect = true; return res; }
  const physical = mv.cls === "physical";
  const A = physical ? att.atk : att.spa;
  const D = physical ? def.def : def.spd;
  const eff = getTypeMultiplier(mv.type, def.types);
  res.effectiveness = eff;
  if (eff === 0) { res.noEffect = true; return res; }
  const base = Math.floor((Math.floor((2 * att.level) / 5 + 2) * mv.power * A / Math.max(1, D)) / 50) + 2;
  const stab = att.types.includes(mv.type) ? CONFIG.battle.stab : 1;
  const crit = Math.random() < CONFIG.battle.critRate;
  res.critical = crit;
  const rand = 0.85 + Math.random() * 0.15;
  res.damage = Math.max(1, Math.floor(base * stab * eff * (crit ? CONFIG.battle.critMult : 1) * rand));
  def.hp = Math.max(0, def.hp - res.damage);
  return res;
}

export function effectivenessText(mult) {
  if (mult === 0) return "Không có hiệu quả!";
  if (mult >= 2) return "Siêu hiệu quả!";
  if (mult < 1) return "Không hiệu quả lắm...";
  return "";
}

/** Mô tả 1 lượt cho log */
export function describeMove(att, res) {
  if (!res.ok) return res.message;
  let t = `${att.name} dùng ${res.move.name}`;
  if (res.missed) return t + " — trượt!";
  if (res.noEffect && res.status) return t + " (chiêu trạng thái, không gây sát thương).";
  if (res.noEffect) return t + " — không có hiệu quả!";
  t += `: -${res.damage} HP`;
  const e = effectivenessText(res.effectiveness);
  if (e) t += `. ${e}`;
  if (res.critical) t += " Đòn chí mạng!";
  return t;
}

// ── Bắt Pokémon: công thức Gen 3/4, 4 lần lắc ───────────────
export function captureChance(wild, ballId, extra = 1) {
  const ball = ITEMS[ballId];
  if (!ball || ball.cat !== "ball") return null;
  const rate = SPECIES[wild.species]?.catchRate ?? 45;
  const maxHp = Math.max(1, wild.maxHp);
  const mod = ball.ball * extra;
  const a = ((3 * maxHp - 2 * wild.hp) * rate * mod) / (3 * maxHp);
  return Math.min(255, Math.max(1, a));
}

export function tryCapture(wild, ballId, extra = 1) {
  const a = captureChance(wild, ballId, extra);
  if (a == null) return { success: false, reason: "invalid_ball", shakes: 0 };
  if (a >= 255) return { success: true, shakes: 4, a, chance: 1 };
  const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / a));
  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (Math.random() * 65536 < b) shakes++; else break;
  }
  return { success: shakes === 4, shakes, a, chance: Math.pow(b / 65536, 4) };
}
