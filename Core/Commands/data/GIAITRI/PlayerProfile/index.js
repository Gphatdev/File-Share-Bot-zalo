import fs from "node:fs";
import path from "node:path";
import {
  ensureDataFiles,
  getConfig,
  getProfiles,
  saveProfiles,
  safeNumber,
  AVATARS_DIR,
} from "./storage.js";


async function loadCultivation(userId) {
  try {
    const mod = await import("../Cultivation/index.js");
    const view = await mod.getCultivationView(userId);
    if (!view) return null;
    return {
      realm: view.realmName || null,
      stage: view.stageLabel || null,
      qi: view.qi ?? 0,
      domain: view.domainName || null,
      realmId: view.realmId || null,
    };
  } catch (err) {
    console.error("[hoso cultivation]", err);
    throw err;
  }
}


const USER_LOCKS = new Map();

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

function formatUserKey(userId) {
  return String(userId || "").trim();
}

function getNow() {
  return Date.now();
}

/**
 * EXP required to go from `level` to `level + 1`.
 * Formula: baseExp * (expGrowth ^ (level - 1))
 */
export function expRequiredForLevel(level, config = null) {
  const cfg = config || getConfig();
  const lv = Math.max(1, Math.floor(safeNumber(level, 1)));
  const maxLv = safeNumber(cfg.maxLevel, 100);
  if (lv >= maxLv) return 0;
  const base = safeNumber(cfg.baseExp, 100);
  const growth = safeNumber(cfg.expGrowth, 1.15);
  return Math.max(1, Math.floor(base * Math.pow(growth, lv - 1)));
}

function createDefaultProfile(userId) {
  return {
    userId: formatUserKey(userId),
    customDisplayName: null,
    customAvatar: null,
    level: 1,
    exp: 0,
    totalExp: 0,
    achievements: [],
    statistics: {
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
    },
    rank: null,
    gangId: null,
    gangName: null,
    gangRole: null,
    cultivation: null,
    createdAt: getNow(),
    updatedAt: getNow(),
  };
}

function getLifetimeExp(level, exp, config = getConfig()) {
  const maxLevel = safeNumber(config.maxLevel, 100);
  const currentLevel = Math.min(maxLevel, Math.max(1, Math.floor(safeNumber(level, 1))));
  let total = Math.max(0, Math.floor(safeNumber(exp, 0)));
  for (let current = 1; current < currentLevel; current += 1) {
    total += expRequiredForLevel(current, config);
  }
  return total;
}

function normalizeProfile(raw, userId) {
  const base = createDefaultProfile(userId);
  if (!raw || typeof raw !== "object") return base;
  const level = Math.max(1, Math.floor(safeNumber(raw.level, 1)));
  const exp = Math.max(0, Math.floor(safeNumber(raw.exp, 0)));
  return {
    ...base,
    ...raw,
    userId: formatUserKey(userId),
    level,
    exp,
    totalExp: Math.max(
      0,
      Math.floor(safeNumber(raw.totalExp, getLifetimeExp(level, exp)))
    ),
    achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
    statistics: {
      matchesPlayed: Math.max(0, safeNumber(raw.statistics?.matchesPlayed, 0)),
      wins: Math.max(0, safeNumber(raw.statistics?.wins, 0)),
      losses: Math.max(0, safeNumber(raw.statistics?.losses, 0)),
    },
    customDisplayName:
      typeof raw.customDisplayName === "string" && raw.customDisplayName.trim()
        ? raw.customDisplayName.trim()
        : null,
    customAvatar:
      typeof raw.customAvatar === "string" && raw.customAvatar.trim()
        ? raw.customAvatar.trim()
        : null,
  };
}

export async function getOrCreateProfile(userId) {
  await ensureDataFiles();
  const key = formatUserKey(userId);
  if (!key) throw new Error("UID không hợp lệ");

  return withUserLock(key, async () => {
    const profiles = getProfiles();
    if (!profiles[key]) {
      profiles[key] = createDefaultProfile(key);
      saveProfiles(profiles);
      return normalizeProfile(profiles[key], key);
    }
    const raw = profiles[key];
    const profile = normalizeProfile(raw, key);
    if (!Number.isFinite(Number(raw.totalExp))) {
      profiles[key] = profile;
      saveProfiles(profiles);
    }
    return profile;
  });
}

export async function getTotalExp(userId) {
  const profile = await getOrCreateProfile(userId);
  return profile.totalExp;
}

/**
 * Aggregate profile view for Canvas — does NOT invent rank/gang/cultivation data.
 */
export async function getProfileView(userId, options = {}) {
  const profile = await getOrCreateProfile(userId);
  const config = getConfig();
  const maxLevel = safeNumber(config.maxLevel, 100);
  const level = Math.min(profile.level, maxLevel);
  const exp = profile.exp;
  const required = expRequiredForLevel(level, config);
  const isMaxLevel = level >= maxLevel;
  const progress = isMaxLevel
    ? 1
    : required > 0
      ? Math.min(1, Math.max(0, exp / required))
      : 0;

  const stats = profile.statistics || {};
  const played = safeNumber(stats.matchesPlayed, 0);
  const wins = safeNumber(stats.wins, 0);
  const losses = safeNumber(stats.losses, 0);
  const winRate = played > 0 ? Math.round((wins / played) * 1000) / 10 : null;

  const achievements = Array.isArray(profile.achievements) ? profile.achievements : [];
  const unlocked = achievements.filter((a) => a && (a.unlocked === true || a.unlockedAt));

  return {
    userId: profile.userId,
    customDisplayName: profile.customDisplayName,
    customAvatar: profile.customAvatar,
    zaloName: options.zaloName || null,
    zaloAvatarUrl: options.zaloAvatarUrl || null,
    displayName: profile.customDisplayName || options.zaloName || "Người chơi",
    level,
    exp,
    expRequired: required,
    progress,
    progressPercent: Math.round(progress * 100),
    isMaxLevel,
    maxLevel,
    achievements: unlocked,
    achievementTotal: unlocked.length,
    statistics: {
      matchesPlayed: played,
      wins,
      losses,
      winRate,
      hasData: played > 0 || wins > 0 || losses > 0,
    },
    rank: profile.rank && typeof profile.rank === "object" ? profile.rank : null,
    gang: profile.gangId
      ? {
          id: profile.gangId,
          name: profile.gangName || "Gang",
          role: profile.gangRole || null,
        }
      : null,
    cultivation: config.showCultivation
      ? (await loadCultivation(userId)) || profile.cultivation || null
      : null,
    showRank: config.showRank !== false,
    showGang: config.showGang !== false,
    showAchievements: config.showAchievements !== false,
    showStatistics: config.showStatistics !== false,
    showCultivation: config.showCultivation === true,
  };
}

export async function setCustomDisplayName(userId, name) {
  const config = getConfig();
  const key = formatUserKey(userId);
  if (!key) return { success: false, error: "UID không hợp lệ" };

  let cleaned = String(name || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return { success: false, error: "Tên không được để trống." };
  }
  if (cleaned.length < safeNumber(config.minDisplayNameLength, 2)) {
    return {
      success: false,
      error: `Tên phải có ít nhất ${config.minDisplayNameLength} ký tự.`,
    };
  }
  if (cleaned.length > safeNumber(config.maxDisplayNameLength, 24)) {
    return {
      success: false,
      error: `Tên tối đa ${config.maxDisplayNameLength} ký tự.`,
    };
  }
  // Reject names that are only punctuation / symbols
  if (!/[\p{L}\p{N}]/u.test(cleaned)) {
    return { success: false, error: "Tên phải chứa ít nhất một chữ hoặc số." };
  }

  return withUserLock(key, async () => {
    await ensureDataFiles();
    const profiles = getProfiles();
    const profile = normalizeProfile(profiles[key], key);
    profile.customDisplayName = cleaned;
    profile.updatedAt = getNow();
    profiles[key] = profile;
    saveProfiles(profiles);
    return { success: true, customDisplayName: cleaned };
  });
}

/**
 * Save custom avatar from buffer. Returns relative path stored in profile.
 */
export async function setCustomAvatar(userId, imageBuffer) {
  const config = getConfig();
  const key = formatUserKey(userId);
  if (!key) return { success: false, error: "UID không hợp lệ" };
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    return { success: false, error: "Ảnh không hợp lệ." };
  }
  if (imageBuffer.length > safeNumber(config.maxAvatarBytes, 2 * 1024 * 1024)) {
    return { success: false, error: "Ảnh quá lớn (tối đa 2MB)." };
  }

  // Basic magic-byte check for common image types
  const isPng =
    imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4e;
  const isJpg = imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8;
  const isWebp =
    imageBuffer[0] === 0x52 &&
    imageBuffer[1] === 0x49 &&
    imageBuffer[8] === 0x57 &&
    imageBuffer[9] === 0x45;
  if (!isPng && !isJpg && !isWebp) {
    return { success: false, error: "Chỉ hỗ trợ ảnh PNG, JPG hoặc WEBP." };
  }

  const ext = isPng ? "png" : isWebp ? "webp" : "jpg";
  const fileName = `${key}.${ext}`;
  const filePath = path.join(AVATARS_DIR, fileName);

  return withUserLock(key, async () => {
    await ensureDataFiles();
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
    // Remove old avatar files for this user
    try {
      for (const f of fs.readdirSync(AVATARS_DIR)) {
        if (f.startsWith(`${key}.`)) {
          try {
            fs.unlinkSync(path.join(AVATARS_DIR, f));
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
    fs.writeFileSync(filePath, imageBuffer);

    const profiles = getProfiles();
    const profile = normalizeProfile(profiles[key], key);
    profile.customAvatar = filePath;
    profile.updatedAt = getNow();
    profiles[key] = profile;
    saveProfiles(profiles);
    return { success: true, customAvatar: filePath };
  });
}

export async function clearCustomAvatar(userId) {
  const key = formatUserKey(userId);
  return withUserLock(key, async () => {
    await ensureDataFiles();
    const profiles = getProfiles();
    const profile = normalizeProfile(profiles[key], key);
    if (profile.customAvatar && fs.existsSync(profile.customAvatar)) {
      try {
        fs.unlinkSync(profile.customAvatar);
      } catch {
        /* ignore */
      }
    }
    profile.customAvatar = null;
    profile.updatedAt = getNow();
    profiles[key] = profile;
    saveProfiles(profiles);
    return { success: true };
  });
}

/**
 * Add EXP (for games). Handles level-up. Does not invent achievements.
 */
export async function addExp(userId, amount, options = {}) {
  const qty = Math.floor(safeNumber(amount, 0));
  if (qty <= 0) return { success: false, error: "EXP phải > 0" };
  const key = formatUserKey(userId);
  const config = getConfig();
  const maxLevel = safeNumber(config.maxLevel, 100);

  return withUserLock(key, async () => {
    await ensureDataFiles();
    const profiles = getProfiles();
    const profile = normalizeProfile(profiles[key], key);
    profile.totalExp += qty;
    if (profile.level >= maxLevel) {
      profile.updatedAt = getNow();
      profiles[key] = profile;
      saveProfiles(profiles);
      return {
        success: true,
        leveledUp: false,
        level: profile.level,
        exp: profile.exp,
        totalExp: profile.totalExp,
        atMax: true,
        source: options.source || null,
      };
    }

    let level = profile.level;
    let exp = profile.exp + qty;
    let leveledUp = false;

    while (level < maxLevel) {
      const need = expRequiredForLevel(level, config);
      if (exp < need) break;
      exp -= need;
      level += 1;
      leveledUp = true;
    }
    if (level >= maxLevel) {
      level = maxLevel;
      exp = 0;
    }

    profile.level = level;
    profile.exp = exp;
    profile.updatedAt = getNow();
    profiles[key] = profile;
    saveProfiles(profiles);
    return {
      success: true,
      leveledUp,
      level,
      exp,
      totalExp: profile.totalExp,
      expRequired: expRequiredForLevel(level, config),
      source: options.source || null,
    };
  });
}

export async function recordMatchResult(userId, result) {
  const key = formatUserKey(userId);
  return withUserLock(key, async () => {
    await ensureDataFiles();
    const profiles = getProfiles();
    const profile = normalizeProfile(profiles[key], key);
    profile.statistics.matchesPlayed += 1;
    if (result === "win") profile.statistics.wins += 1;
    else if (result === "loss") profile.statistics.losses += 1;
    profile.updatedAt = getNow();
    profiles[key] = profile;
    saveProfiles(profiles);
    return { success: true, statistics: profile.statistics };
  });
}


/**
 * Unlock achievement if not already unlocked.
 */
export async function unlockAchievement(userId, achievement) {
  if (!achievement || !achievement.id) {
    return { success: false, error: "Thiếu id thành tựu" };
  }
  const key = formatUserKey(userId);
  return withUserLock(key, async () => {
    await ensureDataFiles();
    const profiles = getProfiles();
    const profile = normalizeProfile(profiles[key], key);
    if (!Array.isArray(profile.achievements)) profile.achievements = [];
    const exists = profile.achievements.find(
      (a) => a && (a.id === achievement.id || a.name === achievement.name)
    );
    if (exists && (exists.unlocked === true || exists.unlockedAt)) {
      return { success: true, already: true, achievement: exists };
    }
    const entry = {
      id: String(achievement.id),
      name: String(achievement.name || achievement.id),
      description: achievement.description || "",
      icon: achievement.icon || "🏆",
      unlocked: true,
      unlockedAt: getNow(),
    };
    if (exists) Object.assign(exists, entry);
    else profile.achievements.push(entry);
    profile.updatedAt = getNow();
    profiles[key] = profile;
    saveProfiles(profiles);
    return { success: true, already: false, achievement: entry };
  });
}

/**
 * Lấy tên + URL avatar từ Zalo API (adapter.raw = zca-mt).
 */
export async function fetchZaloProfile(adapter, userId) {
  const key = formatUserKey(userId);
  let zaloName = null;
  let avatarUrl = null;
  try {
    const api =
      adapter?.raw ||
      adapter?.api ||
      adapter?._api ||
      (typeof adapter?.getUserInfo === "function" ? adapter : null);
    if (!api || typeof api.getUserInfo !== "function") {
      return { zaloName, avatarUrl };
    }
    const info = await api.getUserInfo(key);
    const candidates = [key, String(userId), String(userId).replace(/_0$/, ""), `${key}_0`];
    let profile = null;
    for (const id of candidates) {
      profile =
        info?.changed_profiles?.[id] ||
        info?.unchanged_profiles?.[id] ||
        info?.[id] ||
        null;
      if (profile) break;
    }
    if (!profile && info?.changed_profiles) {
      const vals = Object.values(info.changed_profiles);
      if (vals.length === 1) profile = vals[0];
    }
    if (!profile && info?.unchanged_profiles) {
      const vals = Object.values(info.unchanged_profiles);
      if (vals.length === 1) profile = vals[0];
    }
    if (profile) {
      zaloName = profile.displayName || profile.zaloName || profile.name || profile.username || null;
      avatarUrl =
        profile.avatar ||
        profile.avatarUrl ||
        profile.avatarFull ||
        profile.photo ||
        profile.thumb ||
        profile.sdavatar ||
        null;
      if (avatarUrl && typeof avatarUrl === "object") {
        avatarUrl = avatarUrl.url || avatarUrl.href || avatarUrl.normal || avatarUrl.big || null;
      }
    }
  } catch (err) {
    console.warn("[PlayerProfile] fetchZaloProfile:", err?.message);
  }
  return { zaloName, avatarUrl };
}

/**
 * Custom avatar → zalo cache → fetch Zalo → cache disk.
 * Dùng chung cho .hoso, .cauca, .ott, game khác.
 */
export async function getPlayerAvatarPath(userId, options = {}) {
  const key = formatUserKey(userId);
  await ensureDataFiles();
  const profile = await getOrCreateProfile(key);

  if (profile.customAvatar && fs.existsSync(profile.customAvatar)) {
    return { path: profile.customAvatar, source: "custom" };
  }

  const zaloCachePath = path.join(AVATARS_DIR, `zalo_${key}.jpg`);
  const zaloCachePng = path.join(AVATARS_DIR, `zalo_${key}.png`);
  const existingCache = [zaloCachePath, zaloCachePng].find((p) => fs.existsSync(p)) || null;

  const maxAge = 24 * 60 * 60 * 1000;
  if (existingCache && !options.forceRefresh) {
    try {
      const st = fs.statSync(existingCache);
      if (Date.now() - st.mtimeMs < maxAge) {
        return { path: existingCache, source: "zalo_cache" };
      }
    } catch {}
  }

  let avatarUrl = options.avatarUrl || null;
  let zaloName = null;
  if (!avatarUrl && options.adapter) {
    const resolved = await fetchZaloProfile(options.adapter, key);
    avatarUrl = resolved.avatarUrl;
    zaloName = resolved.zaloName;
  }

  if (!avatarUrl) {
    if (existingCache) return { path: existingCache, source: "zalo_cache", zaloName };
    return { path: null, source: "none", zaloName };
  }

  try {
    let buf = null;
    try {
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      const axios = require("axios");
      const resp = await axios.get(avatarUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://zalo.me/",
        },
        maxRedirects: 5,
      });
      buf = Buffer.from(resp.data);
    } catch {
      const res = await fetch(avatarUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "image/*",
          Referer: "https://zalo.me/",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (!buf || buf.length < 100) throw new Error("Ảnh rỗng");
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const outPath = isPng ? zaloCachePng : zaloCachePath;
    for (const old of [zaloCachePath, zaloCachePng]) {
      if (old !== outPath && fs.existsSync(old)) {
        try { fs.unlinkSync(old); } catch {}
      }
    }
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
    fs.writeFileSync(outPath, buf);
    return { path: outPath, source: "zalo_fetch", zaloName };
  } catch (err) {
    console.warn("[PlayerProfile] cache Zalo avatar fail:", err?.message);
    if (existingCache) return { path: existingCache, source: "zalo_cache", zaloName };
    return { path: null, source: "none", zaloName };
  }
}

/**
 * Resolve avatar + display name cho canvas / game.
 */
export async function resolvePlayerVisual(userId, options = {}) {
  const key = formatUserKey(userId);
  const profile = await getOrCreateProfile(key);
  const zalo = options.adapter
    ? await fetchZaloProfile(options.adapter, key)
    : { zaloName: options.zaloName || null, avatarUrl: options.zaloAvatarUrl || null };

  const avatar = await getPlayerAvatarPath(key, {
    adapter: options.adapter,
    avatarUrl: zalo.avatarUrl || options.zaloAvatarUrl || null,
    forceRefresh: !!options.forceRefresh,
  });

  const displayName =
    profile.customDisplayName ||
    zalo.zaloName ||
    options.zaloName ||
    options.fallbackName ||
    "Người chơi";

  return {
    userId: key,
    displayName,
    avatarPath: avatar.path,
    avatarSource: avatar.source,
    zaloName: zalo.zaloName,
    zaloAvatarUrl: zalo.avatarUrl,
    customAvatar: profile.customAvatar,
    level: profile.level,
    exp: profile.exp,
  };
}

/**
 * Ghi hồ sơ nghề nghiệp (.work) vào profile.work + cộng EXP nhân vật trong CÙNG một lần khóa/ghi.
 * Idempotent theo `shiftId`: gọi lại cùng shiftId không cộng EXP lần nữa (phục hồi sau lỗi giữa chừng).
 * Các trường cũ của profile giữ nguyên (tương thích ngược).
 * @param {object} reward { shiftId?, exp?, patch?, achievements? }
 */
export async function applyWorkReward(userId, reward = {}) {
  const key = formatUserKey(userId);
  if (!key) throw new Error("UID không hợp lệ");
  const exp = Math.max(0, Math.floor(safeNumber(reward.exp, 0)));
  const config = getConfig();
  const maxLevel = safeNumber(config.maxLevel, 100);
  return withUserLock(key, async () => {
    await ensureDataFiles();
    const profiles = getProfiles();
    const profile = normalizeProfile(profiles[key], key);
    const work = profile.work && typeof profile.work === "object" ? profile.work : {};
    const settled = Array.isArray(work.settled) ? work.settled : [];
    const result = { success: true, already: false, leveledUp: false, level: profile.level, exp: profile.exp };
    if (reward.shiftId && settled.includes(reward.shiftId)) {
      return { ...result, already: true };
    }
    if (exp > 0 && profile.level < maxLevel) {
      let level = profile.level;
      let cur = profile.exp + exp;
      while (level < maxLevel) {
        const need = expRequiredForLevel(level, config);
        if (cur < need) break;
        cur -= need;
        level += 1;
        result.leveledUp = true;
      }
      if (level >= maxLevel) { level = maxLevel; cur = 0; }
      profile.level = level;
      profile.exp = cur;
    }
    const nextWork = { ...work, ...(reward.patch && typeof reward.patch === "object" ? reward.patch : {}) };
    const ach = Array.isArray(nextWork.achievements) ? [...nextWork.achievements] : [];
    for (const a of reward.achievements || []) {
      if (a && a.id && !ach.some((x) => x && x.id === a.id)) ach.push({ id: String(a.id), name: String(a.name || a.id), unlockedAt: getNow() });
    }
    nextWork.achievements = ach;
    if (reward.shiftId) nextWork.settled = [...settled, reward.shiftId].slice(-40);
    else nextWork.settled = settled;
    profile.work = nextWork;
    profile.updatedAt = getNow();
    profiles[key] = profile;
    saveProfiles(profiles);
    return { ...result, level: profile.level, exp: profile.exp, expRequired: expRequiredForLevel(profile.level, config) };
  });
}

/** Đọc profile.work (chưa có → object rỗng). */
export async function getWorkProfile(userId) {
  const profile = await getOrCreateProfile(userId);
  return profile.work && typeof profile.work === "object" ? profile.work : {};
}

export {
  ensureDataFiles,
  getConfig,
  formatUserKey,
  AVATARS_DIR,
};
