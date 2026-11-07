/**
 * sclSession.js — lưu danh sách kết quả `.scl` theo (msgId ảnh bot đã gửi) + người tìm + hạn dùng.
 * Chỉ nằm trong RAM; tự dọn khi hết hạn; có giới hạn số phiên để không rò rỉ bộ nhớ.
 * Người A reply danh sách của người B → không lấy được (kiểm tra uid ở nơi dùng).
 */
export const SESSION_TTL_MS = 10 * 60_000;
export const MAX_SESSIONS = 300;
export const MAX_PER_USER = 3;
const TOMBSTONE_MS = 30 * 60_000;

let ttlMs = SESSION_TTL_MS;
let seq = 0;
const sessions = new Map();   // sessionId → session
const byMsg = new Map();      // msgId (chuỗi) → sessionId
const expired = new Map();    // msgId → thời điểm hết hạn (để báo "danh sách đã hết hạn")
const seen = new Map();       // msgId tin nhắn đã xử lý (chống sự kiện trùng)

export function setTtlForTests(ms) { ttlMs = ms; }
export function resetForTests() { sessions.clear(); byMsg.clear(); expired.clear(); seen.clear(); ttlMs = SESSION_TTL_MS; }
export function activeCount() { sweep(); return sessions.size; }

function drop(s, tombstone = true) {
  sessions.delete(s.id);
  for (const k of s.msgKeys) { if (byMsg.get(k) === s.id) byMsg.delete(k); if (tombstone) expired.set(k, Date.now()); }
}

export function sweep(now = Date.now()) {
  for (const s of [...sessions.values()]) if (s.expiresAt <= now) drop(s);
  for (const [k, t] of expired) if (now - t > TOMBSTONE_MS) expired.delete(k);
  for (const [k, t] of seen) if (now - t > 10 * 60_000) seen.delete(k);
}
const timer = setInterval(() => sweep(), 60_000); timer.unref?.();

export function createSession({ uid, threadId, threadType, query, mode, results, source }) {
  sweep();
  const mine = [...sessions.values()].filter((s) => s.uid === String(uid));
  while (mine.length >= MAX_PER_USER) drop(mine.shift(), false);
  while (sessions.size >= MAX_SESSIONS) drop(sessions.values().next().value, false);
  const s = {
    id: `scl-${Date.now()}-${++seq}`, uid: String(uid), threadId: String(threadId), threadType,
    query, mode: mode || null, results, source, page: 1, msgKeys: new Set(), createdAt: Date.now(), expiresAt: Date.now() + ttlMs,
  };
  sessions.set(s.id, s);
  return s;
}

/** Ghi nhận các id của tin nhắn ảnh bot vừa gửi để nhận diện reply. */
export function bindMessage(session, ids) {
  for (const raw of ids || []) {
    const k = String(raw ?? "").trim();
    if (!k || k === "undefined" || k === "null") continue;
    session.msgKeys.add(k); byMsg.set(k, session.id); expired.delete(k);
  }
  return session.msgKeys.size;
}

/** Gom mọi msgId/cliMsgId/globalMsgId trong kết quả trả về của sendMessage (cấu trúc thay đổi theo bản thư viện). */
export function collectMessageIds(info, depth = 0, out = new Set()) {
  if (!info || typeof info !== "object" || depth > 4) return [...out];
  if (Array.isArray(info)) { for (const x of info) collectMessageIds(x, depth + 1, out); return [...out]; }
  for (const [k, v] of Object.entries(info)) {
    if (["msgId", "cliMsgId", "globalMsgId"].includes(k) && (typeof v === "string" || typeof v === "number") && String(v)) out.add(String(v));
    else if (v && typeof v === "object") collectMessageIds(v, depth + 1, out);
  }
  return [...out];
}

export function quoteIds(quote) {
  if (!quote || typeof quote !== "object") return [];
  return [quote.globalMsgId, quote.cliMsgId, quote.msgId].filter((x) => x != null && String(x) !== "").map(String);
}

/** → { session } | { expired: true } | null */
export function findByQuote(quote) {
  sweep();
  for (const id of quoteIds(quote)) {
    const sid = byMsg.get(id);
    if (sid && sessions.get(sid)) return { session: sessions.get(sid) };
  }
  for (const id of quoteIds(quote)) if (expired.has(id)) return { expired: true };
  return null;
}

export function touch(session) { session.expiresAt = Date.now() + ttlMs; }
export function endSession(session) { drop(session, false); }
export function getSession(id) { sweep(); return sessions.get(id) || null; }
/** Phiên gần nhất của người dùng trong cuộc trò chuyện (dùng cho `.scl chon N`). */
export function latestFor(uid, threadId) {
  sweep();
  let best = null;
  for (const s of sessions.values()) if (s.uid === String(uid) && s.threadId === String(threadId) && (!best || s.createdAt >= best.createdAt)) best = s;
  return best;
}
export function seenMessage(msgId) {
  if (msgId == null || msgId === "") return false;
  const k = String(msgId);
  if (seen.has(k)) return true;
  seen.set(k, Date.now());
  if (seen.size > 5000) seen.delete(seen.keys().next().value);
  return false;
}
