/**
 * CauCa UI — giao diện Canvas "Premium Fishing RPG" (navy · deep ocean · cyan glow · glass).
 *
 *  renderBalo        FISHING INVENTORY (grid cá có ảnh riêng từng loài, phân trang)
 *  renderWorldMap    FISHING WORLD MAP (bản đồ minh hoạ, 4 khu vực, khoá/mở/đang ở đây)
 *  renderMarket      FISH MARKET (cá của bạn + hướng dẫn bán)
 *  renderSellConfirm XÁC NHẬN BÁN CÁ
 *  renderSellSuccess BÁN CÁ THÀNH CÔNG
 *  renderHelp        menu lệnh .cauca
 *  renderNotice      thông báo (lỗi / hết hạn / trống)
 *
 * Mọi hàm trả Buffer PNG hoặc ném lỗi — nơi gọi PHẢI có fallback chữ.
 * Không dùng ký tự emoji/sao trong ảnh: icon và sao đều vẽ bằng path nên không phụ thuộc font.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, registerFont } from "canvas";
import { drawFish, rarityInfo } from "./fishArt.js";
import { getConfiguredBotName } from "../../../../../Utils/Branding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "..", "..", "MEDIA", "fonts");
const FONT = "CauCaUI";
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
    if (!fs.existsSync(p)) continue;
    try { registerFont(p, { family: FONT, weight }); } catch { /* dùng font hệ thống */ }
  }
}
ensureFonts();
const FACE = `${FONT}, "Be Vietnam Pro", "Segoe UI", Arial, sans-serif`;

const W = 1000;
const SCALE = 1.5;
const PAD = 54;
export const C = {
  cyan: "#22D3EE", blue: "#3B82F6", green: "#34E5A0", amber: "#FBBF24",
  red: "#FF5C7A", text: "#F2F8FF", sub: "#8FB0D0", dim: "#5C7592",
  deep: "#031024", navy: "#06213D",
};

// ───────────────────────── tiện ích vẽ ─────────────────────────
const rgba = (hex, a) => {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
function rr(ctx, x, y, w, h, r) {
  const R = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + R, y);
  ctx.arcTo(x + w, y, x + w, y + h, R);
  ctx.arcTo(x + w, y + h, x, y + h, R);
  ctx.arcTo(x, y + h, x, y, R);
  ctx.arcTo(x, y, x + w, y, R);
  ctx.closePath();
}
function fitStr(ctx, v, maxW) {
  let s = String(v ?? "");
  if (!maxW || ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}
function txt(ctx, v, x, y, { weight = 400, size = 24, color = C.text, align = "left", maxW, glow = 0, spacing = 0 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FACE}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  if ("letterSpacing" in ctx && spacing) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(maxW ? fitStr(ctx, v, maxW) : String(v ?? ""), x, y);
  ctx.restore();
}
/** Tự co chữ cho vừa; nếu vẫn dài thì xuống 2 dòng. Trả về số dòng đã vẽ. */
function fitName(ctx, v, cx, y, maxW, { weight = 800, size = 22, min = 16, color = C.text } = {}) {
  const s = String(v ?? "");
  let fs = size;
  ctx.save();
  while (fs > min) { ctx.font = `${weight} ${fs}px ${FACE}`; if (ctx.measureText(s).width <= maxW) break; fs -= 1; }
  ctx.font = `${weight} ${fs}px ${FACE}`;
  ctx.restore();
  const probe = createCanvas(4, 4).getContext("2d");
  probe.font = `${weight} ${fs}px ${FACE}`;
  if (probe.measureText(s).width <= maxW) { txt(ctx, s, cx, y, { weight, size: fs, color, align: "center" }); return 1; }
  const words = s.split(/\s+/);
  let l1 = "", i = 0;
  while (i < words.length && probe.measureText(`${l1} ${words[i]}`.trim()).width <= maxW) { l1 = `${l1} ${words[i]}`.trim(); i++; }
  if (!l1) { l1 = words[0]; i = 1; }
  const l2 = words.slice(i).join(" ");
  txt(ctx, l1, cx, y - fs * 0.55, { weight, size: fs, color, align: "center", maxW });
  txt(ctx, l2, cx, y + fs * 0.65, { weight, size: fs, color, align: "center", maxW });
  return 2;
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
  const canvas = createCanvas(Math.round(W * SCALE), Math.round(H * SCALE));
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  return { canvas, ctx };
}
/** PRNG có seed để bản đồ luôn giống nhau giữa các lần vẽ. */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export const money = (n) => `${Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}$`;

// ───────────────────────── icon vector ─────────────────────────
function star(ctx, cx, cy, r, color, filled = true) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (filled) { ctx.fillStyle = color; ctx.fill(); }
  else { ctx.strokeStyle = rgba(color, 0.5); ctx.lineWidth = 1; ctx.stroke(); }
}
/** Hàng sao căn giữa/trái. total = số ô, on = số sao sáng. */
const starSlots = (ri) => (ri.stars >= 6 ? 6 : 5);
function stars(ctx, x, y, on, total, color, { r = 8, gap = 4, align = "left" } = {}) {
  const w = total * (r * 2 + gap) - gap;
  let sx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.save();
  if (on > 0) { ctx.shadowColor = color; ctx.shadowBlur = 6; }
  for (let i = 0; i < total; i++) { star(ctx, sx + r + i * (r * 2 + gap), y, r, color, i < on); }
  ctx.restore();
}
function icon(ctx, kind, cx, cy, s, color = "#fff") {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2, s * 0.09);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const h = s / 2;
  switch (kind) {
    case "fish":
      ctx.beginPath(); ctx.ellipse(-h * 0.12, 0, h * 0.62, h * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(h * 0.46, 0); ctx.lineTo(h * 0.92, -h * 0.4); ctx.lineTo(h * 0.92, h * 0.4); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-h * 0.4, -h * 0.08, h * 0.07, 0, Math.PI * 2); ctx.fill(); break;
    case "bag":
      rr(ctx, -h * 0.62, -h * 0.4, h * 1.24, h * 1.05, h * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -h * 0.4, h * 0.34, Math.PI, 0); ctx.stroke(); break;
    case "map":
      ctx.beginPath(); ctx.moveTo(-h * 0.8, -h * 0.55); ctx.lineTo(-h * 0.27, -h * 0.75); ctx.lineTo(h * 0.27, -h * 0.55); ctx.lineTo(h * 0.8, -h * 0.75);
      ctx.lineTo(h * 0.8, h * 0.55); ctx.lineTo(h * 0.27, h * 0.75); ctx.lineTo(-h * 0.27, h * 0.55); ctx.lineTo(-h * 0.8, h * 0.75); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-h * 0.27, -h * 0.75); ctx.lineTo(-h * 0.27, h * 0.55); ctx.moveTo(h * 0.27, -h * 0.55); ctx.lineTo(h * 0.27, h * 0.75); ctx.stroke(); break;
    case "coin":
      ctx.beginPath(); ctx.arc(0, 0, h * 0.78, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -h * 0.42); ctx.lineTo(0, h * 0.42); ctx.moveTo(h * 0.22, -h * 0.28); ctx.quadraticCurveTo(-h * 0.3, -h * 0.4, -h * 0.28, -h * 0.02);
      ctx.quadraticCurveTo(-h * 0.25, h * 0.04, 0, h * 0.04); ctx.quadraticCurveTo(h * 0.3, h * 0.08, h * 0.28, h * 0.3); ctx.quadraticCurveTo(h * 0.2, h * 0.45, -h * 0.25, h * 0.3); ctx.stroke(); break;
    case "lock":
      rr(ctx, -h * 0.55, -h * 0.1, h * 1.1, h * 0.85, h * 0.14); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -h * 0.1, h * 0.36, Math.PI, 0); ctx.stroke(); break;
    case "pin":
      ctx.beginPath(); ctx.arc(0, -h * 0.2, h * 0.5, Math.PI * 0.85, Math.PI * 0.15, false); ctx.lineTo(0, h * 0.85); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -h * 0.2, h * 0.17, 0, Math.PI * 2); ctx.fill(); break;
    case "check":
      ctx.lineWidth = Math.max(3, s * 0.13);
      ctx.beginPath(); ctx.moveTo(-h * 0.5, 0); ctx.lineTo(-h * 0.12, h * 0.4); ctx.lineTo(h * 0.55, -h * 0.4); ctx.stroke(); break;
    case "cross":
      ctx.lineWidth = Math.max(3, s * 0.13);
      ctx.beginPath(); ctx.moveTo(-h * 0.45, -h * 0.45); ctx.lineTo(h * 0.45, h * 0.45); ctx.moveTo(h * 0.45, -h * 0.45); ctx.lineTo(-h * 0.45, h * 0.45); ctx.stroke(); break;
    case "rod":
      ctx.beginPath(); ctx.moveTo(-h * 0.8, h * 0.8); ctx.lineTo(h * 0.55, -h * 0.75); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(h * 0.55, -h * 0.75); ctx.quadraticCurveTo(h * 0.95, -h * 0.2, h * 0.55, h * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(h * 0.45, h * 0.42, h * 0.12, 0, Math.PI * 1.4); ctx.stroke(); break;
    case "bait":
      ctx.beginPath(); ctx.moveTo(-h * 0.8, h * 0.2); ctx.bezierCurveTo(-h * 0.5, -h * 0.6, -h * 0.2, h * 0.6, h * 0.1, -h * 0.1); ctx.bezierCurveTo(h * 0.3, -h * 0.5, h * 0.6, -h * 0.3, h * 0.8, -h * 0.5); ctx.stroke(); break;
    case "trophy":
      ctx.beginPath(); ctx.moveTo(-h * 0.5, -h * 0.7); ctx.lineTo(h * 0.5, -h * 0.7); ctx.lineTo(h * 0.4, h * 0.05); ctx.quadraticCurveTo(0, h * 0.5, -h * 0.4, h * 0.05); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h * 0.3); ctx.lineTo(0, h * 0.62); ctx.moveTo(-h * 0.35, h * 0.72); ctx.lineTo(h * 0.35, h * 0.72); ctx.stroke(); break;
    case "user":
      ctx.beginPath(); ctx.arc(0, -h * 0.28, h * 0.32, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, h * 0.78, h * 0.68, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); break;
    case "store":
      ctx.beginPath(); ctx.moveTo(-h * 0.8, -h * 0.2); ctx.lineTo(-h * 0.6, -h * 0.75); ctx.lineTo(h * 0.6, -h * 0.75); ctx.lineTo(h * 0.8, -h * 0.2); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.rect(-h * 0.65, -h * 0.2, h * 1.3, h * 0.95); ctx.stroke(); break;
    case "book":
      rr(ctx, -h * 0.6, -h * 0.7, h * 1.2, h * 1.4, h * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-h * 0.3, -h * 0.3); ctx.lineTo(h * 0.3, -h * 0.3); ctx.moveTo(-h * 0.3, 0); ctx.lineTo(h * 0.3, 0); ctx.stroke(); break;
    default:
      ctx.beginPath(); ctx.arc(0, 0, h * 0.6, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
function iconBadge(ctx, kind, cx, cy, r, color) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(color, 0.16); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); neon(ctx, color, 2, 10);
  ctx.restore();
  icon(ctx, kind, cx, cy, r * 1.1, color);
}

// ───────────────────────── nền / khung / panel ─────────────────────────
/** Nền biển sâu: gradient dọc, tia sáng, bong bóng, sóng mảnh và khung phát sáng. */
function ocean(ctx, H, accent = C.cyan, seed = 7) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#07294A"); g.addColorStop(0.45, "#041A33"); g.addColorStop(1, "#020B18");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // tia sáng từ mặt nước
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const x = 120 + i * 200;
    const lg = ctx.createLinearGradient(x, 0, x + 120, H * 0.7);
    lg.addColorStop(0, rgba(accent, 0.1)); lg.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 70, 0); ctx.lineTo(x + 230, H * 0.7); ctx.lineTo(x + 60, H * 0.7); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  glowSpot(ctx, 150, 100, 520, accent, 0.2);
  glowSpot(ctx, W - 80, H - 160, 560, C.blue, 0.16);
  // sóng mảnh
  const r = rng(seed);
  ctx.strokeStyle = "rgba(140,200,255,0.05)"; ctx.lineWidth = 1.2;
  for (let y = 70; y < H - 40; y += 46) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 12) { const yy = y + Math.sin(x / 38 + y) * 4; if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
    ctx.stroke();
  }
  // bong bóng
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = r() * H, rad = 2 + r() * 6;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(160,225,255,${0.12 + r() * 0.18})`; ctx.lineWidth = 1; ctx.stroke();
  }
  frame(ctx, H, accent);
}
function frame(ctx, H, accent) {
  const fg = ctx.createLinearGradient(0, 0, W, H);
  fg.addColorStop(0, rgba(accent, 0.95)); fg.addColorStop(0.5, rgba(C.blue, 0.4)); fg.addColorStop(1, rgba(accent, 0.85));
  rr(ctx, 14, 14, W - 28, H - 28, 36);
  ctx.save(); ctx.shadowColor = accent; ctx.shadowBlur = 20; ctx.strokeStyle = fg; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
  rr(ctx, 24, 24, W - 48, H - 48, 28);
  ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1; ctx.stroke();
}
function glass(ctx, x, y, w, h, color = C.cyan, { r = 24, alpha = 0.4, fill = "rgba(6,22,44,0.78)" } = {}) {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill; ctx.fill();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "rgba(255,255,255,0.08)"); g.addColorStop(1, "rgba(255,255,255,0.015)");
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  rr(ctx, x, y, w, h, r);
  ctx.save(); ctx.strokeStyle = rgba(color, alpha); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  ctx.save();
  const hl = ctx.createLinearGradient(x + r, 0, x + w - r, 0);
  hl.addColorStop(0, rgba(color, 0)); hl.addColorStop(0.5, rgba(color, 0.6)); hl.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = hl; ctx.fillRect(x + r, y + 0.5, Math.max(0, w - r * 2), 1.5);
  ctx.restore();
}
function pill(ctx, label, x, y, color, { size = 15, h = 32, align = "left", weight = 800, filled = false, padX = 16, iconKind = null } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FACE}`;
  const iw = iconKind ? size + 8 : 0;
  const w = ctx.measureText(label).width + padX * 2 + iw;
  const px = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  rr(ctx, px, y, w, h, h / 2);
  ctx.fillStyle = filled ? rgba(color, 0.9) : rgba(color, 0.16); ctx.fill();
  rr(ctx, px, y, w, h, h / 2);
  ctx.strokeStyle = rgba(color, filled ? 1 : 0.85); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
  let tx = px + padX;
  if (iconKind) { icon(ctx, iconKind, px + padX + size / 2 - 1, y + h / 2, size + 2, filled ? "#04101F" : color); tx += iw; }
  txt(ctx, label, tx, y + h / 2 + size * 0.36, { weight, size, color: filled ? "#04101F" : color });
  return w;
}
function header(ctx, { title, subtitle, accent = C.cyan, right, iconKind = "fish" }) {
  glass(ctx, PAD - 14, 52, W - (PAD - 14) * 2, 112, accent, { r: 30, alpha: 0.5 });
  iconBadge(ctx, iconKind, PAD + 44, 108, 34, accent);
  txt(ctx, title, PAD + 98, 104, { weight: 800, size: 36, glow: 16, spacing: 1, maxW: 560 });
  txt(ctx, subtitle, PAD + 98, 138, { weight: 600, size: 16, color: accent, spacing: 3 });
  if (right) right(ctx);
}
function footer(ctx, H, text = `${getConfiguredBotName()}  ·  FISHING RPG`) {
  txt(ctx, text, W / 2, H - 42, { weight: 700, size: 14, color: C.dim, align: "center", spacing: 3 });
}
async function avatar(ctx, avatarPath, name, cx, cy, r, color = C.cyan) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = "#0A2644"; ctx.fill();
  ctx.restore();
  let drawn = false;
  if (avatarPath && fs.existsSync(avatarPath)) {
    try {
      const img = await loadImage(avatarPath);
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2); ctx.clip();
      const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
      ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
      ctx.restore(); drawn = true;
    } catch { /* dùng chữ cái đầu */ }
  }
  if (!drawn) txt(ctx, String(name || "?").trim().slice(0, 1).toUpperCase(), cx, cy + r * 0.34, { weight: 800, size: r * 1.0, color, align: "center" });
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); neon(ctx, color, 2.5, 12);
}

// ───────────────────────── 1. BALO CÁ ─────────────────────────
/**
 * @param {{name:string, level:number, avatarPath?:string, groups:Array, fishTotal:number, typeTotal:number,
 *   slotsUsed:number, slotCap:number|null, totalValue:number, page:number, pages:number,
 *   rodName?:string, baitText?:string}} d
 *   groups[i] = { fishId, name, rarity, count, bestSize, totalValue, def }
 */
export async function renderBalo(d = {}) {
  const groups = d.groups || [];
  const cols = 4, gap = 16, cw = (W - PAD * 2 - gap * (cols - 1)) / cols, ch = 268;
  const rows = Math.max(1, Math.ceil(groups.length / cols));
  const bodyH = groups.length ? rows * (ch + gap) - gap : 300;
  const H = 236 + 120 + bodyH + 190;
  const { canvas, ctx } = newCanvas(H);
  ocean(ctx, H, C.cyan, 11);

  header(ctx, {
    title: "FISHING INVENTORY", subtitle: "FISH COLLECTION", accent: C.cyan, iconKind: "bag",
    right: (c) => {
      pill(c, d.pages > 1 ? `TRANG ${d.page}/${d.pages}` : "BALO CÁ", W - PAD - 18, 78, C.cyan, { align: "right", size: 15 });
    },
  });

  // thẻ người chơi + số liệu
  let y = 186;
  glass(ctx, PAD - 14, y, W - (PAD - 14) * 2, 120, C.blue, { r: 28, alpha: 0.4 });
  await avatar(ctx, d.avatarPath, d.name, PAD + 50, y + 60, 38, C.cyan);
  txt(ctx, d.name || "Người chơi", PAD + 106, y + 52, { weight: 800, size: 28, maxW: 330 });
  pill(ctx, `Lv.${d.level ?? 1}`, PAD + 106, y + 68, C.cyan, { size: 15, h: 30 });
  const stat = (label, big, small, x, color) => {
    txt(ctx, label, x, y + 38, { weight: 700, size: 12, color: C.sub, spacing: 2 });
    txt(ctx, big, x, y + 80, { weight: 800, size: 36, color, glow: 12 });
    txt(ctx, small, x, y + 102, { weight: 600, size: 13, color: C.sub });
  };
  stat("CÁ ĐANG CÓ", `${d.fishTotal ?? 0}`, `${d.typeTotal ?? 0} loài`, 520, C.green);
  const cap = d.slotCap == null ? "∞" : d.slotCap;
  stat("SỨC CHỨA BALO", `${d.slotsUsed ?? 0} / ${cap}`, "ô đang dùng", 700, C.amber);
  y += 120 + 24;

  txt(ctx, "BỘ SƯU TẬP CÁ", PAD, y + 22, { weight: 800, size: 17, color: C.cyan, spacing: 3 });
  txt(ctx, `Tổng giá trị ước tính: ${money(d.totalValue)}`, W - PAD, y + 22, { weight: 700, size: 16, color: C.green, align: "right" });
  y += 40;

  if (!groups.length) {
    glass(ctx, PAD, y, W - PAD * 2, 300, C.cyan, { r: 30, alpha: 0.3 });
    ctx.save(); ctx.globalAlpha = 0.5; icon(ctx, "fish", W / 2, y + 100, 110, C.cyan); ctx.restore();
    txt(ctx, "Balo chưa có con cá nào", W / 2, y + 186, { weight: 800, size: 30, align: "center" });
    txt(ctx, "Dùng .cauca cau để bắt đầu câu cá", W / 2, y + 226, { weight: 600, size: 18, color: C.sub, align: "center" });
  }
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const x = PAD + (i % cols) * (cw + gap);
    const cy = y + Math.floor(i / cols) * (ch + gap);
    const ri = rarityInfo(g.rarity);
    glass(ctx, x, cy, cw, ch, ri.color, { r: 24, alpha: 0.6 });
    // vùng ảnh cá
    glowSpot(ctx, x + cw / 2, cy + 84, 96, "#9CC8FF", 0.2);
    glowSpot(ctx, x + cw / 2, cy + 84, 96, ri.color, 0.22);
    await drawFish(ctx, g.def || { id: g.fishId, rarity: g.rarity }, x + 14, cy + 22, cw - 28, 118);
    // số lượng
    pill(ctx, `x${g.count}`, x + cw - 12, cy + 12, ri.color, { align: "right", size: 15, h: 28, filled: true, padX: 12 });
    // tên + sao
    fitName(ctx, g.name, x + cw / 2, cy + 168, cw - 22, { size: 21, min: 15 });
    stars(ctx, x + cw / 2, cy + 200, ri.stars, starSlots(ri), ri.color, { r: 7.5, gap: 3, align: "center" });
    txt(ctx, ri.label, x + cw / 2, cy + 224, { weight: 700, size: 12, color: ri.color, align: "center", spacing: 2 });
    txt(ctx, `${money(g.totalValue)}  ·  max ${g.bestSize ? `${Number(g.bestSize).toFixed(1)}cm` : "-"}`, x + cw / 2, cy + 249, { weight: 600, size: 13, color: C.sub, align: "center", maxW: cw - 16 });
  }
  y += bodyH + 26;

  // chân trang: điều hướng + trang bị
  glass(ctx, PAD - 14, y, W - (PAD - 14) * 2, 70, C.blue, { r: 24, alpha: 0.3 });
  const hint = d.pages > 1
    ? `Reply "next" / "back" hoặc số trang  ·  .cauca sell để bán cá`
    : `.cauca sell để bán cá  ·  .cauca map để đổi khu vực`;
  txt(ctx, hint, W / 2, y + 30, { weight: 700, size: 16, color: C.text, align: "center", maxW: W - 140 });
  const eq = [d.rodName ? `Cần: ${d.rodName}` : "", d.baitText ? `Mồi: ${d.baitText}` : ""].filter(Boolean).join("   ·   ");
  if (eq) txt(ctx, eq, W / 2, y + 54, { weight: 600, size: 13, color: C.sub, align: "center", maxW: W - 140 });
  footer(ctx, H);
  return canvas.toBuffer("image/png");
}

// ───────────────────────── 2. BẢN ĐỒ ─────────────────────────
function blob(ctx, cx, cy, rx, ry, seed, bumps = 10, jitter = 0.22) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i < bumps; i++) {
    const a = (i / bumps) * Math.PI * 2;
    const k = 1 + (r() - 0.5) * 2 * jitter;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  smoothClosed(ctx, pts);
}
function smoothClosed(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
}
function mountain(ctx, x, y, w, h, base = "#1F4B63", snow = true) {
  const g = ctx.createLinearGradient(x, y - h, x, y);
  g.addColorStop(0, "#5C8BA6"); g.addColorStop(1, base);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w * 0.08, y - h); ctx.lineTo(x + w * 0.1, y - h * 0.86); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.moveTo(x - w * 0.08, y - h); ctx.lineTo(x + w * 0.1, y - h * 0.86); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w * 0.05, y); ctx.closePath(); ctx.fill();
  if (snow) {
    ctx.fillStyle = "rgba(235,248,255,0.9)";
    ctx.beginPath(); ctx.moveTo(x - w * 0.08, y - h); ctx.lineTo(x - w * 0.2, y - h * 0.72); ctx.lineTo(x - w * 0.1, y - h * 0.66); ctx.lineTo(x - w * 0.02, y - h * 0.74); ctx.lineTo(x + w * 0.06, y - h * 0.68); ctx.lineTo(x + w * 0.1, y - h * 0.86); ctx.closePath(); ctx.fill();
  }
}
function palm(ctx, x, y, s, lean = 1) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = "#7A5A3A"; ctx.lineWidth = s * 0.09; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(lean * s * 0.15, -s * 0.5, lean * s * 0.1, -s); ctx.stroke();
  ctx.strokeStyle = "#2FBF71"; ctx.lineWidth = s * 0.07;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(lean * s * 0.1, -s);
    ctx.quadraticCurveTo(lean * s * 0.1 + i * s * 0.28, -s * 1.22, lean * s * 0.1 + i * s * 0.42, -s * 0.9 + Math.abs(i) * s * 0.06); ctx.stroke();
  }
  ctx.restore();
}
function hut(ctx, x, y, s) {
  ctx.fillStyle = "#6B4B33"; ctx.fillRect(x - s / 2, y - s * 0.55, s, s * 0.55);
  ctx.fillStyle = "#C2553A"; ctx.beginPath(); ctx.moveTo(x - s * 0.66, y - s * 0.55); ctx.lineTo(x, y - s * 1.1); ctx.lineTo(x + s * 0.66, y - s * 0.55); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#FFD27A"; ctx.fillRect(x - s * 0.1, y - s * 0.38, s * 0.2, s * 0.25);
}
function pine(ctx, x, y, s) {
  ctx.fillStyle = "#17503A";
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x, y - s * (0.55 + i * 0.32)); ctx.lineTo(x - s * (0.34 - i * 0.07), y - s * (0.12 + i * 0.3)); ctx.lineTo(x + s * (0.34 - i * 0.07), y - s * (0.12 + i * 0.3)); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = "#4A3426"; ctx.fillRect(x - s * 0.04, y - s * 0.14, s * 0.08, s * 0.16);
}

const MAP_NODES = {
  ho_be:     { x: 250, y: 1240, card: [334, 1172], dir: 1, accent: "#34E5A0" },
  song_lang: { x: 748, y: 956,  card: [296, 890],  dir: -1, accent: "#4C9AFF" },
  bien_xanh: { x: 252, y: 646,  card: [336, 578],  dir: 1, accent: "#22D3EE" },
  vuc_sau:   { x: 748, y: 312,  card: [310, 246],  dir: -1, accent: "#B26BFF" },
};
const MAP_ORDER = ["ho_be", "song_lang", "bien_xanh", "vuc_sau"];

function drawWorldBackground(ctx, H) {
  // biển + độ sâu theo chiều dọc
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0A0618"); g.addColorStop(0.2, "#08183A"); g.addColorStop(0.42, "#0B5C85"); g.addColorStop(0.6, "#0F7FA8"); g.addColorStop(0.62, "#0B4C6E"); g.addColorStop(1, "#052033");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = rng(99);

  // ── VỰC SÂU: hố đen + vòng sâu + khe nứt phát sáng
  const ax = 700, ay = 300;
  for (let i = 7; i >= 1; i--) {
    ctx.beginPath(); ctx.ellipse(ax, ay, 90 + i * 52, 60 + i * 34, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(2,4,18,${0.09 + (8 - i) * 0.05})`; ctx.fill();
  }
  ctx.strokeStyle = "rgba(178,107,255,0.55)"; ctx.lineWidth = 2; ctx.shadowColor = "#B26BFF"; ctx.shadowBlur = 16;
  for (let k = 0; k < 6; k++) {
    let px = ax + (r() - 0.5) * 80, py = ay + (r() - 0.5) * 50;
    ctx.beginPath(); ctx.moveTo(px, py);
    for (let s = 0; s < 6; s++) { px += (r() - 0.5) * 70; py += (r() - 0.3) * 38; ctx.lineTo(px, py); }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  glowSpot(ctx, ax, ay, 240, "#7C3AED", 0.28);
  // đá ngầm tối quanh vực
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = 220 + r() * 150;
    ctx.fillStyle = "rgba(5,8,26,0.8)"; blob(ctx, ax + Math.cos(a) * d, ay + Math.sin(a) * d * 0.7, 26 + r() * 30, 16 + r() * 16, 100 + i, 8, 0.3); ctx.fill();
  }

  // ── BIỂN XANH: sóng, rạn san hô, đảo
  ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1.6;
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = 400 + r() * 440, w = 18 + r() * 30;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w / 2, y - 7, x + w, y); ctx.stroke();
  }
  // đảo nhỏ phía phải + đảo núi
  const island = (cx, cy, rx, ry, seed) => {
    ctx.fillStyle = "rgba(255,255,255,0.18)"; blob(ctx, cx, cy + 6, rx + 16, ry + 12, seed, 12, 0.18); ctx.fill();
    ctx.fillStyle = "#E7D3A0"; blob(ctx, cx, cy, rx + 6, ry + 4, seed, 12, 0.18); ctx.fill();
    const lg = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry); lg.addColorStop(0, "#38C171"); lg.addColorStop(1, "#1B7D4B");
    ctx.fillStyle = lg; blob(ctx, cx, cy - 4, rx - 6, ry - 6, seed + 1, 12, 0.16); ctx.fill();
  };
  island(868, 600, 92, 50, 21); palm(ctx, 846, 600, 54, 1); palm(ctx, 886, 608, 44, -1); hut(ctx, 912, 600, 20);
  island(560, 770, 70, 34, 33); palm(ctx, 556, 768, 36, 1);
  island(150, 470, 72, 36, 45); mountain(ctx, 150, 466, 90, 62, "#22506B", true);

  // ── ĐẤT LIỀN phía dưới (Sông Làng + Hồ Bé)
  const coast = [[0, 880], [90, 850], [220, 870], [330, 830], [470, 858], [610, 820], [760, 846], [880, 812], [1000, 836]];
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, coast[0][1]);
  for (let i = 1; i < coast.length; i++) { const p = coast[i - 1], q = coast[i]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  ctx.lineTo(W, coast[coast.length - 1][1]); ctx.lineTo(W, H); ctx.closePath();
  const lg = ctx.createLinearGradient(0, 820, 0, H);
  lg.addColorStop(0, "#2C8C56"); lg.addColorStop(0.35, "#1C6C47"); lg.addColorStop(1, "#0E3D2C");
  ctx.save(); ctx.shadowColor = "rgba(255,255,255,0.5)"; ctx.shadowBlur = 18; ctx.fillStyle = lg; ctx.fill(); ctx.restore();
  // bãi cát ven bờ
  ctx.strokeStyle = "rgba(240,224,170,0.8)"; ctx.lineWidth = 6; ctx.stroke();
  // núi + hang động bên trái
  mountain(ctx, 90, 1010, 190, 160, "#1D5A55"); mountain(ctx, 200, 1000, 150, 118, "#1B4F4C"); mountain(ctx, 20, 1030, 130, 110, "#1D5A55", false);
  ctx.fillStyle = "#050B14"; ctx.beginPath(); ctx.moveTo(150, 1000); ctx.quadraticCurveTo(160, 950, 190, 950); ctx.quadraticCurveTo(222, 950, 232, 1000); ctx.closePath(); ctx.fill();
  glowSpot(ctx, 190, 985, 40, "#22D3EE", 0.5);
  // rừng thông
  for (let i = 0; i < 26; i++) pine(ctx, 20 + r() * 960, 905 + r() * 120, 34 + r() * 22);
  // sông chảy từ hồ ra biển
  const river = [[250, 1240], [380, 1160], [520, 1120], [660, 1050], [740, 980], [640, 920], [590, 850]];
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const [w, c] of [[52, "#0A5C7A"], [40, "#1FA7D6"], [18, "rgba(190,240,255,0.55)"]]) {
    ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(river[0][0], river[0][1]);
    for (let i = 1; i < river.length - 1; i++) { const p = river[i], q = river[i + 1]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
    ctx.lineTo(river[river.length - 1][0], river[river.length - 1][1]); ctx.stroke();
  }
  ctx.restore();
  // làng bên sông
  hut(ctx, 840, 1070, 30); hut(ctx, 884, 1090, 26); hut(ctx, 800, 1100, 24);
  // đồng cỏ + hồ
  const lake = ctx.createRadialGradient(250, 1250, 10, 250, 1250, 150);
  lake.addColorStop(0, "#58D5F5"); lake.addColorStop(0.7, "#1B9AC7"); lake.addColorStop(1, "#0E6E94");
  ctx.save(); ctx.shadowColor = "rgba(34,211,238,0.6)"; ctx.shadowBlur = 24; ctx.fillStyle = lake; blob(ctx, 250, 1250, 150, 92, 61, 12, 0.14); ctx.fill(); ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = "#2E8A5A"; ctx.lineWidth = 3;
  for (let i = 0; i < 18; i++) { const x = 110 + r() * 280, y = 1300 + r() * 20; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 8, y - 22 - r() * 14); ctx.stroke(); }
  for (let i = 0; i < 12; i++) pine(ctx, 460 + r() * 520, 1330 + r() * 90, 32 + r() * 22);
  // sương mù ranh giới các vùng
  for (const fy of [420, 820, 1120]) {
    const fgq = ctx.createLinearGradient(0, fy - 70, 0, fy + 70);
    fgq.addColorStop(0, "rgba(220,240,255,0)"); fgq.addColorStop(0.5, "rgba(220,240,255,0.1)"); fgq.addColorStop(1, "rgba(220,240,255,0)");
    ctx.fillStyle = fgq; ctx.fillRect(0, fy - 70, W, 140);
  }
  // làm tối nhẹ để chữ nổi
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,8,20,0.5)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

function drawPath(ctx, pts, color) {
  ctx.save();
  ctx.setLineDash([2, 16]); ctx.lineCap = "round"; ctx.lineWidth = 7;
  ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.strokeStyle = rgba("#FFFFFF", 0.95);
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.quadraticCurveTo(pts[i][2], pts[i][3], pts[i][0], pts[i][1]);
  ctx.stroke(); ctx.restore();
}

/**
 * @param {{name:string, level:number, avatarPath?:string,
 *   maps:Array<{id:string,name:string,order:number,stars:number,diffLabel:string,requiredLevel:number,
 *               reqText?:string, state:"here"|"open"|"locked", lockReason?:string, index:number}>}} d
 */
export async function renderWorldMap(d = {}) {
  const H = 1500;
  const { canvas, ctx } = newCanvas(H);
  drawWorldBackground(ctx, H);
  frame(ctx, H, C.cyan);

  // header
  glass(ctx, PAD - 14, 52, W - (PAD - 14) * 2, 112, C.cyan, { r: 30, alpha: 0.55, fill: "rgba(4,16,36,0.82)" });
  iconBadge(ctx, "map", PAD + 44, 108, 34, C.cyan);
  txt(ctx, "FISHING WORLD", PAD + 98, 104, { weight: 800, size: 38, glow: 16, spacing: 1 });
  txt(ctx, "BẢN ĐỒ CÂU CÁ", PAD + 98, 138, { weight: 600, size: 16, color: C.cyan, spacing: 4 });
  pill(ctx, `${d.name || "Người chơi"}  ·  Lv.${d.level ?? 1}`, W - PAD - 18, 90, C.cyan, { align: "right", size: 16, h: 36, iconKind: "user" });

  const byId = new Map((d.maps || []).map((m) => [m.id, m]));
  // đường đi giữa các nút
  const P = MAP_ORDER.map((id) => MAP_NODES[id]);
  drawPath(ctx, [[P[0].x, P[0].y], [P[1].x, P[1].y, 560, 1180]], "#FFFFFF");
  drawPath(ctx, [[P[1].x, P[1].y], [P[2].x, P[2].y, 640, 800]], "#FFFFFF");
  drawPath(ctx, [[P[2].x, P[2].y], [P[3].x, P[3].y, 500, 420]], "#FFFFFF");

  // các điểm câu
  for (const id of MAP_ORDER) {
    const m = byId.get(id);
    const n = MAP_NODES[id];
    if (!m) continue;
    const locked = m.state === "locked", here = m.state === "here";
    const col = locked ? "#64748B" : here ? "#34E5A0" : n.accent;
    // card
    const [cx, cy] = n.card, cw = 400, chh = 134;
    ctx.save();
    if (locked) ctx.globalAlpha = 0.82;
    glass(ctx, cx, cy, cw, chh, col, { r: 26, alpha: locked ? 0.4 : 0.9, fill: locked ? "rgba(6,12,24,0.88)" : "rgba(4,18,40,0.86)" });
    txt(ctx, m.name, cx + 26, cy + 44, { weight: 800, size: 30, color: locked ? "#9AA8BC" : "#FFFFFF", glow: locked ? 0 : 10, maxW: cw - 150 });
    stars(ctx, cx + 36, cy + 70, locked ? 0 : m.stars, 4, locked ? "#64748B" : C.amber, { r: 8.5, gap: 4 });
    // sao khoá hiển thị mờ nhưng vẫn đủ số
    if (locked) { ctx.globalAlpha = 0.5; stars(ctx, cx + 36, cy + 70, m.stars, 4, "#8CA0B8", { r: 8.5, gap: 4 }); ctx.globalAlpha = 0.82; }
    txt(ctx, m.diffLabel || "", cx + 36 + 4 * 21 + 8, cy + 75, { weight: 600, size: 15, color: locked ? "#7C8BA0" : C.sub });
    pill(ctx, m.reqText || `Lv.${m.requiredLevel}+`, cx + 24, cy + 90, locked ? "#8CA0B8" : C.cyan, { size: 14, h: 30, padX: 14 });
    if (here) pill(ctx, "ĐANG Ở ĐÂY", cx + cw - 22, cy + 16, "#34E5A0", { align: "right", size: 14, h: 30, filled: true, padX: 14 });
    else if (locked) pill(ctx, "CHƯA MỞ", cx + cw - 22, cy + 16, "#FF9AAE", { align: "right", size: 14, h: 30, padX: 14, iconKind: "lock" });
    else pill(ctx, "SẴN SÀNG", cx + cw - 22, cy + 16, C.cyan, { align: "right", size: 14, h: 30, padX: 14 });
    if (locked && m.lockReason) txt(ctx, m.lockReason, cx + cw - 22, cy + 70, { weight: 700, size: 13, color: "#FFB4C0", align: "right", maxW: 170 });
    ctx.restore();

    // nút trên bản đồ
    if (here) {
      for (const [rad, a] of [[58, 0.14], [46, 0.24]]) { ctx.beginPath(); ctx.arc(n.x, n.y, rad, 0, Math.PI * 2); ctx.fillStyle = rgba("#34E5A0", a); ctx.fill(); }
      ctx.beginPath(); ctx.arc(n.x, n.y, 58, 0, Math.PI * 2); neon(ctx, "#34E5A0", 2.5, 18);
    }
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = locked ? 0 : 22;
    ctx.beginPath(); ctx.arc(n.x, n.y, 34, 0, Math.PI * 2);
    const ng = ctx.createRadialGradient(n.x - 8, n.y - 10, 4, n.x, n.y, 36);
    ng.addColorStop(0, locked ? "#475569" : "#EFFFFF"); ng.addColorStop(1, locked ? "#1E293B" : col);
    ctx.fillStyle = ng; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(n.x, n.y, 34, 0, Math.PI * 2); ctx.strokeStyle = locked ? "#64748B" : "#FFFFFF"; ctx.lineWidth = 3; ctx.stroke();
    txt(ctx, String(m.index), n.x, n.y + 12, { weight: 800, size: 34, color: locked ? "#94A3B8" : "#04283A", align: "center" });
    if (here) { icon(ctx, "pin", n.x, n.y - 62, 34, "#34E5A0"); }
    if (locked) { iconBadge(ctx, "lock", n.x + 30, n.y - 30, 15, "#FF9AAE"); }
  }

  // thanh hướng dẫn phía dưới
  const gy = 1352;
  glass(ctx, PAD - 14, gy, W - (PAD - 14) * 2, 98, C.cyan, { r: 28, alpha: 0.55, fill: "rgba(4,16,36,0.88)" });
  txt(ctx, "Reply số để di chuyển", PAD + 18, gy + 38, { weight: 800, size: 20, color: C.cyan });
  let lx = PAD + 18;
  for (const id of MAP_ORDER) {
    const m = byId.get(id); if (!m) continue;
    const locked = m.state === "locked";
    const label = `${m.index}  ${m.name}`;
    const w = pill(ctx, label, lx, gy + 52, locked ? "#64748B" : m.state === "here" ? "#34E5A0" : C.cyan, { size: 14, h: 30, padX: 14 });
    lx += w + 10;
  }
  let dx = W - PAD - 6;
  for (const [label, col] of [["Chưa mở", "#64748B"], ["Sẵn sàng", C.cyan], ["Đang ở đây", "#34E5A0"]]) {
    ctx.font = `600 13px ${FACE}`;
    const tw = ctx.measureText(label).width;
    txt(ctx, label, dx, gy + 38, { weight: 600, size: 13, color: C.sub, align: "right" });
    ctx.beginPath(); ctx.arc(dx - tw - 12, gy + 33.5, 5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    dx -= tw + 36;
  }
  return canvas.toBuffer("image/png");
}

// ───────────────────────── 3. CHỢ CÁ ─────────────────────────
function awning(ctx, x, y, w, color) {
  const n = 24, sw = w / n;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? rgba(color, 0.9) : "rgba(230,245,255,0.92)";
    ctx.beginPath(); ctx.moveTo(x + i * sw, y); ctx.lineTo(x + (i + 1) * sw, y); ctx.lineTo(x + (i + 1) * sw, y + 14); ctx.arc(x + i * sw + sw / 2, y + 14, sw / 2, 0, Math.PI, false); ctx.closePath(); ctx.fill();
  }
}

/**
 * @param {{name:string, balance?:number, groups:Array<{index:number,name,rarity,count,unitAvg,totalValue,def}>,
 *          totalValue:number, fishTotal:number}} d
 */
export async function renderMarket(d = {}) {
  const groups = d.groups || [];
  const ROW = 88, GAP = 10;
  const listH = groups.length ? groups.length * (ROW + GAP) - GAP : 220;
  const bodyH = Math.max(listH, 520);
  const H = 212 + 56 + bodyH + 100 + 90;
  const { canvas, ctx } = newCanvas(H);
  ocean(ctx, H, C.amber, 21);

  awning(ctx, PAD - 14, 36, W - (PAD - 14) * 2, C.amber);
  glass(ctx, PAD - 14, 86, W - (PAD - 14) * 2, 100, C.amber, { r: 26, alpha: 0.5 });
  iconBadge(ctx, "store", PAD + 40, 136, 32, C.amber);
  txt(ctx, "FISH MARKET", PAD + 92, 134, { weight: 800, size: 36, glow: 16, spacing: 1 });
  txt(ctx, "CHỢ CÁ  ·  MUA BÁN HẢI SẢN", PAD + 92, 166, { weight: 600, size: 15, color: C.amber, spacing: 3 });
  if (d.balance != null) pill(ctx, `Số dư ${money(d.balance)}`, W - PAD - 6, 118, C.green, { align: "right", size: 16, h: 36, iconKind: "coin" });

  let y = 212;
  const lw = 560, rx = PAD - 14 + lw + 18, rw = W - rx - (PAD - 14);
  // trái: cá của bạn
  glass(ctx, PAD - 14, y, lw, bodyH + 56, C.cyan, { r: 28, alpha: 0.4 });
  txt(ctx, "CÁ CỦA BẠN", PAD + 12, y + 38, { weight: 800, size: 18, color: C.cyan, spacing: 3 });
  txt(ctx, `${d.fishTotal ?? 0} con`, PAD - 14 + lw - 22, y + 38, { weight: 700, size: 16, color: C.sub, align: "right" });
  let ry = y + 56;
  if (!groups.length) {
    ctx.save(); ctx.globalAlpha = 0.45; icon(ctx, "fish", PAD - 14 + lw / 2, ry + 80, 100, C.cyan); ctx.restore();
    txt(ctx, "Balo chưa có cá để bán", PAD - 14 + lw / 2, ry + 160, { weight: 800, size: 24, align: "center" });
    txt(ctx, "Dùng .cauca cau để câu cá", PAD - 14 + lw / 2, ry + 194, { weight: 600, size: 16, color: C.sub, align: "center" });
  }
  for (const g of groups) {
    const ri = rarityInfo(g.rarity);
    const x0 = PAD + 2, w0 = lw - 32;
    glass(ctx, x0, ry, w0, ROW, ri.color, { r: 20, alpha: 0.45, fill: "rgba(4,16,34,0.7)" });
    // số thứ tự
    ctx.beginPath(); ctx.arc(x0 + 34, ry + ROW / 2, 20, 0, Math.PI * 2); ctx.fillStyle = rgba(ri.color, 0.2); ctx.fill();
    ctx.beginPath(); ctx.arc(x0 + 34, ry + ROW / 2, 20, 0, Math.PI * 2); neon(ctx, ri.color, 2, 8);
    txt(ctx, String(g.index), x0 + 34, ry + ROW / 2 + 8, { weight: 800, size: 22, align: "center" });
    await drawFish(ctx, g.def || { id: g.fishId, rarity: g.rarity }, x0 + 64, ry + 10, 92, ROW - 20, { glow: false });
    txt(ctx, g.name, x0 + 168, ry + 38, { weight: 800, size: 22, maxW: 190 });
    stars(ctx, x0 + 176, ry + 62, ri.stars, starSlots(ri), ri.color, { r: 6.5, gap: 3 });
    pill(ctx, `x${g.count}`, x0 + w0 - 14, ry + 14, ri.color, { align: "right", size: 15, h: 28, filled: true, padX: 12 });
    txt(ctx, money(g.totalValue), x0 + w0 - 16, ry + 66, { weight: 800, size: 19, color: C.green, align: "right" });
    ry += ROW + GAP;
  }

  // phải: bán cá
  glass(ctx, rx, y, rw, bodyH + 56, C.amber, { r: 28, alpha: 0.5 });
  txt(ctx, "BÁN CÁ", rx + 24, y + 38, { weight: 800, size: 18, color: C.amber, spacing: 3 });
  txt(ctx, "Reply số cá muốn bán", rx + 24, y + 80, { weight: 800, size: 20, maxW: rw - 40 });
  txt(ctx, "Chọn nhiều loài trong một tin nhắn", rx + 24, y + 106, { weight: 600, size: 14, color: C.sub, maxW: rw - 40 });
  const ex = [
    ["1 2 3", "bán toàn bộ loài số 1, 2, 3"],
    ["1x5 2x3", "bán 5 con loài 1, 3 con loài 2"],
    ["all", "bán tất cả cá trong balo"],
  ];
  let ey = y + 132;
  for (const [code, desc] of ex) {
    glass(ctx, rx + 18, ey, rw - 36, 76, C.cyan, { r: 18, alpha: 0.3, fill: "rgba(4,16,34,0.7)" });
    txt(ctx, code, rx + 36, ey + 34, { weight: 800, size: 24, color: C.cyan, glow: 8 });
    txt(ctx, desc, rx + 36, ey + 58, { weight: 600, size: 13, color: C.sub, maxW: rw - 70 });
    ey += 86;
  }
  // nút BÁN ALL (minh hoạ)
  ey += 6;
  rr(ctx, rx + 18, ey, rw - 36, 58, 29);
  const bg = ctx.createLinearGradient(rx, ey, rx + rw, ey); bg.addColorStop(0, "#F59E0B"); bg.addColorStop(1, "#FBBF24");
  ctx.save(); ctx.shadowColor = C.amber; ctx.shadowBlur = 18; ctx.fillStyle = bg; ctx.fill(); ctx.restore();
  txt(ctx, "BÁN ALL  ·  reply all", rx + rw / 2, ey + 37, { weight: 800, size: 19, color: "#2A1800", align: "center" });
  ey += 86;
  txt(ctx, "TỔNG GIÁ TRỊ", rx + 24, ey, { weight: 700, size: 13, color: C.sub, spacing: 2 });
  txt(ctx, money(d.totalValue), rx + 24, ey + 46, { weight: 800, size: 38, color: C.green, glow: 14, maxW: rw - 44 });

  y += bodyH + 56 + 26;
  glass(ctx, PAD - 14, y, W - (PAD - 14) * 2, 56, C.blue, { r: 22, alpha: 0.3 });
  txt(ctx, "Sau khi chọn, bot gửi ảnh xác nhận  ·  reply yes để bán  ·  no để hủy", W / 2, y + 35, { weight: 600, size: 15, color: C.text, align: "center", maxW: W - 120 });
  footer(ctx, H);
  return canvas.toBuffer("image/png");
}

// ───────────────────────── 4. XÁC NHẬN / THÀNH CÔNG ─────────────────────────
async function receipt(ctx, y, lines, accent) {
  const ROW = 84, GAP = 10;
  const h = lines.length * (ROW + GAP) - GAP + 36;
  glass(ctx, PAD - 14, y, W - (PAD - 14) * 2, h, accent, { r: 28, alpha: 0.5 });
  let ry = y + 18;
  for (const l of lines) {
    const ri = rarityInfo(l.rarity);
    glass(ctx, PAD + 6, ry, W - (PAD + 6) * 2, ROW, ri.color, { r: 20, alpha: 0.4, fill: "rgba(4,16,34,0.7)" });
    await drawFish(ctx, l.def || { id: l.fishId, rarity: l.rarity }, PAD + 18, ry + 8, 96, ROW - 16, { glow: false });
    txt(ctx, l.name, PAD + 130, ry + 38, { weight: 800, size: 24, maxW: 300 });
    stars(ctx, PAD + 138, ry + 62, ri.stars, starSlots(ri), ri.color, { r: 6.5, gap: 3 });
    pill(ctx, `x${l.qty}`, W - PAD - 190, ry + ROW / 2 - 15, ri.color, { align: "right", size: 16, h: 30, padX: 14, filled: true });
    txt(ctx, money(l.value), W - PAD - 6 - 14, ry + ROW / 2 + 9, { weight: 800, size: 26, color: C.green, align: "right" });
    ry += ROW + GAP;
  }
  return y + h;
}
const linesHeight = (n) => n * 94 - 10 + 36;

export async function renderSellConfirm(d = {}) {
  const lines = (d.lines || []).slice(0, 16);
  const more = (d.lines || []).length - lines.length;
  const H = 200 + linesHeight(lines.length) + (more > 0 ? 40 : 0) + 190 + 190;
  const { canvas, ctx } = newCanvas(H);
  ocean(ctx, H, C.amber, 31);
  header(ctx, { title: "XÁC NHẬN BÁN CÁ", subtitle: "FISH MARKET  ·  CHECKOUT", accent: C.amber, iconKind: "store",
    right: (c) => pill(c, `${d.count ?? 0} CON`, W - PAD - 18, 78, C.amber, { align: "right", size: 15 }) });
  let y = await receipt(ctx, 184, lines, C.amber);
  if (more > 0) { txt(ctx, `… và ${more} loài khác`, W / 2, y + 30, { weight: 600, size: 16, color: C.sub, align: "center" }); y += 40; }
  y += 22;
  glass(ctx, PAD - 14, y, W - (PAD - 14) * 2, 120, C.green, { r: 28, alpha: 0.8, fill: "rgba(4,28,26,0.82)" });
  txt(ctx, "TỔNG NHẬN", PAD + 20, y + 44, { weight: 800, size: 17, color: C.green, spacing: 3 });
  txt(ctx, money(d.total), PAD + 20, y + 98, { weight: 800, size: 54, color: "#FFFFFF", glow: 20, maxW: 560 });
  if (d.balance != null) {
    txt(ctx, "SỐ DƯ HIỆN TẠI", W - PAD - 6, y + 44, { weight: 700, size: 13, color: C.sub, align: "right", spacing: 2 });
    txt(ctx, money(d.balance), W - PAD - 6, y + 80, { weight: 800, size: 26, color: C.text, align: "right" });
    txt(ctx, `Sau bán: ${money((d.balance || 0) + (d.total || 0))}`, W - PAD - 6, y + 104, { weight: 600, size: 14, color: C.green, align: "right" });
  }
  y += 120 + 22;
  const bw = (W - PAD * 2 - 20) / 2;
  rr(ctx, PAD, y, bw, 60, 30); ctx.save(); ctx.shadowColor = C.green; ctx.shadowBlur = 16; ctx.fillStyle = "#2BD98C"; ctx.fill(); ctx.restore();
  txt(ctx, 'Reply "yes" để xác nhận', PAD + bw / 2, y + 38, { weight: 800, size: 19, color: "#032416", align: "center" });
  rr(ctx, PAD + bw + 20, y, bw, 60, 30); ctx.fillStyle = rgba(C.red, 0.16); ctx.fill();
  rr(ctx, PAD + bw + 20, y, bw, 60, 30); neon(ctx, C.red, 2, 10);
  txt(ctx, 'Reply "no" để hủy', PAD + bw + 20 + bw / 2, y + 38, { weight: 800, size: 19, color: "#FF9AAE", align: "center" });
  txt(ctx, "Xác nhận tự hết hạn sau 2 phút", W / 2, y + 96, { weight: 600, size: 14, color: C.dim, align: "center" });
  footer(ctx, H);
  return canvas.toBuffer("image/png");
}

export async function renderSellSuccess(d = {}) {
  const lines = (d.lines || []).slice(0, 16);
  const more = (d.lines || []).length - lines.length;
  const H = 330 + linesHeight(lines.length) + (more > 0 ? 40 : 0) + 230 + 90;
  const { canvas, ctx } = newCanvas(H);
  ocean(ctx, H, C.green, 41);
  // huy hiệu thành công
  const cx = W / 2, cy = 150;
  glowSpot(ctx, cx, cy, 190, C.green, 0.28);
  ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2); ctx.fillStyle = rgba(C.green, 0.16); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2); neon(ctx, C.green, 4, 24);
  icon(ctx, "check", cx, cy, 66, "#FFFFFF");
  txt(ctx, "BÁN CÁ THÀNH CÔNG", cx, 262, { weight: 800, size: 40, align: "center", glow: 18, spacing: 1 });
  txt(ctx, "FISH MARKET  ·  TRANSACTION COMPLETE", cx, 292, { weight: 600, size: 14, color: C.green, align: "center", spacing: 3 });
  let y = await receipt(ctx, 322, lines, C.green);
  if (more > 0) { txt(ctx, `… và ${more} loài khác`, W / 2, y + 30, { weight: 600, size: 16, color: C.sub, align: "center" }); y += 40; }
  y += 22;
  const hw = (W - PAD * 2 - 18) / 2;
  glass(ctx, PAD - 14 + 14, y, hw, 150, C.green, { r: 26, alpha: 0.8, fill: "rgba(4,28,26,0.82)" });
  iconBadge(ctx, "coin", PAD + 44, y + 40, 22, C.green);
  txt(ctx, "NHẬN ĐƯỢC", PAD + 80, y + 46, { weight: 800, size: 15, color: C.green, spacing: 2 });
  txt(ctx, `+${money(d.total)}`, PAD + 14, y + 112, { weight: 800, size: 44, color: "#FFFFFF", glow: 14, maxW: hw - 30 });
  glass(ctx, PAD + hw + 18, y, hw, 150, C.cyan, { r: 26, alpha: 0.7 });
  iconBadge(ctx, "bag", PAD + hw + 18 + 30, y + 40, 22, C.cyan);
  txt(ctx, "SỐ DƯ MỚI", PAD + hw + 18 + 66, y + 46, { weight: 800, size: 15, color: C.cyan, spacing: 2 });
  txt(ctx, d.balance != null ? money(d.balance) : "—", PAD + hw + 18 + 16, y + 112, { weight: 800, size: 44, color: "#FFFFFF", glow: 14, maxW: hw - 34 });
  txt(ctx, "Balo đã được cập nhật  ·  .cauca balo để xem", W / 2, y + 190, { weight: 600, size: 15, color: C.sub, align: "center" });
  footer(ctx, H);
  return canvas.toBuffer("image/png");
}

// ───────────────────────── 5. HELP ─────────────────────────
export async function renderHelp(d = {}) {
  const p = d.prefix || ".";
  const items = [
    ["rod", `${p}cauca cau`, "Quăng cần câu một lần", C.cyan],
    ["bag", `${p}cauca balo`, "Bộ sưu tập cá trong balo", C.blue],
    ["map", `${p}cauca map`, "Bản đồ thế giới & di chuyển", C.green],
    ["store", `${p}cauca sell`, "Chợ cá: bán cá lấy tiền", C.amber],
    ["user", `${p}cauca info`, "Thông tin cần thủ của bạn", C.cyan],
    ["trophy", `${p}cauca rank`, "TOP 15 cần thủ", C.amber],
    ["rod", `${p}cauca rod`, "Xem / đổi cần câu", C.blue],
    ["bait", `${p}cauca bait`, "Xem / đổi mồi", C.green],
  ];
  const rowH = 92, H = 190 + Math.ceil(items.length / 2) * (rowH + 14) + 180;
  const { canvas, ctx } = newCanvas(H);
  ocean(ctx, H, C.cyan, 51);
  header(ctx, { title: "CÂU CÁ", subtitle: "HNNP FISHING  ·  RPG", accent: C.cyan, iconKind: "rod" });
  const cw = (W - PAD * 2 - 16) / 2;
  items.forEach((it, i) => {
    const x = PAD - 6 + (i % 2) * (cw + 16), y = 190 + Math.floor(i / 2) * (rowH + 14);
    glass(ctx, x, y, cw - 4, rowH, it[3], { r: 24, alpha: 0.5 });
    iconBadge(ctx, it[0], x + 46, y + rowH / 2, 28, it[3]);
    txt(ctx, it[1], x + 94, y + 40, { weight: 800, size: 22, color: it[3], maxW: cw - 120 });
    txt(ctx, it[2], x + 94, y + 68, { weight: 600, size: 15, color: C.sub, maxW: cw - 120 });
  });
  const y = 190 + Math.ceil(items.length / 2) * (rowH + 14) + 6;
  glass(ctx, PAD - 6, y, W - (PAD - 6) * 2, 96, C.blue, { r: 24, alpha: 0.35 });
  txt(ctx, "Mặc định: Cần Tre  ·  Mồi Giun  ·  Hồ Bé", W / 2, y + 38, { weight: 700, size: 17, align: "center" });
  txt(ctx, "Mua cần & mồi: .shop → Trang bị → Câu Cá   ·   Cá câu được nằm trong .cauca balo", W / 2, y + 68, { weight: 600, size: 14, color: C.sub, align: "center", maxW: W - 150 });
  footer(ctx, H);
  return canvas.toBuffer("image/png");
}

// ───────────────────────── 6. THÔNG BÁO ─────────────────────────
/** @param {{kind?:"error"|"info"|"warn"|"ok", title:string, lines?:string[]}} d */
export async function renderNotice(d = {}) {
  const kind = d.kind || "info";
  const color = kind === "error" ? C.red : kind === "warn" ? C.amber : kind === "ok" ? C.green : C.cyan;
  const ic = kind === "error" ? "cross" : kind === "ok" ? "check" : kind === "warn" ? "lock" : "fish";
  const lines = (d.lines || []).slice(0, 6);
  const H = 400 + lines.length * 40 + 90;
  const { canvas, ctx } = newCanvas(H);
  ocean(ctx, H, color, 61);
  const cx = W / 2, cy = 190;
  glowSpot(ctx, cx, cy, 180, color, 0.25);
  ctx.beginPath(); ctx.arc(cx, cy, 56, 0, Math.PI * 2); ctx.fillStyle = rgba(color, 0.15); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 56, 0, Math.PI * 2); neon(ctx, color, 3.5, 20);
  icon(ctx, ic, cx, cy, 62, "#FFFFFF");
  txt(ctx, d.title || "THÔNG BÁO", cx, 300, { weight: 800, size: 36, align: "center", glow: 14, maxW: W - PAD * 2 });
  let y = 350;
  for (const l of lines) { txt(ctx, l, cx, y + 12, { weight: 600, size: 20, color: "#C9DDF2", align: "center", maxW: W - PAD * 2 }); y += 40; }
  footer(ctx, H);
  return canvas.toBuffer("image/png");
}
