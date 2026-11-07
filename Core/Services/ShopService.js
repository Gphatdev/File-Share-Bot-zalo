import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import TienGame from "../Commands/data/GIAITRI/TienGame/index.js";
import {
  addItem,
  canStoreItem,
  removeItem,
  getInventoryItems,
} from "../Commands/data/GIAITRI/Inventory/index.js";
import { addItem as addPokeItem, canStoreItem as canStorePokeItem } from "../Commands/data/GIAITRI/Pokemon/storage.js";
import { syncPokemonProducts, migrateGeneralInventoryDuplicates } from "../Commands/data/GIAITRI/Pokemon/shop_sync.js";
import * as invStorage from "../Commands/data/GIAITRI/Inventory/storage.js";
import { syncFarmProducts, registerFarmItems, FARM_SUB_INFO } from "../Commands/data/GIAITRI/NongTrai/shop_sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CATEGORIES = {
  item: { id: "item", name: "Vật phẩm", icon: "🎒", order: 1 },
  equip: { id: "equip", name: "Trang bị", icon: "⚔️", order: 2 },
  potion: { id: "potion", name: "Thuốc", icon: "🧪", order: 3 },
  pokemon: { id: "pokemon", name: "Pokémon", icon: "⚡", order: 4 },
};

export const RARITIES = {
  common: { id: "common", name: "Thường", icon: "⚪", color: "#94A3B8", order: 1 },
  uncommon: { id: "uncommon", name: "Không phổ biến", icon: "🟢", color: "#22C55E", order: 2 },
  rare: { id: "rare", name: "Hiếm", icon: "🔵", color: "#3B82F6", order: 3 },
  epic: { id: "epic", name: "Sử thi", icon: "🟣", color: "#A855F7", order: 4 },
  legendary: { id: "legendary", name: "Huyền thoại", icon: "🟠", color: "#F97316", order: 5 },
  mythic: { id: "mythic", name: "Tối thượng", icon: "🔴", color: "#EF4444", order: 6 },
};

export const ITEM_SUBS = [
  { id: "hat", name: "Mũ", icon: "🪖" },
  { id: "armor", name: "Giáp", icon: "🛡️" },
  { id: "weapon", name: "Vũ khí", icon: "⚔️" },
  { id: "accessory", name: "Phụ kiện", icon: "💍" },
  { id: "other", name: "Khác", icon: "🎁" },
  { id: "farm", name: "Nông Trại", icon: "🌾" },
];

export const POTION_SUBS = [
  { id: "power", name: "Tăng sức mạnh", icon: "💪" },
  { id: "luck", name: "Tăng may mắn", icon: "🍀" },
  { id: "speed", name: "Tăng tốc", icon: "⚡" },
  { id: "heal", name: "Hồi phục", icon: "❤️" },
  { id: "special", name: "Đặc biệt", icon: "🔮" },
  { id: "farming", name: "Trồng Trọt", icon: "🌱" },
];

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || "item";
}

class ShopService {
  constructor() {
    this.dataPath = path.join(__dirname, "..", "Commands", "data", "GIAITRI", "Shop", "shop_data.json");
    this.imagesDir = path.join(__dirname, "../../assets/shop_items");
    this.userLocks = new Set();
    this.ensureStorage();
    this.data = this.loadData();
    this.migrateIfNeeded();
    this.ensurePokemonProducts();
    this.ensureFarmProducts();
  }

  ensureStorage() {
    fs.mkdirSync(this.imagesDir, { recursive: true });
    fs.mkdirSync(path.dirname(this.dataPath), { recursive: true });
  }

  defaultData() {
    return {
      version: 2,
      products: [],
      marketplace: [],
      logs: [],
      categories: [], // legacy
    };
  }

  loadData() {
    if (!fs.existsSync(this.dataPath)) {
      const d = this.defaultData();
      fs.writeFileSync(this.dataPath, JSON.stringify(d, null, 2), "utf8");
      return d;
    }
    try {
      return JSON.parse(fs.readFileSync(this.dataPath, "utf8"));
    } catch (e) {
      console.error("[ShopService] read error:", e?.message);
      return this.defaultData();
    }
  }

  saveData() {
    try {
      const tmp = `${this.dataPath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
      try {
        fs.renameSync(tmp, this.dataPath);
      } catch {
        fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), "utf8");
      }
    } catch (e) {
      console.error("[ShopService] save error:", e?.message);
    }
  }

  /** Migrate V1 products (categoryId) → V2 (category/gameName/rarity) */
  migrateIfNeeded() {
    let changed = false;
    if (!Array.isArray(this.data.products)) {
      this.data.products = [];
      changed = true;
    }
    for (const p of this.data.products) {
      if (!p.category) {
        const cid = String(p.categoryId || "");
        if (cid.includes("equip") || /trang\s*b[iị]/i.test(p.name || "")) p.category = "equip";
        else if (cid.includes("consum") || /thu[oố]c|bình/i.test(p.name || "")) p.category = "potion";
        else p.category = "item";
        changed = true;
      }
      if (!p.rarity) {
        p.rarity = "common";
        changed = true;
      }
      if (p.gameName === undefined) {
        p.gameName = p.category === "equip" ? p.game || null : null;
        changed = true;
      }
      if (!p.itemIdInInventory) {
        p.itemIdInInventory = slugify(p.name);
        changed = true;
      }
      if (p.active === undefined) {
        p.active = true;
        changed = true;
      }
      if (p.subcategory === undefined) p.subcategory = null;
    }
    if (!this.data.version || this.data.version < 2) {
      this.data.version = 2;
      changed = true;
    }
    if (changed) this.saveData();
  }

  async acquireUserLock(userId) {
    const key = String(userId);
    if (this.userLocks.has(key)) return false;
    this.userLocks.add(key);
    return true;
  }

  releaseUserLock(userId) {
    this.userLocks.delete(String(userId));
  }

  fmt(n) {
    return Number(n || 0).toLocaleString("vi-VN");
  }


  /** Đồng bộ sản phẩm Pokémon từ danh mục vật phẩm chính (bóng, thuốc, berry, kẹo, đá tiến hóa, trứng) */
  ensurePokemonProducts() {
    try {
      const n = syncPokemonProducts(this.data);
      if (n > 0) {
        this.saveData();
        console.log(`[ShopService] Đồng bộ ${n} sản phẩm Pokémon`);
      }
    } catch (e) {
      console.error("[ShopService] ensurePokemonProducts:", e?.message);
    }
    if (!this._pokeDedupeStarted) {
      this._pokeDedupeStarted = true;
      migrateGeneralInventoryDuplicates({ inventoryApi: { USERS_PATH: invStorage.USERS_PATH, removeItem }, addPokeItem }).catch((e) => console.error("[ShopService] dedupe kho Pokémon:", e?.message));
    }
  }

  /** Đồng bộ hạt giống / dụng cụ / thuốc của Nông Trại vào shop (Vật phẩm → Nông Trại, Thuốc → Trồng Trọt). */
  ensureFarmProducts() {
    try {
      registerFarmItems();
      const n = syncFarmProducts(this.data);
      if (n > 0) {
        this.saveData();
        console.log(`[ShopService] Đồng bộ ${n} sản phẩm Nông Trại`);
      }
    } catch (e) {
      console.error("[ShopService] ensureFarmProducts:", e?.message);
    }
  }

  /**
   * Nhóm con của một danh mục (chỉ Vật phẩm / Thuốc): "Nông Trại" / "Trồng Trọt" + phần còn lại.
   * Trả [] nếu danh mục không có nhóm con nào cần hiển thị (mở thẳng danh sách như cũ).
   */
  getSubGroups(categoryId) {
    const farm = FARM_SUB_INFO[categoryId];
    if (!farm) return [];
    this.ensureFarmProducts();
    const all = this.getProductsByCategory(categoryId);
    const farmList = all.filter((p) => p.subcategory === farm.id);
    if (!farmList.length) return [];
    const rest = all.filter((p) => p.subcategory !== farm.id);
    const groups = [];
    if (rest.length) groups.push({ id: "__other", name: categoryId === "item" ? "Vật phẩm khác" : "Thuốc khác", icon: categoryId === "item" ? "🎁" : "🧪", count: rest.length });
    groups.push({ id: farm.id, name: farm.name, icon: farm.icon, count: farmList.length, farm: true });
    return groups;
  }

  getProductsByGroup(categoryId, groupId) {
    const farm = FARM_SUB_INFO[categoryId];
    const all = this.getProductsByCategory(categoryId);
    if (groupId === "__other") return all.filter((p) => !farm || p.subcategory !== farm.id);
    return all.filter((p) => p.subcategory === groupId);
  }

  getMainCategories() {
    const products = this.data.products.filter((p) => p.active !== false);
    return Object.values(CATEGORIES)
      .sort((a, b) => a.order - b.order)
      .map((c) => ({
        ...c,
        count: products.filter((p) => p.category === c.id).length,
      }));
  }

  getActiveProducts() {
    return this.data.products.filter((p) => p.active !== false);
  }

  getProductsByCategory(categoryId) {
    return this.getActiveProducts().filter((p) => p.category === categoryId);
  }

  getProductsBySub(categoryId, subcategory) {
    return this.getProductsByCategory(categoryId).filter(
      (p) => (p.subcategory || "other") === subcategory
    );
  }

  /** Dynamic game list from equip products only */
  getGames() {
    // Đảm bảo luôn có item Pokémon trước khi build list
    try {
      this.ensurePokemonProducts();
    } catch (e) {
      console.error("[ShopService.getGames] ensurePokemonProducts:", e?.message);
    }
    const map = new Map();
    for (const p of this.getProductsByCategory("equip")) {
      const g = String(p.gameName || "").trim();
      if (!g) continue;
      // Không đưa "Pokémon" equip giả vào list equip thường
      if (g.toLowerCase() === "pokemon" || g.toLowerCase() === "pokémon") continue;
      map.set(g.toLowerCase(), { name: g, count: (map.get(g.toLowerCase())?.count || 0) + 1, isPokemon: false });
    }
    // LUÔN inject Pokémon vào đầu danh sách (không phụ thuộc count)
    const pokeCount = this.getProductsByCategory("pokemon").length;
    map.set("pokemon", {
      name: "Pokémon",
      count: pokeCount || 8,
      isPokemon: true,
    });
    return [...map.values()].sort((a, b) => {
      if (a.isPokemon) return -1;
      if (b.isPokemon) return 1;
      return a.name.localeCompare(b.name, "vi");
    });
  }

  getProductsByGame(gameName) {
    const key = String(gameName || "").trim().toLowerCase();
    return this.getProductsByCategory("equip").filter(
      (p) => String(p.gameName || "").trim().toLowerCase() === key
    );
  }

  getProduct(id) {
    return this.data.products.find((p) => p.id === id) || null;
  }

  getRarity(id) {
    return RARITIES[id] || RARITIES.common;
  }

  async getMoney(userId) {
    return TienGame.getBalance(userId);
  }

  async addProduct(productData, imageBuffer = null) {
    const id = `prod_${Date.now()}_${randomUUID().slice(0, 6)}`;
    let imagePath = "";
    if (imageBuffer && Buffer.isBuffer(imageBuffer)) {
      imagePath = path.join(this.imagesDir, `${id}.png`);
      fs.writeFileSync(imagePath, imageBuffer);
    }

    const category = productData.category || "item";
    const product = {
      id,
      name: String(productData.name || "Sản phẩm").slice(0, 80),
      description: String(productData.description || "").slice(0, 500),
      price: Math.max(0, Math.floor(Number(productData.price) || 0)),
      rarity: RARITIES[productData.rarity] ? productData.rarity : "common",
      imageUrl: imagePath,
      category,
      subcategory: productData.subcategory || null,
      gameName: category === "equip" ? String(productData.gameName || "").trim() || null : null,
      effects: productData.effects || "",
      stock: productData.stock !== undefined ? Number(productData.stock) : -1,
      active: true,
      enabled: true,
      itemIdInInventory: productData.itemIdInInventory || slugify(productData.name),
      createdBy: productData.createdBy || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.data.products.push(product);
    this.saveData();
    return product;
  }

  async updateProduct(productId, patch, imageBuffer = null) {
    const p = this.getProduct(productId);
    if (!p) return { success: false, error: "Sản phẩm không tồn tại." };

    if (patch.name !== undefined) p.name = String(patch.name).slice(0, 80);
    if (patch.description !== undefined) p.description = String(patch.description).slice(0, 500);
    if (patch.price !== undefined) p.price = Math.max(0, Math.floor(Number(patch.price) || 0));
    if (patch.rarity !== undefined && RARITIES[patch.rarity]) p.rarity = patch.rarity;
    if (patch.category !== undefined && CATEGORIES[patch.category]) {
      p.category = patch.category;
      if (p.category !== "equip") p.gameName = null;
    }
    if (patch.subcategory !== undefined) p.subcategory = patch.subcategory;
    if (patch.gameName !== undefined && p.category === "equip") {
      p.gameName = String(patch.gameName).trim() || null;
    }
    if (patch.effects !== undefined) p.effects = String(patch.effects);
    if (patch.stock !== undefined) p.stock = Number(patch.stock);

    if (imageBuffer && Buffer.isBuffer(imageBuffer)) {
      const newPath = path.join(this.imagesDir, `${p.id}.png`);
      fs.writeFileSync(newPath, imageBuffer);
      p.imageUrl = newPath;
    }

    p.updatedAt = new Date().toISOString();
    this.saveData();
    return { success: true, product: p };
  }

  async deleteProduct(productId) {
    const idx = this.data.products.findIndex((p) => p.id === productId);
    if (idx < 0) return { success: false, error: "Sản phẩm không tồn tại." };
    const p = this.data.products[idx];
    // Soft delete to keep history; hard-remove image if exclusive
    p.active = false;
    p.enabled = false;
    p.updatedAt = new Date().toISOString();
    if (p.imageUrl && fs.existsSync(p.imageUrl)) {
      const used = this.data.products.some(
        (x) => x.id !== p.id && x.imageUrl === p.imageUrl && x.active !== false
      );
      if (!used) {
        try {
          fs.unlinkSync(p.imageUrl);
        } catch {
          /* ignore */
        }
      }
    }
    this.saveData();
    return { success: true, product: p };
  }

  async buyShopItem(userId, productId, quantity = 1) {
    if (!(await this.acquireUserLock(userId))) {
      return { success: false, message: "Thao tác quá nhanh, thử lại sau!" };
    }
    try {
      const product = this.data.products.find((p) => p.id === productId && p.active !== false);
      if (!product) return { success: false, message: "Sản phẩm không tồn tại hoặc đã ẩn!" };

      const qty = Math.max(1, Math.floor(Number(quantity) || 1));
      if (product.stock !== -1 && product.stock < qty) {
        return { success: false, message: `Kho shop còn ${product.stock}!` };
      }

      const totalPrice = product.price * qty;
      const userMoney = await TienGame.getBalance(userId);
      if (userMoney < totalPrice) {
        return {
          success: false,
          message: `Không đủ tiền! Cần ${this.fmt(totalPrice)}, bạn có ${this.fmt(userMoney)}.`,
        };
      }

      const isPoke = product.category === "pokemon";
      const invCheck = isPoke
        ? await canStorePokeItem(userId, product.itemIdInInventory, qty)
        : await canStoreItem(userId, product.itemIdInInventory, qty);
      if (!invCheck.ok) {
        return { success: false, message: `Kho đồ: ${invCheck.reason || "không đủ chỗ"}.` };
      }

      await TienGame.removeMoney(userId, totalPrice, {
        description: `Shop mua ${product.name} x${qty}`,
      });

      // Vật phẩm Pokémon chỉ vào kho Pokémon (một nguồn duy nhất, không nhân đôi sang kho chung)
      const addResult = isPoke
        ? await addPokeItem(userId, product.itemIdInInventory, qty).then((r) => ({ success: !!r?.ok, error: r?.message }))
        : await addItem(userId, product.itemIdInInventory, qty, {
            meta: { source: "shop", productId: product.id, name: product.name, rarity: product.rarity },
          });

      if (!addResult.success) {
        await TienGame.addMoney(userId, totalPrice, {
          description: `Shop hoàn tiền (lỗi kho) ${product.name}`,
        });
        return { success: false, message: addResult.error || "Không thêm được vào kho đồ." };
      }

      if (product.stock !== -1) {
        product.stock -= qty;
        this.saveData();
      }

      this.data.logs.push({
        type: "BUY",
        userId: String(userId),
        productId: product.id,
        name: product.name,
        qty,
        totalPrice,
        at: Date.now(),
      });
      if (this.data.logs.length > 500) this.data.logs = this.data.logs.slice(-500);
      this.saveData();

      const balance = await TienGame.getBalance(userId);
      return {
        success: true,
        message: `Đã mua ${product.name} x${qty}!`,
        product,
        qty,
        totalPrice,
        balance,
      };
    } finally {
      this.releaseUserLock(userId);
    }
  }

  // ─── Marketplace (giữ tương thích) ─────────────────────────
  getMarketplaceListings() {
    return (this.data.marketplace || []).filter((m) => m.status === "ACTIVE");
  }

  async getUserSellableItems(userId) {
    const items = await getInventoryItems(userId);
    return (items || [])
      .filter((i) => (i.quantity || 0) > 0)
      .map((i) => ({
        itemId: i.itemId || i.id,
        name: i.name || i.itemId,
        quantity: i.quantity,
        icon: i.icon || "📦",
      }));
  }

  async createMarketListing(sellerId, sellerName, itemId, itemName, qty, price) {
    const quantity = Math.floor(Number(qty));
    const pricePerUnit = Math.floor(Number(price));
    if (quantity <= 0 || pricePerUnit <= 0) {
      return { success: false, message: "Số lượng/giá không hợp lệ!" };
    }
    const removeResult = await removeItem(sellerId, itemId, quantity);
    if (!removeResult.success) {
      return { success: false, message: removeResult.error || "Không đủ vật phẩm trong kho!" };
    }
    const listing = {
      id: `list_${Date.now()}`,
      sellerId: String(sellerId),
      sellerName: String(sellerName || "Người chơi"),
      itemId,
      itemName,
      quantity,
      pricePerUnit,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };
    if (!this.data.marketplace) this.data.marketplace = [];
    this.data.marketplace.push(listing);
    this.saveData();
    return { success: true, listing };
  }

  async buyMarketListing(buyerId, listingId) {
    if (!(await this.acquireUserLock(buyerId))) {
      return { success: false, message: "Thao tác quá nhanh!" };
    }
    try {
      const listing = (this.data.marketplace || []).find(
        (m) => m.id === listingId && m.status === "ACTIVE"
      );
      if (!listing) return { success: false, message: "Tin đăng không còn!" };
      if (String(listing.sellerId) === String(buyerId)) {
        return { success: false, message: "Không thể mua tin của chính mình!" };
      }
      const totalPrice = listing.pricePerUnit * listing.quantity;
      const buyerMoney = await TienGame.getBalance(buyerId);
      if (buyerMoney < totalPrice) {
        return { success: false, message: "Không đủ tiền!" };
      }
      const invCheck = await canStoreItem(buyerId, listing.itemId, listing.quantity);
      if (!invCheck.ok) {
        return { success: false, message: `Kho đồ: ${invCheck.reason || "đầy"}` };
      }
      await TienGame.removeMoney(buyerId, totalPrice, { description: `Chợ đen mua ${listing.itemName}` });
      await TienGame.addMoney(listing.sellerId, totalPrice, { description: `Chợ đen bán ${listing.itemName}` });
      const addResult = await addItem(buyerId, listing.itemId, listing.quantity, {
        meta: { source: "marketplace", listingId },
      });
      if (!addResult.success) {
        await TienGame.addMoney(buyerId, totalPrice, { description: "Chợ đen hoàn tiền" });
        await TienGame.removeMoney(listing.sellerId, totalPrice, { description: "Chợ đen thu hồi" });
        return { success: false, message: addResult.error || "Lỗi kho đồ" };
      }
      listing.status = "SOLD";
      this.saveData();
      return { success: true, listing, totalPrice };
    } finally {
      this.releaseUserLock(buyerId);
    }
  }

  async cancelMarketListing(sellerId, listingId) {
    const listing = (this.data.marketplace || []).find(
      (m) => m.id === listingId && String(m.sellerId) === String(sellerId) && m.status === "ACTIVE"
    );
    if (!listing) return { success: false, message: "Tin đăng không hợp lệ!" };
    const addResult = await addItem(sellerId, listing.itemId, listing.quantity, {
      meta: { source: "market_cancel", listingId },
    });
    if (!addResult.success) {
      return { success: false, message: addResult.error || "Không hoàn được vào kho" };
    }
    listing.status = "CANCELLED";
    this.saveData();
    return { success: true, message: `Đã hủy và hoàn x${listing.quantity} [${listing.itemName}]` };
  }
}

const shopService = new ShopService();
export default shopService;
