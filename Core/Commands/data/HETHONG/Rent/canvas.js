/**
 * RENT canvas — toàn bộ giao diện hình ảnh của hệ thống thuê bot.
 * Phong cách: Dark Luxury · navy/black · cyan neon · glassmorphism.
 *
 * Mọi hàm render trả về Buffer PNG (hoặc ném lỗi — nơi gọi PHẢI có fallback text).
 * Không phụ thuộc store/DB: dữ liệu được định dạng sẵn ở nơi gọi.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, registerFont } from "canvas";
import { getConfiguredBotName } from "../../../../../Utils/Branding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "..", "..", "MEDIA", "fonts");
const FONT = "RentUI";

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  fontsReady = true;
  for (const [file, weight] of [
    ["BeVietnamPro_800ExtraBold.ttf", "800"],
    ["BeVietnamPro_700Bold.ttf", "bold"],
    ["BeVietnamPro_600SemiBold.ttf", "600"],
    ["BeVietnamPro_400Regular.ttf", "normal"],
  ]) {
    const p = path.join(FONT_DIR, file);
    if (!fs.existsSync(p)) continue; // thiếu font -> dùng font hệ thống, không crash
    try { registerFont(p, { family: FONT, weight }); } catch { /* bỏ qua */ }
  }
}
ensureFonts();
const FACE = `${FONT}, "Be Vietnam Pro", "Segoe UI", Arial, sans-serif`;

// ───────────────────────── tokens ─────────────────────────
const W = 1000;
const SCALE = 2;
const PAD = 54;
const C = {
  bg: "#04070F",
  cyan: "#22D3EE",
  blue: "#3B82F6",
  green: "#2DFFA0",
  amber: "#FBBF24",
  red: "#FF4D6A",
  grey: "#64748B",
  text: "#F4F8FF",
  sub: "#8FA3C4",
};
const STATE = {
  active: { color: C.green, label: "ACTIVE" },
  expiring: { color: C.amber, label: "EXPIRING SOON" },
  expired: { color: C.red, label: "EXPIRED" },
  inactive: { color: C.grey, label: "INACTIVE" },
};

// ───────────────────────── helpers ─────────────────────────
function rgba(hex, a) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rr(ctx, x, y, w, h, r) {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + R, y);
  ctx.arcTo(x + w, y, x + w, y + h, R);
  ctx.arcTo(x + w, y + h, x, y + h, R);
  ctx.arcTo(x, y + h, x, y, R);
  ctx.arcTo(x, y, x + w, y, R);
  ctx.closePath();
}
function fit(ctx, v, maxW) {
  let s = String(v ?? "");
  if (!maxW || ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}
function txt(ctx, v, x, y, { weight = 400, size = 24, color = C.text, align = "left", maxW, glow = 0, spacing = 0 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FACE}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  if ("letterSpacing" in ctx && spacing) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(maxW ? fit(ctx, v, maxW) : String(v ?? ""), x, y);
  ctx.restore();
}
function neon(ctx, color, width = 2, blur = 14) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.restore();
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, width * 0.6); ctx.stroke(); ctx.restore();
}
function glowSpot(ctx, x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function newCanvas(H) {
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  return { canvas, ctx };
}

export async function renderRentEmailLogo() {
  const size = 192;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, "#102A43");
  bg.addColorStop(1, "#071522");
  rr(ctx, 4, 4, size - 8, size - 8, 42);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = "#35E0C1";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = "rgba(91, 225, 232, 0.8)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(size / 2, size / 2, 67, 25, -Math.PI / 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 82px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("H", size / 2, size / 2 + 2);
  ctx.fillStyle = "#35E0C1";
  ctx.beginPath();
  ctx.arc(143, 62, 9, 0, Math.PI * 2);
  ctx.fill();
  return canvas.toBuffer("image/png");
}

/** Nền: gradient sâu + lưới mảnh + quầng sáng + khung viền gradient */
function background(ctx, H, accent = C.cyan) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#050A18"); g.addColorStop(0.55, "#04070F"); g.addColorStop(1, "#070B1E");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  glowSpot(ctx, 120, 90, 520, accent, 0.20);
  glowSpot(ctx, W - 60, H - 120, 560, C.blue, 0.16);
  // lưới mảnh
  ctx.strokeStyle = "rgba(120,160,255,0.035)"; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // khung
  const fg = ctx.createLinearGradient(0, 0, W, H);
  fg.addColorStop(0, rgba(accent, 0.9)); fg.addColorStop(0.5, rgba(C.blue, 0.35)); fg.addColorStop(1, rgba(accent, 0.8));
  rr(ctx, 16, 16, W - 32, H - 32, 40);
  ctx.save(); ctx.shadowColor = accent; ctx.shadowBlur = 20; ctx.strokeStyle = fg; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
  rr(ctx, 26, 26, W - 52, H - 52, 32);
  ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1; ctx.stroke();
}

/** Thẻ kính mờ */
function glass(ctx, x, y, w, h, color = C.cyan, { r = 26, alpha = 0.42 } = {}) {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "rgba(255,255,255,0.075)"); g.addColorStop(1, "rgba(255,255,255,0.02)");
  ctx.fillStyle = "rgba(8,14,32,0.82)"; ctx.fill();
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  rr(ctx, x, y, w, h, r);
  ctx.save(); ctx.strokeStyle = rgba(color, alpha); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  // vạch sáng phía trên
  ctx.save();
  const hl = ctx.createLinearGradient(x + r, 0, x + w - r, 0);
  hl.addColorStop(0, rgba(color, 0)); hl.addColorStop(0.5, rgba(color, 0.55)); hl.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = hl; ctx.fillRect(x + r, y + 0.5, w - r * 2, 1.5);
  ctx.restore();
}

function pill(ctx, label, x, y, color, { align = "left", size = 15, h = 36 } = {}) {
  ctx.save();
  ctx.font = `800 ${size}px ${FACE}`;
  const w = ctx.measureText(label).width + 52;
  const x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  rr(ctx, x0, y, w, h, h / 2);
  ctx.fillStyle = rgba(color, 0.14); ctx.fill();
  rr(ctx, x0, y, w, h, h / 2);
  neon(ctx, color, 1.6, 8);
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(x0 + 22, y + h / 2, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  txt(ctx, label, x0 + 36, y + h / 2 + size * 0.36, { weight: 800, size, color });
  return w;
}

/** Logo RENT: khối R neon + chữ giãn chữ */
function brand(ctx, x, y, accent = C.cyan) {
  ctx.save();
  rr(ctx, x, y, 64, 64, 18);
  const g = ctx.createLinearGradient(x, y, x + 64, y + 64);
  g.addColorStop(0, rgba(accent, 0.35)); g.addColorStop(1, rgba(C.blue, 0.3));
  ctx.fillStyle = g; ctx.fill();
  rr(ctx, x, y, 64, 64, 18); neon(ctx, accent, 2.5, 16);
  ctx.restore();
  // chữ R
  txt(ctx, "R", x + 32, y + 46, { weight: 800, size: 40, align: "center", color: "#FFFFFF", glow: 12 });
  txt(ctx, "RENT", x + 88, y + 36, { weight: 800, size: 38, color: "#FFFFFF", glow: 14, spacing: 6 });
  txt(ctx, "BOT RENTAL SYSTEM", x + 90, y + 60, { weight: 600, size: 13, color: accent, spacing: 3 });
}

function header(ctx, { accent = C.cyan, chip, chipColor }) {
  brand(ctx, PAD, 56, accent);
  if (chip) pill(ctx, chip, W - PAD, 70, chipColor || accent, { align: "right" });
  const g = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
  g.addColorStop(0, rgba(accent, 0)); g.addColorStop(0.5, rgba(accent, 0.7)); g.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = g; ctx.fillRect(PAD, 140, W - PAD * 2, 2);
}

function footer(ctx, H, text = `${getConfiguredBotName()}  ·  RENT`) {
  txt(ctx, text, W / 2, H - 46, { weight: 700, size: 13, color: rgba(C.sub, 0.9), align: "center", spacing: 3 });
}

// ───────────────────────── icons ─────────────────────────
function icon(ctx, kind, cx, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2, s * 0.09);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const k = s / 2;
  switch (kind) {
    case "search":
      ctx.beginPath(); ctx.arc(cx - k * 0.15, cy - k * 0.15, k * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + k * 0.3, cy + k * 0.3); ctx.lineTo(cx + k * 0.85, cy + k * 0.85); ctx.stroke(); break;
    case "key":
      ctx.beginPath(); ctx.arc(cx - k * 0.45, cy, k * 0.42, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - k * 0.03, cy); ctx.lineTo(cx + k * 0.9, cy);
      ctx.moveTo(cx + k * 0.55, cy); ctx.lineTo(cx + k * 0.55, cy + k * 0.35);
      ctx.moveTo(cx + k * 0.82, cy); ctx.lineTo(cx + k * 0.82, cy + k * 0.28); ctx.stroke(); break;
    case "list":
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.arc(cx - k * 0.6, cy + i * k * 0.5, k * 0.08, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - k * 0.3, cy + i * k * 0.5); ctx.lineTo(cx + k * 0.7, cy + i * k * 0.5); ctx.stroke();
      } break;
    case "plus":
      ctx.beginPath(); ctx.moveTo(cx - k * 0.6, cy); ctx.lineTo(cx + k * 0.6, cy); ctx.moveTo(cx, cy - k * 0.6); ctx.lineTo(cx, cy + k * 0.6); ctx.stroke(); break;
    case "clock":
      ctx.beginPath(); ctx.arc(cx, cy, k * 0.72, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - k * 0.4); ctx.lineTo(cx, cy); ctx.lineTo(cx + k * 0.3, cy + k * 0.2); ctx.stroke(); break;
    case "power":
      ctx.beginPath(); ctx.arc(cx, cy + k * 0.05, k * 0.62, -Math.PI * 0.32, Math.PI * 1.32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - k * 0.75); ctx.lineTo(cx, cy - k * 0.1); ctx.stroke(); break;
    case "spark":
      ctx.beginPath();
      ctx.moveTo(cx, cy - k * 0.8); ctx.quadraticCurveTo(cx, cy, cx + k * 0.8, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy + k * 0.8); ctx.quadraticCurveTo(cx, cy, cx - k * 0.8, cy);
      ctx.quadraticCurveTo(cx, cy, cx, cy - k * 0.8); ctx.closePath(); ctx.fill(); break;
    case "bell":
      ctx.beginPath(); ctx.moveTo(cx - k * 0.6, cy + k * 0.35); ctx.quadraticCurveTo(cx - k * 0.5, cy - k * 0.05, cx - k * 0.45, cy - k * 0.3);
      ctx.quadraticCurveTo(cx, cy - k * 0.95, cx + k * 0.45, cy - k * 0.3); ctx.quadraticCurveTo(cx + k * 0.5, cy - k * 0.05, cx + k * 0.6, cy + k * 0.35); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + k * 0.6, k * 0.12, 0, Math.PI * 2); ctx.fill(); break;
    case "check":
      ctx.lineWidth = s * 0.13;
      ctx.beginPath(); ctx.moveTo(cx - k * 0.55, cy + k * 0.05); ctx.lineTo(cx - k * 0.12, cy + k * 0.5); ctx.lineTo(cx + k * 0.6, cy - k * 0.4); ctx.stroke(); break;
    case "cross":
      ctx.lineWidth = s * 0.13;
      ctx.beginPath(); ctx.moveTo(cx - k * 0.5, cy - k * 0.5); ctx.lineTo(cx + k * 0.5, cy + k * 0.5); ctx.moveTo(cx + k * 0.5, cy - k * 0.5); ctx.lineTo(cx - k * 0.5, cy + k * 0.5); ctx.stroke(); break;
    case "shield":
      ctx.beginPath(); ctx.moveTo(cx, cy - k * 0.85); ctx.lineTo(cx + k * 0.7, cy - k * 0.5); ctx.lineTo(cx + k * 0.7, cy + k * 0.1);
      ctx.quadraticCurveTo(cx + k * 0.65, cy + k * 0.6, cx, cy + k * 0.9); ctx.quadraticCurveTo(cx - k * 0.65, cy + k * 0.6, cx - k * 0.7, cy + k * 0.1);
      ctx.lineTo(cx - k * 0.7, cy - k * 0.5); ctx.closePath(); ctx.stroke(); break;
    case "warn":
      ctx.beginPath(); ctx.moveTo(cx, cy - k * 0.85); ctx.lineTo(cx + k * 0.85, cy + k * 0.65); ctx.lineTo(cx - k * 0.85, cy + k * 0.65); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - k * 0.25); ctx.lineTo(cx, cy + k * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + k * 0.42, k * 0.06, 0, Math.PI * 2); ctx.fill(); break;
    case "box":
      ctx.beginPath(); ctx.moveTo(cx, cy - k * 0.8); ctx.lineTo(cx + k * 0.8, cy - k * 0.35); ctx.lineTo(cx + k * 0.8, cy + k * 0.45); ctx.lineTo(cx, cy + k * 0.9);
      ctx.lineTo(cx - k * 0.8, cy + k * 0.45); ctx.lineTo(cx - k * 0.8, cy - k * 0.35); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - k * 0.8, cy - k * 0.35); ctx.lineTo(cx, cy + k * 0.1); ctx.lineTo(cx + k * 0.8, cy - k * 0.35); ctx.moveTo(cx, cy + k * 0.1); ctx.lineTo(cx, cy + k * 0.9); ctx.stroke(); break;
    case "calendar":
      rr(ctx, cx - k * 0.8, cy - k * 0.65, k * 1.6, k * 1.5, k * 0.18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - k * 0.8, cy - k * 0.15); ctx.lineTo(cx + k * 0.8, cy - k * 0.15);
      ctx.moveTo(cx - k * 0.35, cy - k * 0.9); ctx.lineTo(cx - k * 0.35, cy - k * 0.45); ctx.moveTo(cx + k * 0.35, cy - k * 0.9); ctx.lineTo(cx + k * 0.35, cy - k * 0.45); ctx.stroke(); break;
    default:
      ctx.beginPath(); ctx.arc(cx, cy, k * 0.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function iconBadge(ctx, kind, cx, cy, r, color) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(color, 0.14); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); neon(ctx, color, 2, 10);
  ctx.restore();
  icon(ctx, kind, cx, cy, r * 1.05, color);
}

// ───────────────────────── định dạng ─────────────────────────
const two = (n) => String(Math.max(0, Math.floor(n))).padStart(2, "0");
export function splitRemaining(ms) {
  const r = Math.max(0, Number(ms) || 0);
  const d = Math.floor(r / 86_400_000);
  const h = Math.floor((r % 86_400_000) / 3_600_000);
  const m = Math.floor((r % 3_600_000) / 60_000);
  return { d, h, m };
}
/** "12 ngày 08 giờ" / "5 giờ 20 phút" / "Dưới 1 phút" */
export function remainingText(ms) {
  const { d, h, m } = splitRemaining(ms);
  if (d > 0) return `${d} ngày ${two(h)} giờ`;
  if (h > 0) return `${h} giờ ${two(m)} phút`;
  if (m > 0) return `${m} phút`;
  return "Dưới 1 phút";
}
const shortId = (id) => {
  const s = String(id ?? "");
  return s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
};

// ═════════════════════════ 1. MENU ═════════════════════════
/**
 * @param {{prefix:string, state:string, remainingMs?:number, price?:string, showOwner?:boolean}} d
 */
export async function renderRentMenu(d = {}) {
  const prefix = d.prefix || ".";
  const st = STATE[d.state] || STATE.inactive;
  const user = [
    { icon: "search", cmd: `${prefix}rent check`, desc: "Kiểm tra thời hạn thuê của box", color: C.cyan },
    { icon: "key", cmd: `${prefix}rent key <KEY>`, desc: "Kích hoạt hoặc gia hạn bot bằng KEY", color: C.green },
    { icon: "bell", cmd: `${prefix}rent tb on|off`, desc: "Bật/tắt nhắc số ngày thuê hằng ngày", color: C.blue },
  ];
  const owner = [
    { icon: "list", cmd: `${prefix}rent list [trang]`, desc: "Danh sách tất cả box đang thuê", color: C.blue },
    { icon: "plus", cmd: `${prefix}rent add <ngày>`, desc: "Cộng thêm ngày vào thời hạn hiện tại", color: C.cyan },
    { icon: "clock", cmd: `${prefix}rent set <ngày>`, desc: "Đặt lại thời hạn tính từ bây giờ", color: C.amber },
    { icon: "cross", cmd: `${prefix}rent del <ngày>`, desc: "Admin trừ ngày thuê của box hiện tại", color: C.red },
    { icon: "power", cmd: `${prefix}rent off`, desc: "Tắt thuê bot của box này", color: C.red },
    { icon: "spark", cmd: `${prefix}rent genkey <ngày> [số lượng]`, desc: "Tạo KEY mới (gửi riêng cho owner)", color: C.green },
    { icon: "bell", cmd: `${prefix}rent admin <set|off|test>`, desc: "Cấu hình box nhận báo cáo hằng ngày", color: C.blue },
    { icon: "box", cmd: `${prefix}rent gmail`, desc: "Cấu hình email nhận cảnh báo bot bị kick", color: C.cyan },
  ];
  const ROW = 78, GAP = 12;
  const secH = 54;
  const H = 150 + 118 + 24 + secH + user.length * (ROW + GAP) + 10 + secH + owner.length * (ROW + GAP) + 110 + 90;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, C.cyan);
  header(ctx, { accent: C.cyan, chip: "ONLINE", chipColor: C.green });

  // trạng thái
  let y = 164;
  glass(ctx, PAD, y, W - PAD * 2, 118, st.color, { alpha: 0.5 });
  iconBadge(ctx, st.color === C.grey ? "shield" : "check", PAD + 62, y + 59, 30, st.color);
  txt(ctx, "TRẠNG THÁI HỆ THỐNG", PAD + 114, y + 44, { weight: 700, size: 14, color: C.sub, spacing: 2 });
  txt(ctx, "Hệ thống thuê bot đang hoạt động", PAD + 114, y + 80, { weight: 800, size: 27 });
  pill(ctx, d.state === "inactive" ? "BOX: CHƯA KÍCH HOẠT" : `BOX: ${st.label}`, W - PAD - 24, y + 22, st.color, { align: "right", size: 13, h: 34 });
  if (d.remainingMs > 0) txt(ctx, `Còn ${remainingText(d.remainingMs)}`, W - PAD - 28, y + 98, { weight: 700, size: 16, color: st.color, align: "right" });
  y += 118 + 24;

  const section = (label, color) => {
    txt(ctx, label, PAD + 6, y + 30, { weight: 800, size: 17, color, spacing: 3 });
    const g = ctx.createLinearGradient(PAD + 230, 0, W - PAD, 0);
    g.addColorStop(0, rgba(color, 0.6)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g; ctx.fillRect(PAD + 250, y + 25, W - PAD * 2 - 250, 2);
    y += secH;
  };
  const row = (it) => {
    glass(ctx, PAD, y, W - PAD * 2, ROW, it.color, { r: 22, alpha: 0.35 });
    iconBadge(ctx, it.icon, PAD + 50, y + ROW / 2, 24, it.color);
    txt(ctx, it.cmd, PAD + 100, y + 33, { weight: 800, size: 22, color: it.color, maxW: W - PAD * 2 - 130 });
    txt(ctx, it.desc, PAD + 100, y + 58, { size: 16, color: C.sub, maxW: W - PAD * 2 - 130 });
    y += ROW + GAP;
  };
  section("LỆNH NGƯỜI DÙNG", C.cyan); user.forEach(row);
  y += 10;
  section("LỆNH ADMIN / OWNER", C.amber); owner.forEach(row);

  // giá
  y += 6;
  glass(ctx, PAD, y, W - PAD * 2, 92, C.green, { alpha: 0.45 });
  txt(ctx, "GIÁ THUÊ", PAD + 32, y + 38, { weight: 700, size: 14, color: C.sub, spacing: 3 });
  txt(ctx, d.price || "1.000đ / 1 ngày", PAD + 32, y + 72, { weight: 800, size: 30, color: C.green, glow: 14 });
  txt(ctx, "KEY do owner cấp  ·  nhập vào box cần kích hoạt", W - PAD - 32, y + 56, { weight: 600, size: 15, color: C.sub, align: "right" });

  footer(ctx, H);
  return canvas.toBuffer("image/png");
}

// ═════════════════════════ 2. TRẠNG THÁI / NHẮC HẠN ═════════════════════════
/**
 * @param {{state:"active"|"expiring"|"expired"|"inactive", title?:string, prefix:string,
 *          threadName?:string, threadId:string, remainingMs?:number, expireText?:string,
 *          banner?:string}} d
 */
export async function renderRentStatus(d = {}) {
  const prefix = d.prefix || ".";
  const st = STATE[d.state] || STATE.inactive;
  const title = d.title || "RENT STATUS";
  const H = 1090;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, st.color === C.grey ? C.cyan : st.color);
  header(ctx, { accent: st.color === C.grey ? C.cyan : st.color, chip: st.label, chipColor: st.color });

  txt(ctx, title, W / 2, 218, { weight: 800, size: 40, align: "center", glow: 16, spacing: 2 });
  if (d.banner) txt(ctx, d.banner, W / 2, 254, { weight: 600, size: 18, align: "center", color: st.color });

  // vòng tiến trình
  const cx = W / 2, cy = 430, R = 128;
  const { d: dd, h: hh } = splitRemaining(d.remainingMs || 0);
  const frac = d.state === "inactive" ? 0 : d.state === "expired" ? 0 : Math.min(1, (d.remainingMs || 0) / ((d.state === "expiring" ? 3 : 30) * 86_400_000));
  glowSpot(ctx, cx, cy, 240, st.color, 0.16);
  ctx.save();
  ctx.lineWidth = 16; ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  if (frac > 0) {
    ctx.shadowColor = st.color; ctx.shadowBlur = 24;
    ctx.strokeStyle = st.color;
    ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, frac)); ctx.stroke();
  } else if (d.state === "expired") {
    ctx.shadowColor = st.color; ctx.shadowBlur = 18; ctx.strokeStyle = rgba(st.color, 0.7);
    ctx.setLineDash([2, 26]); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  if (d.state === "inactive") {
    icon(ctx, "shield", cx, cy - 10, 84, C.grey);
    txt(ctx, "CHƯA KÍCH HOẠT", cx, cy + 80, { weight: 700, size: 15, color: C.sub, align: "center", spacing: 3 });
  } else if (d.state === "expired") {
    icon(ctx, "cross", cx, cy - 14, 70, C.red);
    txt(ctx, "HẾT HẠN", cx, cy + 74, { weight: 800, size: 22, color: C.red, align: "center", spacing: 3, glow: 10 });
  } else {
    txt(ctx, String(dd), cx, cy + 22, { weight: 800, size: dd >= 100 ? 78 : 96, align: "center", glow: 20 });
    txt(ctx, "NGÀY", cx, cy + 56, { weight: 700, size: 16, color: C.sub, align: "center", spacing: 4 });
    txt(ctx, `${two(hh)} GIỜ`, cx, cy + 90, { weight: 800, size: 20, color: st.color, align: "center", glow: 8 });
  }

  // thẻ thông tin
  let y = 600;
  const cw = (W - PAD * 2 - 20) / 2;
  const info = (x, yy, w, label, value, kind, color = C.cyan, size = 26) => {
    glass(ctx, x, yy, w, 96, color, { r: 22, alpha: 0.35 });
    iconBadge(ctx, kind, x + 46, yy + 48, 22, color);
    txt(ctx, label, x + 86, yy + 38, { weight: 700, size: 13, color: C.sub, spacing: 2 });
    txt(ctx, value, x + 86, yy + 72, { weight: 800, size, maxW: w - 110 });
  };
  if (d.state === "inactive") {
    glass(ctx, PAD, y, W - PAD * 2, 150, C.cyan, { alpha: 0.45 });
    txt(ctx, "Box này chưa được kích hoạt RENT.", W / 2, y + 52, { weight: 700, size: 24, align: "center" });
    txt(ctx, "Hãy sử dụng", W / 2, y + 88, { size: 16, color: C.sub, align: "center" });
    txt(ctx, `${prefix}rent key <KEY>`, W / 2, y + 126, { weight: 800, size: 28, color: C.cyan, align: "center", glow: 14 });
    y += 150 + 20;
  } else {
    info(PAD, y, cw, d.state === "expired" ? "ĐÃ HẾT HẠN LÚC" : "HẾT HẠN", d.expireText || "—", "calendar", st.color, 24);
    info(PAD + cw + 20, y, cw, "CÒN LẠI", d.state === "expired" ? "0 ngày" : remainingText(d.remainingMs || 0), "clock", st.color, 24);
    y += 96 + 20;
  }
  info(PAD, y, W - PAD * 2, d.threadName ? "BOX" : "THREAD", d.threadName || shortId(d.threadId), "box", C.cyan, 26);
  y += 96 + 20;
  if (d.threadName) {
    info(PAD, y, W - PAD * 2, "THREAD ID", shortId(d.threadId), "shield", C.blue, 22);
    y += 96 + 20;
  }
  if (d.state === "expired" || d.state === "expiring") {
    txt(ctx, `Dùng ${prefix}rent key <KEY> để ${d.state === "expired" ? "kích hoạt lại" : "gia hạn"}.`, W / 2, y + 18, { weight: 700, size: 18, color: st.color, align: "center" });
  }
  footer(ctx, H);
  return canvas.toBuffer("image/png");
}

// ═════════════════════════ 3. XÁC NHẬN (key / add / set / off) ═════════════════════════
/**
 * @param {{title:string, subtitle?:string, tone?:"ok"|"warn"|"off", rows:{label,value,kind?,color?}[],
 *          statusLabel?:string}} d
 */
export async function renderRentResult(d = {}) {
  const tone = d.tone || "ok";
  const color = tone === "off" ? C.red : tone === "warn" ? C.amber : C.green;
  const rows = d.rows || [];
  const H = 430 + rows.length * 112 + 150;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, color);
  header(ctx, { accent: color, chip: d.statusLabel || (tone === "off" ? "INACTIVE" : "ACTIVE"), chipColor: color });

  const cx = W / 2, cy = 250;
  glowSpot(ctx, cx, cy, 200, color, 0.22);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2);
  ctx.fillStyle = rgba(color, 0.15); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2); neon(ctx, color, 3.5, 22);
  ctx.beginPath(); ctx.arc(cx, cy, 74, 0, Math.PI * 2); ctx.strokeStyle = rgba(color, 0.25); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
  icon(ctx, tone === "off" ? "power" : "check", cx, cy, 64, "#FFFFFF");

  txt(ctx, d.title, W / 2, 374, { weight: 800, size: 42, align: "center", glow: 18, spacing: 2 });
  if (d.subtitle) txt(ctx, d.subtitle, W / 2, 412, { weight: 600, size: 19, color, align: "center", maxW: W - PAD * 2 });

  let y = 450;
  rows.forEach((r) => {
    const c = r.color || color;
    glass(ctx, PAD, y, W - PAD * 2, 96, c, { r: 24, alpha: 0.38 });
    iconBadge(ctx, r.kind || "check", PAD + 54, y + 48, 24, c);
    txt(ctx, r.label, PAD + 100, y + 38, { weight: 700, size: 14, color: C.sub, spacing: 3 });
    txt(ctx, r.value, PAD + 100, y + 74, { weight: 800, size: 28, color: r.valueColor || C.text, maxW: W - PAD * 2 - 130 });
    y += 112;
  });
  footer(ctx, H);
  return canvas.toBuffer("image/png");
}

// ═════════════════════════ 4. DANH SÁCH (owner) ═════════════════════════
/**
 * @param {{rows:{index:number,name?:string,threadId:string,state:string,remainingMs:number,expireText:string}[],
 *          page:number, pages:number, total:number, active:number, expired:number, expiring:number, prefix:string}} d
 */
export async function renderRentList(d = {}) {
  const rows = d.rows || [];
  const ROW = 100, GAP = 12;
  const listH = rows.length ? rows.length * (ROW + GAP) : 130;
  const H = 150 + 50 + 120 + 30 + 52 + listH + 150;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, C.blue);
  header(ctx, { accent: C.cyan, chip: `TRANG ${d.page}/${d.pages}`, chipColor: C.cyan });

  txt(ctx, "RENT MANAGEMENT", W / 2, 196, { weight: 800, size: 36, align: "center", glow: 16, spacing: 2 });

  let y = 226;
  const tiles = [
    { label: "TOTAL BOX", value: d.total, color: C.cyan, kind: "box" },
    { label: "ACTIVE", value: d.active, color: C.green, kind: "check" },
    { label: "EXPIRING", value: d.expiring, color: C.amber, kind: "warn" },
    { label: "EXPIRED", value: d.expired, color: C.red, kind: "cross" },
  ];
  const tw = (W - PAD * 2 - 18 * 3) / 4;
  tiles.forEach((t, i) => {
    const x = PAD + i * (tw + 18);
    glass(ctx, x, y, tw, 120, t.color, { r: 24, alpha: 0.45 });
    iconBadge(ctx, t.kind, x + 40, y + 36, 18, t.color);
    txt(ctx, t.label, x + 68, y + 41, { weight: 700, size: 12, color: C.sub, spacing: 2 });
    txt(ctx, String(t.value ?? 0), x + tw / 2, y + 98, { weight: 800, size: 46, color: t.color, align: "center", glow: 14 });
  });
  y += 120 + 30;

  txt(ctx, "DANH SÁCH BOX", PAD + 6, y + 28, { weight: 800, size: 17, color: C.cyan, spacing: 3 });
  const gl = ctx.createLinearGradient(PAD + 200, 0, W - PAD, 0);
  gl.addColorStop(0, rgba(C.cyan, 0.6)); gl.addColorStop(1, rgba(C.cyan, 0));
  ctx.fillStyle = gl; ctx.fillRect(PAD + 210, y + 23, W - PAD * 2 - 210, 2);
  y += 52;

  if (!rows.length) {
    glass(ctx, PAD, y, W - PAD * 2, 110, C.cyan, { alpha: 0.3 });
    txt(ctx, "Chưa có box nào được kích hoạt RENT.", W / 2, y + 66, { weight: 700, size: 22, color: C.sub, align: "center" });
    y += 130;
  }
  rows.forEach((r) => {
    const st = STATE[r.state] || STATE.inactive;
    glass(ctx, PAD, y, W - PAD * 2, ROW, st.color, { r: 24, alpha: 0.35 });
    ctx.fillStyle = st.color; rr(ctx, PAD, y + 20, 5, ROW - 40, 3); ctx.fill();
    txt(ctx, `#${String(r.index).padStart(2, "0")}`, PAD + 52, y + ROW / 2 + 8, { weight: 800, size: 22, color: rgba(st.color, 0.85), align: "center" });
    txt(ctx, r.name || shortId(r.threadId), PAD + 100, y + 40, { weight: 800, size: 23, maxW: 480 });
    txt(ctx, `ID ${shortId(r.threadId)}`, PAD + 100, y + 68, { size: 14, color: C.sub, maxW: 480 });
    pill(ctx, st.label, W - PAD - 24, y + 16, st.color, { align: "right", size: 12, h: 30 });
    txt(ctx, r.state === "expired" ? "Đã hết hạn" : r.state === "inactive" ? "Chưa kích hoạt" : `Còn ${remainingText(r.remainingMs)}`, W - PAD - 28, y + 66, { weight: 800, size: 20, color: st.color, align: "right" });
    if (r.state !== "inactive") txt(ctx, r.expireText || "", W - PAD - 28, y + 88, { size: 13, color: C.sub, align: "right" });
    y += ROW + GAP;
  });
  txt(ctx, d.pages > 1 ? `Xem trang khác: ${d.prefix || "."}rent list <số trang>` : "Danh sách đầy đủ", W / 2, H - 78, { weight: 600, size: 15, color: C.sub, align: "center" });
  footer(ctx, H);
  return canvas.toBuffer("image/png");
}

// ═════════════════════════ 5. DAILY REPORT ═════════════════════════
/**
 * @param {{dateText:string, weekday?:string, total:number, active:number, expired:number, expiring:number,
 *          items:{index:number,name?:string,threadId:string,remainingMs:number,state:string}[],
 *          page:number, pages:number}} d
 */
export async function renderRentReport(d = {}) {
  const items = d.items || [];
  const ROW = 68, GAP = 10;
  const listH = items.length ? items.length * (ROW + GAP) : 110;
  const H = 150 + 250 + 150 + 52 + listH + 120;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, C.cyan);
  header(ctx, { accent: C.cyan, chip: d.pages > 1 ? `TRANG ${d.page}/${d.pages}` : "DAILY", chipColor: C.cyan });

  txt(ctx, "RENT DAILY REPORT", W / 2, 200, { weight: 800, size: 38, align: "center", glow: 16, spacing: 2 });
  txt(ctx, d.dateText, W / 2, 262, { weight: 800, size: 52, align: "center", color: C.cyan, glow: 22 });
  txt(ctx, `${d.weekday ? d.weekday + "  ·  " : ""}DAILY RENTAL UPDATE`, W / 2, 296, { weight: 600, size: 15, align: "center", color: C.sub, spacing: 3 });

  let y = 326;
  const tiles = [
    { label: "TOTAL BOX", value: d.total, color: C.cyan, kind: "box" },
    { label: "ACTIVE", value: d.active, color: C.green, kind: "check" },
    { label: "EXPIRED", value: d.expired, color: C.red, kind: "cross" },
    { label: "EXPIRING SOON", value: d.expiring, color: C.amber, kind: "warn" },
  ];
  const tw = (W - PAD * 2 - 18 * 3) / 4;
  tiles.forEach((t, i) => {
    const x = PAD + i * (tw + 18);
    glass(ctx, x, y, tw, 124, t.color, { r: 24, alpha: 0.45 });
    iconBadge(ctx, t.kind, x + 40, y + 38, 18, t.color);
    txt(ctx, t.label, x + 68, y + 43, { weight: 700, size: 11.5, color: C.sub, spacing: 1.5, maxW: tw - 76 });
    txt(ctx, String(t.value ?? 0), x + tw / 2, y + 102, { weight: 800, size: 48, color: t.color, align: "center", glow: 14 });
  });
  y += 124 + 34;

  txt(ctx, "TODAY'S UPDATE", PAD + 6, y + 28, { weight: 800, size: 17, color: C.cyan, spacing: 3 });
  const gl = ctx.createLinearGradient(PAD + 230, 0, W - PAD, 0);
  gl.addColorStop(0, rgba(C.cyan, 0.6)); gl.addColorStop(1, rgba(C.cyan, 0));
  ctx.fillStyle = gl; ctx.fillRect(PAD + 240, y + 23, W - PAD * 2 - 240, 2);
  y += 52;

  if (!items.length) {
    glass(ctx, PAD, y, W - PAD * 2, 90, C.cyan, { alpha: 0.3 });
    txt(ctx, "Chưa có box nào đang thuê.", W / 2, y + 54, { weight: 700, size: 21, color: C.sub, align: "center" });
    y += 110;
  }
  items.forEach((r) => {
    const st = STATE[r.state] || STATE.active;
    glass(ctx, PAD, y, W - PAD * 2, ROW, st.color, { r: 20, alpha: 0.3 });
    txt(ctx, `#${String(r.index).padStart(2, "0")}`, PAD + 44, y + ROW / 2 + 8, { weight: 800, size: 19, color: rgba(st.color, 0.85), align: "center" });
    txt(ctx, r.name || shortId(r.threadId), PAD + 86, y + 29, { weight: 700, size: 21, maxW: 470 });
    txt(ctx, `ID ${shortId(r.threadId)}`, PAD + 86, y + 52, { size: 12.5, color: C.sub, maxW: 470 });
    txt(ctx, `Còn ${remainingText(r.remainingMs)}`, W - PAD - 26, y + ROW / 2 + 8, { weight: 800, size: 21, color: st.color, align: "right" });
    y += ROW + GAP;
  });
  if (d.expiring > 0 && d.page === d.pages) {
    txt(ctx, `${d.expiring} box sắp hết hạn trong 3 ngày tới`, W / 2, y + 18, { weight: 700, size: 16, color: C.amber, align: "center" });
  }
  footer(ctx, H);
  return canvas.toBuffer("image/png");
}

// ═════════════════════════ 6. KEY MỚI (gửi riêng cho owner) ═════════════════════════
/** @param {{keys:{key:string,days:number,expireText?:string}[], prefix:string, title?:string}} d */
export async function renderRentKeys(d = {}) {
  const keys = (d.keys || []).slice(0, 12);
  const ROW = 92, GAP = 12;
  const H = 150 + 130 + keys.length * (ROW + GAP) + 140;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, C.green);
  header(ctx, { accent: C.green, chip: "PRIVATE", chipColor: C.amber });
  txt(ctx, d.title || "RENT KEYS", W / 2, 200, { weight: 800, size: 38, align: "center", glow: 16, spacing: 2 });
  txt(ctx, `${d.prefix || "."}rent key <KEY>  ·  mỗi KEY chỉ dùng được 1 lần`, W / 2, 238, { weight: 600, size: 16, color: C.green, align: "center" });
  let y = 276;
  keys.forEach((k, i) => {
    glass(ctx, PAD, y, W - PAD * 2, ROW, C.green, { r: 24, alpha: 0.4 });
    iconBadge(ctx, "key", PAD + 54, y + ROW / 2, 24, C.green);
    txt(ctx, k.key, PAD + 100, y + 44, { weight: 800, size: 31, color: "#FFFFFF", glow: 10, spacing: 2, maxW: 470 });
    txt(ctx, k.expireText ? `Hạn dùng KEY: ${k.expireText}` : "KEY không giới hạn thời gian dùng", PAD + 100, y + 72, { size: 14, color: C.sub, maxW: 470 });
    pill(ctx, `+${k.days} NGÀY`, W - PAD - 26, y + ROW / 2 - 18, C.green, { align: "right", size: 17, h: 36 });
    y += ROW + GAP;
  });
  txt(ctx, "Không chia sẻ KEY công khai. Ảnh này chỉ gửi riêng cho owner.", W / 2, y + 22, { weight: 600, size: 15, color: C.amber, align: "center" });
  footer(ctx, H);
  return canvas.toBuffer("image/png");
}

// ═════════════════════════ 7. THÔNG BÁO LỖI / TỪ CHỐI / THÔNG TIN ═════════════════════════
/** @param {{kind?:"error"|"deny"|"info", title:string, lines?:string[]}} d */
export async function renderRentNotice(d = {}) {
  const kind = d.kind || "info";
  const color = kind === "error" ? C.red : kind === "deny" ? C.amber : C.cyan;
  const ic = kind === "error" ? "cross" : kind === "deny" ? "shield" : "bell";
  const lines = (d.lines || []).slice(0, 6);
  const H = 440 + lines.length * 40 + 60;
  const { canvas, ctx } = newCanvas(H);
  background(ctx, H, color);
  header(ctx, { accent: color, chip: kind === "error" ? "ERROR" : kind === "deny" ? "ACCESS DENIED" : "NOTICE", chipColor: color });
  const cx = W / 2, cy = 250;
  glowSpot(ctx, cx, cy, 180, color, 0.2);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2); ctx.fillStyle = rgba(color, 0.15); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 52, 0, Math.PI * 2); neon(ctx, color, 3.5, 20);
  ctx.restore();
  icon(ctx, ic, cx, cy, 58, "#FFFFFF");
  txt(ctx, d.title, W / 2, 352, { weight: 800, size: 36, align: "center", glow: 14, maxW: W - PAD * 2 });
  let y = 404;
  lines.forEach((l) => { txt(ctx, l, W / 2, y + 12, { weight: 600, size: 20, color: "#C9D6EC", align: "center", maxW: W - PAD * 2 }); y += 40; });
  footer(ctx, H);
  return canvas.toBuffer("image/png");
}
