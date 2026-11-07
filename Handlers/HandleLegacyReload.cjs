/**
 * Handlers/HandleLegacyReload.cjs
 *
 * Shim thay thế cho core/loader/loaderCommand.js gốc của NKNP — dùng bởi các
 * lệnh port sang (vd cmd.js) để tải lại / gỡ lệnh lúc bot đang chạy.
 *
 * Trước đây shim này tự set thẳng vào bot.commands (bỏ qua validate, không
 * chuẩn hoá, không dọn alias/hook cũ). Nay nó dùng lại đúng logic của
 * HandleCommandLoader.js nên lệnh reload có hành vi y hệt lệnh nạp lúc khởi động.
 *
 * Cách dùng (tương thích chữ ký cũ):
 *   const loaderCommand = require("../../Handlers/HandleLegacyReload.cjs");
 *   await loaderCommand("ping");   // reload 1 lệnh
 *   await loaderCommand();         // reload toàn bộ lệnh trong Core/Commands
 *   await loaderCommand.unload("ping");
 */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const COMMANDS_DIR = path.join(__dirname, "..", "Core", "Commands");

function loadHandlers() {
  return Promise.all([
    import(pathToFileURL(path.join(__dirname, "HandleCommandLoader.js")).href),
    import(pathToFileURL(path.join(__dirname, "HandleLegacyBridge.js")).href),
  ]);
}

async function loadCommands(commandName = null) {
  try {
    const bot = global.__NKNP_BOT__;
    if (!bot) {
      return { status: false, error: "Bot chưa sẵn sàng (global.__NKNP_BOT__ chưa được đặt)." };
    }

    const [loader, bridge] = await loadHandlers();

    const targets = commandName
      ? [String(commandName).replace(/\.js$/, "")]
      : fs
          .readdirSync(COMMANDS_DIR, { withFileTypes: true })
          .filter((e) => e.isFile() && e.name.endsWith(".js"))
          .map((e) => e.name.replace(/\.js$/, ""))
          .sort();

    const failures = [];
    let reloaded = 0;
    for (const baseName of targets) {
      try {
        const result = await loader.reloadCommand(COMMANDS_DIR, baseName, bot);
        if (result.ok) reloaded++;
        else failures.push(`${baseName}: ${result.errors.join(" ")}`);
      } catch (err) {
        failures.push(`${baseName}: ${err?.message || err}`);
      }
    }

    bridge.syncShadowCommandRegistry(bot);

    if (failures.length > 0 && reloaded === 0) {
      return { status: false, error: failures.join("\n") };
    }
    return {
      status: true,
      restart: false,
      reloaded,
      failed: failures.length,
      errors: failures,
    };
  } catch (err) {
    return { status: false, error: err?.message || String(err) };
  }
}

/** Gỡ 1 lệnh (theo tên lệnh HOẶC tên file) khỏi bot đang chạy. */
async function unloadCommand(nameOrFile) {
  try {
    const bot = global.__NKNP_BOT__;
    if (!bot) return { status: false, error: "Bot chưa sẵn sàng." };

    const key = String(nameOrFile || "").replace(/\.js$/, "").toLowerCase();
    let target = null;
    for (const [name, cmd] of bot.commands) {
      if (name === key || (cmd.sourceFile && cmd.sourceFile.replace(/\.js$/, "").toLowerCase() === key)) {
        target = name;
        break;
      }
    }
    if (!target) return { status: false, error: `Lệnh '${nameOrFile}' chưa được tải.` };

    const [loader, bridge] = await loadHandlers();
    loader.unregisterCommand(bot, target);
    bridge.syncShadowCommandRegistry(bot);
    return { status: true, name: target };
  } catch (err) {
    return { status: false, error: err?.message || String(err) };
  }
}

module.exports = loadCommands;
module.exports.unload = unloadCommand;
