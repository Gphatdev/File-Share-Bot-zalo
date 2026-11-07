/**
 * Cầu nối Shop ↔ Nông Trại (một nguồn duy nhất = seeds.json / tools.json / medicines.json):
 *   • Vật phẩm  → mục "Nông Trại"  : hạt giống + dụng cụ (cuốc, xô nước, máy tưới)
 *   • Thuốc     → mục "Trồng Trọt" : thuốc tăng trưởng, x2 tiền, hiếm hóa, vàng kim…
 * Mua trong shop thì vật phẩm vào kho chung (Inventory) với đúng itemId mà lệnh .nongtrai đang đọc.
 */
import { getSeeds, getTools, getMedicines, getCrops } from "./storage.js";
import { iconFile } from "./art.js";
import { getItemsCatalog, saveCatalog } from "../Inventory/storage.js";

export const FARM_SUB = { item: "farm", potion: "farming" };
export const FARM_SUB_INFO = {
  item: { id: "farm", name: "Nông Trại", icon: "🌾" },
  potion: { id: "farming", name: "Trồng Trọt", icon: "🌱" },
};

export function farmProductSeeds() {
  const out = [];
  for (const s of getSeeds()) {
    const price = Number.isFinite(Number(s.buyPrice)) ? Number(s.buyPrice) : Math.max(10, Math.round((Number(s.baseSellPrice) || 100) * 0.5));
    out.push({
      kind: "seed", itemId: s.id, category: "item", subcategory: FARM_SUB.item, name: s.name, price, rarity: s.rarity || "common",
      description: `${s.description} Sinh trưởng ${Math.round((s.growTimeMs || 0) / 60000)} phút, thu ${s.yieldMin}-${s.yieldMax} quả. Cần cấp nông nghiệp ${s.unlockLevel || 1}.`,
    });
  }
  for (const t of getTools()) {
    out.push({ kind: "tool", itemId: t.id, category: "item", subcategory: FARM_SUB.item, name: t.name, price: Number(t.price) || 1000, rarity: t.rarity || "common", description: `${t.description} Chỉ cần mua 1 cái, dùng vĩnh viễn. Cần cấp nông nghiệp ${t.unlockLevel || 1}.` });
  }
  for (const m of getMedicines()) {
    out.push({ kind: "medicine", itemId: m.id, category: "potion", subcategory: FARM_SUB.potion, name: m.name, price: Number(m.price) || 1000, rarity: m.rarity || "common", description: `${m.description} Cần cấp nông nghiệp ${m.unlockLevel || 1}.` });
  }
  return out;
}

/** Đồng bộ sản phẩm vào shop_data (idempotent). Chỉ tạo giá khi sản phẩm mới — admin chỉnh giá sau đó được giữ nguyên. */
export function syncFarmProducts(data) {
  let changed = 0;
  const now = new Date().toISOString();
  for (const s of farmProductSeeds()) {
    const img = iconFile(s.kind, s.itemId, { rarity: s.rarity });
    const gameName = "Nông Trại";
    let p = data.products.find((x) => x.itemIdInInventory === s.itemId && x.createdBy === "system" && String(x.id).startsWith("prod_farm_"));
    if (!p) {
      data.products.push({
        id: `prod_farm_${s.itemId}`, name: s.name, description: s.description, price: s.price, rarity: s.rarity, imageUrl: img,
        category: s.category, subcategory: s.subcategory, gameName: null, effects: s.description, stock: -1, active: true, enabled: true,
        itemIdInInventory: s.itemId, createdBy: "system", createdAt: now, updatedAt: now, source: "nongtrai",
      });
      changed++;
      continue;
    }
    const next = { name: s.name, description: s.description, effects: s.description, rarity: s.rarity, imageUrl: img, category: s.category, subcategory: s.subcategory, source: "nongtrai" };
    let dirty = false;
    for (const [k, v] of Object.entries(next)) if (p[k] !== v) { p[k] = v; dirty = true; }
    if (dirty) { p.updatedAt = now; changed++; }
    void gameName;
  }
  return changed;
}

/** Đăng ký vật phẩm nông trại vào danh mục kho để hiển thị đúng tên / giới hạn chồng (idempotent). */
export function registerFarmItems() {
  try {
    const cat = getItemsCatalog();
    const add = {};
    const put = (id, def) => { const cur = cat[id]; if (!cur || cur.name !== def.name || cur.maxStack !== def.maxStack) add[id] = { id, nameKey: def.name.toLowerCase(), locked: false, ...def }; };
    for (const s of getSeeds()) put(s.id, { name: s.name, stackable: true, maxStack: 500, rarity: s.rarity, icon: "🌱", description: s.description });
    for (const c of getCrops()) put(c.id, { name: c.name, stackable: true, maxStack: 9999, rarity: c.rarity, icon: "🥬", description: `Nông sản ${c.name}. Bán tại .nongtrai sell` });
    for (const t of getTools()) put(t.id, { name: t.name, stackable: false, maxStack: 1, rarity: t.rarity, icon: "🛠️", description: t.description });
    for (const m of getMedicines()) put(m.id, { name: m.name, stackable: true, maxStack: 99, rarity: m.rarity, icon: "🧪", description: m.description });
    if (Object.keys(add).length) { saveCatalog({ ...cat, ...add }); return Object.keys(add).length; }
  } catch (e) { console.error("[nongtrai] registerFarmItems:", e?.message); }
  return 0;
}
