/**
 * Cầu nối Shop ↔ Pokémon: danh sách sản phẩm Pokémon sinh ra từ items.js (một nguồn duy nhất),
 * + dọn bản sao vật phẩm Pokémon nằm trong kho chung (nguồn gây nhân đôi vật phẩm trước đây).
 */
import fs from "node:fs";
import path from "node:path";
import { ITEMS, ITEM_CATS, LEGACY_ITEM_MAP } from "./items.js";
import { itemFile, eggFile } from "./assets.js";
import { DATA_PATH as POKE_USERS } from "./storage.js";

export const SUBCAT = { ball: "ball", heal: "heal", berry: "berry", candy: "candy", evo: "evo", egg: "egg" };
export const POKEMON_SUBS = Object.entries(ITEM_CATS).sort((a, b) => a[1].order - b[1].order).map(([id, c]) => ({ id, name: c.name }));

export function pokemonProductSeeds() {
  return Object.values(ITEMS).map((it) => ({
    id: `prod_pkm_${it.id}`,
    itemIdInInventory: it.id,
    name: it.name,
    description: it.desc + (it.official ? "" : " (cơ chế riêng của project)"),
    price: it.price,
    rarity: it.rarity,
    subcategory: it.cat,
    imageUrl: productImage(it),
    legacyIds: it.legacy || [],
  }));
}
export function productImage(it) {
  const f = it.egg ? eggFile(it.egg) : itemFile(it.id);
  return f && fs.existsSync(f) ? f : "";
}

/** Đồng bộ danh sách sản phẩm trong shop (idempotent). Trả số thay đổi. */
export function syncPokemonProducts(data) {
  let changed = 0;
  const now = new Date().toISOString();
  for (const s of pokemonProductSeeds()) {
    let p = data.products.find((x) => x.category === "pokemon" && (x.itemIdInInventory === s.itemIdInInventory));
    if (!p) p = data.products.find((x) => x.category === "pokemon" && s.legacyIds.includes(x.itemIdInInventory));
    if (!p) {
      data.products.push({ id: s.id, name: s.name, description: s.description, price: s.price, rarity: s.rarity, imageUrl: s.imageUrl, category: "pokemon", subcategory: s.subcategory, gameName: "Pokémon", effects: s.description, stock: -1, active: true, enabled: true, itemIdInInventory: s.itemIdInInventory, createdBy: "system", createdAt: now, updatedAt: now });
      changed++;
      continue;
    }
    const migrated = p.itemIdInInventory !== s.itemIdInInventory; // sản phẩm "food" cũ → Potion chính thức
    const next = { itemIdInInventory: s.itemIdInInventory, name: s.name, description: s.description, effects: s.description, subcategory: s.subcategory, imageUrl: s.imageUrl, gameName: "Pokémon" };
    if (migrated) next.price = s.price;
    let dirty = false;
    for (const [k, v] of Object.entries(next)) if (p[k] !== v) { p[k] = v; dirty = true; }
    if (dirty) { p.updatedAt = now; changed++; }
  }
  return changed;
}

/**
 * Xoá bản sao vật phẩm Pokémon khỏi kho chung. Kho Pokémon là nguồn duy nhất.
 * Người chưa có hồ sơ Pokémon: chuyển số lượng sang hồ sơ Pokémon thay vì xoá.
 */
export async function migrateGeneralInventoryDuplicates({ inventoryApi, addPokeItem, log = console }) {
  const invPath = inventoryApi.USERS_PATH;
  if (!invPath || !fs.existsSync(invPath)) return { users: 0, removed: 0 };
  let pokeUsers = {};
  try { pokeUsers = JSON.parse(fs.readFileSync(POKE_USERS, "utf8") || "{}"); } catch { /* chưa có */ }
  const flag = path.join(path.dirname(POKE_USERS), ".inventory_dedupe_done");
  if (fs.existsSync(flag)) return { users: 0, removed: 0, skipped: true };
  const inv = JSON.parse(fs.readFileSync(invPath, "utf8") || "{}");
  const ids = new Set([...Object.keys(ITEMS), ...Object.keys(LEGACY_ITEM_MAP), "pokeball", "greatball", "ultraball", "masterball", "rare_candy"]);
  const touched = Object.entries(inv).filter(([, u]) => Object.keys(u.items || {}).some((k) => ids.has(k)));
  if (touched.length) {
    fs.copyFileSync(invPath, `${invPath}.backup-pokemon-dedupe-${Date.now()}`);
  }
  let removed = 0;
  for (const [uid, u] of touched) {
    for (const [k, entry] of Object.entries(u.items)) {
      if (!ids.has(k)) continue;
      const qty = Number(entry.quantity) || 0;
      const hasPoke = !!pokeUsers[uid]?.starterChosen || !!pokeUsers[uid];
      if (!hasPoke && qty > 0) { try { await addPokeItem(uid, k, qty); } catch (e) { log.warn?.("[pokemon] chuyển vật phẩm lỗi", uid, k, e.message); continue; } }
      const r = await inventoryApi.removeItem(uid, k, null, { force: true });
      if (r?.success) removed += qty;
    }
  }
  fs.writeFileSync(flag, new Date().toISOString());
  log.log?.(`[pokemon] dọn kho chung: ${touched.length} user, ${removed} vật phẩm trùng`);
  return { users: touched.length, removed };
}
