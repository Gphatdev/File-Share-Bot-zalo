import { randomUUID } from "node:crypto";
import {
  ensureDataFiles,
  getConfig,
  getSeeds,
  getLands,
  getCrops,
  getMedicines,
  getTools,
  getMarket,
  saveMarket,
  getAchievements,
  getUsers,
  saveUsers,
  safeNumber,
  getSeedById,
  getLandById,
  getCropById,
  getMedicineById,
} from "./storage.js";
import {
  addItem,
  removeItem,
  getInventoryItems,
  canStoreItem,
} from "../Inventory/index.js";
import {
  addExp as addProfileExp,
  unlockAchievement,
  getOrCreateProfile,
} from "../PlayerProfile/index.js";
import { getBalance, addMoney, removeMoney } from "../TienGame/index.js";

const USER_LOCKS = new Map();

export async function withUserLock(userId, task) {
  const key = String(userId);
  const previous = USER_LOCKS.get(key) || Promise.resolve();
  let release;
  const next = new Promise((r) => {
    release = r;
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

function formatUserKey(userId) {
  return String(userId || "").trim();
}

function getNow() {
  return Date.now();
}

const PLOT_STATUS = {
  EMPTY: "empty",
  SEEDED: "seeded",
  GROWING: "growing",
  ALMOST: "almost",
  READY: "ready",
  HARVESTED: "harvested",
};

function createDefaultUser(userId) {
  return {
    userId: formatUserKey(userId),
    farmLevel: 1,
    farmExp: 0,
    lands: [], // { landId, plots, purchasedAt }
    plots: [], // { id, landId, seedId, plantedAt, matureAt, status, effects[], yieldBonus, priceBonus, rarityBoost, harvested }
    totalPlants: 0,
    totalHarvests: 0,
    totalSoldQty: 0,
    totalSoldValue: 0,
    unlockedSeeds: ["seed_lua", "seed_ca_chua"],
    achievements: [],
    title: "novice",
    createdAt: getNow(),
    updatedAt: getNow(),
  };
}

function normalizeUser(raw, userId) {
  const d = createDefaultUser(userId);
  if (!raw || typeof raw !== "object") return d;
  return {
    ...d,
    ...raw,
    userId: formatUserKey(userId),
    farmLevel: Math.max(1, Math.floor(safeNumber(raw.farmLevel, 1))),
    farmExp: Math.max(0, Math.floor(safeNumber(raw.farmExp, 0))),
    lands: Array.isArray(raw.lands) ? raw.lands : [],
    plots: Array.isArray(raw.plots) ? raw.plots : [],
    totalPlants: Math.max(0, Math.floor(safeNumber(raw.totalPlants, 0))),
    totalHarvests: Math.max(0, Math.floor(safeNumber(raw.totalHarvests, 0))),
    totalSoldQty: Math.max(0, Math.floor(safeNumber(raw.totalSoldQty, 0))),
    totalSoldValue: Math.max(0, Math.floor(safeNumber(raw.totalSoldValue, 0))),
    unlockedSeeds: Array.isArray(raw.unlockedSeeds) ? raw.unlockedSeeds : d.unlockedSeeds,
    achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
  };
}

export function expRequiredForFarmLevel(level, config = null) {
  const cfg = config || getConfig();
  const lv = Math.max(1, Math.floor(safeNumber(level, 1)));
  const maxLv = safeNumber(cfg.maxLevel, 50);
  if (lv >= maxLv) return 0;
  return Math.max(
    1,
    Math.floor(safeNumber(cfg.baseExpFarm, 80) * Math.pow(safeNumber(cfg.expGrowthFarm, 1.18), lv - 1))
  );
}

async function loadUser(userId) {
  await ensureDataFiles();
  const users = getUsers();
  const key = formatUserKey(userId);
  return normalizeUser(users[key], key);
}

async function saveUser(user) {
  const users = getUsers();
  user.updatedAt = getNow();
  users[user.userId] = user;
  saveUsers(users);
}

function totalPlots(user) {
  return user.lands.reduce((sum, l) => {
    const def = getLandById(l.landId);
    return sum + (def ? def.plots : safeNumber(l.plots, 0));
  }, 0);
}

function usedPlots(user) {
  return user.plots.filter((p) => p.status !== PLOT_STATUS.EMPTY && p.status !== PLOT_STATUS.HARVESTED).length;
}

function emptySlots(user) {
  return Math.max(0, totalPlots(user) - usedPlots(user));
}

function growthBonusFromLands(user) {
  let max = 0;
  for (const l of user.lands) {
    const def = getLandById(l.landId);
    if (def) max = Math.max(max, safeNumber(def.growthBonus, 0));
  }
  return max;
}

function yieldBonusFromLands(user) {
  let max = 0;
  for (const l of user.lands) {
    const def = getLandById(l.landId);
    if (def) max = Math.max(max, safeNumber(def.yieldBonus, 0));
  }
  return max;
}

function rarityBonusFromLands(user) {
  let max = 0;
  for (const l of user.lands) {
    const def = getLandById(l.landId);
    if (def) max = Math.max(max, safeNumber(def.rarityBonus, 0));
  }
  return max;
}

function updatePlotStatus(plot, now = getNow()) {
  if (!plot || plot.status === PLOT_STATUS.EMPTY || plot.status === PLOT_STATUS.HARVESTED) return plot;
  if (plot.harvested) {
    plot.status = PLOT_STATUS.HARVESTED;
    return plot;
  }
  const matureAt = safeNumber(plot.matureAt, 0);
  const plantedAt = safeNumber(plot.plantedAt, 0);
  const total = Math.max(1, matureAt - plantedAt);
  const elapsed = now - plantedAt;
  const progress = Math.min(1, elapsed / total);
  if (now >= matureAt) {
    plot.status = PLOT_STATUS.READY;
  } else if (progress >= 0.75) {
    plot.status = PLOT_STATUS.ALMOST;
  } else if (progress >= 0.15) {
    plot.status = PLOT_STATUS.GROWING;
  } else {
    plot.status = PLOT_STATUS.SEEDED;
  }
  return plot;
}

function refreshAllPlots(user) {
  const now = getNow();
  for (const p of user.plots) updatePlotStatus(p, now);
  return user;
}

function getTitle(user) {
  const cfg = getConfig();
  const titles = cfg.titles || [];
  let best = titles[0] || { id: "novice", name: "Nông Dân Tập Sự" };
  for (const t of titles) {
    if (user.farmLevel >= safeNumber(t.minLevel, 1)) best = t;
  }
  return best;
}

function checkAchievements(user) {
  const defs = getAchievements();
  const unlocked = new Set((user.achievements || []).map((a) => a.id || a));
  const newly = [];
  for (const a of defs) {
    if (unlocked.has(a.id)) continue;
    const c = a.condition || {};
    let ok = true;
    if (c.plants != null && user.totalPlants < c.plants) ok = false;
    if (c.harvests != null && user.totalHarvests < c.harvests) ok = false;
    if (c.soldValue != null && user.totalSoldValue < c.soldValue) ok = false;
    if (c.level != null && user.farmLevel < c.level) ok = false;
    if (c.landId && !user.lands.some((l) => l.landId === c.landId)) ok = false;
    if (ok) {
      newly.push(a);
      user.achievements.push({ id: a.id, unlockedAt: getNow() });
    }
  }
  return newly;
}

async function addFarmExp(user, amount) {
  const cfg = getConfig();
  const maxLv = safeNumber(cfg.maxLevel, 50);
  let exp = user.farmExp + Math.max(0, Math.floor(amount));
  let level = user.farmLevel;
  let leveled = false;
  while (level < maxLv) {
    const need = expRequiredForFarmLevel(level, cfg);
    if (exp < need) break;
    exp -= need;
    level += 1;
    leveled = true;
    // unlock seeds by level
    for (const s of getSeeds()) {
      if (s.unlockLevel <= level && !user.unlockedSeeds.includes(s.id)) {
        user.unlockedSeeds.push(s.id);
      }
    }
  }
  user.farmLevel = level;
  user.farmExp = exp;
  user.title = getTitle(user).id;
  return { leveled, level, exp };
}

/** Dụng cụ trong kho: mỗi loại (cuốc / xô / máy tưới) lấy cái tốt nhất đang có. */
export async function getOwnedTools(userId) {
  const invList = await getInventoryItems(userId).catch(() => []);
  const have = new Map((Array.isArray(invList) ? invList : []).map((x) => [x.itemId, safeNumber(x.quantity, 0)]));
  return getTools().filter((t) => (have.get(t.id) || 0) > 0);
}

export function toolBonusesFrom(owned) {
  const best = {};
  for (const t of owned || []) {
    const v = safeNumber(t.effect?.growthBonus, 0) + safeNumber(t.effect?.yieldBonus, 0);
    if (!best[t.type] || v > safeNumber(best[t.type].effect?.growthBonus, 0) + safeNumber(best[t.type].effect?.yieldBonus, 0)) best[t.type] = t;
  }
  let growth = 0;
  let yieldB = 0;
  for (const t of Object.values(best)) {
    growth += safeNumber(t.effect?.growthBonus, 0);
    yieldB += safeNumber(t.effect?.yieldBonus, 0);
  }
  return { growth, yield: yieldB, best: Object.values(best) };
}

const MAX_GROWTH_BONUS = 0.6; // đất + dụng cụ cộng dồn tối đa 60% thời gian

function cropItemId(seedId) {
  return seedId.replace("seed_", "crop_");
}

function seedItemId(seedId) {
  return seedId; // inventory uses same id
}

/** Public API */

export async function getFarmUser(userId) {
  return withUserLock(userId, async () => {
    let user = await loadUser(userId);
    user = refreshAllPlots(user);
    await saveUser(user);
    return user;
  });
}

export async function getFarmOverview(userId, opts = {}) {
  return withUserLock(userId, async () => {
    let user = await loadUser(userId);
    user = refreshAllPlots(user);
    await saveUser(user);
    const balance = await getBalance(userId).catch(() => 0);
    const inv = await getInventoryItems(userId).catch(() => []);
    const cropValue = estimateCropValue(user, inv);
    const ready = user.plots.filter((p) => p.status === PLOT_STATUS.READY).length;
    const growing = user.plots.filter(
      (p) =>
        p.status === PLOT_STATUS.SEEDED ||
        p.status === PLOT_STATUS.GROWING ||
        p.status === PLOT_STATUS.ALMOST
    ).length;
    return {
      user,
      displayName: opts.displayName || "Người chơi",
      avatarPath: opts.avatarPath || null,
      balance: safeNumber(balance, 0),
      totalPlots: totalPlots(user),
      usedPlots: usedPlots(user),
      emptySlots: emptySlots(user),
      readyCount: ready,
      growingCount: growing,
      cropValue,
      title: getTitle(user),
      expRequired: expRequiredForFarmLevel(user.farmLevel),
      lands: user.lands.map((l) => ({ ...l, def: getLandById(l.landId) })),
      tools: await getOwnedTools(userId),
    };
  });
}

function estimateCropValue(_user, invList) {
  const market = getMarketMultipliers();
  let total = 0;
  const list = Array.isArray(invList) ? invList : [];
  for (const it of list) {
    const id = it.itemId || it.id;
    if (!id || !String(id).startsWith("crop_")) continue;
    const crop = getCropById(id);
    if (!crop) continue;
    const qty = safeNumber(it.quantity, 0);
    const mult = market[id] || 1;
    total += qty * crop.baseSellPrice * mult;
  }
  return Math.floor(total);
}

export function getMarketMultipliers() {
  const m = getMarket();
  const now = getNow();
  if (now - safeNumber(m.lastRefresh, 0) > safeNumber(m.refreshIntervalMs, 1800000)) {
    const mults = {};
    for (const c of getCrops()) {
      const min = safeNumber(m.priceVarianceMin, 0.9);
      const max = safeNumber(m.priceVarianceMax, 1.15);
      mults[c.id] = +(min + Math.random() * (max - min)).toFixed(3);
    }
    m.multipliers = mults;
    m.lastRefresh = now;
    saveMarket(m);
  }
  return m.multipliers || {};
}

export async function buyLand(userId, landId) {
  return withUserLock(userId, async () => {
    const land = getLandById(landId);
    if (!land) return { ok: false, error: "Loại đất không tồn tại." };
    let user = await loadUser(userId);
    if (user.farmLevel < land.unlockLevel) {
      return { ok: false, error: `Cần cấp nông nghiệp ${land.unlockLevel} để mua đất này.` };
    }
    const bal = await getBalance(userId);
    if (bal < land.price) {
      return { ok: false, error: `Không đủ tiền. Cần ${land.price.toLocaleString("vi-VN")} xu, bạn có ${bal.toLocaleString("vi-VN")} xu.` };
    }
    const maxPlots = getConfig().maxPlotsPerPlayer || 48;
    if (totalPlots(user) + land.plots > maxPlots) {
      return { ok: false, error: `Vượt giới hạn ${maxPlots} ô đất.` };
    }
    try {
      await removeMoney(userId, land.price, {
        description: `Mua đất ${land.name}`,
        type: "FARM_BUY_LAND",
      });
    } catch (e) {
      return { ok: false, error: e?.message || "Trừ tiền thất bại." };
    }
    user.lands.push({
      landId: land.id,
      plots: land.plots,
      purchasedAt: getNow(),
    });
    const newly = checkAchievements(user);
    await saveUser(user);
    return {
      ok: true,
      land,
      totalPlots: totalPlots(user),
      balance: await getBalance(userId),
      achievements: newly,
    };
  });
}

export async function getOwnedSeeds(userId) {
  const invList = await getInventoryItems(userId).catch(() => []);
  const byId = {};
  for (const it of invList) {
    byId[it.itemId] = it.quantity;
  }
  const seeds = getSeeds();
  const result = [];
  for (const s of seeds) {
    const qty = safeNumber(byId[s.id], 0);
    if (qty > 0) result.push({ ...s, quantity: qty });
  }
  return result;
}

export async function plantSeeds(userId, seedId, quantity = 1) {
  return withUserLock(userId, async () => {
    const seed = getSeedById(seedId);
    if (!seed) return { ok: false, error: "Hạt giống không tồn tại." };
    let user = await loadUser(userId);
    user = refreshAllPlots(user);
    if (totalPlots(user) <= 0) {
      return { ok: false, error: "Bạn chưa có đất trồng. Dùng .nongtrai muadat để mua đất." };
    }
    if (user.farmLevel < seed.unlockLevel) {
      return { ok: false, error: `Cần cấp nông nghiệp ${seed.unlockLevel} để trồng ${seed.name}.` };
    }
    const qty = Math.max(1, Math.floor(safeNumber(quantity, 1)));
    const slots = emptySlots(user);
    if (slots <= 0) return { ok: false, error: "Không còn ô đất trống." };
    if (qty > slots) return { ok: false, error: `Chỉ còn ${slots} ô đất trống.` };

    const invList = await getInventoryItems(userId).catch(() => []);
    const have = safeNumber(invList.find((x) => x.itemId === seedId)?.quantity, 0);
    if (have < qty) {
      return { ok: false, error: `Không đủ hạt giống. Bạn có ${have}, cần ${qty}. Mua tại .shop` };
    }

    const removed = await removeItem(userId, seedId, qty);
    if (!removed?.success) {
      return { ok: false, error: removed?.error || "Trừ hạt giống thất bại." };
    }

    const tools = toolBonusesFrom(await getOwnedTools(userId));
    const gBonus = Math.min(MAX_GROWTH_BONUS, growthBonusFromLands(user) + tools.growth);
    const now = getNow();
    const planted = [];
    for (let i = 0; i < qty; i++) {
      const growMs = Math.floor(seed.growTimeMs * (1 - gBonus));
      const plot = {
        id: randomUUID().slice(0, 8),
        landId: user.lands[0]?.landId || "land_basic",
        seedId: seed.id,
        plantedAt: now,
        matureAt: now + Math.max(1000, growMs),
        status: PLOT_STATUS.SEEDED,
        effects: [],
        yieldBonus: 0,
        priceBonus: 0,
        rarityBoost: 0,
        harvested: false,
      };
      user.plots.push(plot);
      planted.push(plot);
    }
    user.totalPlants += qty;
    await addFarmExp(user, seed.expOnPlant * qty);
    const newly = checkAchievements(user);
    await saveUser(user);
    try {
      await addProfileExp(userId, Math.floor(seed.expOnPlant * qty * 0.3));
    } catch {
      /* optional */
    }
    return {
      ok: true,
      seed,
      quantity: qty,
      plots: planted,
      emptySlots: emptySlots(user),
      farmLevel: user.farmLevel,
      achievements: newly,
    };
  });
}

export async function harvestPlots(userId, plotIds = null) {
  return withUserLock(userId, async () => {
    let user = await loadUser(userId);
    user = refreshAllPlots(user);
    const ready = user.plots.filter((p) => p.status === PLOT_STATUS.READY && !p.harvested);
    if (ready.length === 0) return { ok: false, error: "Không có cây nào sẵn sàng thu hoạch." };

    let targets = ready;
    if (Array.isArray(plotIds) && plotIds.length > 0) {
      const set = new Set(plotIds.map(String));
      targets = ready.filter((p) => set.has(String(p.id)));
      if (targets.length === 0) return { ok: false, error: "Không tìm thấy ô đất hợp lệ để thu hoạch." };
    }

    const results = [];
    let totalExp = 0;
    const yLand = yieldBonusFromLands(user) + toolBonusesFrom(await getOwnedTools(userId)).yield;
    const rLand = rarityBonusFromLands(user);

    for (const plot of targets) {
      if (plot.harvested) continue;
      const seed = getSeedById(plot.seedId);
      if (!seed) continue;

      let yMin = seed.yieldMin;
      let yMax = seed.yieldMax;
      const yBonus = yLand + safeNumber(plot.yieldBonus, 0);
      yMin = Math.max(1, Math.floor(yMin * (1 + yBonus)));
      yMax = Math.max(yMin, Math.floor(yMax * (1 + yBonus)));
      const qty = yMin + Math.floor(Math.random() * (yMax - yMin + 1));

      let rarity = seed.rarity;
      const rarityBoost = safeNumber(plot.rarityBoost, 0) + rLand;
      if (rarityBoost > 0 && Math.random() < rarityBoost) {
        rarity = upgradeRarity(rarity);
      }
      // effects from medicines
      for (const ef of plot.effects || []) {
        if (ef.type === "rarityUp") rarity = upgradeRarity(rarity, ef.maxRarity);
        if (ef.type === "golden") plot.priceBonus = (plot.priceBonus || 0) + 0.5;
      }

      const itemId = cropItemId(seed.id);
      const can = await canStoreItem(userId, itemId, qty).catch(() => ({ ok: true }));
      if (can && can.ok === false) {
        results.push({ plotId: plot.id, error: "Kho đầy, không thể nhận nông sản." });
        continue;
      }
      await addItem(userId, itemId, qty, {
        name: seed.name.replace("Hạt ", ""),
        rarity,
        meta: {
          seedId: seed.id,
          priceBonus: plot.priceBonus || 0,
          visual: (plot.effects || []).find((e) => e.visual)?.visual || null,
          harvestedAt: getNow(),
        },
      });

      plot.harvested = true;
      plot.status = PLOT_STATUS.HARVESTED;
      const exp = seed.expOnHarvest;
      totalExp += exp;
      results.push({
        plotId: plot.id,
        seedId: seed.id,
        name: seed.name.replace("Hạt ", ""),
        quantity: qty,
        rarity,
        icon: seed.icon,
        exp,
        priceBonus: plot.priceBonus || 0,
      });
    }

    // remove harvested plots to free slots
    user.plots = user.plots.filter((p) => !p.harvested);
    user.totalHarvests += results.filter((r) => !r.error).length;
    const expResult = await addFarmExp(user, totalExp);
    const newly = checkAchievements(user);
    await saveUser(user);
    try {
      await addProfileExp(userId, Math.floor(totalExp * 0.3));
    } catch {
      /* optional */
    }
    return {
      ok: true,
      results,
      totalExp,
      farmLevel: user.farmLevel,
      leveled: expResult.leveled,
      emptySlots: emptySlots(user),
      achievements: newly,
    };
  });
}

function upgradeRarity(current, maxRarity = "legendary") {
  const order = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
  const maxIdx = order.indexOf(maxRarity);
  const idx = order.indexOf(current);
  if (idx < 0) return current;
  const next = Math.min(idx + 1, maxIdx >= 0 ? maxIdx : order.length - 1);
  return order[next];
}

export async function getSellableCrops(userId) {
  const invList = await getInventoryItems(userId).catch(() => []);
  const mults = getMarketMultipliers();
  const list = [];
  for (const it of invList) {
    const id = it.itemId;
    if (!id || !String(id).startsWith("crop_")) continue;
    const crop = getCropById(id);
    if (!crop) continue;
    const qty = safeNumber(it.quantity, 0);
    if (qty <= 0) continue;
    const mult = mults[id] || 1;
    const unitPrice = Math.floor(crop.baseSellPrice * mult);
    list.push({
      id,
      name: crop.name,
      quantity: qty,
      basePrice: crop.baseSellPrice,
      unitPrice,
      totalValue: unitPrice * qty,
      rarity: crop.rarity,
      icon: crop.icon,
      color: crop.color,
      mult,
    });
  }
  return list.sort((a, b) => b.totalValue - a.totalValue);
}

export async function sellCrops(userId, cropId, quantity) {
  return withUserLock(userId, async () => {
    const list = await getSellableCrops(userId);
    if (cropId === "all" || cropId === "ALL") {
      if (list.length === 0) return { ok: false, error: "Kho nông sản trống." };
      let totalMoney = 0;
      const sold = [];
      for (const item of list) {
        const removed = await removeItem(userId, item.id, item.quantity);
        if (!removed?.success) continue;
        const money = item.unitPrice * item.quantity;
        await addMoney(userId, money, {
          description: `Bán nông sản ${item.name}`,
          type: "FARM_SELL",
        });
        totalMoney += money;
        sold.push({ ...item, soldQty: item.quantity, money });
      }
      if (sold.length === 0) return { ok: false, error: "Không bán được sản phẩm nào." };
      let user = await loadUser(userId);
      user.totalSoldQty += sold.reduce((s, x) => s + x.soldQty, 0);
      user.totalSoldValue += totalMoney;
      const newly = checkAchievements(user);
      await saveUser(user);
      return {
        ok: true,
        sold,
        totalMoney,
        balance: await getBalance(userId),
        achievements: newly,
      };
    }

    const item = list.find((x) => x.id === cropId);
    if (!item) return { ok: false, error: "Không tìm thấy nông sản trong kho." };
    const qty = Math.max(1, Math.floor(safeNumber(quantity, item.quantity)));
    if (qty > item.quantity) {
      return { ok: false, error: `Bạn chỉ có ${item.quantity} ${item.name}.` };
    }
    const removed = await removeItem(userId, item.id, qty);
    if (!removed?.success) {
      return { ok: false, error: removed?.error || "Trừ kho thất bại." };
    }
    const money = item.unitPrice * qty;
    await addMoney(userId, money, {
      description: `Bán nông sản ${item.name}`,
      type: "FARM_SELL",
    });
    let user = await loadUser(userId);
    user.totalSoldQty += qty;
    user.totalSoldValue += money;
    const newly = checkAchievements(user);
    await saveUser(user);
    return {
      ok: true,
      sold: [{ ...item, soldQty: qty, money }],
      totalMoney: money,
      balance: await getBalance(userId),
      achievements: newly,
    };
  });
}

export async function useMedicine(userId, medicineId, plotId = null) {
  return withUserLock(userId, async () => {
    const med = getMedicineById(medicineId);
    if (!med) return { ok: false, error: "Thuốc không tồn tại." };
    let user = await loadUser(userId);
    user = refreshAllPlots(user);

    const invList = await getInventoryItems(userId).catch(() => []);
    const have = safeNumber(invList.find((x) => x.itemId === medicineId)?.quantity, 0);
    if (have < 1) return { ok: false, error: "Bạn không có thuốc này." };

    const active = user.plots.filter(
      (p) =>
        !p.harvested &&
        p.status !== PLOT_STATUS.EMPTY &&
        p.status !== PLOT_STATUS.HARVESTED &&
        p.status !== PLOT_STATUS.READY
    );

    if (med.effect?.target === "all") {
      if (active.length === 0) return { ok: false, error: "Không có cây đang phát triển để dùng thuốc." };
      await removeItem(userId, medicineId, 1);
      for (const plot of active) {
        applyMedicineToPlot(plot, med);
      }
      await saveUser(user);
      return { ok: true, medicine: med, affected: active.length, mode: "all" };
    }

    // single target
    let plot = null;
    if (plotId) {
      plot = user.plots.find((p) => String(p.id) === String(plotId));
    } else if (active.length === 1) {
      plot = active[0];
    }
    if (!plot) {
      return {
        ok: false,
        error: "Cần chọn ô đất. Reply số thứ tự ô đất đang trồng.",
        needPlot: true,
        plots: active,
      };
    }
    if (plot.harvested || plot.status === PLOT_STATUS.READY) {
      return { ok: false, error: "Không thể dùng thuốc tăng trưởng lên cây đã sẵn sàng thu hoạch." };
    }
    // prevent stacking x2money infinitely
    if (med.type === "x2money") {
      const has = (plot.effects || []).some((e) => e.type === "x2money");
      if (has) return { ok: false, error: "Cây này đã có hiệu ứng x2 tiền." };
    }

    await removeItem(userId, medicineId, 1);
    applyMedicineToPlot(plot, med);
    updatePlotStatus(plot);
    await saveUser(user);
    return { ok: true, medicine: med, plot, mode: "single" };
  });
}

function applyMedicineToPlot(plot, med) {
  const now = getNow();
  if (med.type === "growth") {
    const reduce = safeNumber(med.effect?.reducePercent, 0.2);
    const remaining = Math.max(0, plot.matureAt - now);
    const newRemaining = Math.floor(remaining * (1 - reduce));
    plot.matureAt = now + Math.max(1000, newRemaining);
    plot.effects = plot.effects || [];
    plot.effects.push({ type: "growth", reduce, at: now });
  } else if (med.type === "x2money") {
    plot.priceBonus = (plot.priceBonus || 0) + (safeNumber(med.effect?.multiplier, 2) - 1);
    plot.effects = plot.effects || [];
    plot.effects.push({ type: "x2money", at: now });
  } else if (med.type === "special") {
    if (med.effect?.rarityUp) {
      plot.rarityBoost = (plot.rarityBoost || 0) + 1;
      plot.effects = plot.effects || [];
      plot.effects.push({ type: "rarityUp", maxRarity: med.effect.maxRarity || "epic", at: now });
    }
    if (med.effect?.priceBonus) {
      plot.priceBonus = (plot.priceBonus || 0) + med.effect.priceBonus;
    }
    if (med.effect?.visual) {
      plot.effects = plot.effects || [];
      plot.effects.push({ type: "visual", visual: med.effect.visual, at: now });
    }
  }
}

export async function getPlotList(userId) {
  return withUserLock(userId, async () => {
    let user = await loadUser(userId);
    user = refreshAllPlots(user);
    await saveUser(user);
    const now = getNow();
    return user.plots.map((p) => {
      const seed = getSeedById(p.seedId);
      const total = Math.max(1, p.matureAt - p.plantedAt);
      const progress = Math.min(1, Math.max(0, (now - p.plantedAt) / total));
      return {
        ...p,
        seed,
        progress,
        remainingMs: Math.max(0, p.matureAt - now),
        progressPercent: Math.floor(progress * 100),
      };
    });
  });
}

export {
  PLOT_STATUS,
  totalPlots,
  emptySlots,
  usedPlots,
  getTitle,
  expRequiredForFarmLevel as expRequired,
  getSeeds,
  getLands,
  getMedicines,
  getTools,
  getCrops,
  getSeedById,
  getLandById,
  getMedicineById,
};
