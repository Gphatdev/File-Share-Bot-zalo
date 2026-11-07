/**
 * Pokemon System — hằng số chung & bảng hiệu quả hệ (chính thức, Gen 6+)
 */
import { CONFIG } from "./config.js";
export { POKEBALLS } from "./items.js";

export const TYPES = {
  normal: { id: "normal", name: "Normal", color: "#A8A878" },
  fire: { id: "fire", name: "Fire", color: "#F08030" },
  water: { id: "water", name: "Water", color: "#6890F0" },
  grass: { id: "grass", name: "Grass", color: "#78C850" },
  electric: { id: "electric", name: "Electric", color: "#F8D030" },
  ice: { id: "ice", name: "Ice", color: "#98D8D8" },
  fighting: { id: "fighting", name: "Fighting", color: "#C03028" },
  poison: { id: "poison", name: "Poison", color: "#A040A0" },
  ground: { id: "ground", name: "Ground", color: "#E0C068" },
  flying: { id: "flying", name: "Flying", color: "#A890F0" },
  psychic: { id: "psychic", name: "Psychic", color: "#F85888" },
  bug: { id: "bug", name: "Bug", color: "#A8B820" },
  rock: { id: "rock", name: "Rock", color: "#B8A038" },
  ghost: { id: "ghost", name: "Ghost", color: "#705898" },
  dragon: { id: "dragon", name: "Dragon", color: "#7038F8" },
  dark: { id: "dark", name: "Dark", color: "#705848" },
  steel: { id: "steel", name: "Steel", color: "#B8B8D0" },
  fairy: { id: "fairy", name: "Fairy", color: "#EE99AC" },
};

export const TYPE_CHART = {
  fire: { grass: 2, ice: 2, bug: 2, steel: 2, fire: 0.5, water: 0.5, rock: 0.5, dragon: 0.5 },
  water: { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
  grass: { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5 },
  electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0 },
  ice: { grass: 2, ground: 2, flying: 2, dragon: 2, fire: 0.5, water: 0.5, ice: 0.5, steel: 0.5 },
  fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0 },
  poison: { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
  ground: { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: 0.5, bug: 0.5, flying: 0 },
  flying: { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0 },
  bug: { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, poison: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
  ghost: { psychic: 2, ghost: 2, dark: 0.5, normal: 0 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { psychic: 2, ghost: 2, fighting: 0.5, dark: 0.5, fairy: 0.5 },
  steel: { ice: 2, rock: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
  fairy: { fighting: 2, dragon: 2, dark: 2, fire: 0.5, poison: 0.5, steel: 0.5 },
  normal: { rock: 0.5, steel: 0.5, ghost: 0 },
};

/** Hệ số của chiêu `atkType` lên Pokémon có hệ `defTypes` (mảng hoặc chuỗi) */
export function getTypeMultiplier(atkType, defTypes) {
  const list = Array.isArray(defTypes) ? defTypes : [defTypes];
  const chart = TYPE_CHART[atkType] || {};
  return list.reduce((m, t) => m * (chart[t] !== undefined ? chart[t] : 1), 1);
}

// EXP huấn luyện viên (Trainer) — giữ bảng cũ để không đổi level người chơi
export const EXP_TABLE = (() => {
  const t = [0];
  for (let lv = 1; lv <= 100; lv++) t[lv] = Math.floor(lv * lv * lv * 0.8);
  return t;
})();
export function expForLevel(level) {
  return EXP_TABLE[Math.min(100, Math.max(1, level))] || 0;
}
export function expToNext(level, currentExp) {
  return Math.max(0, expForLevel(level + 1) - currentExp);
}
export function levelFromExp(exp) {
  let lv = 1;
  while (lv < 100 && expForLevel(lv + 1) <= exp) lv++;
  return lv;
}

export const SOLO_REWARD = { win: CONFIG.solo.win.exp, lose: CONFIG.solo.lose.exp };
export const MAX_PARTY = CONFIG.trainer.maxParty;
export const MAX_COLLECTION = CONFIG.trainer.maxCollection;
export const STATE_TTL = CONFIG.battle.sessionTtlMs;
export const SOLO_ROOM_TTL = CONFIG.solo.roomTtlMs;

// Luyện tập bằng EXP huấn luyện viên (giữ từ bản cũ): tốn EXP trainer để +1 level
export const UPGRADE_COST = {
  level: (lv) => Math.floor(100 * Math.pow(1.35, lv - 1)),
};
