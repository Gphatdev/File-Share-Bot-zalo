/**
 * RENT store — kho KEY + tiện ích thời gian/cấu hình cho hệ thống RENT.
 *
 * Mọi dữ liệu nằm trong bảng `settings(thread_id, key, value)` sẵn có:
 *   thread_id = "__rent__"
 *     rent:key:<KEY>                 → JSON bản ghi KEY
 *     lastRentalDailyReportDate      → "YYYY-MM-DD" (giờ Việt Nam) của lần báo cáo gần nhất
 *     rent:reportThread              → threadId nhận báo cáo (khi chưa cấu hình trong config)
 *   thread_id = <id box>
 *     bot:rental:expires | bot:rental:reminded:3d|1d|expired | bot:rental:pending  (GIỮ NGUYÊN key cũ)
 */
import crypto from "node:crypto";

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const TZ = "Asia/Ho_Chi_Minh";

export const RENTAL_KEY = "bot:rental:expires";
export const REMINDED_3D_KEY = "bot:rental:reminded:3d";
export const REMINDED_1D_KEY = "bot:rental:reminded:1d";
export const REMINDED_EXPIRED_KEY = "bot:rental:reminded:expired";
export const PENDING_PAYMENT_KEY = "bot:rental:pending"; // chỉ giữ tên, không còn dùng

export const RENT_SCOPE = "__rent__";
const KEY_PREFIX = "rent:key:";
const LAST_REPORT_KEY = "lastRentalDailyReportDate";
const REPORT_THREAD_KEY = "rent:reportThread";

export const MAX_DAYS = 3650;

// ───────────────────────── settings helpers ─────────────────────────
export function getSetting(db, threadId, key, def = "") {
  const rows = db.query(
    "SELECT value FROM settings WHERE thread_id = ? AND key = ?",
    [threadId, key],
  );
  return rows.length ? rows[0].value : def;
}

export function setSetting(db, threadId, key, value) {
  db.query(
    `INSERT INTO settings (thread_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(thread_id, key) DO UPDATE SET value = excluded.value`,
    [threadId, key, String(value)],
  );
}

export function getExpire(db, threadId) {
  const n = Number(getSetting(db, threadId, RENTAL_KEY, "0"));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function setExpire(db, threadId, ms) {
  setSetting(db, threadId, RENTAL_KEY, Math.max(0, Math.floor(ms)));
}

export function resetReminderState(db, threadId) {
  setSetting(db, threadId, REMINDED_3D_KEY, "");
  setSetting(db, threadId, REMINDED_1D_KEY, "");
  setSetting(db, threadId, REMINDED_EXPIRED_KEY, "");
}

/** Mọi box từng có bản ghi hạn (kể cả 0 = đã tắt). */
export function listRentals(db) {
  return db
    .query(
      "SELECT thread_id, value FROM settings WHERE key = ? ORDER BY CAST(value AS INTEGER) DESC",
      [RENTAL_KEY],
    )
    .map((r) => ({ threadId: String(r.thread_id), expireMs: Number(r.value) || 0 }));
}

/**
 * Trạng thái của một thời hạn.
 * inactive: chưa kích hoạt / đã tắt · expired · expiring (≤ 3 ngày) · active
 */
export function rentalState(expireMs, now = Date.now()) {
  if (!expireMs || expireMs <= 0) return "inactive";
  if (expireMs <= now) return "expired";
  if (expireMs - now <= 3 * DAY_MS) return "expiring";
  return "active";
}

/** Tính hạn mới: add = cộng dồn từ max(hạn cũ, bây giờ); set = bây giờ + ngày. */
export function computeExpire(mode, currentExpire, days, now = Date.now()) {
  const d = Math.floor(days) * DAY_MS;
  return mode === "set" ? now + d : Math.max(currentExpire || 0, now) + d;
}

export function parseDays(raw) {
  const s = String(raw ?? "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_DAYS ? n : null;
}

// ───────────────────────── thời gian Việt Nam ─────────────────────────
const dateKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});
const dateTimeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
const weekdayFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, weekday: "long" });

/** "YYYY-MM-DD" theo giờ Việt Nam. */
export function vnDateKey(ms = Date.now()) {
  return dateKeyFmt.format(new Date(ms));
}
/** "dd/mm/yyyy" */
export function vnDateText(ms = Date.now()) {
  const [y, m, d] = vnDateKey(ms).split("-");
  return `${d}/${m}/${y}`;
}
/** "dd/mm/yyyy HH:mm" */
export function vnDateTime(ms) {
  const o = {};
  for (const p of dateTimeFmt.formatToParts(new Date(ms))) o[p.type] = p.value;
  const hh = o.hour === "24" ? "00" : o.hour;
  return `${o.day}/${o.month}/${o.year} ${hh}:${o.minute}`;
}
export function vnWeekday(ms = Date.now()) {
  const w = weekdayFmt.format(new Date(ms));
  return w.charAt(0).toUpperCase() + w.slice(1);
}

// ───────────────────────── cấu hình nơi nhận báo cáo ─────────────────────────
export function resolveReportThreadId(config, db) {
  const fromConfig =
    config?.rentalReportThreadId ||
    process.env.RENT_REPORT_THREAD_ID ||
    "";
  if (String(fromConfig).trim()) return String(fromConfig).trim();
  try {
    const v = getSetting(db, RENT_SCOPE, REPORT_THREAD_KEY, "");
    return String(v || "").trim();
  } catch {
    return "";
  }
}
export function setReportThreadId(db, threadId) {
  setSetting(db, RENT_SCOPE, REPORT_THREAD_KEY, threadId || "");
}
export function getLastReportDate(db) {
  return String(getSetting(db, RENT_SCOPE, LAST_REPORT_KEY, "") || "");
}
export function setLastReportDate(db, key) {
  setSetting(db, RENT_SCOPE, LAST_REPORT_KEY, key);
}

// ───────────────────────── KEY ─────────────────────────
// Bỏ các ký tự dễ nhầm (0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function normalizeKey(raw) {
  const s = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length === 12) return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
  return s;
}

function randomKey() {
  const bytes = crypto.randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
    if (i === 3 || i === 7) out += "-";
  }
  return out;
}

function readKey(db, key) {
  const raw = getSetting(db, RENT_SCOPE, KEY_PREFIX + key, "");
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw);
    return rec && typeof rec === "object" ? rec : null;
  } catch {
    return null;
  }
}
function writeKey(db, rec) {
  setSetting(db, RENT_SCOPE, KEY_PREFIX + rec.key, JSON.stringify(rec));
}

/**
 * Tạo KEY mới.
 * @param {{days:number, count?:number, validDays?:number, createdBy?:string}} o
 *   validDays: số ngày KEY còn hiệu lực để kích hoạt (0/undefined = không giới hạn)
 */
export function createKeys(db, { days, count = 1, validDays = 0, createdBy = "" }) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    let key;
    let guard = 0;
    do { key = randomKey(); guard++; } while (readKey(db, key) && guard < 20);
    const rec = {
      key,
      days,
      createdAt: now,
      expiresAt: validDays > 0 ? now + validDays * DAY_MS : null,
      used: false,
      usedBy: null,
      usedThreadId: null,
      usedAt: null,
      createdBy: String(createdBy || ""),
    };
    writeKey(db, rec);
    out.push(rec);
  }
  return out;
}

export function listKeys(db, { onlyUnused = true } = {}) {
  const rows = db.query(
    "SELECT value FROM settings WHERE thread_id = ? AND key LIKE ?",
    [RENT_SCOPE, KEY_PREFIX + "%"],
  );
  const recs = [];
  for (const r of rows) {
    try {
      const rec = JSON.parse(r.value);
      if (rec?.key) recs.push(rec);
    } catch { /* bỏ qua bản ghi hỏng */ }
  }
  const now = Date.now();
  return recs
    .filter((r) => !onlyUnused || (!r.used && !(r.expiresAt && r.expiresAt <= now)))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function deleteKey(db, rawKey) {
  const key = normalizeKey(rawKey);
  if (!readKey(db, key)) return false;
  db.query("DELETE FROM settings WHERE thread_id = ? AND key = ?", [RENT_SCOPE, KEY_PREFIX + key]);
  return true;
}

// Chống dò KEY: tối đa 5 lần sai / 10 phút / người dùng.
const fails = new Map();
const FAIL_LIMIT = 5;
const FAIL_WINDOW = 10 * 60_000;
function throttled(userId, now) {
  const arr = (fails.get(userId) || []).filter((t) => now - t < FAIL_WINDOW);
  fails.set(userId, arr);
  return arr.length >= FAIL_LIMIT ? Math.ceil((FAIL_WINDOW - (now - arr[0])) / 60_000) : 0;
}
function addFail(userId, now) {
  const arr = fails.get(userId) || [];
  arr.push(now);
  fails.set(userId, arr);
}

/**
 * Dùng KEY cho một box.
 * Kết quả: { ok:true, record, newExpire, oldExpire, wasActive }
 *      hoặc { ok:false, reason: "empty|format|notfound|used|expired|throttled", minutes? }
 * Đồng bộ hoàn toàn (db.query đồng bộ) nên không thể dùng một KEY hai lần.
 */
export function redeemKey(db, rawKey, { threadId, userId }) {
  const now = Date.now();
  const uid = String(userId || "");
  const wait = throttled(uid, now);
  if (wait) return { ok: false, reason: "throttled", minutes: wait };

  const key = normalizeKey(rawKey);
  if (!key) return { ok: false, reason: "empty" };
  if (!/^[A-Z0-9-]{6,32}$/.test(key)) {
    addFail(uid, now);
    return { ok: false, reason: "format" };
  }
  const rec = readKey(db, key);
  if (!rec) {
    addFail(uid, now);
    return { ok: false, reason: "notfound" };
  }
  if (rec.used) return { ok: false, reason: "used", record: rec };
  if (rec.expiresAt && rec.expiresAt <= now) return { ok: false, reason: "expired", record: rec };

  const days = Number(rec.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return { ok: false, reason: "format", record: rec };
  }

  const oldExpire = getExpire(db, threadId);
  const newExpire = computeExpire("add", oldExpire, days, now);

  // Đánh dấu đã dùng TRƯỚC khi cộng hạn để không bao giờ dùng 2 lần.
  rec.used = true;
  rec.usedBy = uid;
  rec.usedThreadId = String(threadId);
  rec.usedAt = now;
  writeKey(db, rec);

  setExpire(db, threadId, newExpire);
  resetReminderState(db, threadId);

  return { ok: true, record: rec, newExpire, oldExpire, wasActive: oldExpire > now };
}

// ───────────────────────── tự rời box khi hết hạn ─────────────────────────
const LEAVE_SINCE_KEY = "rent:autoLeaveSince";
const LEAVE_WARNED_KEY = "bot:rental:reminded:leave";

/** Mốc bắt đầu áp dụng tự rời (lần đầu chạy) — box đã hết hạn từ trước được ân hạn tính từ mốc này. */
export function getAutoLeaveSince(db) {
  let v = Number(getSetting(db, RENT_SCOPE, LEAVE_SINCE_KEY, "0"));
  if (!Number.isFinite(v) || v <= 0) {
    v = Date.now();
    setSetting(db, RENT_SCOPE, LEAVE_SINCE_KEY, v);
  }
  return v;
}
export function getLeaveMinutes(config) {
  const raw = config?.rentalAutoLeaveMinutes ?? process.env.RENT_AUTO_LEAVE_MINUTES;
  const n = raw === undefined || raw === null || raw === "" ? 60 : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 60;
}
/** Thời điểm bot sẽ rời box (ms), hoặc 0 nếu không áp dụng. */
export function leaveAt(db, expireMs, minutes, now = Date.now(), rejoinAt = 0) {
  if (!minutes || !expireMs || expireMs > now) return 0;
  return Math.max(expireMs, getAutoLeaveSince(db), rejoinAt || 0) + minutes * 60_000;
}
const LEFT_KEY = "bot:rental:left";
const REJOIN_KEY = "bot:rental:rejoinAt";
/** Box đã bị bot rời ứng với hạn nào (rỗng = chưa rời). */
export const getLeft = (db, tid) => getSetting(db, tid, LEFT_KEY, "");
export const setLeft = (db, tid, v) => setSetting(db, tid, LEFT_KEY, v);
export const getRejoinAt = (db, tid) => Number(getSetting(db, tid, REJOIN_KEY, "0")) || 0;
export const setRejoinAt = (db, tid, v) => setSetting(db, tid, REJOIN_KEY, v);
export const getLeaveWarned = (db, tid) => getSetting(db, tid, LEAVE_WARNED_KEY, "");
export const setLeaveWarned = (db, tid, v) => setSetting(db, tid, LEAVE_WARNED_KEY, v);
