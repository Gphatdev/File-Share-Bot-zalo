/**
 * Tiến hóa — dựa hoàn toàn trên dữ liệu chính thức (species.evolutions).
 * Hỗ trợ: level, đá tiến hóa, trao đổi (Linking Cord), friendship, thời gian trong ngày, biết chiêu, rẽ nhánh (Eevee).
 */
import { SPECIES } from "./db.js";
import { refreshStats } from "./pokedex.js";
import { itemForStone } from "./items.js";

export function timeOfDay(date = new Date()) {
  // giờ Việt Nam: ngày 06-17h, đêm còn lại
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }).format(date)) % 24;
  return h >= 6 && h < 18 ? "day" : "night";
}

const ITEM_LABEL = (stone) => itemForStone(stone)?.name || stone;

/**
 * @returns [{to, toName, trigger, itemId, reqs:[{text, met}], ready}]
 */
export function getEvolutionOptions(pet, inventory = {}, now = new Date()) {
  const sp = SPECIES[pet.species];
  if (!sp) return [];
  return (sp.evolutions || []).map((e) => {
    const reqs = [];
    let itemId = null;
    if (e.minLevel) reqs.push({ text: `Level ${e.minLevel}`, met: pet.level >= e.minLevel });
    if (e.trigger === "use-item" && e.item) {
      const it = itemForStone(e.item);
      itemId = it?.id || null;
      reqs.push({ text: `Dùng ${ITEM_LABEL(e.item)}`, met: !!it && (inventory[it.id] || 0) > 0 });
    }
    if (e.trigger === "trade") {
      const it = itemForStone("trade");
      itemId = it.id;
      reqs.push({ text: `Dùng ${it.name} (thay trao đổi)`, met: (inventory[it.id] || 0) > 0 });
    }
    if (e.minHappiness) reqs.push({ text: `Thân thiết ≥ ${e.minHappiness}`, met: (pet.friendship || 0) >= e.minHappiness });
    if (e.timeOfDay) reqs.push({ text: `Ban ${e.timeOfDay === "day" ? "ngày" : "đêm"}`, met: timeOfDay(now) === e.timeOfDay });
    if (e.knownMove) reqs.push({ text: `Biết chiêu ${e.knownMove}`, met: (pet.moves || []).includes(e.knownMove) });
    if (!reqs.length) reqs.push({ text: "Không có điều kiện", met: true });
    return {
      to: e.to, toName: SPECIES[e.to]?.name || e.to, trigger: e.trigger, itemId, reqs,
      ready: reqs.every((r) => r.met),
    };
  });
}

/** Áp dụng tiến hóa lên pet (mutate). Trả {ok, from, to} — caller tự trừ vật phẩm & lưu. */
export function applyEvolution(pet, toId, via = "level") {
  const target = SPECIES[toId];
  if (!target) return { ok: false, message: "Dữ liệu tiến hóa lỗi." };
  const sp = SPECIES[pet.species];
  if (!sp || !sp.evolutions.some((e) => e.to === toId)) return { ok: false, message: "Pokémon này không tiến hóa thành loài đó." };
  const from = pet.species;
  pet.species = toId;
  pet.name = pet.nickname || target.name;
  pet.evoHistory = [...(pet.evoHistory || []), { from, to: toId, level: pet.level, at: Date.now(), via }];
  refreshStats(pet, { keepRatio: true });
  pet.evolved = true;
  return { ok: true, from, to: toId };
}
