/**
 * Bộ dựng giao diện neon dùng chung cho mọi màn hình Pokémon.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, registerFont } from "canvas";
import { TYPES } from "../constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FONT = "PokeUI";
const fontDir = path.join(__dirname, "..", "..", "..", "MEDIA", "fonts");
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  fontsReady = true;
  for (const [file, weight] of [
    ["BeVietnamPro_800ExtraBold.ttf", "800"], ["BeVietnamPro_700Bold.ttf", "bold"],
    ["BeVietnamPro_600SemiBold.ttf", "600"], ["BeVietnamPro_400Regular.ttf", "normal"],
  ]) {
    const p = path.join(fontDir, file);
    if (fs.existsSync(p)) { try { registerFont(p, { family: FONT, weight }); } catch { /* đã đăng ký */ } }
  }
}

export const C = {
  bg: "#050816", bg2: "#0b1030", bg3: "#170a35",
  cyan: "#22d3ee", blue: "#3b82f6", purple: "#a855f7", pink: "#ec4899", yellow: "#fbbf24",
  green: "#4ade80", red: "#f43f5e", orange: "#fb923c",
  text: "#f1f5f9", muted: "#94a3b8", dim: "#64748b",
  card: "rgba(16,24,48,0.82)", cardHi: "rgba(30,41,82,0.9)",
};
export const RARITY_COLOR = { common: "#94a3b8", uncommon: "#4ade80", rare: "#38bdf8", epic: "#a855f7", legendary: "#fbbf24" };
export const SCALE = 1.5;

export function hexA(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function typeColor(t) {
  return TYPES[t]?.color || "#A8A878";
}

export function createScene(w, h) {
  ensureFonts();
  const canvas = createCanvas(Math.round(w * SCALE), Math.round(h * SCALE));
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx, w, h };
}
export const toBuffer = (scene) => scene.canvas.toBuffer("image/png");

export function rr(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// pseudo-random ổn định
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function paintBg(sc, accent = C.purple, accent2 = C.cyan, seed = 7) {
  const { ctx, w, h } = sc;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, C.bg); g.addColorStop(0.55, C.bg2); g.addColorStop(1, C.bg3);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (const [x, y, r, col, a] of [[w * 0.12, h * 0.1, w * 0.5, accent, 0.28], [w * 0.92, h * 0.85, w * 0.55, accent2, 0.2], [w * 0.5, h * 0.5, w * 0.6, "#1e1b4b", 0.35]]) {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, hexA(col, a)); rg.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
  }
  // lưới mờ
  ctx.strokeStyle = "rgba(120,140,255,0.05)"; ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  // sao
  const r = rng(seed);
  for (let i = 0; i < Math.round((w * h) / 9000); i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`;
    const s = r() < 0.12 ? 1.8 : 1;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  // vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
}

export function txt(ctx, text, x, y, o = {}) {
  const { size = 16, weight = "bold", color = C.text, align = "left", max = 0, glow = 0, glowColor } = o;
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  let s = String(text ?? "");
  if (max > 0) {
    while (ctx.measureText(s).width > max && s.length > 1) s = s.slice(0, -1);
    if (s !== String(text ?? "")) s = s.slice(0, -1) + "…";
  }
  if (glow) { ctx.shadowColor = glowColor || color; ctx.shadowBlur = glow; }
  ctx.fillText(s, x, y);
  ctx.restore();
}
export function measure(ctx, text, size = 16, weight = "bold") {
  ctx.save(); ctx.font = `${weight} ${size}px ${FONT}`; const w = ctx.measureText(String(text)).width; ctx.restore(); return w;
}
export function wrap(ctx, text, maxW, size = 14, weight = "normal") {
  ctx.save(); ctx.font = `${weight} ${size}px ${FONT}`;
  const words = String(text || "").split(/\s+/); const lines = []; let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  ctx.restore();
  return lines;
}

/** Thẻ kính neon */
export function glass(ctx, x, y, w, h, o = {}) {
  const { r = 16, accent = C.cyan, glow = 10, fill = C.card, border = 0.55, lift = true } = o;
  ctx.save();
  if (lift) { ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; }
  rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  ctx.restore();
  ctx.save();
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "rgba(255,255,255,0.07)"); g.addColorStop(0.35, "rgba(255,255,255,0)"); g.addColorStop(1, hexA(accent, 0.06));
  ctx.fillStyle = g; ctx.fill();
  if (glow) { ctx.shadowColor = hexA(accent, 0.6); ctx.shadowBlur = glow; }
  ctx.strokeStyle = hexA(accent, border); ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
}

export function pill(ctx, text, x, y, o = {}) {
  const { color = C.cyan, size = 12, padX = 10, h = 22, fillA = 0.18, align = "left", textColor } = o;
  ctx.save(); ctx.font = `bold ${size}px ${FONT}`;
  const w = ctx.measureText(text).width + padX * 2;
  const px = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  rr(ctx, px, y, w, h, h / 2); ctx.fillStyle = hexA(color, fillA); ctx.fill();
  ctx.strokeStyle = hexA(color, 0.75); ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = textColor || color; ctx.textAlign = "center";
  ctx.fillText(text, px + w / 2, y + h / 2 + size * 0.35);
  ctx.restore();
  return w;
}
export function typeChip(ctx, type, x, y, o = {}) {
  const t = TYPES[type];
  return pill(ctx, (t?.name || type).toUpperCase(), x, y, { color: typeColor(type), size: o.size || 11, h: o.h || 20, align: o.align });
}

export function bar(ctx, x, y, w, h, ratio, color, o = {}) {
  const r = Math.max(0, Math.min(1, ratio || 0));
  ctx.save();
  rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = "rgba(255,255,255,0.09)"; ctx.fill();
  if (r > 0) {
    const fw = Math.max(h, w * r);
    ctx.save(); rr(ctx, x, y, fw, h, h / 2); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x + fw, y);
    g.addColorStop(0, hexA(color, 0.85)); g.addColorStop(1, color);
    ctx.shadowColor = color; ctx.shadowBlur = o.glow ?? 8;
    ctx.fillStyle = g; ctx.fillRect(x, y, fw, h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.fillRect(x, y, fw, h * 0.38);
    ctx.restore();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1; rr(ctx, x, y, w, h, h / 2); ctx.stroke();
  ctx.restore();
}
export function hpColor(ratio) {
  return ratio > 0.5 ? C.green : ratio > 0.2 ? C.yellow : C.red;
}

/** Vòng sáng + bóng dưới chân Pokémon */
export function plate(ctx, cx, cy, r, color) {
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, hexA(color, 0.4)); g.addColorStop(0.55, hexA(color, 0.14)); g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
export function groundShadow(ctx, cx, y, w) {
  ctx.save();
  const g = ctx.createRadialGradient(cx, y, 0, cx, y, w / 2);
  g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.translate(cx, y); ctx.scale(1, 0.22); ctx.translate(-cx, -y);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, y, w / 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Vẽ ảnh Pokémon vừa khung (giữ tỉ lệ, không méo). img null → silhouette trung thực "?" */
export function drawSprite(ctx, img, x, y, w, h, o = {}) {
  const { flip = false, glow = null, grayscale = false, alpha = 1, anchor = "center" } = o;
  if (!img) { drawMissing(ctx, x, y, w, h); return { x, y, w, h }; }
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  const dx = x + (w - dw) / 2;
  const dy = anchor === "bottom" ? y + h - dh : y + (h - dh) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (grayscale) ctx.filter = "brightness(0) opacity(0.85)";
  if (flip) { ctx.translate(dx + dw / 2, 0); ctx.scale(-1, 1); ctx.translate(-(dx + dw / 2), 0); }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
  return { x: dx, y: dy, w: dw, h: dh };
}
export function drawMissing(ctx, x, y, w, h) {
  const s = Math.min(w, h) * 0.6;
  ctx.save();
  ctx.strokeStyle = "rgba(148,163,184,0.5)"; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
  rr(ctx, x + (w - s) / 2, y + (h - s) / 2, s, s, 14); ctx.stroke();
  ctx.setLineDash([]);
  txt(ctx, "?", x + w / 2, y + h / 2 + s * 0.16, { size: s * 0.5, color: "rgba(148,163,184,0.7)", align: "center" });
  ctx.restore();
}
/** Icon vật phẩm pixel-art: giữ nét, không làm mờ */
export function drawItem(ctx, img, x, y, size, o = {}) {
  if (!img) {
    ctx.save(); ctx.strokeStyle = "rgba(148,163,184,0.6)"; ctx.setLineDash([4, 4]); rr(ctx, x, y, size, size, 8); ctx.stroke(); ctx.setLineDash([]);
    txt(ctx, "?", x + size / 2, y + size * 0.68, { size: size * 0.5, color: "rgba(148,163,184,0.7)", align: "center" });
    ctx.restore(); return;
  }
  const s = Math.min(size / img.width, size / img.height);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (o.glow) {
    const g = ctx.createRadialGradient(x + size / 2, y + size / 2, size * 0.1, x + size / 2, y + size / 2, size * 0.75);
    g.addColorStop(0, hexA(o.glow, 0.55)); g.addColorStop(1, hexA(o.glow, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size * 0.75, 0, Math.PI * 2); ctx.fill();
  }
  ctx.drawImage(img, x + (size - img.width * s) / 2, y + (size - img.height * s) / 2, img.width * s, img.height * s);
  ctx.restore();
}

// ── Icon vector (không emoji) ──
export function iconCoin(ctx, x, y, r, color = C.yellow) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
  g.addColorStop(0, "#fff7c2"); g.addColorStop(0.5, color); g.addColorStop(1, "#b45309");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(120,53,15,0.8)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r * 0.66, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
export function iconStar(ctx, x, y, r, color = C.yellow) {
  ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rad = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
export function iconBolt(ctx, x, y, s, color = C.yellow) {
  ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.beginPath();
  ctx.moveTo(x + s * 0.55, y); ctx.lineTo(x + s * 0.1, y + s * 0.55); ctx.lineTo(x + s * 0.45, y + s * 0.55); ctx.lineTo(x + s * 0.3, y + s); ctx.lineTo(x + s * 0.85, y + s * 0.4); ctx.lineTo(x + s * 0.5, y + s * 0.4); ctx.closePath(); ctx.fill(); ctx.restore();
}
export function iconCheck(ctx, x, y, s, color = C.green) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = s * 0.16; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.moveTo(x + s * 0.15, y + s * 0.55); ctx.lineTo(x + s * 0.42, y + s * 0.8); ctx.lineTo(x + s * 0.88, y + s * 0.22); ctx.stroke(); ctx.restore();
}
export function iconCross(ctx, x, y, s, color = C.red) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = s * 0.16; ctx.lineCap = "round"; ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.moveTo(x + s * 0.2, y + s * 0.2); ctx.lineTo(x + s * 0.8, y + s * 0.8); ctx.moveTo(x + s * 0.8, y + s * 0.2); ctx.lineTo(x + s * 0.2, y + s * 0.8); ctx.stroke(); ctx.restore();
}
export function iconLock(ctx, x, y, s, color = C.muted) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = hexA(color, 0.25); ctx.lineWidth = s * 0.12;
  ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.36, s * 0.24, Math.PI, 0); ctx.stroke();
  rr(ctx, x + s * 0.18, y + s * 0.38, s * 0.64, s * 0.5, s * 0.1); ctx.fill(); ctx.stroke(); ctx.restore();
}
export function iconArrow(ctx, x, y, len, color = C.cyan, th = 4) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = th; ctx.lineCap = "round"; ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len - 10, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + len, y); ctx.lineTo(x + len - 16, y - 10); ctx.lineTo(x + len - 16, y + 10); ctx.closePath(); ctx.fill(); ctx.restore();
}
export function iconPin(ctx, x, y, s, color = C.red) {
  ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(x, y - s * 0.55, s * 0.4, Math.PI, 0); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y - s * 0.55, s * 0.15, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
/** Quả cầu Poké Ball vector (dùng khi cần hiệu ứng ném/lắc; ảnh vật phẩm dùng sprite chính thức) */

export function header(sc, title, subtitle, o = {}) {
  const { ctx, w } = sc;
  const { accent = C.cyan, right = "" } = o;
  txt(ctx, title, 36, 54, { size: 30, weight: "800", glow: 14, glowColor: accent });
  if (subtitle) txt(ctx, subtitle, 38, 80, { size: 14, weight: "600", color: C.muted, max: w - 300 });
  if (right) pill(ctx, right, w - 36, 34, { color: accent, align: "right", size: 13, h: 26 });
  const g = ctx.createLinearGradient(36, 0, w - 36, 0);
  g.addColorStop(0, hexA(accent, 0.9)); g.addColorStop(0.5, hexA(C.purple, 0.5)); g.addColorStop(1, hexA(accent, 0));
  ctx.fillStyle = g; ctx.fillRect(36, 92, w - 72, 2);
}
export function footer(sc, text, o = {}) {
  const { ctx, w, h } = sc;
  txt(ctx, text, w / 2, h - 16, { size: 13, weight: "600", color: o.color || C.muted, align: "center", max: w - 60 });
}
export function fmt(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}
