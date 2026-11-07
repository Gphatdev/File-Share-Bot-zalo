import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Handlers/HandleCommandLoader.js
 *
 * Tự động load các file command trực tiếp trong Core/Commands (không đệ quy
 * vào thư mục con). Validate cấu trúc từng command, phát hiện trùng tên/alias,
 * và đảm bảo một command lỗi không làm hỏng toàn bộ bot.
 *
 * Ngoài loadCommands() (nạp lúc khởi động), file này còn cung cấp:
 *   - registerCommand() : logic đăng ký DÙNG CHUNG cho cả nạp mới lẫn reload.
 *   - reloadCommand()   : nạp lại 1 file lệnh đang chạy (dùng bởi HandleLegacyReload.cjs).
 */

const VALID_ROLES = [0, 1, 2];

function validateCommand(cmd) {
  const errors = [];

  if (!cmd || typeof cmd !== "object") {
    errors.push("export default phải là một object.");
    return errors;
  }
  if (typeof cmd.name !== "string" || !cmd.name.trim()) {
    errors.push("thiếu hoặc sai kiểu trường 'name' (string).");
  }
  if (typeof cmd.run !== "function") {
    errors.push("thiếu hoặc sai kiểu trường 'run' (function).");
  }
  if (cmd.aliases !== undefined) {
    if (
      !Array.isArray(cmd.aliases) ||
      !cmd.aliases.every((a) => typeof a === "string")
    ) {
      errors.push("'aliases' phải là mảng string.");
    }
  }
  if (cmd.role !== undefined && !VALID_ROLES.includes(cmd.role)) {
    errors.push("'role' phải là 0, 1 hoặc 2.");
  }
  if (
    cmd.cooldown !== undefined &&
    (typeof cmd.cooldown !== "number" || !(cmd.cooldown >= 0))
  ) {
    errors.push("'cooldown' phải là số >= 0.");
  }
  if (cmd.onMessage !== undefined && typeof cmd.onMessage !== "function") {
    errors.push("'onMessage' phải là function nếu được khai báo.");
  }
  if (cmd.onReaction !== undefined && typeof cmd.onReaction !== "function") {
    errors.push("'onReaction' phải là function nếu được khai báo.");
  }
  if (cmd.onGroupEvent !== undefined && typeof cmd.onGroupEvent !== "function") {
    errors.push("'onGroupEvent' phải là function nếu được khai báo.");
  }
  if (cmd.commandGuard !== undefined && typeof cmd.commandGuard !== "function") {
    errors.push("'commandGuard' phải là function nếu được khai báo.");
  }

  return errors;
}

/** Chuẩn hoá 1 command đã validate thành shape mà router/bot sử dụng. */
function normalizeCommand(cmd, fileName) {
  const aliasList = [
    ...new Set(
      (cmd.aliases || [])
        .map((alias) => alias.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  return {
    name: cmd.name.trim().toLowerCase(),
    description: cmd.description || "",
    version: cmd.version || "1.0.0",
    author: cmd.author || "HNNP STUDIO",
    group: cmd.group || "general",
    role: cmd.role ?? 0,
    cooldown: cmd.cooldown ?? 0,
    aliases: aliasList,
    noPrefix: Boolean(cmd.noPrefix),
    usage: cmd.usage || cmd.usages || "",
    run: cmd.run,
    onMessage: cmd.onMessage,
    onGroupEvent: cmd.onGroupEvent,
    onReaction: cmd.onReaction,
    // Guard chạy TRƯỚC khi router gọi run() của MỌI lệnh khác (xem HandleCommandRouter) — dùng cho LIMIT.
    commandGuard: cmd.commandGuard,
    __legacyOnLoad: cmd.__legacyOnLoad,
    __legacyOnReply: cmd.__legacyOnReply,
    __legacyHandleEvent: cmd.__legacyHandleEvent,
    // Tên file nguồn: giúp reload biết lệnh nào cần thay khi đổi `name` trong file.
    sourceFile: fileName || null,
  };
}

/** Gỡ hẳn 1 command (tên chính, alias trỏ về nó và hook nền) khỏi bot. */
function unregisterCommand(bot, commandName) {
  const existing = bot.commands.get(commandName);
  if (!existing) return false;

  bot.commands.delete(commandName);
  for (const [alias, owner] of [...bot.aliases.entries()]) {
    if (owner === commandName) bot.aliases.delete(alias);
  }
  const hookIndex = bot.backgroundHooks.indexOf(existing);
  if (hookIndex !== -1) bot.backgroundHooks.splice(hookIndex, 1);
  if (Array.isArray(bot.commandGuards)) {
    const guardIndex = bot.commandGuards.indexOf(existing);
    if (guardIndex !== -1) bot.commandGuards.splice(guardIndex, 1);
  }
  return true;
}

/**
 * Đăng ký 1 command vào bot. Mọi kiểm tra được làm TRƯỚC khi sửa bot.*,
 * nên nếu thất bại thì trạng thái cũ (kể cả bản đang chạy khi reload) vẫn còn nguyên.
 *
 * @param {object} bot
 * @param {any} rawCmd  `export default` của file lệnh
 * @param {string} fileName
 * @param {{ replace?: boolean }} [options] replace=true: thay bản cũ (reload)
 * @returns {{ ok: true, command: object } | { ok: false, errors: string[] }}
 */
function registerCommand(bot, rawCmd, fileName, options = {}) {
  const { replace = false } = options;

  const errors = validateCommand(rawCmd);
  if (errors.length > 0) return { ok: false, errors };

  const normalized = normalizeCommand(rawCmd, fileName);
  const commandName = normalized.name;

  // Các command sẽ bị thay thế (chỉ khi reload): cùng tên hoặc cùng file nguồn.
  const replacing = new Set();
  if (replace) {
    for (const [name, existing] of bot.commands) {
      if (name === commandName || (fileName && existing.sourceFile === fileName)) {
        replacing.add(name);
      }
    }
  }

  // Ai đang giữ khoá `key` (tên chính hoặc alias)? undefined nếu chưa ai.
  const ownerOf = (key) => (bot.commands.has(key) ? key : bot.aliases.get(key));

  const nameOwner = ownerOf(commandName);
  if (nameOwner && !replacing.has(nameOwner)) {
    return {
      ok: false,
      errors: [
        nameOwner === commandName
          ? `tên command '${commandName}' đã tồn tại.`
          : `tên command '${commandName}' trùng với alias của lệnh '${nameOwner}'.`,
      ],
    };
  }

  for (const alias of normalized.aliases) {
    if (alias === commandName) {
      return { ok: false, errors: [`alias '${alias}' bị trùng với tên lệnh.`] };
    }
    const owner = ownerOf(alias);
    if (owner && !replacing.has(owner)) {
      return {
        ok: false,
        errors: [`alias '${alias}' bị trùng với lệnh '${owner}'.`],
      };
    }
  }

  for (const name of replacing) unregisterCommand(bot, name);

  bot.commands.set(commandName, normalized);
  for (const alias of normalized.aliases) {
    bot.aliases.set(alias, commandName);
  }
  if (normalized.onMessage || normalized.onGroupEvent || normalized.onReaction) {
    bot.backgroundHooks.push(normalized);
  }
  if (normalized.commandGuard) {
    if (!Array.isArray(bot.commandGuards)) bot.commandGuards = [];
    bot.commandGuards.push(normalized);
  }

  return { ok: true, command: normalized, replaced: [...replacing] };
}

/**
 * @param {string} commandsDir Đường dẫn tuyệt đối tới Core/Commands
 * @param {ReturnType<import('../App/BotInstance.js').createBotInstance>} bot
 * @param {{ info:Function, warn:Function, error:Function }} logger
 */
async function loadCommands(commandsDir, bot, logger) {
  if (!fs.existsSync(commandsDir)) {
    throw new Error(`Không tìm thấy thư mục lệnh: ${commandsDir}`);
  }

  const entries = fs
    .readdirSync(commandsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".js"))
    .sort((a, b) => a.name.localeCompare(b.name));

  let loaded = 0;
  let failed = 0;

  for (const entry of entries) {
    const filePath = path.join(commandsDir, entry.name);
    try {
      const mod = await import(pathToFileURL(filePath).href);
      const result = registerCommand(bot, mod.default, entry.name);

      if (!result.ok) {
        logger.error(
          `[HandleCommandLoader] Bỏ qua ${entry.name}: ${result.errors.join(" ")}`,
        );
        failed++;
        continue;
      }
      loaded++;
    } catch (err) {
      logger.error(`[HandleCommandLoader] Lỗi khi load ${entry.name}:`, {
        message: err?.message,
        stack: err?.stack,
      });
      failed++;
    }
  }

  logger.info(`[HandleCommandLoader] Đã load ${loaded} command, ${failed} thất bại.`);
  return { loaded, failed };
}

/**
 * Nạp lại 1 file lệnh khi bot đang chạy (cache-busting bằng query string vì
 * ESM không có require.cache để xoá).
 *
 * @param {string} commandsDir
 * @param {string} baseName Tên file không đuôi, vd "ping"
 * @param {object} bot
 * @returns {Promise<{ ok: boolean, errors?: string[], command?: object }>}
 */
async function reloadCommand(commandsDir, baseName, bot) {
  const fileName = `${baseName}.js`;
  const filePath = path.join(commandsDir, fileName);

  if (!fs.existsSync(filePath)) {
    return { ok: false, errors: [`Không tìm thấy file ${fileName}`] };
  }

  const mod = await import(`${pathToFileURL(filePath).href}?update=${Date.now()}`);
  return registerCommand(bot, mod.default, fileName, { replace: true });
}

export {
  loadCommands,
  reloadCommand,
  registerCommand,
  unregisterCommand,
  normalizeCommand,
  validateCommand,
};
