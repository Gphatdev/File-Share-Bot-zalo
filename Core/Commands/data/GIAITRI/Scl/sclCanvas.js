/**
 * sclCanvas.js — toàn bộ giao diện Canvas của `.scl` (SCL MUSIC SEARCH).
 * Tông đen – xanh dương đậm – tím nhẹ. Mọi hàm render trả Promise<Buffer PNG>.
 * Thumbnail do nơi gọi tải sẵn (Buffer|null); ảnh lỗi → khung dự phòng, không làm hỏng cả ảnh.
 * Chiều cao tự tính theo số thẻ; SCALE 1.2 (rộng 1200px) để nhẹ bộ nhớ.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, registerFont } from "canvas";
import { formatDuration, formatDate, LABELS } from "./sclParse.js";
import { getConfiguredBotName } from "../../../../../Utils/Branding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "..", "..", "MEDIA", "fonts");
const FAMILY = "SclUI";
let fontsOk = false;
(function registerFonts() {
  for (const [f, w] of [["BeVietnamPro_800ExtraBold.ttf", "800"], ["BeVietnamPro_700Bold.ttf", "bold"], ["BeVietnamPro_600SemiBold.ttf", "600"], ["BeVietnamPro_400Regular.ttf", "normal"]]) {
    const p = path.join(FONT_DIR, f);
    if (fs.existsSync(p)) { try { registerFont(p, { family: FAMILY, weight: w }); fontsOk = true; } catch { /* dùng font hệ thống */ } }
  }
})();
const FACE = fontsOk ? FAMILY : "sans-serif";
const font = (w, s) => `${w === 800 ? "800" : w >= 600 ? "bold" : "normal"} ${s}px ${FACE}`; // 600 dùng bold: một số máy Windows không nạp được weight 600 của font

export const COLORS = {
  bg: "#05070F", navy: "#0B1230", blue: "#1D4ED8", blueHi: "#60A5FA", violet: "#7C3AED", white: "#FFFFFF", silver: "#A5B4CF", dim: "#64748B",
  ok: "#22C55E", bad: "#EF4444", warn: "#F59E0B", line: "rgba(148,163,184,0.16)",
};
const C = COLORS;
const W = 1000, SCALE = 1.2, PAD = 48;
const LABEL_COLOR = { original: "#2563EB", remix: "#8B5CF6", spedup: "#EC4899", slowed: "#14B8A6", short: "#F59E0B", long: "#6366F1", live: "#EF4444", other: "#64748B" };

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function rr(ctx, x, y, w, h, r) {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + R, y); ctx.arcTo(x + w, y, x + w, y + h, R); ctx.arcTo(x + w, y + h, x, y + h, R); ctx.arcTo(x, y + h, x, y, R); ctx.arcTo(x, y, x + w, y, R); ctx.closePath();
}
function fit(ctx, s, maxW) { s = String(s ?? ""); if (!maxW || ctx.measureText(s).width <= maxW) return s; while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1); return `${s}…`; }
function txt(ctx, s, x, y, { w = 400, size = 24, color = C.white, align = "left", maxW, spacing = 0 } = {}) {
  ctx.save(); ctx.font = font(w, size); ctx.fillStyle = color; ctx.textAlign = align;
  if (spacing && "letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(maxW ? fit(ctx, s, maxW) : String(s ?? ""), x, y); ctx.restore();
}
/** Xuống dòng theo độ rộng; tối đa maxLines dòng (dòng cuối cắt "…"). Từ quá dài (không dấu cách) được cắt theo ký tự. */
function wrap(ctx, s, maxW, w, size, maxLines = 99) {
  ctx.save(); ctx.font = font(w, size); const out = [];
  const push = (l) => out.push(l);
  for (const para of String(s ?? "").split("\n")) {
    let line = "";
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (ctx.measureText(word).width > maxW) { // từ dài bất thường
        let cut = word.length; while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxW) cut--;
        if (line) { push(line); line = ""; }
        push(word.slice(0, cut)); word = word.slice(cut);
      }
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) { push(line); line = word; } else line = t;
    }
    push(line);
  }
  ctx.restore();
  if (out.length > maxLines) { const keep = out.slice(0, maxLines); keep[maxLines - 1] = ellipsize(keep[maxLines - 1], true, ctx, maxW, w, size); return keep; }
  return out;
}
function ellipsize(line, more, ctx, maxW, w, size) {
  if (!more) return line;
  ctx.save(); ctx.font = font(w, size);
  let s = line; while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  ctx.restore(); return `${s}…`;
}
function canvasOf(H, sc = SCALE) { const canvas = createCanvas(Math.round(W * sc), Math.round(H * sc)); const ctx = canvas.getContext("2d"); ctx.scale(sc, sc); ctx.textBaseline = "alphabetic"; return { canvas, ctx }; }
const grad = (ctx, x0, y0, x1, y1, a = C.blue, b = C.violet) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
function glow(ctx, x, y, r, color, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }

function background(ctx, H) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  glow(ctx, 120, 100, 520, C.blue, 0.30); glow(ctx, W - 40, H * 0.4, 520, C.violet, 0.16); glow(ctx, W * 0.4, H - 80, 520, C.blue, 0.14);
  rr(ctx, 12, 12, W - 24, H - 24, 34); ctx.strokeStyle = grad(ctx, 0, 0, W, H, rgba(C.blueHi, 0.55), rgba(C.violet, 0.45)); ctx.lineWidth = 2; ctx.stroke();
}
function glass(ctx, x, y, w, h, { r = 24, tint = C.blueHi, a = 0.28, fill = 0.6 } = {}) {
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
  rr(ctx, x, y, w, h, r); ctx.fillStyle = `rgba(12,18,40,${fill})`; ctx.fill(); ctx.restore();
  rr(ctx, x, y, w, h, r); ctx.fillStyle = grad(ctx, x, y, x + w, y + h, rgba(tint, 0.10), "rgba(124,58,237,0.05)"); ctx.fill();
  rr(ctx, x, y, w, h, r); ctx.strokeStyle = rgba(tint, a); ctx.lineWidth = 1.4; ctx.stroke();
}
function chip(ctx, label, x, y, { color = C.blue, size = 17, h = 32, textColor = C.white, w = 700, filled = true } = {}) {
  ctx.save(); ctx.font = font(w, size);
  const tw = ctx.measureText(label).width, cw = tw + 26;
  rr(ctx, x, y, cw, h, h / 2);
  if (filled) { ctx.fillStyle = rgba(color, 0.28); ctx.fill(); }
  rr(ctx, x, y, cw, h, h / 2); ctx.strokeStyle = rgba(color, 0.9); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = textColor; ctx.textAlign = "left"; ctx.fillText(label, x + 13, y + h / 2 + size * 0.34); ctx.restore();
  return cw;
}

function note(ctx, cx, cy, s, color = C.white) { // nốt nhạc đôi
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2.4, s * 0.1); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const hx = s * 0.34;
  for (const dx of [-hx, hx]) { ctx.beginPath(); ctx.ellipse(cx + dx - s * 0.12, cy + s * 0.48, s * 0.24, s * 0.18, -0.4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx + dx + s * 0.1, cy + s * 0.42); ctx.lineTo(cx + dx + s * 0.1, cy - s * 0.62); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - hx + s * 0.1, cy - s * 0.62); ctx.lineTo(cx + hx + s * 0.1, cy - s * 0.78); ctx.lineTo(cx + hx + s * 0.1, cy - s * 0.5); ctx.lineTo(cx - hx + s * 0.1, cy - s * 0.34); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function glyph(ctx, name, cx, cy, s, color = C.white) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2.4, s * 0.14); ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (name === "clock") { ctx.beginPath(); ctx.arc(cx, cy, s * 0.8, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.45); ctx.lineTo(cx, cy); ctx.lineTo(cx + s * 0.35, cy + s * 0.22); ctx.stroke(); }
  else if (name === "cal") { rr(ctx, cx - s * 0.8, cy - s * 0.65, s * 1.6, s * 1.45, s * 0.2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - s * 0.8, cy - s * 0.2); ctx.lineTo(cx + s * 0.8, cy - s * 0.2); ctx.stroke(); }
  else if (name === "user") { ctx.beginPath(); ctx.arc(cx, cy - s * 0.3, s * 0.4, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy + s * 0.95, s * 0.8, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke(); }
  else if (name === "cross") { ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy - s * 0.5); ctx.lineTo(cx + s * 0.5, cy + s * 0.5); ctx.moveTo(cx + s * 0.5, cy - s * 0.5); ctx.lineTo(cx - s * 0.5, cy + s * 0.5); ctx.stroke(); }
  else if (name === "warn") { ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.74); ctx.lineTo(cx + s * 0.82, cy + s * 0.6); ctx.lineTo(cx - s * 0.82, cy + s * 0.6); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.2); ctx.lineTo(cx, cy + s * 0.2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy + s * 0.42, s * 0.07, 0, 7); ctx.fill(); }
  else if (name === "search") { ctx.beginPath(); ctx.arc(cx - s * 0.12, cy - s * 0.12, s * 0.6, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + s * 0.32, cy + s * 0.32); ctx.lineTo(cx + s * 0.85, cy + s * 0.85); ctx.stroke(); }
  else if (name === "play") { ctx.beginPath(); ctx.moveTo(cx - s * 0.35, cy - s * 0.55); ctx.lineTo(cx + s * 0.6, cy); ctx.lineTo(cx - s * 0.35, cy + s * 0.55); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

function logoTile(ctx, x, y, size) {
  ctx.save(); ctx.shadowColor = rgba(C.violet, 0.6); ctx.shadowBlur = 24;
  rr(ctx, x, y, size, size, size * 0.3); ctx.fillStyle = grad(ctx, x, y, x + size, y + size, C.blue, C.violet); ctx.fill(); ctx.restore();
  rr(ctx, x, y, size, size, size * 0.3); ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1.4; ctx.stroke();
  note(ctx, x + size / 2, y + size / 2 + 2, size * 0.34, C.white);
}
function header(ctx, { sub = "TÌM KIẾM & ĐỀ XUẤT NHẠC YOUTUBE" } = {}) {
  logoTile(ctx, PAD, 48, 96);
  txt(ctx, "SCL MUSIC SEARCH", PAD + 124, 100, { w: 800, size: 50, spacing: 1 });
  txt(ctx, sub, PAD + 126, 136, { w: 600, size: 19, color: C.silver, spacing: 2 });
  return 176;
}
function footer(ctx, y, lines = [], tail = `${getConfiguredBotName()}  •  SCL MUSIC SEARCH`) {
  ctx.fillStyle = C.line; ctx.fillRect(PAD, y, W - PAD * 2, 1.5);
  let yy = y + 36;
  for (const l of lines) { txt(ctx, l.t, W / 2, yy, { w: l.w ?? 600, size: l.size ?? 21, color: l.color ?? C.silver, align: "center", maxW: W - PAD * 2 }); yy += l.dy ?? 32; }
  txt(ctx, tail, W / 2, yy + 8, { w: 700, size: 17, color: C.dim, align: "center", spacing: 2 });
  return yy + 40;
}

/** Ảnh bìa vuông bị YouTube chèn viền đen 2 bên (kênh "- Topic") → trả tỉ lệ viền trái/phải, ngược lại null. */
function pillarbox(img) {
  try {
    const cv = createCanvas(64, 36), x = cv.getContext("2d"); x.drawImage(img, 0, 0, 64, 36);
    const d = x.getImageData(0, 0, 64, 36).data;
    const lum = (col) => { let t = 0; for (let y = 0; y < 36; y++) { const i = (y * 64 + col) * 4; t += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; } return t / 36; };
    let l = 0, r = 0; while (l < 24 && lum(l) < 14) l++; while (r < 24 && lum(63 - r) < 14) r++;
    return l >= 6 && r >= 6 && Math.abs(l - r) <= 3 && lum(32) > 14 ? { l: l / 64, r: r / 64 } : null;
  } catch { return null; }
}
/** Vẽ thumbnail 16:9 bo góc (cover). img = Image | null → khung dự phòng. */
function drawThumb(ctx, img, x, y, w, h, r, key = "other") {
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  if (img) {
    const pb = pillarbox(img);
    if (pb) { // ảnh bìa vuông: nền mờ + ảnh bìa nguyên vẹn ở giữa (không bị cắt)
      const sx0 = img.width * pb.l, sw0 = img.width * (1 - pb.l - pb.r);
      const sm = createCanvas(12, 7), sctx = sm.getContext("2d"); sctx.drawImage(img, sx0, 0, sw0, img.height, 0, 0, 12, 7); ctx.imageSmoothingEnabled = true; ctx.drawImage(sm, x, y, w, h); // làm mờ rẻ: thu nhỏ rồi phóng lớn
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x, y, w, h);
      const side = Math.min(h, w); ctx.drawImage(img, sx0, 0, sw0, img.height, x + (w - side) / 2, y + (h - side) / 2, side, side);
    } else {
      const ir = img.width / img.height, br = w / h; let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ir > br) { sw = img.height * br; sx = (img.width - sw) / 2; } else { sh = img.width / br; sy = (img.height - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    }
  } else {
    ctx.fillStyle = grad(ctx, x, y, x + w, y + h, "#13224f", "#3b1d7a"); ctx.fillRect(x, y, w, h);
    note(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.26, "rgba(255,255,255,0.75)");
  }
  const g = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.45)"); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.restore();
  rr(ctx, x, y, w, h, r); ctx.strokeStyle = rgba(LABEL_COLOR[key] || C.blueHi, 0.55); ctx.lineWidth = 1.6; ctx.stroke();
}
async function toImage(buf) { if (!buf) return null; try { return await loadImage(buf); } catch { return null; } }

// ───────────── danh sách kết quả ─────────────
const CARD_H = 196, CARD_GAP = 20;

/**
 * @param {{ query:string, mode?:string|null, items:object[], startIndex:number, page:number, pages:number, total:number,
 *           source?:string, prefix?:string, ttlMin?:number, thumbs?:Map<string,Buffer|null> }} d
 */
export async function renderResults(d) {
  const items = d.items || [];
  const imgs = await Promise.all(items.map((it) => toImage(d.thumbs?.get?.(it.id))));
  const topH = 176, listY = 276, footH = 190;
  const H = listY + items.length * (CARD_H + CARD_GAP) + 10 + footH;
  const { canvas, ctx } = canvasOf(H);
  background(ctx, H); header(ctx);

  // thanh thông tin tìm kiếm
  glass(ctx, PAD, topH + 14, W - PAD * 2, 74, { r: 22 });
  glyph(ctx, "search", PAD + 40, topH + 52, 15, C.blueHi);
  txt(ctx, `"${d.query}"`, PAD + 74, topH + 62, { w: 700, size: 28, maxW: 470 });
  let rx = W - PAD - 24;
  const tot = `${d.total} kết quả`;
  ctx.save(); ctx.font = font(700, 17); const tw = ctx.measureText(tot).width + 26; ctx.restore();
  rx -= tw; chip(ctx, tot, rx, topH + 36, { color: C.blueHi });
  if (d.mode) { ctx.save(); ctx.font = font(700, 17); const mw = ctx.measureText(`ƯU TIÊN ${d.mode.toUpperCase()}`).width + 26; ctx.restore(); rx -= mw + 10; chip(ctx, `ƯU TIÊN ${d.mode.toUpperCase()}`, rx, topH + 36, { color: LABEL_COLOR[d.mode === "short" ? "short" : d.mode === "long" ? "long" : d.mode === "remix" ? "remix" : "original"] }); }

  let y = listY;
  for (let i = 0; i < items.length; i++) {
    const it = items[i], idx = d.startIndex + i + 1, lc = LABEL_COLOR[it.key] || LABEL_COLOR.other;
    glass(ctx, PAD, y, W - PAD * 2, CARD_H, { r: 26, tint: lc, a: 0.34 });
    const tx = PAD + 18, ty = y + 17, tw2 = 288, th = 162;
    drawThumb(ctx, imgs[i], tx, ty, tw2, th, 18, it.key);
    // số thứ tự
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(tx + 28, ty + 28, 22, 0, 7); ctx.fillStyle = grad(ctx, tx, ty, tx + 56, ty + 56, C.blue, C.violet); ctx.fill(); ctx.restore();
    txt(ctx, String(idx), tx + 28, ty + 28 + 8.5, { w: 800, size: idx > 9 ? 20 : 25, align: "center" });
    // thời lượng trên thumbnail
    const dur = formatDuration(it.durationSec); ctx.save(); ctx.font = font(700, 17); const dw = ctx.measureText(dur).width + 16; ctx.restore();
    rr(ctx, tx + tw2 - dw - 8, ty + th - 32, dw, 24, 8); ctx.fillStyle = "rgba(0,0,0,0.72)"; ctx.fill();
    txt(ctx, dur, tx + tw2 - dw / 2 - 8, ty + th - 14, { w: 700, size: 17, align: "center" });

    const cx = tx + tw2 + 24, cw = W - PAD - 24 - cx;
    const cc = createCanvas(4, 4).getContext("2d");
    const lines = wrap(cc, it.title, cw, 700, 27, 2);
    lines.forEach((l, k) => txt(ctx, l, cx, y + 54 + k * 34, { w: 700, size: 27 }));
    const by = y + 54 + (lines.length - 1) * 34;
    glyph(ctx, "user", cx + 10, by + 38, 9, C.silver);
    txt(ctx, it.channel || "Không rõ kênh", cx + 28, by + 45, { w: 600, size: 21, color: C.silver, maxW: cw - 28 });
    const cy = y + CARD_H - 52;
    const w1 = chip(ctx, LABELS[it.key]?.text || it.label || "KHÁC", cx, cy, { color: lc });
    glyph(ctx, "cal", cx + w1 + 26, cy + 17, 9, C.dim);
    txt(ctx, formatDate(it.publishedAt), cx + w1 + 44, cy + 24, { w: 600, size: 19, color: C.dim, maxW: cw - w1 - 46 });
    y += CARD_H + CARD_GAP;
  }

  const pre = d.prefix || ".";
  footer(ctx, y + 4, [
    { t: `Reply vào ảnh này bằng số thứ tự (1–${d.total}) để chọn bài`, w: 700, size: 22, color: C.white },
    { t: d.pages > 1 ? `Trang ${d.page}/${d.pages}  •  reply "next" / "prev" để đổi trang` : "Chỉ cần gửi số thứ tự khi reply", size: 19 },
    { t: `Prefix: ${pre}scl  •  Nguồn: ${d.source || "YouTube"}  •  Hết hạn sau ${d.ttlMin ?? 10} phút`, size: 18, color: C.dim, dy: 24 },
  ]);
  return canvas.toBuffer("image/png");
}

// ───────────── bài đã chọn ─────────────
export async function renderPick({ item, index, thumb, prefix = ".", audio = false }) {
  const img = await toImage(thumb);
  const lc = LABEL_COLOR[item.key] || LABEL_COLOR.other;
  const cc = createCanvas(4, 4).getContext("2d");
  const lines = wrap(cc, item.title, W - PAD * 2 - 8, 800, 36, 3);
  const tw = W - PAD * 2, th = Math.round(tw * 9 / 16);
  const topY = 176;
  const H = topY + 24 + th + 36 + lines.length * 46 + 150 + 215;
  const { canvas, ctx } = canvasOf(H);
  background(ctx, H); header(ctx, { sub: "BÀI HÁT ĐÃ CHỌN" });
  glass(ctx, PAD - 10, topY + 10, tw + 20, th + 20, { r: 30, tint: lc, a: 0.4 });
  drawThumb(ctx, img, PAD, topY + 20, tw, th, 22, item.key);
  // nút play
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(PAD + tw / 2, topY + 20 + th / 2, 46, 0, 7); ctx.fillStyle = "rgba(15,23,42,0.72)"; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(PAD + tw / 2, topY + 20 + th / 2, 46, 0, 7); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2.5; ctx.stroke();
  glyph(ctx, "play", PAD + tw / 2 + 4, topY + 20 + th / 2, 22, C.white);
  let y = topY + 20 + th + 56;
  lines.forEach((l, k) => txt(ctx, l, PAD + 4, y + k * 46, { w: 800, size: 36 }));
  y += (lines.length - 1) * 46 + 44;
  glyph(ctx, "user", PAD + 18, y - 6, 11, C.silver);
  txt(ctx, item.channel || "Không rõ kênh", PAD + 42, y + 2, { w: 600, size: 24, color: C.silver, maxW: W - PAD * 2 - 50 });
  y += 30;
  let x = PAD;
  x += chip(ctx, `#${index}`, x, y, { color: C.blueHi, h: 38, size: 20 }) + 10;
  x += chip(ctx, LABELS[item.key]?.text || "KHÁC", x, y, { color: lc, h: 38, size: 20 }) + 10;
  x += chip(ctx, formatDuration(item.durationSec), x, y, { color: C.silver, h: 38, size: 20 }) + 10;
  chip(ctx, `Đăng: ${formatDate(item.publishedAt)}`, x, y, { color: C.silver, h: 38, size: 20, w: 600 });
  y += 70;
  glass(ctx, PAD, y, W - PAD * 2, 74, { r: 20, a: 0.4 });
  txt(ctx, item.url, W / 2, y + 46, { w: 700, size: 24, color: C.blueHi, align: "center", maxW: W - PAD * 2 - 40 });
  footer(ctx, y + 98, [
    { t: audio ? "Bot sẽ gửi kèm ghi âm bài hát bên dưới  •  hoặc bấm liên kết để nghe" : "Bot chỉ gửi liên kết YouTube chính thức — bấm liên kết để nghe", size: 20 },
    { t: `Tìm bài khác: ${prefix}scl + tên bài hát`, size: 19, color: C.dim, dy: 24 },
  ]);
  return canvas.toBuffer("image/png");
}

// ───────────── bảng hướng dẫn ─────────────
export async function renderGuide({ prefix = "." } = {}) {
  const rows = [
    [`${prefix}scl`, "Hiển thị bảng hướng dẫn này", C.blueHi],
    [`${prefix}scl + Tên nhạc`, "Tìm và đề xuất các phiên bản của bài hát", C.blueHi],
    [`${prefix}scl + Tên nhạc + remix`, "Ưu tiên bản remix", LABEL_COLOR.remix],
    [`${prefix}scl + Tên nhạc + original`, "Ưu tiên bản gốc", LABEL_COLOR.original],
    [`${prefix}scl + Tên nhạc + short`, "Ưu tiên bản ngắn", LABEL_COLOR.short],
    [`${prefix}scl + Tên nhạc + long`, "Ưu tiên bản dài", LABEL_COLOR.long],
  ];
  const rowH = 104, listY = 196;
  const H = listY + rows.length * (rowH + 14) + 30 + 150 + 150;
  const { canvas, ctx } = canvasOf(H);
  background(ctx, H); header(ctx, { sub: "HƯỚNG DẪN SỬ DỤNG LỆNH SCL" });
  let y = listY;
  for (const [cmd, desc, col] of rows) {
    glass(ctx, PAD, y, W - PAD * 2, rowH, { r: 24, tint: col, a: 0.32 });
    rr(ctx, PAD + 18, y + 18, 68, 68, 20); ctx.fillStyle = grad(ctx, PAD, y, PAD + 86, y + 86, col, C.violet); ctx.fill();
    glyph(ctx, "play", PAD + 54, y + 52, 15, C.white);
    txt(ctx, cmd, PAD + 108, y + 50, { w: 800, size: 28, maxW: W - PAD * 2 - 130 });
    txt(ctx, desc, PAD + 108, y + 84, { w: 400, size: 21, color: C.silver, maxW: W - PAD * 2 - 130 });
    y += rowH + 14;
  }
  glass(ctx, PAD, y + 6, W - PAD * 2, 128, { r: 24, a: 0.3 });
  txt(ctx, "Ví dụ", PAD + 28, y + 44, { w: 800, size: 20, color: C.blueHi, spacing: 2 });
  txt(ctx, `${prefix}scl Nơi Này Có Anh`, PAD + 28, y + 80, { w: 600, size: 24, maxW: W - PAD * 2 - 56 });
  txt(ctx, `${prefix}scl Nơi Này Có Anh remix   •   ${prefix}scl Nơi Này Có Anh short`, PAD + 28, y + 114, { w: 400, size: 21, color: C.silver, maxW: W - PAD * 2 - 56 });
  footer(ctx, y + 166, [
    { t: "Sau khi có danh sách: reply vào ảnh bằng số thứ tự để chọn bài", size: 20 },
    { t: `Từ khóa chế độ đặt ở CUỐI câu lệnh  •  Prefix hiện tại: ${prefix}`, size: 18, color: C.dim, dy: 24 },
  ]);
  return canvas.toBuffer("image/png");
}

// ───────────── thẻ thông báo (không kết quả / lỗi / hết hạn …) ─────────────
const KINDS = { empty: ["search", C.blueHi], error: ["warn", C.warn], fail: ["cross", C.bad], expired: ["clock", C.warn], info: ["search", C.blueHi], busy: ["clock", C.blueHi] };
export const MESSAGE_KINDS = Object.keys(KINDS);

export async function renderMessage({ kind = "info", title = "", subtitle = "", lines = [], prefix = "." } = {}) {
  const [ic, col] = KINDS[kind] || KINDS.info;
  const cc = createCanvas(4, 4).getContext("2d");
  const sub = wrap(cc, subtitle, W - PAD * 2 - 80, 400, 25, 6);
  const extra = (lines || []).flatMap((l) => wrap(cc, l, W - PAD * 2 - 120, 600, 22, 3));
  const H = 176 + 70 + 150 + 50 + sub.length * 36 + (extra.length ? extra.length * 32 + 80 : 0) + 130;
  const { canvas, ctx } = canvasOf(H);
  background(ctx, H); header(ctx);
  const cy = 176 + 70 + 56;
  glow(ctx, W / 2, cy, 170, col, 0.28);
  ctx.beginPath(); ctx.arc(W / 2, cy, 58, 0, 7); ctx.fillStyle = rgba(col, 0.16); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.stroke();
  glyph(ctx, ic, W / 2, cy, 24, C.white);
  let y = cy + 112;
  const tl = wrap(cc, title, W - PAD * 2, 800, 38, 2);
  tl.forEach((l, k) => txt(ctx, l, W / 2, y + k * 46, { w: 800, size: 38, align: "center" })); y += tl.length * 46 + 4;
  sub.forEach((l, k) => txt(ctx, l, W / 2, y + k * 36, { w: 400, size: 25, color: C.silver, align: "center" })); y += sub.length * 36 + 10;
  if (extra.length) {
    const bh = extra.length * 32 + 36; glass(ctx, PAD + 24, y, W - PAD * 2 - 48, bh, { r: 20, tint: col, a: 0.3 });
    extra.forEach((l, k) => txt(ctx, l, W / 2, y + 40 + k * 32, { w: 600, size: 22, color: C.white, align: "center" })); y += bh + 24;
  }
  footer(ctx, y + 10, [{ t: `Thử lại: ${prefix}scl + tên bài hát   •   Hướng dẫn: ${prefix}scl`, size: 19, color: C.dim, dy: 20 }]);
  return canvas.toBuffer("image/png");
}
