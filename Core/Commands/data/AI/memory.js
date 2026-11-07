/**
 * AI/memory.js — trí nhớ hội thoại tách riêng từng nhóm (g:<threadId>) / từng người trong tin nhắn riêng (u:<uid>).
 * Chỉ lưu các lượt trao đổi với AI (đã lọc nhạy cảm). Phần cũ được tóm tắt để tiết kiệm token.
 * Tách biệt hoàn toàn với hồ sơ phong cách (styleAnalyzer).
 */
import { AI_SETTINGS } from "./config.js";
import { sanitize, maskPersonal } from "./textUtils.js";
import * as store from "./store.js";

export const convId = (threadId, isGroup, uid) => (isGroup ? `g:${threadId}` : `u:${uid}`);

export function addMessage(cid, role, name, text, settings = AI_SETTINGS) {
  const clean = role === "user" ? sanitize(text, settings.maxInputChars) : maskPersonal(String(text ?? "")).slice(0, 700);
  if (!clean) return false;
  const c = store.getConv(cid);
  c.messages.push({ role, name: role === "user" ? String(name || "").slice(0, 30) : undefined, text: clean, ts: Date.now() });
  c.updatedAt = Date.now();
  store.touchConv(cid);
  return true;
}
export function recent(cid, n = AI_SETTINGS.maxHistory) {
  const c = store.getConv(cid);
  return c.messages.slice(-Math.max(0, n));
}
export function summaryOf(cid) { return store.getConv(cid).summary || ""; }
export function size(cid) { return store.getConv(cid).messages.length; }
export function clear(cid) { return store.clearConv(cid); }

const summarizing = new Set();
/** Khi vượt `storeHistory`, tóm tắt nửa cũ nhất vào summary (qua Groq nếu có; lỗi → rút gọn cục bộ). */
export async function compact(cid, askModel, settings = AI_SETTINGS) {
  const c = store.getConv(cid);
  if (c.messages.length <= settings.storeHistory || summarizing.has(cid)) return false;
  summarizing.add(cid);
  try {
    const cut = Math.floor(c.messages.length / 2);
    const old = c.messages.slice(0, cut);
    const transcript = old.map((m) => `${m.role === "user" ? m.name || "Người dùng" : "AI"}: ${m.text}`).join("\n").slice(0, 5000);
    let summary = "";
    if (typeof askModel === "function") {
      try {
        summary = await askModel([
          { role: "system", content: `Tóm tắt ngắn gọn (tối đa ${Math.floor(settings.maxSummaryChars / 6)} từ, tiếng Việt) nội dung chính, chủ đề và thông tin hữu ích trong đoạn hội thoại, gộp với bản tóm tắt cũ nếu có. Bỏ mọi thông tin cá nhân/nhạy cảm. Chỉ trả về bản tóm tắt.` },
          { role: "user", content: `Tóm tắt cũ: ${c.summary || "(chưa có)"}\n\nĐoạn hội thoại:\n${transcript}` },
        ]);
      } catch { summary = ""; }
    }
    if (!summary) summary = `${c.summary ? c.summary + " | " : ""}${old.filter((m) => m.role === "user").map((m) => m.text.slice(0, 60)).join("; ")}`;
    c.summary = maskPersonal(String(summary)).replace(/\s+/g, " ").trim().slice(-settings.maxSummaryChars);
    c.messages = c.messages.slice(cut);
    store.touchConv(cid);
    return true;
  } finally { summarizing.delete(cid); }
}
