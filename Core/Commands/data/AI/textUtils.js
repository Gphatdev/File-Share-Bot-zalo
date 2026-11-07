/** AI/textUtils.js — chuẩn hóa chữ, lọc thông tin nhạy cảm, tiện ích emoji. */
export const stripVN = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
export const norm = (s) => stripVN(s).toLowerCase().replace(/\s+/g, " ").trim();

const SECRET_KEYWORDS = /(m[aậ]t\s*kh[aẩ]u|mat\s*khau|password|passwd|\bpass\b|\botp\b|token|cookie|session|api[\s_-]?key|secret|cvv|\bpin\b|s[oố]\s*th[eẻ]|so\s*the|\bstk\b|t[aà]i\s*kho[aả]n\s*ng[aâ]n|credential|private[\s_-]?key)/i;
const SECRET_SHAPES = [/\bgsk_[A-Za-z0-9]{10,}/, /\bsk-[A-Za-z0-9_-]{16,}/, /\b(?:AKIA|ghp_|xox[baprs]-|AIza)[A-Za-z0-9_-]{10,}/, /\b[A-Za-z0-9_\-]{32,}\b/, /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/];
const LONG_NUMBER = /\b\d{9,}\b/g;
const PHONE = /(?:\+?84|0)(?:[\s.\-]?\d){8,10}/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const MENTION = /@[^\s@]{1,40}/g;

/** Nội dung có dấu hiệu bí mật (khóa/mật khẩu/token…) → KHÔNG được học/lưu. */
export function looksSensitive(text) {
  const s = String(text ?? "");
  if (SECRET_KEYWORDS.test(s)) return true;
  return SECRET_SHAPES.some((re) => re.test(s));
}
/** Che link, email, số điện thoại, số dài, tag @. */
export function maskPersonal(text) {
  return String(text ?? "").replace(URL_RE, "[link]").replace(EMAIL, "[email]").replace(PHONE, "[sdt]").replace(LONG_NUMBER, "[số]").replace(MENTION, "@người");
}
/** Dùng cho mọi nội dung đi vào lịch sử/Groq: null nếu nhạy cảm, ngược lại bản đã che. */
export function sanitize(text, maxLen = 1500) {
  let s = String(text ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").trim();
  if (!s) return null;
  if (looksSensitive(s)) return null;
  s = maskPersonal(s);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

const EMOJI_RE = /(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)/gu;
const EMOTICON_RE = /(?:=\)\)+|:\)\)+|:\)+|:\(+|:v\b|:3\b|:D\b|=\)|\^_?\^|T_T|-_-|:\/|:p\b|<3|\bxD\b)/gi;
export const findEmoji = (s) => String(s).match(EMOJI_RE) || [];
export const findEmoticons = (s) => (String(s).match(EMOTICON_RE) || []).map((x) => x.toLowerCase());

export function hasVietnameseDiacritics(s) { return /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i.test(s); }
export function redactSecrets(msg, key) {
  let s = String(msg ?? "");
  if (key) s = s.split(key).join("[KEY]");
  return s.replace(/gsk_[A-Za-z0-9]+/g, "[KEY]").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [KEY]");
}
