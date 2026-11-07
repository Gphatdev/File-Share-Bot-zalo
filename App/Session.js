import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import QRCode from "qrcode";
import { Zalo, LoginQRCallbackEventType } from "zca-mt";
import { NetworkError, AuthenticationError, ZaloApiError } from "zca-mt";

/**
 * App/Session.js — bảo mật cao + backup + Windows ACL
 *
 * Tính năng:
 * - Mã hóa AES-256-GCM
 * - Tự động backup session (tối đa 5 bản)
 * - Tự xóa QR sau đăng nhập
 * - Xóa session hỏng
 * - Siết quyền file trên Windows bằng icacls
 * - Tương thích file session cũ (plain text)
 */

const RETRY_DELAYS_MS = [1500, 3000, 6000, 12000];
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const MAX_BACKUPS = 5;
const LEGACY_SECRET = "nknp-v3-default-secret-change-me";
const KEY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "Session.key");

// ====================== MÃ HÓA / GIẢI MÃ ======================

function getEncryptionKey(logger) {
  const secret = process.env.SESSION_SECRET;
  if (secret) {
    if (secret.length < 32) {
      throw new Error("SESSION_SECRET phải có ít nhất 32 ký tự.");
    }
    return crypto.createHash("sha256").update(secret).digest();
  }

  fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
  let key;
  try {
    key = Buffer.from(fs.readFileSync(KEY_PATH, "utf8").trim(), "base64");
    if (key.length !== 32) throw new Error("Khóa session không hợp lệ.");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    key = crypto.randomBytes(32);
    try {
      fs.writeFileSync(KEY_PATH, key.toString("base64"), { flag: "wx", mode: 0o600 });
    } catch (writeError) {
      if (writeError.code !== "EEXIST") throw writeError;
      key = Buffer.from(fs.readFileSync(KEY_PATH, "utf8").trim(), "base64");
      if (key.length !== 32) throw new Error("Khóa session không hợp lệ.");
    }
    hardenFilePermissions(KEY_PATH, logger);
    logger?.info?.("[Session] Đã tạo khóa mã hóa riêng cho session.");
  }
  return key;
}

function encryptSession(data, logger) {
  const key = getEncryptionKey(logger);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decryptSession(base64Data, logger) {
  if (typeof base64Data !== "string" || !base64Data.trim()) return null;
  const normalized = base64Data.trim();
  // Reject malformed base64 rather than silently accepting Buffer's permissive decoding.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    logger?.warn?.("[Session] Dữ liệu session mã hóa không đúng định dạng.");
    return null;
  }
  const buf = Buffer.from(normalized, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) return null;

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const keys = [{ key: getEncryptionKey(logger), legacy: false }];
  const legacyKey = crypto.createHash("sha256").update(LEGACY_SECRET).digest();
  if (!keys[0].key.equals(legacyKey)) keys.push({ key: legacyKey, legacy: true });

  for (const { key, legacy } of keys) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString("utf8");
      const data = JSON.parse(decrypted);
      if (!data || typeof data !== "object" || Array.isArray(data)) return null;
      return { data, legacy };
    } catch {
      // Thử khóa tương thích cũ trước khi đánh dấu session không hợp lệ.
    }
  }
  logger?.warn?.("[Session] Không thể giải mã session bằng khóa hiện tại hoặc khóa tương thích.");
  return null;
}

// ====================== BACKUP ======================

function getBackupPath(sessionPath, index = 0) {
  // session.json → session.json.bak
  // session.json.bak → session.json.bak.1 ... session.json.bak.4
  if (index === 0) return `${sessionPath}.bak`;
  return `${sessionPath}.bak.${index}`;
}

function encryptPlainSessionFile(filePath, logger) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw.startsWith("{")) return;
    const data = JSON.parse(raw);
    if (!data?.cookie || !data?.imei || !data?.userAgent) return;
    fs.writeFileSync(filePath, encryptSession(data, logger), { mode: 0o600 });
    hardenFilePermissions(filePath, logger);
  } catch (err) {
    logger?.warn?.("[Session] Không thể mã hóa backup session cũ", {
      message: err?.message,
    });
  }
}

function rotateBackups(sessionPath, logger) {
  try {
    // Xóa bản cũ nhất nếu đã đủ MAX_BACKUPS
    const oldest = getBackupPath(sessionPath, MAX_BACKUPS - 1);
    if (fs.existsSync(oldest)) {
      fs.unlinkSync(oldest);
    }

    // Dời các bản cũ lên 1 nấc (bak.3 → bak.4, bak.2 → bak.3 ...)
    for (let i = MAX_BACKUPS - 2; i >= 0; i--) {
      const from = getBackupPath(sessionPath, i);
      const to = getBackupPath(sessionPath, i + 1);
      if (fs.existsSync(from)) {
        fs.renameSync(from, to);
      }
    }

    for (let i = 1; i < MAX_BACKUPS; i++) {
      encryptPlainSessionFile(getBackupPath(sessionPath, i), logger);
    }

    // Backup bản hiện tại thành .bak
    if (fs.existsSync(sessionPath)) {
      fs.copyFileSync(sessionPath, getBackupPath(sessionPath, 0));
      encryptPlainSessionFile(getBackupPath(sessionPath, 0), logger);
      logger?.info?.("[Session] Đã tạo backup session");
    }
  } catch (err) {
    logger?.warn?.("[Session] Lỗi khi tạo backup", {
      message: err?.message,
    });
  }
}

function tryLoadFromBackup(sessionPath, logger) {
  for (let i = 0; i < MAX_BACKUPS; i++) {
    const bakPath = getBackupPath(sessionPath, i);
    if (!fs.existsSync(bakPath)) continue;

    try {
      const raw = fs.readFileSync(bakPath, "utf8").trim();
      let data = null;

      if (raw.startsWith("{")) {
        data = JSON.parse(raw);
      } else {
        data = decryptSession(raw, logger)?.data;
      }

      if (data?.cookie && data?.imei && data?.userAgent) {
        logger?.info?.(`[Session] Khôi phục session từ backup #${i}`);
        return data;
      }
    } catch {
      // bỏ qua backup hỏng
    }
  }
  return null;
}

// ====================== QUYỀN FILE (WINDOWS) ======================

function hardenFilePermissions(filePath, logger) {
  try {
    // Linux / macOS
    fs.chmodSync(filePath, 0o600);

    // Windows — dùng icacls để siết quyền
    if (process.platform === "win32") {
      try {
        // Xóa kế thừa + chỉ cho user hiện tại Full control
        const user = process.env.USERNAME || process.env.USER || "Everyone";
        execSync(
          `icacls "${filePath}" /inheritance:r /grant:r "${user}:F" /C`,
          { stdio: "ignore" },
        );
        logger?.info?.("[Session] Đã siết quyền file trên Windows");
      } catch (err) {
        logger?.warn?.("[Session] Không thể siết ACL Windows (cần quyền admin?)", {
          message: err?.message,
        });
      }
    }
  } catch (err) {
    logger?.warn?.("[Session] Không thể đặt quyền file", {
      message: err?.message,
    });
  }
}

// ====================== FILE HELPERS ======================

function saveSessionFile(sessionPath, data, logger) {
  try {
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

    // Backup trước khi ghi đè
    rotateBackups(sessionPath, logger);

    const encrypted = encryptSession(data, logger);
    // Ghi file tạm cùng thư mục rồi rename để tránh session bị cắt cụt khi tắt đột ngột.
    const tempPath = `${sessionPath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    try {
      fs.writeFileSync(tempPath, encrypted, { flag: "wx", mode: 0o600 });
      hardenFilePermissions(tempPath, logger);
      fs.renameSync(tempPath, sessionPath);
    } finally {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    }

    // Siết quyền file đích sau khi thay thế.
    hardenFilePermissions(sessionPath, logger);
  } catch (err) {
    throw new Error(`Không thể lưu session: ${err.message}`);
  }
}

function loadSessionFile(sessionPath, logger) {
  // 1. Thử file chính
  if (fs.existsSync(sessionPath)) {
    try {
      const raw = fs.readFileSync(sessionPath, "utf8").trim();

      if (raw.startsWith("{")) {
        // File cũ plain text
        const parsed = JSON.parse(raw);
        if (parsed?.cookie && parsed?.imei && parsed?.userAgent) {
          saveSessionFile(sessionPath, parsed, logger);
          logger?.info?.("[Session] Đã chuyển session cũ sang dạng mã hóa.");
          return parsed;
        }
      } else {
        // File mã hóa
        const decrypted = decryptSession(raw, logger);
        const data = decrypted?.data;
        if (data?.cookie && data?.imei && data?.userAgent) {
          if (decrypted.legacy) {
            saveSessionFile(sessionPath, data, logger);
            logger?.info?.("[Session] Đã nâng cấp khóa mã hóa session cũ.");
          }
          return data;
        }
      }
    } catch (err) {
      logger?.warn?.("[Session] Không đọc được session chính; sẽ thử backup.", { message: err?.message });
    }
  }

  // 2. Thử các bản backup
  const backup = tryLoadFromBackup(sessionPath, logger);
  if (backup) saveSessionFile(sessionPath, backup, logger);
  return backup;
}

function deleteFileSafe(filePath, logger) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger?.info?.("[Session] Đã xóa file tạm an toàn");
    }
  } catch (err) {
    logger?.warn?.("[Session] Không thể xóa file tạm", {
      message: err?.message,
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkError(err) {
  if (err instanceof NetworkError) return true;
  const code = err?.cause?.code || err?.code;
  return ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"].includes(
    code,
  );
}

// ====================== IMAGE METADATA ======================

async function imageMetadataGetter(filePath) {
  try {
    const [stat, metadata] = await Promise.all([
      fs.promises.stat(filePath),
      sharp(filePath).metadata(),
    ]);

    if (!metadata?.width || !metadata?.height) return null;

    return {
      width: metadata.width,
      height: metadata.height,
      size: stat.size,
    };
  } catch {
    return null;
  }
}

// ====================== LOGIN QR ======================

async function renderTerminalQr(imageBase64, payload) {
  const { modules } = QRCode.create(payload);
  const size = Math.ceil((modules.size + 8) * 1.5);
  const image = Buffer.from(
    String(imageBase64 || "").replace(/^data:image\/png;base64,/, ""),
    "base64",
  );
  const { data } = await sharp(image)
    .flatten({ background: "#ffffff" })
    .resize(size, size, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const useColor = Boolean(process.stdout.isTTY) && !("NO_COLOR" in process.env);
  const isBlack = (x, y) => data[(y * size + x)] < 128;
  const lines = [];

  if (!useColor) {
    for (let y = 0; y < size; y += 1) {
      let line = "";
      for (let x = 0; x < size; x += 1) {
        line += isBlack(x, y) ? "██" : "  ";
      }
      lines.push(line);
    }
    return lines.join("\n");
  }

  for (let y = 0; y < size; y += 2) {
    let line = "";
    for (let x = 0; x < size; x += 1) {
      const top = isBlack(x, y);
      const bottom = y + 1 < size && isBlack(x, y + 1);
      if (top === bottom) {
        line += `${top ? "\x1b[40m" : "\x1b[47m"} `;
      } else {
        line += top ? "\x1b[30;47m▀" : "\x1b[37;40m▀";
      }
    }
    lines.push(`${line}\x1b[0m`);
  }
  return lines.join("\n");
}

function createLoginAnimation(logger) {
  const frames = ["◜", "◠", "◝", "◞", "◡", "◟"];
  let frame = 0;
  let label = "";
  let timer = null;
  const isInteractive = Boolean(process.stdout.isTTY);

  function draw() {
    if (!isInteractive) return;
    const icon = frames[frame++ % frames.length];
    process.stdout.write(
      `\r\x1b[2K  \x1b[38;2;34;211;238m${icon} ${label}\x1b[0m`,
    );
  }

  function update(nextLabel) {
    label = nextLabel;
    if (!isInteractive) {
      logger.info(`[Session] ${label}`);
      return;
    }
    if (!timer) timer = setInterval(draw, 90);
    draw();
  }

  function stop(message, level = "info") {
    if (timer) clearInterval(timer);
    timer = null;
    if (isInteractive) process.stdout.write("\r\x1b[2K");
    logger[level]?.(`[Session] ${message}`);
  }

  async function complete() {
    if (timer) clearInterval(timer);
    timer = null;
    if (!isInteractive) {
      logger.info("[Session] ĐĂNG NHẬP THÀNH CÔNG.");
      return;
    }

    const width = 16;
    for (let step = 0; step <= width; step += 1) {
      const bar = "█".repeat(step) + "░".repeat(width - step);
      process.stdout.write(
        `\r\x1b[2K  \x1b[38;2;34;211;238mĐang khởi tạo phiên\x1b[0m [${bar}]`,
      );
      await sleep(28);
    }
    process.stdout.write(
      "\r\x1b[2K  \x1b[38;2;74;222;128m╭──────────────────────────────────────╮\x1b[0m\n" +
      "  \x1b[38;2;74;222;128m│  ✓  ĐĂNG NHẬP ZALO THÀNH CÔNG        │\x1b[0m\n" +
      "  \x1b[38;2;74;222;128m╰──────────────────────────────────────╯\x1b[0m\n",
    );
  }

  return { update, stop, complete };
}

async function loginWithQR({ sessionPath, logger }) {
  const zalo = new Zalo({ logging: false, imageMetadataGetter });
  logger.info("[Session] Đang tạo mã QR để đăng nhập...");
  const animation = createLoginAnimation(logger);
  let sessionInfo = null;

  try {
    const api = await zalo.loginQR({}, (event) => {
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated:
          if (!event.data?.code || !event.data?.image) {
            logger.error("[Session] Không nhận được ảnh QR gốc từ Zalo.");
            event.actions.abort();
            break;
          }
          renderTerminalQr(event.data.image, event.data.code)
            .then((qr) => console.log(`\n${qr}\n`))
            .catch((err) => {
              logger.error("[Session] Không render được ảnh QR lên terminal.", {
                message: err?.message ?? String(err),
              });
              event.actions.abort();
            });
          logger.info(
            "[Session] Quét mã QR bằng Zalo: Cài đặt > Thiết bị > Quét mã QR.",
          );
          animation.update("Đang chờ quét mã QR...");
          break;

        case LoginQRCallbackEventType.QRCodeScanned:
          animation.update(
            `Đã quét bởi ${event.data?.display_name || "bạn"} · Đang xác thực đăng nhập...`,
          );
          break;

        case LoginQRCallbackEventType.QRCodeExpired:
          animation.stop("Mã QR hết hạn, đang tạo mã mới...", "warn");
          event.actions.retry();
          break;

        case LoginQRCallbackEventType.QRCodeDeclined:
          animation.stop("Đăng nhập bị từ chối trên điện thoại.", "error");
          event.actions.abort();
          break;

        case LoginQRCallbackEventType.GotLoginInfo:
          sessionInfo = event.data;
          animation.update("Đã xác thực · Đang khởi tạo phiên đăng nhập...");
          break;
      }
    });

    if (!sessionInfo) {
      throw new Error("Không nhận được thông tin session sau khi xác thực QR.");
    }
    saveSessionFile(sessionPath, sessionInfo, logger);
    await animation.complete();
    logger.info("[Session] Đã lưu session đăng nhập (mã hóa + backup).");
    return api;
  } catch (err) {
    animation.stop("Quá trình đăng nhập QR thất bại.", "error");
    throw err;
  }
}

// ====================== LOGIN CHÍNH ======================

async function loginWithSavedSessionOrQR({ sessionPath, logger }) {
  const saved = loadSessionFile(sessionPath, logger);

  if (saved) {
    logger.info("[Session] Tìm thấy session → thử đăng nhập...");

    const zalo = new Zalo({ logging: false, imageMetadataGetter });

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const api = await zalo.login(saved);
        logger.info("[Session] ✓ Đăng nhập bằng session thành công.");
        return api;
      } catch (err) {
        if (isNetworkError(err)) {
          if (attempt < RETRY_DELAYS_MS.length) {
            const delay = RETRY_DELAYS_MS[attempt];
            logger.warn(
              `[Session] Lỗi mạng tạm thời → thử lại sau ${delay}ms ` +
                `(${attempt + 1}/${RETRY_DELAYS_MS.length})`,
            );
            await sleep(delay);
            continue;
          }
          logger.error("[Session] Hết số lần retry lỗi mạng khi dùng session.");
          break;
        }

        if (err instanceof AuthenticationError || err instanceof ZaloApiError) {
          logger.warn(
            "[Session] Session không còn hợp lệ / đã hết hạn → chuyển sang quét QR...",
          );
          // Xóa session chính (backup vẫn còn)
          deleteFileSafe(sessionPath, logger);
          break;
        }

        logger.error("[Session] Lỗi không xác định khi dùng session:", {
          message: err?.message ?? String(err),
        });
        break;
      }
    }
  } else {
    logger.info("[Session] Chưa có session hợp lệ → bắt đầu quét QR...");
  }

  return loginWithQR({ sessionPath, logger });
}

export { loginWithQR, loginWithSavedSessionOrQR, renderTerminalQr };