import {
  ensureDataFiles,
  getConfig,
  getUsers,
  getTiers,
  getItemsCatalog,
  saveUsers,
  saveTiers,
  safeNumber,
} from "./storage.js";

const USER_LOCKS = new Map();
const TIER_LOCKS = new Map();

async function withUserLock(userId, task) {
  const key = String(userId);
  const previous = USER_LOCKS.get(key) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  USER_LOCKS.set(key, next);
  await previous;
  try {
    return await task();
  } finally {
    if (USER_LOCKS.get(key) === next) USER_LOCKS.delete(key);
    release();
  }
}

async function withTierLock(userId, task) {
  const key = `tier:${String(userId)}`;
  const previous = TIER_LOCKS.get(key) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  TIER_LOCKS.set(key, next);
  await previous;
  try {
    return await task();
  } finally {
    if (TIER_LOCKS.get(key) === next) TIER_LOCKS.delete(key);
    release();
  }
}

function formatUserKey(userId) {
  return String(userId || "").trim();
}

function getNow() {
  return Date.now();
}

function resolveItemDef(itemId) {
  const catalog = getItemsCatalog();
  if (catalog[itemId]) return catalog[itemId];
  // Vật phẩm ngoài catalog (vd. từ shop) — mặc định stackable
  return {
    id: itemId,
    name: String(itemId).replace(/_/g, " "),
    stackable: true,
    maxStack: getConfig().maxStackDefault || 99,
    locked: false,
    rarity: "common",
    icon: "📦",
    description: "",
  };
}


function normalizeTierName(tier) {
  const t = String(tier || "").toUpperCase().trim();
  if (t === "VO HAN" || t === "VÔ HẠN" || t === "INFINITE" || t === "INFINITY") return "INFINITE";
  if (["BASIC", "VIP", "PRE", "INFINITE"].includes(t)) return t;
  return null;
}

function createEmptyInventory() {
  return {
    items: {}, // itemId -> { quantity, locked?, meta? }
    updatedAt: getNow(),
  };
}

function createDefaultTierRecord(userId) {
  return {
    userId: formatUserKey(userId),
    tier: "BASIC",
    grantedAt: getNow(),
    expiresAt: null,
    grantedBy: "system",
    source: "default",
    status: "active",
  };
}

/**
 * Ensure user inventory record exists.
 */
async function ensureUserInventory(userId) {
  await ensureDataFiles();
  const key = formatUserKey(userId);
  if (!key) throw new Error("userId không hợp lệ");

  const users = getUsers();
  if (!users[key]) {
    users[key] = createEmptyInventory();
    saveUsers(users);
  }
  return users[key];
}

/**
 * Ensure tier record exists. Defaults to BASIC.
 * Also handles expiry.
 */
async function ensureTierRecord(userId) {
  await ensureDataFiles();
  const key = formatUserKey(userId);
  if (!key) throw new Error("userId không hợp lệ");

  return withTierLock(key, async () => {
    const tiers = getTiers();
    let record = tiers[key];
    if (!record) {
      record = createDefaultTierRecord(key);
      tiers[key] = record;
      saveTiers(tiers);
      return record;
    }

    // Check expiry for time-limited tiers
    if (record.expiresAt && Number(record.expiresAt) > 0 && Number(record.expiresAt) <= getNow()) {
      const config = getConfig();
      const oldTier = record.tier;
      record.tier = config.defaultTier || "BASIC";
      record.status = "expired";
      record.expiredAt = getNow();
      record.previousTier = oldTier;
      record.expiresAt = null;
      // Keep items intact – do NOT delete excess items
      tiers[key] = record;
      saveTiers(tiers);
    }

    return record;
  });
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API – Inventory Tier
// ─────────────────────────────────────────────────────────────

export async function getInventoryTier(userId) {
  const record = await ensureTierRecord(userId);
  const config = getConfig();
  const tierName = normalizeTierName(record.tier) || config.defaultTier || "BASIC";
  const tierDef = config.tiers[tierName] || config.tiers.BASIC;
  return {
    userId: formatUserKey(userId),
    tier: tierName,
    displayName: tierDef.displayName,
    badge: tierDef.badge,
    capacity: tierDef.capacity, // null = unlimited
    grantedAt: record.grantedAt,
    expiresAt: record.expiresAt,
    grantedBy: record.grantedBy,
    source: record.source,
    status: record.status || "active",
    isUnlimited: tierDef.capacity === null,
  };
}

export async function getInventoryCapacity(userId) {
  const info = await getInventoryTier(userId);
  return info.capacity; // number or null
}

export async function getInventoryUsage(userId) {
  const inv = await ensureUserInventory(userId);
  const items = inv.items || {};
  let usedSlots = 0;
  let totalQuantity = 0;
  let uniqueTypes = 0;

  for (const [itemId, entry] of Object.entries(items)) {
    const qty = safeNumber(entry?.quantity, 0);
    if (qty > 0) {
      usedSlots += 1;
      totalQuantity += qty;
      uniqueTypes += 1;
    }
  }
  return { usedSlots, totalQuantity, uniqueTypes };
}

/**
 * Check if user can store a given item+quantity.
 * Returns { ok: boolean, reason?: string, slotsNeeded?: number }
 */
export async function canStoreItem(userId, itemId, quantity = 1) {
  const qty = Math.max(0, Math.floor(safeNumber(quantity, 0)));
  if (qty <= 0) return { ok: false, reason: "Số lượng không hợp lệ" };

  const def = resolveItemDef(itemId);
  if (!def) return { ok: false, reason: `Vật phẩm không tồn tại: ${itemId}` };

  const inv = await ensureUserInventory(userId);
  const existing = inv.items?.[itemId];
  const currentQty = safeNumber(existing?.quantity, 0);

  const capacity = await getInventoryCapacity(userId);
  const usage = await getInventoryUsage(userId);

  // If already owned and stackable → no new slot needed (subject to maxStack)
  if (existing && currentQty > 0) {
    if (!def.stackable) {
      return { ok: false, reason: "Vật phẩm này không thể cộng dồn" };
    }
    const maxStack = safeNumber(def.maxStack, getConfig().maxStackDefault);
    if (currentQty + qty > maxStack) {
      return {
        ok: false,
        reason: `Đã đạt giới hạn stack (${maxStack}) cho ${def.name}`,
        slotsNeeded: 0,
      };
    }
    return { ok: true, slotsNeeded: 0 };
  }

  // New item type → needs 1 slot
  if (capacity !== null && usage.usedSlots >= capacity) {
    return {
      ok: false,
      reason: "KHO ĐỒ ĐÃ ĐẦY",
      slotsNeeded: 1,
      used: usage.usedSlots,
      capacity,
    };
  }

  return { ok: true, slotsNeeded: 1 };
}

/**
 * Add item(s) to inventory. Returns result object.
 * Does NOT auto-create item if capacity check fails.
 */
export async function addItem(userId, itemId, quantity = 1, options = {}) {
  const qty = Math.max(0, Math.floor(safeNumber(quantity, 0)));
  if (qty <= 0) {
    return { success: false, error: "Số lượng không hợp lệ" };
  }

  const key = formatUserKey(userId);
  return withUserLock(key, async () => {
    const check = await canStoreItem(key, itemId, qty);
    if (!check.ok) {
      return {
        success: false,
        error: check.reason,
        code: check.reason === "KHO ĐỒ ĐÃ ĐẦY" ? "INVENTORY_FULL" : "CANNOT_STORE",
        used: check.used,
        capacity: check.capacity,
      };
    }

    const def = resolveItemDef(itemId);
    if (!def) {
      return { success: false, error: `Vật phẩm không tồn tại: ${itemId}` };
    }

    const users = getUsers();
    if (!users[key]) users[key] = createEmptyInventory();
    const inv = users[key];
    if (!inv.items) inv.items = {};

    const existing = inv.items[itemId];
    const currentQty = safeNumber(existing?.quantity, 0);
    const newQty = currentQty + qty;

    inv.items[itemId] = {
      quantity: newQty,
      locked: existing?.locked ?? def.locked ?? false,
      obtainedAt: existing?.obtainedAt || getNow(),
      meta: existing?.meta || options.meta || {},
    };
    inv.updatedAt = getNow();
    users[key] = inv;
    saveUsers(users);

    const usage = await getInventoryUsage(key);
    return {
      success: true,
      itemId,
      name: def.name,
      added: qty,
      total: newQty,
      usedSlots: usage.usedSlots,
      capacity: await getInventoryCapacity(key),
    };
  });
}

/**
 * Remove / discard item. quantity defaults to all if not specified.
 */
export async function removeItem(userId, itemId, quantity = null, options = {}) {
  const key = formatUserKey(userId);
  return withUserLock(key, async () => {
    const users = getUsers();
    const inv = users[key];
    if (!inv || !inv.items || !inv.items[itemId]) {
      return { success: false, error: "Bạn không sở hữu vật phẩm này." };
    }

    const entry = inv.items[itemId];
    const currentQty = safeNumber(entry.quantity, 0);
    if (currentQty <= 0) {
      delete inv.items[itemId];
      saveUsers(users);
      return { success: false, error: "Bạn không sở hữu vật phẩm này." };
    }

    // Locked check (unless force)
    if (entry.locked && !options.force) {
      return { success: false, error: "Vật phẩm này không thể vứt bỏ.", code: "LOCKED" };
    }

    const catalog = getItemsCatalog();
    const def = catalog[itemId] || { name: itemId };

    let removeQty;
    if (quantity === null || quantity === undefined) {
      removeQty = currentQty;
    } else {
      removeQty = Math.max(0, Math.floor(safeNumber(quantity, 0)));
      if (removeQty <= 0) {
        return { success: false, error: "Số lượng không hợp lệ" };
      }
      if (removeQty > currentQty) {
        return { success: false, error: `Bạn chỉ sở hữu ${currentQty}x ${def.name}` };
      }
    }

    const remaining = currentQty - removeQty;
    if (remaining <= 0) {
      delete inv.items[itemId];
    } else {
      inv.items[itemId] = { ...entry, quantity: remaining };
    }
    inv.updatedAt = getNow();
    users[key] = inv;
    saveUsers(users);

    const usage = await getInventoryUsage(key);
    return {
      success: true,
      itemId,
      name: def.name,
      removed: removeQty,
      remaining,
      usedSlots: usage.usedSlots,
      capacity: await getInventoryCapacity(key),
    };
  });
}

/**
 * Get full inventory items (for internal use). Prefer getInventoryPage for large inventories.
 */
export async function getInventoryItems(userId) {
  const inv = await ensureUserInventory(userId);
  const catalog = getItemsCatalog();
  const result = [];

  for (const [itemId, entry] of Object.entries(inv.items || {})) {
    const qty = safeNumber(entry?.quantity, 0);
    if (qty <= 0) continue;
    const meta = entry?.meta && typeof entry.meta === "object" ? entry.meta : {};
    const isFish = meta.type === "caught_fish" && meta.fishId;
    const def = catalog[itemId] || (isFish
      ? { id: itemId, name: meta.fishName || itemId, icon: meta.icon || "🐟", rarity: meta.rarity || "common", stackable: false }
      : { id: itemId, name: itemId, icon: "❓", rarity: "common", stackable: true });
    result.push({
      itemId,
      fishId: isFish ? meta.fishId : null,
      meta: isFish ? meta : undefined,
      name: def.name,
      icon: def.icon || "❓",
      quantity: qty,
      locked: !!entry.locked,
      rarity: def.rarity || "common",
      stackable: !!def.stackable,
      description: def.description || "",
      obtainedAt: entry.obtainedAt,
    });
  }

  // Stable sort by name
  result.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  return result;
}

/**
 * Bản sao chỉ-đọc các mục trong kho kèm `meta` (dùng cho cá câu được: nhóm theo loài, bán cá).
 * @returns {Promise<Array<{itemId:string, quantity:number, meta:object}>>}
 */
export async function getInventoryRaw(userId) {
  const inv = await ensureUserInventory(userId);
  const out = [];
  for (const [itemId, entry] of Object.entries(inv.items || {})) {
    const quantity = safeNumber(entry?.quantity, 0);
    if (quantity <= 0) continue;
    out.push({ itemId, quantity, meta: entry?.meta && typeof entry.meta === "object" ? { ...entry.meta } : {} });
  }
  return out;
}

/**
 * Paginated inventory view – critical for INFINITE tier.
 */
export async function getInventoryPage(userId, page = 1, pageSize = null) {
  const config = getConfig();
  const size = Math.max(1, Math.min(50, pageSize || config.pageSize || 20));
  const items = await getInventoryItems(userId);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.max(1, Math.min(totalPages, Math.floor(safeNumber(page, 1))));
  const start = (safePage - 1) * size;
  const pageItems = items.slice(start, start + size);

  return {
    items: pageItems,
    page: safePage,
    pageSize: size,
    totalItems: total,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
  };
}

/**
 * Find item by name (fuzzy / exact). Used by .balo vut
 */
export async function findItemByName(userId, nameQuery) {
  const query = String(nameQuery || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!query) return null;

  const items = await getInventoryItems(userId);
  const catalog = getItemsCatalog();

  // Exact match first
  for (const item of items) {
    const def = catalog[item.itemId];
    const keys = [
      item.name,
      def?.nameKey,
      item.itemId,
    ]
      .filter(Boolean)
      .map((s) =>
        String(s)
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
      );

    if (keys.some((k) => k === query)) {
      return item;
    }
  }

  // Partial match – prefer shortest unique
  const partials = [];
  for (const item of items) {
    const def = catalog[item.itemId];
    const keys = [item.name, def?.nameKey, item.itemId]
      .filter(Boolean)
      .map((s) =>
        String(s)
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
      );
    if (keys.some((k) => k.includes(query) || query.includes(k))) {
      partials.push(item);
    }
  }

  if (partials.length === 1) return partials[0];
  if (partials.length > 1) {
    // Prefer exact-ish shorter name
    partials.sort((a, b) => a.name.length - b.name.length);
    return partials[0];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API – Tier management (admin / system only)
// ─────────────────────────────────────────────────────────────

export async function setInventoryTier(userId, tier, options = {}) {
  const key = formatUserKey(userId);
  const normalized = normalizeTierName(tier);
  if (!normalized) {
    return { success: false, error: `Cấp kho không hợp lệ: ${tier}` };
  }

  const config = getConfig();
  if (!config.tiers[normalized]) {
    return { success: false, error: `Cấp kho không tồn tại trong config: ${normalized}` };
  }

  return withTierLock(key, async () => {
    const tiers = getTiers();
    const existing = tiers[key] || createDefaultTierRecord(key);

    const now = getNow();
    const expiresAt =
      options.expiresAt != null
        ? Number(options.expiresAt)
        : options.durationMs
          ? now + Number(options.durationMs)
          : options.durationDays
            ? now + Number(options.durationDays) * 24 * 60 * 60 * 1000
            : null;

    tiers[key] = {
      userId: key,
      tier: normalized,
      grantedAt: now,
      expiresAt: expiresAt && expiresAt > now ? expiresAt : null,
      grantedBy: options.grantedBy || "admin",
      source: options.source || "manual",
      status: "active",
      previousTier: existing.tier,
    };
    saveTiers(tiers);

    return {
      success: true,
      userId: key,
      tier: normalized,
      expiresAt: tiers[key].expiresAt,
    };
  });
}

export async function expireInventoryTier(userId) {
  const key = formatUserKey(userId);
  return withTierLock(key, async () => {
    const tiers = getTiers();
    const record = tiers[key];
    if (!record) return { success: true, changed: false };

    if (record.expiresAt && Number(record.expiresAt) <= getNow()) {
      const config = getConfig();
      record.previousTier = record.tier;
      record.tier = config.defaultTier || "BASIC";
      record.status = "expired";
      record.expiredAt = getNow();
      record.expiresAt = null;
      tiers[key] = record;
      saveTiers(tiers);
      return { success: true, changed: true, newTier: record.tier };
    }
    return { success: true, changed: false };
  });
}

/**
 * Check if inventory is over capacity (after tier downgrade).
 * Does NOT auto-delete items.
 */
export async function isOverCapacity(userId) {
  const capacity = await getInventoryCapacity(userId);
  if (capacity === null) return false;
  const usage = await getInventoryUsage(userId);
  return usage.usedSlots > capacity;
}

// Re-export helpers for tests / external modules
export {
  ensureDataFiles,
  getConfig,
  getItemsCatalog,
  formatUserKey,
  normalizeTierName,
};
