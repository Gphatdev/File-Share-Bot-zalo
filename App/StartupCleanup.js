import fs from "node:fs";
import path from "node:path";

const TEMP_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SKIP_DIRECTORY_NAMES = new Set([
  ".git",
  "assets",
  "cache",
  "data",
  "fonts",
  "GameAssets",
  "node_modules",
]);

function removeExpiredFiles(directory, cutoff, result, logger) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (err) {
    logger?.warn?.("[Cleanup] Không đọc được thư mục tạm", {
      directory,
      message: err.message,
    });
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removeExpiredFiles(entryPath, cutoff, result, logger);
      continue;
    }
    if (!entry.isFile()) continue;

    try {
      if (fs.statSync(entryPath).mtimeMs >= cutoff) continue;
      fs.unlinkSync(entryPath);
      result.removedTempFiles++;
    } catch (err) {
      logger?.warn?.("[Cleanup] Không xóa được file tạm", {
        file: entryPath,
        message: err.message,
      });
    }
  }
}

function findTempDirectories(directory, cutoff, result, logger) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (err) {
    logger?.warn?.("[Cleanup] Không quét được thư mục lệnh", {
      directory,
      message: err.message,
    });
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP_DIRECTORY_NAMES.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.name.toLowerCase() === "temp") {
      removeExpiredFiles(entryPath, cutoff, result, logger);
    } else {
      findTempDirectories(entryPath, cutoff, result, logger);
    }
  }
}

function removeStaleQr(qrPath, result, logger) {
  if (!qrPath) return;
  const resolvedPath = path.resolve(qrPath);
  try {
    if (!fs.statSync(resolvedPath).isFile()) return;
    fs.unlinkSync(resolvedPath);
    result.removedQr = true;
  } catch (err) {
    if (err.code !== "ENOENT") {
      logger?.warn?.("[Cleanup] Không xóa được QR cũ", {
        file: resolvedPath,
        message: err.message,
      });
    }
  }
}

function cleanupStartupFiles({ commandsPath, qrPath, logger }) {
  const result = { removedTempFiles: 0, removedQr: false };
  const cutoff = Date.now() - TEMP_FILE_MAX_AGE_MS;

  if (commandsPath && fs.existsSync(commandsPath)) {
    findTempDirectories(commandsPath, cutoff, result, logger);
  }
  removeStaleQr(qrPath, result, logger);

  logger?.info?.("[Cleanup] Đã dọn file tạm hết hạn", {
    removedTempFiles: result.removedTempFiles,
    removedQr: result.removedQr,
  });
  return result;
}

export { cleanupStartupFiles };