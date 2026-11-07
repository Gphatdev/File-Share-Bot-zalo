import {
  ensureDataFiles,
  getConfig,
  getProfiles,
  saveProfiles,
  safeNumber,
} from "./storage.js";

const USER_LOCKS = new Map();

async function withLock(userId, task) {
  const key = String(userId);
  const prev = USER_LOCKS.get(key) || Promise.resolve();
  let release;
  const next = new Promise((r) => {
    release = r;
  });
  USER_LOCKS.set(key, next);
  await prev;
  try {
    return await task();
  } finally {
    if (USER_LOCKS.get(key) === next) USER_LOCKS.delete(key);
    release();
  }
}

function uid(userId) {
  return String(userId || "").trim();
}

function now() {
  return Date.now();
}

function getRealms() {
  const cfg = getConfig();
  return Array.isArray(cfg.realms) ? cfg.realms : [];
}

export function getRealmById(realmId) {
  return getRealms().find((r) => r.id === realmId) || null;
}

export function getRealmByOrder(order) {
  return getRealms().find((r) => r.order === order) || null;
}

export function getNextRealm(currentId) {
  const current = getRealmById(currentId);
  if (!current) return null;
  return getRealmByOrder(current.order + 1) || null;
}

/**
 * Tu vi cần để đột phá tiếp theo từ trạng thái hiện tại.
 * Luyện Khí: theo stageExp[stage-1]
 * Cảnh giới khác: breakthroughExp của cảnh giới hiện tại (để lên cảnh kế)
 * Max realm: 0
 */
export function getRequiredQi(profile) {
  const realm = getRealmById(profile.realmId);
  if (!realm) return 0;
  if (realm.isMax) return 0;

  if (realm.hasStages) {
    const stage = Math.max(1, Math.min(realm.maxStage || 9, profile.stage || 1));
    // If still within stages, need stageExp for current stage to advance
    if (stage < (realm.maxStage || 9)) {
      const arr = realm.stageExp || [];
      return safeNumber(arr[stage - 1], 100);
    }
    // At max stage of Luyện Khí → need stageExp of stage 9 to breakthrough to Trúc Cơ
    const arr = realm.stageExp || [];
    return safeNumber(arr[(realm.maxStage || 9) - 1], 1500);
  }

  return safeNumber(realm.breakthroughExp, 0);
}

function createDefaultProfile(userId) {
  const cfg = getConfig();
  return {
    userId: uid(userId),
    domain: "PHAM",
    realmId: cfg.initialRealmId || "luyen_khi",
    stage: cfg.initialStage || 1,
    qi: 0,
    ascended: false,
    breakthroughCount: 0,
    tribulationSuccess: 0,
    tribulationFail: 0,
    lastBreakthroughAt: null,
    lastPracticeAt: 0,
    tribulationPending: false,
    history: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

function normalizeProfile(raw, userId) {
  const base = createDefaultProfile(userId);
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    userId: uid(userId),
    qi: Math.max(0, Math.floor(safeNumber(raw.qi, 0))),
    profileExpSynced: Math.max(0, Math.floor(safeNumber(raw.profileExpSynced, 0))),
    stage: Math.max(1, Math.floor(safeNumber(raw.stage, 1))),
    breakthroughCount: Math.max(0, safeNumber(raw.breakthroughCount, 0)),
    tribulationSuccess: Math.max(0, safeNumber(raw.tribulationSuccess, 0)),
    tribulationFail: Math.max(0, safeNumber(raw.tribulationFail, 0)),
    lastPracticeAt: Math.max(0, safeNumber(raw.lastPracticeAt, 0)),
    history: Array.isArray(raw.history) ? raw.history.slice(-50) : [],
  };
}

async function syncProfileExp(userId, profile) {
  const playerProfile = await import("../PlayerProfile/index.js");
  const totalExp = await playerProfile.getTotalExp(userId);
  const synced = Math.max(profile.profileExpSynced, totalExp);
  const added = synced - profile.profileExpSynced;
  profile.qi += added;
  profile.profileExpSynced = synced;
  return added;
}

export async function getCultivationProfile(userId) {
  await ensureDataFiles();
  const key = uid(userId);
  if (!key) throw new Error("UID không hợp lệ");

  return withLock(key, async () => {
    const profiles = getProfiles();
    if (!profiles[key]) {
      profiles[key] = createDefaultProfile(key);
    }
    const profile = normalizeProfile(profiles[key], key);
    const added = await syncProfileExp(key, profile);
    if (!profiles[key] || added > 0) {
      profile.updatedAt = now();
      profiles[key] = profile;
      saveProfiles(profiles);
    }
    return profile;
  });
}

export async function getCultivationExp(userId) {
  const p = await getCultivationProfile(userId);
  return p.qi;
}

/**
 * Build full view for Canvas / check.
 */
export async function getCultivationView(userId, options = {}) {
  const profile = await getCultivationProfile(userId);
  const realm = getRealmById(profile.realmId);
  const required = getRequiredQi(profile);
  const progress =
    required > 0 ? Math.min(1, Math.max(0, profile.qi / required)) : profile.realmId === "dao_to" ? 1 : 0;

  const canBreak = await canBreakthrough(userId);
  const rankInfo = await getPlayerRank(userId);

  return {
    userId: profile.userId,
    displayName: options.displayName || "Người chơi",
    domain: profile.domain,
    domainName: profile.domain === "TIEN" ? "Tiên Giới" : "Phàm Giới",
    realmId: profile.realmId,
    realmName: realm?.name || profile.realmId,
    realmDescription: realm?.description || "",
    stage: realm?.hasStages ? profile.stage : null,
    stageLabel: realm?.hasStages ? `Tầng ${profile.stage}` : null,
    qi: profile.qi,
    qiRequired: required,
    progress,
    progressPercent: Math.round(progress * 100),
    canBreakthrough: canBreak.ok,
    breakthroughReason: canBreak.reason || null,
    isTribulationReady: canBreak.isTribulation || false,
    isMax: !!realm?.isMax,
    ascended: !!profile.ascended,
    breakthroughCount: profile.breakthroughCount,
    tribulationSuccess: profile.tribulationSuccess,
    tribulationFail: profile.tribulationFail,
    lastBreakthroughAt: profile.lastBreakthroughAt,
    rank: rankInfo,
  };
}

export async function addCultivationExp(userId, amount, reason = "") {
  const qty = Math.floor(safeNumber(amount, 0));
  if (!Number.isFinite(qty) || qty <= 0) {
    return { success: false, error: "Tu vi phải là số nguyên dương." };
  }
  const key = uid(userId);
  if (!key) return { success: false, error: "UID không hợp lệ" };

  const playerProfile = await import("../PlayerProfile/index.js");
  const result = await playerProfile.addExp(key, qty, { source: "cultivation" });
  if (!result.success) return result;
  const profile = await getCultivationProfile(key);
  return { success: true, added: qty, qi: profile.qi, reason: reason || null };
}

export async function practiceCultivation(userId) {
  const key = uid(userId);
  if (!key) return { success: false, error: "UID không hợp lệ." };

  return withLock(key, async () => {
    await ensureDataFiles();
    const cfg = getConfig();
    const profiles = getProfiles();
    const profile = normalizeProfile(profiles[key], key);
    const cooldownMs = Math.max(1, safeNumber(cfg.practiceCooldownMinutes, 10)) * 60_000;
    const waitMs = profile.lastPracticeAt + cooldownMs - now();
    if (waitMs > 0) {
      return {
        success: false,
        error: `Bạn cần tĩnh tu thêm ${Math.ceil(waitMs / 60_000)} phút mới có thể luyện tiếp.`,
        cooldownMs: waitMs,
      };
    }

    const exp = Math.max(1, Math.floor(safeNumber(cfg.practiceExp, 500)));
    const playerProfile = await import("../PlayerProfile/index.js");
    const award = await playerProfile.addExp(key, exp, { source: "cultivation" });
    if (!award.success) {
      return { success: false, error: award.error || "Không thể cộng EXP hồ sơ." };
    }
    await syncProfileExp(key, profile);
    profile.lastPracticeAt = now();
    profile.updatedAt = profile.lastPracticeAt;
    profiles[key] = profile;
    saveProfiles(profiles);

    const required = getRequiredQi(profile);
    return {
      success: true,
      added: exp,
      qi: profile.qi,
      required,
      canBreakthrough: required > 0 && profile.qi >= required,
      cooldownMinutes: Math.ceil(cooldownMs / 60_000),
    };
  });
}

export async function canBreakthrough(userId) {
  const profile = await getCultivationProfile(userId);
  const realm = getRealmById(profile.realmId);
  if (!realm) return { ok: false, reason: "Cảnh giới không hợp lệ" };
  if (realm.isMax) return { ok: false, reason: "Đã đạt cảnh giới tối thượng" };

  const expAdded = await syncProfileExp(userId, profile);
  if (expAdded > 0) {
    profile.updatedAt = now();
    const profiles = getProfiles();
    profiles[profile.userId] = profile;
    saveProfiles(profiles);
  }
  const required = getRequiredQi(profile);
  if (profile.qi < required) {
    return {
      ok: false,
      reason: `Chưa đủ tu vi (${profile.qi.toLocaleString("vi-VN")} / ${required.toLocaleString("vi-VN")})`,
    };
  }

  // At Độ Kiếp with enough qi → tribulation
  if (realm.isTribulation) {
    return { ok: true, isTribulation: true, required };
  }

  // Luyện Khí mid-stages
  if (realm.hasStages && profile.stage < (realm.maxStage || 9)) {
    return { ok: true, isStageUp: true, required };
  }

  // Luyện Khí stage 9 → Trúc Cơ, or any major realm breakthrough
  const next = getNextRealm(profile.realmId);
  if (!next) return { ok: false, reason: "Không có cảnh giới tiếp theo" };

  return { ok: true, isRealmUp: true, nextRealm: next, required };
}

/**
 * Perform breakthrough. Atomic via lock.
 * For Độ Kiếp: does NOT auto-run tribulation — returns needTribulation flag.
 */
export async function breakthrough(userId) {
  const key = uid(userId);
  return withLock(key, async () => {
    await ensureDataFiles();
    const profiles = getProfiles();
    const profile = normalizeProfile(profiles[key], key);
    await syncProfileExp(key, profile);
    profile.updatedAt = now();
    profiles[key] = profile;
    saveProfiles(profiles);
    const realm = getRealmById(profile.realmId);
    if (!realm) return { success: false, error: "Cảnh giới không hợp lệ" };
    if (realm.isMax) return { success: false, error: "Đã đạt cảnh giới tối thượng" };

    const required = getRequiredQi(profile);
    if (profile.qi < required) {
      return {
        success: false,
        error: `Chưa đủ tu vi (${profile.qi.toLocaleString("vi-VN")} / ${required.toLocaleString("vi-VN")})`,
      };
    }

    // Độ Kiếp → start tribulation flow (don't consume yet until confirm)
    if (realm.isTribulation) {
      profile.tribulationPending = true;
      profile.updatedAt = now();
      profiles[key] = profile;
      saveProfiles(profiles);
      return {
        success: true,
        needTribulation: true,
        message: "Đã đủ điều kiện Độ Kiếp. Xác nhận để triệu hồi Thiên Kiếp.",
      };
    }

    // Stage up within Luyện Khí
    if (realm.hasStages && profile.stage < (realm.maxStage || 9)) {
      profile.qi -= required;
      profile.stage += 1;
      profile.breakthroughCount += 1;
      profile.lastBreakthroughAt = now();
      profile.history.push({
        type: "STAGE_UP",
        from: `${realm.name} ${profile.stage - 1}`,
        to: `${realm.name} ${profile.stage}`,
        at: now(),
      });
      profile.updatedAt = now();
      profiles[key] = profile;
      saveProfiles(profiles);
      return {
        success: true,
        type: "STAGE_UP",
        realmName: realm.name,
        stage: profile.stage,
        qi: profile.qi,
        message: `Đột phá thành công! ${realm.name} Tầng ${profile.stage}`,
      };
    }

    // Realm breakthrough (including Luyện Khí 9 → Trúc Cơ)
    const next = getNextRealm(profile.realmId);
    if (!next) return { success: false, error: "Không có cảnh giới tiếp theo" };

    profile.qi -= required;
    const fromLabel = realm.hasStages
      ? `${realm.name} Tầng ${profile.stage}`
      : realm.name;
    profile.realmId = next.id;
    profile.domain = next.domain || profile.domain;
    profile.stage = next.hasStages ? 1 : 1;
    profile.breakthroughCount += 1;
    profile.lastBreakthroughAt = now();
    if (next.domain === "TIEN") profile.ascended = true;
    profile.history.push({
      type: "REALM_UP",
      from: fromLabel,
      to: next.name,
      at: now(),
    });
    profile.updatedAt = now();
    profiles[key] = profile;
    saveProfiles(profiles);

    return {
      success: true,
      type: "REALM_UP",
      realmName: next.name,
      domain: next.domain,
      stage: next.hasStages ? profile.stage : null,
      qi: profile.qi,
      message: `Đột phá thành công! Cảnh giới mới: ${next.name}`,
    };
  });
}

/**
 * Resolve Thiên Kiếp after player confirms.
 * Success rate from config (default 70%).
 * Failure = light fail (keep realm, keep qi, record fail).
 */
export async function resolveTribulation(userId) {
  const key = uid(userId);
  const cfg = getConfig();
  const rate = Math.min(1, Math.max(0, safeNumber(cfg.tribulationSuccessRate, 0.7)));

  return withLock(key, async () => {
    await ensureDataFiles();
    const profiles = getProfiles();
    const profile = normalizeProfile(profiles[key], key);
    await syncProfileExp(key, profile);
    profile.updatedAt = now();
    profiles[key] = profile;
    saveProfiles(profiles);
    const realm = getRealmById(profile.realmId);

    if (!realm?.isTribulation) {
      return { success: false, error: "Bạn không ở trạng thái Độ Kiếp." };
    }

    const required = getRequiredQi(profile);
    if (profile.qi < required) {
      return { success: false, error: "Chưa đủ tu vi để Độ Kiếp." };
    }

    const roll = Math.random();
    const success = roll < rate;

    if (success) {
      const next = getNextRealm(profile.realmId); // Nhân Tiên
      if (!next) return { success: false, error: "Không tìm thấy Nhân Tiên" };

      profile.qi -= required;
      profile.realmId = next.id;
      profile.domain = "TIEN";
      profile.ascended = true;
      profile.stage = 1;
      profile.breakthroughCount += 1;
      profile.tribulationSuccess += 1;
      profile.tribulationPending = false;
      profile.lastBreakthroughAt = now();
      profile.history.push({
        type: "TRIBULATION_SUCCESS",
        from: realm.name,
        to: next.name,
        at: now(),
      });
      profile.updatedAt = now();
      profiles[key] = profile;
      saveProfiles(profiles);

      return {
        success: true,
        tribulationSuccess: true,
        realmName: next.name,
        qi: profile.qi,
        message: `Thiên Kiếp thành công! Phi thăng thành ${next.name}!`,
      };
    }

    // Light failure
    profile.tribulationFail += 1;
    profile.tribulationPending = false;
    profile.history.push({
      type: "TRIBULATION_FAIL",
      from: realm.name,
      at: now(),
    });
    profile.updatedAt = now();
    profiles[key] = profile;
    saveProfiles(profiles);

    return {
      success: true,
      tribulationSuccess: false,
      realmName: realm.name,
      qi: profile.qi,
      message:
        "Thiên Kiếp thất bại! Bạn vẫn giữ cảnh giới Độ Kiếp. Hãy tích lũy thêm và thử lại.",
    };
  });
}

/**
 * Rank score for sorting: domain priority, realm order, stage, qi.
 */
function rankScore(profile) {
  const realm = getRealmById(profile.realmId);
  const order = realm?.order || 0;
  const stage = realm?.hasStages ? profile.stage || 0 : 0;
  const domainBonus = profile.domain === "TIEN" ? 100000 : 0;
  return domainBonus * 1e12 + order * 1e9 + stage * 1e6 + (profile.qi || 0);
}

export async function getCultivationRank(page = 1, pageSize = null) {
  await ensureDataFiles();
  const cfg = getConfig();
  const size = Math.max(1, Math.min(20, pageSize || cfg.leaderboardPageSize || 10));
  const maxEntries = cfg.maxLeaderboardEntries || 50;

  const profiles = getProfiles();
  const list = Object.values(profiles)
    .map((p) => normalizeProfile(p, p.userId))
    .filter((p) => p.userId)
    .sort((a, b) => {
      const diff = rankScore(b) - rankScore(a);
      if (diff !== 0) return diff;
      // Tie-break: earlier breakthrough wins
      return (a.lastBreakthroughAt || 0) - (b.lastBreakthroughAt || 0);
    })
    .slice(0, maxEntries);

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.max(1, Math.min(totalPages, Math.floor(safeNumber(page, 1))));
  const start = (safePage - 1) * size;
  const pageItems = list.slice(start, start + size).map((p, idx) => {
    const realm = getRealmById(p.realmId);
    return {
      rank: start + idx + 1,
      userId: p.userId,
      realmName: realm?.name || p.realmId,
      stage: realm?.hasStages ? p.stage : null,
      qi: p.qi,
      domain: p.domain,
      ascended: !!p.ascended,
    };
  });

  const pham = list.filter((p) => p.domain !== "TIEN").length;
  const tien = list.filter((p) => p.domain === "TIEN").length;
  const topRealm = list[0] ? getRealmById(list[0].realmId)?.name : null;

  return {
    items: pageItems,
    page: safePage,
    totalPages,
    totalPlayers: total,
    stats: {
      total: total,
      phamGioi: pham,
      tienGioi: tien,
      highestRealm: topRealm,
    },
  };
}

async function getPlayerRank(userId) {
  const key = uid(userId);
  const rankData = await getCultivationRank(1, 50);
  const found = rankData.items.find((i) => i.userId === key);
  if (found) return found.rank;
  // Not in top 50 — compute approximate
  const profiles = getProfiles();
  const list = Object.values(profiles).map((p) => normalizeProfile(p, p.userId));
  list.sort((a, b) => rankScore(b) - rankScore(a));
  const idx = list.findIndex((p) => p.userId === key);
  return idx >= 0 ? idx + 1 : null;
}

export {
  ensureDataFiles,
  getConfig,
  getRealms,
};
