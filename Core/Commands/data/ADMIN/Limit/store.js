/**
 * LIMIT PRO — lưu cấu hình theo từng threadId trong bảng `settings` (SQLite, bền sau restart).
 *   anti:limit:enabled   "1"/"0"            (giữ nguyên khóa cũ của LIMIT v1)
 *   anti:limit:groups    "a,b,c"            (khóa cũ — CHỈ ĐỌC để migrate, không bị xóa/ghi đè)
 *   limit:pro:groups     JSON ["giaitri",…]  nhóm chức năng đang khóa
 *   limit:pro:blocked    JSON ["cauca",…]    lệnh bị BLOCK riêng (tên chính trong registry)
 *   limit:pro:migrated   "1"                 đã chuyển dữ liệu v1 → PRO
 * Mọi hàm đồng bộ (sql.js) nên mỗi lần đọc-sửa-ghi là nguyên tử trong event loop.
 */
import { CATEGORIES, resolveCategory } from "./categories.js";

const K_ENABLED = "anti:limit:enabled";
const K_LEGACY_GROUPS = "anti:limit:groups";
const K_GROUPS = "limit:pro:groups";
const K_BLOCKED = "limit:pro:blocked";
const K_MIGRATED = "limit:pro:migrated";
const VALID_IDS = new Set(CATEGORIES.map((c) => c.id));
const MAX_BLOCKED = 500;

function getRaw(db, threadId, key) {
  try {
    const rows = db.query("SELECT value FROM settings WHERE thread_id = ? AND key = ?", [String(threadId), key]);
    return rows.length ? rows[0].value : null;
  } catch { return null; }
}
function setRaw(db, threadId, key, value) {
  db.query(
    `INSERT INTO settings (thread_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(thread_id, key) DO UPDATE SET value = excluded.value`,
    [String(threadId), key, value],
  );
}

function parseList(raw, validator) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let arr;
  try { arr = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const s = v.trim().toLowerCase();
    if (s && validator(s) && !out.includes(s)) out.push(s);
  }
  return out;
}
const isGroupId = (s) => VALID_IDS.has(s);
const isCmdName = (s) => /^[^\s,]{1,64}$/.test(s);

/** Chuyển dữ liệu LIMIT v1 → PRO đúng 1 lần cho mỗi nhóm chat; không xóa dữ liệu cũ. */
function migrate(db, threadId) {
  if (getRaw(db, threadId, K_MIGRATED) === "1") return;
  const legacy = String(getRaw(db, threadId, K_LEGACY_GROUPS) || "");
  const mapped = [];
  for (const name of legacy.split(",")) {
    const id = resolveCategory(name);
    if (id && !mapped.includes(id)) mapped.push(id);
  }
  if (mapped.length) {
    const cur = parseList(getRaw(db, threadId, K_GROUPS), isGroupId);
    for (const id of mapped) if (!cur.includes(id)) cur.push(id);
    setRaw(db, threadId, K_GROUPS, JSON.stringify(cur));
  }
  setRaw(db, threadId, K_MIGRATED, "1");
}

export function loadState(db, threadId) {
  try { migrate(db, threadId); } catch { /* DB lỗi → dùng mặc định an toàn bên dưới */ }
  return {
    enabled: getRaw(db, threadId, K_ENABLED) === "1",
    groups: parseList(getRaw(db, threadId, K_GROUPS), isGroupId),
    blocked: parseList(getRaw(db, threadId, K_BLOCKED), isCmdName),
  };
}

export function setEnabled(db, threadId, on) {
  setRaw(db, threadId, K_ENABLED, on ? "1" : "0");
  return !!on;
}

export function lockGroup(db, threadId, id) {
  if (!isGroupId(id)) return { ok: false, reason: "invalid" };
  const st = loadState(db, threadId);
  if (st.groups.includes(id)) return { ok: false, reason: "exists" };
  st.groups.push(id);
  setRaw(db, threadId, K_GROUPS, JSON.stringify(st.groups));
  return { ok: true };
}
export function unlockGroup(db, threadId, id) {
  if (!isGroupId(id)) return { ok: false, reason: "invalid" };
  const st = loadState(db, threadId);
  if (!st.groups.includes(id)) return { ok: false, reason: "absent" };
  setRaw(db, threadId, K_GROUPS, JSON.stringify(st.groups.filter((g) => g !== id)));
  return { ok: true };
}
export function clearGroups(db, threadId) {
  const n = loadState(db, threadId).groups.length;
  setRaw(db, threadId, K_GROUPS, "[]");
  return n;
}

export function blockCommand(db, threadId, name) {
  const st = loadState(db, threadId);
  if (st.blocked.includes(name)) return { ok: false, reason: "exists" };
  if (st.blocked.length >= MAX_BLOCKED) return { ok: false, reason: "full" };
  st.blocked.push(name);
  setRaw(db, threadId, K_BLOCKED, JSON.stringify(st.blocked));
  return { ok: true };
}
export function unblockCommand(db, threadId, name) {
  const st = loadState(db, threadId);
  if (!st.blocked.includes(name)) return { ok: false, reason: "absent" };
  setRaw(db, threadId, K_BLOCKED, JSON.stringify(st.blocked.filter((b) => b !== name)));
  return { ok: true };
}
export function clearBlocked(db, threadId) {
  const n = loadState(db, threadId).blocked.length;
  setRaw(db, threadId, K_BLOCKED, "[]");
  return n;
}
