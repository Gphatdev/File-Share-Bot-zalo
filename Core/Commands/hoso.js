import { unlinkSync } from "node:fs";
import {
  getProfileView,
  setCustomDisplayName,
  setCustomAvatar,
  getConfig,
  resolvePlayerVisual,
  getPlayerAvatarPath,
} from "./data/GIAITRI/PlayerProfile/index.js";
import {
  renderProfileCanvas,
  saveBufferToTempImage,
} from "./data/GIAITRI/PlayerProfile/canvas.js";

/** Session map: key = userId|threadId */
const sessions = new Map();

function sessionKey(userId, threadId) {
  return `${String(userId)}|${String(threadId)}`;
}

function setSession(userId, threadId, data) {
  const ttl = getConfig().sessionTtlMs || 5 * 60 * 1000;
  sessions.set(sessionKey(userId, threadId), {
    ...data,
    expiresAt: Date.now() + ttl,
  });
}

function getSession(userId, threadId) {
  const key = sessionKey(userId, threadId);
  const data = sessions.get(key);
  if (!data) return null;
  if (data.expiresAt < Date.now()) {
    sessions.delete(key);
    return null;
  }
  return data;
}

function clearSession(userId, threadId) {
  sessions.delete(sessionKey(userId, threadId));
}

function normalizeUid(value) {
  return String(value ?? "").trim();
}

async function sendCard(adapter, threadId, threadType, buffer, caption) {
  const imagePath = saveBufferToTempImage(buffer, "hoso");
  try {
    await adapter.sendImage({ threadId, threadType, imagePath, caption });
  } finally {
    try {
      unlinkSync(imagePath);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Resolve Zalo profile (name + avatar URL) via raw API if available.
 */
async function resolveZaloProfile(adapter, userId, fallbackName) {
  let zaloName = fallbackName || "Người chơi";
  let zaloAvatarUrl = null;

  try {
    const api = adapter?.api || adapter?._api || null;
    const getUserInfo =
      (api && typeof api.getUserInfo === "function" && api.getUserInfo.bind(api)) ||
      (typeof adapter?.getUserInfo === "function" && adapter.getUserInfo.bind(adapter)) ||
      null;

    if (getUserInfo) {
      const info = await getUserInfo(userId);
      const profile =
        info?.changed_profiles?.[userId] ||
        info?.unchanged_profiles?.[userId] ||
        info?.[userId] ||
        null;
      if (profile) {
        zaloName =
          profile.displayName ||
          profile.zaloName ||
          profile.name ||
          zaloName;
        zaloAvatarUrl = profile.avatar || profile.avatarUrl || profile.photo || null;
      }
    }
  } catch (err) {
    console.warn("[hoso] Không lấy được Zalo profile:", err?.message);
  }

  return { zaloName, zaloAvatarUrl };
}

/**
 * Try extract image buffer from message (photo reply).
 */
async function extractImageBuffer(message, adapter) {
  const data = message?.data || message || {};
  // Common ZCA shapes
  const attachments =
    data.attachments ||
    data.content?.href ||
    data.content?.thumb ||
    null;

  // msgType photo with href
  const href =
    (typeof data.content === "object" && (data.content?.href || data.content?.url)) ||
    data.href ||
    null;

  let imageUrl = null;
  if (typeof href === "string" && /^https?:\/\//i.test(href)) {
    imageUrl = href;
  } else if (Array.isArray(attachments)) {
    const photo = attachments.find(
      (a) =>
        a &&
        (a.type === "photo" || a.type === "image" || a.msgType === "chat.photo") &&
        (a.url || a.href)
    );
    if (photo) imageUrl = photo.url || photo.href;
  }

  // Fallback: recommended photo action
  if (!imageUrl && data.msgType === "chat.photo" && typeof data.content === "string") {
    // some payloads embed url differently — skip
  }

  if (!imageUrl) return null;

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    console.warn("[hoso] Tải ảnh thất bại:", err?.message);
    return null;
  }
}

const EDIT_MENU = [
  "CHỈNH SỬA HỒ SƠ",
  "1. Tên Người Chơi",
  "2. Ảnh Đại Diện",
  "",
  "Reply số tương ứng để chọn mục cần chỉnh sửa.",
  "Gõ hủy / 0 / cancel để thoát chỉnh sửa.",
].join("\n");

function isCancelInput(content) {
  const c = String(content || "").trim().toLowerCase();
  if (!c) return false;
  const stripped = c.replace(/^[.!\/]+/, "").trim();
  const tokens = new Set([
    "huy", "hủy", "cancel", "exit", "thoat", "thoát", "stop", "0",
    "hoso huy", "hoso hủy", "hs huy", "hs hủy",
  ]);
  return tokens.has(c) || tokens.has(stripped);
}

export default {
  name: "hoso",
  description: "Hồ sơ người chơi — xem / chỉnh sửa (Canvas RPG Premium)",
  version: "1.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 3,
  aliases: ["profilegame", "hs", "playercard"],
  noPrefix: false,

  async run({ adapter, message, args = [] }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userId = normalizeUid(message.data?.uidFrom);
    const fallbackName = String(message.data?.dName || "Người chơi").slice(0, 40);
    const send = (text) => adapter.sendText({ threadId, threadType, text });

    if (!userId) {
      return send("Không xác định được UID người dùng.");
    }

    const sub = String(args[0] || "open").toLowerCase().trim();

    // ─── .hoso huy ───────────────────────────────────────────
    if (sub === "huy" || sub === "hủy" || sub === "cancel" || sub === "exit") {
      const had = getSession(userId, threadId);
      clearSession(userId, threadId);
      return send(had ? "✅ Đã hủy chỉnh sửa hồ sơ." : "Không có phiên chỉnh sửa nào đang mở.");
    }

    // ─── .hoso edit ──────────────────────────────────────────
    if (sub === "edit" || sub === "sua" || sub === "sửa") {
      setSession(userId, threadId, { type: "EDIT_MENU" });
      return send(EDIT_MENU);
    }

    // ─── .hoso open (default) ────────────────────────────────
    if (sub === "open" || sub === "xem" || sub === "mở" || !args[0]) {
      try {
        // Lấy logo Zalo thật + cache để dùng chung cho game
        const visual = await resolvePlayerVisual(userId, {
          adapter,
          fallbackName,
          forceRefresh: true, // luôn lấy logo Zalo mới nhất khi mở hồ sơ
        });
        if (!visual.avatarPath) {
          console.warn("[hoso] Không lấy được avatar Zalo cho", userId, "source=", visual.avatarSource);
        } else {
          console.log("[hoso] Avatar OK:", visual.avatarSource, visual.avatarPath);
        }
        const view = await getProfileView(userId, {
          zaloName: visual.zaloName || visual.displayName || fallbackName,
          zaloAvatarUrl: visual.zaloAvatarUrl || null,
        });
        // gắn path avatar đã cache (Zalo hoặc custom)
        view.avatarPath = visual.avatarPath;
        view.userId = userId;
        const buffer = await renderProfileCanvas(view);
        const cultivation = view.cultivation
          ? ` · ${view.cultivation.realm}${view.cultivation.stage ? ` ${view.cultivation.stage}` : ""}`
          : "";
        const caption = `📋 Hồ sơ · ${view.displayName} · Lv.${view.level}${cultivation}`;
        try {
          await sendCard(adapter, threadId, threadType, buffer, caption);
        } catch (err) {
          console.error("[hoso] Gửi ảnh lỗi:", err?.message);
          await send(
            `${caption}\nEXP hồ sơ: ${view.exp}/${view.expRequired} (${view.progressPercent}%)` +
            (view.cultivation
              ? `\nTu tiên: ${view.cultivation.realm}${view.cultivation.stage ? ` ${view.cultivation.stage}` : ""} · EXP tu tiên: ${Number(view.cultivation.qi || 0).toLocaleString("vi-VN")}`
              : "") +
            "\n(Không gửi được ảnh Canvas)"
          );
        }
      } catch (err) {
        console.error("[hoso open]", err);
        await send(`Lỗi khi mở hồ sơ: ${err.message}`);
      }
      return;
    }

    return send(
      "Cách dùng:\n.hoso open — xem hồ sơ\n.hoso edit — chỉnh sửa tên / ảnh đại diện"
    );
  },

  async onMessage({ adapter, message, config }) {
    const data = message?.data || {};
    const userId = normalizeUid(data.uidFrom);
    const threadId = message.threadId;
    if (!userId || !threadId) return;

    const session = getSession(userId, threadId);
    if (!session) return;

    const threadType = message.type === 1 ? "group" : "user";
    const send = (text) => adapter.sendText({ threadId, threadType, text });
    const content =
      typeof data.content === "string" ? data.content.trim() : "";
    const prefix = config?.botPrefix || ".";

    // Hủy chỉnh sửa bất kỳ bước nào
    if (isCancelInput(content)) {
      clearSession(userId, threadId);
      return send("✅ Đã hủy chỉnh sửa hồ sơ.");
    }

    // Ignore commands with prefix (except we still handle pure numbers / text / photos)
    if (content.startsWith(prefix) && session.type !== "WAIT_AVATAR") return;

    try {
      // ── Menu: reply 1 or 2 ─────────────────────────────────
      if (session.type === "EDIT_MENU") {
        if (content === "1") {
          setSession(userId, threadId, { type: "WAIT_NAME" });
          return send(
            "✏️ Nhập tên người chơi muốn hiển thị trên hồ sơ.\n(2–24 ký tự, có thể dùng tiếng Việt)\n\nGõ hủy để thoát."
          );
        }
        if (content === "2") {
          setSession(userId, threadId, { type: "WAIT_AVATAR" });
          return send(
            "🖼️ Gửi một ảnh để đặt làm ảnh đại diện hồ sơ.\n(PNG/JPG/WEBP, tối đa 2MB)\n\nGõ hủy / 0 / cancel để thoát."
          );
        }
        // invalid choice — do not clear, wait for valid
        if (/^\d+$/.test(content)) {
          return send("Chỉ chọn 1 hoặc 2.\nGõ hủy để thoát chỉnh sửa.");
        }
        return;
      }

      // ── Wait name ──────────────────────────────────────────
      if (session.type === "WAIT_NAME") {
        if (!content || content.startsWith(prefix)) return;
        const result = await setCustomDisplayName(userId, content);
        clearSession(userId, threadId);
        if (!result.success) {
          return send(`❌ ${result.error}`);
        }
        return send(
          `✅ Đã cập nhật tên hồ sơ: ${result.customDisplayName}\nDùng .hoso open để xem.`
        );
      }

      // ── Wait avatar (photo message) ────────────────────────
      if (session.type === "WAIT_AVATAR") {
        const buffer = await extractImageBuffer(message, adapter);
        if (!buffer) {
          // User sent text instead of image
          if (content && !content.startsWith(prefix)) {
            return send("Vui lòng gửi một ảnh (không phải chữ).\nGõ hủy / 0 / cancel để thoát.");
          }
          return;
        }
        const result = await setCustomAvatar(userId, buffer);
        clearSession(userId, threadId);
        if (!result.success) {
          return send(`❌ ${result.error}`);
        }
        return send("✅ Đã cập nhật ảnh đại diện hồ sơ.\nDùng .hoso open để xem.");
      }
    } catch (err) {
      console.error("[hoso onMessage]", err);
      clearSession(userId, threadId);
      await send(`Lỗi chỉnh sửa hồ sơ: ${err.message}`);
    }
  },
};
