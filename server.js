import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * server.js
 *
 * Dashboard Express tối giản, CHỈ ĐỌC. Không có terminal từ xa, không có
 * endpoint thực thi lệnh tùy ý, không sửa file source, không hiển thị
 * session/cookie/imei. Bind mặc định vào 127.0.0.1 — nếu muốn public,
 * xem README để thêm xác thực trước.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LISTEN_RETRY_MAX_MS = 2_000; // tổng thời gian tối đa để thử lại TRÊN MỘT port
const LISTEN_RETRY_INTERVAL_MS = 500; // khoảng cách giữa mỗi lần thử
const LISTEN_MAX_PORT_ATTEMPTS = 10; // nếu port gốc vẫn bận, thử tối đa bấy nhiêu port kế tiếp (port+1, port+2, ...)

function createServer(bot) {
  const app = express();

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api/health", (req, res) => {
    res.json({
      status: "online",
      botName: bot.config.botName,
      uptimeMs: Date.now() - bot.config.startedAt,
    });
  });

  app.get("/api/stats", (req, res) => {
    try {
      const userCount = bot.db.query("SELECT COUNT(*) AS c FROM users")[0]?.c ?? 0;
      const groupCount = bot.db.query("SELECT COUNT(*) AS c FROM groups")[0]?.c ?? 0;
      res.json({
        botName: bot.config.botName,
        prefix: bot.config.botPrefix,
        uptimeMs: Date.now() - bot.config.startedAt,
        commandCount: bot.commands.size,
        userCount,
        groupCount,
      });
    } catch (err) {
      res.status(500).json({ error: "Không lấy được thống kê." });
    }
  });

  app.get("/api/commands", (req, res) => {
    const list = [...bot.commands.values()].map((c) => ({
      name: c.name,
      description: c.description,
      group: c.group,
      role: c.role,
      cooldown: c.cooldown,
      aliases: c.aliases,
    }));
    res.json({ commands: list });
  });

  return app;
}

/**
 * Thử bind vào ĐÚNG một port, tự lặp lại trong tối đa LISTEN_RETRY_MAX_MS
 * khi gặp EADDRINUSE (tiến trình cũ chưa kịp giải phóng port hẳn).
 * Trả về Promise resolve khi bind thành công, reject nếu hết thời gian thử
 * (lỗi reject vẫn mang err.code === "EADDRINUSE" để hàm gọi bên ngoài biết
 * mà chuyển sang port kế tiếp).
 */
function listenOnce(app, port, host, logger) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let server;
    let warnedBusy = false; // chỉ log cảnh báo "đang bận" MỘT LẦN cho mỗi port, tránh spam log mỗi 500ms

    const tryListen = () => {
      server = app.listen(port, host);

      server.once("listening", () => {
        logger.info(`[Dashboard] Đang chạy tại http://${host}:${port} (chỉ localhost).`);
        resolve(server);
      });

      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          const elapsed = Date.now() - startedAt;

          if (!warnedBusy) {
            warnedBusy = true;
            logger.warn(
              `[Dashboard] Port ${port} đang bận (có thể do tiến trình cũ chưa thoát hẳn), đang thử lại trong tối đa ${LISTEN_RETRY_MAX_MS}ms...`,
            );
          }

          if (elapsed >= LISTEN_RETRY_MAX_MS) {
            logger.warn(
              `[Dashboard] Port ${port} vẫn đang bị chiếm sau ${elapsed}ms, chuyển sang port khác...`,
            );
            reject(err);
            return;
          }

          // Thử lại ngầm, không log thêm mỗi lần — chỉ log 1 lần ở trên và 1 lần khi bỏ cuộc/thành công.
          setTimeout(tryListen, LISTEN_RETRY_INTERVAL_MS);
          return;
        }

        // Lỗi khác EADDRINUSE thì báo lỗi ngay, không retry.
        reject(err);
      });
    };

    tryListen();
  });
}

/**
 * Bind port với cơ chế tự thử lại khi gặp EADDRINUSE. Nếu port gốc vẫn
 * bận sau khi đã thử lại hết LISTEN_RETRY_MAX_MS (thường do một tiến trình
 * node cũ — ví dụ từ lần chạy/`--watch` trước — vẫn còn giữ port), tự động
 * chuyển sang thử các port kế tiếp (port+1, port+2, ...) thay vì bỏ cuộc
 * hẳn, để dashboard luôn khởi động được.
 */
async function listenWithRetry(app, port, host, logger) {
  let lastErr;

  for (let attempt = 0; attempt <= LISTEN_MAX_PORT_ATTEMPTS; attempt += 1) {
    const candidatePort = port + attempt;

    try {
      return await listenOnce(app, candidatePort, host, logger);
    } catch (err) {
      if (err.code !== "EADDRINUSE") throw err;
      lastErr = err;
    }
  }

  logger.error(
    `[Dashboard] Đã thử ${LISTEN_MAX_PORT_ATTEMPTS + 1} port liên tiếp từ ${port} nhưng đều bận, bỏ cuộc.`,
  );
  throw lastErr;
}

async function startServer(bot, logger) {
  const app = createServer(bot);
  const server = await listenWithRetry(app, bot.config.port, "127.0.0.1", logger);
  return server;
}

export { createServer, startServer };