/**
 * sclAudio.js — tải âm thanh bài hát đã chọn (yt-dlp, định dạng m4a) và gửi thành tin nhắn ghi âm Zalo.
 *
 * LƯU Ý PHÁP LÝ: tải âm thanh từ YouTube có thể vi phạm Điều khoản dịch vụ YouTube và bản quyền tác giả.
 * Tính năng này do QUẢN TRỊ VIÊN chủ động bật/chịu trách nhiệm: cần cài yt-dlp trên máy chạy bot,
 * tắt hoàn toàn bằng SCL_AUDIO=0. Không có yt-dlp thì bot tự quay về chỉ gửi liên kết.
 *
 * Nguồn âm thanh (thử lần lượt): 1) yt-dlp nếu máy có  2) API công khai Piped/Invidious (không cần cài gì, độ ổn định thấp:
 * instance hay chết/bị chặn). Cả hai đều có thể bị YouTube chặn bất cứ lúc nào → luôn có đường lui là gửi liên kết.
 *
 * Gửi ghi âm (theo API thật của zca-mt 1.2.2):
 *   1) uploadAttachment(file) → lấy fileUrl do Zalo lưu  →  sendVoice({ voiceUrl: fileUrl })   (tin nhắn thoại)
 *   2) nếu (1) lỗi: sendMessage({ attachments:[file] })                                         (gửi file m4a)
 *   3) nếu (2) lỗi: báo lỗi, người dùng vẫn có liên kết YouTube. Không bao giờ báo "đã gửi" khi chưa gửi được.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { watchUrl, fetchJson, orderedInstances, publicInstances } from "./sclSearch.js";

export const AUDIO = { maxSec: 1200, maxBytes: 25 * 1024 * 1024, minBytes: 2000, timeoutMs: 120_000, concurrency: 2 };
export const AUDIO_DIR = path.join(os.tmpdir(), "hnnp-scl-audio");
const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;
const OK_EXT = new Set([".m4a", ".mp4", ".aac"]);

export class AudioError extends Error { constructor(code, message) { super(message); this.name = "AudioError"; this.code = code; } }

export function audioEnabled(env = process.env) { return String(env.SCL_AUDIO ?? "1").trim() !== "0"; }
export function maxAudioSec(env = process.env) { const n = Number(env.SCL_AUDIO_MAX_SEC); return Number.isFinite(n) && n >= 30 ? n : AUDIO.maxSec; }

let running = 0;
const perVideo = new Map(); // videoId → Promise (cùng bài chọn đồng thời chỉ tải 1 lần)

/** Dọn file âm thanh tạm cũ (gọi khi nạp module). */
export function cleanAudioDir(maxAgeMs = 30 * 60_000) {
  try {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    for (const f of fs.readdirSync(AUDIO_DIR)) { const p = path.join(AUDIO_DIR, f); try { if (Date.now() - fs.statSync(p).mtimeMs > maxAgeMs) fs.unlinkSync(p); } catch { /* bỏ qua */ } }
  } catch { /* không dọn được thì thôi */ }
}
cleanAudioDir(0);

/**
 * Tải âm thanh m4a. Trả { path, size }; người gọi PHẢI xoá file sau khi dùng.
 * Lỗi: NO_YTDLP | TOO_LONG | TOO_BIG | BAD_FORMAT | TIMEOUT | BUSY | FAILED
 */
export async function downloadAudio(videoId, { env = process.env, execImpl = execFile, fetchImpl = fetch, durationSec = 0, ytLib, ffImpl = execFile } = {}) {
  if (!VIDEO_ID.test(String(videoId || ""))) throw new AudioError("FAILED", "Mã video không hợp lệ.");
  if (durationSec > maxAudioSec(env)) throw new AudioError("TOO_LONG", `Bài dài hơn ${Math.round(maxAudioSec(env) / 60)} phút.`);
  if (perVideo.has(videoId)) throw new AudioError("BUSY", "Bài này đang được tải.");
  if (running >= AUDIO.concurrency) throw new AudioError("BUSY", "Bot đang tải nhiều bài, hãy thử lại sau ít giây.");
  running++;
  const task = (async () => {
    const got = await (async () => {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    // 1) thư viện youtubei.js trong package.json  2) yt-dlp ngoài (nếu có)  3) API công khai
    const errs = [];
    if (String(env.SCL_YTLIB ?? "1").trim() !== "0") {
      try { return await viaYoutubei(videoId, { env, fetchImpl, ytLib }); }
      catch (e) { if (["TOO_BIG", "TOO_LONG"].includes(e.code)) throw e; errs.push(e); }
    }
    try { return await viaYtdlp(videoId, { env, execImpl }); }
    catch (first) {
      if (["TOO_BIG", "TOO_LONG", "BAD_FORMAT"].includes(first.code)) throw first;
      errs.push(first);
    }
    const codes = errs.map((e) => e.code);
    const botBlocked = codes.includes("BOT_CHECK");
    const first = { code: botBlocked ? "BOT_CHECK" : (errs.find((e) => e.code !== "NO_LIB" && e.code !== "NO_YTDLP") || errs[errs.length - 1]).code };
    if (String(env.SCL_PUBLIC ?? "1").trim() === "0" || !publicInstances(env).length) {
      if (codes.every((c) => c === "NO_YTDLP" || c === "NO_LIB")) throw new AudioError("NO_YTDLP", "Không có nguồn âm thanh nào.");
      throw Object.assign(new AudioError(first.code, "Không tải được âm thanh."), {});
    }
    try { return await viaPublic(videoId, { env, fetchImpl }); }
    catch (second) {
      if (["TOO_BIG", "TOO_LONG", "BUSY"].includes(second.code)) throw second;
      throw Object.assign(new AudioError("NO_SOURCE", `Không lấy được âm thanh (thư viện: ${codes[0] || "-"}; yt-dlp: ${codes[codes.length - 1] || "-"}; công khai: ${second.code}).`), { firstCode: first.code });
    }
    })();
    return remuxForZalo(got, { env, ffImpl });
  })().finally(() => { running--; perVideo.delete(videoId); });
  perVideo.set(videoId, task);
  return task;
}

async function viaYtdlp(videoId, { env, execImpl }) {
  const tag = `scl-${videoId}-${Date.now().toString(36)}`;
  const bin = String(env.SCL_YTDLP_PATH || "yt-dlp").trim();
  const args = ["--no-playlist", "--no-warnings", "--no-progress", "--no-simulate", "--max-filesize", String(AUDIO.maxBytes),
    ...cookieArgs(env),
    "-f", "bestaudio[ext=m4a][abr<=96]/bestaudio[ext=m4a]", "--print", "after_move:filepath", "-o", path.join(AUDIO_DIR, `${tag}.%(ext)s`), watchUrl(videoId)];
  let stdout = "";
  try {
    stdout = await new Promise((resolve, reject) => {
      execImpl(bin, args, { timeout: AUDIO.timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true }, (err, out, errOut) => {
        if (err) {
          const code = err.code === "ENOENT" ? "NO_YTDLP" : err.killed ? "TIMEOUT" : BOT_CHECK.test(`${errOut || ""} ${err.message || ""}`) ? "BOT_CHECK" : "FAILED";
          return reject(new AudioError(code, "Không tải được âm thanh."));
        }
        resolve(String(out || ""));
      });
    });
  } catch (e) { cleanTag(tag); throw e; }
  // đường dẫn do yt-dlp in ra (dòng cuối); nếu không có thì quét theo tag
  let file = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop() || "";
  if (!file || !fs.existsSync(file) || path.dirname(path.resolve(file)) !== path.resolve(AUDIO_DIR)) {
    file = fs.readdirSync(AUDIO_DIR).filter((f) => f.startsWith(tag)).map((f) => path.join(AUDIO_DIR, f))[0] || "";
  }
  if (!file || !fs.existsSync(file)) { cleanTag(tag); throw new AudioError("FAILED", "Không có file âm thanh sau khi tải."); }
  const size = fs.statSync(file).size;
  if (!OK_EXT.has(path.extname(file).toLowerCase())) { cleanTag(tag); throw new AudioError("BAD_FORMAT", "Định dạng âm thanh không được hỗ trợ."); }
  if (size > AUDIO.maxBytes) { cleanTag(tag); throw new AudioError("TOO_BIG", "File âm thanh quá nặng."); }
  if (size < AUDIO.minBytes) { cleanTag(tag); throw new AudioError("FAILED", "File âm thanh rỗng hoặc hỏng."); }
  return { path: file, size };
}

// ───────────── thư viện youtubei.js (cài bằng npm install) ─────────────
const YT_CLIENTS_DEFAULT = ["TV_EMBEDDED", "ANDROID_VR", "TV", "IOS"];
let ytSession = null;
export function resetYtSessionForTests() { ytSession = null; }
async function loadYtLib() {
  try {
    const m = await import("youtubei.js");
    try { m.Log?.setLevel?.(m.Log.Level.NONE); } catch { /* bản cũ không có Log */ }   // tắt log parser dài dòng của thư viện
    return m.Innertube || m.default?.Innertube || m.default;
  }
  catch { throw new AudioError("NO_LIB", "Chưa cài thư viện youtubei.js (chạy npm install)."); }
}
function validateM4a(dest, size) {
  const fd = fs.openSync(dest, "r"); const head = Buffer.alloc(12); fs.readSync(fd, head, 0, 12, 0); fs.closeSync(fd);
  return size >= AUDIO.minBytes && head.subarray(4, 8).toString("latin1") === "ftyp";
}
async function viaYoutubei(videoId, { env, fetchImpl, ytLib }) {
  const Innertube = ytLib || await loadYtLib();
  if (!Innertube?.create) throw new AudioError("NO_LIB", "youtubei.js không hợp lệ.");
  const clients = String(env.SCL_YT_CLIENTS || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z_]+$/.test(x));
  let lastErr = new AudioError("FAILED", "youtubei.js không lấy được âm thanh.");
  let yt;
  try { yt = ytLib ? await Innertube.create({ retrieve_player: true }) : (ytSession ||= await Innertube.create({ retrieve_player: true })); }
  catch (e) { ytSession = null; throw new AudioError(BOT_CHECK.test(String(e?.message)) ? "BOT_CHECK" : "FAILED", "youtubei.js không khởi tạo được."); }
  for (const client of (clients.length ? clients : YT_CLIENTS_DEFAULT)) {
    const dest = path.join(AUDIO_DIR, `scl-${videoId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.m4a`);
    try {
      const fmt = await yt.getStreamingData(videoId, { type: "audio", format: "mp4", codec: "mp4a", quality: "bestefficiency", client });
      if (!fmt?.url) throw new AudioError("FAILED", "Không có URL âm thanh.");
      if (Number(fmt.content_length) > AUDIO.maxBytes) throw new AudioError("TOO_BIG", "File âm thanh quá nặng.");
      if (Number(fmt.approx_duration_ms) / 1000 > maxAudioSec(env)) throw new AudioError("TOO_LONG", "Bài quá dài.");
      const size = await downloadCapped(fmt.url, dest, { fetchImpl });
      if (!validateM4a(dest, size)) { try { fs.unlinkSync(dest); } catch { /* đã xoá */ } lastErr = new AudioError("BAD_FORMAT", "Dữ liệu không phải m4a."); continue; }
      return { path: dest, size };
    } catch (e) {
      try { fs.unlinkSync(dest); } catch { /* chưa tạo */ }
      if (["TOO_BIG", "TOO_LONG"].includes(e.code)) throw e;
      const msg = `${e?.name || ""} ${e?.message || ""}`;
      lastErr = e instanceof AudioError ? e : new AudioError(BOT_CHECK.test(msg) || /LOGIN_REQUIRED|bot|sign in/i.test(msg) ? "BOT_CHECK" : "FAILED", "youtubei.js lỗi.");
    }
  }
  throw lastErr;
}

// ───────────── chuẩn hoá m4a cho Zalo và trình phát iOS ─────────────
// Chuẩn hoá AAC-LC stereo 44.1 kHz để tránh codec/layout lạ từ nguồn.
let ffPath;
async function ffmpegBin(env) {
  if (env.SCL_FFMPEG_PATH) return String(env.SCL_FFMPEG_PATH).trim();
  if (ffPath === undefined) { try { ffPath = (await import("ffmpeg-static")).default || null; } catch { ffPath = null; } }
  return ffPath || "ffmpeg";
}
function runFf(ffImpl, bin, args, timeout) {
  return new Promise((resolve, reject) => ffImpl(bin, args, { timeout, windowsHide: true, maxBuffer: 1024 * 1024 }, (err) => (err ? reject(err) : resolve())));
}
export async function remuxForZalo(got, { env = process.env, ffImpl = execFile } = {}) {
  if (String(env.SCL_REMUX ?? "1").trim() === "0") return got;
  const bin = await ffmpegBin(env);
  const out = got.path.replace(/\.[^.]+$/, "") + "-z.m4a";
  const attempts = [["-c:a", "aac", "-profile:a", "aac_low", "-b:a", "96k", "-ac", "2", "-ar", "44100"]];
  for (const codec of attempts) {
    try {
      await runFf(ffImpl, bin, ["-y", "-v", "error", "-i", got.path, "-vn", "-map_metadata", "-1", ...codec, "-movflags", "+faststart", out], 60_000);
      const size = fs.statSync(out).size;
      if (size >= AUDIO.minBytes && size <= AUDIO.maxBytes && validateM4a(out, size)) {
        try { fs.unlinkSync(got.path); } catch { /* đã xoá */ }
        return { path: out, size };
      }
    } catch { /* thử cách sau */ }
    try { fs.unlinkSync(out); } catch { /* chưa tạo */ }
  }
  return got; // không có ffmpeg / lỗi → dùng file gốc (vẫn gửi được, có thể không hiện thời lượng)
}

function isAdts(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const head = Buffer.alloc(2);
    return fs.readSync(fd, head, 0, 2, 0) === 2 && head[0] === 0xff && (head[1] & 0xf6) === 0xf0;
  } finally { fs.closeSync(fd); }
}

export async function prepareVoiceAac(filePath, { env = process.env, ffImpl = execFile } = {}) {
  const out = filePath.replace(/\.[^.]+$/, "") + "-voice.aac";
  const bin = await ffmpegBin(env);
  const attempts = [
    ["-c:a", "copy"],
    ["-c:a", "aac", "-profile:a", "aac_low", "-b:a", "96k", "-ac", "2", "-ar", "44100"],
  ];
  for (const codec of attempts) {
    try {
      await runFf(ffImpl, bin, ["-y", "-v", "error", "-i", filePath, "-vn", "-map", "0:a:0", ...codec, "-f", "adts", out], 60_000);
      const size = fs.statSync(out).size;
      if (size >= AUDIO.minBytes && size <= AUDIO.maxBytes && isAdts(out)) return out;
    } catch { /* try AAC-LC encode if stream copy is not valid */ }
    try { fs.unlinkSync(out); } catch { /* file may not exist */ }
  }
  throw new AudioError("VOICE_CONVERT", "Không chuyển được âm thanh sang AAC cho tin nhắn thoại.");
}

/** Khởi tạo sẵn phiên youtubei.js ở nền để lần chọn bài đầu tiên không phải chờ. */
export function prewarmAudio(env = process.env) {
  if (!audioEnabled(env) || String(env.SCL_YTLIB ?? "1").trim() === "0" || ytSession) return;
  loadYtLib().then((Innertube) => Innertube.create({ retrieve_player: true })).then((yt) => { ytSession ||= yt; }).catch(() => { /* bỏ qua: sẽ thử lại khi cần */ });
}

// ───────────── nguồn công khai (Piped / Invidious) ─────────────
/** Chỉ https, chặn localhost / IP nội bộ (URL do máy chủ bên thứ ba trả về → không tin tưởng). */
export function assertPublicHttps(u) {
  let url; try { url = new URL(String(u)); } catch { throw new AudioError("FAILED", "Đường dẫn âm thanh không hợp lệ."); }
  const h = url.hostname.toLowerCase();
  const bad = url.protocol !== "https:" || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") ||
    (net.isIP(h) && (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "::1" || /^(fc|fd|fe80)/.test(h)));
  if (bad) throw new AudioError("FAILED", "Địa chỉ âm thanh không được phép.");
  return url;
}
const isM4a = (mime) => /^audio\/mp4/i.test(String(mime || ""));

/** Danh sách URL m4a ứng viên từ một instance, ưu tiên bitrate cao nhất nhưng không vượt dung lượng cho phép. */
async function candidateUrls(inst, videoId, fetchImpl) {
  if (inst.kind === "piped") {
    const r = await fetchJson(`${inst.base}/streams/${encodeURIComponent(videoId)}`, { fetchImpl, timeoutMs: 8000 });
    if (!r.ok || !Array.isArray(r.body?.audioStreams)) return [];
    const list = r.body.audioStreams.filter((a) => isM4a(a.mimeType) && typeof a.url === "string" && (!a.contentLength || a.contentLength <= AUDIO.maxBytes)).sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
    const out = [];
    for (const a of list.slice(0, 2)) {
      out.push(a.url);
      // Piped: link googlevideo gắn với IP của instance → đi qua proxy của instance (đổi host, giữ host gốc trong tham số `host`)
      try { const px = new URL(String(r.body.proxyUrl || "")); const u = new URL(a.url); u.searchParams.set("host", u.host); u.host = px.host; out.unshift(u.toString()); } catch { /* không có proxyUrl */ }
    }
    return [...new Set(out)];
  }
  const r = await fetchJson(`${inst.base}/api/v1/videos/${encodeURIComponent(videoId)}?local=true`, { fetchImpl, timeoutMs: 8000 });
  if (!r.ok || !Array.isArray(r.body?.adaptiveFormats)) return [];
  return r.body.adaptiveFormats.filter((a) => isM4a(a.type) && typeof a.url === "string" && (!a.clen || Number(a.clen) <= AUDIO.maxBytes)).sort((a, b) => (Number(a.bitrate) || 0) - (Number(b.bitrate) || 0)).slice(0, 2)
    .map((a) => (a.url.startsWith("/") ? inst.base + a.url : a.url));
}

async function downloadCapped(url, dest, { fetchImpl, maxBytes = AUDIO.maxBytes, timeoutMs = 60_000 }) {
  assertPublicHttps(url);
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(String(url), { signal: ctl.signal, redirect: "follow" });
    if (!res.ok || !res.body) throw new AudioError("FAILED", `Tải âm thanh thất bại (HTTP ${res.status}).`);
    if (Number(res.headers?.get?.("content-length") || 0) > maxBytes) throw new AudioError("TOO_BIG", "File âm thanh quá nặng.");
    let got = 0;
    const body = Readable.fromWeb ? Readable.fromWeb(res.body) : Readable.from(Buffer.from(await res.arrayBuffer()));
    body.on("data", (c) => { got += c.length; if (got > maxBytes) body.destroy(new AudioError("TOO_BIG", "File âm thanh quá nặng.")); });
    await pipeline(body, fs.createWriteStream(dest));
    return got;
  } catch (err) {
    try { fs.unlinkSync(dest); } catch { /* chưa tạo */ }
    if (err instanceof AudioError) throw err;
    throw new AudioError(err?.name === "AbortError" ? "TIMEOUT" : "FAILED", "Không tải được âm thanh.");
  } finally { clearTimeout(timer); }
}

async function viaPublic(videoId, { env, fetchImpl }) {
  let lastErr = new AudioError("FAILED", "Không instance công khai nào có âm thanh cho bài này.");
  let tried = 0;
  for (const inst of orderedInstances(env)) {
    if (tried >= 3) break; tried++;
    let urls = [];
    try { urls = await candidateUrls(inst, videoId, fetchImpl); } catch { continue; }
    for (const url of urls) {
      const dest = path.join(AUDIO_DIR, `scl-${videoId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.m4a`);
      try {
        const size = await downloadCapped(url, dest, { fetchImpl });
        // kiểm tra đúng là MP4/M4A (tránh trang lỗi HTML): byte 4–7 = "ftyp"
        const fd = fs.openSync(dest, "r"); const head = Buffer.alloc(12); fs.readSync(fd, head, 0, 12, 0); fs.closeSync(fd);
        if (size < AUDIO.minBytes || head.subarray(4, 8).toString("latin1") !== "ftyp") { fs.unlinkSync(dest); lastErr = new AudioError("BAD_FORMAT", "Dữ liệu tải về không phải âm thanh m4a."); continue; }
        return { path: dest, size };
      } catch (err) { lastErr = err; try { fs.unlinkSync(dest); } catch { /* đã xoá */ } if (err.code === "TOO_BIG") throw err; }
    }
  }
  throw lastErr;
}
/** YouTube chặn IP/máy (429, "Sign in to confirm you're not a bot"). */
const BOT_CHECK = /Sign in to confirm|not a bot|HTTP Error 429|Too Many Requests/i;

/**
 * Cookie cho yt-dlp (TUỲ CHỌN, do quản trị viên tự cấu hình):
 *   SCL_YTDLP_COOKIES_FROM_BROWSER=firefox   (hoặc chrome/edge/...; Chrome trên Windows thường không đọc được cookie)
 *   SCL_YTDLP_COOKIES=C:\\duong\\dan\\cookies.txt
 * Dùng cookie tài khoản YouTube thật có rủi ro bị YouTube gắn cờ tài khoản → nên dùng tài khoản phụ. Giá trị được kiểm tra, không bao giờ ghi vào log.
 */
export function cookieArgs(env = process.env) {
  const out = [];
  const b = String(env.SCL_YTDLP_COOKIES_FROM_BROWSER || "").trim();
  if (/^[a-z]+(:[^\s;"'&|<>-][^\s;"'&|<>]{0,150})?$/i.test(b)) out.push("--cookies-from-browser", b);
  const f = String(env.SCL_YTDLP_COOKIES || "").trim();
  if (f && !f.startsWith("-") && !/[\r\n\0]/.test(f) && f.length < 400) out.push("--cookies", f);
  return out;
}

function cleanTag(tag) { try { for (const f of fs.readdirSync(AUDIO_DIR)) if (f.startsWith(tag)) fs.unlinkSync(path.join(AUDIO_DIR, f)); } catch { /* đã xoá */ } }

/**
 * Gửi file m4a vào cuộc trò chuyện. Trả "voice" | "file". Ném lỗi nếu cả hai cách đều thất bại.
 * @param {object} raw API zca gốc (adapter.raw)
 */
function safeName(t) { return String(t || "").normalize("NFC").replace(/[\\/:*?\"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60); }
function addUrlExtension(value, extension) {
  const url = new URL(value);
  if (!url.pathname.toLowerCase().endsWith(extension)) url.pathname += extension;
  return url.toString();
}
export async function sendAudioFile(raw, { threadId, threadType, filePath, voiceFilePath = null, title = "", env = process.env }) {
  const tt = threadType === "group" ? 1 : 0; // ThreadType.Group = 1, User = 0
  if (!raw) throw new AudioError("NO_API", "Không truy cập được API Zalo.");
  let voiceErr = null;
  if (typeof raw.uploadAttachment === "function" && typeof raw.sendVoice === "function") {
    try {
      const up = await raw.uploadAttachment(voiceFilePath || filePath, threadId, tt);
      const hosted = (Array.isArray(up) ? up : [up]).find((x) => x && typeof x.fileUrl === "string" && /^https?:\/\//i.test(x.fileUrl));
      if (!hosted) throw new Error("Zalo không trả đường dẫn file đã tải lên.");
      const voiceUrl = voiceFilePath ? addUrlExtension(hosted.fileUrl, ".aac") : hosted.fileUrl;
      await raw.sendVoice({ voiceUrl }, threadId, tt);
      // Một số thiết bị Zalo không phát được tin nhắn thoại do bot gửi → gửi kèm file m4a (tên theo bài hát) để máy nào cũng bấm nghe được.
      if (String(env.SCL_AUDIO_BOTH ?? "0").trim() !== "0" && typeof raw.sendMessage === "function") {
        const named = path.join(path.dirname(filePath), `${safeName(title) || "bai-hat"}-${Date.now().toString(36)}.m4a`.replace(/-[a-z0-9]+\.m4a$/, ".m4a"));
        try { fs.copyFileSync(filePath, named); await raw.sendMessage({ msg: "", attachments: [named] }, threadId, tt); return "voice+file"; }
        catch { return "voice"; } finally { try { fs.unlinkSync(named); } catch { /* đã xoá */ } }
      }
      return "voice";
    } catch (err) { voiceErr = err; }
  }
  if (typeof raw.sendMessage === "function") {
    try {
      await raw.sendMessage({ msg: title, attachments: [filePath] }, threadId, tt);
      return "file";
    } catch (err) { throw Object.assign(new AudioError("SEND_FAILED", "Gửi âm thanh thất bại."), { cause: err, voiceCause: voiceErr }); }
  }
  throw Object.assign(new AudioError("NO_API", "Thư viện Zalo không hỗ trợ gửi âm thanh."), { voiceCause: voiceErr });
}

const BOT_MSG = "YouTube đang chặn máy/mạng này (yêu cầu xác nhận không phải bot). Thử: đổi mạng (ví dụ phát 4G), chờ vài giờ, hoặc cấu hình cookie cho yt-dlp (SCL_YTDLP_COOKIES_FROM_BROWSER=firefox) — thư viện trong bot cũng bị chặn theo IP, đổi thư viện không đổi được IP. Bạn vẫn nghe được qua liên kết.";
export function audioFriendly(err) {
  switch (err?.code) {
    case "BOT_CHECK": return BOT_MSG;
    case "NO_SOURCE": if (err.firstCode === "BOT_CHECK") return BOT_MSG; return "Bot chưa cài yt-dlp, còn các máy chủ công khai miễn phí không cung cấp âm thanh lúc này (thường do YouTube chặn). Cài yt-dlp + Deno (yt-dlp cần Deno để lấy YouTube) trên máy chạy bot để có ghi âm ổn định (Windows: winget install yt-dlp, winget install DenoLand.Deno rồi khởi động lại bot).";
    case "NO_YTDLP": return "Bot chưa cài yt-dlp nên chưa gửi được ghi âm. Quản trị viên cài yt-dlp (hoặc đặt SCL_YTDLP_PATH) để bật.";
    case "TOO_LONG": return `${err.message} Bot chỉ gửi ghi âm cho bài ngắn hơn — hãy nghe qua liên kết.`;
    case "TOO_BIG": return "File âm thanh quá nặng để gửi — hãy nghe qua liên kết.";
    case "TIMEOUT": return "Tải âm thanh quá thời gian chờ — hãy nghe qua liên kết hoặc thử lại.";
    case "BUSY": return "Bot đang bận tải bài khác — hãy thử chọn lại sau ít giây.";
    case "SEND_FAILED": case "NO_API": return "Bot tải được âm thanh nhưng Zalo không nhận file — hãy nghe qua liên kết.";
    default: return "Không lấy được âm thanh cho bài này — hãy nghe qua liên kết.";
  }
}
