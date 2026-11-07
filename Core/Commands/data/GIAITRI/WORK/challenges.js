/**
 * WORK/challenges.js — sinh câu hỏi/kiểm tra cho từng bước nhiệm vụ.
 * Mọi đáp án do BOT sinh và chấm; người chơi chỉ trả lời, không tự nhập số lượng/tiến độ.
 * rand: () => [0,1) (có thể tiêm vào khi test).
 */
const ri = (rand, a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
function shuffle(rand, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** Trộn đáp án đúng vào các đáp án sai → {options, answer(1-based)} */
function withOptions(rand, right, wrongs) {
  const uniq = [...new Set(wrongs.map(String))].filter((w) => w !== String(right));
  const opts = shuffle(rand, [String(right), ...uniq.slice(0, 3)]);
  return { options: opts, answer: opts.indexOf(String(right)) + 1 };
}
function numWrongs(rand, right, spread = 6) {
  const set = new Set();
  let guard = 0;
  while (set.size < 3 && guard++ < 60) {
    const d = ri(rand, 1, spread) * (rand() < 0.5 ? -1 : 1);
    const v = right + d;
    if (v !== right && v >= 0) set.add(v);
  }
  let k = 1;
  while (set.size < 3) { set.add(right + 7 + k++); }
  return [...set];
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(rand, n = 5) { let s = ""; for (let i = 0; i < n; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]; return s; }

export const KINDS = ["code", "math", "quiz", "sequence", "evensum"];

/**
 * @returns {{kind, title, prompt, options?:string[], answer?:number, code?:string, hint:string}}
 */
export function makeChallenge({ kind, job, group, quizBanks, rand = Math.random, usedQuiz = [] }) {
  const noun = job?.noun || "mục";
  if (kind === "code") {
    const code = makeCode(rand, 5);
    return { kind, title: "Mã xác nhận", prompt: `Nhập đúng mã xác nhận của ${noun} này:`, code, hint: "Gõ đúng mã hiển thị (không phân biệt hoa/thường)." };
  }
  if (kind === "math") {
    const a = ri(rand, 12, 60), b = ri(rand, 8, 45), c = ri(rand, 2, Math.min(a + b - 1, 15));
    const right = a + b - c;
    const o = withOptions(rand, right, numWrongs(rand, right));
    return { kind, title: "Tính số lượng", prompt: `Buổi sáng bạn xử lý ${a} ${noun}, buổi chiều thêm ${b} ${noun}, trong đó ${c} ${noun} bị loại. Còn bao nhiêu ${noun} đạt?`, ...o, hint: "Chọn số đáp án." };
  }
  if (kind === "sequence") {
    const start = ri(rand, 2, 9), step = ri(rand, 2, 7);
    const geo = rand() < 0.35;
    const seq = [];
    let v = start;
    for (let i = 0; i < 4; i++) { seq.push(v); v = geo ? v * 2 : v + step; }
    const right = v;
    const o = withOptions(rand, right, numWrongs(rand, right, geo ? 10 : 5));
    return { kind, title: "Dãy số", prompt: `Số tiếp theo của dãy: ${seq.join(", ")}, ... là?`, ...o, hint: "Chọn số đáp án." };
  }
  if (kind === "evensum") {
    const nums = Array.from({ length: 6 }, () => ri(rand, 2, 30));
    if (!nums.some((n) => n % 2 === 0)) nums[0] = 8;
    const right = nums.filter((n) => n % 2 === 0).reduce((s, n) => s + n, 0);
    const o = withOptions(rand, right, numWrongs(rand, right, 8));
    return { kind, title: "Kiểm tra số liệu", prompt: `Tính tổng các số CHẴN trong danh sách: ${nums.join(", ")}`, ...o, hint: "Chọn số đáp án." };
  }
  // quiz
  const bank = quizBanks?.[group] || [];
  if (!bank.length) return makeChallenge({ kind: "math", job, group, quizBanks, rand });
  const pool = bank.map((_, i) => i).filter((i) => !usedQuiz.includes(i));
  const idx = pick(rand, pool.length ? pool : bank.map((_, i) => i));
  const q = bank[idx];
  const o = withOptions(rand, q.a, q.w);
  return { kind: "quiz", title: "Câu hỏi nghiệp vụ", prompt: q.q, ...o, quizIndex: idx, hint: "Chọn số đáp án." };
}

const stripVN = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");

/** Chấm đáp án. Trả {valid, correct}. valid=false: đầu vào không hợp lệ (không phạt). */
export function judge(ch, input) {
  const raw = String(input ?? "").trim();
  if (!raw) return { valid: false, correct: false };
  if (ch.kind === "code") {
    const norm = stripVN(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (norm.length < 3) return { valid: false, correct: false };
    return { valid: true, correct: norm === String(ch.code).toUpperCase() };
  }
  const n = options(ch).length;
  let idx = null;
  if (/^\d{1,2}$/.test(raw)) idx = Number(raw);
  else if (/^[a-dA-D]$/.test(raw)) idx = raw.toUpperCase().charCodeAt(0) - 64;
  if (!idx || idx < 1 || idx > n) return { valid: false, correct: false };
  return { valid: true, correct: idx === ch.answer };
}
export function options(ch) { return Array.isArray(ch?.options) ? ch.options : []; }
