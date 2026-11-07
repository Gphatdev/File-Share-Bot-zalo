/**
 * Học chiêu — theo learnset chính thức (FireRed/LeafGreen). Luôn cần xác nhận từ người chơi.
 */
import { SPECIES, MOVES } from "./db.js";
import { learnedByLevel } from "./pokedex.js";

export const MAX_MOVES = 4;

/** Chiêu đã đủ level nhưng chưa biết */
export function getLearnable(pet) {
  const known = new Set(pet.moves || []);
  return learnedByLevel(pet.species, pet.level).filter((m) => !known.has(m.id)).map((m) => ({ ...m, move: MOVES[m.id] }));
}
/** Chiêu sẽ mở ở level cao hơn */
export function getUpcoming(pet, limit = 4) {
  const s = SPECIES[pet.species];
  if (!s) return [];
  const seen = new Set();
  const res = [];
  for (const [lv, id] of s.learnset) {
    if (lv > pet.level && MOVES[id] && !seen.has(id)) { seen.add(id); res.push({ id, level: lv, move: MOVES[id] }); }
  }
  return res.slice(0, limit);
}

/** mutate pet. replaceId bắt buộc khi đã đủ 4 chiêu. */
export function learnMove(pet, moveId, replaceId = null) {
  const learnable = getLearnable(pet).find((m) => m.id === moveId);
  if (!learnable) return { ok: false, message: "Pokémon chưa thể học chiêu này." };
  pet.moves = pet.moves || [];
  if (pet.moves.length < MAX_MOVES) {
    pet.moves.push(moveId);
    return { ok: true, learned: moveId, replaced: null };
  }
  if (!replaceId || !pet.moves.includes(replaceId)) return { ok: false, needReplace: true, message: "Cần chọn chiêu để thay thế." };
  pet.moves = pet.moves.map((m) => (m === replaceId ? moveId : m));
  return { ok: true, learned: moveId, replaced: replaceId };
}
