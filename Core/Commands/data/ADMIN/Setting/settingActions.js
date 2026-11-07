/**
 * settingActions.js — thao tác thật lên tài khoản Zalo của bot + xử lý media.
 *
 * API THẬT đã xác minh trong zca-mt@1.2.2 (node_modules/zca-mt/dist/apis):
 *   - api.changeAccountAvatar(avatarSource: string | {data,filename,metadata}) → Promise<"">   (đổi ảnh đại diện)
 *   - api.updateProfile({ profile:{ name, dob:"YYYY-MM-DD", gender }, biz? }) → Promise<"">    (đổi tên; bắt buộc gửi kèm dob+gender hiện tại)
 *   - api.fetchAccountInfo() → { profile: User }                                              (tên, avatar, gender, dob, sdob)
 *   - api.getOwnId()
 * KHÔNG CÓ trong zca-mt@1.2.2 (và zca-js bản mới nhất): đăng nhật kí / đăng bài viết / đăng video lên tường.
 *   (api.sendVideo chỉ gửi video vào MỘT CUỘC TRÒ CHUYỆN, không phải đăng lên tường nên KHÔNG dùng thay thế.)
 * Vì vậy 3 chức năng đăng bài dùng "provider" cắm ngoài: registerSettingProvider("diary"|"post"|"video", fn).
 * Chưa có provider ⇒ báo rõ "chưa hỗ trợ", tuyệt đối không giả lập thành công.
 */
import fs from "node:fs";
import net from "node:net";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export const LIMITS = {
  imageMaxBytes: 10 * 1024 * 1024,
  imageMinSide: 64,
  videoMaxBytes: 100 * 1024 * 1024,   // giới hạn DỰ KIẾN (zca-mt không công bố); chỉnh tại đây khi biết giới hạn thật
  videoMaxSec: 10 * 60,
  nameMin: 2,
  nameMax: 40,
  captionMax: 2000,
  downloadTimeoutMs: 30_000,
  providerTimeoutMs: { diary: 120_000, post: 60_000, video: 240_000 },
};
const VIDEO_EXT = /\.(mp4|mov|m4v|mkv|webm|avi|3gp)(\?|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)(\?|$)/i;

// ───────────── provider (điểm cắm API đăng bài) ─────────────
const providers = new Map();
export const PROVIDER_FOR = { nhatki: "diary", baiviet: "post", video: "video" };
export function registerSettingProvider(name, fn) { if (typeof fn !== "function") throw new Error("provider phải là hàm"); providers.set(name, fn); }
export function clearSettingProviders() { providers.clear(); }
export function getProvider(name) { return providers.get(name) || global.__SETTING_PROVIDERS__?.[name] || null; }

/** Chức năng nào chạy được thật với `api` hiện tại. */
export function capabilities(api) {
  const has = (n) => typeof api?.[n] === "function";
  return {
    nhatki: !!getProvider("diary"),
    baiviet: !!getProvider("post"),
    video: !!getProvider("video"),
    logo: has("changeAccountAvatar"),
    ten: has("updateProfile") && has("fetchAccountInfo"),
  };
}
export const MISSING_API_TEXT = {
  nhatki: "Thư viện Zalo hiện dùng (zca-mt 1.2.2) không có API đăng nhật kí.",
  baiviet: "Thư viện Zalo hiện dùng (zca-mt 1.2.2) không có API đăng bài viết lên tường.",
  video: "Thư viện Zalo hiện dùng (zca-mt 1.2.2) không có API đăng video lên tường (api.sendVideo chỉ gửi vào cuộc trò chuyện).",
  logo: "Thư viện không có api.changeAccountAvatar.",
  ten: "Thư viện không có api.updateProfile / fetchAccountInfo.",
};

// ───────────── lỗi thân thiện ─────────────
export function friendlyError(err) {
  const m = String(err?.message || err || "Lỗi không xác định");
  const low = m.toLowerCase();
  if (err?.name === "AbortError" || /timeout|timed out|etimedout/.test(low)) return { code: "TIMEOUT", text: "Zalo phản hồi quá chậm (hết thời gian chờ)." };
  if (/enotfound|econnreset|econnrefused|network|fetch failed|socket/.test(low)) return { code: "NETWORK", text: "Mất kết nối mạng tới Zalo. Kiểm tra mạng rồi thử lại." };
  if (/login|unauthor|401|403|session|cookie|auth|đăng nhập/.test(low)) return { code: "AUTH", text: "Phiên đăng nhập Zalo có vấn đề (có thể đã hết hạn). Đăng nhập lại bot rồi thử lại." };
  if (/metadata|imagemetadatagetter/.test(low)) return { code: "NO_META", text: "Bot chưa đọc được kích thước ảnh (thiếu bộ đọc metadata)." };
  return { code: "API_ERROR", text: `Zalo từ chối yêu cầu: ${m.slice(0, 160)}` };
}

// ───────────── hồ sơ tài khoản ─────────────
let profileCache = { at: 0, value: null };
export function clearProfileCache() { profileCache = { at: 0, value: null }; }

export async function getProfile(api, { force = false, maxAgeMs = 60_000 } = {}) {
  if (!force && profileCache.value && Date.now() - profileCache.at < maxAgeMs) return profileCache.value;
  const res = await api.fetchAccountInfo();
  const p = res?.profile || res || {};
  const value = {
    name: p.displayName || p.zaloName || "",
    uid: String(p.userId || (typeof api.getOwnId === "function" ? api.getOwnId() : "") || ""),
    avatarUrl: p.avatar || "",
    gender: p.gender,
    dob: p.dob,
    sdob: p.sdob,
  };
  profileCache = { at: Date.now(), value };
  return value;
}

/** dob "YYYY-MM-DD" cho updateProfile, từ sdob "DD/MM/YYYY" (ưu tiên) hoặc dob dạng timestamp. */
export function toIsoDob(profile) {
  const s = String(profile?.sdob || "");
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  const n = Number(profile?.dob);
  if (Number.isFinite(n) && n > 0) {
    const d = new Date((n > 1e11 ? n : n * 1000) + 7 * 3600 * 1000); // giờ Việt Nam
    if (!Number.isNaN(d.getTime())) return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
}

// ───────────── kiểm tra dữ liệu người dùng gửi ─────────────
export function validateName(raw) {
  const name = String(raw ?? "").replace(/[\u0000-\u001F\u007F​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, text: "Tên không được để trống." };
  const len = [...name].length;
  if (len < LIMITS.nameMin) return { ok: false, text: `Tên quá ngắn (tối thiểu ${LIMITS.nameMin} ký tự).` };
  if (len > LIMITS.nameMax) return { ok: false, text: `Tên quá dài (${len} ký tự, tối đa ${LIMITS.nameMax}).` };
  if (/^[\d\s\W_]+$/u.test(name) && !/\p{L}/u.test(name)) return { ok: false, text: "Tên phải có ít nhất một chữ cái." };
  return { ok: true, name };
}
export function validateCaption(raw) {
  const caption = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if ([...caption].length > LIMITS.captionMax) return { ok: false, text: `Caption quá dài (tối đa ${LIMITS.captionMax} ký tự).` };
  return { ok: true, caption };
}

// ───────────── nhận diện media trong tin nhắn ─────────────
function parseJson(v) { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return null; } }

/** → { kind:"image"|"video"|null, url, durationSec, size } từ message.data (dạng thật của zca-mt: msgType + content). */
export function extractMedia(data) {
  if (!data) return { kind: null };
  const msgType = String(data.msgType || "");
  const content = parseJson(data.content);
  if (!content || typeof content !== "object") return { kind: null };
  const params = parseJson(content.params) || {};
  const url = content.hdUrl || content.href || content.url || content.normalUrl || null;
  if (!url) return { kind: null };
  const durationRaw = Number(params.duration ?? content.duration ?? 0);
  const durationSec = durationRaw > 1000 ? durationRaw / 1000 : durationRaw; // Zalo gửi ms
  const size = Number(params.fileSize ?? params.file_size ?? params.size ?? content.fileSize ?? 0) || 0;
  if (/video/i.test(msgType) || (!/photo|image/i.test(msgType) && VIDEO_EXT.test(String(url)))) return { kind: "video", url, durationSec, size };
  if (/photo|image/i.test(msgType) || IMAGE_EXT.test(String(url))) return { kind: "image", url, size };
  return { kind: null };
}

// ───────────── tải file an toàn ─────────────
export function assertSafeUrl(u) {
  let url; try { url = new URL(String(u)); } catch { throw Object.assign(new Error("Đường dẫn media không hợp lệ."), { code: "BAD_URL" }); }
  if (url.protocol !== "https:") throw Object.assign(new Error("Chỉ chấp nhận đường dẫn https."), { code: "BAD_URL" });
  const h = url.hostname.toLowerCase();
  const bad = h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") ||
    (net.isIP(h) && (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")));
  if (bad) throw Object.assign(new Error("Địa chỉ media không được phép."), { code: "BAD_URL" });
  return url;
}

export async function downloadToFile(url, dest, { maxBytes, timeoutMs = LIMITS.downloadTimeoutMs, fetchImpl = fetch } = {}) {
  assertSafeUrl(url);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(String(url), { signal: ctl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`Tải media thất bại (HTTP ${res.status}).`);
    const declared = Number(res.headers?.get?.("content-length") || 0);
    if (maxBytes && declared > maxBytes) throw Object.assign(new Error("Tệp vượt dung lượng cho phép."), { code: "TOO_BIG" });
    let got = 0;
    const body = Readable.fromWeb ? Readable.fromWeb(res.body) : Readable.from(Buffer.from(await res.arrayBuffer()));
    body.on("data", (c) => { got += c.length; if (maxBytes && got > maxBytes) body.destroy(Object.assign(new Error("Tệp vượt dung lượng cho phép."), { code: "TOO_BIG" })); });
    await pipeline(body, fs.createWriteStream(dest));
    return { size: got };
  } catch (err) {
    try { fs.unlinkSync(dest); } catch { /* chưa tạo */ }
    throw err;
  } finally { clearTimeout(timer); }
}

/** Kiểm tra + chuẩn hoá ảnh bằng sharp. purpose: "logo" (vuông) | "post". → { path, width, height, size } */
export async function prepareImage(inPath, outPath, { purpose = "post" } = {}) {
  let sharp;
  try { sharp = (await import("sharp")).default; } catch { throw Object.assign(new Error("Thiếu thư viện xử lý ảnh (sharp)."), { code: "NO_SHARP" }); }
  let meta;
  try { meta = await sharp(inPath).metadata(); } catch { throw Object.assign(new Error("Tệp không phải ảnh hợp lệ."), { code: "BAD_IMAGE" }); }
  if (!meta.width || !meta.height) throw Object.assign(new Error("Không đọc được kích thước ảnh."), { code: "BAD_IMAGE" });
  if (Math.min(meta.width, meta.height) < LIMITS.imageMinSide) throw Object.assign(new Error(`Ảnh quá nhỏ (tối thiểu ${LIMITS.imageMinSide}px mỗi cạnh).`), { code: "SMALL_IMAGE" });
  let pipe = sharp(inPath).rotate();
  pipe = purpose === "logo" ? pipe.resize(1080, 1080, { fit: "cover", position: "centre", withoutEnlargement: false }) : pipe.resize(2048, 2048, { fit: "inside", withoutEnlargement: true });
  await pipe.flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toFile(outPath);
  const out = await sharp(outPath).metadata();
  return { path: outPath, width: out.width, height: out.height, size: fs.statSync(outPath).size };
}

export function validateVideoInfo(info) {
  if (info.size && info.size > LIMITS.videoMaxBytes) return { ok: false, text: `Video quá nặng (${(info.size / 1048576).toFixed(1)} MB, tối đa ${LIMITS.videoMaxBytes / 1048576} MB).` };
  if (info.durationSec && info.durationSec > LIMITS.videoMaxSec) return { ok: false, text: `Video quá dài (${Math.round(info.durationSec)} giây, tối đa ${LIMITS.videoMaxSec} giây).` };
  return { ok: true };
}

// ───────────── thao tác tài khoản ─────────────
const inflight = new Set();

export async function changeAvatar(api, filePath) {
  if (typeof api?.changeAccountAvatar !== "function") return { ok: false, code: "UNSUPPORTED", text: MISSING_API_TEXT.logo };
  try {
    await api.changeAccountAvatar(filePath);
  } catch (err) { const f = friendlyError(err); return { ok: false, code: f.code, text: f.text }; }
  let profile = null;
  try { clearProfileCache(); profile = await getProfile(api, { force: true }); } catch { /* chỉ để làm mới cache */ }
  return { ok: true, profile };
}

export async function changeName(api, rawName) {
  if (typeof api?.updateProfile !== "function" || typeof api?.fetchAccountInfo !== "function") return { ok: false, code: "UNSUPPORTED", text: MISSING_API_TEXT.ten };
  const v = validateName(rawName);
  if (!v.ok) return { ok: false, code: "BAD_NAME", text: v.text };
  let profile;
  try { profile = await getProfile(api, { force: true }); } catch (err) { const f = friendlyError(err); return { ok: false, code: f.code, text: f.text }; }
  if (profile.name === v.name) return { ok: false, code: "SAME_NAME", text: "Tên mới trùng với tên hiện tại, không cần đổi." };
  const dob = toIsoDob(profile);
  if (!dob || profile.gender === undefined || profile.gender === null) return { ok: false, code: "NO_PROFILE", text: "Không đọc được ngày sinh/giới tính hiện tại của tài khoản nên không đổi tên (tránh ghi đè sai thông tin)." };
  try {
    await api.updateProfile({ profile: { name: v.name, dob, gender: profile.gender } });
  } catch (err) { const f = friendlyError(err); return { ok: false, code: f.code, text: f.text }; }
  let verified = false, shown = v.name;
  try { clearProfileCache(); const after = await getProfile(api, { force: true }); shown = after.name || v.name; verified = after.name === v.name; } catch { /* không xác minh được */ }
  return { ok: true, name: v.name, oldName: profile.name, verified, shown };
}

/** Gọi provider đăng bài, có chống trùng + timeout. kind: diary | post | video. */
export async function publish(kind, args, { lockKey } = {}) {
  const fn = getProvider(kind);
  if (!fn) return { ok: false, code: "UNSUPPORTED", text: MISSING_API_TEXT[{ diary: "nhatki", post: "baiviet", video: "video" }[kind]] };
  const key = `${kind}:${lockKey || "global"}`;
  if (inflight.has(key)) return { ok: false, code: "BUSY", text: "Đang đăng một bài khác, vui lòng chờ." };
  inflight.add(key);
  const timeoutMs = LIMITS.providerTimeoutMs[kind] || 60_000;
  let timer;
  try {
    const res = await Promise.race([
      Promise.resolve(fn(args)),
      new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error("timeout"), { name: "AbortError" })), timeoutMs); }),
    ]);
    if (res && res.ok === true) return { ok: true, id: res.id ?? null, raw: res };
    return { ok: false, code: "REJECTED", text: res?.text || res?.message || "Zalo không xác nhận bài đăng thành công." };
  } catch (err) {
    const f = friendlyError(err);
    // timeout: KHÔNG biết bài đã lên hay chưa → không báo thất bại chắc chắn, cũng không tự thử lại để tránh đăng trùng
    if (f.code === "TIMEOUT") return { ok: false, code: "UNCERTAIN", text: "Zalo phản hồi quá chậm nên chưa xác nhận được bài đã đăng hay chưa. Hãy kiểm tra tài khoản trước khi thử lại (tránh đăng trùng)." };
    return { ok: false, code: f.code, text: f.text };
  } finally { clearTimeout(timer); inflight.delete(key); }
}
