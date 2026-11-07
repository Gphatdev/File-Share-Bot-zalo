/**
 * AI/permissions.js — xác minh quyền bằng UID từ metadata tin nhắn (KHÔNG tin tên hiển thị / lời tự xưng).
 * Dùng chung hệ phân quyền của bot: Utils/Permission.js (OWNER_ZALO_ID trong .env, admin_bot trong config.yml).
 */
import * as Perm from "../../../../Utils/Permission.js";
import { AI_SETTINGS } from "./config.js";

const uidOf = (u) => String(u ?? "").trim();

export function isOwner(uid, config = null) { return Perm.isOwner(uidOf(uid), config); }
export function isBotAdmin(uid, config = null) { return Perm.isBotAdmin(uidOf(uid), config); }
/** Có cấu hình OWNER_ZALO_ID chưa? */
export function ownerConfigured(config = null) { const c = config || global.__NKNP_BOT__?.config || {}; return !!String(c.ownerZaloId || global.config?.ownerZaloId || "").trim(); }

/** Quản lý AI trong nhóm (.ai on/off/code/xoalichsu): Owner / Admin bot / Support / quản trị viên nhóm. */
export async function canManage(ctx) {
  const role = await Perm.resolveRole(ctx.uid, { config: ctx.config, adapter: ctx.adapter, threadId: ctx.threadId, isGroup: ctx.isGroup });
  return role >= 1;
}
/** Bật/tắt học phong cách: Owner, Admin bot, trainerIds; (tùy cấu hình) quản trị viên nhóm. */
export async function canTrain(ctx, settings = AI_SETTINGS) {
  const uid = uidOf(ctx.uid);
  if (Perm.isBotAdmin(uid, ctx.config)) return true;
  if ((settings.trainerIds || []).map(uidOf).includes(uid)) return true;
  if (settings.allowGroupAdminTrain) return canManage(ctx);
  return false;
}
/** Reset phong cách: chỉ Owner. Nếu bot chưa cấu hình OWNER_ZALO_ID thì Admin bot được thay thế. */
export function canReset(uid, config = null) {
  if (Perm.isOwner(uidOf(uid), config)) return true;
  return !ownerConfigured(config) && Perm.isBotAdmin(uidOf(uid), config);
}
/** Dùng AI trong tin nhắn riêng. */
export function canUsePrivate(uid, config = null, settings = AI_SETTINGS) {
  return settings.privateForEveryone || Perm.isBotAdmin(uidOf(uid), config);
}
export function isStaff(uid, config = null, settings = AI_SETTINGS) {
  const u = uidOf(uid);
  return Perm.isBotAdmin(u, config) || (settings.trainerIds || []).map(uidOf).includes(u);
}
