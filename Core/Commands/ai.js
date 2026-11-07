/**
 * .ai — AI trò chuyện thông minh (Groq) cho bot Zalo.
 *  - Gọi AI bằng "ai ơi / phát ơi / AI, ..." hoặc reply vào tin nhắn của AI (hook onMessage, không chặn handler chính).
 *  - Bật/tắt theo từng nhóm, chế độ AI CODE, chế độ HỌC PHONG CÁCH (chỉ lưu số liệu tổng hợp), trí nhớ theo nhóm.
 *  - API key Groq: đặt trong biến môi trường GROQ_API_KEY.
 * Module: data/AI/{config,textUtils,detector,permissions,store,memory,styleAnalyzer,promptBuilder,groqClient,chat}.js
 */
import { AI_SETTINGS, hasApiKey, getModel } from "./data/AI/config.js";
import { detectCall } from "./data/AI/detector.js";
import * as perms from "./data/AI/permissions.js";
import * as store from "./data/AI/store.js";
import * as memory from "./data/AI/memory.js";
import * as styler from "./data/AI/styleAnalyzer.js";
import { createChatService } from "./data/AI/chat.js";
import { norm } from "./data/AI/textUtils.js";
import { getMessageQuote } from "../../App/ZcaAdapter.js";

let svc = createChatService();
export function _setServiceForTests(s) { svc = s; }
export function _resetForTests() { pendingReset.clear(); aiMsgs.clear(); inflight.clear(); seen.clear(); }

const prefixOf = (config) => String(config?.botPrefix || ".");
const pendingReset = new Map();           // uid|tid -> expiresAt
const aiMsgs = new Map();                 // threadId -> string[] id tin nhắn do AI gửi (để nhận biết reply)
const inflight = new Set();               // uid|tid đang chờ AI trả lời
const seen = new Map();                   // msgId -> ts (chống xử lý trùng)
const AI_MSG_CAP = 300;

function collectIds(info, depth = 0, out = new Set()) {
  if (info == null || depth > 5) return out;
  if (Array.isArray(info)) { for (const x of info) collectIds(x, depth + 1, out); return out; }
  if (typeof info === "object") {
    for (const k of ["msgId", "cliMsgId", "globalMsgId", "realMsgId"]) if (info[k] != null && info[k] !== "") out.add(String(info[k]));
    for (const v of Object.values(info)) if (v && typeof v === "object") collectIds(v, depth + 1, out);
  }
  return out;
}
const quoteIds = (q) => (q ? ["msgId", "cliMsgId", "globalMsgId", "realMsgId"].map((k) => q[k]).filter((v) => v != null && v !== "").map(String) : []);
function rememberAiMsg(threadId, ids) {
  if (!ids.length) return;
  const list = aiMsgs.get(threadId) || [];
  list.push(...ids);
  aiMsgs.set(threadId, list.slice(-AI_MSG_CAP));
  if (aiMsgs.size > 500) aiMsgs.delete(aiMsgs.keys().next().value);
}
const isReplyToAi = (threadId, quote) => { const have = aiMsgs.get(threadId); return !!have && quoteIds(quote).some((id) => have.includes(id)); };
function markSeen(id) {
  if (id == null) return false;
  const k = String(id);
  if (seen.has(k)) return true;
  seen.set(k, Date.now());
  if (seen.size > 800) { const cut = Date.now() - 120000; for (const [a, t] of seen) if (t < cut) seen.delete(a); if (seen.size > 800) seen.clear(); }
  return false;
}

function ctxOf({ adapter, message, config, logger }) {
  const data = message.data || {};
  return { adapter, config, logger, message, threadId: String(message.threadId), isGroup: message.type === 1, threadType: message.type === 1 ? "group" : "user", uid: String(data.uidFrom || "").trim(), name: String(data.dName || "Thành viên").slice(0, 30), prefix: prefixOf(config) };
}
async function sendText(c, text, { quote = false } = {}) {
  const base = { threadId: c.threadId, threadType: c.threadType, text };
  try {
    const q = quote ? getMessageQuote(c.message) : null;
    return await c.adapter.sendText(q ? { ...base, quote: q } : base);
  } catch (err) {
    if (quote) { try { return await c.adapter.sendText(base); } catch { /* bỏ qua */ } }
    c.logger?.warn?.("[ai] gửi tin lỗi:", err?.message);
    return null;
  }
}

const onOff = (b) => (b ? "BẬT" : "TẮT");
function helpText(c) {
  const g = c.isGroup ? store.getGroup(c.threadId, AI_SETTINGS) : null;
  const st = c.isGroup ? styler.describe(c.threadId) : null;
  const p = c.prefix;
  return [
    `🤖 ${AI_SETTINGS.botName}`,
    c.isGroup ? `AI: ${onOff(g.enabled)} · Học: ${onOff(g.learning)}${st ? ` (${st.sampleCount} mẫu)` : ""} · Code: ${onOff(g.code)}` : `Tin nhắn riêng: ${perms.canUsePrivate(c.uid, c.config) ? "được dùng" : "chỉ Owner/Admin bot"}`,
    `API key Groq: ${hasApiKey() ? "đã cấu hình" : "CHƯA cấu hình"}`,
    `Gọi AI: "ai ơi ...", "phát ơi ..." hoặc reply tin của AI`,
    `${p}ai on|off · ${p}ai học [off|xem] · ${p}ai code [off]`,
    `${p}ai xoalichsu · ${p}ai quentoi · ${p}ai resetphongcach (Owner)`,
    "Lệnh .ai chỉ dành cho Admin/Owner.",
  ].join("\n");
}

async function cmdToggle(c, on) {
  if (!c.isGroup) return sendText(c, "Bật/tắt AI chỉ dùng trong nhóm. Ở tin nhắn riêng bạn cứ gọi \"ai ơi ...\" nếu bạn có quyền.");
  if (!(await perms.canManage(c))) return sendText(c, "Chỉ quản trị viên nhóm / Admin bot / Owner mới được bật hoặc tắt AI.");
  const before = store.getGroup(c.threadId, AI_SETTINGS);
  store.patchGroup(c.threadId, { enabled: on, enabledBy: c.uid }, AI_SETTINGS);
  const extra = on && !hasApiKey() ? "\n⚠️ API key Groq chưa được cấu hình nên AI sẽ chưa trả lời được (Owner dán key vào Core/Commands/data/AI/config.js)." : "";
  if (before.enabled === on) return sendText(c, `AI của nhóm đã ở trạng thái ${onOff(on)} sẵn rồi.${extra}`);
  return sendText(c, on ? `✅ Đã BẬT AI cho nhóm này. Gọi mình bằng "ai ơi ..." hoặc "phát ơi ..." nhé.${extra}` : "⛔ Đã TẮT AI cho nhóm này. Lịch sử, dữ liệu học và cấu hình vẫn được giữ lại.");
}
async function cmdLearn(c, rest) {
  if (!c.isGroup) return sendText(c, "Chế độ học phong cách chỉ dùng trong nhóm.");
  const sub = norm(rest[0] || "");
  if (sub === "xem" || sub === "info" || sub === "thongtin") return cmdLearnView(c);
  const turnOff = ["off", "tat", "stop", "dung"].includes(sub);
  if (!(await perms.canTrain(c))) return sendText(c, "Chỉ Owner / Admin bot (hoặc người được cấp quyền huấn luyện) mới được bật hoặc tắt chế độ học.");
  const g = store.getGroup(c.threadId, AI_SETTINGS);
  if (turnOff) {
    if (!g.learning) return sendText(c, "Chế độ học phong cách đang TẮT sẵn rồi.");
    store.patchGroup(c.threadId, { learning: false }, AI_SETTINGS);
    return sendText(c, "⛔ Đã TẮT chế độ học phong cách. Bot dừng thu thập dữ liệu mới; hồ sơ đã học vẫn được giữ và vẫn dùng để trả lời.");
  }
  if (g.learning) return sendText(c, "Chế độ học phong cách đang BẬT sẵn rồi.");
  store.patchGroup(c.threadId, { learning: true, learningBy: c.uid, learningSince: Date.now() }, AI_SETTINGS);
  return sendText(c, [
    "📚 CHẾ ĐỘ HỌC PHONG CÁCH ĐANG BẬT.",
    "Bot sẽ phân tích cách nói chuyện chung của nhóm (xưng hô, từ lóng, emoji, độ dài câu…) từ các tin nhắn trong nhóm này.",
    "• Chỉ lưu số liệu tổng hợp, KHÔNG lưu nguyên văn tin nhắn.",
    "• Tin có mật khẩu / khóa / số thẻ / thông tin cá nhân bị bỏ qua hoàn toàn.",
    `• Ai muốn rút dữ liệu của mình: ${c.prefix}ai quentoi`,
    `• Tắt học: ${c.prefix}ai học off`,
  ].join("\n"));
}
async function cmdLearnView(c) {
  const g = store.getGroup(c.threadId, AI_SETTINGS);
  const d = styler.describe(c.threadId);
  const head = `📊 HỒ SƠ PHONG CÁCH — học: ${onOff(g.learning)}`;
  if (!d) return sendText(c, `${head}\nChưa có dữ liệu phong cách. ${g.learning ? "Bot đang thu thập, hãy trò chuyện thêm nhé." : `Owner/Admin dùng ${c.prefix}ai học để bắt đầu.`}\nAI đang dùng phong cách mặc định.`);
  const pct = Math.round(d.adaptation * 100);
  return sendText(c, [
    head,
    `• Số mẫu đã phân tích: ${d.sampleCount} (từ ${d.members} thành viên)`,
    `• Mức thích nghi của AI: ${pct}%${d.sampleCount < AI_SETTINGS.learnMinSamples ? ` (cần tối thiểu ${AI_SETTINGS.learnMinSamples} mẫu mới bắt đầu đổi giọng)` : ""}`,
    `• Giọng điệu: ${d.tone}`,
    d.pronouns.length ? `• Xưng hô: ${d.pronouns.join(", ")}` : "",
    d.slang.length ? `• Từ lóng/viết tắt: ${d.slang.join(", ")}` : "",
    `• Emoji: ${d.emojiStyle}${d.emojiTop.length ? ` (${d.emojiTop.join(" ")})` : ""}`,
    `• Độ dài câu: ${d.sentenceLength} · Hài hước: ${d.humorStyle}`,
    d.commonPhrases.length ? `• Cụm từ phổ biến: ${d.commonPhrases.slice(0, 6).join("; ")}` : "",
    d.notes ? `• Ghi chú: ${d.notes}` : "",
    `• Cập nhật gần nhất: ${new Date(d.lastUpdated).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false })}`,
    "• Phạm vi: tin nhắn thường trong nhóm này khi chế độ học bật (không gồm lệnh, tin nhạy cảm, tin nhắn riêng). Không hiển thị nguyên văn.",
  ].filter(Boolean).join("\n"));
}
async function cmdCode(c, rest) {
  if (!c.isGroup) return sendText(c, "Chế độ AI CODE chỉ bật/tắt theo nhóm, hãy dùng trong nhóm.");
  if (!(await perms.canManage(c))) return sendText(c, "Chỉ quản trị viên nhóm / Admin bot / Owner mới được đổi chế độ AI CODE.");
  const off = ["off", "tat", "stop"].includes(norm(rest[0] || ""));
  store.patchGroup(c.threadId, { code: !off }, AI_SETTINGS);
  return sendText(c, off ? "⛔ Đã TẮT chế độ AI CODE, quay lại trò chuyện bình thường." : "💻 Đã BẬT chế độ AI CODE: ưu tiên hỗ trợ lập trình (JS/Node, HTML, CSS, API, JSON, regex…). Mình sẽ không tự chạy code của ai và không nói đã chạy thử nếu chưa chạy.");
}
async function cmdResetStyle(c, rest) {
  if (!c.isGroup) return sendText(c, "Hãy dùng lệnh này trong nhóm cần reset.");
  if (!perms.canReset(c.uid, c.config)) return sendText(c, "Chỉ Owner mới được reset phong cách của AI.");
  const key = `${c.uid}|${c.threadId}`;
  if (["xacnhan", "yes", "co"].includes(norm(rest[0] || ""))) return doReset(c);
  pendingReset.set(key, Date.now() + 60000);
  return sendText(c, `⚠️ Bạn sắp XÓA toàn bộ hồ sơ phong cách AI đã học của nhóm này (không ảnh hưởng dữ liệu game / kinh tế).\nTrả lời "yes" trong 60 giây để xác nhận, "no" để hủy.`);
}
async function doReset(c) {
  pendingReset.delete(`${c.uid}|${c.threadId}`);
  const had = store.resetStyle(c.threadId);
  store.patchGroup(c.threadId, { learning: false }, AI_SETTINGS);
  return sendText(c, had ? "✅ Đã xóa hồ sơ phong cách của nhóm và tắt chế độ học. AI quay về phong cách mặc định." : "Nhóm này chưa có hồ sơ phong cách nào để xóa. AI vẫn dùng phong cách mặc định.");
}
async function cmdClearHistory(c) {
  if (c.isGroup && !(await perms.canManage(c))) return sendText(c, "Chỉ quản trị viên nhóm / Admin bot / Owner mới được xóa lịch sử hội thoại AI của nhóm.");
  const had = memory.clear(memory.convId(c.threadId, c.isGroup, c.uid));
  return sendText(c, had ? "🧹 Đã xóa lịch sử hội thoại AI của cuộc trò chuyện này (hồ sơ phong cách không bị ảnh hưởng)." : "Chưa có lịch sử hội thoại AI nào để xóa.");
}
async function cmdForgetMe(c) {
  const had = c.isGroup ? styler.forgetMember(c.threadId, c.uid) : false;
  return sendText(c, had ? "✅ Đã xóa phần phong cách học từ tin nhắn của bạn khỏi hồ sơ nhóm." : "Không có dữ liệu học nào liên kết với bạn trong nhóm này (bot chỉ lưu số liệu tổng hợp).");
}

async function processCall(c, content, viaReply) {
  const key = `${c.uid}|${c.threadId}`;
  if (inflight.has(key)) return;
  inflight.add(key);
  try {
    const gcfg = c.isGroup ? store.getGroup(c.threadId, AI_SETTINGS) : { code: false };
    const text = content.trim() || "(Người dùng chỉ gọi tên bạn mà chưa nói gì. Hãy chào lại ngắn gọn và hỏi họ cần gì.)";
    const r = await svc.respond({ uid: c.uid, name: c.name, text, threadId: c.threadId, isGroup: c.isGroup, gcfg, style: c.isGroup ? store.getStyle(c.threadId) : null });
    if (r.ok) {
      for (let i = 0; i < r.parts.length; i++) {
        const info = await sendText(c, r.parts[i], { quote: i === 0 && c.isGroup });
        rememberAiMsg(c.threadId, [...collectIds(info)]);
      }
    } else if (r.error) { rememberAiMsg(c.threadId, [...collectIds(await sendText(c, r.error, { quote: c.isGroup }))]); }
    else if (r.notice) await sendText(c, r.notice);
    if (r.error && r.code !== "RATE_LIMIT") c.logger?.warn?.(`[ai] lỗi Groq: ${r.code}`);
  } catch (err) {
    c.logger?.warn?.("[ai] processCall lỗi:", err?.message);
  } finally { inflight.delete(key); }
}

export default {
  name: "ai",
  description: "AI trò chuyện (Groq): ai ơi / phát ơi, học phong cách, chế độ code",
  version: "1.0.0",
  author: "HNNP STUDIO",
  group: "ai",
  role: 1,   // lệnh .ai chỉ dành cho Admin nhóm / Support / Admin bot / Owner; thành viên chỉ gọi AI bằng "ai ơi ..."
  cooldown: 1,
  aliases: ["phatai", "aichat"],
  noPrefix: false,

  async run({ adapter, message, args = [], config, logger }) {
    const c = ctxOf({ adapter, message, config, logger });
    if (!c.uid) return;
    try {
      if (!(await perms.canManage(c))) return await sendText(c, `Lệnh ${c.prefix}ai chỉ dành cho Admin/Owner. Bạn chỉ cần gọi "ai ơi ..." hoặc "phát ơi ..." để hỏi AI nhé.`);
      const sub = norm(args[0] || ""); const rest = args.slice(1);
      switch (sub) {
        case "": case "help": case "huongdan": case "hd": case "status": case "trangthai": return await sendText(c, helpText(c));
        case "on": case "bat": return await cmdToggle(c, true);
        case "off": case "tat": return await cmdToggle(c, false);
        case "hoc": case "learn": return await cmdLearn(c, rest);
        case "code": return await cmdCode(c, rest);
        case "resetphongcach": case "resetstyle": return await cmdResetStyle(c, rest);
        case "xoalichsu": case "clear": return await cmdClearHistory(c);
        case "quentoi": case "xoadulieu": case "forgetme": return await cmdForgetMe(c);
        default: return await sendText(c, `Lệnh con không hợp lệ. Gõ ${c.prefix}ai để xem hướng dẫn.`);
      }
    } catch (err) {
      logger?.warn?.("[ai] lỗi lệnh:", err?.message);
      return sendText(c, "Đã xảy ra lỗi khi xử lý lệnh AI, vui lòng thử lại.");
    }
  },

  /** Chạy với mọi tin nhắn: xác nhận reset, học phong cách (nền), nhận diện lời gọi AI (không chặn handler). */
  async onMessage({ adapter, message, config, logger }) {
    try {
      if (!message || message.isSelf) return;
      const data = message.data || {};
      if (typeof data.content !== "string") return;
      const text = data.content;
      if (!text.trim()) return;
      const c = ctxOf({ adapter, message, config, logger });
      if (!c.uid || !c.threadId) return;
      const own = String(adapter?.raw?.getOwnId?.() ?? "");
      if (own && c.uid === own) return;                                   // không phản hồi chính bot
      if (text.trim().startsWith(c.prefix)) return;                       // lệnh có prefix do router xử lý
      if (markSeen(data.msgId ?? data.cliMsgId)) return;

      // xác nhận reset phong cách ("yes"/"no")
      const pk = `${c.uid}|${c.threadId}`; const exp = pendingReset.get(pk);
      if (exp) {
        if (exp < Date.now()) pendingReset.delete(pk);
        else {
          const w = norm(text);
          const yes = ["yes", "y", "co", "dongy", "xacnhan", "ok"].includes(w), no = ["no", "n", "khong", "huy"].includes(w);
          if (yes || no) {
            message.__aiConsumed = true;
            if (no) { pendingReset.delete(pk); return void (await sendText(c, "Đã hủy reset phong cách.")); }
            if (perms.canReset(c.uid, config)) return void (await doReset(c));
            return;
          }
        }
      }

      const gcfg = c.isGroup ? store.getGroup(c.threadId, AI_SETTINGS) : null;
      const call = detectCall(text);
      let content = call.content, called = call.called;
      if (!called && data.quote && isReplyToAi(c.threadId, data.quote)) { called = true; content = text; }

      // học phong cách (bất đồng bộ, không làm chậm handler)
      if (c.isGroup && gcfg.learning) {
        const learnText = call.called ? call.content : text;
        setImmediate(() => {
          try {
            if (styler.learnMessage(c.threadId, { uid: c.uid, text: learnText, isStaff: perms.isStaff(c.uid, config), prefix: c.prefix })) styler.maybeRefine(c.threadId, svc.askModel).catch(() => {});
          } catch (e) { logger?.warn?.("[ai] học lỗi:", e?.message); }
        });
      }

      if (!called) return;
      const enabled = c.isGroup ? gcfg.enabled : perms.canUsePrivate(c.uid, config);
      if (!enabled) return;
      void processCall(c, content, !call.called);                         // fire-and-forget
    } catch (err) { logger?.warn?.("[ai] onMessage lỗi:", err?.message); }
  },
};