/**
 * RENT — hệ thống quản lý thuê bot (nâng cấp từ `thuebot`).
 *
 *  .rent                    menu (ảnh)
 *  .rent check              xem thời hạn của box
 *  .rent key <KEY>          kích hoạt / gia hạn bằng KEY
 *  .rent list [trang]       (owner) danh sách box
 *  .rent add|set <ngày>     (owner) cộng thêm / đặt lại thời hạn
 *  .rent off                (owner) tắt thuê bot của box
 *  .rent genkey <ngày> [số lượng] [hạn dùng KEY (ngày)]   (owner) tạo KEY, gửi riêng
 *  .rent keys | .rent delkey <KEY>                        (owner)
 *  .rent admin set|off|test                               (admin) báo cáo hằng ngày về box admin
 *  .rent del <ngày>                                       (admin) trừ ngày thuê hiện tại
 *  .rent tb on|off                                        bật/tắt nhắc số ngày thuê hằng ngày
 *  .rent gmail [list|del <email>|cancel]                  (admin, inbox) quản lý nhiều email nhận
 *  Tự rời box: sau `rentalAutoLeaveMinutes` (mặc định 60) phút kể từ khi hết hạn mà chưa gia hạn.
 *
 * Alias: thuebot, giahan.  Dữ liệu cũ (bot:rental:*) được giữ nguyên.
 */
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nodemailer from "nodemailer";

import { isOwner as isOwnerUid, isBotAdmin } from "../../Utils/Permission.js";
import * as S from "./data/HETHONG/Rent/store.js";
import {
  addAdminGmail,
  getAdminGmails,
  isValidAdminGmail,
  removeAdminGmail,
} from "./data/HETHONG/Rent/adminGmail.js";

const REMINDED_BACKOFF_MS = 7 * S.DAY_MS; // không nhắc "hết hạn" cho box đã chết quá 7 ngày
const SWEEP_EVERY_MS = 30 * 60_000;
const TICK_MS = 60_000;
const PAGE_SIZE = 8;
const REPORT_ITEMS = 8;
const RENT_TB_KEY = "rent:dailyReminder";
const RENT_TB_DATE_KEY = "rent:dailyReminderDate";
const GMAIL_PENDING_PREFIX = "rent:gmail:pending:";
const GMAIL_RECIPIENT_KEY = "rent:gmail:recipient";
const RENT_EXPIRED_EMAIL_KEY = "rent:email:expired";

let canvasMod = null;
async function canvas() {
  if (!canvasMod) canvasMod = await import("./data/HETHONG/Rent/canvas.js");
  return canvasMod;
}

const getPrefix = (config) => String(config?.botPrefix || ".");
const senderOf = (message) => String(message?.data?.uidFrom ?? "");
const isOwner = (config, uid) => isOwnerUid(uid, config);
const isAdmin = (config, uid) => isBotAdmin(uid, config);

// ───────────────────────── gửi ảnh + fallback chữ ─────────────────────────
async function sendText(adapter, threadId, text, threadType = "group") {
  await adapter.sendText({ threadId, threadType, text });
}

/**
 * Vẽ ảnh rồi gửi. Lỗi vẽ/gửi ảnh → gửi bản chữ (không crash).
 * @returns {Promise<boolean>} true nếu gửi ảnh thành công
 */
async function sendCanvas(adapter, threadId, threadType, render, fallbackText, logger) {
  let file = null;
  try {
    const buf = await render();
    const dir = join(tmpdir(), "rent-canvas");
    await mkdir(dir, { recursive: true });
    file = join(dir, `rent-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    await writeFile(file, buf);
    await adapter.sendImage({ threadId, threadType, imagePath: file, caption: fallbackText || "" });
    return true;
  } catch (err) {
    logger?.warn?.("[rent] Gửi ảnh thất bại, dùng chữ", { message: err?.message });
  } finally {
    if (file) unlink(file).catch(() => {});
  }
  if (!fallbackText) return false;
  try {
    await sendText(adapter, threadId, fallbackText, threadType);
  } catch (err) {
    logger?.warn?.("[rent] Gửi chữ cũng thất bại", { message: err?.message });
  }
  return false;
}

// ───────────────────────── tên box ─────────────────────────
const nameCache = new Map(); // threadId -> {name, at}
async function threadName(adapter, threadId) {
  const hit = nameCache.get(threadId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.name;
  let name = "";
  try {
    const api = adapter?.raw;
    if (api?.getGroupInfo) {
      const info = await Promise.race([
        api.getGroupInfo(threadId),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
      ]);
      name = String(info?.gridInfoMap?.[threadId]?.name || "").trim();
    }
  } catch { /* bỏ qua */ }
  nameCache.set(threadId, { name, at: Date.now() });
  return name;
}

// ───────────────────────── nhắc hạn ─────────────────────────
function statusPayload(state, { threadId, name, expireMs, prefix }) {
  const remainingMs = Math.max(0, expireMs - Date.now());
  return {
    state, prefix, threadId, threadName: name || undefined,
    remainingMs, expireText: expireMs ? S.vnDateTime(expireMs) : "",
  };
}

async function checkRentalReminder({ adapter, threadId, db, config, logger }) {
  const expireMs = S.getExpire(db, threadId);
  if (expireMs <= 0) return;

  const now = Date.now();
  const remaining = expireMs - now;
  const value = String(expireMs);
  const prefix = getPrefix(config);

  let keyName, state, title, banner, head;
  if (remaining <= 0) {
    if (-remaining > REMINDED_BACKOFF_MS) return; // box chết lâu rồi, không nhắc nữa
    keyName = S.REMINDED_EXPIRED_KEY; state = "expired";
    title = "RENT EXPIRED"; banner = "HẾT HẠN"; head = "⛔ Thời hạn thuê bot đã kết thúc";
    const lm = S.getLeaveMinutes(config);
    if (lm) head += `\n⏳ Bot sẽ tự rời box sau ${lm} phút nếu không gia hạn.`;
  } else if (remaining <= S.DAY_MS) {
    keyName = S.REMINDED_1D_KEY; state = "expiring";
    title = "RENT EXPIRING"; banner = "WARNING"; head = "⚠️ Bot sắp hết hạn";
  } else if (remaining <= 3 * S.DAY_MS) {
    keyName = S.REMINDED_3D_KEY; state = "expiring";
    title = "RENT REMINDER"; banner = "REMINDER"; head = "🔔 Nhắc gia hạn bot";
  } else return;

  if (S.getSetting(db, threadId, keyName, "") === value) return;
  if (S.getLeft(db, threadId) === value) return; // bot đã rời box này
  // Đánh dấu trước: nếu gửi lỗi cũng không spam lại mỗi lần (lần sau mốc mới sẽ nhắc).
  S.setSetting(db, threadId, keyName, value);

  try {
    const name = await threadName(adapter, threadId);
    const payload = { ...statusPayload(state, { threadId, name, expireMs, prefix }), title, banner };
    const fallback =
      `${head}\n` +
      (remaining > 0 ? `Còn lại: ${humanRemaining(remaining)}\n` : "") +
      `Hết hạn: ${S.vnDateTime(expireMs)}\n` +
      `Dùng ${prefix}rent key <KEY> để gia hạn.`;
    await sendCanvas(adapter, threadId, "group", async () => (await canvas()).renderRentStatus(payload), fallback, logger);
  } catch (err) {
    logger?.warn?.("[rent] Không gửi được nhắc hạn", { threadId, message: err?.message });
  }
}

function humanRemaining(ms) {
  const d = Math.floor(ms / S.DAY_MS);
  const h = Math.floor((ms % S.DAY_MS) / S.HOUR_MS);
  const m = Math.floor((ms % S.HOUR_MS) / 60_000);
  if (d > 0) return `${d} ngày ${h} giờ`;
  if (h > 0) return `${h} giờ ${m} phút`;
  return `${m} phút`;
}

// ───────────────────────── dữ liệu danh sách / báo cáo ─────────────────────────
function summarize(db) {
  const now = Date.now();
  const rows = S.listRentals(db).filter((r) => r.expireMs > 0).map((r) => ({
    ...r, state: S.rentalState(r.expireMs, now), remainingMs: Math.max(0, r.expireMs - now),
  }));
  const expired = rows.filter((r) => r.state === "expired").length;
  const expiring = rows.filter((r) => r.state === "expiring").length;
  return { rows, total: rows.length, expired, expiring, active: rows.length - expired };
}

async function toListRows(adapter, list, offset) {
  const names = await Promise.all(list.map((r) => threadName(adapter, r.threadId)));
  return list.map((r, i) => ({
    index: offset + i + 1, name: names[i] || undefined, threadId: r.threadId,
    state: r.state, remainingMs: r.remainingMs, expireText: S.vnDateTime(r.expireMs),
  }));
}

async function buildReport(adapter, db) {
  const sum = summarize(db);
  const now = Date.now();
  const prio = { expiring: 0, expired: 1, active: 2 };
  const ordered = [...sum.rows].sort((a, b) =>
    prio[a.state] - prio[b.state] ||
    (a.state === "expired" ? b.expireMs - a.expireMs : a.expireMs - b.expireMs));
  const top = ordered.slice(0, REPORT_ITEMS);
  const names = await Promise.all(top.map((r) => threadName(adapter, r.threadId)));
  return {
    dateText: S.vnDateText(now), weekday: S.vnWeekday(now),
    total: sum.total, active: sum.active, expired: sum.expired, expiring: sum.expiring,
    items: top.map((r, i) => ({
      index: i + 1, name: names[i] || undefined, threadId: r.threadId,
      state: r.state, remainingMs: r.remainingMs, expireText: S.vnDateTime(r.expireMs),
    })),
    page: 1, pages: 1,
  };
}

function reportFallback(r) {
  return (
    `📊 BÁO CÁO RENT ${r.dateText}\n` +
    `Tổng box: ${r.total} · Hoạt động: ${r.active} · Sắp hết hạn: ${r.expiring} · Hết hạn: ${r.expired}`
  );
}

async function sendDailyReport({ adapter, db, config, logger, threadId }) {
  const report = await buildReport(adapter, db);
  await sendCanvas(adapter, threadId, "group", async () => (await canvas()).renderRentReport(report), reportFallback(report), logger);
  const rows = await Promise.all(summarize(db).rows.map(async (r) => {
      const name = await threadName(adapter, r.threadId);
      const remainingDays = Math.ceil((r.expireMs - Date.now()) / S.DAY_MS);
      return `• ${name || r.threadId} (${r.threadId}) — ${remainingDays > 0 ? `còn ${remainingDays} ngày` : "đã hết hạn"} — đến ${S.vnDateTime(r.expireMs)}`;
    }));
  const lines = [
    `📋 CHI TIẾT THỜI HẠN THUÊ BOT ${report.dateText}`,
    `Tổng ${report.total} box · Hoạt động ${report.active} · Sắp hết hạn ${report.expiring} · Hết hạn ${report.expired}`,
    ...rows,
  ];
  let chunk = "";
  for (const line of lines) {
    if (chunk && `${chunk}\n${line}`.length > 3200) {
      await sendText(adapter, threadId, chunk);
      chunk = "";
    }
    chunk = chunk ? `${chunk}\n${line}` : line;
  }
  if (chunk) await sendText(adapter, threadId, chunk);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function rentEmailHtml({ kind, title, groupName, threadId, expireMs, days, botName }) {
  const now = Date.now();
  const remainingMs = expireMs > 0 ? Math.max(0, expireMs - now) : 0;
  const remainingDays = Math.ceil(remainingMs / S.DAY_MS);
  const styles = {
    activated: { heading: "THUÊ BOT THÀNH CÔNG", badge: "ĐÃ KÍCH HOẠT", color: "#087f5b", message: "Box đã được kích hoạt dịch vụ thuê bot." },
    extended: { heading: "GIA HẠN THÀNH CÔNG", badge: "ĐÃ GIA HẠN", color: "#087f5b", message: "Thời hạn thuê của box vừa được gia hạn." },
    adjusted: { heading: "ĐIỀU CHỈNH THỜI HẠN", badge: "ĐÃ CẬP NHẬT", color: "#2563eb", message: "Admin vừa cập nhật thời hạn thuê của box." },
    expired: { heading: "BOX ĐÃ HẾT HẠN", badge: "HẾT HẠN", color: "#c2410c", message: "Thời hạn thuê bot của box đã kết thúc." },
    kicked: { heading: "BOT BỊ MỜI KHỎI BOX", badge: "CẢNH BÁO", color: "#b91c1c", message: "Bot không còn trong nhóm (bị kick hoặc đã rời)." },
    left: { heading: "BOT ĐÃ RỜI BOX", badge: "ĐÃ TỰ ĐỘNG RỜI", color: "#475569", message: "Bot đã tự rời box sau khi hết hạn thuê." },
    test: { heading: "THIẾT LẬP EMAIL THÀNH CÔNG", badge: "EMAIL KIỂM TRA", color: "#2563eb", message: escapeHtml(title) },
  };
  const style = styles[kind] || styles.test;
  const rentalTerm = Number.isFinite(days) && days > 0 ? `${days} ngày` : "—";
  const remaining = expireMs > 0 ? `${remainingDays} ngày` : "Chưa kích hoạt";
  return `<!doctype html><html lang="vi"><body style="margin:0;padding:32px 12px;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#172033">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #dce5ef">
      <tr><td style="padding:28px 34px;background:#0d1b2a">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr>
          <td style="padding-right:18px"><img src="cid:hnnp-rent-logo" width="72" height="72" alt="HNNP RENT" style="display:block;border:0;border-radius:16px"></td>
          <td><div style="font-size:12px;letter-spacing:3px;color:#63e6d1;font-weight:bold">RENTAL MANAGEMENT</div><div style="font-size:27px;font-weight:bold;color:#fff;margin-top:8px">${escapeHtml(botName || "HNNP STUDIO")}</div><div style="font-size:13px;color:#b8c7d9;margin-top:5px">Thông báo hệ thống thuê bot</div></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:34px">
        <div style="font-size:12px;letter-spacing:1px;font-weight:bold;color:${style.color}">${escapeHtml(style.badge)}</div>
        <h1 style="font-size:25px;line-height:1.3;margin:10px 0 12px;color:#142235">${escapeHtml(style.heading)}</h1>
        <p style="font-size:15px;line-height:1.7;color:#526174;margin:0 0 24px">${escapeHtml(style.message)}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:12px;border-collapse:separate">
          <tr><td style="padding:14px 16px;color:#64748b;border-bottom:1px solid #e2e8f0;width:38%">Tên box</td><td style="padding:14px 16px;font-weight:bold;border-bottom:1px solid #e2e8f0">${escapeHtml(groupName || threadId)}</td></tr>
          <tr><td style="padding:14px 16px;color:#64748b;border-bottom:1px solid #e2e8f0">ID box</td><td style="padding:14px 16px;font-weight:bold;border-bottom:1px solid #e2e8f0;word-break:break-all">${escapeHtml(threadId)}</td></tr>
          <tr><td style="padding:14px 16px;color:#64748b;border-bottom:1px solid #e2e8f0">Sự kiện</td><td style="padding:14px 16px;font-weight:bold;border-bottom:1px solid #e2e8f0">${escapeHtml(style.badge)}</td></tr>
          <tr><td style="padding:14px 16px;color:#64748b;border-bottom:1px solid #e2e8f0">Thời hạn thay đổi</td><td style="padding:14px 16px;font-weight:bold;border-bottom:1px solid #e2e8f0">${escapeHtml(rentalTerm)}</td></tr>
          <tr><td style="padding:14px 16px;color:#64748b;border-bottom:1px solid #e2e8f0">Hạn thuê đến</td><td style="padding:14px 16px;font-weight:bold;border-bottom:1px solid #e2e8f0">${expireMs > 0 ? escapeHtml(S.vnDateTime(expireMs)) : "Chưa kích hoạt"}</td></tr>
          <tr><td style="padding:14px 16px;color:#64748b">Thời gian còn lại</td><td style="padding:14px 16px;font-weight:bold;color:${remainingDays > 0 ? "#087f5b" : "#b91c1c"}">${escapeHtml(remaining)}</td></tr>
        </table>
        <p style="font-size:12px;line-height:1.6;color:#64748b;margin:24px 0 0">Thông báo tự động · ${escapeHtml(S.vnDateTime(now))}</p>
      </td></tr>
      <tr><td style="padding:18px 34px;background:#f8fafc;border-top:1px solid #e8edf3;color:#64748b;font-size:12px">${escapeHtml(botName || "HNNP STUDIO")} · RENTAL MANAGEMENT<br>Đây là email tự động, vui lòng không trả lời.</td></tr>
    </table>
  </body></html>`;
}

async function sendRentEmail(config, recipients, details) {
  const user = String(config?.rentalGmailUser || "").trim();
  const appPassword = String(config?.rentalGmailAppPassword || "").replace(/\s/g, "");
  if (!user || !appPassword) {
    throw new Error("Chưa cấu hình RENT_GMAIL_USER và RENT_GMAIL_APP_PASSWORD trong .env.");
  }
  const targets = [...new Set((Array.isArray(recipients) ? recipients : [recipients])
    .map((email) => String(email || "").trim().toLowerCase())
    .filter(Boolean))];
  if (!targets.length) throw new Error("Chưa có email admin nhận thông báo.");

  const logo = await (await canvas()).renderRentEmailLogo();
  const subjectLines = {
    activated: "✅ Kích hoạt thuê bot thành công",
    extended: "✅ Box vừa được gia hạn thuê bot",
    adjusted: "🔄 Thời hạn thuê bot vừa được cập nhật",
    expired: "⛔ Box đã hết hạn thuê bot",
    kicked: "⚠️ Bot bị mời khỏi box",
    left: "🚪 Bot đã tự rời box hết hạn",
    test: "✅ Kiểm tra cấu hình email RENT",
  };
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: appPassword },
  });
  const results = await Promise.allSettled(targets.map((to) => transporter.sendMail({
    from: `"${config?.botName || "HNNP STUDIO"}" <${user}>`,
    to,
    subject: `${subjectLines[details.kind] || "Thông báo thuê bot"}${details.groupName ? ` · ${details.groupName}` : ""}`,
    text: `${details.title || subjectLines[details.kind] || "Thông báo thuê bot"}\nNhóm: ${details.groupName || details.threadId}\nHạn thuê: ${details.expireMs > 0 ? S.vnDateTime(details.expireMs) : "Chưa kích hoạt"}`,
    html: rentEmailHtml({ ...details, botName: config?.botName }),
    attachments: [{ filename: "hnnp-rent-logo.png", content: logo, contentType: "image/png", cid: "hnnp-rent-logo" }],
  })));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    throw new AggregateError(
      failures.map((result) => result.reason),
      `Không gửi được email tới ${failures.length}/${targets.length} địa chỉ.`,
    );
  }
}

async function getRentalAdminEmails(db) {
  const legacyEmail = S.getSetting(db, S.RENT_SCOPE, GMAIL_RECIPIENT_KEY, "");
  const emails = await getAdminGmails({ legacyEmail });
  if (legacyEmail) S.setSetting(db, S.RENT_SCOPE, GMAIL_RECIPIENT_KEY, "");
  return emails;
}

async function notifyRentalEmail({ adapter, db, config, logger, threadId, kind, days }) {
  try {
    const recipients = await getRentalAdminEmails(db);
    if (!recipients.length) return false;
    const expireMs = S.getExpire(db, threadId);
    const groupName = await threadName(adapter, threadId);
    await sendRentEmail(config, recipients, {
      kind,
      title: kind === "expired" ? "Thời hạn thuê của box đã kết thúc." : "",
      groupName: groupName || threadId,
      threadId,
      expireMs,
      days,
    });
    return true;
  } catch (err) {
    logger?.error?.("[rent] Không gửi được email sự kiện thuê bot", { kind, threadId, message: err?.message });
    return false;
  }
}

// ───────────────────────── scheduler (singleton) ─────────────────────────
const SCHED = Symbol.for("hnnp.rent.scheduler");
const MODULE_ID = Math.random().toString(36).slice(2);

function getBot() {
  const b = global.__NKNP_BOT__;
  return b?.adapter && b?.db ? b : null;
}

async function tick(force = false) {
  const st = globalThis[SCHED];
  if (!st || st.busy) return;
  const bot = getBot();
  if (!bot) return;
  st.busy = true;
  const { adapter, db, config, logger } = bot;
  try {
    const now = Date.now();

    // 1) báo cáo hằng ngày sau 00:00 giờ Việt Nam
    try {
      const today = S.vnDateKey(now);
      const last = S.getLastReportDate(db);
      if (!last) {
        S.setLastReportDate(db, today); // lần đầu: chờ 00:00 kế tiếp, không báo ngay
      } else if (last !== today) {
        const target = S.resolveReportThreadId(config, db);
        if (target && now >= (st.reportRetryAt || 0)) {
          try {
            await sendDailyReport({ adapter, db, config, logger, threadId: target });
            S.setLastReportDate(db, today);
            st.reportRetryAt = 0;
          } catch (err) {
            st.reportRetryAt = now + 10 * 60_000;
            logger?.warn?.("[rent] Gửi báo cáo ngày thất bại, sẽ thử lại", { message: err?.message });
          }
        }
      }
    } catch (err) {
      logger?.warn?.("[rent] Lỗi báo cáo ngày", { message: err?.message });
    }

    // Nhắc các box đã bật rent tb một lần sau mỗi ngày Việt Nam.
    st.expiredEmailRetry = st.expiredEmailRetry || new Map();
    for (const rental of S.listRentals(db)) {
      if (rental.expireMs <= 0) continue;
      if (rental.expireMs <= now && S.getSetting(db, rental.threadId, RENT_EXPIRED_EMAIL_KEY, "") !== String(rental.expireMs)) {
        if (now - rental.expireMs > S.DAY_MS) {
          S.setSetting(db, rental.threadId, RENT_EXPIRED_EMAIL_KEY, rental.expireMs);
        } else {
          const retryKey = `${rental.threadId}:${rental.expireMs}`;
          if (now >= (st.expiredEmailRetry.get(retryKey) || 0)) {
            const sent = await notifyRentalEmail({
              adapter, db, config, logger, threadId: rental.threadId, kind: "expired",
            });
            if (sent) {
              S.setSetting(db, rental.threadId, RENT_EXPIRED_EMAIL_KEY, rental.expireMs);
              st.expiredEmailRetry.delete(retryKey);
            } else if ((await getRentalAdminEmails(db)).length) {
              st.expiredEmailRetry.set(retryKey, now + 10 * 60_000);
            }
          }
        }
      }
      if (S.getSetting(db, rental.threadId, RENT_TB_KEY, "0") !== "1") continue;
      if (S.getLeft(db, rental.threadId) === String(rental.expireMs)) continue;
      const today = S.vnDateKey(now);
      const last = S.getSetting(db, rental.threadId, RENT_TB_DATE_KEY, "");
      if (!last) {
        S.setSetting(db, rental.threadId, RENT_TB_DATE_KEY, today);
        continue;
      }
      if (last === today) continue;
      const left = Math.ceil((rental.expireMs - now) / S.DAY_MS);
      const text = left > 0
        ? `🔔 Thông báo thuê bot: box còn ${left} ngày thuê.\nHạn thuê đến: ${S.vnDateTime(rental.expireMs)}`
        : `⛔ Thông báo thuê bot: box đã hết hạn thuê vào ${S.vnDateTime(rental.expireMs)}.`;
      try {
        await sendText(adapter, rental.threadId, text);
        S.setSetting(db, rental.threadId, RENT_TB_DATE_KEY, today);
      } catch (err) {
        logger?.warn?.("[rent] Gửi nhắc thuê hằng ngày thất bại", { threadId: rental.threadId, message: err?.message });
      }
    }

    // 3) tự rời box hết hạn mà không gia hạn
    try { await autoLeaveSweep({ adapter, db, config, logger, st, now }); }
    catch (err) { logger?.warn?.("[rent] Lỗi tự rời box", { message: err?.message }); }

    // 2) quét nhắc hạn tất cả box
    if (force || now - (st.lastSweep || 0) >= SWEEP_EVERY_MS) {
      st.lastSweep = now;
      for (const r of S.listRentals(db)) {
        if (r.expireMs <= 0) continue;
        if (r.expireMs - now > 3 * S.DAY_MS) continue;
        await checkRentalReminder({ adapter, threadId: r.threadId, db, config, logger });
      }
    }
  } catch (err) {
    bot.logger?.warn?.("[rent] tick lỗi", { message: err?.message });
  } finally {
    st.busy = false;
  }
}

async function autoLeaveSweep({ adapter, db, config, logger, st, now }) {
  const minutes = S.getLeaveMinutes(config);
  if (!minutes) return;
  const reportThread = S.resolveReportThreadId(config, db);
  st.leaveRetry = st.leaveRetry || new Map();
  for (const r of S.listRentals(db)) {
    if (r.expireMs <= 0 || r.expireMs > now) continue;
    const value = String(r.expireMs);
    if (S.getLeft(db, r.threadId) === value) continue; // đã rời rồi
    const at = S.leaveAt(db, r.expireMs, minutes, now, S.getRejoinAt(db, r.threadId));
    if (!at || r.threadId === reportThread) continue;

    // cảnh báo lần cuối trước 10 phút (hoặc sớm hơn nếu thời gian ân hạn ngắn)
    const warnAt = at - Math.min(10, Math.max(1, Math.floor(minutes / 2))) * 60_000;
    if (now >= warnAt && now < at && S.getLeaveWarned(db, r.threadId) !== value) {
      S.setLeaveWarned(db, r.threadId, value);
      const left = Math.max(1, Math.ceil((at - now) / 60_000));
      const prefix = getPrefix(config);
      const text = `⚠️ Box đã hết hạn thuê bot. Bot sẽ tự rời box sau khoảng ${left} phút.\nLiên hệ admin để lấy KEY rồi dùng ${prefix}rent key <KEY> để gia hạn.`;
      await sendCanvas(adapter, r.threadId, "group",
        async () => (await canvas()).renderRentNotice({ kind: "deny", title: "BOT SẮP RỜI BOX", lines: [`Bot sẽ tự rời sau khoảng ${left} phút.`, `Dùng ${prefix}rent key <KEY> để gia hạn.`] }),
        text, logger);
    }

    if (now < at || now < (st.leaveRetry.get(r.threadId) || 0)) continue;

    // Tin chào cuối rồi rời nhóm.
    try {
      await sendCanvas(adapter, r.threadId, "group",
        async () => (await canvas()).renderRentNotice({ kind: "info", title: "BOT RỜI BOX", lines: ["Box đã hết hạn thuê bot và chưa gia hạn.", "Liên hệ admin để thuê lại."] }),
        "👋 Box đã hết hạn thuê bot và chưa gia hạn, bot xin phép rời nhóm. Liên hệ admin để thuê lại.", logger);
      const api = adapter?.raw;
      if (typeof api?.leaveGroup !== "function") throw new Error("leaveGroup không khả dụng");
      await api.leaveGroup(r.threadId);
      logger?.info?.("[rent] Đã tự rời box hết hạn", { threadId: r.threadId });
      st.leaveRetry.delete(r.threadId);
      S.setLeft(db, r.threadId, value);
      await notifyRentalEmail({ adapter, db, config, logger, threadId: r.threadId, kind: "left" });
      if (reportThread) {
        const name = await threadName(adapter, r.threadId);
        await sendText(adapter, reportThread, `🚪 Bot đã tự rời box hết hạn: ${name || r.threadId}\nHết hạn: ${S.vnDateTime(r.expireMs)}`).catch(() => {});
      }
    } catch (err) {
      st.leaveRetry.set(r.threadId, now + 30 * 60_000);
      logger?.warn?.("[rent] Rời box thất bại, thử lại sau 30 phút", { threadId: r.threadId, message: err?.message });
    }
  }
}

function ensureScheduler() {
  const g = globalThis;
  let st = g[SCHED];
  if (st && st.owner === MODULE_ID && st.timer) return;
  if (st?.timer) clearInterval(st.timer);
  if (st?.first) clearTimeout(st.first);
  st = g[SCHED] = { owner: MODULE_ID, timer: null, first: null, busy: st?.busy || false, lastSweep: 0, reportRetryAt: 0, tick };
  st.timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  st.first = setTimeout(() => { tick().catch(() => {}); }, 15_000);
  st.timer.unref?.();
  st.first.unref?.();
}

ensureScheduler();

// ───────────────────────── nội dung lệnh ─────────────────────────
const SUB = {
  check: ["check", "kiemtra", "info", "status", "tt"],
  key: ["key", "kichhoat", "active", "redeem"],
  list: ["list", "ds", "danhsach"],
  add: ["add", "them"],
  set: ["set", "dat"],
  off: ["off", "xoa", "tat"],
  genkey: ["genkey", "taokey", "newkey"],
  keys: ["keys", "dskey"],
  delkey: ["delkey", "xoakey"],
  report: ["report", "baocao"],
  admin: ["admin"],
  del: ["del", "tru", "xoa"],
  tb: ["tb"],
  gmail: ["gmail"],
  pay: ["pay", "thanhtoan"],
  menu: ["menu", "help", "huongdan"],
};
function resolveSub(raw) {
  const s = String(raw || "").toLowerCase();
  if (!s) return "menu";
  for (const [k, v] of Object.entries(SUB)) if (v.includes(s)) return k;
  return "menu";
}

async function notice(ctx, kind, title, lines, fallbackText) {
  const { adapter, threadId, threadType, logger } = ctx;
  return sendCanvas(adapter, threadId, threadType,
    async () => (await canvas()).renderRentNotice({ kind, title, lines }),
    fallbackText || `${title}\n${lines.join("\n")}`, logger);
}

export default {
  name: "rent",
  description: "Hệ thống thuê bot RENT: kiểm tra, kích hoạt bằng KEY, quản lý thời hạn",
  version: "5.0.0",
  author: "HNNP STUDIO",
  group: "moderation",
  role: 0,
  cooldown: 2,
  aliases: ["thuebot", "giahan"],
  noPrefix: false,

  async run({ adapter, message, args, config, db, logger }) {
    ensureScheduler();
    const threadId = message.threadId;
    const inGroup = message.type === 1;
    const threadType = inGroup ? "group" : "user";
    const prefix = getPrefix(config);
    const uid = senderOf(message);
    const owner = isOwner(config, uid);
    const sub = resolveSub(args[0]);
    const ctx = { adapter, threadId, threadType, logger };

    const ownerOnly = ["list", "add", "set", "off", "genkey", "keys", "delkey"];
    const adminOnly = ["del", "admin", "report", "gmail"];
    const groupOnly = ["check", "key", "add", "set", "off", "del", "tb"];

    if (ownerOnly.includes(sub) && !owner) {
      await notice(ctx, "deny", "KHÔNG CÓ QUYỀN", ["Chỉ owner bot mới dùng được thao tác này.", `Dùng ${prefix}rent key <KEY> để gia hạn.`],
        `⛔ Chỉ owner bot mới dùng được thao tác này.\nDùng ${prefix}rent key <KEY> để gia hạn.`);
      return;
    }
    if (adminOnly.includes(sub) && !isAdmin(config, uid)) {
      await notice(ctx, "deny", "KHÔNG CÓ QUYỀN", ["Chỉ admin bot mới dùng được thao tác này."], "⛔ Chỉ admin bot mới dùng được thao tác này.");
      return;
    }
    if (groupOnly.includes(sub) && !inGroup) {
      await notice(ctx, "info", "CHỈ DÙNG TRONG NHÓM", ["Hãy dùng lệnh này trong box cần thuê bot."], "Lệnh này chỉ dùng trong nhóm.");
      return;
    }

    const expireMs = inGroup ? S.getExpire(db, threadId) : 0;
    const state = S.rentalState(expireMs);

    // ── menu ──
    if (sub === "menu") {
      await sendCanvas(adapter, threadId, threadType,
        async () => (await canvas()).renderRentMenu({ prefix, state, remainingMs: Math.max(0, expireMs - Date.now()), showOwner: owner }),
        `RENT — QUẢN LÝ THUÊ BOT\n${prefix}rent check · ${prefix}rent key <KEY>` +
        (owner ? `\n${prefix}rent list · add · set · off · genkey · admin` : "") +
        `\n${prefix}rent tb on|off`, logger);
      return;
    }

    // ── check ──
    if (sub === "check") {
      const name = await threadName(adapter, threadId);
      const payload = {
        ...statusPayload(state, { threadId, name, expireMs, prefix }),
        title: state === "active" ? "RENT ACTIVE" : state === "expiring" ? "RENT EXPIRING" : state === "expired" ? "RENT EXPIRED" : "RENT INACTIVE",
      };
      const fb = state === "inactive"
        ? `Box chưa kích hoạt thuê bot.\nDùng ${prefix}rent key <KEY> để kích hoạt.`
        : `Trạng thái: ${state === "expired" ? "ĐÃ HẾT HẠN" : "ĐANG HOẠT ĐỘNG"}\n` +
          (state === "expired" ? "" : `Còn lại: ${humanRemaining(expireMs - Date.now())}\n`) +
          `Hết hạn: ${S.vnDateTime(expireMs)}`;
      await sendCanvas(adapter, threadId, threadType, async () => (await canvas()).renderRentStatus(payload), fb, logger);
      return;
    }

    // ── pay (cũ) ──
    if (sub === "pay") {
      await notice(ctx, "info", "ĐÃ ĐỔI SANG KEY", [`Thanh toán QR không còn dùng.`, `Nhập KEY bằng ${prefix}rent key <KEY>.`],
        `Thanh toán QR không còn dùng. Nhập KEY bằng ${prefix}rent key <KEY>.`);
      return;
    }

    // ── key ──
    if (sub === "key") {
      const raw = args.slice(1).join("");
      if (!raw) {
        await notice(ctx, "info", "THIẾU KEY", [`Cú pháp: ${prefix}rent key <KEY>`], `Cú pháp: ${prefix}rent key <KEY>`);
        return;
      }
      const res = S.redeemKey(db, raw, { threadId, userId: uid });
      if (!res.ok) {
        const map = {
          throttled: ["THỬ QUÁ NHIỀU LẦN", [`Bạn nhập sai quá nhiều lần.`, `Thử lại sau ${res.minutes ?? 10} phút.`]],
          empty: ["THIẾU KEY", [`Cú pháp: ${prefix}rent key <KEY>`]],
          format: ["KEY KHÔNG HỢP LỆ", ["Định dạng KEY không đúng.", "Kiểm tra lại KEY và thử lại."]],
          notfound: ["KEY KHÔNG TỒN TẠI", ["Không tìm thấy KEY này.", "Kiểm tra lại KEY và thử lại."]],
          used: ["KEY ĐÃ ĐƯỢC SỬ DỤNG", ["KEY này đã được dùng trước đó.", "Mỗi KEY chỉ dùng được một lần."]],
          expired: ["KEY ĐÃ HẾT HẠN", ["KEY này đã quá hạn kích hoạt.", "Liên hệ owner để lấy KEY mới."]],
        };
        const [t, l] = map[res.reason] || map.format;
        await notice(ctx, "error", t, l);
        return;
      }
      const name = await threadName(adapter, threadId);
      S.setSetting(db, threadId, RENT_EXPIRED_EMAIL_KEY, "");
      await sendCanvas(adapter, threadId, threadType,
        async () => (await canvas()).renderRentResult({
          title: res.wasActive ? "RENT EXTENDED" : "RENT ACTIVATED",
          subtitle: res.wasActive ? "Gia hạn thành công" : "Kích hoạt thành công",
          rows: [
            { label: "BOX", value: name || threadId, kind: "box" },
            { label: "THỜI HẠN", value: `+ ${res.record.days} ngày`, kind: "plus" },
            { label: "HẾT HẠN", value: S.vnDateTime(res.newExpire), kind: "calendar" },
            { label: "STATUS", value: "ACTIVE", kind: "check", valueColor: "#2DFFA0" },
          ],
        }),
        `✅ ${res.wasActive ? "Gia hạn" : "Kích hoạt"} thành công +${res.record.days} ngày.\nHết hạn: ${S.vnDateTime(res.newExpire)}`, logger);
      await notifyRentalEmail({
        adapter, db, config, logger, threadId,
        kind: res.wasActive ? "extended" : "activated",
        days: res.record.days,
      });
      return;
    }

    // ── list ──
    if (sub === "list") {
      const sum = summarize(db);
      const pages = Math.max(1, Math.ceil(sum.total / PAGE_SIZE));
      const raw = Number(args[1] || 1);
      const page = Number.isInteger(raw) ? Math.min(Math.max(1, raw), pages) : 1;
      const slice = sum.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const rows = await toListRows(adapter, slice, (page - 1) * PAGE_SIZE);
      const fb = sum.total
        ? `DANH SÁCH BOX THUÊ BOT (trang ${page}/${pages})\n` +
          rows.map((r) => `${r.index}. ${r.name || r.threadId} — ${r.state === "expired" ? "hết hạn" : humanRemaining(r.remainingMs)}`).join("\n")
        : "Chưa có box nào được kích hoạt thuê bot.";
      await sendCanvas(adapter, threadId, threadType,
        async () => (await canvas()).renderRentList({ rows, page, pages, total: sum.total, active: sum.active, expired: sum.expired, expiring: sum.expiring, prefix }),
        fb, logger);
      return;
    }

    // ── add / set ──
    if (sub === "add" || sub === "set") {
      const days = S.parseDays(args[1]);
      if (!days) {
        await notice(ctx, "info", "SAI CÚ PHÁP", [`${prefix}rent ${sub} <số ngày từ 1 đến ${S.MAX_DAYS}>`], `Cú pháp: ${prefix}rent ${sub} <số ngày từ 1 đến ${S.MAX_DAYS}>`);
        return;
      }
      const newExpire = S.computeExpire(sub, expireMs, days);
      S.setExpire(db, threadId, newExpire);
      S.resetReminderState(db, threadId);
      S.setSetting(db, threadId, RENT_EXPIRED_EMAIL_KEY, "");
      const name = await threadName(adapter, threadId);
      await sendCanvas(adapter, threadId, threadType,
        async () => (await canvas()).renderRentResult({
          title: sub === "add" ? "RENT ADDED" : "RENT UPDATED",
          subtitle: sub === "add" ? "Đã cộng thêm thời hạn" : "Đã đặt lại thời hạn",
          rows: [
            { label: "BOX", value: name || threadId, kind: "box" },
            { label: sub === "add" ? "CỘNG THÊM" : "ĐẶT LẠI", value: `${sub === "add" ? "+ " : ""}${days} ngày`, kind: "plus" },
            { label: "HẾT HẠN", value: S.vnDateTime(newExpire), kind: "calendar" },
            { label: "STATUS", value: "ACTIVE", kind: "check", valueColor: "#2DFFA0" },
          ],
        }),
        `✅ Đã ${sub === "add" ? "cộng thêm" : "đặt lại"} ${days} ngày.\nHết hạn: ${S.vnDateTime(newExpire)}`, logger);
      await notifyRentalEmail({
        adapter, db, config, logger, threadId, days,
        kind: sub === "add" && expireMs > Date.now() ? "extended" : "adjusted",
      });
      return;
    }

    if (sub === "del") {
      const rawDays = String(args[1] || "").replace(/^\+/, "");
      const days = /^\d+$/.test(rawDays) ? Number(rawDays) : 0;
      if (!Number.isSafeInteger(days) || days < 1) {
        await notice(ctx, "info", "SAI CÚ PHÁP", [`${prefix}rent del <số ngày>`, "Admin dùng lệnh này trong box cần trừ thời hạn thuê."],
          `Cú pháp: ${prefix}rent del <số ngày>`);
        return;
      }
      if (expireMs <= 0) {
        await notice(ctx, "info", "BOX CHƯA CÓ THỜI HẠN", ["Không có thời hạn thuê để trừ."], "Box này chưa có thời hạn thuê.");
        return;
      }
      const remainingDays = Math.max(0, Math.ceil((expireMs - Date.now()) / S.DAY_MS));
      const newExpire = expireMs <= Date.now()
        ? Math.max(1, expireMs - days * S.DAY_MS)
        : days >= remainingDays ? Date.now() - 1 : expireMs - days * S.DAY_MS;
      S.setExpire(db, threadId, newExpire);
      S.resetReminderState(db, threadId);
      S.setSetting(db, threadId, RENT_EXPIRED_EMAIL_KEY, "");
      const name = await threadName(adapter, threadId);
      await notice(ctx, newExpire > Date.now() ? "info" : "deny", "ĐÃ TRỪ THỜI HẠN THUÊ",
        [name || threadId, `Đã trừ ${days} ngày.`, newExpire > Date.now() ? `Còn khoảng ${Math.ceil((newExpire - Date.now()) / S.DAY_MS)} ngày.` : "Thời hạn đã hết."],
        newExpire > Date.now()
          ? `✅ Đã trừ ${days} ngày thuê.\nHạn mới: ${S.vnDateTime(newExpire)}`
          : `⛔ Đã trừ ${days} ngày; thời hạn thuê của box hiện đã hết.`);
      return;
    }

    if (sub === "tb") {
      const mode = String(args[1] || "").toLowerCase();
      if (!["on", "off"].includes(mode)) {
        await notice(ctx, "info", "SAI CÚ PHÁP", [`${prefix}rent tb on | off`], `Cú pháp: ${prefix}rent tb on | off`);
        return;
      }
      const enabled = mode === "on";
      if (enabled && expireMs <= Date.now()) {
        await notice(ctx, "info", "BOX CHƯA THUÊ BOT", ["Chỉ bật thông báo khi box còn thời hạn thuê bot."],
          "Box cần có thời hạn thuê còn hiệu lực để bật thông báo.");
        return;
      }
      S.setSetting(db, threadId, RENT_TB_KEY, enabled ? "1" : "0");
      if (enabled) S.setSetting(db, threadId, RENT_TB_DATE_KEY, S.vnDateKey());
      await notice(ctx, "info", enabled ? "ĐÃ BẬT THÔNG BÁO THUÊ" : "ĐÃ TẮT THÔNG BÁO THUÊ",
        [enabled ? "Bot sẽ tự gửi số ngày thuê còn lại sau 00:00 mỗi ngày." : "Bot sẽ không gửi thông báo thuê hằng ngày nữa."],
        enabled ? "✅ Đã bật thông báo số ngày thuê mỗi ngày sau 00:00." : "✅ Đã tắt thông báo thuê hằng ngày.");
      return;
    }

    if (sub === "gmail") {
      if (inGroup) {
        await notice(ctx, "info", "HÃY DÙNG TIN NHẮN RIÊNG", ["Để không lộ địa chỉ email, hãy nhắn riêng cho bot rồi nhập rent gmail."],
          "Vui lòng dùng lệnh này trong tin nhắn riêng với bot để bảo mật email.");
        return;
      }
      const action = String(args[1] || "add").toLowerCase();
      if (action === "list") {
        const emails = await getRentalAdminEmails(db);
        await sendText(
          adapter,
          threadId,
          emails.length
            ? `📧 Email nhận thông báo thuê bot (${emails.length}):\n${emails.map((email, index) => `${index + 1}. ${email}`).join("\n")}\n\nThêm: ${prefix}rent gmail\nXóa: ${prefix}rent gmail del <email>`
            : `Chưa có email nhận thông báo.\nThêm email: ${prefix}rent gmail`,
          "user",
        );
        return;
      }
      if (action === "del" || action === "remove" || action === "xoa") {
        const target = String(args[2] || "").trim();
        if (!isValidAdminGmail(target)) {
          await sendText(adapter, threadId, `Cú pháp: ${prefix}rent gmail del <email>`, "user");
          return;
        }
        const result = await removeAdminGmail(target);
        await sendText(
          adapter,
          threadId,
          result.removed
            ? `✅ Đã xóa ${target.toLowerCase()} khỏi danh sách nhận email. Còn ${result.emails.length} email.`
            : "Không tìm thấy email đó trong danh sách.",
          "user",
        );
        return;
      }
      if (action === "cancel" || action === "huy") {
        S.setSetting(db, S.RENT_SCOPE, GMAIL_PENDING_PREFIX + uid, "");
        await sendText(adapter, threadId, "Đã hủy thao tác thêm email.", "user");
        return;
      }
      if (action !== "add") {
        await sendText(
          adapter,
          threadId,
          `Cách dùng:\n${prefix}rent gmail — thêm email\n${prefix}rent gmail list — xem danh sách\n${prefix}rent gmail del <email> — xóa email\n${prefix}rent gmail cancel — hủy nhập`,
          "user",
        );
        return;
      }
      const user = String(config?.rentalGmailUser || "").trim();
      const password = String(config?.rentalGmailAppPassword || "").trim();
      if (!user || !password) {
        await notice(ctx, "error", "CHƯA CẤU HÌNH GMAIL", ["Điền RENT_GMAIL_USER và RENT_GMAIL_APP_PASSWORD trong .env rồi khởi động lại bot."],
          "Chưa cấu hình Gmail gửi trong .env. Hãy điền Gmail và App Password rồi khởi động lại bot.");
        return;
      }
      S.setSetting(db, S.RENT_SCOPE, GMAIL_PENDING_PREFIX + uid, "1");
      await sendText(adapter, threadId, `📧 Hãy gửi email muốn thêm vào danh sách nhận thông báo. Có thể lưu nhiều email.\n${prefix}rent gmail list — xem danh sách\n${prefix}rent gmail del <email> — xóa email\n${prefix}rent gmail cancel — hủy thao tác.`, "user");
      return;
    }

    // ── off ──
    if (sub === "off") {
      S.setExpire(db, threadId, 0);
      S.resetReminderState(db, threadId);
      const name = await threadName(adapter, threadId);
      await sendCanvas(adapter, threadId, threadType,
        async () => (await canvas()).renderRentResult({
          tone: "off", title: "RENT DISABLED", subtitle: "Box đã được tắt RENT", statusLabel: "INACTIVE",
          rows: [
            { label: "BOX", value: name || threadId, kind: "box" },
            { label: "STATUS", value: "INACTIVE", kind: "power", valueColor: "#FF4D6A" },
          ],
        }),
        "✅ Đã tắt thời hạn thuê bot của nhóm.", logger);
      return;
    }

    // ── genkey ──
    if (sub === "genkey") {
      const days = S.parseDays(args[1]);
      const count = args[2] === undefined ? 1 : Number(args[2]);
      const valid = args[3] === undefined ? 0 : Number(args[3]);
      if (!days || !Number.isInteger(count) || count < 1 || count > 10 || !Number.isInteger(valid) || valid < 0 || valid > S.MAX_DAYS) {
        await notice(ctx, "info", "SAI CÚ PHÁP", [`${prefix}rent genkey <ngày> [số lượng 1-10] [hạn dùng KEY (ngày)]`],
          `Cú pháp: ${prefix}rent genkey <ngày> [số lượng 1-10] [hạn dùng KEY (ngày)]`);
        return;
      }
      const recs = S.createKeys(db, { days, count, validDays: valid, createdBy: uid });
      await deliverKeys({ ...ctx, uid, inGroup, prefix, recs, title: "RENT KEYS" });
      return;
    }

    // ── keys ──
    if (sub === "keys") {
      const recs = S.listKeys(db, { onlyUnused: true }).slice(0, 12);
      if (!recs.length) {
        await notice(ctx, "info", "KHÔNG CÓ KEY", ["Hiện không có KEY chưa dùng.", `Tạo mới: ${prefix}rent genkey <ngày>`], "Không có KEY chưa dùng.");
        return;
      }
      await deliverKeys({ ...ctx, uid, inGroup, prefix, recs, title: "KEY CHƯA DÙNG" });
      return;
    }

    // ── delkey ──
    if (sub === "delkey") {
      const ok = args[1] ? S.deleteKey(db, args.slice(1).join("")) : false;
      await notice(ctx, ok ? "info" : "error", ok ? "ĐÃ XÓA KEY" : "KHÔNG TÌM THẤY KEY",
        [ok ? "KEY đã bị xóa." : `Cú pháp: ${prefix}rent delkey <KEY>`], ok ? "Đã xóa KEY." : "Không tìm thấy KEY.");
      return;
    }

    // ── report ──
    if (sub === "report" || sub === "admin") {
      const op = String(args[1] || "").toLowerCase();
      if (op === "set") {
        if (!inGroup) {
          await notice(ctx, "info", "CHỈ DÙNG TRONG NHÓM", ["Hãy gõ lệnh này trong box muốn nhận báo cáo."], "Hãy gõ lệnh trong box muốn nhận báo cáo.");
          return;
        }
        S.setReportThreadId(db, threadId);
        const fromCfg = config?.rentalReportThreadId || process.env.RENT_REPORT_THREAD_ID;
        await notice(ctx, "info", "ĐÃ ĐẶT BOX BÁO CÁO", ["Báo cáo số ngày thuê của từng box sẽ gửi vào đây sau 00:00 mỗi ngày.",
          ...(fromCfg ? ["Lưu ý: config rentalReportThreadId đang được ưu tiên."] : [])], "Đã đặt box nhận báo cáo RENT hằng ngày.");
        return;
      }
      if (op === "off") {
        S.setReportThreadId(db, "");
        await notice(ctx, "info", "ĐÃ TẮT BÁO CÁO", ["Báo cáo hằng ngày đã tắt (nếu không có trong config)."], "Đã tắt báo cáo hằng ngày.");
        return;
      }
      if (op === "test") {
        const target = S.resolveReportThreadId(config, db) || (inGroup ? threadId : "");
        if (!target) {
          await notice(ctx, "error", "CHƯA CÓ BOX BÁO CÁO", [`Dùng ${prefix}rent admin set trong box nhận báo cáo.`], "Chưa cấu hình box nhận báo cáo.");
          return;
        }
        try {
          await sendDailyReport({ adapter, db, config, logger, threadId: target });
        } catch (err) {
          await notice(ctx, "error", "GỬI BÁO CÁO LỖI", [String(err?.message || err).slice(0, 80)]);
        }
        return;
      }
      const target = S.resolveReportThreadId(config, db);
      await notice(ctx, "info", "BÁO CÁO HẰNG NGÀY",
        [target ? `Đang gửi tới: ${target}` : "Chưa cấu hình box nhận báo cáo.", `${prefix}rent admin set | off | test`],
        `Báo cáo: ${target || "chưa cấu hình"}\n${prefix}rent admin set | off | test`);
    }
  },

  async onMessage({ adapter, message, config, db, logger }) {
    ensureScheduler();
    if (message?.isSelf) return;
    const uid = senderOf(message);
    const replyThreadType = message?.type === 1 ? "group" : "user";
    const pendingKey = GMAIL_PENDING_PREFIX + uid;
    if (uid && S.getSetting(db, S.RENT_SCOPE, pendingKey, "") === "1") {
      if (message?.type === 1) return;
      const content = typeof message?.data?.content === "string" ? message.data.content.trim() : "";
      if (isValidAdminGmail(content)) {
        const recipient = content.toLowerCase();
        try {
          const report = await buildReport(adapter, db);
          const existingRecipients = await getRentalAdminEmails(db);
          await sendRentEmail(config, recipient, {
            kind: "test",
            title: `Cấu hình email RENT thành công. Hiện có ${report.total} box trong hệ thống.`,
            groupName: "Báo cáo thử nghiệm",
            threadId: "Báo cáo toàn hệ thống",
            expireMs: 0,
          });
          const result = await addAdminGmail(recipient);
          S.setSetting(db, S.RENT_SCOPE, pendingKey, "");
          if (existingRecipients.length === 0) {
            for (const rental of S.listRentals(db)) {
              if (rental.expireMs > 0 && rental.expireMs <= Date.now()) {
                S.setSetting(db, rental.threadId, RENT_EXPIRED_EMAIL_KEY, rental.expireMs);
              }
            }
          }
          await sendText(
            adapter,
            message.threadId,
            result.added
              ? `✅ Đã thêm ${recipient}, gửi email kiểm tra thành công. Danh sách hiện có ${result.emails.length} email; tất cả sẽ nhận thông báo thuê bot.`
              : `Email ${recipient} đã có trong danh sách. Đã gửi email kiểm tra; danh sách vẫn có ${result.emails.length} email.`,
            replyThreadType,
          );
        } catch (err) {
          logger?.error?.("[rent] Gửi email kiểm tra thất bại", { message: err?.message });
          await sendText(adapter, message.threadId, `❌ Không gửi được email kiểm tra: ${String(err?.message || err).slice(0, 180)}`, replyThreadType);
        }
      } else if (content && !content.startsWith(getPrefix(config))) {
        await sendText(adapter, message.threadId, "Địa chỉ email chưa hợp lệ. Hãy nhập lại theo dạng ten@gmail.com.", replyThreadType);
      }
      return;
    }
    if (message?.type !== 1) return;
    // Bot đang nhận tin từ box đã từng rời => được thêm lại, tính ân hạn mới.
    const lv = S.getLeft(db, message.threadId);
    if (lv) { S.setLeft(db, message.threadId, ""); S.setRejoinAt(db, message.threadId, Date.now()); }
    // Nhắc hạn khi box có hoạt động (có dedupe theo mốc). Khóa lệnh khi hết hạn do Handlers/Core.js đảm nhiệm.
    await checkRentalReminder({ adapter, threadId: message.threadId, db, config, logger });
  },

  async onGroupEvent({ adapter, event, config, db, logger }) {
    const eventType = String(event?.type || "").toLowerCase();
    if (eventType !== "remove_member" && !eventType.includes("kick")) return;
    const threadId = String(event?.threadId || event?.data?.groupId || "");
    if (!threadId) return;
    const ownId = String(await adapter.getOwnId()).trim();
    const removedIds = (event?.data?.updateMembers || []).map((member) => String(member?.id || member?.uid || ""));
    if (!ownId || !removedIds.includes(ownId)) return;
    S.setLeft(db, threadId, String(S.getExpire(db, threadId)));
    const recipients = await getRentalAdminEmails(db);
    if (!recipients.length) return;
    const eventStamp = String(event?.data?.time || Date.now());
    if (S.getSetting(db, threadId, "rent:email:kicked", "") === eventStamp) return;
    try {
      const name = String(event?.data?.groupName || await threadName(adapter, threadId) || threadId);
      await sendRentEmail(config, recipients, {
        kind: "kicked",
        title: "Thông tin thời hạn thuê của box bị mời khỏi nhóm.",
        groupName: name,
        threadId,
        expireMs: S.getExpire(db, threadId),
        kicked: true,
      });
      S.setSetting(db, threadId, "rent:email:kicked", eventStamp);
    } catch (err) {
      logger?.error?.("[rent] Gửi email thông báo bot bị mời khỏi nhóm thất bại", { threadId, message: err?.message });
    }
  },
};

// Gửi KEY riêng cho owner (không lộ trong nhóm).
async function deliverKeys({ adapter, threadId, threadType, logger, uid, inGroup, prefix, recs, title }) {
  const keys = recs.map((r) => ({
    key: r.key, days: r.days, expireText: r.expiresAt ? S.vnDateTime(r.expiresAt) : "",
  }));
  const dmId = uid;
  const textList = recs.map((r) => `${r.key}  (+${r.days} ngày)`).join("\n");
  try {
    if (inGroup && !dmId) throw new Error("no uid");
    const target = inGroup ? dmId : threadId;
    await sendCanvas(adapter, target, "user",
      async () => (await canvas()).renderRentKeys({ keys, prefix, title }),
      `${title}\n${textList}\nDùng: ${prefix}rent key <KEY>`, logger);
    if (inGroup) {
      await sendCanvas(adapter, threadId, threadType,
        async () => (await canvas()).renderRentNotice({ kind: "info", title: "ĐÃ GỬI KEY RIÊNG", lines: [`${recs.length} KEY đã được gửi vào tin nhắn riêng của owner.`] }),
        "Đã gửi KEY vào tin nhắn riêng của owner.", logger);
    }
  } catch (err) {
    logger?.warn?.("[rent] Gửi KEY riêng thất bại", { message: err?.message });
    await sendCanvas(adapter, threadId, threadType,
      async () => (await canvas()).renderRentNotice({ kind: "error", title: "KHÔNG GỬI ĐƯỢC KEY", lines: ["Hãy nhắn tin riêng cho bot trước,", `rồi dùng ${prefix}rent keys để xem KEY.`] }),
      `Không gửi được KEY riêng. Nhắn tin riêng cho bot rồi dùng ${prefix}rent keys.`, logger);
  }
}
