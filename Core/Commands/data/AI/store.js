/**
 * AI/store.js — lưu trữ JSON cho AI, tách theo nhóm (khóa = threadId):
 *   store/groups.json         cấu hình từng nhóm (bật/tắt, học, code, bộ đếm dùng)
 *   store/styles.json         hồ sơ phong cách đã học (chỉ số liệu tổng hợp, KHÔNG lưu nguyên văn tin nhắn)
 *   store/conversations.json  lịch sử hội thoại với AI + bản tóm tắt
 * Ghi nguyên tử (tmp + rename), file hỏng được sao lưu rồi tạo lại, ghi gộp (debounce) để không làm chậm bot.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let dir = path.join(__dirname, "store");
export function setDataDirForTests(d) { dir = d || path.join(__dirname, "store"); caches.clear(); for (const t of timers.values()) clearTimeout(t); timers.clear(); dirty.clear(); }
export const dataDir = () => dir;

const FILES = ["groups", "styles", "conversations"];
const caches = new Map();   // name -> object
const dirty = new Set();
const timers = new Map();
const DEBOUNCE_MS = 1500;

function filePath(name) { return path.join(dir, `${name}.json`); }
function load(name) {
  if (caches.has(name)) return caches.get(name);
  const file = filePath(name);
  let data = {};
  try {
    if (fs.existsSync(file)) {
      const txt = fs.readFileSync(file, "utf8");
      if (txt.trim()) {
        const v = JSON.parse(txt);
        if (v && typeof v === "object" && !Array.isArray(v)) data = v; else throw new Error("sai định dạng");
      }
    }
  } catch (err) {
    try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* ignore */ }
    console.warn(`[ai] ${name}.json bị hỏng (${err?.message}) → đã sao lưu và tạo lại.`);
    data = {};
  }
  caches.set(name, data);
  return data;
}
function writeNow(name) {
  const data = caches.get(name);
  if (!data) return;
  fs.mkdirSync(dir, { recursive: true });
  const file = filePath(name);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
  fs.renameSync(tmp, file);
  dirty.delete(name);
}
function markDirty(name, immediate = false) {
  dirty.add(name);
  if (immediate) { clearTimeout(timers.get(name)); timers.delete(name); try { writeNow(name); } catch (e) { console.warn("[ai] ghi lỗi:", e?.message); } return; }
  if (timers.has(name)) return;
  const t = setTimeout(() => { timers.delete(name); try { writeNow(name); } catch (e) { console.warn("[ai] ghi lỗi:", e?.message); } }, DEBOUNCE_MS);
  t.unref?.();
  timers.set(name, t);
}
/** Ghi ngay mọi thứ đang chờ (gọi khi tắt bot / trong test). */
export function flush() { for (const n of [...dirty]) { clearTimeout(timers.get(n)); timers.delete(n); try { writeNow(n); } catch (e) { console.warn("[ai] ghi lỗi:", e?.message); } } }
/** Giả lập khởi động lại: bỏ cache RAM, lần đọc sau lấy từ đĩa. */
export function dropCache() { flush(); caches.clear(); }
process.once("beforeExit", flush);
process.on("exit", flush);

const key = (id) => String(id ?? "").trim();

// ── cấu hình nhóm ──
export function defaultGroup(settings) {
  return { enabled: !!settings?.aiDefaultEnabled, learning: !!settings?.aiDefaultLearning, code: false, learningBy: null, learningSince: null, enabledBy: null, usage: { date: "", count: 0 }, createdAt: Date.now(), updatedAt: Date.now() };
}
export function getGroup(gid, settings) {
  const all = load("groups"); const k = key(gid);
  const g = all[k];
  return { ...defaultGroup(settings), ...(g || {}), usage: { date: "", count: 0, ...(g?.usage || {}) } };
}
export function patchGroup(gid, patch, settings) {
  const all = load("groups"); const k = key(gid);
  all[k] = { ...getGroup(k, settings), ...patch, updatedAt: Date.now() };
  markDirty("groups", true);
  return all[k];
}
export function listGroups() { return { ...load("groups") }; }

// ── phong cách ──
export function getStyle(gid) { return load("styles")[key(gid)] || null; }
export function saveStyle(gid, style, immediate = false) { load("styles")[key(gid)] = style; markDirty("styles", immediate); }
export function resetStyle(gid) { const all = load("styles"); const had = !!all[key(gid)]; delete all[key(gid)]; markDirty("styles", true); return had; }

// ── hội thoại ──
export function getConv(cid) {
  const all = load("conversations"); const k = key(cid);
  if (!all[k]) all[k] = { messages: [], summary: "", updatedAt: Date.now() };
  return all[k];
}
export function touchConv(cid) { const c = getConv(cid); c.updatedAt = Date.now(); markDirty("conversations"); return c; }
export function clearConv(cid) { const all = load("conversations"); const had = !!all[key(cid)]; delete all[key(cid)]; markDirty("conversations", true); return had; }
export function peek(name) { return load(name); }
export { FILES };
