/**
 * sclSearch.js — module tìm kiếm nhạc cho `.scl`. Tách riêng để đổi nhà cung cấp dễ dàng.
 *
 * Nguồn (theo thứ tự ưu tiên, chỉ bật nguồn đã được cấu hình — KHÔNG có key/URL nào viết cứng):
 *   1. youtube  : YouTube Data API v3 (search.list + videos.list)  ← biến môi trường YOUTUBE_API_KEY
 *   2. invidious: instance Invidious tự triển khai (/api/v1/search) ← SCL_INVIDIOUS_URL
 *   3. ytdlp    : yt-dlp cài sẵn trên máy chạy bot ("ytsearchN:")   ← SCL_YTDLP=1 hoặc SCL_YTDLP_PATH
 *   4. public   : API CÔNG KHAI miễn phí, KHÔNG cần key (Piped / Invidious do cộng đồng vận hành) — bật sẵn mặc định.
 *                 Độ ổn định phụ thuộc người vận hành, thường xuyên có instance chết/bị chặn → tự xoay vòng + nhớ instance lỗi.
 * SCL_PROVIDERS="youtube,invidious,ytdlp,public" để đổi thứ tự / tắt bớt.
 * Key không bao giờ được ghi vào log hay trả về trong thông báo lỗi.
 */
import { execFile } from "node:child_process";
import { parseIsoDuration, rankResults } from "./sclParse.js";

export const LIMITS = {
  timeoutMs: 8000, ytdlpTimeoutMs: 20000, retries: 1, retryDelayMs: 600,
  cacheTtlMs: 10 * 60_000, cacheMax: 100, quotaCooldownMs: 5 * 60_000,
  fetchCount: 25, keep: 15, publicMaxTries: 4, instanceCooldownMs: 5 * 60_000,
  thumbTimeoutMs: 4000, thumbMaxBytes: 600_000,
};

export class SclError extends Error {
  constructor(code, message) { super(message); this.name = "SclError"; this.code = code; }
}

const THUMB_HOSTS = [/(^|\.)ytimg\.com$/i, /(^|\.)ggpht\.com$/i, /(^|\.)googleusercontent\.com$/i, /(^|\.)youtube\.com$/i];
export const ytThumb = (id) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
export const watchUrl = (id) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;

/** Nguồn thumbnail chỉ chấp nhận https + domain của YouTube/Google; khác → ảnh chuẩn của YouTube. */
export function safeThumbUrl(url, id) {
  try {
    const u = new URL(String(url));
    if (u.protocol === "https:" && THUMB_HOSTS.some((r) => r.test(u.hostname))) return u.toString();
  } catch { /* dùng ảnh chuẩn */ }
  return ytThumb(id);
}

/** Che key/URL nhạy cảm khỏi mọi chuỗi trước khi log. */
export function redact(s) {
  return String(s ?? "").replace(/([?&]key=)[^&\s"']+/gi, "$1***").replace(/AIza[0-9A-Za-z_-]{20,}/g, "***");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson(url, { fetchImpl = fetch, timeoutMs = LIMITS.timeoutMs } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try { res = await fetchImpl(url, { signal: ctl.signal, headers: { accept: "application/json" } }); }
  catch (err) { throw new SclError(err?.name === "AbortError" ? "TIMEOUT" : "NETWORK", "Không kết nối được nguồn tìm kiếm."); }
  finally { clearTimeout(timer); }
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, ok: res.ok, body };
}

function httpError(status, body) {
  const reason = String(body?.error?.errors?.[0]?.reason || body?.error?.status || "");
  if (status === 429) return new SclError("RATE", "Nguồn tìm kiếm đang giới hạn tốc độ (HTTP 429).");
  if (status === 403 && /quota|dailyLimit|rateLimit/i.test(reason + JSON.stringify(body?.error?.message || ""))) return new SclError("QUOTA", "Đã hết hạn mức YouTube API hôm nay.");
  if (status === 400 && /keyInvalid|API_KEY_INVALID|badRequest/i.test(reason + JSON.stringify(body?.error?.message || ""))) return new SclError("KEY_INVALID", "API key YouTube không hợp lệ.");
  if (status === 401 || status === 403) return new SclError("KEY_DENIED", "API key YouTube bị từ chối hoặc chưa bật YouTube Data API v3.");
  if (status >= 500) return new SclError("SERVER", `Máy chủ nguồn tìm kiếm lỗi (HTTP ${status}).`);
  return new SclError("HTTP", `Nguồn tìm kiếm trả lỗi (HTTP ${status}).`);
}


// ───────────── API công khai (Piped / Invidious) ─────────────
// Danh sách mặc định là các instance công khai do cộng đồng vận hành; CÓ THỂ ĐÃ CHẾT/BỊ CHẶN theo thời gian.
// Đổi bằng SCL_PUBLIC_INSTANCES="piped:https://a.example,inv:https://b.example" (hoặc SCL_PUBLIC=0 để tắt).
const PUBLIC_DEFAULT = [
  ["piped", "https://pipedapi.kavin.rocks"], ["inv", "https://inv.nadeko.net"],
  ["piped", "https://api.piped.private.coffee"], ["inv", "https://yewtu.be"],
  ["piped", "https://pipedapi.adminforge.de"], ["inv", "https://invidious.nerdvpn.de"],
];
export function publicInstances(env = process.env) {
  const raw = String(env.SCL_PUBLIC_INSTANCES || "").trim();
  const rows = [];
  if (raw) {
    for (const part of raw.split(",")) {
      const m = /^\s*(piped|inv|invidious)\s*:\s*(https:\/\/[^\s]+)\s*$/i.exec(part);
      if (m) rows.push([m[1].toLowerCase() === "piped" ? "piped" : "inv", m[2].replace(/\/+$/, "")]);
    }
  } else rows.push(...PUBLIC_DEFAULT);
  return rows.map(([kind, base]) => ({ kind, base }));
}
const instHealth = new Map(); // base → { until } khi vừa lỗi | { ok: lần thành công }
function markInstance(base, ok) { instHealth.set(base, ok ? { ok: Date.now() } : { until: Date.now() + LIMITS.instanceCooldownMs }); }
/** Instance từng thành công lên đầu, instance đang "nghỉ" (vừa lỗi) xuống cuối. */
export function orderedInstances(env = process.env) {
  const now = Date.now(), all = publicInstances(env);
  const score = (i) => { const h = instHealth.get(i.base); return h?.until > now ? 2 : h?.ok ? 0 : 1; };
  return all.map((i, idx) => ({ i, idx })).sort((a, b) => score(a.i) - score(b.i) || a.idx - b.idx).map((x) => x.i).filter((i, _, arr) => score(i) < 2 || arr.every((x) => score(x) === 2));
}
export function resetInstanceHealth() { instHealth.clear(); }

async function invidiousSearch(baseIn, query, fetchImpl, count, timeoutMs = LIMITS.timeoutMs) {
  const base = String(baseIn).replace(/\/+$/, "");
  const r = await fetchJson(`${base}/api/v1/search?${new URLSearchParams({ q: query, type: "video" })}`, { fetchImpl, timeoutMs });
  if (!r.ok) throw httpError(r.status, r.body);
  if (!Array.isArray(r.body)) throw new SclError("BAD_RESPONSE", "Nguồn Invidious trả dữ liệu không đúng định dạng.");
  return r.body.filter((v) => v?.type === "video" && VIDEO_ID.test(String(v.videoId || ""))).slice(0, count).map((v) => ({
    id: v.videoId, title: v.title, channel: v.author, url: watchUrl(v.videoId), thumb: ytThumb(v.videoId),
    durationSec: Number(v.lengthSeconds) || 0, publishedAt: v.published ? Number(v.published) : null,
  }));
}
/** Piped: GET /search?q=&filter=videos → { items:[{ url:"/watch?v=ID", title, uploaderName, duration(giây), uploaded(ms) }] } */
async function pipedSearch(baseIn, query, fetchImpl, count) {
  const base = String(baseIn).replace(/\/+$/, "");
  const r = await fetchJson(`${base}/search?${new URLSearchParams({ q: query, filter: "videos" })}`, { fetchImpl, timeoutMs: 5000 });
  if (!r.ok) throw httpError(r.status, r.body);
  if (!Array.isArray(r.body?.items)) throw new SclError("BAD_RESPONSE", "Nguồn Piped trả dữ liệu không đúng định dạng.");
  const out = [];
  for (const v of r.body.items) {
    const id = /[?&]v=([A-Za-z0-9_-]{6,20})/.exec(String(v?.url || ""))?.[1];
    if (!id || !v.title || (v.type && v.type !== "stream") || Number(v.duration) < 0) continue; // duration -1 = đang phát trực tiếp
    out.push({ id, title: v.title, channel: v.uploaderName || "", url: watchUrl(id), thumb: ytThumb(id), durationSec: Number(v.duration) || 0, publishedAt: Number(v.uploaded) > 0 ? Number(v.uploaded) / 1000 : null });
    if (out.length >= count) break;
  }
  return out;
}

// ───────────── nhà cung cấp ─────────────
const providers = {
  youtube: {
    enabled: (env) => !!String(env.YOUTUBE_API_KEY || "").trim(),
    label: "YouTube Data API v3",
    async search(query, { env, fetchImpl, count }) {
      const key = encodeURIComponent(String(env.YOUTUBE_API_KEY).trim());
      const q = new URLSearchParams({ part: "snippet", type: "video", maxResults: String(count), q: query });
      const s = await fetchJson(`https://www.googleapis.com/youtube/v3/search?${q}&key=${key}`, { fetchImpl });
      if (!s.ok) throw httpError(s.status, s.body);
      const ids = (s.body?.items || []).map((i) => i?.id?.videoId).filter((x) => VIDEO_ID.test(String(x || "")));
      if (!ids.length) return [];
      const d = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet,status&id=${ids.join(",")}&key=${key}`, { fetchImpl });
      if (!d.ok) throw httpError(d.status, d.body);
      const out = [];
      for (const v of d.body?.items || []) { // video đã xoá/riêng tư không có trong videos.list → tự bị loại
        if (v?.status?.privacyStatus && v.status.privacyStatus !== "public") continue;
        if (v?.snippet?.liveBroadcastContent && v.snippet.liveBroadcastContent !== "none") continue;
        const sn = v.snippet || {};
        out.push({
          id: v.id, title: sn.title, channel: sn.channelTitle, url: watchUrl(v.id),
          thumb: safeThumbUrl(sn.thumbnails?.medium?.url || sn.thumbnails?.high?.url, v.id),
          durationSec: parseIsoDuration(v.contentDetails?.duration), publishedAt: sn.publishedAt || null,
        });
      }
      return out;
    },
  },

  invidious: {
    enabled: (env) => /^https?:\/\//i.test(String(env.SCL_INVIDIOUS_URL || "").trim()),
    label: "Invidious (tự triển khai)",
    async search(query, { env, fetchImpl, count }) { return invidiousSearch(String(env.SCL_INVIDIOUS_URL).trim(), query, fetchImpl, count); },
  },

  public: {
    enabled: (env) => String(env.SCL_PUBLIC ?? "1").trim() !== "0" && publicInstances(env).length > 0,
    label: "API công khai (Piped/Invidious)",
    noRetry: true, // tự xoay vòng giữa nhiều instance thay vì thử lại cùng một cái
    async search(query, { env, fetchImpl, count }) {
      const list = orderedInstances(env);
      let lastErr = new SclError("NETWORK", "Không instance công khai nào trả lời.");
      let tried = 0;
      for (const inst of list) {
        if (tried >= LIMITS.publicMaxTries) break;
        tried++;
        try {
          const rows = inst.kind === "piped" ? await pipedSearch(inst.base, query, fetchImpl, count) : await invidiousSearch(inst.base, query, fetchImpl, count, 5000);
          markInstance(inst.base, true);
          return rows;
        } catch (err) { lastErr = err instanceof SclError ? err : new SclError("UNKNOWN", "Lỗi instance công khai."); markInstance(inst.base, false); }
      }
      throw lastErr;
    },
  },

  ytdlp: {
    enabled: (env) => String(env.SCL_YTDLP || "") === "1" || !!String(env.SCL_YTDLP_PATH || "").trim(),
    label: "yt-dlp",
    async search(query, { env, count, execImpl = execFile }) {
      const bin = String(env.SCL_YTDLP_PATH || "yt-dlp").trim();
      const args = ["--no-warnings", "--flat-playlist", "--skip-download", "--dump-json", `ytsearch${count}:${query}`];
      const stdout = await new Promise((resolve, reject) => {
        execImpl(bin, args, { timeout: LIMITS.ytdlpTimeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, out) => {
          if (err) return reject(new SclError(err.code === "ENOENT" ? "NO_YTDLP" : (err.killed ? "TIMEOUT" : "YTDLP"), "yt-dlp không chạy được."));
          resolve(String(out || ""));
        });
      });
      const rows = [];
      for (const line of stdout.split("\n")) {
        if (!line.trim()) continue;
        let j; try { j = JSON.parse(line); } catch { continue; }
        if (!VIDEO_ID.test(String(j?.id || ""))) continue;
        rows.push({
          id: j.id, title: j.title, channel: j.channel || j.uploader || "", url: watchUrl(j.id), thumb: ytThumb(j.id),
          durationSec: Number(j.duration) || 0, publishedAt: j.upload_date || j.timestamp || null,
        });
      }
      return rows;
    },
  },
};

export function enabledProviders(env = process.env) {
  const order = String(env.SCL_PROVIDERS || "youtube,invidious,ytdlp,public").split(",").map((s) => s.trim().toLowerCase()).filter((s) => providers[s]);
  return order.filter((n) => providers[n].enabled(env));
}

// ───────────── cache + chống gọi lặp ─────────────
const cache = new Map();        // key → { at, value }
const inflight = new Map();     // key → Promise
const cooldown = new Map();     // provider → until (khi hết quota)
export function resetSearchState() { cache.clear(); inflight.clear(); cooldown.clear(); instHealth.clear(); }

function cachePut(key, value) {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > LIMITS.cacheMax) cache.delete(cache.keys().next().value);
}

async function runProvider(name, query, ctx) {
  let lastErr;
  for (let attempt = 0; attempt <= LIMITS.retries; attempt++) {
    try { return await providers[name].search(query, ctx); }
    catch (err) {
      lastErr = err instanceof SclError ? err : new SclError("UNKNOWN", "Lỗi không xác định khi tìm kiếm.");
      if (providers[name].noRetry || !["RATE", "SERVER", "NETWORK", "TIMEOUT"].includes(lastErr.code) || attempt === LIMITS.retries) break;
      await sleep(LIMITS.retryDelayMs * (attempt + 1));
    }
  }
  throw lastErr;
}

/**
 * Tìm nhạc. Trả { results, source, fromCache, notes[] }.
 * Ném SclError: NO_PROVIDER (chưa cấu hình nguồn nào) | ALL_FAILED (tất cả nguồn lỗi; err.reasons liệt kê mã lỗi) | EMPTY.
 */
export async function searchMusic(query, mode = null, opts = {}) {
  const env = opts.env || process.env;
  const q = String(query || "").trim().slice(0, 120);
  if (!q) throw new SclError("EMPTY", "Thiếu từ khóa tìm kiếm.");
  const names = enabledProviders(env);
  if (!names.length) throw new SclError("NO_PROVIDER", "Chưa cấu hình nguồn tìm kiếm.");

  const key = `${q.toLowerCase().replace(/\s+/g, " ")}|${mode || ""}|${names.join(",")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < LIMITS.cacheTtlMs) return { ...hit.value, fromCache: true };
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    const searchText = mode === "remix" ? `${q} remix` : mode === "original" ? `${q} official audio` : mode === "short" ? `${q} short version` : mode === "long" ? `${q} extended version` : q;
    const reasons = [];
    for (const name of names) {
      if ((cooldown.get(name) || 0) > Date.now()) { reasons.push(`${name}:QUOTA`); continue; }
      try {
        const raw = await runProvider(name, searchText, { env, fetchImpl: opts.fetchImpl || fetch, execImpl: opts.execImpl, count: LIMITS.fetchCount });
        const results = rankResults(raw, q, mode, { limit: LIMITS.keep });
        const value = { results, source: providers[name].label, provider: name, fromCache: false };
        cachePut(key, value);
        return value;
      } catch (err) {
        if (err.code === "QUOTA" || err.code === "KEY_INVALID" || err.code === "KEY_DENIED") cooldown.set(name, Date.now() + LIMITS.quotaCooldownMs);
        reasons.push(`${name}:${err.code}`);
        opts.logger?.warn?.("[scl] Nguồn tìm kiếm lỗi:", { provider: name, code: err.code, message: redact(err.message) });
      }
    }
    throw Object.assign(new SclError("ALL_FAILED", "Tất cả nguồn tìm kiếm đều lỗi."), { reasons });
  })().finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

// ───────────── tải thumbnail an toàn ─────────────
/** Tải thumbnail (https + domain YouTube/Google, giới hạn dung lượng + thời gian). Lỗi → null (không làm hỏng việc render). */
export async function fetchThumbnail(url, id, { fetchImpl = fetch } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LIMITS.thumbTimeoutMs);
  try {
    const res = await fetchImpl(safeThumbUrl(url, id), { signal: ctl.signal });
    if (!res.ok) return null;
    if (Number(res.headers?.get?.("content-length") || 0) > LIMITS.thumbMaxBytes) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length && buf.length <= LIMITS.thumbMaxBytes ? buf : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

/** Thông báo thân thiện cho từng nguyên nhân lỗi (không chứa key). */
export function friendlyReason(err) {
  const r = (err?.reasons || []).join(" ");
  if (err?.code === "NO_PROVIDER") return { title: "CHƯA CÓ NGUỒN NHẠC", text: "Tất cả nguồn tìm kiếm đang bị tắt. Quản trị viên hãy bật lại SCL_PUBLIC (mặc định bật) hoặc đặt YOUTUBE_API_KEY trong file .env rồi khởi động lại bot." };
  if (/public:/.test(r) && !/youtube:|invidious:|ytdlp:/.test(r)) return { title: "NGUỒN NHẠC MIỄN PHÍ ĐANG BẬN", text: "Các máy chủ công khai miễn phí hiện không phản hồi hoặc đang bị YouTube chặn. Hãy thử lại sau ít phút." };
  if (/QUOTA/.test(r)) return { title: "HẾT HẠN MỨC TÌM KIẾM", text: "Hạn mức YouTube API hôm nay đã dùng hết. Hãy thử lại sau hoặc nhờ quản trị viên cấu hình nguồn dự phòng." };
  if (/KEY_INVALID|KEY_DENIED/.test(r)) return { title: "API KEY KHÔNG DÙNG ĐƯỢC", text: "Key YouTube không hợp lệ hoặc chưa bật YouTube Data API v3. Quản trị viên cần kiểm tra lại cấu hình." };
  if (/RATE/.test(r)) return { title: "TÌM KIẾM QUÁ NHANH", text: "Nguồn nhạc đang giới hạn tốc độ. Hãy chờ một lát rồi thử lại." };
  if (/NETWORK|TIMEOUT/.test(r)) return { title: "KHÔNG KẾT NỐI ĐƯỢC", text: "Bot không kết nối được nguồn nhạc (mạng hoặc quá thời gian chờ). Hãy thử lại sau ít phút." };
  return { title: "TÌM KIẾM THẤT BẠI", text: "Nguồn nhạc đang gặp sự cố. Hãy thử lại sau ít phút." };
}
