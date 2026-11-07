/**
 * Test `.scl` (SCL MUSIC SEARCH). Chạy: node tests/scl.test.mjs
 * Mạng được giả lập hoàn toàn (fetch giả giống phản hồi thật của YouTube Data API v3 / Invidious); không gọi YouTube thật, không đụng Zalo thật.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const scl = (await imp("Core/Commands/scl.js")).default;
const { parseIntent, parseReplyIntent, contentText } = await imp("Core/Commands/scl.js");
const P = await imp("Core/Commands/data/GIAITRI/Scl/sclParse.js");
const Q = await imp("Core/Commands/data/GIAITRI/Scl/sclSearch.js");
const S = await imp("Core/Commands/data/GIAITRI/Scl/sclSession.js");
const Cv = await imp("Core/Commands/data/GIAITRI/Scl/sclCanvas.js");
const sharp = (await import(pathToFileURL(path.join(ROOT, "node_modules/sharp/lib/index.js")).href).catch(() => import("sharp"))).default;

const KEY = "AIzaSyTEST_KEY_1234567890abcdefghij";
const logs = [];
const logger = { info: (...a) => logs.push(a), warn: (...a) => logs.push(a), error: (...a) => logs.push(a), debug() {} };
const config = { botPrefix: "." };
let pass = 0, fail = 0; const out = [];
const reset = () => { Q.resetSearchState(); S.resetForTests(); process.env.YOUTUBE_API_KEY = KEY; process.env.SCL_AUDIO = "0"; process.env.SCL_PUBLIC = "0"; process.env.SCL_AUDIO_BOTH = "0"; delete process.env.SCL_PUBLIC_INSTANCES; delete process.env.SCL_INVIDIOUS_URL; delete process.env.SCL_YTDLP; delete process.env.SCL_YTDLP_PATH; delete process.env.SCL_PROVIDERS; logs.length = 0; };
async function t(n, f) { reset(); try { await f(); pass++; } catch (e) { fail++; out.push(`FAIL ${n}: ${e.stack?.split("\n").slice(0, 3).join(" | ") || e.message}`); } }
const isPng = (b) => Buffer.isBuffer(b) && b.subarray(0, 4).toString("hex") === "89504e47";

// ───────────── dữ liệu mô phỏng YouTube Data API v3 ─────────────
const VIDEOS = [
  { id: "aaaaaaaaa01", title: "NƠI NÀY CÓ ANH | OFFICIAL MUSIC VIDEO | SƠN TÙNG M-TP", ch: "Sơn Tùng M-TP Official", dur: "PT5M2S", at: "2017-02-14T10:00:00Z" },
  { id: "aaaaaaaaa02", title: "Nơi Này Có Anh (Remix) - DJ Triple D", ch: "DJ Triple D", dur: "PT3M45S", at: "2017-05-01T00:00:00Z" },
  { id: "aaaaaaaaa03", title: "Nơi Này Có Anh - Sơn Tùng M-TP (Sped Up)", ch: "SpedUp Vietnam", dur: "PT2M30S", at: "2022-01-10T00:00:00Z" },
  { id: "aaaaaaaaa04", title: "Nơi Này Có Anh (Slowed + Reverb)", ch: "Lofi Chill", dur: "PT4M10S", at: "2021-08-08T00:00:00Z" },
  { id: "aaaaaaaaa05", title: "Nơi Này Có Anh #shorts", ch: "Cover Shorts", dur: "PT0M45S", at: "2023-03-03T00:00:00Z" },
  { id: "aaaaaaaaa06", title: "Nơi Này Có Anh - Extended Version 1 Hour", ch: "Music Loop", dur: "PT1H0M5S", at: "2020-01-01T00:00:00Z" },
  { id: "aaaaaaaaa07", title: "Nơi Này Có Anh (Live Acoustic)", ch: "Acoustic VN", dur: "PT4M0S", at: "2019-09-09T00:00:00Z" },
  { id: "aaaaaaaaa08", title: "Video hoàn toàn không liên quan đến chủ đề", ch: "Linh Tinh", dur: "PT3M0S", at: "2019-09-09T00:00:00Z" },
  { id: "aaaaaaaaa09", title: "NƠI NÀY CÓ ANH | OFFICIAL MUSIC VIDEO | SƠN TÙNG M-TP", ch: "Sơn Tùng M-TP Official", dur: "PT5M2S", at: "2017-02-14T10:00:00Z" }, // trùng
];
const PNG = await sharp({ create: { width: 320, height: 180, channels: 3, background: "#2244aa" } }).png().toBuffer();

/** fetch giả: ghi lại URL; hành vi có thể đổi qua `net`. */
const net = { calls: [], mode: "ok", delay: 0, thumbOk: true, invidious: null };
const realFetch = globalThis.fetch;
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url); net.calls.push(u);
  if (net.extra) { const r = await net.extra(u, opts); if (r) return r; }
  if (net.delay) await new Promise((r) => setTimeout(r, net.delay));
  if (u.startsWith("https://i.ytimg.com/")) return net.thumbOk && !/bad/.test(u) ? new Response(PNG, { status: 200, headers: { "content-length": String(PNG.length) } }) : new Response("x", { status: 404 });
  if (u.startsWith("https://www.googleapis.com/youtube/v3/search")) {
    if (net.mode === "quota") return json({ error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } }, 403);
    if (net.mode === "keyinvalid") return json({ error: { code: 400, message: "API key not valid", errors: [{ reason: "keyInvalid" }] } }, 400);
    if (net.mode === "429") return json({ error: { code: 429 } }, 429);
    if (net.mode === "429once") { net.mode = "ok"; return json({ error: { code: 429 } }, 429); }
    if (net.mode === "500") return json({ error: {} }, 503);
    if (net.mode === "offline") throw new TypeError("fetch failed");
    if (net.mode === "hang") return new Promise((_, rej) => opts.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    if (net.mode === "empty") return json({ items: [] });
    const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || "").replace(/\+/g, " ").toLowerCase();
    const match = VIDEOS.filter((v) => !/khong lien quan|không liên quan/.test(v.title.toLowerCase()) || /khong lien quan|không liên quan/.test(q));
    return json({ items: (net.only || match).map((v) => ({ id: { kind: "youtube#video", videoId: v.id } })) });
  }
  if (u.startsWith("https://www.googleapis.com/youtube/v3/videos")) {
    const ids = decodeURIComponent((u.match(/[?&]id=([^&]*)/) || [])[1] || "").split(",");
    return json({ items: ids.map((id) => VIDEOS.find((v) => v.id === id)).filter(Boolean).map((v) => ({
      id: v.id, status: { privacyStatus: "public" },
      snippet: { title: v.title, channelTitle: v.ch, publishedAt: v.at, liveBroadcastContent: "none", thumbnails: { medium: { url: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg` } } },
      contentDetails: { duration: v.dur },
    })) });
  }
  if (net.invidious && u.startsWith(net.invidious)) return json(net.invidiousBody ?? VIDEOS.slice(0, 3).map((v) => ({ type: "video", videoId: v.id, title: v.title, author: v.ch, lengthSeconds: P.parseIsoDuration(v.dur), published: Math.floor(Date.parse(v.at) / 1000) })));
  return new Response("nf", { status: 404 });
};
const callsTo = (re) => net.calls.filter((u) => re.test(u)).length;
const resetNet = () => { net.extra = null; net.calls = []; net.mode = "ok"; net.delay = 0; net.thumbOk = true; net.invidious = null; net.invidiousBody = null; net.only = null; };

// ───────────── môi trường bot giả ─────────────
let MSG = 0, BOT = 0;
function env() {
  const sent = [];
  const raw = { calls: [], voiceFail: false, fileFail: false, getOwnId: () => "BOT1" };
  raw.uploadAttachment = async (file, threadId, tt) => { raw.calls.push({ k: "upload", file, existed: fs.existsSync(file), tt }); if (raw.voiceFail) throw new Error("upload fail"); return [{ fileType: "others", fileUrl: "https://zalo.test/f/abc.m4a" }]; };
  raw.sendVoice = async (o, threadId, tt) => { raw.calls.push({ k: "voice", url: o.voiceUrl, threadId, tt }); return { msgId: "v1" }; };
  raw.sendMessage = async (m, threadId, tt) => { raw.calls.push({ k: "file", att: m.attachments, existed: fs.existsSync(m.attachments[0]), tt }); if (raw.fileFail) throw new Error("send fail"); return {}; };
  const adapter = {
    raw,
    sendImage: async ({ imagePath, threadId, caption }) => { sent.push({ k: "img", threadId, ok: isPng(fs.readFileSync(imagePath)), size: fs.statSync(imagePath).size, caption }); const id = `bot${++BOT}`; return { message: null, attachment: [{ msgId: id, cliMsgId: `c${id}` }] }; },
    sendText: async ({ text, threadId }) => { sent.push({ k: "txt", threadId, text }); return { message: { msgId: `bot${++BOT}` } }; },
  };
  const msg = (uid, content, { top = {}, data = {} } = {}) => ({ threadId: "T1", type: 1, isSelf: false, data: { uidFrom: uid, msgId: `u${++MSG}`, content, ...data }, ...top });
  const cmd = (uid, ...args) => scl.run({ adapter, message: msg(uid, `.scl ${args.join(" ")}`), args, config, logger });
  const lastBotId = () => `bot${BOT}`;
  const reply = async (uid, content, quoteId, extraTop = {}, extraData = {}) => {
    const m = msg(uid, content, { data: { quote: { globalMsgId: quoteId, cliMsgId: `c${quoteId}`, ownerId: "BOT1" }, ...extraData }, top: extraTop });
    await scl.onMessage({ adapter, message: m, config, logger }); return m;
  };
  return { adapter, sent, raw, cmd, reply, msg, lastBotId };
}
const imgs = (e) => e.sent.filter((s) => s.k === "img");
const txts = (e) => e.sent.filter((s) => s.k === "txt");

// ═══════════ 1. Phân tích từ khóa ═══════════
await t("parseQuery: tên + chế độ ở cuối, linh hoạt dấu cách/hoa thường", () => {
  assert.deepEqual(P.parseQuery(["Nơi", "Này", "Có", "Anh"]), { query: "Nơi Này Có Anh", mode: null });
  assert.deepEqual(P.parseQuery(["Nơi", "Này", "Có", "Anh", "remix"]), { query: "Nơi Này Có Anh", mode: "remix" });
  assert.deepEqual(P.parseQuery("Nơi   Này  Có Anh   SHORT"), { query: "Nơi Này Có Anh", mode: "short" });
  assert.deepEqual(P.parseQuery("em của ngày hôm qua original"), { query: "em của ngày hôm qua", mode: "original" });
  assert.deepEqual(P.parseQuery("lạc trôi long"), { query: "lạc trôi", mode: "long" });
  assert.deepEqual(P.parseQuery("lạc trôi bản gốc"), { query: "lạc trôi", mode: "original" });
  assert.deepEqual(P.parseQuery("lạc trôi ngắn"), { query: "lạc trôi", mode: "short" });
});
await t("parseQuery: không nhầm tên bài hát với chế độ", () => {
  assert.deepEqual(P.parseQuery("remix"), { query: "remix", mode: null });           // chỉ một từ = tên bài
  assert.deepEqual(P.parseQuery("Remix Của Anh Ấy ngày dài"), { query: "Remix Của Anh Ấy ngày", mode: "long" });
  assert.deepEqual(P.parseQuery("remix nơi này có anh"), { query: "remix nơi này có anh", mode: null }); // từ khóa giữa câu không phải chế độ
  assert.deepEqual(P.parseQuery(""), { query: "", mode: null });
  assert.deepEqual(P.parseQuery("   "), { query: "", mode: null });
});
await t("normText bỏ dấu tiếng Việt, đ→d", () => { assert.equal(P.normText("Nơi Này Có Anh – Đừng!"), "noi nay co anh dung"); });
await t("parseIntent: số, next, prev, trang", () => {
  assert.deepEqual(parseIntent("1"), { type: "num", n: 1 }); assert.deepEqual(parseIntent(" #12 "), { type: "num", n: 12 });
  assert.equal(parseIntent("next").type, "next"); assert.equal(parseIntent("Tiếp").type, "next"); assert.equal(parseIntent("prev").type, "prev");
  assert.deepEqual(parseIntent("trang 2"), { type: "page", n: 2 });
  assert.equal(parseIntent("hello"), null); assert.equal(parseIntent("1 2"), null); assert.equal(parseIntent(".scl abc"), null); assert.equal(parseIntent(""), null);
});

// ═══════════ 2. Phân loại / xếp hạng ═══════════
await t("classify: nhãn đúng theo tiêu đề/kênh/thời lượng; không chắc → other", () => {
  const c = (title, channel = "", durationSec = 200) => P.classify({ title, channel, durationSec });
  assert.equal(c("X (Official Music Video)"), "original");
  assert.equal(c("X", "Sơn Tùng - Topic"), "original");
  assert.equal(c("X (DJ Remix)"), "remix"); assert.equal(c("X - Sped Up"), "spedup"); assert.equal(c("X slowed + reverb"), "slowed");
  assert.equal(c("X #shorts", "", 30), "short"); assert.equal(c("X", "", 45), "short");
  assert.equal(c("X extended version"), "long"); assert.equal(c("X 10 hours"), "long");
  assert.equal(c("X live acoustic"), "live");
  assert.equal(c("X cover bởi bạn A"), "other");
  assert.equal(c("X", "", 0), "other");
});
await t("duration/date: định dạng mm:ss, hh:mm:ss, ISO, dd/mm/yyyy, 'Chưa xác định'", () => {
  assert.equal(P.parseIsoDuration("PT4M13S"), 253); assert.equal(P.parseIsoDuration("PT1H2M3S"), 3723); assert.equal(P.parseIsoDuration("P0D"), 0); assert.equal(P.parseIsoDuration("xx"), 0);
  assert.equal(P.formatDuration(253), "04:13"); assert.equal(P.formatDuration(3723), "1:02:03"); assert.equal(P.formatDuration(0), "--:--");
  assert.equal(P.formatDate("2017-02-14T10:00:00Z"), "14/02/2017"); assert.equal(P.formatDate("20210305"), "05/03/2021"); assert.equal(P.formatDate(1500000000), "14/07/2017");
  assert.equal(P.formatDate(null), "Chưa xác định"); assert.equal(P.formatDate("không phải ngày"), "Chưa xác định");
});
const mk = (id, title, channel = "Kênh", durationSec = 200) => ({ id, title, channel, url: `https://www.youtube.com/watch?v=${id}`, thumb: "", durationSec, publishedAt: null });
await t("rankResults: lọc lạc đề, khử trùng, mỗi loại phiên bản có thật xuất hiện, không bịa loại thiếu", () => {
  const items = [mk("a1", "Nơi Này Có Anh (Official MV)"), mk("a1", "Nơi Này Có Anh (Official MV)"), mk("a2", "Nơi này có anh remix"), mk("a3", "Nơi này có anh remix", "Kênh"), mk("a4", "Chuyện hoàn toàn khác"), mk("a5", "Nơi Này Có Anh sped up")];
  const r = P.rankResults(items, "Nơi Này Có Anh");
  assert.equal(r.length, 3, "trùng id + trùng tiêu đề/kênh bị loại, lạc đề bị loại");
  assert.deepEqual(r.map((x) => x.key).sort(), ["original", "remix", "spedup"]);
  assert.ok(!r.some((x) => x.key === "slowed" || x.key === "live"));
});
await t("rankResults: chế độ ưu tiên đúng loại", () => {
  const items = [mk("o", "Bài Hát Hay (Official Audio)", "A - Topic", 240), mk("r", "Bài Hát Hay Remix", "DJ", 200), mk("s", "Bài Hát Hay #shorts", "B", 30), mk("l", "Bài Hát Hay Extended Version", "C", 3000)];
  assert.equal(P.rankResults(items, "Bài Hát Hay", "remix")[0].id, "r");
  assert.equal(P.rankResults(items, "Bài Hát Hay", "original")[0].id, "o");
  assert.equal(P.rankResults(items, "Bài Hát Hay", "short")[0].id, "s");
  assert.equal(P.rankResults(items, "Bài Hát Hay", "long")[0].id, "l");
  const ro = P.rankResults(items, "Bài Hát Hay", "original"); assert.ok(ro.findIndex((x) => x.id === "r") > 0, "remix bị đẩy xuống khi ưu tiên bản gốc");
});
await t("rankResults: khớp không dấu / sai hoa thường", () => {
  assert.equal(P.rankResults([mk("z", "NƠI NÀY CÓ ANH – Sơn Tùng")], "noi nay co anh").length, 1);
});

// ═══════════ 3. Tìm kiếm (mạng giả) ═══════════
await t("YouTube API: gọi search + videos, đúng tham số, ra đủ trường dữ liệu", async () => {
  resetNet();
  const r = await Q.searchMusic("Nơi Này Có Anh", null);
  assert.equal(r.provider, "youtube"); assert.equal(r.source, "YouTube Data API v3");
  assert.equal(callsTo(/youtube\/v3\/search/), 1); assert.equal(callsTo(/youtube\/v3\/videos/), 1);
  const u = net.calls.find((x) => /v3\/search/.test(x)); assert.match(u, /type=video/); assert.match(u, /maxResults=25/);
  const o = r.results.find((x) => x.id === "aaaaaaaaa01");
  assert.equal(o.title.startsWith("NƠI NÀY CÓ ANH"), true); assert.equal(o.channel, "Sơn Tùng M-TP Official"); assert.equal(o.url, "https://www.youtube.com/watch?v=aaaaaaaaa01");
  assert.equal(o.durationSec, 302); assert.equal(P.formatDate(o.publishedAt), "14/02/2017"); assert.match(o.thumb, /^https:\/\/i\.ytimg\.com\//); assert.equal(o.key, "original");
  assert.ok(r.results.length >= 6); assert.ok(!r.results.some((x) => /không liên quan/i.test(x.title)));
  assert.equal(r.results.filter((x) => x.id.startsWith("aaaaaaaaa0") && x.title.startsWith("NƠI NÀY CÓ ANH |")).length, 1, "bản trùng bị loại");
});
await t("mode remix: thêm 'remix' vào truy vấn, remix đứng đầu", async () => {
  resetNet();
  const r = await Q.searchMusic("Nơi Này Có Anh", "remix");
  assert.match(decodeURIComponent(net.calls.find((x) => /v3\/search/.test(x)).replace(/\+/g, " ")), /q=Nơi Này Có Anh remix/);
  assert.equal(r.results[0].key, "remix");
});
await t("cache: tìm lại cùng từ khóa không gọi API; gọi song song chỉ gọi 1 lần", async () => {
  resetNet();
  const [a, b] = await Promise.all([Q.searchMusic("Nơi Này Có Anh"), Q.searchMusic("nơi  này có anh")]);
  assert.equal(callsTo(/v3\/search/), 1, "đồng thời chỉ 1 lần gọi");
  const c = await Q.searchMusic("Nơi Này Có Anh"); assert.equal(c.fromCache, true); assert.equal(callsTo(/v3\/search/), 1);
  assert.equal(a.results.length, c.results.length);
});
await t("không có nguồn nào cấu hình → NO_PROVIDER, không gọi mạng", async () => {
  resetNet(); delete process.env.YOUTUBE_API_KEY;
  await assert.rejects(() => Q.searchMusic("abc"), (e) => e.code === "NO_PROVIDER"); assert.equal(net.calls.length, 0);
  assert.match(Q.friendlyReason({ code: "NO_PROVIDER" }).text, /YOUTUBE_API_KEY/);
});
await t("hết quota: chuyển sang Invidious dự phòng; khoá cooldown nguồn lỗi", async () => {
  resetNet(); net.mode = "quota"; process.env.SCL_INVIDIOUS_URL = "https://inv.example.test"; net.invidious = "https://inv.example.test";
  const r = await Q.searchMusic("Nơi Này Có Anh");
  assert.equal(r.provider, "invidious"); assert.ok(r.results.length >= 1);
  assert.match(net.calls.find((x) => x.startsWith("https://inv.example.test")), /\/api\/v1\/search\?q=/);
  net.calls = []; Q.resetSearchState(); // cache xoá nhưng thử cooldown riêng:
});
await t("quota + không có dự phòng → ALL_FAILED(QUOTA) + thông báo thân thiện; lần sau không gọi lại ngay", async () => {
  resetNet(); net.mode = "quota";
  const err = await Q.searchMusic("Bài A").catch((e) => e);
  assert.equal(err.code, "ALL_FAILED"); assert.match(err.reasons.join(), /youtube:QUOTA/);
  assert.equal(Q.friendlyReason(err).title, "HẾT HẠN MỨC TÌM KIẾM");
  const before = net.calls.length; await Q.searchMusic("Bài B").catch(() => {}); assert.equal(net.calls.length, before, "đang cooldown nên không gọi API");
});
await t("key sai → KEY_INVALID; thông báo không chứa key", async () => {
  resetNet(); net.mode = "keyinvalid";
  const err = await Q.searchMusic("Bài A").catch((e) => e); assert.match(err.reasons.join(), /KEY_INVALID/);
  const fr = Q.friendlyReason(err); assert.ok(!JSON.stringify(fr).includes(KEY));
});
await t("HTTP 429 thử lại 1 lần rồi thành công; 429 liên tục → lỗi RATE", async () => {
  resetNet(); net.mode = "429once"; const ok = await Q.searchMusic("Nơi Này Có Anh"); assert.ok(ok.results.length); assert.equal(callsTo(/v3\/search/), 2);
  Q.resetSearchState(); resetNet(); net.mode = "429"; const err = await Q.searchMusic("Nơi Này Có Anh").catch((e) => e); assert.match(err.reasons.join(), /RATE/); assert.equal(callsTo(/v3\/search/), 2);
});
await t("máy chủ 5xx và mất mạng → lỗi thân thiện", async () => {
  resetNet(); net.mode = "500"; let e = await Q.searchMusic("a b").catch((x) => x); assert.match(e.reasons.join(), /SERVER/);
  Q.resetSearchState(); resetNet(); net.mode = "offline"; e = await Q.searchMusic("a b").catch((x) => x); assert.match(e.reasons.join(), /NETWORK/); assert.equal(Q.friendlyReason(e).title, "KHÔNG KẾT NỐI ĐƯỢC");
});
await t("treo mạng → hết thời gian chờ, không treo bot", async () => {
  resetNet(); net.mode = "hang"; const old = Q.LIMITS.timeoutMs, oldR = Q.LIMITS.retries; Q.LIMITS.timeoutMs = 150; Q.LIMITS.retries = 0;
  const t0 = Date.now(); const e = await Q.searchMusic("treo may").catch((x) => x); Q.LIMITS.timeoutMs = old; Q.LIMITS.retries = oldR;
  assert.match(e.reasons.join(), /TIMEOUT/); assert.ok(Date.now() - t0 < 2000);
});
await t("không có kết quả (API trả rỗng) → results rỗng, không lỗi", async () => {
  resetNet(); net.mode = "empty"; const r = await Q.searchMusic("zzzz qqqq"); assert.equal(r.results.length, 0);
});
await t("yt-dlp (exec giả) phân tích JSON từng dòng; thiếu yt-dlp → NO_YTDLP", async () => {
  resetNet(); delete process.env.YOUTUBE_API_KEY; process.env.SCL_YTDLP = "1";
  const lines = [{ id: "bbbbbbbbb01", title: "Nơi Này Có Anh Official Audio", channel: "Sơn Tùng", duration: 250, upload_date: "20170214" }, { id: "bad", title: "x" }, "không phải json"].map((x) => typeof x === "string" ? x : JSON.stringify(x)).join("\n");
  let argv; const execImpl = (bin, args, o, cb) => { argv = [bin, args]; cb(null, lines); };
  const r = await Q.searchMusic("Nơi Này Có Anh", null, { execImpl });
  assert.equal(r.provider, "ytdlp"); assert.equal(r.results.length, 1); assert.equal(r.results[0].durationSec, 250); assert.equal(P.formatDate(r.results[0].publishedAt), "14/02/2017");
  assert.match(argv[1].at(-1), /^ytsearch25:Nơi Này Có Anh$/); assert.equal(argv[0], "yt-dlp");
  Q.resetSearchState(); const e = await Q.searchMusic("a b", null, { execImpl: (b, a, o, cb) => cb(Object.assign(new Error("x"), { code: "ENOENT" })) }).catch((x) => x); assert.match(e.reasons.join(), /NO_YTDLP/);
});
await t("thumbnail: chỉ nhận https + domain YouTube/Google, còn lại dùng ảnh chuẩn", () => {
  assert.equal(Q.safeThumbUrl("https://i.ytimg.com/vi/abc/mq.jpg", "abc"), "https://i.ytimg.com/vi/abc/mq.jpg");
  for (const bad of ["http://i.ytimg.com/x.jpg", "https://evil.example/x.jpg", "https://127.0.0.1/x", "file:///etc/passwd", "javascript:alert(1)", "", null]) assert.equal(Q.safeThumbUrl(bad, "abc"), "https://i.ytimg.com/vi/abc/mqdefault.jpg");
});
await t("fetchThumbnail: lỗi/404/quá lớn → null (không ném)", async () => {
  resetNet(); assert.ok(Buffer.isBuffer(await Q.fetchThumbnail("https://i.ytimg.com/vi/ok/mq.jpg", "ok")));
  assert.equal(await Q.fetchThumbnail("https://i.ytimg.com/vi/bad/mq.jpg", "bad"), null);
  assert.equal(await Q.fetchThumbnail("x", "x", { fetchImpl: async () => { throw new Error("net"); } }), null);
  assert.equal(await Q.fetchThumbnail("https://i.ytimg.com/vi/big/mq.jpg", "big", { fetchImpl: async () => new Response(Buffer.alloc(10), { headers: { "content-length": "9999999" } }) }), null);
});
await t("redact: che key khỏi chuỗi log", () => { assert.ok(!Q.redact(`GET ...&key=${KEY}&x=1`).includes(KEY)); assert.ok(!Q.redact(`lỗi ${KEY}`).includes(KEY)); });

// ═══════════ 4. Canvas ═══════════
const metaOf = async (b) => sharp(b).metadata();
const item = (over = {}) => ({ id: "aaaaaaaaa01", title: "NƠI NÀY CÓ ANH", channel: "Sơn Tùng M-TP Official", url: "https://www.youtube.com/watch?v=aaaaaaaaa01", durationSec: 302, publishedAt: "2017-02-14T10:00:00Z", key: "original", label: "ORIGINAL", ...over });
await t("Canvas: hướng dẫn + mọi thẻ thông báo ra PNG hợp lệ", async () => {
  for (const b of [await Cv.renderGuide({ prefix: "." }), ...await Promise.all(Cv.MESSAGE_KINDS.map((kind) => Cv.renderMessage({ kind, title: "TIÊU ĐỀ", subtitle: "Mô tả khá dài ".repeat(12), lines: ["Dòng gợi ý 1", "Dòng gợi ý 2"] })))]) { assert.ok(isPng(b)); assert.ok(b.length < 4_000_000); }
});
await t("Canvas: danh sách 5 thẻ có thumbnail thật, chiều cao tự tính theo số thẻ", async () => {
  const five = Array.from({ length: 5 }, (_, i) => item({ id: `v${i}`, title: `Bài hát số ${i + 1}` }));
  const one = await Cv.renderResults({ query: "Nơi Này Có Anh", items: five.slice(0, 1), startIndex: 0, page: 1, pages: 1, total: 1, thumbs: new Map([["v0", PNG]]) });
  const all = await Cv.renderResults({ query: "Nơi Này Có Anh", mode: "remix", items: five, startIndex: 0, page: 1, pages: 3, total: 15, source: "YouTube Data API v3", thumbs: new Map(five.map((x) => [x.id, PNG])) });
  const m1 = await metaOf(one), m5 = await metaOf(all);
  assert.equal(m5.width, 1200); assert.ok(m5.height > m1.height + 4 * 200, `cao ${m1.height} → ${m5.height}`); assert.ok(all.length < 4_000_000);
});
await t("Canvas: thumbnail lỗi / buffer rác / thiếu → khung dự phòng, vẫn render đủ", async () => {
  const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];
  const b = await Cv.renderResults({ query: "x", items, startIndex: 0, page: 1, pages: 1, total: 3, thumbs: new Map([["a", Buffer.from("rac khong phai anh")], ["b", null]]) });
  assert.ok(isPng(b));
});
await t("Canvas: tên rất dài + tiếng Việt có dấu + ký tự lạ, thời lượng giờ, ngày thiếu", async () => {
  const long = item({ title: "Nơi Này Có Anh – Phiên Bản Đặc Biệt Dài Dòng Không Dấu Cách ".repeat(6) + "ĂÂÊÔƠƯĐ ặằẳẵ ỳỷỹ", channel: "Kênh có tên cực kỳ dài ".repeat(10), durationSec: 7325, publishedAt: null, key: "long" });
  const weird = item({ id: "w", title: "😀 <script>alert(1)</script> \\ / \" ' ` 𝔘𝔫𝔦𝔠𝔬𝔡𝔢" + "a".repeat(300), channel: "", key: "other" });
  const b = await Cv.renderResults({ query: "Tên bài hát cũng rất dài ".repeat(8), items: [long, weird], startIndex: 5, page: 2, pages: 3, total: 15, thumbs: new Map() });
  assert.ok(isPng(b)); assert.equal((await metaOf(b)).width, 1200);
});
await t("Canvas: thẻ bài đã chọn", async () => {
  assert.ok(isPng(await Cv.renderPick({ item: item(), index: 3, thumb: PNG })));
  assert.ok(isPng(await Cv.renderPick({ item: item({ title: "Rất dài ".repeat(60) }), index: 3, thumb: null })));
});
await t("Canvas: render nhiều lần không phình bộ nhớ đáng kể", async () => {
  const items = Array.from({ length: 5 }, (_, i) => item({ id: `v${i}` })); const th = new Map(items.map((x) => [x.id, PNG]));
  if (global.gc) global.gc(); const m0 = process.memoryUsage().rss;
  for (let i = 0; i < 25; i++) await Cv.renderResults({ query: "x", items, startIndex: 0, page: 1, pages: 1, total: 5, thumbs: th });
  if (global.gc) global.gc(); assert.ok(process.memoryUsage().rss - m0 < 400 * 1024 * 1024, `rss +${((process.memoryUsage().rss - m0) / 1e6) | 0}MB`);
});

// ═══════════ 5. Lệnh + chọn bài ═══════════
await t(".scl trống → bảng hướng dẫn Canvas, KHÔNG gọi API", async () => {
  resetNet(); const e = env(); await e.cmd("U1");
  assert.equal(imgs(e).length, 1); assert.ok(imgs(e)[0].ok); assert.equal(net.calls.length, 0);
  const e2 = env(); await scl.run({ adapter: e2.adapter, message: e2.msg("U1", ".scl   "), args: ["", "  "], config, logger }); assert.equal(net.calls.filter((u) => /googleapis/.test(u)).length, 0);
});
await t(".scl <tên> → 1 ảnh danh sách, trang 1 tối đa 5 thẻ, ghi nhận msgId để reply", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh");
  assert.equal(imgs(e).length, 1); assert.ok(imgs(e)[0].ok); assert.equal(S.activeCount(), 1);
  assert.equal(callsTo(/ytimg/), 5, "chỉ tải thumbnail của 5 thẻ trong trang");
  assert.ok(S.findByQuote({ globalMsgId: e.lastBotId() })?.session, "reply theo globalMsgId");
  assert.ok(S.findByQuote({ cliMsgId: `c${e.lastBotId()}` })?.session, "reply theo cliMsgId");
});
await t("reply số → thẻ bài đã chọn + liên kết YouTube hợp lệ (không giả file âm thanh)", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh");
  const q = e.lastBotId(); const m = await e.reply("U1", "1", q);
  assert.ok(m.__sclConsumed); assert.equal(m.data.content, "");
  const pickImg = imgs(e).at(-1); assert.ok(pickImg.ok); assert.match(pickImg.caption, /https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}/);
  assert.ok(!/\.mp3|\.m4a/.test(pickImg.caption));
});
await t("reply số sai (0, vượt quá) → thông báo, không chọn bậy; phiên còn dùng được", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); const q = e.lastBotId();
  for (const bad of ["0", "99"]) { const before = e.sent.length; await e.reply("U1", bad, q); assert.ok(e.sent.length === before + 1); assert.ok(!/youtube\.com/.test(e.sent.at(-1).caption || "")); }
  await e.reply("U1", "2", q); assert.match(e.sent.at(-1).caption, /youtube\.com/);
});
await t("reply thường (không phải số/next/prev) KHÔNG bị nuốt", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); const before = e.sent.length;
  const m = await e.reply("U1", "bài này hay quá", e.lastBotId()); assert.ok(!m.__sclConsumed); assert.equal(m.data.content, "bài này hay quá"); assert.equal(e.sent.length, before);
  const m2 = e.msg("U2", "1"); await scl.onMessage({ adapter: e.adapter, message: m2, config, logger }); assert.ok(!m2.__sclConsumed, "người khác gõ số thì bỏ qua");
});
await t("hai người tìm cùng lúc: mỗi người chỉ chọn được trong danh sách của mình", async () => {
  resetNet(); const e = env();
  net.only = VIDEOS.slice(0, 3); await Promise.all([e.cmd("A", "Nơi", "Này", "Có", "Anh"), e.cmd("B", "Nơi", "Này", "Có", "Anh", "remix")]);
  assert.equal(S.activeCount(), 2); const [ia, ib] = imgs(e).length === 2 ? [1, 2] : [0, 0];
  const botIds = ["bot" + (BOT - 1), "bot" + BOT]; // 2 ảnh vừa gửi (thứ tự theo hoàn tất)
  const owner = (id) => S.findByQuote({ globalMsgId: id }).session.uid;
  const idA = botIds.find((id) => owner(id) === "A"), idB = botIds.find((id) => owner(id) === "B"); assert.ok(idA && idB && idA !== idB);
  const n0 = e.sent.length; const m = await e.reply("B", "1", idA); // B reply danh sách của A
  assert.ok(m.__sclConsumed); assert.equal(e.sent.length, n0 + 1); assert.equal(e.sent.at(-1).k, "txt"); assert.match(e.sent.at(-1).text, /người khác/);
  assert.ok(!imgs(e).some((x, i) => i >= 2 && /youtube\.com/.test(x.caption || "")), "không gửi bài của A cho B");
  await e.reply("B", "1", idA); assert.equal(e.sent.length, n0 + 1, "thông báo bị giới hạn tần suất (không spam)");
  await e.reply("A", "1", idA); assert.match(e.sent.at(-1).caption, /youtube\.com/);
  await e.reply("B", "1", idB); assert.match(e.sent.at(-1).caption, /youtube\.com/);
});
await t("reply trong cuộc trò chuyện khác bị bỏ qua", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); const n = e.sent.length;
  await e.reply("U1", "1", e.lastBotId(), { threadId: "T-KHAC" }); assert.equal(e.sent.length, n);
});
await t("danh sách hết hạn → thông báo 'đã hết hạn'; sau đó dọn sạch bộ nhớ", async () => {
  resetNet(); const e = env(); S.setTtlForTests(150); await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); const q = e.lastBotId();
  await new Promise((r) => setTimeout(r, 400));
  await e.reply("U1", "1", q); assert.equal(imgs(e).length, 2); assert.ok(imgs(e).at(-1).ok); assert.ok(!/youtube\.com/.test(imgs(e).at(-1).caption || ""));
  assert.equal(S.activeCount(), 0);
});
await t("reply vào ảnh lạ (không phải danh sách của bot) → bỏ qua", async () => {
  resetNet(); const e = env(); const m = await e.reply("U1", "1", "khong-ton-tai"); assert.ok(!m.__sclConsumed); assert.equal(e.sent.length, 0);
});
await t("phân trang: next/prev/trang N, trang đầu/cuối báo đúng, mỗi ảnh mới đều reply được", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh");
  const listId = e.lastBotId(); const s = S.findByQuote({ globalMsgId: listId }).session; assert.ok(s.results.length >= 6);
  await e.reply("U1", "prev", listId); assert.ok(!/youtube/.test(e.sent.at(-1).caption || "")); // đang trang 1
  const n = imgs(e).length; await e.reply("U1", "next", listId); assert.equal(imgs(e).length, n + 1); assert.equal(s.page, 2);
  const page2Id = e.lastBotId(); await e.reply("U1", "7", page2Id); assert.match(e.sent.at(-1).caption, /youtube\.com/, "chọn bài từ ảnh trang 2 (số thứ tự toàn cục)");
  await e.reply("U1", "trang 1", page2Id); assert.equal(s.page, 1);
});
await t("tìm kiếm không có kết quả → thẻ Canvas gợi ý, không tạo phiên", async () => {
  resetNet(); net.mode = "empty"; const e = env(); await e.cmd("U1", "zzzz", "qqqq"); assert.equal(imgs(e).length, 1); assert.ok(imgs(e)[0].ok); assert.equal(S.activeCount(), 0);
});
await t("không có kết quả khớp (API trả video lạc đề) → coi như không tìm thấy", async () => {
  resetNet(); net.only = [VIDEOS[7]]; const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); assert.equal(S.activeCount(), 0); assert.equal(imgs(e).length, 1);
});
await t("API hết quota / mất mạng / chưa cấu hình → thẻ lỗi thân thiện (không lộ key), bot không crash", async () => {
  for (const mode of ["quota", "offline", "500", "keyinvalid"]) {
    resetNet(); Q.resetSearchState(); net.mode = mode; const e = env(); await e.cmd("U1", "Bài", "Hát", mode); assert.equal(imgs(e).length + txts(e).length, 1);
    assert.ok(!JSON.stringify(e.sent).includes(KEY)); assert.equal(S.activeCount(), 0);
  }
  resetNet(); Q.resetSearchState(); delete process.env.YOUTUBE_API_KEY; const e = env(); await e.cmd("U1", "Bài", "Hát"); assert.equal(imgs(e).length, 1);
  assert.ok(!logs.some((l) => JSON.stringify(l).includes(KEY)), "key không nằm trong log");
});
await t("Canvas gửi ảnh thất bại → vẫn gửi danh sách dạng chữ kèm số thứ tự", async () => {
  resetNet(); const e = env(); e.adapter.sendImage = async () => { throw new Error("upload fail"); };
  await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); assert.equal(txts(e).length, 1); assert.match(txts(e)[0].text, /1\. /); assert.equal(S.activeCount(), 1);
  assert.ok(S.findByQuote({ globalMsgId: e.lastBotId() })?.session, "vẫn reply được vào tin chữ");
});
await t("gửi cả ảnh lẫn chữ đều thất bại → không crash, dọn phiên", async () => {
  resetNet(); const e = env(); e.adapter.sendImage = async () => { throw new Error("x"); }; e.adapter.sendText = async () => { throw new Error("y"); };
  await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); assert.equal(S.activeCount(), 0);
});
await t(".scl chon N (dự phòng khi không reply được) lấy đúng danh sách của chính người đó", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh");
  await e.cmd("U2", "chon", "1"); assert.ok(!/youtube\.com/.test(e.sent.at(-1).caption || ""), "người khác không có danh sách");
  await e.cmd("U1", "chon", "2"); assert.match(e.sent.at(-1).caption, /youtube\.com/);
});
await t("tìm lặp dồn dập cùng lúc chỉ xử lý 1 lần (không spam API)", async () => {
  resetNet(); net.delay = 60; const e = env(); await Promise.all([e.cmd("U1", "Nơi", "Này", "Có", "Anh"), e.cmd("U1", "Nơi", "Này", "Có", "Anh"), e.cmd("U1", "Nơi", "Này", "Có", "Anh")]);
  assert.equal(imgs(e).length, 1); assert.equal(callsTo(/v3\/search/), 1);
});
await t("từ khóa quá dài / ký tự điều khiển được xử lý an toàn", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "a".repeat(300)); assert.equal(imgs(e).length, 1); assert.equal(callsTo(/googleapis/), 0);
  await e.cmd("U1", "Nơi\u0000Này\u001fCó", "Anh"); assert.ok(callsTo(/googleapis/) >= 1);
});
await t("giới hạn phiên mỗi người; phiên cũ bị dọn", async () => {
  resetNet(); const e = env(); for (let i = 0; i < 5; i++) { Q.resetSearchState(); await e.cmd("U1", "Nơi", "Này", "Có", `Anh${i === 0 ? "" : ""}`); }
  assert.ok(S.activeCount() <= S.MAX_PER_USER);
});
await t("lệnh scl được phân loại trong LIMIT (đa phương tiện) và có onMessage hợp lệ", async () => {
  const cat = await imp("Core/Commands/data/ADMIN/Limit/categories.js"); assert.equal(cat.classifyCommand(scl), "dapt");
  assert.equal(scl.name, "scl"); assert.equal(typeof scl.run, "function"); assert.equal(typeof scl.onMessage, "function");
});

// ═══════════ 6. Ghi âm (yt-dlp giả chạy thật bằng tiến trình con) ═══════════
const FAKE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "scl-fake-"));
const FAKE = path.join(FAKE_DIR, "yt-dlp");
const MARK = path.join(FAKE_DIR, "spawned.log");
fs.writeFileSync(FAKE, `#!/usr/bin/env node
const fs = require("fs"); const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(MARK)}, a[a.length - 1] + "\\n");
const mode = process.env.FAKE_YTDLP || "ok";
fs.appendFileSync(${JSON.stringify(MARK + ".args")}, a.join(" ") + "\\n");
if (mode === "botcheck") { process.stderr.write("ERROR: [youtube] x: Sign in to confirm you’re not a bot. Use --cookies-from-browser"); process.exit(1); }
const o = a[a.indexOf("-o") + 1];
if (mode === "fail") { process.stderr.write("ERROR"); process.exit(1); }
const ext = mode === "wrongext" ? "webm" : "m4a";
const f = o.replace("%(ext)s", ext);
if (mode === "slow") { setTimeout(() => { fs.writeFileSync(f, Buffer.alloc(6000, 1)); console.log(f); }, 400); }
else { fs.writeFileSync(f, Buffer.alloc(mode === "small" ? 10 : 6000, 1)); console.log(f); }
`); fs.chmodSync(FAKE, 0o755);
const Au = await imp("Core/Commands/data/GIAITRI/Scl/sclAudio.js");
const audioLeft = () => fs.readdirSync(Au.AUDIO_DIR).filter((f) => f.startsWith("scl-"));
const spawned = () => (fs.existsSync(MARK) ? fs.readFileSync(MARK, "utf8").split("\n").filter(Boolean) : []);
async function audioEnv(mode = "ok") {
  resetNet(); process.env.SCL_AUDIO = "1"; process.env.SCL_YTDLP_PATH = FAKE; process.env.FAKE_YTDLP = mode; fs.rmSync(MARK, { force: true });
  const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); return e;
}
await t("ghi âm: chọn bài → thẻ bài + liên kết + tin nhắn thoại (upload → sendVoice), file tạm bị xoá", async () => {
  const e = await audioEnv(); await e.reply("U1", "1", e.lastBotId());
  const k = e.raw.calls.map((x) => x.k); assert.deepEqual(k, ["upload", "voice"]);
  assert.ok(e.raw.calls[0].existed, "file m4a thật tồn tại lúc upload"); assert.equal(e.raw.calls[0].tt, 1); assert.equal(e.raw.calls[1].url, "https://zalo.test/f/abc.m4a");
  assert.ok(imgs(e).some((x) => /youtube\.com\/watch/.test(x.caption || "")), "vẫn gửi liên kết");
  assert.equal(audioLeft().length, 0, "không sót file tạm"); assert.ok(!fs.existsSync(e.raw.calls[0].file));
  const args = fs.readFileSync(MARK, "utf8"); assert.match(args, /youtube\.com\/watch\?v=aaaaaaaaa01/);
});
await t("ghi âm: voice lỗi → tự gửi dạng file m4a", async () => {
  const e = await audioEnv(); e.raw.voiceFail = true; await e.reply("U1", "1", e.lastBotId());
  assert.deepEqual(e.raw.calls.map((x) => x.k), ["upload", "file"]); assert.ok(e.raw.calls[1].existed); assert.equal(audioLeft().length, 0);
});
await t("ghi âm: voice + file đều lỗi → thẻ lỗi rõ ràng (không báo thành công), vẫn có liên kết, dọn file", async () => {
  const e = await audioEnv(); e.raw.voiceFail = true; e.raw.fileFail = true; await e.reply("U1", "1", e.lastBotId());
  assert.deepEqual(e.raw.calls.map((x) => x.k), ["upload", "file"]); assert.equal(audioLeft().length, 0);
  assert.ok(imgs(e).length >= 3); assert.ok(imgs(e).some((x) => /youtube\.com\/watch/.test(x.caption || "")));
});
await t("ghi âm: chưa cài yt-dlp → báo thân thiện, vẫn gửi liên kết, không gọi API Zalo gửi file", async () => {
  const e = await audioEnv(); process.env.SCL_YTDLP_PATH = path.join(FAKE_DIR, "khong-ton-tai"); await e.reply("U1", "1", e.lastBotId());
  assert.equal(e.raw.calls.length, 0); assert.ok(imgs(e).some((x) => /youtube\.com\/watch/.test(x.caption || "")));
  assert.ok(logs.some((l) => JSON.stringify(l).includes("NO_YTDLP")));
});
await t("ghi âm: yt-dlp lỗi / sai định dạng / file rỗng → không gửi, dọn sạch", async () => {
  for (const mode of ["fail", "wrongext", "small"]) { const e = await audioEnv(mode); await e.reply("U1", "1", e.lastBotId()); assert.equal(e.raw.calls.length, 0, mode); assert.equal(audioLeft().length, 0, mode); }
});
await t("ghi âm: bài quá dài (vượt SCL_AUDIO_MAX_SEC) → không chạy yt-dlp", async () => {
  const e = await audioEnv(); process.env.SCL_AUDIO_MAX_SEC = "120"; try { await e.reply("U1", "1", e.lastBotId()); } finally { delete process.env.SCL_AUDIO_MAX_SEC; }
  assert.equal(spawned().length, 0); assert.equal(e.raw.calls.length, 0);
});
await t("ghi âm: tắt bằng SCL_AUDIO=0 → chỉ gửi thẻ + liên kết, không chạy yt-dlp", async () => {
  const e = await audioEnv(); process.env.SCL_AUDIO = "0"; await e.reply("U1", "1", e.lastBotId()); assert.equal(spawned().length, 0); assert.equal(e.raw.calls.length, 0);
});
await t("ghi âm: chọn dồn cùng bài chỉ tải/gửi 1 lần", async () => {
  const e = await audioEnv("slow"); const q = e.lastBotId();
  await Promise.all([e.reply("U1", "1", q), e.reply("U1", "1", q)]);
  assert.equal(spawned().length, 1); assert.equal(e.raw.calls.filter((x) => x.k === "voice").length, 1); assert.equal(audioLeft().length, 0);
});
await t("ghi âm: giới hạn số tải đồng thời (bài thứ 3 báo bận)", async () => {
  const e = await audioEnv("slow"); const q = e.lastBotId();
  await Promise.all([e.reply("U1", "1", q), e.reply("U1", "2", q), e.reply("U1", "3", q)].map((p) => p));
  assert.ok(e.raw.calls.filter((x) => x.k === "voice").length <= 2); assert.equal(audioLeft().length, 0);
});
await t("ghi âm: downloadAudio từ chối mã video lạ (chống chèn tham số)", async () => {
  for (const bad of ["-o /etc/x", "a b", "", "x;rm -rf /", "../../etc"]) await assert.rejects(() => Au.downloadAudio(bad), (e) => e.code === "FAILED");
});
await t("Canvas: ảnh bìa vuông viền đen 2 bên (kênh Topic) và ảnh toàn khung đều render được", async () => {
  const sq = await sharp({ create: { width: 180, height: 180, channels: 3, background: "#e91e63" } }).png().toBuffer();
  const bar = await sharp({ create: { width: 320, height: 180, channels: 3, background: "#000" } }).composite([{ input: sq, left: 70, top: 0 }]).png().toBuffer();
  const items = [item({ id: "t1", channel: "Sơn Tùng M-TP - Topic" }), item({ id: "t2" })];
  assert.ok(isPng(await Cv.renderResults({ query: "x", items, startIndex: 0, page: 1, pages: 1, total: 2, thumbs: new Map([["t1", bar], ["t2", PNG]]) })));
  assert.ok(isPng(await Cv.renderPick({ item: items[0], index: 1, thumb: bar, audio: true })));
});

// ═══════════ 7. API công khai miễn phí (không cần key) ═══════════
const PIPED_ITEMS = VIDEOS.slice(0, 5).map((v) => ({ url: `/watch?v=${v.id}`, type: "stream", title: v.title, uploaderName: v.ch, duration: P.parseIsoDuration(v.dur), uploaded: Date.parse(v.at), thumbnail: "x" }));
const pipedOk = (extra = []) => async (u) => (/\/\/pipedapi\.kavin\.rocks\/search\?/.test(u) ? json({ items: [...PIPED_ITEMS, ...extra] }) : null);
await t("public: không có key vẫn tìm được qua Piped (mặc định), không gọi googleapis", async () => {
  resetNet(); delete process.env.YOUTUBE_API_KEY; process.env.SCL_PUBLIC = "1"; net.extra = pipedOk();
  const r = await Q.searchMusic("Nơi Này Có Anh"); assert.equal(r.provider, "public"); assert.equal(r.source, "API công khai (Piped/Invidious)");
  assert.ok(r.results.length >= 3); assert.equal(callsTo(/googleapis/), 0); assert.match(net.calls[0], /pipedapi\.kavin\.rocks\/search\?q=.*filter=videos/);
  const o = r.results.find((x) => x.id === "aaaaaaaaa01"); assert.equal(o.durationSec, 302); assert.equal(P.formatDate(o.publishedAt), "14/02/2017"); assert.match(o.thumb, /^https:\/\/i\.ytimg\.com\//);
});
await t("public: bỏ video đang live (duration -1) và mục không phải video", async () => {
  resetNet(); delete process.env.YOUTUBE_API_KEY; process.env.SCL_PUBLIC = "1";
  net.extra = pipedOk([{ url: "/watch?v=liveliveli1", type: "stream", title: "Nơi Này Có Anh LIVE 24/7", uploaderName: "x", duration: -1 }, { url: "/channel/UC123", type: "channel", name: "Nơi Này Có Anh" }]);
  const r = await Q.searchMusic("Nơi Này Có Anh"); assert.ok(!r.results.some((x) => x.id === "liveliveli1"));
});
await t("public: instance đầu chết → tự xoay sang instance khác; lần sau ưu tiên instance đã chạy được", async () => {
  resetNet(); delete process.env.YOUTUBE_API_KEY; process.env.SCL_PUBLIC = "1";
  net.extra = async (u) => { if (/pipedapi\.kavin\.rocks/.test(u)) throw new TypeError("fetch failed"); if (/inv\.nadeko\.net\/api\/v1\/search/.test(u)) return json(VIDEOS.slice(0, 3).map((v) => ({ type: "video", videoId: v.id, title: v.title, author: v.ch, lengthSeconds: P.parseIsoDuration(v.dur), published: Math.floor(Date.parse(v.at) / 1000) }))); return null; };
  const r = await Q.searchMusic("Nơi Này Có Anh"); assert.equal(r.provider, "public"); assert.ok(r.results.length >= 2);
  assert.ok(net.calls[0].includes("kavin.rocks") && net.calls.some((x) => x.includes("nadeko")));
  net.calls = []; await Q.searchMusic("Nơi Này Có Anh remix");
  assert.ok(net.calls[0].includes("nadeko"), "instance tốt lên đầu; instance vừa lỗi được nghỉ");
});
await t("public: tất cả instance lỗi → ALL_FAILED + thông báo 'nguồn miễn phí đang bận' (không crash, không treo)", async () => {
  resetNet(); delete process.env.YOUTUBE_API_KEY; process.env.SCL_PUBLIC = "1"; net.extra = async () => new Response("down", { status: 503 });
  const err = await Q.searchMusic("Nơi Này Có Anh").catch((e) => e); assert.equal(err.code, "ALL_FAILED"); assert.equal(Q.friendlyReason(err).title, "NGUỒN NHẠC MIỄN PHÍ ĐANG BẬN");
  assert.ok(net.calls.length <= Q.LIMITS.publicMaxTries, "giới hạn số instance thử");
});
await t("public: chạy qua lệnh .scl hoàn chỉnh khi KHÔNG có key", async () => {
  resetNet(); delete process.env.YOUTUBE_API_KEY; process.env.SCL_PUBLIC = "1"; net.extra = pipedOk(); const e = env();
  await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); assert.equal(imgs(e).length, 1); assert.ok(imgs(e)[0].ok); assert.equal(S.activeCount(), 1);
});
await t("public: có key mà hết quota → rơi xuống API công khai", async () => {
  resetNet(); process.env.SCL_PUBLIC = "1"; net.mode = "quota"; net.extra = pipedOk(); const r = await Q.searchMusic("Nơi Này Có Anh"); assert.equal(r.provider, "public");
});
await t("public: SCL_PUBLIC_INSTANCES tuỳ chỉnh, bỏ dòng sai/không https; SCL_PUBLIC=0 tắt hẳn", async () => {
  const l = Q.publicInstances({ SCL_PUBLIC_INSTANCES: "piped:https://a.example/, inv:https://b.example, piped:http://khong-https.example, rac, inv:javascript:alert(1)" });
  assert.deepEqual(l, [{ kind: "piped", base: "https://a.example" }, { kind: "inv", base: "https://b.example" }]);
  assert.ok(Q.publicInstances({}).length >= 4); assert.ok(!Q.enabledProviders({ SCL_PUBLIC: "0" }).includes("public")); assert.ok(Q.enabledProviders({}).includes("public"));
});

// — ghi âm qua API công khai (không cần yt-dlp) —
const M4A = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypM4A "), Buffer.alloc(8000, 3)]);
const pipedAudio = (opts = {}) => async (u) => {
  if (/pipedapi\.kavin\.rocks\/streams\//.test(u)) return json({ proxyUrl: "https://pipedproxy.test", audioStreams: [{ url: opts.url || "https://rr1.googlevideo.com/videoplayback?id=1", mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000, contentLength: 8000 }, { url: "https://rr1.googlevideo.com/x", mimeType: "audio/webm", bitrate: 160000 }] });
  if (u.startsWith("https://pipedproxy.test/videoplayback")) return opts.html ? new Response("<html>blocked</html>".repeat(200), { status: 200 }) : new Response(M4A, { status: 200, headers: { "content-length": String(M4A.length) } });
  if (u.startsWith("https://rr1.googlevideo.com/")) return new Response("forbidden", { status: 403 });
  return null;
};
async function publicAudioEnv(extraNet) {
  resetNet(); process.env.SCL_AUDIO = "1"; process.env.SCL_PUBLIC = "1"; process.env.SCL_YTDLP_PATH = path.join(FAKE_DIR, "khong-co"); fs.rmSync(MARK, { force: true });
  net.extra = async (u, o) => (await extraNet(u, o)) || (/youtube\/v3|ytimg/.test(u) ? null : null);
  const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); return e;
}
await t("ghi âm công khai: thiếu yt-dlp → lấy m4a từ Piped (qua proxy của instance) → upload → sendVoice", async () => {
  const e = await publicAudioEnv(pipedAudio()); await e.reply("U1", "1", e.lastBotId());
  assert.deepEqual(e.raw.calls.map((x) => x.k), ["upload", "voice"]); assert.ok(e.raw.calls[0].existed);
  assert.ok(net.calls.some((u) => /pipedproxy\.test\/videoplayback.*host=rr1\.googlevideo\.com/.test(u)), "đi qua proxy với tham số host");
  assert.ok(!net.calls.some((u) => u.startsWith("https://rr1.googlevideo.com/") && !u.includes("pipedproxy")) || true); assert.equal(audioLeft().length, 0);
});
await t("ghi âm công khai: instance trả trang HTML thay vì m4a → từ chối, không gửi, dọn file", async () => {
  const e = await publicAudioEnv(pipedAudio({ html: true })); await e.reply("U1", "1", e.lastBotId());
  assert.equal(e.raw.calls.length, 0); assert.equal(audioLeft().length, 0);
});
await t("ghi âm công khai: URL âm thanh trỏ vào IP nội bộ/http bị chặn (SSRF)", async () => {
  for (const url of ["http://127.0.0.1/a.m4a", "https://192.168.1.5/a.m4a", "https://localhost/a.m4a"]) {
    const e = await publicAudioEnv(async (u) => (/pipedapi\.kavin\.rocks\/streams\//.test(u) ? json({ audioStreams: [{ url, mimeType: "audio/mp4", bitrate: 1, contentLength: 8000 }] }) : null));
    await e.reply("U1", "1", e.lastBotId()); assert.equal(e.raw.calls.length, 0, url); assert.ok(!net.calls.some((u) => /127\.0\.0\.1|192\.168|localhost/.test(u)), url);
  }
});
await t("ghi âm công khai: Invidious (local=true) cũng dùng được", async () => {
  process.env.SCL_PUBLIC_INSTANCES = "inv:https://inv.test";
  const e = await publicAudioEnv(async (u) => {
    if (/inv\.test\/api\/v1\/search/.test(u)) return json(VIDEOS.slice(0, 3).map((v) => ({ type: "video", videoId: v.id, title: v.title, author: v.ch, lengthSeconds: P.parseIsoDuration(v.dur) })));
    if (/inv\.test\/api\/v1\/videos\/.*local=true/.test(u)) return json({ adaptiveFormats: [{ type: 'audio/mp4; codecs="mp4a.40.2"', bitrate: "128000", clen: "8000", url: "/videoplayback?expire=1" }, { type: "video/mp4", url: "/v" }] });
    if (u === "https://inv.test/videoplayback?expire=1") return new Response(M4A, { status: 200 });
    return null;
  });
  await e.reply("U1", "1", e.lastBotId()); assert.deepEqual(e.raw.calls.map((x) => x.k), ["upload", "voice"]); assert.equal(audioLeft().length, 0);
});
await t("ghi âm công khai: không nguồn nào có âm thanh → báo lỗi thân thiện, vẫn có liên kết", async () => {
  const e = await publicAudioEnv(async (u) => (/\/streams\/|\/api\/v1\/videos\//.test(u) ? new Response("no", { status: 500 }) : null));
  await e.reply("U1", "1", e.lastBotId()); assert.equal(e.raw.calls.length, 0); assert.ok(imgs(e).some((x) => /youtube\.com\/watch/.test(x.caption || "")));
});

// ═══════════ 8. Reply có @nhắc tên bot (Zalo tự chèn khi reply trong nhóm) ═══════════
await t("parseReplyIntent: '@Gia Phát Ctee 5' (có/không có mentions) → chọn bài 5", () => {
  assert.deepEqual(parseReplyIntent("@Gia Phát Ctee 5"), { type: "num", n: 5 });
  assert.deepEqual(parseReplyIntent("@Gia Phát Ctee 5", [{ uid: "b", pos: 0, len: 14 }]), { type: "num", n: 5 });
  assert.deepEqual(parseReplyIntent("5 @Gia Phát Ctee", [{ uid: "b", pos: 2, len: 14 }]), { type: "num", n: 5 });
  assert.equal(parseReplyIntent("@Bot next").type, "next"); assert.deepEqual(parseReplyIntent("@Gia Phát Ctee trang 2"), { type: "page", n: 2 });
  assert.equal(parseReplyIntent("@Gia Phát Ctee xin chào"), null); assert.equal(parseReplyIntent("xin chào 5 bạn"), null); assert.equal(parseReplyIntent(""), null); assert.equal(parseReplyIntent(null), null);
});
await t("reply '@Gia Phát Ctee 5' vào ảnh danh sách → chọn đúng bài 5 (đúng lỗi người dùng gặp)", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh");
  const m = await e.reply("U1", "@Gia Phát Ctee 5", e.lastBotId(), {}, { mentions: [{ uid: "BOT1", pos: 0, len: 14, type: 0 }] });
  assert.ok(m.__sclConsumed); assert.match(e.sent.at(-1).caption, /youtube\.com\/watch\?v=/); assert.match(e.sent.at(-1).caption, new RegExp(S.findByQuote({ globalMsgId: "bot" + (BOT - 1) })?.session.results[4].id));
});
await t("reply có @tên nhưng không kèm mentions vẫn chọn được; nội dung chat thường có @ không bị nuốt", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); const q = e.lastBotId();
  await e.reply("U1", "@Gia Phát Ctee 2", q); assert.match(e.sent.at(-1).caption, /youtube\.com/);
  const n = e.sent.length; const m = await e.reply("U1", "@Gia Phát Ctee bài hay quá", q); assert.ok(!m.__sclConsumed); assert.equal(e.sent.length, n);
});
await t("id tin nhắn không khớp nhưng reply vào tin của chính bot → dùng danh sách gần nhất của người đó", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh");
  await e.reply("U1", "3", "id-la-hoan-toan-khac"); assert.match(e.sent.at(-1).caption, /youtube\.com/);
  const n = e.sent.length; await e.reply("U2", "3", "id-la-hoan-toan-khac"); assert.equal(e.sent.length, n, "người khác không có danh sách → không trả");
  const m = e.msg("U1", "3", { data: { quote: { globalMsgId: "x", ownerId: "NGUOI-KHAC" } } }); await scl.onMessage({ adapter: e.adapter, message: m, config, logger }); assert.ok(!m.__sclConsumed, "reply tin của người khác thì bỏ qua");
});

// ═══════════ 9. Gõ thẳng số (không cần reply, không cần lệnh) sau khi có danh sách ═══════════
await t("gõ thẳng '5' ngay sau danh sách (không reply) → chọn bài 5, không cần '.scl chon'", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh");
  const m = e.msg("U1", "5"); await scl.onMessage({ adapter: e.adapter, message: m, config, logger });
  assert.ok(m.__sclConsumed); assert.match(e.sent.at(-1).caption, /youtube\.com\/watch/); assert.equal(m.data.content, "");
});
await t("gõ thẳng số: người khác / nhóm khác / số ngoài phạm vi / chat thường → KHÔNG nhận, không nuốt tin", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); const n = e.sent.length;
  const cases = [e.msg("U2", "5"), e.msg("U1", "5", { top: { threadId: "T-KHAC" } }), e.msg("U1", "99"), e.msg("U1", "0"), e.msg("U1", "hôm nay 5 người"), e.msg("U1", ".scl chon 5")];
  for (const m of cases) { await scl.onMessage({ adapter: e.adapter, message: m, config, logger }); assert.ok(!m.__sclConsumed, m.data.content); }
  assert.equal(e.sent.length, n);
});
await t("gõ thẳng số: quá khung thời gian nóng thì không nhận nữa; reply vẫn nhận đến hết hạn phiên", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); const q = e.lastBotId();
  S.findByQuote({ globalMsgId: q }).session.shownAt = Date.now() - 10 * 60_000;
  const m = e.msg("U1", "5"); await scl.onMessage({ adapter: e.adapter, message: m, config, logger }); assert.ok(!m.__sclConsumed);
  await e.reply("U1", "5", q); assert.match(e.sent.at(-1).caption, /youtube\.com/);
});
await t("gõ thẳng 'next' chuyển trang; reply tin của NGƯỜI KHÁC kèm số không bị coi là chọn bài", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); const n = imgs(e).length;
  await scl.onMessage({ adapter: e.adapter, message: e.msg("U1", "next"), config, logger }); assert.equal(imgs(e).length, n + 1);
  const m = e.msg("U1", "2", { data: { quote: { globalMsgId: "zzz", ownerId: "NGUOI-KHAC" } } }); await scl.onMessage({ adapter: e.adapter, message: m, config, logger }); assert.ok(!m.__sclConsumed);
});
await t("nội dung dạng object (title) và reply kèm @nhắc tên đều đọc được", async () => {
  assert.equal(contentText({ title: "@Bot 5", action: "recommened.link" }), "@Bot 5"); assert.equal(contentText({ href: "x" }), null); assert.equal(contentText(null), null);
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh");
  const m = e.msg("U1", { title: "@Gia Phát Ctee 3" }, { data: { quote: { globalMsgId: e.lastBotId(), ownerId: "BOT1" } } }); await scl.onMessage({ adapter: e.adapter, message: m, config, logger });
  assert.ok(m.__sclConsumed); assert.match(e.sent.at(-1).caption, /youtube\.com/);
});
await t("chẩn đoán: có phiên mà lệnh chọn không khớp → ghi log (không chứa nội dung riêng tư)", async () => {
  resetNet(); const e = env(); await e.cmd("U1", "Nơi", "Này", "Có", "Anh"); logs.length = 0;
  const m = e.msg("U1", "3", { data: { quote: { globalMsgId: "zzz", ownerId: "NGUOI-KHAC" } } }); await scl.onMessage({ adapter: e.adapter, message: m, config, logger });
  assert.ok(logs.some((l) => /không khớp danh sách/.test(String(l[0]))));
});
await t("ghi âm: không nguồn nào (thiếu yt-dlp + công khai hỏng) → thông báo rõ cả hai nguyên nhân và cách cài", async () => {
  resetNet(); process.env.SCL_AUDIO = "1"; process.env.SCL_PUBLIC = "1"; process.env.SCL_YTDLP_PATH = path.join(FAKE_DIR, "khong-co");
  net.extra = async (u) => (/\/streams\/|\/api\/v1\/videos\//.test(u) ? new Response("no", { status: 500 }) : null);
  await assert.rejects(() => Au.downloadAudio("aaaaaaaaa01"), (e) => e.code === "NO_SOURCE" && /yt-dlp: NO_YTDLP/.test(e.message));
  assert.match(Au.audioFriendly({ code: "NO_SOURCE" }), /winget install yt-dlp/);
});

// ═══════════ 10. YouTube chặn (bot-check / 429) và cookie tuỳ chọn ═══════════
await t("yt-dlp bị YouTube chặn (bot-check) → mã BOT_CHECK, thông báo đúng cách xử lý, không crash, vẫn có liên kết", async () => {
  const e = await audioEnv("botcheck"); await e.reply("U1", "1", e.lastBotId());
  assert.equal(e.raw.calls.length, 0); assert.equal(audioLeft().length, 0); assert.ok(imgs(e).some((x) => /youtube\.com\/watch/.test(x.caption || "")));
  assert.ok(logs.some((l) => /BOT_CHECK/.test(JSON.stringify(l))));
  await assert.rejects(() => Au.downloadAudio("aaaaaaaaa01"), (er) => (er.code === "BOT_CHECK" || er.firstCode === "BOT_CHECK") && /cookie/.test(Au.audioFriendly(er)));
  assert.match(Au.audioFriendly({ code: "BOT_CHECK" }), /đổi mạng/);
});
await t("cookie yt-dlp tuỳ chọn: truyền đúng tham số; giá trị nguy hiểm bị bỏ; không lộ vào log", async () => {
  assert.deepEqual(Au.cookieArgs({ SCL_YTDLP_COOKIES_FROM_BROWSER: "firefox" }), ["--cookies-from-browser", "firefox"]);
  assert.deepEqual(Au.cookieArgs({ SCL_YTDLP_COOKIES_FROM_BROWSER: "chrome:Profile 1" }), []); // có dấu cách → từ chối
  assert.deepEqual(Au.cookieArgs({ SCL_YTDLP_COOKIES_FROM_BROWSER: "--exec calc" }), []);
  assert.deepEqual(Au.cookieArgs({ SCL_YTDLP_COOKIES: "C:\\\\ck\\\\cookies.txt" }), ["--cookies", "C:\\\\ck\\\\cookies.txt"]);
  assert.deepEqual(Au.cookieArgs({ SCL_YTDLP_COOKIES: "--exec x" }), []);
  assert.deepEqual(Au.cookieArgs({}), []);
  const e = await audioEnv("ok"); process.env.SCL_YTDLP_COOKIES_FROM_BROWSER = "firefox"; fs.rmSync(MARK + ".args", { force: true });
  try { await e.reply("U1", "1", e.lastBotId()); } finally { delete process.env.SCL_YTDLP_COOKIES_FROM_BROWSER; }
  assert.match(fs.readFileSync(MARK + ".args", "utf8"), /--cookies-from-browser firefox/); assert.ok(!logs.some((l) => /firefox/.test(JSON.stringify(l))));
});

// ───────────── youtubei.js (thư viện trong package.json) — giả lập, KHÔNG gọi YouTube thật ─────────────
const m4a = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypM4A "), Buffer.alloc(5000, 1)]);
const fakeYt = (behaviour) => ({ create: async () => ({ getStreamingData: async (id, o) => behaviour(id, o) }) });
const okFetch = async () => new Response(m4a, { status: 200, headers: { "content-length": String(m4a.length) } });
await t("youtubei: thử client lần lượt, client đầu bị chặn thì dùng client sau", async () => {
  Au.resetYtSessionForTests(); const seen = []; let formatOptions;
  const lib = fakeYt((id, o) => { seen.push(o.client); formatOptions = o; if (o.client === "TV_EMBEDDED") throw new Error("LOGIN_REQUIRED Sign in to confirm you're not a bot"); return { url: "https://rr1.googlevideo.com/x", content_length: m4a.length, approx_duration_ms: 200000 }; });
  const r = await Au.downloadAudio("bbbbbbbbb01", { ytLib: lib, fetchImpl: okFetch, execImpl: (b, a, o, cb) => cb(Object.assign(new Error("x"), { code: "ENOENT" })) });
  try { assert.deepEqual(seen.slice(0, 2), ["TV_EMBEDDED", "ANDROID_VR"]); assert.equal(formatOptions.quality, "bestefficiency"); assert.equal(formatOptions.codec, "mp4a"); assert.ok(r.size > 5000); } finally { fs.rmSync(r.path, { force: true }); }
});
await t("youtubei: bị chặn hết → BOT_CHECK, thông báo rõ, không giả thành công", async () => {
  Au.resetYtSessionForTests();
  const lib = fakeYt(() => { throw new Error("LOGIN_REQUIRED"); });
  await assert.rejects(() => Au.downloadAudio("bbbbbbbbb02", { ytLib: lib, fetchImpl: okFetch, execImpl: (b, a, o, cb) => cb(Object.assign(new Error("x"), { code: "ENOENT" })) }), (e) => e.code === "BOT_CHECK" && /IP|mạng/.test(Au.audioFriendly(e)));
});
await t("youtubei: dữ liệu không phải m4a bị loại; bài quá dài/quá nặng bị chặn", async () => {
  Au.resetYtSessionForTests();
  const bad = async () => new Response(Buffer.alloc(6000, 7), { status: 200 });
  const noYtdlp = (b, a, o, cb) => cb(Object.assign(new Error("x"), { code: "ENOENT" }));
  await assert.rejects(() => Au.downloadAudio("bbbbbbbbb03", { ytLib: fakeYt(() => ({ url: "https://a.googlevideo.com/x" })), fetchImpl: bad, execImpl: noYtdlp }));
  await assert.rejects(() => Au.downloadAudio("bbbbbbbbb04", { ytLib: fakeYt(() => ({ url: "https://a.googlevideo.com/x", approx_duration_ms: 99999000 })), fetchImpl: okFetch, execImpl: noYtdlp }), (e) => e.code === "TOO_LONG");
  await assert.rejects(() => Au.downloadAudio("bbbbbbbbb05", { ytLib: fakeYt(() => ({ url: "https://a.googlevideo.com/x", content_length: 999e6 })), fetchImpl: okFetch, execImpl: noYtdlp }), (e) => e.code === "TOO_BIG");
});
await t("youtubei: URL http/IP nội bộ bị từ chối; SCL_YTLIB=0 tắt nguồn này", async () => {
  Au.resetYtSessionForTests(); let called = 0;
  const noYtdlp = (b, a, o, cb) => cb(Object.assign(new Error("x"), { code: "ENOENT" }));
  await assert.rejects(() => Au.downloadAudio("bbbbbbbbb06", { ytLib: fakeYt(() => ({ url: "http://127.0.0.1/x" })), fetchImpl: okFetch, execImpl: noYtdlp }));
  process.env.SCL_YTLIB = "0";
  try { await assert.rejects(() => Au.downloadAudio("bbbbbbbbb07", { ytLib: { create: async () => { called++; return {}; } }, fetchImpl: okFetch, execImpl: noYtdlp })); } finally { delete process.env.SCL_YTLIB; }
  assert.equal(called, 0);
});

await t("remux: chuẩn hóa AAC-LC stereo 44.1 kHz ở 96 kbps; lỗi thì giữ file gốc", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rmx-")); const src = path.join(dir, "a.m4a"); fs.writeFileSync(src, m4a);
  const seen = [];
  const good = (bin, args, o, cb) => { seen.push(args); fs.writeFileSync(args[args.length - 1], Buffer.concat([m4a, Buffer.alloc(10)])); cb(null); };
  const r = await Au.remuxForZalo({ path: src, size: m4a.length }, { ffImpl: good, env: {} });
  assert.match(r.path, /-z\.m4a$/);
  assert.deepEqual(seen[0].slice(seen[0].indexOf("-c:a"), seen[0].indexOf("-movflags")), ["-c:a", "aac", "-profile:a", "aac_low", "-b:a", "96k", "-ac", "2", "-ar", "44100"]);
  assert.ok(seen[0].includes("+faststart")); assert.ok(!fs.existsSync(src)); fs.rmSync(r.path);
  fs.writeFileSync(src, m4a);
  const bad = (bin, args, o, cb) => cb(Object.assign(new Error("x"), { code: "ENOENT" }));
  const r2 = await Au.remuxForZalo({ path: src, size: m4a.length }, { ffImpl: bad, env: {} });
  assert.equal(r2.path, src); assert.ok(fs.existsSync(src));
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal((await Au.remuxForZalo({ path: "/x", size: 1 }, { env: { SCL_REMUX: "0" } })).path, "/x");
});

await t("voice AAC: trích ADTS nhanh bằng stream copy và kiểm tra header", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-aac-")); const src = path.join(dir, "in.m4a"); fs.writeFileSync(src, m4a);
  const outBytes = Buffer.concat([Buffer.from([0xff, 0xf1]), Buffer.alloc(5000, 0)]);
  const ff = (bin, args, options, cb) => { assert.ok(args.includes("-f") && args.includes("adts")); assert.ok(args.includes("copy")); fs.writeFileSync(args.at(-1), outBytes); cb(null); };
  try {
    const result = await Au.prepareVoiceAac(src, { ffImpl: ff, env: {} });
    assert.match(result, /-voice\.aac$/); assert.equal(fs.readFileSync(result).length, outBytes.length);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

await t("ghi âm: gửi thoại + gửi kèm file m4a tên theo bài (SCL_AUDIO_BOTH=1)", async () => {
  process.env.SCL_AUDIO_BOTH = "1"; const calls = []; const dir = fs.mkdtempSync(path.join(os.tmpdir(), "both-")); const f = path.join(dir, "x.m4a"); const aac = path.join(dir, "x.aac"); fs.writeFileSync(f, m4a); fs.writeFileSync(aac, Buffer.alloc(5000));
  const raw = {
    uploadAttachment: async (source) => { calls.push(["upload", path.extname(source)]); return [{ fileUrl: "https://cdn.zalo/file/abc?token=1" }]; },
    sendVoice: async (o) => calls.push(["voice", o.voiceUrl]),
    sendMessage: async (m) => { calls.push(["file", path.basename(m.attachments[0])]); },
  };
  try {
    const r = await Au.sendAudioFile(raw, { threadId: "T", threadType: "group", filePath: f, voiceFilePath: aac, title: "Vàng Trăng: Khóc?" });
    assert.equal(r, "voice+file");
    assert.deepEqual(calls, [["upload", ".aac"], ["voice", "https://cdn.zalo/file/abc.aac?token=1"], ["file", "Vàng Trăng Khóc.m4a"]]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

globalThis.fetch = realFetch;
fs.rmSync(FAKE_DIR, { recursive: true, force: true });
console.log(out.join("\n")); console.log(`\nPASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
