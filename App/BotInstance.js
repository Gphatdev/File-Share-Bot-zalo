/**
 * App/BotInstance.js
 * Singleton bot state + permission wrappers (ủy quyền Utils/Permission).
 */
import {
  normalizeUid,
  isOwner as permIsOwner,
  isBotAdmin as permIsBotAdmin,
  isSupport as permIsSupport,
  resolveRole,
  syncAdminRuntime,
} from "../Utils/Permission.js";

function createBotInstance({ config, db, adapter, logger }) {
  const startedAt = Date.now();
  config.startedAt = startedAt;

  const commands = new Map();
  const aliases = new Map();
  const backgroundHooks = [];
  const commandGuards = []; // lệnh có commandGuard (LIMIT) — router gọi trước khi chạy lệnh khác
  const cooldowns = new Map();

  // Đồng bộ admin runtime lúc khởi tạo
  try {
    syncAdminRuntime(config);
  } catch (e) {
    logger?.warn?.("[BotInstance] syncAdminRuntime:", e?.message);
  }

  function isOnCooldown(threadId, senderId, commandName, cooldownSeconds) {
    if (!cooldownSeconds) return 0;
    const key = `${threadId}:${senderId}:${commandName}`;
    const now = Date.now();
    const expiresAt = cooldowns.get(key) || 0;
    if (now < expiresAt) {
      return Math.ceil((expiresAt - now) / 1000);
    }
    cooldowns.set(key, now + cooldownSeconds * 1000);
    return 0;
  }

  function isOwner(uid) {
    return permIsOwner(uid, config);
  }

  function isBotAdmin(uid) {
    return permIsBotAdmin(uid, config);
  }

  function isSupport(uid) {
    return permIsSupport(uid, config);
  }

  return {
    config,
    db,
    adapter,
    logger,
    startedAt,
    commands,
    aliases,
    backgroundHooks,
    commandGuards,
    cooldowns,
    isOnCooldown,
    isOwner,
    isBotAdmin,
    isSupport,
    resolveRole: (uid, opts = {}) =>
      resolveRole(uid, { ...opts, config, adapter }),
    normalizeUid,
    syncAdminRuntime: () => syncAdminRuntime(config),
  };
}

export { createBotInstance };
