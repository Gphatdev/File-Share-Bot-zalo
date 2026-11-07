/**
 * settingSession.js — quản lý PHIÊN CHỜ của `.setting`.
 *
 * - Mỗi người thao tác có đúng 1 phiên, khoá theo UID (không dùng biến toàn cục dùng chung nên không ghi đè nhau).
 * - Phiên nhớ: uid, threadId, loại chức năng, bước hiện tại, dữ liệu đã nhận (đường dẫn file tạm), thời điểm bắt đầu/hết hạn, trạng thái.
 * - Hết hạn: tự huỷ + xoá file tạm + gọi onExpire để bot báo "phiên hết hạn".
 * - Bộ nhớ trong tiến trình: bot khởi động lại thì phiên mất (có chủ đích, không để dữ liệu tạm tồn tại vô hạn);
 *   file tạm còn sót được dọn khi nạp module (cleanTempDir).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEMP_DIR = path.join(__dirname, "temp");
export const SESSION_TTL_MS = 3 * 60 * 1000;        // thời hạn chờ mỗi bước
export const STALE_TEMP_MS = 30 * 60 * 1000;        // file tạm cũ hơn mức này bị dọn

export const STATUS = { WAITING: "waiting", PROCESSING: "processing" };

/** @type {Map<string, any>} uid → phiên */
const sessions = new Map();
let expireHandler = null;
let ttlMs = SESSION_TTL_MS;

const recent = new Map(); // msgId đã xử lý (chống xử lý lặp khi sự kiện đến 2 lần)
const RECENT_MAX = 500;

export function setExpireHandler(fn) { expireHandler = typeof fn === "function" ? fn : null; }
export function setTtlForTests(ms) { ttlMs = ms; }
export function resetForTests() { for (const s of sessions.values()) { clearTimeout(s.timer); for (const f of s.data?.files || []) { try { fs.unlinkSync(f); } catch { /* đã xóa */ } } } sessions.clear(); recent.clear(); ttlMs = SESSION_TTL_MS; }

export function cleanTempDir(maxAgeMs = STALE_TEMP_MS) {
  try {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    const now = Date.now();
    for (const f of fs.readdirSync(TEMP_DIR)) {
      const p = path.join(TEMP_DIR, f);
      try { if (now - fs.statSync(p).mtimeMs > maxAgeMs) fs.unlinkSync(p); } catch { /* bỏ qua */ }
    }
  } catch { /* thư mục tạm không bắt buộc */ }
}
cleanTempDir(0); // lúc nạp module (bot vừa khởi động): mọi file tạm cũ đều mồ côi → xoá hết

export function tempPath(uid, ext = "bin") {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  return path.join(TEMP_DIR, `set-${String(uid).replace(/\W/g, "").slice(0, 20)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
}

function removeFiles(session) {
  for (const f of session?.data?.files || []) { try { fs.unlinkSync(f); } catch { /* đã xoá */ } }
  if (session?.data) session.data.files = [];
}

/** Lập lịch hết hạn cho phiên. */
function arm(session) {
  clearTimeout(session.timer);
  session.expiresAt = Date.now() + ttlMs;
  session.timer = setTimeout(() => expire(session.uid, session), ttlMs + 5);
  session.timer.unref?.();
}

function expire(uid, expected) {
  const s = sessions.get(uid);
  if (!s || (expected && s !== expected)) return;
  if (s.status === STATUS.PROCESSING) { arm(s); return; } // đang gọi API: không cắt ngang, gia hạn
  sessions.delete(uid);
  clearTimeout(s.timer);
  removeFiles(s);
  try { expireHandler?.(s); } catch { /* handler không được làm hỏng bot */ }
}

/** Tạo phiên mới (phiên cũ của cùng UID bị thay — nơi gọi phải tự kiểm tra trạng thái processing trước). */
export function startSession({ uid, threadId, threadType, type, step }) {
  const key = String(uid);
  const old = sessions.get(key);
  if (old) { clearTimeout(old.timer); removeFiles(old); }
  const s = { uid: key, threadId: String(threadId), threadType, type, step, data: { files: [] }, startedAt: Date.now(), expiresAt: 0, status: STATUS.WAITING, timer: null };
  sessions.set(key, s);
  arm(s);
  return s;
}

/** Lấy phiên còn hạn của UID (hết hạn → huỷ, báo và trả null). */
export function getSession(uid) {
  const s = sessions.get(String(uid));
  if (!s) return null;
  if (Date.now() > s.expiresAt && s.status !== STATUS.PROCESSING) { expire(s.uid, s); return null; }
  return s;
}

export function advance(session, step) { session.step = step; arm(session); }
export function markProcessing(session) { session.status = STATUS.PROCESSING; }
export function remainingSec(session) { return Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000)); }

/** Kết thúc phiên (thành công/huỷ/lỗi): xoá file tạm, giải phóng bộ nhớ. */
export function endSession(uid) {
  const s = sessions.get(String(uid));
  if (!s) return null;
  sessions.delete(String(uid));
  clearTimeout(s.timer);
  removeFiles(s);
  return s;
}

export function addFile(session, filePath) { session.data.files.push(filePath); return filePath; }
export function activeCount() { return sessions.size; }

/** Trả true nếu msgId đã thấy (và ghi nhớ nếu chưa). */
export function seenMessage(msgId) {
  if (msgId == null || msgId === "") return false;
  const k = String(msgId);
  if (recent.has(k)) return true;
  recent.set(k, Date.now());
  if (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value);
  return false;
}
