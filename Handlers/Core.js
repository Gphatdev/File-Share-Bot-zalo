import { safeHandler } from "../Utils/Safe.js";
import { createHandleMessage } from "./HandleMessage.js";
import { createHandleReaction } from "./HandleReaction.js";
import { createHandleUndo } from "./HandleUndo.js";
import { createHandleGroup } from "./HandleGroup.js";
import { dispatchLegacyReply, dispatchLegacyEvent } from "./HandleLegacySystem.js";

const RENTAL_KEY = "bot:rental:expires";
const WARNING_COOLDOWN_MS = 30_000;
const UNKNOWN_CMD_COOLDOWN_MS = 5_000;

// Tránh gửi thông báo liên tục trong cùng một box.
const warningCooldowns = new Map();
const unknownCmdCooldowns = new Map();

function getSetting(db, threadId, key, defaultValue = "") {
  const rows = db.query(
    "SELECT value FROM settings WHERE thread_id = ? AND key = ?",
    [threadId, key],
  );

  return rows.length > 0 ? rows[0].value : defaultValue;
}

/** Lấy prefix từ router hoặc biến môi trường; mặc định là dấu chấm. */
function resolvePrefix(router) {
  const configured = router?.getPrefix?.();
  const envPrefix = process.env.BOT_PREFIX;
  const prefix = configured || envPrefix || ".";
  return String(prefix).trim() || ".";
}

function getCommandName(text, prefix) {
  if (typeof text !== "string") return "";
  if (!text.startsWith(prefix)) return "";

  return (
    text
      .slice(prefix.length)
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase() || ""
  );
}

function isRentalCommand(commandName) {
  return [
    "thuebot",
    "rent",
    "giahan",
    "thanhtoan",
    "pay",
    "transfer",
  ].includes(commandName);
}

/** Lệnh hệ thống / admin luôn cho phép kể cả box chưa thuê */
function isPrivilegedCommand(commandName) {
  return [
    "admin", "ad", "adminbot",
    "restart", "rst",
    "reloadconfig", "reload",
    "load", "cmd",
    "setmoney", "setprefix",
    "out", "kick", "kickall",
    "adduser", "qtv",
    "warn", "canhcao",
    "anti", "autodown", "autosend",
    "id", "ping", "help", "menu",
  ].includes(String(commandName || "").toLowerCase());
}

function isRentalActive(db, threadId) {
  const expireMs = Number(
    getSetting(db, threadId, RENTAL_KEY, "0"),
  );

  return Number.isFinite(expireMs) && expireMs > Date.now();
}

async function sendRentalWarning(adapter, threadId, prefix = ".", db = null) {
  const lastWarning = warningCooldowns.get(threadId) || 0;
  const now = Date.now();

  if (now - lastWarning < WARNING_COOLDOWN_MS) {
    return;
  }

  warningCooldowns.set(threadId, now);

  const p = prefix || ".";
  const text =
    "⚠️ Box này chưa thuê bot hoặc đã hết hạn sử dụng.\n" +
    `🔑 Kích hoạt bằng KEY: ${p}rent key <KEY>\n` +
    `🔎 Kiểm tra thời hạn: ${p}rent check`;

  // Ưu tiên ảnh RENT; lỗi bất kỳ thì gửi chữ.
  try {
    const [{ renderRentStatus }, fs, os, path] = await Promise.all([
      import("../Core/Commands/data/HETHONG/Rent/canvas.js"),
      import("node:fs/promises"),
      import("node:os"),
      import("node:path"),
    ]);
    const raw = Number(getSetting(db, threadId, RENTAL_KEY, "0")) || 0;
    const expired = raw > 0 && raw <= now;
    const buf = await renderRentStatus({
      state: expired ? "expired" : "inactive",
      title: expired ? "RENT EXPIRED" : "RENT INACTIVE",
      prefix: p,
      threadId,
      expireText: expired ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(new Date(raw)) : "",
    });
    const file = path.join(os.tmpdir(), `rent-warn-${now}-${Math.random().toString(36).slice(2)}.png`);
    await fs.writeFile(file, buf);
    try {
      await adapter.sendImage({ threadId, threadType: "group", imagePath: file, caption: text });
      return;
    } finally {
      fs.unlink(file).catch(() => {});
    }
  } catch { /* fallback chữ */ }

  await adapter.sendText({ threadId, threadType: "group", text });
}

/**
 * Kiểm tra command có tồn tại trong router không.
 * Hỗ trợ 3 kiểu lưu trữ phổ biến: Map, plain object, hoặc mảng { name, aliases }.
 */
function commandExistsInRouter(router, commandName) {
  const store = router?.commands;
  if (!store) return true; // Không xác định được -> không chặn để tránh false positive.

  if (store instanceof Map) {
    if (store.has(commandName)) return true;
    const aliases = router?.aliases;
    return aliases instanceof Map && aliases.has(commandName);
  }

  if (Array.isArray(store)) {
    return store.some(
      (cmd) =>
        cmd?.name?.toLowerCase() === commandName ||
        cmd?.aliases?.map((a) => a.toLowerCase()).includes(commandName),
    );
  }

  if (typeof store === "object") {
    return Object.prototype.hasOwnProperty.call(store, commandName);
  }

  return true;
}

function getCommandCount(router) {
  const store = router?.commands;
  if (!store) return 0;
  if (store instanceof Map) return store.size;
  if (Array.isArray(store)) return store.length;
  if (typeof store === "object") return Object.keys(store).length;
  return 0;
}

function getCommandCandidates(router) {
  const names = new Set();
  const store = router?.commands;

  if (store instanceof Map) {
    for (const [key, command] of store.entries()) {
      if (key) names.add(String(key).toLowerCase());
      if (command?.name) names.add(String(command.name).toLowerCase());
      for (const alias of command?.aliases || []) {
        if (alias) names.add(String(alias).toLowerCase());
      }
    }
  } else if (Array.isArray(store)) {
    for (const command of store) {
      if (command?.name) names.add(String(command.name).toLowerCase());
      for (const alias of command?.aliases || []) {
        if (alias) names.add(String(alias).toLowerCase());
      }
    }
  } else if (store && typeof store === "object") {
    for (const [key, command] of Object.entries(store)) {
      names.add(String(key).toLowerCase());
      if (command?.name) names.add(String(command.name).toLowerCase());
      for (const alias of command?.aliases || []) {
        if (alias) names.add(String(alias).toLowerCase());
      }
    }
  }

  const aliases = router?.aliases;
  if (aliases instanceof Map) {
    for (const alias of aliases.keys()) names.add(String(alias).toLowerCase());
  }

  return [...names].filter(Boolean);
}

function levenshteinDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }
  return previous[b.length];
}

function findSimilarCommands(router, input, prefix) {
  const normalized = String(input || "").toLowerCase();
  if (!normalized) return [];

  return getCommandCandidates(router)
    .map((name) => ({ name, distance: levenshteinDistance(normalized, name) }))
    .filter((item) => item.distance <= Math.max(2, Math.floor(normalized.length * 0.45)))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((item) => `${prefix}${item.name}`);
}

async function sendUnknownCommandMessage(adapter, router, message, prefix, commandName) {
  const threadId = message.threadId;
  const threadType = message.type === 1 ? "group" : "user";
  const cooldownKey = `${threadId}:${commandName ? "unknown" : "prefix"}`;
  const lastSent = unknownCmdCooldowns.get(cooldownKey) || 0;
  const now = Date.now();

  if (now - lastSent < UNKNOWN_CMD_COOLDOWN_MS) return;
  unknownCmdCooldowns.set(cooldownKey, now);

  let text;
  if (!commandName) {
    text = `Bạn đang tìm lệnh nào đúng không?\nGõ ${prefix}help để xem danh sách lệnh.`;
  } else {
    const similar = findSimilarCommands(router, commandName, prefix);
    text = "Bạn gõ sai tên lệnh rồi!!!!";
    text += similar.length
      ? `\nLệnh gần giống nè: ${similar.join(", ")}`
      : `\nGõ ${prefix}help để xem danh sách lệnh.`;
  }

  await adapter.sendText({ threadId, threadType, text });
}

function createRentalGuard({
  adapter,
  db,
  router,
  logger,
  handleMessage,
}) {
  return async function rentalGuard(message) {
    // Tin nhắn riêng không áp dụng kiểm tra thuê box.
    if (message?.type !== 1) {
      return handleMessage(message);
    }

    // Không xử lý lại tin nhắn của bot.
    if (message?.isSelf) {
      return handleMessage(message);
    }

    const threadId = message.threadId;
    const content = message?.data?.content;

    if (typeof content !== "string") {
      return handleMessage(message);
    }

    const prefix = resolvePrefix(router);
    const commandName = getCommandName(content.trim(), prefix);

    // Không phải command thì không cần cảnh báo.
    if (!commandName) {
      return handleMessage(message);
    }

    // Luôn cho phép kiểm tra thuê bot và thanh toán.
    if (isRentalCommand(commandName)) {
      return handleMessage(message);
    }

    // Lệnh admin/system không bị chặn bởi thuê box
    if (isPrivilegedCommand(commandName)) {
      return handleMessage(message);
    }

    // OWNER / BOT ADMIN luôn được phép (tránh admin bị chặn nhầm)
    try {
      const senderId = String(message?.data?.uidFrom ?? "").trim();
      const bot = global.__NKNP_BOT__;
      if (senderId && bot) {
        if (typeof bot.isBotAdmin === "function" && bot.isBotAdmin(senderId)) {
          return handleMessage(message);
        }
        if (typeof bot.isOwner === "function" && bot.isOwner(senderId)) {
          return handleMessage(message);
        }
      }
    } catch { /* continue block */ }

    if (isRentalActive(db, threadId)) {
      return handleMessage(message);
    }

    logger?.info?.("[Rental] Đã chặn command tại box hết hạn.", {
      threadId,
      commandName,
    });

    await sendRentalWarning(adapter, threadId, prefix, db);

    // Không gọi handleMessage nên command bị chặn hoàn toàn.
    return undefined;
  };
}

/**
 * Khi người dùng chỉ gõ prefix hoặc nhập sai tên lệnh, gửi hướng dẫn ngắn.
 */
function createUnknownCommandGuard({
  adapter,
  router,
  logger,
  handleMessage,
}) {
  return async function unknownCommandGuard(message) {
    const content = message?.data?.content;

    if (typeof content !== "string") {
      return handleMessage(message);
    }

    const prefix = resolvePrefix(router);
    const trimmed = content.trim();

    // Không gõ prefix -> bỏ qua, không phải là lệnh.
    if (!trimmed.startsWith(prefix)) {
      return handleMessage(message);
    }

    const commandName = getCommandName(trimmed, prefix);

    // Chỉ gõ prefix: hướng dẫn mở danh sách lệnh; lệnh sai: gợi ý lệnh gần giống.
    if (!commandName || !commandExistsInRouter(router, commandName)) {
      logger?.info?.("[UnknownCommand] Lệnh không tồn tại hoặc chỉ có prefix.", {
        threadId: message.threadId,
        commandName,
      });

      await sendUnknownCommandMessage(adapter, router, message, prefix, commandName);
      return undefined;
    }

    return handleMessage(message);
  };
}

/**
 * Đăng ký toàn bộ event handler qua adapter.
 */
function registerHandlers({ adapter, router, db, logger }) {
  const originalHandleMessage = createHandleMessage(router);

  const withUnknownCommandGuard = createUnknownCommandGuard({
    adapter,
    router,
    logger,
    handleMessage: originalHandleMessage,
  });

  const withRentalGuard = createRentalGuard({
    adapter,
    db,
    router,
    logger,
    handleMessage: withUnknownCommandGuard,
  });

  // [NKNP V3] Gắn thêm dispatch cho hệ thống "di sản" (NKNP): onReply +
  // handleEvent(eventType="message") — chạy song song (không chặn), không
  // ảnh hưởng luồng xử lý lệnh gốc của EMPHAT phía trên.
  const handleMessage = async (message) => {
    dispatchLegacyReply(message, adapter.raw, logger).catch(() => {});
    dispatchLegacyEvent("message", message, adapter.raw, logger);
    return withRentalGuard(message);
  };

  const originalHandleReaction = createHandleReaction(logger);
  const handleReaction = async (reaction) => {
    dispatchLegacyEvent("reaction", reaction, adapter.raw, logger);
    // Gọi hook onReaction của các lệnh (trước đây không có nơi nào gọi -> thả tim vào phòng không có tác dụng).
    try { await router.runBackgroundReactionHooks?.(reaction); } catch (err) { logger.error("[Core] Lỗi dispatch onReaction:", { message: err?.message }); }
    return originalHandleReaction(reaction);
  };

  const originalHandleUndo = createHandleUndo(logger);
  const handleUndo = async (undo) => {
    dispatchLegacyEvent("undo", undo, adapter.raw, logger);
    return originalHandleUndo(undo);
  };

  const originalHandleGroup = createHandleGroup(router, db, logger);
  const handleGroup = async (groupEvent) => {
    dispatchLegacyEvent("group_event", groupEvent, adapter.raw, logger);
    return originalHandleGroup(groupEvent);
  };

  adapter.startListener({
    onMessage: safeHandler(
      "message",
      handleMessage,
      logger,
    ),

    onReaction: safeHandler(
      "reaction",
      handleReaction,
      logger,
    ),

    onUndo: safeHandler(
      "undo",
      handleUndo,
      logger,
    ),

    onGroupEvent: safeHandler(
      "group_event",
      handleGroup,
      logger,
    ),

    onError: safeHandler(
      "error",
      async (err) => {
        logger.error("[Listener] Lỗi listener:", {
          message: err?.message ?? String(err),
        });
      },
      logger,
    ),

    onConnected: safeHandler(
      "connected",
      async () => {
        logger.info("[Listener] Đã kết nối realtime.");
      },
      logger,
    ),

    onDisconnected: safeHandler(
      "disconnected",
      async (code, reason) => {
        logger.warn("[Listener] Mất kết nối realtime.", {
          code,
          reason,
        });
      },
      logger,
    ),

    onClosed: safeHandler(
      "closed",
      async (code, reason) => {
        logger.warn("[Listener] Listener đã đóng.", {
          code,
          reason,
        });
        adapter.restartListener();
      },
      logger,
    ),
  });

  logger.info(
    "[Handlers] Đã đăng ký event handler và kiểm tra thuê bot.",
  );
}

export { registerHandlers };