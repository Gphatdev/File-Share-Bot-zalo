import { createQuotedApi, getMessageQuote } from "../App/ZcaAdapter.js";
import { createChatConsole } from "../Utils/ConsoleUI.js";
import { Reactions } from "zca-mt";

/**
 * Handlers/HandleCommandRouter.js
 *
 * Định tuyến tin nhắn -> lệnh: chạy hook nền, tách prefix, kiểm tra quyền,
 * cooldown rồi gọi run() của lệnh. Cũng xuất resolveSenderRole() cho các lệnh
 * cần tự kiểm tra quyền.
 */

const GROUP_THREAD_TYPE = 1;
const COMMAND_REACTIONS = [
  Reactions.HEART,
  Reactions.LIKE,
  Reactions.HAHA,
  Reactions.WOW,
  Reactions.LOVE,
  Reactions.ROSE,
  Reactions.SUN,
  Reactions.HANDCLAP,
  Reactions.BIRTHDAY,
  Reactions.OK,
];

function createCommandAdapter(adapter, message) {
  // Không tự động gán quote/reply vào tin nhắn gửi đi của bot.
  // Tin nhắn bot gửi sẽ là tin nhắn bình thường (gửi ảnh và text cùng 1 tin nhắn).
  return adapter;
}

function extractText(message) {
  const content = message?.data?.content;
  return typeof content === "string" ? content : null;
}

function parseCommand(text, prefix) {
  if (typeof text !== "string" || !prefix || !text.startsWith(prefix)) return null;
  const withoutPrefix = text.slice(prefix.length).trim();
  if (!withoutPrefix) return null;
  const [rawName, ...args] = withoutPrefix.split(/\s+/);
  return { name: rawName.toLowerCase(), args };
}

function parseUnprefixedCommand(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const [rawName, ...args] = trimmed.split(/\s+/);
  return { name: rawName.toLowerCase(), args };
}

function normalizeCommandKey(value) {
  return String(value || "").trim().toLowerCase();
}

async function resolveSenderRole(bot, message, senderId) {
  const sender = String(senderId ?? "").trim();
  if (!sender) return 0;

  // Ưu tiên Utils/Permission qua bot helpers (OWNER / BOT ADMIN = 2)
  try {
    if (typeof bot?.isOwner === "function" && bot.isOwner(sender)) return 2;
  } catch { /* continue */ }

  try {
    if (typeof bot?.isBotAdmin === "function" && bot.isBotAdmin(sender)) return 2;
  } catch { /* continue */ }

  // Support bot = role 1 (đủ dùng lệnh quản lý nhóm / out)
  try {
    if (typeof bot?.isSupport === "function" && bot.isSupport(sender)) return 1;
  } catch { /* continue */ }

  if (message?.type !== GROUP_THREAD_TYPE) return 0;
  if (typeof bot?.adapter?.getGroupAdmins !== "function") return 0;

  try {
    const groupAdmins = await bot.adapter.getGroupAdmins(message.threadId);
    if (!groupAdmins) return 0;

    const creatorId = String(groupAdmins.creatorId ?? "").trim();
    const adminIds = Array.isArray(groupAdmins.adminIds)
      ? groupAdmins.adminIds.map((id) => String(id).trim())
      : [];

    if (creatorId === sender || adminIds.includes(sender)) return 1;
  } catch {
    return 0;
  }

  return 0;
}

function isBotOwnerOrAdmin(bot, senderId) {
  const sender = String(senderId ?? "").trim();
  if (!sender) return false;
  for (const check of [bot?.isOwner, bot?.isBotAdmin]) {
    try {
      if (typeof check === "function" && check(sender)) return true;
    } catch {
      // A broken permission helper must not grant prefix-free command access.
    }
  }
  return false;
}

function createCommandRouter(bot) {
  const { logger } = bot;

  // In mỗi tin nhắn nhận được ra console (mỗi nhóm một màu). Tắt: CONSOLE_CHAT=off
  const chatConsole = createChatConsole({
    enabled: String(process.env.CONSOLE_CHAT ?? "on").toLowerCase() !== "off",
    getAdapter: () => bot.adapter,
    getPrefix: () => bot.config?.botPrefix ?? "",
  });

  async function runBackgroundHooks(message) {
    // Snapshot giúp !load / reload có thể thay mảng hook an toàn trong lúc đang xử lý tin nhắn.
    for (const cmd of [...bot.backgroundHooks]) {
      if (!cmd.onMessage) continue;
      try {
        await cmd.onMessage({ adapter: bot.adapter, message, config: bot.config, db: bot.db, logger });
      } catch (err) {
        logger.error(`[HandleCommandRouter] Lỗi hook onMessage của '${cmd.name}':`, {
          message: err?.message,
          stack: err?.stack,
        });
      }
    }
  }

  async function runBackgroundGroupHooks(event) {
    for (const cmd of [...bot.backgroundHooks]) {
      if (!cmd.onGroupEvent) continue;
      try {
        await cmd.onGroupEvent({ adapter: bot.adapter, event, config: bot.config, db: bot.db, logger });
      } catch (err) {
        logger.error(`[HandleCommandRouter] Lỗi hook onGroupEvent của '${cmd.name}':`, {
          message: err?.message,
          stack: err?.stack,
        });
      }
    }
  }

  /** Reaction (thả tim...) -> hook onReaction của các lệnh (vd: ott tham gia phòng bằng ❤️). */
  async function runBackgroundReactionHooks(reaction) {
    if (reaction?.isSelf) return;
    for (const cmd of [...bot.backgroundHooks]) {
      if (typeof cmd.onReaction !== "function") continue;
      try {
        await cmd.onReaction({ adapter: bot.adapter, reaction, config: bot.config, db: bot.db, logger });
      } catch (err) {
        logger.error(`[HandleCommandRouter] Lỗi hook onReaction của '${cmd.name}':`, {
          message: err?.message,
          stack: err?.stack,
        });
      }
    }
  }

  async function handleMessage(message) {
    if (message?.isSelf) return;
    chatConsole.log(message);
    await runBackgroundHooks(message);

    const text = extractText(message);
    if (text === null) return;
    let parsed = parseCommand(text, bot.config.botPrefix);
    let senderRole = null;
    if (!parsed) {
      parsed = parseUnprefixedCommand(text);
      if (!parsed) return;
      const commandName =
        bot.aliases.get(normalizeCommandKey(parsed.name)) ||
        normalizeCommandKey(parsed.name);
      if (!bot.commands.has(commandName)) return;

      const senderId = message.data?.uidFrom;
      if (!senderId || !message.threadId) return;
      if (!isBotOwnerOrAdmin(bot, senderId)) return;
      senderRole = 2;
    }

    const commandName =
      bot.aliases.get(normalizeCommandKey(parsed.name)) ||
      normalizeCommandKey(parsed.name);
    const cmd = bot.commands.get(commandName);
    if (!cmd) return;

    const senderId = message.data?.uidFrom;
    if (!senderId || !message.threadId) return;

    // Chỉ tốn 1 lần gọi API lấy admin nhóm khi lệnh thật sự yêu cầu quyền > 0.
    if (cmd.role > 0) {
      if (senderRole === null) {
        senderRole = await resolveSenderRole(bot, message, senderId);
      }
      if (senderRole < cmd.role) {
        const need = cmd.role >= 2 ? "BOT ADMIN / OWNER" : "ADMIN NHÓM / SUPPORT / BOT ADMIN";
        const have = senderRole >= 2 ? "BOT ADMIN" : senderRole >= 1 ? "GROUP ADMIN/SUPPORT" : "USER";
        await safeReply(
          message,
          `🛡️ ACCESS DENIED\n\nBạn không có quyền dùng lệnh này.\nRequired: ${need}\nYour role: ${have}\n\nUID: ${senderId}`
        );
        return;
      }
    }

    // Guard (LIMIT PRO): chặn theo nhóm chức năng / BLOCK từng lệnh trước khi tốn cooldown và chạy lệnh.
    if (message.type === GROUP_THREAD_TYPE && !(await passCommandGuards(message, cmd, parsed.args))) return;

    const waitSeconds = bot.isOnCooldown(message.threadId, senderId, cmd.name, cmd.cooldown);
    if (waitSeconds > 0) {
      await safeReply(message, `Vui lòng chờ ${waitSeconds}s trước khi dùng lại lệnh này.`);
      return;
    }

    try {
      await cmd.run({
        adapter: createCommandAdapter(bot.adapter, message),
        message,
        args: parsed.args,
        commands: bot.commands,
        aliases: bot.aliases,
        backgroundHooks: bot.backgroundHooks,
        commandGuards: bot.commandGuards,
        config: bot.config,
        db: bot.db,
        logger,
      });
      recordCommandUse(bot.db, cmd.name);
      if (typeof bot.adapter.reactToMessage === "function") {
        const icon = COMMAND_REACTIONS[
          Math.floor(Math.random() * COMMAND_REACTIONS.length)
        ];
        try {
          await bot.adapter.reactToMessage(message, icon);
        } catch (err) {
          logger.warn("[HandleCommandRouter] Không thả được reaction cho lệnh.", {
            command: cmd.name,
            message: err?.message ?? String(err),
          });
        }
      }
    } catch (err) {
      logger.error(`[HandleCommandRouter] Lỗi khi chạy lệnh '${cmd.name}':`, {
        message: err?.message,
        stack: err?.stack,
      });
      await safeReply(message, "Đã xảy ra lỗi khi thực hiện lệnh. Vui lòng thử lại sau.");
    }
  }

  /** true = cho chạy. Guard lỗi → fail-open (ghi log) để không làm sập luồng lệnh. */
  async function passCommandGuards(message, cmd, args) {
    const guards = Array.isArray(bot.commandGuards) ? [...bot.commandGuards] : [];
    for (const owner of guards) {
      try {
        const verdict = await owner.commandGuard({
          bot,
          adapter: bot.adapter,
          message,
          command: cmd,
          args,
          commands: bot.commands,
          aliases: bot.aliases,
          config: bot.config,
          db: bot.db,
          logger,
        });
        if (verdict && verdict.allow === false) return false;
      } catch (err) {
        logger.error(`[HandleCommandRouter] Lỗi commandGuard của '${owner.name}':`, {
          message: err?.message,
          stack: err?.stack,
        });
      }
    }
    return true;
  }

  async function safeReply(message, text) {
    try {
      await bot.adapter.sendText({
        threadId: message.threadId,
        threadType: message.type === GROUP_THREAD_TYPE ? "group" : "user",
        text,
      });
    } catch (err) {
      logger.error("[HandleCommandRouter] Không gửi được phản hồi:", { message: err?.message });
    }
  }

  function recordCommandUse(db, commandName) {
    try {
      db.query(
        `INSERT INTO command_stats (command_name, uses, last_used_at)
         VALUES (?, 1, ?)
         ON CONFLICT(command_name) DO UPDATE SET
           uses = uses + 1,
           last_used_at = excluded.last_used_at`,
        [commandName, Date.now()],
      );
    } catch (err) {
      logger.error("[HandleCommandRouter] Lỗi khi ghi command_stats:", { message: err?.message });
    }
  }

  return {
    handleMessage,
    runBackgroundGroupHooks,
    runBackgroundReactionHooks,
    resolveSenderRole: (message, senderId) => resolveSenderRole(bot, message, senderId),
    commands: bot.commands,
    aliases: bot.aliases,
    /** Prefix hiện hành (đọc động, để phản ánh cả khi đổi qua !setprefix / config.yml). */
    getPrefix: () => bot.config.botPrefix,
  };
}

export {
  createCommandRouter,
  extractText,
  parseCommand,
  parseUnprefixedCommand,
  resolveSenderRole,
};
