/**
 * Utils/Permission.js
 * Hệ thống phân quyền thống nhất cho toàn bot.
 *
 * Role levels (HandleCommandRouter):
 *   0 = USER
 *   1 = GROUP_ADMIN | SUPPORT | BOT_ADMIN | OWNER
 *   2 = BOT_ADMIN | OWNER
 */

export function normalizeUid(uid) {
  if (uid === undefined || uid === null) return "";
  return String(uid).trim();
}

function listFrom(...sources) {
  const out = [];
  for (const src of sources) {
    if (!src) continue;
    if (Array.isArray(src)) out.push(...src);
    else if (typeof src === "string" || typeof src === "number") out.push(src);
  }
  return [...new Set(out.map(normalizeUid).filter(Boolean))];
}

/** Danh sách admin bot (config + runtime global.users) */
export function getAdminIds(config = null) {
  const cfg = config || global.__NKNP_BOT__?.config || {};
  return listFrom(
    cfg.ownerZaloId,
    cfg.legacyAdminBot,
    global.config?.admin_bot,
    global.config?.ADMINBOT,
    global.users?.admin
  );
}

/** Danh sách support */
export function getSupportIds(config = null) {
  const cfg = config || global.__NKNP_BOT__?.config || {};
  return listFrom(
    cfg.legacySupportBot,
    global.config?.support_bot,
    global.users?.support
  );
}

export function isOwner(uid, config = null) {
  const c = normalizeUid(uid);
  if (!c) return false;
  const cfg = config || global.__NKNP_BOT__?.config || {};
  const owner = normalizeUid(cfg.ownerZaloId || global.config?.ownerZaloId);
  return Boolean(owner && c === owner);
}

export function isBotAdmin(uid, config = null) {
  const c = normalizeUid(uid);
  if (!c) return false;
  if (isOwner(c, config)) return true;
  return getAdminIds(config).includes(c);
}

export function isSupport(uid, config = null) {
  const c = normalizeUid(uid);
  if (!c) return false;
  if (isBotAdmin(c, config)) return true;
  return getSupportIds(config).includes(c);
}

/**
 * Role number for command gate.
 * @returns {Promise<number>} 0 | 1 | 2
 */
export async function resolveRole(uid, options = {}) {
  const c = normalizeUid(uid);
  if (!c) return 0;
  const config = options.config || global.__NKNP_BOT__?.config || {};

  if (isOwner(c, config) || isBotAdmin(c, config)) return 2;
  if (isSupport(c, config)) return 1;

  const adapter = options.adapter || global.__NKNP_BOT__?.adapter;
  const threadId = options.threadId;
  const isGroup = options.isGroup === true || options.messageType === 1;

  if (isGroup && threadId && adapter && typeof adapter.getGroupAdmins === "function") {
    try {
      const groupAdmins = await adapter.getGroupAdmins(threadId);
      if (groupAdmins) {
        const creatorId = normalizeUid(groupAdmins.creatorId);
        const adminIds = (groupAdmins.adminIds || []).map(normalizeUid);
        if (c === creatorId || adminIds.includes(c)) return 1;
      }
    } catch {
      /* ignore */
    }
  }
  return 0;
}

export function roleName(role) {
  if (role >= 2) return "OWNER/ADMIN";
  if (role >= 1) return "SUPPORT/GROUP ADMIN";
  return "USER";
}

export function hasPermission(uid, requiredRole, options = {}) {
  // sync fast path for role 2 without group check
  if (requiredRole <= 0) return true;
  const c = normalizeUid(uid);
  const config = options.config || global.__NKNP_BOT__?.config || {};
  if (requiredRole <= 2 && (isOwner(c, config) || isBotAdmin(c, config))) return true;
  if (requiredRole <= 1 && isSupport(c, config)) return true;
  return false; // group admin needs async resolveRole
}

/** Sync admin list vào global.users + config sau khi sửa config.yml */
export function syncAdminRuntime(config = null) {
  const cfg = config || global.__NKNP_BOT__?.config || {};
  const admins = listFrom(cfg.legacyAdminBot, global.config?.admin_bot).filter(
    (id) => id !== normalizeUid(cfg.ownerZaloId)
  );
  // keep owner in admin list for convenience
  const owner = normalizeUid(cfg.ownerZaloId);
  const adminList = owner ? [owner, ...admins.filter((a) => a !== owner)] : admins;
  const support = listFrom(cfg.legacySupportBot, global.config?.support_bot);

  if (!global.users) global.users = {};
  global.users.admin = adminList;
  global.users.support = support;

  if (cfg) {
    cfg.legacyAdminBot = adminList;
    cfg.legacySupportBot = support;
  }
  if (global.config) {
    global.config.admin_bot = adminList;
    global.config.ADMINBOT = adminList;
    global.config.support_bot = support;
  }
  return { admin: adminList, support };
}

export default {
  normalizeUid,
  isOwner,
  isBotAdmin,
  isSupport,
  resolveRole,
  roleName,
  hasPermission,
  getAdminIds,
  getSupportIds,
  syncAdminRuntime,
};
