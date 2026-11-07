/**
 * Nhận diện số điện thoại Việt Nam cho VBANK — HNNP STUDIO.
 *  - Nhận MỌI kiểu chữ số: 0-9, chữ số full-width (０１２), Arabic-Indic (٠١٢), Devanagari…, emoji keycap (0️⃣1️⃣),
 *    chữ số toán học (𝟎𝟏𝟐), và số đọc bằng chữ tiếng Việt/Anh ("không chín ba sáu…", "zero nine three…").
 *  - Nhận mọi kiểu ngăn cách: khoảng trắng, chấm, gạch, ngoặc, +84 / 84 / 0084 / (0), thiếu số 0 đầu.
 *  - Nhận số từ DANH THIẾP Zalo (tin nhắn chat.recommended): quét mọi trường chuỗi + params JSON.
 *  - isSkipInput: boqua / bỏ qua / bo qua / skip.
 */

const WORD_DIGITS = new Map([
  ["khong", "0"], ["linh", "0"], ["le", "0"], ["zero", "0"], ["oh", "0"],
  ["mot", "1"], ["mốt", "1"], ["one", "1"],
  ["hai", "2"], ["two", "2"],
  ["ba", "3"], ["three", "3"],
  ["bon", "4"], ["tu", "4"], ["four", "4"],
  ["nam", "5"], ["lam", "5"], ["five", "5"],
  ["sau", "6"], ["six", "6"],
  ["bay", "7"], ["seven", "7"],
  ["tam", "8"], ["eight", "8"],
  ["chin", "9"], ["nine", "9"],
]);

const stripAccents = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");

/** Đổi mọi chữ số Unicode (Nd), keycap emoji về 0-9. Ký tự khác giữ nguyên. */
export function toAsciiDigits(input) {
  const s = String(input ?? "").normalize("NFKC").replace(/[︎️⃣]/g, "");
  let out = "";
  for (const ch of s) {
    if (/\d/.test(ch)) { out += ch; continue; }
    if (/\p{Nd}/u.test(ch)) {
      let cp = ch.codePointAt(0), start = cp;
      while (/\p{Nd}/u.test(String.fromCodePoint(start - 1))) start -= 1;
      out += String((cp - start) % 10);
      continue;
    }
    out += ch;
  }
  return out;
}

/** "không chín ba sáu…" → "093…" — chỉ khi TOÀN BỘ chuỗi là số đọc bằng chữ / chữ số / dấu ngăn cách. */
function wordsToDigits(s) {
  const tokens = stripAccents(s).toLowerCase().split(/[\s,.;:\-_/()+]+/).filter(Boolean);
  if (!tokens.length) return null;
  let out = "", sawWord = false;
  for (const t of tokens) {
    if (/^\d+$/.test(t)) { out += t; continue; }
    const d = WORD_DIGITS.get(t);
    if (d === undefined) return null;
    out += d; sawWord = true;
  }
  return sawWord ? out : null;
}

function canonical(digitsWithPlus) {
  let v = digitsWithPlus.replace(/[^\d]/g, "");
  const hadPlus = digitsWithPlus.trim().startsWith("+");
  if (v.startsWith("0084")) v = `0${v.slice(4)}`;
  else if (v.startsWith("840") && v.length === 12) v = v.slice(2);          // +84 (0) 912…
  else if (v.startsWith("84") && v.length === 11) v = `0${v.slice(2)}`;
  else if (hadPlus && v.startsWith("84")) v = `0${v.slice(2)}`;
  else if (/^[35789]\d{8}$/.test(v)) v = `0${v}`;                          // thiếu số 0 đầu
  return /^0(3|5|7|8|9)\d{8}$/.test(v) ? v : null;
}

/** Chuẩn hoá 1 chuỗi (chỉ chứa số điện thoại, có thể kèm dấu ngăn cách / số đọc bằng chữ). Trả "0912345678" hoặc null. */
export function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;
  const ascii = toAsciiDigits(raw).trim();
  if (!ascii) return null;
  const direct = canonical(ascii);
  if (direct) return direct;
  const words = wordsToDigits(ascii);
  return words ? canonical(words) : null;
}

/** Tìm số điện thoại trong 1 đoạn văn bất kỳ (tin nhắn có kèm chữ, danh thiếp…). */
export function findPhoneInText(raw) {
  const direct = normalizePhone(raw);
  if (direct) return direct;
  const ascii = toAsciiDigits(raw);
  const runs = ascii.match(/\+?\d[\d\s.\-()]{7,}\d/g) || [];
  for (const run of runs) {
    const v = canonical(run);
    if (v) return v;
  }
  return null;
}

function collectStrings(value, out, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return;
  if (typeof value === "string") {
    out.push(value);
    const t = value.trim();
    if ((t.startsWith("{") || t.startsWith("[")) && t.length < 20000) {
      try { collectStrings(JSON.parse(t), out, depth + 1); } catch { /* không phải JSON */ }
    }
    return;
  }
  if (typeof value === "number") { out.push(String(value)); return; }
  if (Array.isArray(value)) { for (const v of value) collectStrings(v, out, depth + 1); return; }
  if (typeof value === "object") {
    // ưu tiên các trường có tên gợi ý số điện thoại
    const preferred = Object.keys(value).filter((k) => /phone|mobile|sdt|tel|number|description|desc/i.test(k));
    for (const k of preferred) collectStrings(value[k], out, depth + 1);
    for (const k of Object.keys(value)) if (!preferred.includes(k) && !/^(thumb|href|avatar|image|url|userId|uid|idTo|uidFrom|msgId|cliMsgId)$/i.test(k)) collectStrings(value[k], out, depth + 1);
  }
}

/** Danh thiếp Zalo (chat.recommended) hoặc tin nhắn có số: trả số điện thoại hợp lệ đầu tiên, hoặc null. */
export function phoneFromMessageData(data) {
  if (!data || typeof data !== "object") return null;
  const strings = [];
  collectStrings(data.content, strings);
  for (const k of ["phone", "phoneNumber", "mobile", "description", "title", "msg", "caption"]) collectStrings(data[k], strings);
  for (const s of strings) {
    const p = findPhoneInText(s);
    if (p) return p;
  }
  return null;
}

/** Có phải tin nhắn danh thiếp (kể cả khi không đọc được số)? */
export function isContactCard(data) {
  const type = String(data?.msgType || "").toLowerCase();
  if (type.includes("recommended") || type.includes("contact") || type.includes("card")) return true;
  const c = data?.content;
  const action = typeof c === "object" && c ? String(c.action || "") : "";
  return /recommen|contact|user_card/i.test(action);
}

export function isSkipInput(raw) {
  const s = stripAccents(String(raw ?? "")).toLowerCase().replace(/[\s_\-.!]+/g, "");
  return s === "boqua" || s === "skip" || s === "next";
}
