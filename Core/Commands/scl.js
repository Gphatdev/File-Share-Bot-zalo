/**
 * .scl — SCL MUSIC SEARCH (HNNP STUDIO)
 *   .scl                      → bảng hướng dẫn (Canvas), KHÔNG gọi API tìm kiếm
 *   .scl <tên nhạc> [remix|original|short|long]
 *   .scl chon <số>            → chọn bài từ danh sách gần nhất của bạn (dự phòng khi không reply được)
 * Chọn bài: reply vào ảnh danh sách bằng số thứ tự (hoặc "next"/"prev" để đổi trang) — hook onMessage bên dưới.
 * Module: data/GIAITRI/Scl/{sclParse,sclSearch,sclSession,sclCanvas}.js
 * Chọn bài → thẻ bài (ảnh bìa thật từ YouTube) + liên kết + ghi âm m4a (yt-dlp, tắt bằng SCL_AUDIO=0; xem sclAudio.js).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderGuide, renderResults, renderPick, renderMessage } from "./data/GIAITRI/Scl/sclCanvas.js";
import { parseQuery, formatDuration, normText } from "./data/GIAITRI/Scl/sclParse.js";
import { searchMusic, fetchThumbnail, friendlyReason, SclError, redact } from "./data/GIAITRI/Scl/sclSearch.js";
import * as S from "./data/GIAITRI/Scl/sclSession.js";
import { audioEnabled, downloadAudio, prepareVoiceAac, sendAudioFile, audioFriendly, maxAudioSec, prewarmAudio } from "./data/GIAITRI/Scl/sclAudio.js";

const PAGE_SIZE = 5;
const MAX_QUERY = 120;
const HOT_MS = 2 * 60_000;   // sau khi bot gửi danh sách, người tìm gõ thẳng số trong khoảng này cũng được nhận
const TMP_DIR = path.join(os.tmpdir(), "hnnp-scl");
const prefixOf = (config) => String(config?.botPrefix || ".");
const threadTypeOf = (message) => (message?.type === 1 ? "group" : "user");

// ───────────── gửi ảnh / chữ ─────────────
async function sendPng(c, buffer, caption = "") {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, `scl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
  try {
    fs.writeFileSync(file, buffer);
    const info = await c.adapter.sendImage({ threadId: c.threadId, threadType: c.threadType, imagePath: file, caption });
    return { ok: true, ids: S.collectMessageIds(info) };
  } catch (err) {
    c.logger?.warn?.("[scl] Gửi ảnh thất bại:", { message: redact(err?.message) });
    return { ok: false, ids: [] };
  } finally { try { fs.unlinkSync(file); } catch { /* đã xoá */ } }
}
async function sendText(c, text) {
  try { const info = await c.adapter.sendText({ threadId: c.threadId, threadType: c.threadType, text }); return { ok: true, ids: S.collectMessageIds(info) }; }
  catch (err) { c.logger?.warn?.("[scl] Gửi chữ thất bại:", { message: redact(err?.message) }); return { ok: false, ids: [] }; }
}
/** Thẻ thông báo Canvas; render/gửi lỗi → chữ dự phòng. */
async function card(c, spec) {
  let buf = null;
  try { buf = await renderMessage({ prefix: prefixOf(c.config), ...spec }); } catch (err) { c.logger?.warn?.("[scl] Lỗi vẽ Canvas:", { message: err?.message }); }
  const r = buf ? await sendPng(c, buf) : { ok: false };
  if (!r.ok) await sendText(c, [spec.title, spec.subtitle, ...(spec.lines || [])].filter(Boolean).join("\n"));
}

// ───────────── hiển thị 1 trang kết quả ─────────────
function pagesOf(session) { return Math.max(1, Math.ceil(session.results.length / PAGE_SIZE)); }

function textList(session, page) {
  const start = (page - 1) * PAGE_SIZE;
  const rows = session.results.slice(start, start + PAGE_SIZE).map((it, i) => `${start + i + 1}. ${it.title} — ${it.channel || "?"} [${formatDuration(it.durationSec)}]`);
  return [`Kết quả cho "${session.query}" (trang ${page}/${pagesOf(session)}):`, ...rows, "Reply số thứ tự để chọn bài."].join("\n");
}

async function showPage(c, session, page) {
  const pages = pagesOf(session);
  page = Math.min(Math.max(1, page), pages);
  session.page = page;
  const start = (page - 1) * PAGE_SIZE;
  const items = session.results.slice(start, start + PAGE_SIZE);
  const got = await Promise.all(items.map((it) => fetchThumbnail(it.thumb, it.id)));
  const thumbs = new Map(items.map((it, i) => [it.id, got[i]]));
  let sent = { ok: false, ids: [] };
  try {
    const buf = await renderResults({ query: session.query, mode: session.mode, items, startIndex: start, page, pages, total: session.results.length, source: session.source, prefix: prefixOf(c.config), ttlMin: Math.round((session.expiresAt - Date.now()) / 60000) || 10, thumbs });
    sent = await sendPng(c, buf);
  } catch (err) { c.logger?.warn?.("[scl] Lỗi vẽ danh sách:", { message: err?.message }); }
  if (!sent.ok) sent = await sendText(c, textList(session, page));   // Canvas hỏng vẫn có kết quả
  if (sent.ok) S.bindMessage(session, sent.ids);
  session.shownAt = Date.now();
  S.touch(session);
  return sent.ok;
}

// ───────────── chọn bài ─────────────
/** Tải + gửi voice AAC và file M4A. Lỗi ở bất kỳ bước nào → thông báo rõ; thẻ đã có liên kết. */
/** Bắt đầu tải âm thanh NGAY (song song với việc vẽ/gửi thẻ bài) — không ném lỗi, trả { dl } hoặc { err }. */
function startAudio(item) {
  return downloadAudio(item.id, { durationSec: item.durationSec }).then((dl) => ({ dl }), (err) => ({ err }));
}
async function finishAudio(c, item, started) {
  const { dl, err: dlErr } = await started;
  let file = dl?.path || null;
  let voiceFile = null;
  try {
    if (dlErr) throw dlErr;
    try { voiceFile = await prepareVoiceAac(file); }
    catch (err) { c.logger?.warn?.("[scl] Không tạo được AAC cho tin nhắn thoại:", { code: err?.code, message: redact(err?.message) }); }
    await sendAudioFile(c.adapter.raw, { threadId: c.threadId, threadType: c.threadType, filePath: file, voiceFilePath: voiceFile, title: item.title });
  } catch (err) {
    c.logger?.warn?.("[scl] Gửi ghi âm thất bại:", { code: err?.code, message: redact(err?.message), voice: redact(err?.voiceCause?.message), cause: redact(err?.cause?.message) });
    await card(c, { kind: "error", title: "CHƯA GỬI ĐƯỢC GHI ÂM", subtitle: audioFriendly(err), lines: [item.url] });
  } finally {
    for (const p of [file, voiceFile]) if (p) { try { fs.unlinkSync(p); } catch { /* already removed */ } }
  }
}

async function pick(c, session, n) {
  const item = session.results[n - 1];
  if (!item) return card(c, { kind: "fail", title: "SỐ THỨ TỰ KHÔNG HỢP LỆ", subtitle: `Hãy chọn một số từ 1 đến ${session.results.length}.` });
  const audio = audioEnabled();
  const started = audio ? startAudio(item) : null;   // tải âm thanh song song với vẽ thẻ → nhanh hơn
  try {
  const hq = `https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/hqdefault.jpg`;
  const thumb = (await fetchThumbnail(hq, item.id)) || (await fetchThumbnail(item.thumb, item.id));
  const caption = `${item.title}\n${item.channel || ""}\n${item.url}`.trim();
  let r = { ok: false };
  try { r = await sendPng(c, await renderPick({ item, index: n, thumb, prefix: prefixOf(c.config), audio }), caption); } catch (err) { c.logger?.warn?.("[scl] Lỗi vẽ thẻ bài:", { message: err?.message }); }
  if (!r.ok) await sendText(c, `${caption}\n(Bấm liên kết để nghe trên YouTube.)`);
  S.touch(session);
  } finally { if (started) await finishAudio(c, item, started); }
}

// ───────────── lệnh ─────────────
const searching = new Set();   // `${uid}:${threadId}` đang tìm (chống bấm dồn)

export default {
  name: "scl",
  description: "Tìm và đề xuất nhạc YouTube bằng giao diện Canvas",
  version: "1.0.0",
  author: "HNNP STUDIO",
  group: "media",
  role: 0,
  cooldown: 4,
  aliases: [],
  noPrefix: false,

  async run({ adapter, message, args = [], config, logger }) {
    const uid = String(message?.data?.uidFrom || "");
    const c = { adapter, config, logger, uid, threadId: String(message.threadId), threadType: threadTypeOf(message) };
    const prefix = prefixOf(config);

    // `.scl` trống → hướng dẫn (không gọi API)
    if (!args.length || !args.join(" ").trim()) {
      let buf = null;
      try { buf = await renderGuide({ prefix }); } catch (err) { logger?.warn?.("[scl] Lỗi vẽ hướng dẫn:", { message: err?.message }); }
      const r = buf ? await sendPng(c, buf) : { ok: false };
      if (!r.ok) await sendText(c, `SCL MUSIC SEARCH\n${prefix}scl + Tên nhạc\n${prefix}scl + Tên nhạc + remix | original | short | long\nSau khi có danh sách: reply số thứ tự để chọn bài.`);
      return;
    }

    // `.scl chon N` (dự phòng khi không reply được)
    if (/^(chon|chọn|select)$/i.test(args[0]) && args.length === 2 && /^\d{1,2}$/.test(args[1])) {
      const s = S.latestFor(uid, c.threadId);
      if (!s) return card(c, { kind: "expired", title: "CHƯA CÓ DANH SÁCH", subtitle: `Bạn chưa tìm nhạc (hoặc danh sách đã hết hạn). Hãy dùng ${prefix}scl + tên bài hát.` });
      return pick(c, s, Number(args[1]));
    }

    const cleaned = args.join(" ").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    const { query, mode } = parseQuery(cleaned.slice(0, MAX_QUERY * 2));
    if (!query || normText(query).length < 1) return card(c, { kind: "info", title: "THIẾU TÊN BÀI HÁT", subtitle: `Hãy nhập tên bài hát, ví dụ: ${prefix}scl Nơi Này Có Anh` });
    if (query.length > MAX_QUERY) return card(c, { kind: "fail", title: "TỪ KHÓA QUÁ DÀI", subtitle: `Từ khóa tối đa ${MAX_QUERY} ký tự. Hãy rút gọn tên bài hát.` });

    const lock = `${uid}:${c.threadId}`;
    if (searching.has(lock)) return; // đang tìm cho người này → bỏ qua lệnh dồn
    searching.add(lock);
    try {
      prewarmAudio();   // khởi tạo thư viện âm thanh ở nền trong lúc tìm
      let found;
      try { found = await searchMusic(query, mode, { logger }); }
      catch (err) {
        const fr = friendlyReason(err instanceof SclError ? err : null);
        logger?.warn?.("[scl] Tìm kiếm thất bại:", { code: err?.code, reasons: err?.reasons, message: redact(err?.message) });
        return card(c, { kind: err?.code === "NO_PROVIDER" ? "error" : "fail", title: fr.title, subtitle: fr.text });
      }
      if (!found.results.length) {
        return card(c, { kind: "empty", title: "KHÔNG TÌM THẤY KẾT QUẢ", subtitle: `Không có video phù hợp với "${query}".`, lines: ["Thử viết đủ dấu hoặc thêm tên nghệ sĩ.", "Bỏ từ khóa remix/short/long nếu không cần."] });
      }
      const session = S.createSession({ uid, threadId: c.threadId, threadType: c.threadType, query, mode, results: found.results, source: found.source });
      const ok = await showPage(c, session, 1);
      if (!ok) { S.endSession(session); await card(c, { kind: "error", title: "KHÔNG GỬI ĐƯỢC DANH SÁCH", subtitle: "Bot tìm thấy bài hát nhưng gửi tin nhắn thất bại. Hãy thử lại." }); }
    } finally { searching.delete(lock); }
  },

  /**
   * Chọn bài: reply vào ảnh danh sách (số | next | prev | trang N) — Zalo tự chèn "@tên bot" nên phần nhắc tên được bỏ qua.
   * Ngoài ra, ngay sau khi bot gửi danh sách (HOT_MS), CHÍNH người tìm gõ thẳng số trong cuộc trò chuyện đó cũng được nhận
   * (không cần reply, không cần lệnh). Người khác / cuộc trò chuyện khác / hết hạn → không bao giờ lấy được danh sách.
   */
  async onMessage({ adapter, message, config, logger }) {
    try {
      if (!message || message.isSelf) return;
      const raw = contentText(message.data?.content);
      if (raw == null) return;
      const intent = parseReplyIntent(raw, message.data?.mentions);
      if (!intent) return;                                              // chat thường → không đụng tới
      const uid = String(message.data?.uidFrom || "");
      const threadId = String(message.threadId);
      if (!uid) return;
      const quote = message.data?.quote;
      let found = quote ? S.findByQuote(quote) : null;
      let plain = false;
      if (!found) {
        const own = String(adapter?.raw?.getOwnId?.() ?? "");
        const qOwner = quote ? String(quote.ownerId ?? "") : "";
        const latest = S.latestFor(uid, threadId);
        const replyToOther = !!quote && !!qOwner && !!own && qOwner !== own;   // reply tin của người khác → không phải chọn bài
        if (!replyToOther && latest) {
          if (quote && own && qOwner === own) found = { session: latest };      // reply tin của chính bot nhưng id không khớp
          else if (Date.now() - (latest.shownAt || 0) <= HOT_MS) {               // gõ thẳng số sau khi vừa có danh sách
            const n = intent.type === "num" ? intent.n : null;
            const inRange = intent.type !== "num" || (n >= 1 && n <= latest.results.length);
            if (inRange) { found = { session: latest }; plain = true; }
          }
        }
        if (!found) {
          if (latest) logger?.info?.("[scl] Có lệnh chọn nhưng không khớp danh sách nào", { hasQuote: !!quote, quoteIds: quote ? S.quoteIds(quote) : [], quoteOwnerIsBot: !!quote && !!own && qOwner === own, contentType: typeof message.data?.content, msgType: message.data?.msgType });
          return;
        }
      }
      if (S.seenMessage(message.data?.msgId)) return;                   // sự kiện trùng
      const c = { adapter, config, logger, uid, threadId, threadType: threadTypeOf(message) };
      message.__sclConsumed = true; if (typeof message.data.content === "string") message.data.content = ""; // không để lệnh khác bắt số này

      if (found.expired) return card(c, { kind: "expired", title: "DANH SÁCH ĐÃ HẾT HẠN", subtitle: `Danh sách này đã hết hạn. Hãy tìm lại bằng ${prefixOf(config)}scl + tên bài hát.` });
      const s = found.session;
      if (s.threadId !== threadId) return;                              // khác cuộc trò chuyện
      if (s.uid !== uid) return notOwner(c);                            // danh sách của người khác
      if (s.busy) return;                                               // đang xử lý yêu cầu trước
      s.busy = true;
      try {
        if (intent.type === "num") return await pick(c, s, intent.n);
        const pages = pagesOf(s);
        const target = intent.type === "next" ? s.page + 1 : intent.type === "prev" ? s.page - 1 : intent.n;
        if (target < 1 || target > pages) return card(c, { kind: "info", title: target < 1 ? "ĐÂY LÀ TRANG ĐẦU" : "ĐÂY LÀ TRANG CUỐI", subtitle: pages > 1 ? `Danh sách có ${pages} trang.` : "Danh sách chỉ có 1 trang." });
        return await showPage(c, s, target);
      } finally { s.busy = false; }
    } catch (err) {
      logger?.error?.("[scl] Lỗi hook onMessage:", { message: redact(err?.message) });
    }
  },
};

/** Nội dung chữ của tin nhắn: chuỗi, hoặc object (title/msg/text) khi Zalo gửi dạng "recommended"; không có → null. */
export function contentText(content) {
  if (typeof content === "string") return content;
  if (content && typeof content === "object") for (const k of ["title", "msg", "text"]) if (typeof content[k] === "string") return content[k];
  return null;
}

const noticeAt = new Map();
async function notOwner(c) {
  const last = noticeAt.get(c.uid) || 0;
  if (Date.now() - last < 30_000) return;
  noticeAt.set(c.uid, Date.now());
  if (noticeAt.size > 2000) noticeAt.delete(noticeAt.keys().next().value);
  await sendText(c, `Danh sách này do người khác tìm. Hãy dùng ${prefixOf(c.config)}scl + tên bài hát để tạo danh sách của riêng bạn.`);
}

/** Bỏ các đoạn @nhắc tên (theo mentions[pos,len] nếu có), rồi đọc ý định; không có mentions thì thử 1–2 từ cuối. */
export function parseReplyIntent(content, mentions) {
  const raw = String(content ?? "");
  const direct = parseIntent(raw);
  if (direct) return direct;
  if (!raw.includes("@")) return null;
  if (Array.isArray(mentions) && mentions.length) {
    let t = raw;
    for (const m of [...mentions].sort((a, b) => (b?.pos ?? 0) - (a?.pos ?? 0))) {
      const pos = Number(m?.pos), len = Number(m?.len);
      if (Number.isFinite(pos) && Number.isFinite(len) && len > 0 && pos >= 0 && pos <= t.length) t = t.slice(0, pos) + " " + t.slice(pos + len);
    }
    const r = parseIntent(t.replace(/\s+/g, " "));
    if (r) return r;
  }
  if (!raw.trim().startsWith("@")) return null;
  const words = raw.trim().split(/\s+/);
  return parseIntent(words.slice(-2).join(" ")) || parseIntent(words.slice(-1).join(" "));
}

export function parseIntent(content) {
  const t = String(content || "").trim().toLowerCase();
  let m;
  if ((m = /^#?(\d{1,2})$/.exec(t))) return { type: "num", n: Number(m[1]) };
  if (/^(next|tiep|tiếp|sau|>)$/.test(t)) return { type: "next" };
  if (/^(prev|back|truoc|trước|<)$/.test(t)) return { type: "prev" };
  if ((m = /^(?:trang|page)\s*(\d{1,2})$/.exec(t))) return { type: "page", n: Number(m[1]) };
  return null;
}
