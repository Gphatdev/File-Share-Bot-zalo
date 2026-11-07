/**
 * admin.js — Quản lý admin/support bot + Admin Control Center (Canvas)
 * role: 2 (BOT ADMIN / OWNER) qua HandleCommandRouter + Utils/Permission
 */
import { unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import {
  isBotAdmin,
  normalizeUid,
  syncAdminRuntime,
  getAdminIds,
  getSupportIds,
  roleName,
} from "../../Utils/Permission.js";
import {
  renderAdminMenu,
  renderAdminResult,
  renderAdminList,
  renderStatusCard,
  saveTemp,
  formatVNTime,
} from "./data/ADMIN/canvas.js";

const require = createRequire(import.meta.url);
const { updateConfigArray, reloadConfig } = require("../../Utils/LegacyUtils.cjs");

function extractTargets(args, data) {
  const ids = [];
  // mentions: zca-mt thường là mảng [{ uid, pos, len }]
  const mentions = data?.mentions;
  if (Array.isArray(mentions)) {
    for (const m of mentions) {
      if (m?.uid) ids.push(normalizeUid(m.uid));
    }
  } else if (mentions && typeof mentions === "object") {
    for (const m of Object.values(mentions)) {
      if (m?.uid) ids.push(normalizeUid(m.uid));
      else if (typeof m === "string" || typeof m === "number") ids.push(normalizeUid(m));
    }
  }
  // args UIDs
  if (args.length > 1) {
    const raw = args.slice(1).join(" ").split(/[\s,]+/);
    for (const x of raw) {
      const id = normalizeUid(x);
      if (id && /^\d+$/.test(id)) ids.push(id);
    }
  }
  return [...new Set(ids.filter(Boolean))];
}

async function resolveNames(api, uids) {
  const out = [];
  for (const id of uids) {
    let name = id;
    let avatar = null;
    try {
      if (api && typeof api.getUserInfo === "function") {
        const info = await api.getUserInfo(id);
        const p =
          info?.changed_profiles?.[id] ||
          info?.unchanged_profiles?.[id] ||
          info?.[id];
        name = p?.displayName || p?.zaloName || p?.name || id;
        avatar = p?.avatar || p?.avatarUrl || p?.photo || null;
      }
    } catch {}
    out.push({ uid: id, name, avatar });
  }
  return out;
}

async function sendImg(adapter, threadId, threadType, buffer, caption) {
  const imagePath = saveTemp(buffer, "admin");
  try {
    await adapter.sendImage({ threadId, threadType, imagePath, caption });
  } finally {
    try { unlinkSync(imagePath); } catch {}
  }
}

export default {
  name: "admin",
  description: "Quản lý admin/support — menu chức năng, list, add, rm, sp, rmsp (Canvas)",
  version: "2.1.0",
  author: "HNNP STUDIO",
  group: "system",
  role: 2,
  cooldown: 2,
  aliases: ["ad", "adminbot"],
  noPrefix: false,

  async run({ adapter, message, args = [], config, commands, logger }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const senderId = normalizeUid(message.data?.uidFrom);
    const senderName = String(message.data?.dName || "Admin").slice(0, 40);
    const send = (t) => adapter.sendText({ threadId, threadType, text: t });
    const api = adapter?.raw || adapter?.api || adapter;

    // Double-check permission (router already gates role 2)
    if (!isBotAdmin(senderId, config)) {
      try {
        const buf = await renderStatusCard("deny", "TỪ CHỐI TRUY CẬP", [
          "Bạn không có quyền sử dụng chức năng này.",
          "Yêu cầu quyền: BOT ADMIN / OWNER",
          `UID của bạn: ${senderId}`,
        ]);
        await sendImg(adapter, threadId, threadType, buf);
      } catch {
        await send("🛡️ TỪ CHỐI TRUY CẬP — Yêu cầu: BOT ADMIN / OWNER");
      }
      return;
    }

    const action = String(args[0] || "").toLowerCase().trim();
    const targets = extractTargets(args, message.data || {});

    // ── Menu chức năng của lệnh admin (no args) ─────────────
    if (!action || action === "panel" || action === "menu" || action === "help") {
      const ownerId = normalizeUid(config?.ownerZaloId);
      const label = ownerId && ownerId === senderId ? "OWNER" : "BOT ADMIN";
      const buf = await renderAdminMenu({
        name: senderName,
        roleLabel: label,
        prefix: config?.prefix || ".",
      });
      await sendImg(adapter, threadId, threadType, buf);
      return;
    }

    // ── list ─────────────────────────────────────────────────
    if (action === "list" || action === "ls") {
      syncAdminRuntime(config);
      const adminIds = getAdminIds(config);
      const supportIds = getSupportIds(config);
      const ownerId = normalizeUid(config?.ownerZaloId);
      const admins = (await resolveNames(api, adminIds)).map((a) => ({ ...a, isOwner: a.uid === ownerId }));
      admins.sort((a, b) => Number(b.isOwner) - Number(a.isOwner));
      const supports = await resolveNames(api, supportIds);
      const buf = await renderAdminList({ admins, supports, time: formatVNTime() });
      await sendImg(adapter, threadId, threadType, buf);
      return;
    }

    // ── add / rm / sp / rmsp ─────────────────────────────────
    const map = {
      add: { list: "admin", key: "admin_bot", label: "admin bot", add: true },
      rm: { list: "admin", key: "admin_bot", label: "admin bot", add: false },
      sp: { list: "support", key: "support_bot", label: "support bot", add: true },
      rmsp: { list: "support", key: "support_bot", label: "support bot", add: false },
    };

    if (map[action]) {
      const spec = map[action];
      if (!targets.length) {
        const buf = await renderStatusCard("error", "THIẾU ĐỐI TƯỢNG", [
          `Cú pháp: admin ${action} @tag hoặc UID`,
          "Có thể tag nhiều người / nhiều UID.",
        ]);
        await sendImg(adapter, threadId, threadType, buf);
        return;
      }

      if (!global.users) global.users = { admin: [], support: [] };
      if (!Array.isArray(global.users[spec.list])) global.users[spec.list] = [];

      // Normalize existing list to strings
      global.users[spec.list] = global.users[spec.list].map(normalizeUid).filter(Boolean);
      const current = global.users[spec.list];

      let changed = [];
      if (spec.add) {
        changed = targets.filter((id) => !current.includes(id));
        if (!changed.length) {
          await send("Không có người dùng mới nào để thêm (đã có trong danh sách).");
          return;
        }
        const updated = [...current, ...changed];
        await updateConfigArray(spec.key, updated);
        await reloadConfig();
        // Sync runtime
        global.users[spec.list] = updated.map(normalizeUid);
        if (config) {
          if (spec.list === "admin") config.legacyAdminBot = updated.map(normalizeUid);
          else config.legacySupportBot = updated.map(normalizeUid);
        }
        syncAdminRuntime(config);
      } else {
        changed = targets.filter((id) => current.includes(id));
        if (!changed.length) {
          await send("Không tìm thấy người dùng trong danh sách hiện tại.");
          return;
        }
        const updated = current.filter((id) => !changed.includes(id));
        await updateConfigArray(spec.key, updated);
        await reloadConfig();
        global.users[spec.list] = updated.map(normalizeUid);
        if (config) {
          if (spec.list === "admin") config.legacyAdminBot = updated.map(normalizeUid);
          else config.legacySupportBot = updated.map(normalizeUid);
        }
        syncAdminRuntime(config);
      }

      const infos = await resolveNames(api, changed);
      const buf = await renderAdminResult({
        mode: spec.add ? "add" : "rm",
        role: spec.list === "admin" ? "admin" : "support",
        targets: infos,
        by: senderName,
        time: formatVNTime(),
      });
      await sendImg(adapter, threadId, threadType, buf);
      return;
    }

    // unknown sub
    await send(
      "Cách dùng:\nadmin — dashboard\nadmin list\nadmin add|rm|sp|rmsp @tag/UID"
    );
  },
};
