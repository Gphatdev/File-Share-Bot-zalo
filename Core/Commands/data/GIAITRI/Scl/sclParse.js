/**
 * sclParse.js — phân tích từ khóa `.scl`, phân loại phiên bản, chấm điểm/xếp hạng/khử trùng kết quả.
 * Thuần logic (không mạng, không Canvas) nên test được hoàn toàn offline.
 *
 * Quy tắc phân loại: CHỈ dựa vào tiêu đề / tên kênh / thời lượng có thật. Không chắc → "other" (Phiên bản khác).
 */

export const MODES = ["remix", "original", "short", "long"];

/** Bỏ dấu tiếng Việt + chữ thường + bỏ ký tự thừa → để so khớp linh hoạt. */
export function normText(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MODE_WORDS = {
  remix: ["remix", "rmx", "dj"],
  original: ["original", "goc", "ban goc", "official"],
  short: ["short", "shorts", "ngan", "ban ngan"],
  long: ["long", "dai", "extended", "ban dai"],
};

/**
 * Tách từ khóa chế độ Ở CUỐI câu lệnh (một từ cuối). Chỉ nhận khi vẫn còn tên bài hát ở phía trước,
 * nên `.scl remix` (chỉ một từ) được hiểu là tên bài hát "remix", không phải chế độ.
 * @param {string[]|string} args
 * @returns {{ query: string, mode: string|null }}
 */
export function parseQuery(args) {
  const raw = (Array.isArray(args) ? args.join(" ") : String(args ?? "")).replace(/\s+/g, " ").trim();
  if (!raw) return { query: "", mode: null };
  const parts = raw.split(" ");
  // hai từ cuối: "ban goc" / "ban ngan" / "ban dai" (kiểm tra trước để "bản gốc" không bị cắt còn "bản")
  if (parts.length >= 3) {
    const two = normText(parts.slice(-2).join(" "));
    for (const m of MODES) if (MODE_WORDS[m].includes(two) && two.includes(" ")) return { query: parts.slice(0, -2).join(" "), mode: m };
  }
  if (parts.length >= 2) {
    const last = normText(parts[parts.length - 1]);
    for (const m of MODES) {
      if (MODE_WORDS[m].includes(last) && !(m === "remix" && last === "dj")) return { query: parts.slice(0, -1).join(" "), mode: m };
    }
  }
  return { query: raw, mode: null };
}

// ───────────── phân loại phiên bản ─────────────
export const LABELS = {
  original: { text: "ORIGINAL", vi: "Bản gốc" },
  remix: { text: "REMIX", vi: "Remix" },
  spedup: { text: "SPED UP", vi: "Sped Up" },
  slowed: { text: "SLOWED", vi: "Slowed / Reverb" },
  short: { text: "SHORT", vi: "Bản ngắn" },
  long: { text: "LONG", vi: "Bản dài" },
  live: { text: "LIVE", vi: "Live / Acoustic" },
  other: { text: "KHÁC", vi: "Phiên bản khác" },
};

export function classify({ title = "", channel = "", durationSec = 0 } = {}) {
  const t = normText(title), c = normText(channel);
  if (/\b(sped up|speed up|speedup|spedup|nightcore|tang toc)\b/.test(t)) return "spedup";
  if (/\b(slowed|slow reverb|reverb|slowed reverb|lofi slow)\b/.test(t)) return "slowed";
  if (/\b(remix|rmx|bootleg|dj\s+\w+\s+mix|edm mix|house mix|deep house|vinahouse|nhac san)\b/.test(t) || /\b(remix)\b/.test(c)) return "remix";
  if (/\b(live|acoustic|unplugged|concert|live session|truc tiep)\b/.test(t)) return "live";
  if (/\b(shorts?|ban ngan|short version)\b/.test(t) || (durationSec > 0 && durationSec <= 60)) return "short";
  if (/\b(extended|long version|ban dai|full version|1 hour|one hour|\d+ hours?|\d+ gio|loop)\b/.test(t)) return "long";
  if (/\b(official|oa|mv|m v|music video|audio chinh thuc|ban goc|original)\b/.test(t) || /(\btopic$|vevo$|\bofficial\b)/.test(c)) return "original";
  return "other";
}

// ───────────── thời lượng / ngày ─────────────
/** "PT4M13S" → 253. Không hợp lệ → 0. */
export function parseIsoDuration(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(iso ?? ""));
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}
export function formatDuration(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  if (!sec) return "--:--";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
/** ISO ("2021-03-05T..."), "YYYYMMDD" hoặc epoch giây → "dd/mm/yyyy"; không có → "Chưa xác định". */
export function formatDate(v) {
  if (v == null || v === "") return "Chưa xác định";
  let d = null;
  if (typeof v === "number") d = new Date(v * (v < 1e11 ? 1000 : 1));
  else if (/^\d{8}$/.test(String(v))) d = new Date(Date.UTC(+String(v).slice(0, 4), +String(v).slice(4, 6) - 1, +String(v).slice(6, 8)));
  else d = new Date(String(v));
  if (!d || Number.isNaN(d.getTime())) return "Chưa xác định";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

// ───────────── chấm điểm / xếp hạng ─────────────
function coverage(tokens, hay) {
  if (!tokens.length) return 0;
  let hit = 0; for (const tk of tokens) if (hay.includes(tk)) hit++;
  return hit / tokens.length;
}

/**
 * Lọc, chấm điểm, khử trùng, đa dạng hoá phiên bản. Mỗi item vào: {id,title,channel,url,thumb,durationSec,publishedAt}.
 * @returns item đã thêm {key,label,score}, tối đa `limit` kết quả.
 */
export function rankResults(items, query, mode = null, { limit = 15 } = {}) {
  const tokens = normText(query).split(" ").filter(Boolean);
  const seenId = new Set(), best = new Map();
  for (const it of items || []) {
    if (!it?.id || !it.title || seenId.has(it.id)) continue;
    seenId.add(it.id);
    const title = normText(it.title), chan = normText(it.channel);
    const cov = coverage(tokens, `${title} ${chan}`);
    const minCov = tokens.length <= 2 ? 1 : 0.6;
    if (cov < minCov) continue;
    const key = classify(it);
    let score = cov * 100 + coverage(tokens, title) * 30;
    if (/(\btopic$|vevo$|\bofficial\b)/.test(chan)) score += 10;
    if (key === "original" && !mode) score += 15;
    const dur = it.durationSec || 0;
    if (mode === "remix") { if (key === "remix") score += 60; }
    else if (mode === "original") { if (key === "original") score += 60; if (["remix", "spedup", "slowed", "live"].includes(key)) score -= 40; }
    else if (mode === "short") { if (key === "short") score += 60; if (dur > 0) score += Math.max(0, 300 - dur) / 300 * 20; }
    else if (mode === "long") { if (key === "long") score += 60; score += Math.min(dur, 1200) / 1200 * 20; }
    const dupKey = `${title}|${chan}`; // cùng tiêu đề + kênh = trùng
    const row = { ...it, key, label: LABELS[key].text, score };
    const prev = best.get(dupKey);
    if (!prev || prev.score < row.score) best.set(dupKey, row);
  }
  const rows = [...best.values()].sort((a, b) => b.score - a.score);
  if (mode) return rows.slice(0, limit);
  // không chế độ: mỗi loại phiên bản tốt nhất lên đầu (chỉ loại thực sự tìm thấy), phần còn lại theo điểm
  const order = ["original", "remix", "spedup", "slowed", "short", "long", "live", "other"];
  const head = [];
  for (const k of order) { const r = rows.find((x) => x.key === k); if (r) head.push(r); }
  const rest = rows.filter((r) => !head.includes(r));
  return [...head, ...rest].slice(0, limit);
}
