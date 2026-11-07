import { randomUUID } from "node:crypto";
import {
  ensureDataFiles, getConfig, getFishList, getMaps, getRods, getBaits,
  getUsers, saveUsers, safeNumber, resolveFishImage, FISH_IMG_DIR,
} from "./storage.js";
import { addItem, removeItem, getInventoryItems, canStoreItem } from "../Inventory/index.js";
import {
  addExp as addProfileExp,
  unlockAchievement,
  getOrCreateProfile,
  expRequiredForLevel as profileExpRequired,
} from "../PlayerProfile/index.js";

const USER_LOCKS = new Map();
const COOLDOWNS = new Map();

export async function withUserLock(userId, task) {
  const key = String(userId);
  const previous = USER_LOCKS.get(key) || Promise.resolve();
  let release;
  const next = new Promise((r) => { release = r; });
  USER_LOCKS.set(key, next);
  await previous;
  try { return await task(); }
  finally { if (USER_LOCKS.get(key) === next) USER_LOCKS.delete(key); release(); }
}

function formatUserKey(userId) { return String(userId || "").trim(); }
function getNow() { return Date.now(); }

function createDefaultUser(userId) {
  const cfg = getConfig();
  return {
    userId: formatUserKey(userId), fishingLevel: 1, fishingExp: 0,
    equippedRod: cfg.defaultRodId, equippedBait: cfg.defaultBaitId,
    currentMap: cfg.defaultMapId, totalCaught: 0, totalSize: 0,
    totalSoldValue: 0, totalFails: 0, lastCatchAt: 0,
    createdAt: getNow(), updatedAt: getNow(),
  };
}

export function normalizeUserRecord(raw, userId) { return normalizeUser(raw, userId); }

function normalizeUser(raw, userId) {
  const d = createDefaultUser(userId);
  if (!raw || typeof raw !== "object") return d;
  return {
    ...d, ...raw, userId: formatUserKey(userId),
    fishingLevel: Math.max(1, Math.floor(safeNumber(raw.fishingLevel, 1))),
    fishingExp: Math.max(0, Math.floor(safeNumber(raw.fishingExp, 0))),
    totalCaught: Math.max(0, Math.floor(safeNumber(raw.totalCaught, 0))),
    totalSize: Math.max(0, safeNumber(raw.totalSize, 0)),
    totalSoldValue: Math.max(0, Math.floor(safeNumber(raw.totalSoldValue, 0))),
    totalFails: Math.max(0, Math.floor(safeNumber(raw.totalFails, 0))),
  };
}

export function expRequiredForFishingLevel(level, config = null) {
  const cfg = config || getConfig();
  const lv = Math.max(1, Math.floor(safeNumber(level, 1)));
  const maxLv = safeNumber(cfg.maxLevel, 50);
  if (lv >= maxLv) return 0;
  return Math.max(1, Math.floor(safeNumber(cfg.baseExpFishing, 100) * Math.pow(safeNumber(cfg.expGrowthFishing, 1.2), lv - 1)));
}

export async function ensureUser(userId) {
  ensureDataFiles();
  const key = formatUserKey(userId);
  return withUserLock(key, async () => {
    const users = getUsers();
    if (!users[key]) { users[key] = createDefaultUser(key); saveUsers(users); }
    else { users[key] = normalizeUser(users[key], key); saveUsers(users); }
    return users[key];
  });
}

export async function getUser(userId) { return ensureUser(userId); }

function getUserUnlocked(userId) {
  const key = formatUserKey(userId);
  const users = getUsers();
  if (!users[key]) { users[key] = createDefaultUser(key); saveUsers(users); }
  return normalizeUser(users[key], key);
}

async function getProfileLevelInfo(userId) {
  try {
    const profile = await getOrCreateProfile(userId);
    const level = profile.level || 1;
    const exp = profile.exp || 0;
    return { level, exp, expRequired: profileExpRequired(level) };
  } catch { return { level: 1, exp: 0, expRequired: 100 }; }
}

const FISHING_ACHIEVEMENTS = {
  top1: { id: "cauca_vua_cau_ca", name: "Vua câu cá", description: "Đạt Top 1 bảng xếp hạng Cần Thủ", icon: "👑" },
  top2: { id: "cauca_can_thu_chuyen_nghiep", name: "Cần thủ chuyên nghiệp", description: "Đạt Top 2 bảng xếp hạng Cần Thủ", icon: "🎣" },
};

export async function checkFishingAchievements(userId) {
  try {
    const list = await getRankList(2);
    if (!list.length) return [];
    const unlocked = [];
    if (list[0] && String(list[0].userId) === String(userId)) {
      const r = await unlockAchievement(userId, FISHING_ACHIEVEMENTS.top1);
      if (r.success && !r.already) unlocked.push(FISHING_ACHIEVEMENTS.top1);
    }
    if (list[1] && String(list[1].userId) === String(userId)) {
      const r = await unlockAchievement(userId, FISHING_ACHIEVEMENTS.top2);
      if (r.success && !r.already) unlocked.push(FISHING_ACHIEVEMENTS.top2);
    }
    return unlocked;
  } catch (e) { console.error("[cauca] achievements:", e?.message); return []; }
}

export function getRodById(id) { return getRods().find((r) => r.id === id) || null; }
export function getBaitById(id) { return getBaits().find((b) => b.id === id) || null; }
export function getMapById(id) { return getMaps().find((m) => m.id === id) || null; }
export function getFishById(id) { return getFishList().find((f) => f.id === id) || null; }
export function getAllMapsSorted() { return [...getMaps()].sort((a, b) => (a.order || 0) - (b.order || 0)); }

async function getItemQty(userId, itemId) {
  const items = await getInventoryItems(userId);
  const entry = items.find((i) => i.itemId === itemId || i.id === itemId);
  return safeNumber(entry?.quantity, 0);
}

export async function ensureDefaults(userId) {
  const cfg = getConfig();
  const key = formatUserKey(userId);
  await ensureUser(key);
  if ((await getItemQty(key, cfg.defaultRodId)) < 1)
    await addItem(key, cfg.defaultRodId, 1, { meta: { source: "cauca_default", type: "rod" } });
  if ((await getItemQty(key, cfg.defaultBaitId)) < 1)
    await addItem(key, cfg.defaultBaitId, cfg.defaultBaitAmount || 9, { meta: { source: "cauca_default", type: "bait" } });
  const user = await getUser(key);
  const users = getUsers();
  let changed = false;
  if ((await getItemQty(key, user.equippedRod || cfg.defaultRodId)) < 1) { user.equippedRod = cfg.defaultRodId; changed = true; }
  if ((await getItemQty(key, user.equippedBait || cfg.defaultBaitId)) < 1) { user.equippedBait = cfg.defaultBaitId; changed = true; }
  if (changed) { user.updatedAt = getNow(); users[key] = user; saveUsers(users); }
  return users[key] || user;
}

export async function setEquippedRod(userId, rodId) {
  const key = formatUserKey(userId);
  return withUserLock(key, async () => {
    const rod = getRodById(rodId);
    if (!rod) return { success: false, error: "Cần câu không tồn tại." };
    if ((await getItemQty(key, rodId)) < 1) return { success: false, error: "Bạn không sở hữu cần câu này." };
    const users = getUsers();
    const user = normalizeUser(users[key], key);
    user.equippedRod = rodId; user.updatedAt = getNow();
    users[key] = user; saveUsers(users);
    return { success: true, rod };
  });
}

export async function setEquippedBait(userId, baitId) {
  const key = formatUserKey(userId);
  return withUserLock(key, async () => {
    const bait = getBaitById(baitId);
    if (!bait) return { success: false, error: "Mồi không tồn tại." };
    if ((await getItemQty(key, baitId)) < 1) return { success: false, error: "Bạn không có mồi này." };
    const users = getUsers();
    const user = normalizeUser(users[key], key);
    user.equippedBait = baitId; user.updatedAt = getNow();
    users[key] = user; saveUsers(users);
    return { success: true, bait };
  });
}

export async function setMap(userId, mapId) {
  const key = formatUserKey(userId);
  return withUserLock(key, async () => {
    const map = getMapById(mapId);
    if (!map) return { success: false, error: "Vị trí không tồn tại." };
    const pInfo = await getProfileLevelInfo(key);
    if (pInfo.level < (map.requiredLevel || 1))
      return { success: false, error: `Cần Level ${map.requiredLevel} để đến ${map.name}. (Hiện tại: Lv.${pInfo.level})` };
    if (map.requiredRod && (await getItemQty(key, map.requiredRod)) < 1) {
      const rod = getRodById(map.requiredRod);
      return { success: false, error: `Cần sở hữu ${rod?.name || map.requiredRod} để đến ${map.name}.` };
    }
    const users = getUsers();
    const u = normalizeUser(users[key], key);
    u.currentMap = mapId; u.updatedAt = getNow();
    users[key] = u; saveUsers(users);
    return { success: true, map };
  });
}

function weightedPick(entries) {
  const total = entries.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (total <= 0) return entries[0]?.item || null;
  let r = Math.random() * total;
  for (const e of entries) { r -= Math.max(0, e.weight); if (r <= 0) return e.item; }
  return entries[entries.length - 1]?.item || null;
}

function computeRarityWeights(base, mapBias, rodB, baitB) {
  const out = {};
  for (const r of ["common","uncommon","rare","epic","legendary","mythic"])
    out[r] = Math.max(0, safeNumber(base[r],0)*safeNumber(mapBias?.[r],1)*safeNumber(rodB?.[r],1)*safeNumber(baitB?.[r],1));
  return out;
}

function randomSize(fish, mult=1) {
  const min = safeNumber(fish.minSize,10), max = safeNumber(fish.maxSize,50);
  return Math.max(1, Math.round((min+Math.random()*(max-min))*mult*10)/10);
}

function computePrice(fish, size, mult=1) {
  const minP = safeNumber(fish.minPrice, fish.basePrice||50);
  const maxP = safeNumber(fish.maxPrice, (fish.basePrice||50)*2);
  const minS = safeNumber(fish.minSize,10), maxS = safeNumber(fish.maxSize,50);
  const t = maxS > minS ? (size-minS)/(maxS-minS) : 0.5;
  return Math.max(1, Math.floor((minP + t*(maxP-minP))*mult));
}

export function checkCooldown(userId) {
  const cfg = getConfig();
  const key = formatUserKey(userId);
  const remain = (COOLDOWNS.get(key)||0) + cfg.cooldownMs - Date.now();
  if (remain > 0) return { ok: false, remainMs: remain };
  return { ok: true };
}
export function setCooldown(userId) { COOLDOWNS.set(formatUserKey(userId), Date.now()); }

export async function doFish(userId, displayName = "Người chơi") {
  const cfg = getConfig();
  if (!cfg.enabled) return { success: false, error: "Tính năng câu cá đang tắt." };
  const key = formatUserKey(userId);
  const cd = checkCooldown(key);
  if (!cd.ok) return { success: false, error: `⏳ Đợi ${Math.ceil(cd.remainMs/1000)}s trước khi câu tiếp.`, code: "COOLDOWN" };

  await ensureDefaults(key);

  return withUserLock(key, async () => {
    const user = getUserUnlocked(key);
    const rod = getRodById(user.equippedRod || cfg.defaultRodId) || getRodById(cfg.defaultRodId);
    const bait = getBaitById(user.equippedBait || cfg.defaultBaitId) || getBaitById(cfg.defaultBaitId);
    const map = getMapById(user.currentMap || cfg.defaultMapId) || getMapById(cfg.defaultMapId);
    if (!rod || !bait || !map) return { success: false, error: "Dữ liệu cần/mồi/map lỗi." };
    if ((await getItemQty(key, rod.id)) < 1) return { success: false, error: `Bạn không có ${rod.name}. Hãy mua trong .shop` };
    const baitQty = await getItemQty(key, bait.id);
    if (baitQty < 1) return { success: false, error: `❌ BẠN ĐÃ HẾT MỒI\n\n🪱 Mồi hiện tại: 0\n\nHãy mua thêm mồi trong Shop (.shop).`, code: "NO_BAIT" };
    const pInfoBefore = await getProfileLevelInfo(key);
    if (pInfoBefore.level < (map.requiredLevel || 1))
      return { success: false, error: `Cần Level ${map.requiredLevel} để câu tại ${map.name}. (Hiện tại: Lv.${pInfoBefore.level})` };

    const removeRes = await removeItem(key, bait.id, 1, { force: true });
    if (!removeRes.success) return { success: false, error: `❌ BẠN ĐÃ HẾT MỒI\n\nHãy mua thêm mồi trong Shop.`, code: "NO_BAIT" };
    setCooldown(key);

    if (Math.random() > cfg.successRate) {
      const users = getUsers();
      const u = normalizeUser(users[key], key);
      u.totalFails = (u.totalFails||0)+1; u.lastCatchAt = getNow(); u.updatedAt = getNow();
      users[key] = u; saveUsers(users);
      return { success: true, caught: false, baitConsumed: bait.name, baitId: bait.id, rod, bait, map, user: u, message: "Cá đã thoát mất!" };
    }

    const allFish = getFishList();
    const poolIds = new Set(map.fishPool || []);
    let candidates = allFish.filter((f) => poolIds.has(f.id));
    if (!candidates.length) candidates = allFish.filter((f) => (f.locations||[]).includes(map.id));
    if (!candidates.length) candidates = allFish.filter((f) => f.rarity === "common");
    candidates = candidates.filter((f) => {
      if (f.requiredRod) { const req = getRodById(f.requiredRod); if (req && rod.tier < req.tier) return false; }
      if (f.requiredBait) { const reqB = getBaitById(f.requiredBait); if (reqB && bait.tier < reqB.tier) return false; }
      return true;
    });
    if (!candidates.length) candidates = allFish.filter((f) => f.rarity === "common");

    const weights = computeRarityWeights(cfg.rarityWeights, map.rarityBias, rod.rarityBonus, bait.rarityBonus);
    const byRarity = {};
    for (const f of candidates) { const r = f.rarity||"common"; (byRarity[r] ||= []).push(f); }
    const chosenRarity = weightedPick(Object.keys(byRarity).map((r) => ({ item: r, weight: weights[r]||0 }))) || "common";
    const fishList = byRarity[chosenRarity] || byRarity.common || candidates;
    const fish = fishList[Math.floor(Math.random()*fishList.length)];

    const sizeMult = (map.bonus?.sizeMult||1)*(rod.sizeBonus||1)*(bait.sizeBonus||1);
    const priceMult = (map.bonus?.priceMult||1)*(rod.priceBonus||1)*(bait.priceBonus||1)*(cfg.sizePriceFactor||1);
    const size = randomSize(fish, sizeMult);
    const price = computePrice(fish, size, priceMult);

    const sizeTag = String(size).replace(".", "_");
    const uniqueId = `${fish.id}_${sizeTag}cm_${randomUUID().slice(0,6)}`;
    const invCheck = await canStoreItem(key, uniqueId, 1);
    if (!invCheck.ok) {
      await addItem(key, bait.id, 1, { meta: { source: "cauca_refund" } });
      return { success: false, error: `🎒 Balo đã đầy! Không thể lưu cá.\n${invCheck.reason||""}`, code: "INVENTORY_FULL" };
    }

    await addItem(key, uniqueId, 1, {
      meta: { type:"caught_fish", fishId:fish.id, fishName:fish.name, size, price, rarity:fish.rarity,
        location:map.id, locationName:map.name, rodId:rod.id, baitId:bait.id, caughtAt:getNow(), icon:fish.icon||"🐟" },
    });

    const expGain = cfg.baseExpPerCatch || 100;
    let profileExpResult = null;
    try { profileExpResult = await addProfileExp(key, expGain, { source: "cauca" }); }
    catch (e) { console.error("[cauca] addProfileExp:", e?.message); }

    const users = getUsers();
    const u = normalizeUser(users[key], key);
    u.totalCaught = (u.totalCaught||0)+1;
    u.totalSize = (u.totalSize||0)+size;
    u.lastCatchAt = getNow(); u.updatedAt = getNow();
    const pLevel = profileExpResult?.level || (await getProfileLevelInfo(key)).level;
    const pExp = profileExpResult?.exp ?? (await getProfileLevelInfo(key)).exp;
    const pExpReq = profileExpResult?.expRequired ?? profileExpRequired(pLevel);
    u.fishingLevel = pLevel; u.fishingExp = pExp;
    users[key] = u; saveUsers(users);

    let newAchievements = [];
    try { newAchievements = await checkFishingAchievements(key); }
    catch (e) { console.error("[cauca] achievements:", e?.message); }

    return {
      success: true, caught: true, fish, size, price, expGain, uniqueId,
      imagePath: resolveFishImage(fish), rod, bait, map, user: u,
      leveledUp: !!profileExpResult?.leveledUp,
      fishingLevel: pLevel, fishingExp: pExp, fishingExpRequired: pExpReq,
      profileExp: profileExpResult, newAchievements,
      baitRemaining: Math.max(0, baitQty-1), displayName,
    };
  });
}

export async function getRankList(limit = 15) {
  ensureDataFiles();
  return Object.values(getUsers())
    .map((u) => normalizeUser(u, u.userId))
    .filter((u) => u.totalCaught > 0 || u.fishingLevel > 1)
    .sort((a, b) => {
      if (b.fishingLevel !== a.fishingLevel) return b.fishingLevel - a.fishingLevel;
      if (b.totalCaught !== a.totalCaught) return b.totalCaught - a.totalCaught;
      if (b.totalSize !== a.totalSize) return b.totalSize - a.totalSize;
      return b.totalSoldValue - a.totalSoldValue;
    })
    .slice(0, limit);
}

export { getConfig, getFishList, getMaps, getRods, getBaits, resolveFishImage, ensureDataFiles, FISH_IMG_DIR };
