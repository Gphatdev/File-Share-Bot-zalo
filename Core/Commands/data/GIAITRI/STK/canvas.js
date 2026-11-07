/**
 * STK / VBANK canvas — giao diện ngân hàng số "kính mờ" theo từng ngân hàng (v3).
 * 5 thẻ dọc: Tài khoản · Chuyển tiền thành công · Nhận tiền · Hóa đơn dịch vụ · Lịch sử giao dịch (+ thẻ QR).
 * Mỗi ngân hàng có bảng màu riêng. TẤT CẢ là hình vẽ bằng code: không dùng logo/ảnh thương hiệu thật,
 * biểu tượng ngân hàng chỉ là huy hiệu hình học + chữ viết tắt. Mọi thẻ đều ghi rõ là TIỀN GAME.
 *
 * Giữ nguyên API: renderAccountCard, renderTransferBill, renderReceiveBill,
 * renderPaymentBill, renderHistoryCard, renderQrCard, maskAccountNumber, maskPhone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, registerFont } from "canvas";

// ---------- fonts ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "..", "..", "MEDIA", "fonts");
const FAMILY = "BeVietnamPro";
const FONT_FILES = {
  400: "BeVietnamPro_400Regular.ttf",
  600: "BeVietnamPro_600SemiBold.ttf",
  700: "BeVietnamPro_700Bold.ttf",
  800: "BeVietnamPro_800ExtraBold.ttf",
};
let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  fontsRegistered = true;
  for (const [weight, file] of Object.entries(FONT_FILES)) {
    const filePath = path.join(FONT_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    try { registerFont(filePath, { family: FAMILY, weight }); }
    catch (err) { console.error("[STK canvas] Không đăng ký được font:", err?.message); }
  }
}
ensureFonts();
const FACE = fs.existsSync(path.join(FONT_DIR, FONT_FILES[700])) ? FAMILY : "sans-serif";
const font = (weight, size) => `${weight} ${size}px ${FACE}`;

// ---------- tokens ----------
const W = 1000;
const SCALE = 2;
const PAD = 56;
const T = {
  text: "#F5F8FF", sub: "#9FB0CC", dim: "#7C8DAA",
  ok: "#38F2A0", bad: "#FF5C7A", gold: "#FFC93D", goldHi: "#FFE08A",
  line: "rgba(170,190,230,0.16)",
};

/** Bảng màu theo ngân hàng. a = màu nhấn chính, b = màu nhấn phụ, dark = nền tối. */
const THEMES = [
  { k: "vietcombank", a: "#2BE58A", b: "#0FAE5C", dark: "#03150C", full: "Ngân hàng TMCP Ngoại Thương Việt Nam", tag: ["Vững bước", "Tiên phong"], emblem: "shield" },
  { k: "bidv", a: "#33B4FF", b: "#1FE0C4", dark: "#041030", full: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam", tag: ["Đồng hành", "cùng thành công"], emblem: "flower" },
  { k: "tpbank", a: "#B666FF", b: "#FF7A3D", dark: "#12062B", full: "Ngân hàng TMCP Tiên Phong", tag: ["Vì chúng tôi", "hiểu bạn"], emblem: "chevron" },
  { k: "mb", a: "#4F82FF", b: "#FF4D5E", dark: "#050B2E", full: "Ngân hàng TMCP Quân Đội", tag: ["Kết nối giá trị", "Vững bước tương lai"], emblem: "star", exact: true },
  { k: "vietinbank", a: "#3DA5FF", b: "#6BD0FF", dark: "#041029", full: "Ngân hàng TMCP Công Thương Việt Nam", tag: ["Ngân hàng", "số của bạn"], emblem: "shield" },
  { k: "techcombank", a: "#FF4155", b: "#FF8A5C", dark: "#1A050A", full: "Ngân hàng TMCP Kỹ Thương Việt Nam", tag: ["Cùng bạn", "bứt phá"], emblem: "chevron" },
  { k: "agribank", a: "#FF4F8B", b: "#FFB35C", dark: "#1A050F", full: "Ngân hàng Nông nghiệp và PTNT Việt Nam", tag: ["Mang phồn thịnh", "đến khách hàng"], emblem: "flower" },
  { k: "acb", a: "#38A3FF", b: "#6FE0FF", dark: "#041029", full: "Ngân hàng TMCP Á Châu", tag: ["Ngân hàng", "của mọi nhà"], emblem: "shield" },
  { k: "vpbank", a: "#35F08F", b: "#B6FF5C", dark: "#04180D", full: "Ngân hàng TMCP Việt Nam Thịnh Vượng", tag: ["Thịnh vượng", "cùng bạn"], emblem: "star" },
  { k: "sacombank", a: "#2FB8FF", b: "#7CD9FF", dark: "#041229", full: "Ngân hàng TMCP Sài Gòn Thương Tín", tag: ["Ngân hàng", "tin cậy"], emblem: "flower" },
  { k: "hdbank", a: "#FF4D6D", b: "#FFC93D", dark: "#1B050C", full: "Ngân hàng TMCP Phát triển TP.HCM", tag: ["Vì cuộc sống", "tốt đẹp hơn"], emblem: "chevron" },
];
const FALLBACK_ACCENTS = ["#22D3EE", "#8B5CFF", "#FF7AC6", "#FFB02E", "#3DE08A"];

function mixHex(c1, c2, t) {
  const A = hexToRgb(c1), B = hexToRgb(c2);
  const m = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function hashStr(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

function resolveTheme(bankName = "") {
  const n = String(bankName || "").toLowerCase();
  const hit = THEMES.find((t) => (t.exact ? n.split(/[\s\-_.]+/).includes(t.k) : n.includes(t.k)));
  if (hit) return hit;
  const a = FALLBACK_ACCENTS[hashStr(n) % FALLBACK_ACCENTS.length];
  return { k: "x", a, b: mixHex(a, "#8B5CFF", 0.5), dark: mixHex(a, "#03050D", 0.9), full: `Ngân hàng ảo ${bankName || ""}`.trim(), tag: ["Ngân hàng số", "tiền game"], emblem: ["shield", "flower", "star", "chevron"][hashStr(n) % 4] };
}
const NEUTRAL = { k: "neutral", a: "#5B8CFF", b: "#8B5CFF", dark: "#040A22", full: "", tag: ["", ""], emblem: "star" };

// ---------- tiện ích ----------
function hexToRgb(hex) {
  const raw = String(hex || "").replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [34, 211, 238];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function money(v) { return Number(v || 0).toLocaleString("vi-VN"); }
function signedMoney(v) { const n = Number(v || 0); return `${n > 0 ? "+" : n < 0 ? "-" : ""} ${money(Math.abs(n))}`; }
function displayMoney(v) {
  const n = Number(v || 0), abs = Math.abs(n);
  if (abs >= 1e15) return `${Number((n / 1e15).toFixed(2))}Qa`;
  if (abs >= 1e12) return `${Number((n / 1e12).toFixed(2))}T`;
  if (abs >= 1e9) return `${Number((n / 1e9).toFixed(2))}B`;
  return money(n);
}
export function maskAccountNumber(number) { return String(number ?? ""); }
export function maskPhone(phone) {
  const value = String(phone ?? "");
  if (!value) return "Chưa liên kết";
  if (value.length < 6) return value;
  return `${value.slice(0, 2)}*****${value.slice(-3)}`;
}
const groupAcc = (n) => String(n ?? "").replace(/(\d{4})(?=\d)/g, "$1 ");
function fit(ctx, value, maxW) {
  let s = String(value ?? "");
  if (!maxW || ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}
const SHORT = { vietcombank: "VCB", vietinbank: "CTG", techcombank: "TCB", sacombank: "STB", eximbank: "EIB", pvcombank: "PVCB", kienlongbank: "KLB", "baoviet bank": "BVB", "nam a bank": "NAB", "bac a bank": "BAB", "cake by vpbank": "CAKE", "co-opbank": "COOP" };
function shortOf(bankName) {
  const k = String(bankName || "").trim().toLowerCase();
  if (SHORT[k]) return SHORT[k];
  const words = String(bankName || "BANK").trim().split(/\s+/);
  return (words.length > 1 ? words.map((w) => w[0]).join("") : words[0]).slice(0, 4).toUpperCase();
}
const initialsOf = (name) => {
  const w = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] || "?").slice(0, 2)) || "?").toUpperCase();
};

function newCanvas(height) {
  const canvas = createCanvas(W * SCALE, height * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx };
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function text(ctx, value, x, y, { weight = 400, size = 28, color = T.text, align = "left", maxW, glow = 0, italic = false } = {}) {
  ctx.save();
  ctx.font = font(weight, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  if (italic) { ctx.translate(x, y); ctx.transform(1, 0, -0.18, 1, 0, 0); ctx.translate(-x, -y); }
  const s = maxW ? fit(ctx, value, maxW) : String(value ?? "");
  ctx.fillText(s, x, y);
  ctx.restore();
  return s;
}
function glowStroke(ctx, color, width = 2, blur = 16) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.restore();
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, width * 0.7); ctx.stroke(); ctx.restore();
}
function spot(ctx, x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// ---------- nền, khung kính ----------
function background(ctx, H, th) {
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, mixHex(th.dark, "#000000", 0.15)); g.addColorStop(0.55, th.dark); g.addColorStop(1, mixHex(th.dark, th.a, 0.12));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  spot(ctx, 120, 160, 560, th.a, 0.30);
  spot(ctx, W - 80, H * 0.55, 620, th.b, 0.20);
  spot(ctx, W * 0.4, H - 80, 520, th.a, 0.14);
  // sao li ti
  let s = hashStr(th.k + H);
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.18})`;
    ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.8 + rnd() * 1.6, 0, Math.PI * 2); ctx.fill();
  }
  // khung ngoài (kính + viền phát sáng)
  rrect(ctx, 14, 14, W - 28, H - 28, 44);
  ctx.fillStyle = "rgba(255,255,255,0.025)"; ctx.fill();
  rrect(ctx, 14, 14, W - 28, H - 28, 44);
  glowStroke(ctx, rgba(th.a, 0.85), 2.4, 20);
}

/** Tấm kính: fill gradient mờ + viền sáng nhẹ */
function glass(ctx, x, y, w, h, th, { r = 30, tint = th.a, alpha = 0.5, fillA = 0.07, strong = false } = {}) {
  ctx.save();
  rrect(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, rgba(tint, strong ? 0.28 : fillA * 1.7)); g.addColorStop(1, rgba("#FFFFFF", fillA * 0.45));
  ctx.fillStyle = "rgba(4,8,22,0.55)"; ctx.fill();
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  rrect(ctx, x, y, w, h, r);
  glowStroke(ctx, rgba(tint, alpha), 1.6, 10);
  // ánh sáng cạnh trên
  ctx.save();
  rrect(ctx, x, y, w, h, r); ctx.clip();
  const hl = ctx.createLinearGradient(x, y, x, y + Math.min(h, 90));
  hl.addColorStop(0, "rgba(255,255,255,0.10)"); hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl; ctx.fillRect(x, y, w, Math.min(h, 90));
  ctx.restore();
}
function divider(ctx, x1, x2, y) { ctx.fillStyle = T.line; ctx.fillRect(x1, y, x2 - x1, 1.5); }

// ---------- biểu tượng ----------
function coin(ctx, cx, cy, r) {
  ctx.save();
  ctx.shadowColor = T.gold; ctx.shadowBlur = r * 0.7;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, "#FFF1B8"); g.addColorStop(0.55, "#FFC93D"); g.addColorStop(1, "#E08A00");
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(150,80,0,0.75)"; ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2); ctx.stroke();
  // 3 vạch chữ G cách điệu
  ctx.fillStyle = "rgba(150,80,0,0.85)";
  const s = r * 0.34;
  ctx.beginPath(); ctx.arc(cx, cy, s, 0.35, Math.PI * 2 - 0.35); ctx.lineWidth = r * 0.16; ctx.strokeStyle = "rgba(150,80,0,0.85)"; ctx.stroke();
  ctx.fillRect(cx, cy - r * 0.04, s * 1.0, r * 0.16);
  ctx.restore();
}

function glyph(ctx, kind, cx, cy, r, color, lw) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw ?? Math.max(2.4, r * 0.14);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const s = r;
  switch (kind) {
    case "check":
      ctx.beginPath(); ctx.moveTo(cx - s * 0.62, cy + s * 0.02); ctx.lineTo(cx - s * 0.14, cy + s * 0.5); ctx.lineTo(cx + s * 0.7, cy - s * 0.46); ctx.stroke(); break;
    case "out":   // mũi tên chéo ra
      ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy + s * 0.5); ctx.lineTo(cx + s * 0.5, cy - s * 0.5);
      ctx.moveTo(cx - s * 0.05, cy - s * 0.5); ctx.lineTo(cx + s * 0.5, cy - s * 0.5); ctx.lineTo(cx + s * 0.5, cy + s * 0.05); ctx.stroke(); break;
    case "swap":  // hai mũi tên ngược chiều
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.6, cy - s * 0.25); ctx.lineTo(cx + s * 0.6, cy - s * 0.25); ctx.moveTo(cx + s * 0.25, cy - s * 0.6); ctx.lineTo(cx + s * 0.6, cy - s * 0.25); ctx.lineTo(cx + s * 0.25, cy + s * 0.1);
      ctx.moveTo(cx + s * 0.6, cy + s * 0.3); ctx.lineTo(cx - s * 0.6, cy + s * 0.3); ctx.moveTo(cx - s * 0.25, cy - s * 0.05); ctx.lineTo(cx - s * 0.6, cy + s * 0.3); ctx.lineTo(cx - s * 0.25, cy + s * 0.65);
      ctx.stroke(); break;
    case "gamepad": {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.55, cy - s * 0.38); ctx.quadraticCurveTo(cx - s * 0.95, cy - s * 0.38, cx - s * 0.95, cy + s * 0.15);
      ctx.quadraticCurveTo(cx - s * 0.95, cy + s * 0.7, cx - s * 0.5, cy + s * 0.55); ctx.lineTo(cx - s * 0.3, cy + s * 0.25);
      ctx.lineTo(cx + s * 0.3, cy + s * 0.25); ctx.lineTo(cx + s * 0.5, cy + s * 0.55);
      ctx.quadraticCurveTo(cx + s * 0.95, cy + s * 0.7, cx + s * 0.95, cy + s * 0.15); ctx.quadraticCurveTo(cx + s * 0.95, cy - s * 0.38, cx + s * 0.55, cy - s * 0.38);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy - s * 0.12); ctx.lineTo(cx - s * 0.5, cy + s * 0.12); ctx.moveTo(cx - s * 0.62, cy); ctx.lineTo(cx - s * 0.38, cy); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + s * 0.38, cy - s * 0.05, s * 0.07, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.58, cy + s * 0.08, s * 0.07, 0, 7); ctx.fill(); break;
    }
    case "wallet":
      rrect(ctx, cx - s * 0.7, cy - s * 0.45, s * 1.4, s * 0.95, s * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.55, cy - s * 0.45); ctx.lineTo(cx + s * 0.3, cy - s * 0.7); ctx.lineTo(cx + s * 0.4, cy - s * 0.45); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + s * 0.38, cy + s * 0.02, s * 0.09, 0, 7); ctx.fill(); break;
    case "copy":
      rrect(ctx, cx - s * 0.2, cy - s * 0.55, s * 0.8, s * 0.8, s * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy - s * 0.3); ctx.lineTo(cx - s * 0.6, cy - s * 0.3); ctx.lineTo(cx - s * 0.6, cy + s * 0.55); ctx.lineTo(cx + s * 0.2, cy + s * 0.55); ctx.lineTo(cx + s * 0.2, cy + s * 0.45); ctx.stroke(); break;
    case "phone":
      ctx.beginPath(); ctx.moveTo(cx - s * 0.55, cy - s * 0.55); ctx.quadraticCurveTo(cx - s * 0.7, cy - s * 0.05, cx - s * 0.05, cy + s * 0.5);
      ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.75, cx + s * 0.6, cy + s * 0.55); ctx.lineTo(cx + s * 0.6, cy + s * 0.3); ctx.lineTo(cx + s * 0.25, cy + s * 0.12);
      ctx.lineTo(cx + s * 0.05, cy + s * 0.3); ctx.quadraticCurveTo(cx - s * 0.25, cy + s * 0.1, cx - s * 0.3, cy - s * 0.15); ctx.lineTo(cx - s * 0.12, cy - s * 0.3); ctx.lineTo(cx - s * 0.3, cy - s * 0.62); ctx.closePath(); ctx.stroke(); break;
    case "info":
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.5, s * 0.12, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.12); ctx.lineTo(cx, cy + s * 0.6); ctx.stroke(); break;
    case "gift":
      rrect(ctx, cx - s * 0.6, cy - s * 0.1, s * 1.2, s * 0.75, s * 0.1); ctx.stroke();
      rrect(ctx, cx - s * 0.7, cy - s * 0.42, s * 1.4, s * 0.32, s * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.42); ctx.lineTo(cx, cy + s * 0.65);
      ctx.moveTo(cx, cy - s * 0.42); ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 0.95, cx - s * 0.4, cy - s * 0.42);
      ctx.moveTo(cx, cy - s * 0.42); ctx.quadraticCurveTo(cx + s * 0.5, cy - s * 0.95, cx + s * 0.4, cy - s * 0.42); ctx.stroke(); break;
    case "list":
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(cx - s * 0.35, cy + i * s * 0.38); ctx.lineTo(cx + s * 0.55, cy + i * s * 0.38); ctx.stroke(); ctx.beginPath(); ctx.arc(cx - s * 0.6, cy + i * s * 0.38, s * 0.07, 0, 7); ctx.fill(); }
      break;
    case "qr":
      for (const [dx, dy] of [[-0.55, -0.55], [0.15, -0.55], [-0.55, 0.15]]) rrect(ctx, cx + s * dx, cy + s * dy, s * 0.4, s * 0.4, s * 0.06), ctx.stroke();
      ctx.fillRect(cx + s * 0.2, cy + s * 0.2, s * 0.35, s * 0.35); break;
    case "chev":
      ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy - s * 0.2); ctx.lineTo(cx, cy + s * 0.3); ctx.lineTo(cx + s * 0.5, cy - s * 0.2); ctx.stroke(); break;
    case "cross":
      ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy - s * 0.5); ctx.lineTo(cx + s * 0.5, cy + s * 0.5); ctx.moveTo(cx + s * 0.5, cy - s * 0.5); ctx.lineTo(cx - s * 0.5, cy + s * 0.5); ctx.stroke(); break;
    case "warn":
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.72); ctx.lineTo(cx + s * 0.8, cy + s * 0.58); ctx.lineTo(cx - s * 0.8, cy + s * 0.58); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.2); ctx.lineTo(cx, cy + s * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.4, s * 0.06, 0, 7); ctx.fill(); break;
    case "clock":
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.75, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.4); ctx.lineTo(cx, cy); ctx.lineTo(cx + s * 0.3, cy + s * 0.2); ctx.stroke(); break;
    case "user":
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.25, s * 0.3, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.8, s * 0.72, Math.PI * 1.17, Math.PI * 1.83); ctx.stroke(); break;
    case "edit":
      ctx.beginPath(); ctx.moveTo(cx - s * 0.6, cy + s * 0.6); ctx.lineTo(cx - s * 0.55, cy + s * 0.2); ctx.lineTo(cx + s * 0.2, cy - s * 0.55); ctx.lineTo(cx + s * 0.6, cy - s * 0.15); ctx.lineTo(cx - s * 0.15, cy + s * 0.6); ctx.closePath(); ctx.stroke(); break;
    case "bank":
      ctx.beginPath(); ctx.moveTo(cx - s * 0.75, cy - s * 0.2); ctx.lineTo(cx, cy - s * 0.72); ctx.lineTo(cx + s * 0.75, cy - s * 0.2); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.75, cy + s * 0.65); ctx.lineTo(cx + s * 0.75, cy + s * 0.65); ctx.stroke();
      for (const dx of [-0.42, 0, 0.42]) { ctx.beginPath(); ctx.moveTo(cx + s * dx, cy - s * 0.02); ctx.lineTo(cx + s * dx, cy + s * 0.5); ctx.stroke(); } break;
    case "image":
      rrect(ctx, cx - s * 0.7, cy - s * 0.55, s * 1.4, s * 1.1, s * 0.14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.6, cy + s * 0.4); ctx.lineTo(cx - s * 0.15, cy - s * 0.05); ctx.lineTo(cx + s * 0.15, cy + s * 0.25); ctx.lineTo(cx + s * 0.35, cy + s * 0.05); ctx.lineTo(cx + s * 0.62, cy + s * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + s * 0.35, cy - s * 0.25, s * 0.09, 0, 7); ctx.fill(); break;
    case "hash":
      for (const dx of [-0.2, 0.25]) { ctx.beginPath(); ctx.moveTo(cx + s * dx + s * 0.1, cy - s * 0.65); ctx.lineTo(cx + s * dx - s * 0.1, cy + s * 0.65); ctx.stroke(); }
      for (const dy of [-0.22, 0.25]) { ctx.beginPath(); ctx.moveTo(cx - s * 0.62, cy + s * dy); ctx.lineTo(cx + s * 0.62, cy + s * dy); ctx.stroke(); } break;
    case "send":
      ctx.beginPath(); ctx.moveTo(cx - s * 0.72, cy - s * 0.1); ctx.lineTo(cx + s * 0.72, cy - s * 0.62); ctx.lineTo(cx + s * 0.12, cy + s * 0.65); ctx.lineTo(cx - s * 0.04, cy + s * 0.12); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.04, cy + s * 0.12); ctx.lineTo(cx + s * 0.72, cy - s * 0.62); ctx.stroke(); break;
    case "skip":
      for (const dx of [-0.35, 0.2]) { ctx.beginPath(); ctx.moveTo(cx + s * dx, cy - s * 0.45); ctx.lineTo(cx + s * (dx + 0.45), cy); ctx.lineTo(cx + s * dx, cy + s * 0.45); ctx.stroke(); } break;
    case "coin": coin(ctx, cx, cy, s * 0.8); break;
    case "heart":
      ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.65); ctx.bezierCurveTo(cx - s * 1.1, cy - s * 0.1, cx - s * 0.5, cy - s * 0.9, cx, cy - s * 0.3); ctx.bezierCurveTo(cx + s * 0.5, cy - s * 0.9, cx + s * 1.1, cy - s * 0.1, cx, cy + s * 0.65); ctx.stroke(); break;
    default: break;
  }
  ctx.restore();
}

/** Nút tròn có biểu tượng bên trong (kính + viền neon) */
function badge(ctx, kind, cx, cy, r, color, { fill = 0.18, grad = false } = {}) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (grad) {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, rgba(color, 0.95)); g.addColorStop(1, rgba(mixHex(color, "#000000", 0.35), 0.95));
    ctx.fillStyle = g; ctx.shadowColor = color; ctx.shadowBlur = r * 0.5; ctx.fill();
    ctx.restore();
    glyph(ctx, kind, cx, cy, r * 0.5, "#FFFFFF");
    return;
  }
  ctx.fillStyle = rgba(color, fill); ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  glowStroke(ctx, rgba(color, 0.9), 1.8, 10);
  glyph(ctx, kind, cx, cy, r * 0.5, color);
}

function emblem(ctx, th, cx, cy, r, label, { plate = true } = {}) {
  ctx.save();
  if (plate) {
    rrect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.36);
    ctx.fillStyle = "rgba(255,255,255,0.96)"; ctx.shadowColor = th.a; ctx.shadowBlur = r * 0.45; ctx.fill();
    ctx.shadowBlur = 0;
  }
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, th.a); g.addColorStop(1, th.b);
  ctx.fillStyle = g;
  const k = r * 0.62;
  ctx.beginPath();
  if (th.emblem === "shield") {
    ctx.moveTo(cx - k, cy - k * 0.8); ctx.lineTo(cx + k, cy - k * 0.8); ctx.lineTo(cx + k, cy + k * 0.1);
    ctx.quadraticCurveTo(cx + k, cy + k * 0.8, cx, cy + k * 1.05); ctx.quadraticCurveTo(cx - k, cy + k * 0.8, cx - k, cy + k * 0.1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = plate ? "#FFFFFF" : "rgba(0,0,0,0.35)"; ctx.lineWidth = r * 0.16; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(cx - k * 0.5, cy - k * 0.35); ctx.lineTo(cx, cy + k * 0.5); ctx.lineTo(cx + k * 0.5, cy - k * 0.35); ctx.stroke();
  } else if (th.emblem === "flower") {
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * k * 0.55, cy + Math.sin(a) * k * 0.55, k * 0.42, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx, cy, k * 0.22, 0, Math.PI * 2); ctx.fillStyle = plate ? "#FFFFFF" : "rgba(0,0,0,0.4)"; ctx.fill();
  } else if (th.emblem === "star") {
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? k * 0.45 : k * 1.05; const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath(); ctx.fill();
  } else {
    ctx.moveTo(cx - k, cy - k * 0.8); ctx.lineTo(cx + k, cy - k * 0.8); ctx.lineTo(cx, cy + k * 0.95); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - k * 0.45, cy - k * 0.8); ctx.lineTo(cx, cy - k * 0.1); ctx.lineTo(cx + k * 0.45, cy - k * 0.8); ctx.closePath();
    ctx.fillStyle = plate ? "#FFFFFF" : "rgba(0,0,0,0.35)"; ctx.fill();
  }
  ctx.restore();
}

function avatar(ctx, name, cx, cy, r, th, seed = 0) {
  const cols = [th.a, th.b, "#8B5CFF", "#FF7AC6", "#FFB02E", "#2DD4BF"];
  const c = cols[(hashStr(name) + seed) % cols.length];
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, mixHex(c, "#FFFFFF", 0.25)); g.addColorStop(1, mixHex(c, "#000000", 0.4));
  ctx.fillStyle = g; ctx.shadowColor = c; ctx.shadowBlur = r * 0.4; ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 2; ctx.stroke();
  text(ctx, initialsOf(name), cx, cy + r * 0.3, { weight: 800, size: r * 0.85, color: "#FFFFFF", align: "center" });
}

// ---------- bố cục dùng chung ----------
function header(ctx, th, bankName, sub) {
  const brand = String(bankName || "Ngân hàng ảo");
  let size = 66;
  ctx.font = font(800, size);
  while (size > 34 && ctx.measureText(brand).width > 520) { size -= 4; ctx.font = font(800, size); }
  text(ctx, brand, PAD + 16, 112, { weight: 800, size, glow: 14 });
  text(ctx, sub ?? th.full, PAD + 16, 150, { weight: 400, size: 22, color: T.sub, maxW: 560 });
  const [t1, t2] = th.tag || ["", ""];
  if (t1) text(ctx, t1, W - PAD - 10, 92, { weight: 600, size: 26, color: "#DCE6FF", align: "right", italic: true });
  if (t2) text(ctx, t2, W - PAD - 10, 126, { weight: 600, size: 26, color: "#DCE6FF", align: "right", italic: true });
}

function pill(ctx, th, x, y, label, kind = "list", w) {
  ctx.save(); ctx.font = font(800, 25);
  const pw = w ?? ctx.measureText(label).width + 110;
  ctx.restore();
  glass(ctx, x, y, pw, 70, th, { r: 35, alpha: 0.45, fillA: 0.1 });
  rrect(ctx, x + 14, y + 14, 42, 42, 12);
  ctx.fillStyle = rgba(th.a, 0.22); ctx.fill();
  glyph(ctx, kind, x + 35, y + 35, 14, th.a, 2.2);
  text(ctx, label, x + 74, y + 45, { weight: 800, size: 25, color: "#FFFFFF" });
  return pw;
}

/** Hộp lưu ý cuối thẻ: biểu tượng + 1-2 dòng chữ in hoa */
function notice(ctx, th, y, lines, { kind = "info", color = T.gold, x = PAD, w = W - PAD * 2 } = {}) {
  const h = 52 + lines.length * 34;
  glass(ctx, x, y, w, h, th, { r: 30, tint: color === T.gold ? th.a : color, alpha: 0.5, fillA: 0.09 });
  if (kind === "info") {
    ctx.beginPath(); ctx.arc(x + 62, y + h / 2, 24, 0, Math.PI * 2); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
    glyph(ctx, "info", x + 62, y + h / 2 + 1, 17, "#1A1200", 4);
  } else {
    glyph(ctx, kind, x + 62, y + h / 2, 26, color, 3);
  }
  const top = y + h / 2 - ((lines.length - 1) * 34) / 2 + 8;
  lines.forEach((l, i) => text(ctx, l, x + 112, top + i * 34, { weight: 700, size: 22, color: "#F2F6FF", maxW: w - 150 }));
  return y + h;
}

/** Số tiền + xu vàng, căn phải tại xRight */
function moneyRight(ctx, value, xRight, y, { size = 30, color = T.text, sign = "" } = {}) {
  const r = size * 0.5;
  coin(ctx, xRight - r, y - size * 0.34, r);
  text(ctx, `${sign}${money(value)}`, xRight - r * 2 - 12, y, { weight: 800, size, color, align: "right", maxW: 420 });
}

/** Danh sách "nhãn · giá trị" trong khung kính. Mỗi dòng: {l, v, kind: text|money|status|party|bank, color} */
function table(ctx, th, x, y, w, rows, { rowH = 84, padX = 36 } = {}) {
  const h = rows.length * rowH + 20;
  glass(ctx, x, y, w, h, th, { r: 30, alpha: 0.45, fillA: 0.06 });
  rows.forEach((r, i) => {
    const cy = y + 10 + i * rowH + rowH / 2 + 9;
    text(ctx, r.l, x + padX, cy, { weight: 400, size: 25, color: T.sub, maxW: 300 });
    const xr = x + w - padX;
    if (r.kind === "money") moneyRight(ctx, r.v, xr, cy, { size: r.size || 30, color: r.color || T.text, sign: r.sign || "" });
    else if (r.kind === "status") {
      text(ctx, r.v, xr, cy, { weight: 700, size: 27, color: r.color || T.ok, align: "right", maxW: 360 });
      ctx.save(); ctx.font = font(700, 27); const tw = Math.min(ctx.measureText(r.v).width, 360); ctx.restore();
      ctx.beginPath(); ctx.arc(xr - tw - 30, cy - 9, 15, 0, 7); ctx.fillStyle = r.color || T.ok; ctx.fill();
      glyph(ctx, "check", xr - tw - 30, cy - 9, 15, "#05140C", 3);
    } else if (r.kind === "party") {
      text(ctx, r.v, xr, cy, { weight: 700, size: 27, align: "right", maxW: 360 });
      ctx.save(); ctx.font = font(700, 27); const tw = Math.min(ctx.measureText(r.v).width, 360); ctx.restore();
      avatar(ctx, r.v, xr - tw - 38, cy - 9, 26, th, i);
    } else if (r.kind === "bank") {
      text(ctx, r.v, xr, cy, { weight: 700, size: 27, align: "right", maxW: 360 });
      ctx.save(); ctx.font = font(700, 27); const tw = Math.min(ctx.measureText(r.v).width, 360); ctx.restore();
      emblem(ctx, th, xr - tw - 38, cy - 9, 24, "", { plate: true });
    } else text(ctx, r.v, xr, cy, { weight: r.bold === false ? 400 : 700, size: r.size || 27, color: r.color || T.text, align: "right", maxW: w - padX * 2 - 300 });
    if (i < rows.length - 1) divider(ctx, x + padX - 8, x + w - padX + 8, y + 10 + (i + 1) * rowH);
  });
  return y + h;
}

function heroCheck(ctx, th, cx, cy, r = 62, color = T.ok) {
  spot(ctx, cx, cy, r * 3, color, 0.28);
  for (const [k, a] of [[1.55, 0.18], [1.28, 0.32]]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, Math.PI * 2); ctx.strokeStyle = rgba(color, a); ctx.lineWidth = 2; ctx.stroke(); }
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, rgba(color, 0.35)); g.addColorStop(1, rgba(color, 0.08));
  ctx.fillStyle = g; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  glowStroke(ctx, color, 4, 22);
  glyph(ctx, "check", cx, cy, r * 0.55, "#FFFFFF", 9);
}

// ---------- 1. Thẻ tài khoản ----------
function skyline(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.strokeStyle = rgba(color, 0.28); ctx.lineWidth = 2; ctx.lineJoin = "round";
  const bars = [[0.00, 0.30], [0.10, 0.55], [0.22, 0.38], [0.34, 0.80], [0.46, 0.50], [0.60, 0.95], [0.72, 0.62], [0.86, 0.42]];
  bars.forEach(([bx, bh], i) => {
    const bw = w * 0.1, px = x + bx * w, ph = h * bh;
    ctx.beginPath(); ctx.rect(px, y + h - ph, bw, ph); ctx.stroke();
    if (i % 2 === 0) { ctx.beginPath(); ctx.moveTo(px + bw / 2, y + h - ph); ctx.lineTo(px + bw / 2, y + h - ph - h * 0.12); ctx.stroke(); }
    for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(px + 5, y + h - ph + k * (ph / 5)); ctx.lineTo(px + bw - 5, y + h - ph + k * (ph / 5)); ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1; }
  });
  ctx.restore();
}

export function renderAccountCard(data = {}) {
  const { accountName = "Người chơi", accountNumber = "", bankName = "Ngân hàng ảo", phoneNumber = "", balance = 0, accountId = "" } = data;
  const th = resolveTheme(bankName);
  const H = 1500;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, th);
  header(ctx, th, bankName);
  pill(ctx, th, PAD + 8, 196, "TÀI KHOẢN NGÂN HÀNG ẢO", "wallet");

  // thẻ chính
  const x = PAD, y = 300, w = W - PAD * 2, h = 520;
  ctx.save(); ctx.shadowColor = rgba(th.a, 0.45); ctx.shadowBlur = 40; rrect(ctx, x, y, w, h, 40); ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fill(); ctx.restore();
  glass(ctx, x, y, w, h, th, { r: 40, alpha: 0.9, strong: true });
  ctx.save(); rrect(ctx, x, y, w, h, 40); ctx.clip();
  skyline(ctx, x + w * 0.46, y + 60, w * 0.5, h * 0.55, th.a);
  spot(ctx, x + w * 0.85, y + 90, 300, th.b, 0.22);
  ctx.restore();

  emblem(ctx, th, x + 100, y + 100, 56, shortOf(bankName));
  text(ctx, String(bankName), x + 184, y + 112, { weight: 800, size: 46, maxW: 420, glow: 8 });
  text(ctx, "PREMIUM", x + w - 44, y + 78, { weight: 700, size: 22, color: rgba("#FFFFFF", 0.7), align: "right" });

  text(ctx, "Chủ tài khoản", x + 48, y + 228, { weight: 400, size: 24, color: "rgba(255,255,255,0.72)" });
  text(ctx, String(accountName), x + 48, y + 286, { weight: 800, size: 52, maxW: w - 96, glow: 6 });

  divider(ctx, x + 40, x + w - 40, y + 330);
  const colW = 470;
  text(ctx, "Số tài khoản", x + 48, y + 384, { weight: 400, size: 24, color: "rgba(255,255,255,0.72)" });
  { let size = 52; const num = groupAcc(accountNumber); ctx.font = font(800, size);
    while (size > 28 && ctx.measureText(num).width > colW - 20) { size -= 2; ctx.font = font(800, size); }
    text(ctx, num, x + 48, y + 450, { weight: 800, size, glow: 8 }); }
  text(ctx, "Số điện thoại", x + 48 + colW + 30, y + 384, { weight: 400, size: 24, color: "rgba(255,255,255,0.72)" });
  const ph = maskPhone(phoneNumber);
  { const px0 = x + 48 + colW + 30, room = w - 48 - colW - 30 - (phoneNumber ? 80 : 40); let size = 40; ctx.font = font(800, size);
    while (size > 22 && ctx.measureText(ph).width > room) { size -= 2; ctx.font = font(800, size); }
    text(ctx, ph, px0, y + 450, { weight: 800, size, maxW: room }); }
  if (phoneNumber) glyph(ctx, "phone", x + w - 60, y + 436, 22, T.ok, 3);

  // số dư
  const by = 860, bh = 250;
  glass(ctx, PAD, by, W - PAD * 2, bh, th, { r: 36, tint: th.a, alpha: 0.7, fillA: 0.09 });
  badge(ctx, "wallet", PAD + 98, by + 100, 54, th.a, { grad: true });
  text(ctx, "Số dư tiền game", PAD + 186, by + 92, { weight: 600, size: 28, color: T.sub });
  const abbreviated = Math.abs(Number(balance)) >= 1e9;
  { const shown = abbreviated ? displayMoney(balance) : money(balance);
    let size = 104; ctx.font = font(800, size);
    while (size > 40 && ctx.measureText(shown).width > 470) { size -= 4; ctx.font = font(800, size); }
    const tw = ctx.measureText(shown).width;
    text(ctx, shown, PAD + 186, by + 190, { weight: 800, size, color: "#FFFFFF", glow: 12 });
    coin(ctx, PAD + 186 + tw + 50, by + 190 - size * 0.34, 34); }
  if (abbreviated) text(ctx, `${money(balance)} xu`, W - PAD - 44, by + 214, { weight: 600, size: 22, color: T.sub, align: "right", maxW: 360 });

  // mã tài khoản
  const iy = 1150;
  glass(ctx, PAD, iy, W - PAD * 2, 130, th, { r: 32, alpha: 0.5, fillA: 0.06 });
  text(ctx, "Mã tài khoản STK", PAD + 44, iy + 52, { weight: 400, size: 24, color: T.sub });
  text(ctx, String(accountId), PAD + 44, iy + 102, { weight: 800, size: 36, maxW: W - PAD * 2 - 160, glow: 4 });
  glyph(ctx, "copy", W - PAD - 70, iy + 85, 24, T.sub, 3);

  notice(ctx, th, 1310, ["SỐ DƯ LÀ TIỀN GAME,", "KHÔNG PHẢI TIỀN GỬI NGÂN HÀNG"]);
  return canvas.toBuffer("image/png");
}

// ---------- 2. Chuyển tiền thành công ----------
function partyBlock(ctx, th, x, y, w, label, p, bankName, seed) {
  text(ctx, label, x, y + 24, { weight: 600, size: 22, color: T.sub });
  avatar(ctx, p.name || "?", x + 34, y + 86, 34, th, seed);
  text(ctx, p.name || "", x + 86, y + 84, { weight: 800, size: 27, maxW: w - 90 });
  text(ctx, p.accountNumber || "", x + 86, y + 120, { weight: 400, size: 23, color: T.sub, maxW: w - 90 });
  ctx.save(); ctx.font = font(700, 22); const bw = Math.min(ctx.measureText(bankName).width, w - 120); ctx.restore();
  text(ctx, bankName, x + 86, y + 154, { weight: 700, size: 22, color: "#FFFFFF", maxW: w - 120 });
  ctx.beginPath(); ctx.arc(x + 86 + bw + 16, y + 147, 6, 0, 7); ctx.strokeStyle = th.a; ctx.lineWidth = 2.5; ctx.stroke();
}

export function renderTransferBill(data = {}) {
  const { from = {}, to = {}, amount = 0, referenceId = "", time = "", senderBalanceAfter = 0, bankName = "Ngân hàng ảo" } = data;
  const th = resolveTheme(bankName);
  const H = 1500;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, th);
  header(ctx, th, bankName);
  heroCheck(ctx, th, W / 2, 300);
  text(ctx, "CHUYỂN TIỀN THÀNH CÔNG", W / 2, 440, { weight: 800, size: 50, align: "center", maxW: W - 100, glow: 12 });
  text(ctx, "Giao dịch đã được xử lý hoàn tất", W / 2, 488, { weight: 400, size: 26, color: T.sub, align: "center" });

  const y = 535, h = 210, w = W - PAD * 2;
  glass(ctx, PAD, y, w, h, th, { r: 30, alpha: 0.5, fillA: 0.08 });
  const half = w / 2;
  partyBlock(ctx, th, PAD + 34, y + 28, half - 50, "Từ tài khoản", from, bankName, 0);
  ctx.fillStyle = T.line; ctx.fillRect(PAD + half, y + 26, 1.5, h - 52);
  partyBlock(ctx, th, PAD + half + 34, y + 28, half - 50, "Đến tài khoản", to, bankName, 3);

  const ty = table(ctx, th, PAD, y + h + 24, w, [
    { l: "Số tiền chuyển", v: amount, kind: "money", size: 32 },
    { l: "Phí giao dịch", v: 0, kind: "money", size: 30 },
    { l: "Mã giao dịch", v: referenceId, kind: "text" },
    { l: "Thời gian", v: time, kind: "text" },
    { l: "Số dư sau giao dịch", v: senderBalanceAfter, kind: "money", size: 32 },
  ]);
  notice(ctx, th, ty + 30, ["GIAO DỊCH TIỀN GAME — KHÔNG PHẢI", "CHUYỂN KHOẢN NGÂN HÀNG THẬT"], { color: th.a });
  return canvas.toBuffer("image/png");
}

// ---------- 3. Nhận tiền ----------
function plane(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.25);
  ctx.fillStyle = rgba(color, 0.85); ctx.shadowColor = color; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, -s * 0.28); ctx.lineTo(s * 0.36, s * 0.12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba("#FFFFFF", 0.5);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.36, s * 0.12); ctx.lineTo(s * 0.3, s * 0.4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function renderReceiveBill(data = {}) {
  const { receiverName = "", senderName = "", amount = 0, referenceId = "", time = "", balanceAfter = 0, bankName = "Ngân hàng ảo" } = data;
  const th = resolveTheme(bankName);
  const H = 1450;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, th);
  header(ctx, th, bankName);

  const x = PAD, y = 200, w = W - PAD * 2, h = 380;
  ctx.save(); ctx.shadowColor = rgba(th.a, 0.4); ctx.shadowBlur = 34; rrect(ctx, x, y, w, h, 40); ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fill(); ctx.restore();
  glass(ctx, x, y, w, h, th, { r: 40, alpha: 0.85, strong: true });
  ctx.save(); rrect(ctx, x, y, w, h, 40); ctx.clip(); spot(ctx, x + w - 80, y + 40, 280, th.b, 0.28); ctx.restore();
  plane(ctx, x + w - 190, y + 34, 130, th.a);

  emblem(ctx, th, x + 100, y + 104, 54, shortOf(bankName));
  text(ctx, "Bạn vừa nhận được tiền!", x + 184, y + 118, { weight: 800, size: 36, maxW: w - 380 });

  { const val = `+ ${money(amount)}`; let size = 108; ctx.font = font(800, size);
    while (size > 44 && ctx.measureText(val).width > w - 240) { size -= 4; ctx.font = font(800, size); }
    const tw = ctx.measureText(val).width, total = tw + 30 + size * 0.7, sx = x + w / 2 - total / 2;
    text(ctx, val, sx, y + 262, { weight: 800, size, color: "#FFFFFF", glow: 18 });
    coin(ctx, sx + tw + 30 + size * 0.35, y + 262 - size * 0.34, size * 0.35); }
  text(ctx, "Tiền game", x + w / 2, y + 328, { weight: 600, size: 28, color: T.sub, align: "center" });

  const ty = table(ctx, th, PAD, y + h + 28, w, [
    { l: "Người nhận", v: receiverName || "—", kind: "party" },
    { l: "Ngân hàng", v: bankName, kind: "bank" },
    { l: "Người chuyển", v: senderName || "—", kind: "party" },
    { l: "Mã giao dịch", v: referenceId, kind: "text" },
    { l: "Thời gian", v: time, kind: "text" },
    { l: "Số dư sau giao dịch", v: balanceAfter, kind: "money", size: 32 },
  ]);
  notice(ctx, th, ty + 30, ["GIAO DỊCH TIỀN GAME", "KHÔNG PHẢI CHUYỂN KHOẢN NGÂN HÀNG THẬT"], { kind: "gift", color: th.a });
  return canvas.toBuffer("image/png");
}

// ---------- 4. Hóa đơn thanh toán dịch vụ ----------
export function renderPaymentBill(data = {}) {
  const { serviceName = "Dịch vụ", description = "", payerName = "", amount = 0, orderId = "", time = "", status = "THÀNH CÔNG", balanceAfter = 0, bankName = "Ngân hàng ảo" } = data;
  const th = resolveTheme(bankName);
  const H = 1290;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, th);
  header(ctx, th, bankName);
  pill(ctx, th, PAD + 8, 196, "HÓA ĐƠN THANH TOÁN DỊCH VỤ", "list");

  const w = W - PAD * 2, y = 296, h = 712;
  glass(ctx, PAD, y, w, h, th, { r: 38, alpha: 0.85, strong: true });
  ctx.save(); rrect(ctx, PAD, y, w, h, 38); ctx.clip(); spot(ctx, PAD + w - 40, y + 20, 340, th.b, 0.25); ctx.restore();

  // ô dịch vụ
  glass(ctx, PAD + 22, y + 22, w - 44, 168, th, { r: 28, alpha: 0.5, fillA: 0.1 });
  rrect(ctx, PAD + 48, y + 50, 112, 112, 28);
  { const g = ctx.createLinearGradient(PAD + 48, y + 50, PAD + 160, y + 162); g.addColorStop(0, th.a); g.addColorStop(1, mixHex(th.b, "#000000", 0.3)); ctx.save(); ctx.shadowColor = th.a; ctx.shadowBlur = 20; ctx.fillStyle = g; ctx.fill(); ctx.restore(); }
  glyph(ctx, "gamepad", PAD + 104, y + 106, 46, "#FFFFFF", 5);
  text(ctx, "Dịch vụ", PAD + 190, y + 84, { weight: 400, size: 24, color: T.sub });
  text(ctx, serviceName, PAD + 190, y + 130, { weight: 800, size: 38, maxW: w - 250, glow: 6 });
  text(ctx, description, PAD + 190, y + 168, { weight: 400, size: 23, color: T.sub, maxW: w - 250 });

  const statusText = /thành công|thanh cong/i.test(status) ? "Thanh toán thành công" : status;
  const rows = [
    { l: "Người thanh toán", v: payerName || "—", kind: "party" },
    { l: "Số tiền bị trừ", v: amount, kind: "money", size: 32 },
    { l: "Mã đơn hàng", v: orderId, kind: "text" },
    { l: "Thời gian", v: time, kind: "text" },
    { l: "Trạng thái", v: statusText, kind: "status", color: /thành công|thanh cong/i.test(status) ? T.ok : T.gold },
    { l: "Số dư sau thanh toán", v: balanceAfter, kind: "money", size: 32 },
  ];
  // bảng nằm trong khung kính lớn (không vẽ khung thứ hai)
  const rowH = 80, top = y + 205;
  rows.forEach((r, i) => {
    const cy = top + i * rowH + rowH / 2 + 8; const xr = PAD + w - 40;
    text(ctx, r.l, PAD + 44, cy, { weight: 400, size: 25, color: T.sub, maxW: 300 });
    if (r.kind === "money") moneyRight(ctx, r.v, xr, cy, { size: r.size, color: "#FFFFFF" });
    else if (r.kind === "party") { text(ctx, r.v, xr, cy, { weight: 700, size: 27, align: "right", maxW: 360 }); ctx.save(); ctx.font = font(700, 27); const tw = Math.min(ctx.measureText(r.v).width, 360); ctx.restore(); avatar(ctx, r.v, xr - tw - 38, cy - 9, 26, th, 1); }
    else if (r.kind === "status") { text(ctx, r.v, xr, cy, { weight: 700, size: 27, color: r.color, align: "right", maxW: 380 }); ctx.save(); ctx.font = font(700, 27); const tw = Math.min(ctx.measureText(r.v).width, 380); ctx.restore(); ctx.beginPath(); ctx.arc(xr - tw - 30, cy - 9, 15, 0, 7); ctx.fillStyle = r.color; ctx.fill(); glyph(ctx, "check", xr - tw - 30, cy - 9, 15, "#05140C", 3); }
    else text(ctx, r.v, xr, cy, { weight: 700, size: 27, align: "right", maxW: w - 400 });
    if (i < rows.length - 1) divider(ctx, PAD + 36, PAD + w - 36, top + (i + 1) * rowH);
  });
  notice(ctx, th, y + h + 30, ["HÓA ĐƠN NỘI BỘ CỦA HỆ THỐNG TIỀN GAME", "KHÔNG PHẢI HÓA ĐƠN THANH TOÁN THẬT"], { color: th.a });
  return canvas.toBuffer("image/png");
}

// ---------- 5. Lịch sử giao dịch ----------
function historyKind(label) {
  const l = String(label || "");
  if (l.startsWith("Chuyển")) return { glyph: "out", color: "#22C97E", sub: (c) => (c ? `Gửi cho ${c}` : "") };
  if (l.startsWith("Nhận") || l.startsWith("Hoàn")) return { glyph: "swap", color: "#8B5CFF", sub: (c) => (c ? `Từ ${c}` : "") };
  if (l.startsWith("Thanh toán")) return { glyph: "gamepad", color: "#3D7BFF", sub: (c) => c || "" };
  return { glyph: "swap", color: "#22D3EE", sub: (c) => c || "" };
}

export function renderHistoryCard(data = {}) {
  const { accountName = "", page = 1, totalPages = 1, total = 0, items = [], bankName = "Ngân hàng ảo" } = data;
  const th = resolveTheme(bankName);
  const ROW = 132;
  const listTop = 270;
  const hasMore = page < totalPages;
  const listH = Math.max(1, items.length) * ROW + 30 + (hasMore ? 90 : 0);
  const H = listTop + listH + 60;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, th);

  badge(ctx, "list", PAD + 52, 108, 36, th.a, { fill: 0.2 });
  text(ctx, "LỊCH SỬ GIAO DỊCH", PAD + 112, 118, { weight: 800, size: 46, glow: 10 });
  text(ctx, `${items.length} giao dịch gần nhất  •  Trang ${page}/${totalPages}`, PAD + 112, 160, { weight: 400, size: 25, color: T.sub });
  text(ctx, String(accountName), W - PAD - 10, 118, { weight: 700, size: 26, color: th.a, align: "right", maxW: 340 });
  text(ctx, `${total} giao dịch`, W - PAD - 10, 156, { weight: 400, size: 22, color: T.sub, align: "right" });

  const w = W - PAD * 2;
  glass(ctx, PAD, listTop, w, listH, th, { r: 36, alpha: 0.55, fillA: 0.06 });
  if (!items.length) text(ctx, "Chưa có giao dịch nào.", W / 2, listTop + 110, { weight: 600, size: 32, color: T.sub, align: "center" });
  items.forEach((it, i) => {
    const y = listTop + 15 + i * ROW, cy = y + ROW / 2 - 4;
    const k = historyKind(it.label);
    const out = it.signed < 0;
    badge(ctx, k.glyph, PAD + 84, cy, 42, k.color, { grad: true });
    text(ctx, it.label, PAD + 150, cy - 10, { weight: 800, size: 30, maxW: 400 });
    const sub = k.sub(it.counterparty);
    if (sub) text(ctx, sub, PAD + 150, cy + 22, { weight: 400, size: 24, color: T.sub, maxW: 400 });
    text(ctx, it.time, PAD + 150, cy + (sub ? 54 : 24), { weight: 400, size: 22, color: T.dim });
    const xr = PAD + w - 40, color = out ? T.bad : T.ok;
    coin(ctx, xr - 15, cy - 20, 15);
    text(ctx, signedMoney(it.signed), xr - 42, cy - 8, { weight: 800, size: 32, color, align: "right", maxW: 300, glow: 6 });
    text(ctx, it.ref, xr, cy + 38, { weight: 400, size: 21, color: T.dim, align: "right", maxW: 330 });
    if (i < items.length - 1) divider(ctx, PAD + 40, PAD + w - 40, y + ROW - 2);
  });
  if (hasMore) {
    const by = listTop + 15 + items.length * ROW + 14;
    glass(ctx, W / 2 - 150, by, 300, 62, th, { r: 31, alpha: 0.5, fillA: 0.08 });
    text(ctx, "Xem thêm", W / 2 - 14, by + 40, { weight: 700, size: 24, color: "#DCE6FF", align: "center" });
    glyph(ctx, "chev", W / 2 + 70, by + 29, 14, "#DCE6FF", 3);
  }
  return canvas.toBuffer("image/png");
}

// ---------- 6. Thẻ QR nhận tiền ----------
export async function renderQrCard(data = {}) {
  const { accountName = "", accountNumber = "", bankName = "Ngân hàng ảo", qrBuffer } = data;
  if (!qrBuffer) throw new Error("Thiếu dữ liệu QR.");
  const th = resolveTheme(bankName);
  const H = 1450;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, th);
  header(ctx, th, bankName);
  pill(ctx, th, PAD + 8, 196, "MÃ QR NHẬN TIỀN", "qr");

  const qrImage = await loadImage(qrBuffer);
  const panel = 560, px = (W - panel) / 2, py = 320;
  spot(ctx, W / 2, py + panel / 2, 440, th.a, 0.3);
  ctx.save(); ctx.shadowColor = th.a; ctx.shadowBlur = 46; rrect(ctx, px, py, panel, panel, 40); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.restore();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrImage, px + 40, py + 40, panel - 80, panel - 80);
  ctx.save(); ctx.strokeStyle = th.a; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.shadowColor = th.a; ctx.shadowBlur = 16;
  const m = 24, L = 64;
  for (const [sx, sy, dx, dy] of [[px - m, py - m, 1, 1], [px + panel + m, py - m, -1, 1], [px - m, py + panel + m, 1, -1], [px + panel + m, py + panel + m, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(sx, sy + dy * L); ctx.lineTo(sx, sy); ctx.lineTo(sx + dx * L, sy); ctx.stroke();
  }
  ctx.restore();

  text(ctx, String(accountName), W / 2, 960, { weight: 800, size: 46, align: "center", maxW: W - PAD * 2, glow: 10 });
  text(ctx, `${accountNumber}  •  ${bankName}`, W / 2, 1008, { weight: 600, size: 28, color: th.a, align: "center", maxW: W - PAD * 2 });
  glass(ctx, PAD, 1050, W - PAD * 2, 180, th, { r: 30, alpha: 0.45 });
  [["1", "Người chuyển mở lệnh .vbank bankqr"], ["2", "Gửi ảnh QR này vào cuộc trò chuyện"], ["3", "Nhập số tiền và xác nhận để hoàn tất"]].forEach(([n, t], i) => {
    const y = 1110 + i * 50;
    ctx.beginPath(); ctx.arc(PAD + 56, y - 8, 17, 0, Math.PI * 2); ctx.fillStyle = rgba(th.a, 0.22); ctx.fill();
    text(ctx, n, PAD + 56, y, { weight: 800, size: 21, color: th.a, align: "center" });
    text(ctx, t, PAD + 94, y, { weight: 600, size: 25, maxW: W - PAD * 2 - 130 });
  });
  notice(ctx, th, 1260, ["QR DÙNG CHO HỆ THỐNG TIỀN GAME CỦA BOT", "KHÔNG PHẢI MÃ QR THANH TOÁN NGÂN HÀNG THẬT"], { color: th.a });
  return canvas.toBuffer("image/png");
}


// =====================================================================
//  CÁC THẺ THÔNG BÁO / MENU (thay toàn bộ tin nhắn chữ của VBANK)
// =====================================================================
const VB_THEME = { ...NEUTRAL, full: "Ngân hàng ảo tiền game", tag: ["Giao dịch", "an toàn"] };
const KINDS = {
  ok: { c: T.ok, g: "check", t: "THÀNH CÔNG" },
  err: { c: T.bad, g: "cross", t: "CÓ LỖI XẢY RA" },
  warn: { c: T.gold, g: "warn", t: "LƯU Ý" },
  info: { c: null, g: "info", t: "THÔNG BÁO VBANK" },
  ask: { c: null, g: "edit", t: "NHẬP THÔNG TIN" },
  cancel: { c: "#FF8A5C", g: "cross", t: "ĐÃ HỦY THAO TÁC" },
  wait: { c: T.gold, g: "clock", t: "PHIÊN ĐÃ HẾT HẠN" },
};
const GLYPH_NAMES = new Set(["check", "out", "swap", "gamepad", "wallet", "copy", "phone", "info", "gift", "list", "qr", "chev", "cross", "warn", "clock", "user", "edit", "bank", "image", "hash", "send", "skip", "coin", "heart"]);

function wrapText(ctx, str, maxW, weight, size) {
  ctx.save(); ctx.font = font(weight, size);
  const out = [];
  for (const para of String(str ?? "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  ctx.restore();
  return out;
}

function heroIcon(ctx, cx, cy, r, color, kind) {
  spot(ctx, cx, cy, r * 3, color, 0.26);
  for (const [k, a] of [[1.55, 0.16], [1.28, 0.3]]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, Math.PI * 2); ctx.strokeStyle = rgba(color, a); ctx.lineWidth = 2; ctx.stroke(); }
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, rgba(color, 0.35)); g.addColorStop(1, rgba(color, 0.08));
  ctx.fillStyle = g; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  glowStroke(ctx, color, 4, 22);
  glyph(ctx, kind, cx, cy, r * 0.55, "#FFFFFF", 8);
}

function stepper(ctx, th, y, step) {
  const { index = 1, labels = [] } = step;
  const n = labels.length, x0 = PAD, w = W - PAD * 2, h = 130;
  glass(ctx, x0, y, w, h, th, { r: 34, alpha: 0.4, fillA: 0.06 });
  const inner = w - 120, left = x0 + 60;
  const cxOf = (i) => left + (inner * i) / Math.max(1, n - 1);
  for (let i = 0; i < n - 1; i++) {
    ctx.fillStyle = i < index - 1 ? rgba(th.a, 0.85) : "rgba(170,190,230,0.2)";
    ctx.fillRect(cxOf(i) + 22, y + 44, cxOf(i + 1) - cxOf(i) - 44, 4);
  }
  labels.forEach((lb, i) => {
    const cx = cxOf(i), cy = y + 46, done = i < index - 1, cur = i === index - 1;
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = done ? th.a : cur ? rgba(th.a, 0.25) : "rgba(255,255,255,0.05)";
    if (cur) { ctx.save(); ctx.shadowColor = th.a; ctx.shadowBlur = 18; ctx.fill(); ctx.restore(); } else ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.strokeStyle = done || cur ? th.a : "rgba(170,190,230,0.3)"; ctx.lineWidth = cur ? 3 : 1.6; ctx.stroke();
    if (done) glyph(ctx, "check", cx, cy, 12, "#04140C", 3.4);
    else text(ctx, String(i + 1), cx, cy + 8, { weight: 800, size: 22, color: cur ? "#FFFFFF" : T.dim, align: "center" });
    text(ctx, lb, cx, y + 104, { weight: cur ? 800 : 500, size: 21, color: cur ? "#FFFFFF" : done ? T.sub : T.dim, align: "center", maxW: 150 });
  });
  return y + h;
}

function chipList(ctx, th, y, chips) {
  const w = W - PAD * 2, rowH = 78;
  chips.forEach((c, i) => {
    const cy = y + i * (rowH + 14);
    glass(ctx, PAD, cy, w, rowH, th, { r: 28, alpha: 0.4, fillA: 0.06 });
    ctx.save(); ctx.font = font(800, 26);
    const kw = Math.min(380, ctx.measureText(c.k).width + 48); ctx.restore();
    rrect(ctx, PAD + 24, cy + 14, kw, 50, 14); ctx.fillStyle = rgba(th.a, 0.2); ctx.fill();
    rrect(ctx, PAD + 24, cy + 14, kw, 50, 14); glowStroke(ctx, rgba(th.a, 0.8), 1.4, 6);
    text(ctx, c.k, PAD + 24 + kw / 2, cy + 49, { weight: 800, size: 26, color: "#FFFFFF", align: "center", maxW: kw - 20 });
    text(ctx, `→  ${c.d}`, PAD + 24 + kw + 24, cy + 49, { weight: 600, size: 26, color: "#DCE6FF", maxW: w - kw - 90 });
  });
  return y + chips.length * (rowH + 14) - 14;
}

/**
 * Thẻ thông báo VBANK.
 * d = { kind: ok|err|warn|info|ask|cancel|wait, title, subtitle, lines[], rows[], chips[{k,d}], hint, step{index,labels}, icon, bankName }
 */
export function renderNotice(d = {}) {
  const { kind = "info", title, subtitle, lines = [], rows = [], chips = [], hint, step, icon, bankName = "" } = d;
  const th = bankName ? resolveTheme(bankName) : VB_THEME;
  const K = KINDS[kind] || KINDS.info;
  const color = K.c || th.a;
  const draw = (H) => {
    const { canvas, ctx } = newCanvas(H);
    background(ctx, H, th);
    header(ctx, th, bankName || "VBANK", bankName ? undefined : "Ngân hàng ảo tiền game");
    let y = 196;
    if (step) y = stepper(ctx, th, y, step) + 36;
    else y += 12;
    heroIcon(ctx, W / 2, y + 70, 62, color, icon || K.g);
    y += 190;
    const tl = wrapText(ctx, title || K.t, W - 120, 800, 46).slice(0, 2);
    tl.forEach((l, i) => text(ctx, l, W / 2, y + 30 + i * 56, { weight: 800, size: 46, align: "center", glow: 12, maxW: W - 90 }));
    y += tl.length * 56 + 6;
    if (subtitle) {
      const sl = wrapText(ctx, subtitle, W - 160, 400, 26).slice(0, 3);
      sl.forEach((l, i) => text(ctx, l, W / 2, y + 22 + i * 36, { weight: 400, size: 26, color: T.sub, align: "center" }));
      y += sl.length * 36 + 6;
    }
    y += 26;
    if (lines.length) {
      const inW = W - PAD * 2 - 92, items = [];
      for (const raw of lines) {
        const bullet = /^[•\-]\s+/.test(raw);
        const wl = wrapText(ctx, raw.replace(/^[•\-]\s+/, ""), inW - (bullet ? 34 : 0), 500, 27);
        items.push({ bullet, wl });
      }
      const rowsN = items.reduce((a, b) => a + b.wl.length, 0);
      const h = 56 + rowsN * 40 + (items.length - 1) * 12;
      glass(ctx, PAD, y, W - PAD * 2, h, th, { r: 32, alpha: 0.45, fillA: 0.07 });
      let ty = y + 52;
      for (const it of items) {
        if (it.bullet) { ctx.beginPath(); ctx.arc(PAD + 56, ty - 9, 5, 0, 7); ctx.fillStyle = th.a; ctx.fill(); }
        for (const l of it.wl) { text(ctx, l, PAD + 46 + (it.bullet ? 34 : 0), ty, { weight: 500, size: 27, color: "#EAF0FF" }); ty += 40; }
        ty += 12;
      }
      y += h + 26;
    }
    if (rows.length) y = table(ctx, th, PAD, y, W - PAD * 2, rows, { rowH: 78 }) + 26;
    if (chips.length) y = chipList(ctx, th, y, chips) + 28;
    if (hint) y = notice(ctx, th, y, wrapText(ctx, hint, W - PAD * 2 - 170, 700, 22).slice(0, 3), { kind: "info", color: th.a }) + 20;
    return { canvas, end: y };
  };
  const probe = draw(3400);
  const H = Math.max(760, Math.ceil(probe.end + 40));
  return draw(H).canvas.toBuffer("image/png");
}

/**
 * Thẻ menu / danh sách chọn.
 * d = { title, glyph, subtitle, items:[{badge, label, desc, right, bankName}], columns: 1|2, hint, chips, bankName }
 * badge: tên glyph | "emblem" (dùng bankName của mục) | số/chữ
 */
export function renderMenuCard(d = {}) {
  const { title = "VBANK", glyph: g = "list", subtitle, items = [], columns = 1, hint, chips = [], bankName = "" } = d;
  const th = bankName ? resolveTheme(bankName) : VB_THEME;
  const draw = (H) => {
    const { canvas, ctx } = newCanvas(H);
    background(ctx, H, th);
    header(ctx, th, bankName || "VBANK", bankName ? undefined : "Ngân hàng ảo tiền game");
    pill(ctx, th, PAD + 8, 196, title, g);
    let y = 296;
    if (subtitle) { text(ctx, subtitle, PAD + 14, y + 8, { weight: 400, size: 25, color: T.sub, maxW: W - PAD * 2 - 20 }); y += 40; }
    const w = W - PAD * 2, cols = columns, gap = 18, pad = 22;
    const rowH = cols === 2 ? 98 : 112;
    const rowsN = Math.ceil(items.length / cols);
    const h = rowsN * rowH + pad * 2 - (rowsN > 0 ? 0 : 0);
    glass(ctx, PAD, y, w, h, th, { r: 36, alpha: 0.5, fillA: 0.06 });
    const cellW = (w - pad * 2 - gap * (cols - 1)) / cols;
    items.forEach((it, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = PAD + pad + col * (cellW + gap), cy = y + pad + row * rowH + rowH / 2;
      const r = cols === 2 ? 30 : 36, bx = x + r + 12;
      if (it.badge === "emblem") emblem(ctx, resolveTheme(it.bankName || it.label), bx, cy, r - 2, "", { plate: true });
      else if (GLYPH_NAMES.has(it.badge)) badge(ctx, it.badge, bx, cy, r, it.color || th.a, { grad: true });
      else {
        ctx.beginPath(); ctx.arc(bx, cy, r, 0, Math.PI * 2); ctx.fillStyle = rgba(it.color || th.a, 0.2); ctx.fill();
        ctx.beginPath(); ctx.arc(bx, cy, r, 0, Math.PI * 2); glowStroke(ctx, rgba(it.color || th.a, 0.9), 1.8, 8);
        text(ctx, String(it.badge ?? i + 1), bx, cy + r * 0.34, { weight: 800, size: r * 0.95, align: "center", color: "#FFFFFF" });
      }
      const tx = bx + r + 20;
      const rightW = it.right ? 92 : 0;
      if (it.desc) {
        text(ctx, it.label, tx, cy - 6, { weight: 800, size: cols === 2 ? 25 : 30, maxW: cellW - (tx - x) - rightW - 8 });
        text(ctx, it.desc, tx, cy + 28, { weight: 400, size: cols === 2 ? 20 : 23, color: T.sub, maxW: cellW - (tx - x) - rightW - 8 });
      } else text(ctx, it.label, tx, cy + 9, { weight: 800, size: cols === 2 ? 25 : 30, maxW: cellW - (tx - x) - rightW - 8 });
      if (it.right) text(ctx, it.right, x + cellW - 14, cy + 8, { weight: 700, size: 21, color: T.dim, align: "right" });
      const lastInCol = row === rowsN - 1;
      if (!lastInCol && cols === 1) divider(ctx, x + 20, x + cellW - 20, y + pad + (row + 1) * rowH);
    });
    y += h + 26;
    if (chips.length) y = chipList(ctx, th, y, chips) + 28;
    if (hint) y = notice(ctx, th, y, wrapText(ctx, hint, W - PAD * 2 - 170, 700, 22).slice(0, 3), { kind: "info", color: th.a }) + 20;
    return { canvas, end: y };
  };
  const probe = draw(4200);
  return draw(Math.max(700, Math.ceil(probe.end + 40))).canvas.toBuffer("image/png");
}
