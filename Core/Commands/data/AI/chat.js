/**
 * AI/chat.js — điều phối 1 lượt trò chuyện: giới hạn tốc độ / đồng thời / ngân sách → dựng prompt → gọi Groq →
 * xử lý câu trả lời (làm sạch markdown, chống lặp, cắt/tách tin) → ghi trí nhớ. Không bao giờ ném lỗi ra ngoài.
 */
import { AI_SETTINGS } from "./config.js";
import { chatCompletion, friendlyError, AIError } from "./groqClient.js";
import { buildMessages } from "./promptBuilder.js";
import * as memory from "./memory.js";
import * as store from "./store.js";
import { adaptation, summarize } from "./styleAnalyzer.js";
import { sanitize, norm } from "./textUtils.js";

const dayKey = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(t));

/** Bỏ markdown mà Zalo không hiển thị (giữ nguyên khối code). */
export function formatForZalo(text) {
  const parts = String(text ?? "").split(/(```[\s\S]*?```)/g);
  return parts.map((p, i) => (i % 2 ? p : p.replace(/^#{1,6}\s*/gm, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/^\s*[*•]\s+/gm, "- ").replace(/\n{3,}/g, "\n\n"))).join("").trim();
}
/** Tách thành các tin ≤ size ký tự, ưu tiên cắt ở xuống dòng. */
export function chunkText(text, size = AI_SETTINGS.chunkChars) {
  const out = []; let rest = String(text ?? "");
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size); if (cut < size * 0.5) cut = rest.lastIndexOf(" ", size); if (cut < size * 0.5) cut = size;
    out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function createChatService(opts = {}) {
  const S = { ...AI_SETTINGS, ...(opts.settings || {}) };
  const now = opts.now || (() => Date.now());
  const complete = opts.complete || chatCompletion;
  const userLast = new Map();        // uid -> ts lệnh gần nhất
  const userDay = new Map();         // uid -> {day,count}
  const groupWin = new Map();        // threadId -> [ts…] trong 60s
  const lastReplies = new Map();     // cid -> [norm(reply)…]
  const notified = new Map();        // key -> ts (giới hạn tần suất báo "chậm lại")
  let active = 0; const queue = [];

  const askModel = async (messages) => (await complete({ messages, model: S.summaryModel, maxTokens: 500, temperature: 0.3, settings: S })).text;

  function acquire() {
    if (active < S.maxConcurrent) { active += 1; return Promise.resolve(true); }
    if (queue.length >= S.queueMax) return Promise.resolve(false);
    return new Promise((res) => queue.push(res)).then(() => true);
  }
  function release() { const next = queue.shift(); if (next) next(); else active = Math.max(0, active - 1); }
  function quietNotice(key, text, every = 30000) { const t = now(); if (t - (notified.get(key) || 0) < every) return null; notified.set(key, t); if (notified.size > 500) notified.clear(); return text; }

  /** Kiểm tra giới hạn. null = cho qua; ngược lại {skip:true, notice?} */
  function gate({ uid, threadId, gcfg }) {
    const t = now();
    if (t - (userLast.get(uid) || 0) < S.userCooldownMs) return { skip: true, reason: "cooldown", notice: quietNotice(`c${uid}`, "Bạn hỏi nhanh quá, chờ mình vài giây nhé.") };
    const ud = userDay.get(uid); const d = dayKey(t);
    if (ud && ud.day === d && ud.count >= S.userPerDay) return { skip: true, reason: "user_daily", notice: quietNotice(`u${uid}`, "Hôm nay bạn đã dùng hết lượt hỏi AI, mai quay lại nhé.", 600000) };
    const win = (groupWin.get(threadId) || []).filter((x) => t - x < 60000);
    if (win.length >= S.groupPerMinute) return { skip: true, reason: "group_rate", notice: quietNotice(`g${threadId}`, "AI đang nhận quá nhiều câu hỏi trong nhóm, thử lại sau ít phút nhé.", 60000) };
    if (gcfg && gcfg.usage?.date === d && gcfg.usage.count >= S.groupPerDay) return { skip: true, reason: "group_daily", notice: quietNotice(`gd${threadId}`, "Nhóm đã dùng hết lượt AI hôm nay.", 600000) };
    return null;
  }
  function commit({ uid, threadId, threadKey, gcfg }) {
    const t = now(); const d = dayKey(t);
    userLast.set(uid, t);
    const ud = userDay.get(uid); userDay.set(uid, ud && ud.day === d ? { day: d, count: ud.count + 1 } : { day: d, count: 1 });
    groupWin.set(threadId, [...(groupWin.get(threadId) || []).filter((x) => t - x < 60000), t]);
    if (userLast.size > 3000) { for (const [k, v] of userLast) if (t - v > 600000) { userLast.delete(k); userDay.delete(k); } }
    if (threadKey && gcfg) { const g = store.getGroup(threadKey, S); store.patchGroup(threadKey, { usage: { date: d, count: (g.usage?.date === d ? g.usage.count : 0) + 1 } }, S); }
  }

  /**
   * @param {{uid:string,name:string,text:string,threadId:string,isGroup:boolean,gcfg:object,style?:object|null}} c
   * @returns {Promise<{ok:boolean,parts?:string[],skip?:boolean,notice?:string,error?:string,reason?:string}>}
   */
  async function respond(c) {
    try {
      const cid = memory.convId(c.threadId, c.isGroup, c.uid);
      const blocked = gate({ uid: c.uid, threadId: c.threadId, gcfg: c.isGroup ? c.gcfg : null });
      if (blocked) return { ok: false, ...blocked };
      let userText = sanitize(c.text, S.maxInputChars);
      if (!userText) return { ok: false, skip: true, reason: "sensitive", notice: "Tin nhắn có vẻ chứa thông tin nhạy cảm (mật khẩu/khóa/số thẻ…), mình không xử lý nhé. Bạn hãy xóa thông tin đó đi." };
      if (!(await acquire())) return { ok: false, skip: true, reason: "busy", notice: quietNotice("busy", "AI đang bận xử lý nhiều yêu cầu, bạn thử lại sau ít giây nhé.", 10000) };
      commit({ uid: c.uid, threadId: c.threadId, threadKey: c.isGroup ? c.threadId : null, gcfg: c.isGroup ? c.gcfg : null });
      try {
        const st = c.style || null;
        const base = { botName: S.botName, code: !!c.gcfg?.code, derived: st?.sampleCount ? summarize(st, S) : null, adaptation: adaptation(st, S), notes: st?.notes, summary: memory.summaryOf(cid), history: memory.recent(cid, S.maxHistory), userName: c.name, userText, isGroup: c.isGroup, now: now() };
        const maxTokens = base.code ? S.codeMaxTokens : S.maxTokens;
        let res = await complete({ messages: buildMessages(base, S), maxTokens, settings: S });
        let text = formatForZalo(res.text);
        const prev = lastReplies.get(cid) || [];
        if (prev.includes(norm(text))) {          // chống lặp: thử lại 1 lần với yêu cầu diễn đạt khác
          try { const r2 = await complete({ messages: buildMessages({ ...base, extra: "Lưu ý: tránh lặp lại y nguyên câu trả lời trước đó, hãy diễn đạt khác đi." }, S), maxTokens, temperature: Math.min(1.1, S.temperature + 0.3), settings: S }); text = formatForZalo(r2.text) || text; } catch { /* giữ câu cũ */ }
        }
        const limit = base.code ? S.maxReplyChars : S.conciseReplyChars;
        if (text.length > limit) {
          const head = text.slice(0, limit);
          const cut = Math.max(head.lastIndexOf("\n"), head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
          text = (cut > limit * 0.5 ? head.slice(0, cut + 1) : head).trimEnd();
        }
        lastReplies.set(cid, [...prev, norm(text)].slice(-5));
        memory.addMessage(cid, "user", c.name, c.text, S);
        memory.addMessage(cid, "assistant", "", text, S);
        memory.compact(cid, askModel, S).catch(() => {});
        return { ok: true, parts: chunkText(text, S.chunkChars), model: res.model };
      } finally { release(); }
    } catch (err) {
      const e = err instanceof AIError ? err : new AIError("UNKNOWN", "lỗi nội bộ");
      return { ok: false, error: friendlyError(e), code: e.code };
    }
  }
  return { respond, gate, askModel, _state: { userLast, groupWin, lastReplies, get active() { return active; } } };
}
