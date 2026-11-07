/**
 * fishArt — hình ảnh riêng cho từng loài cá.
 *
 * Nguồn ảnh: `fish.json` → trường `image` (đường dẫn trong thư mục `fish/`), có thể thêm/đổi
 * ở một chỗ duy nhất: `fishImages.json` (map id → file) nếu muốn ghi đè, ví dụ
 *   { "ca_chep": "common/ca_chep_hd.png" }
 *
 * Ảnh gốc của dự án là "thẻ cá" (khung + nhãn + tên). Module này CẮT riêng con cá khỏi thẻ
 * (tách nền tối, giữ nguyên tỉ lệ, không méo, không mất cá) rồi cache trong bộ nhớ.
 * Loài chưa có ảnh → vẽ hình cá bằng vector theo màu độ hiếm (KHÔNG dùng dấu ? hay ảnh chung).
 */
import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "canvas";
import { FISH_IMG_DIR, DATA_DIR } from "./storage.js";

export const RARITY = {
  common:    { label: "THƯỜNG",      stars: 1, color: "#9FB3C8" },
  uncommon:  { label: "HIẾM",        stars: 2, color: "#34D399" },
  rare:      { label: "QUÝ",         stars: 3, color: "#4C9AFF" },
  epic:      { label: "SỬ THI",      stars: 4, color: "#B26BFF" },
  legendary: { label: "HUYỀN THOẠI", stars: 5, color: "#FF9F43" },
  mythic:    { label: "THẦN THOẠI",  stars: 6, color: "#FF5C7A" },
};
export const rarityInfo = (r) => RARITY[r] || RARITY.common;

const OVERRIDE_PATH = path.join(DATA_DIR, "fishImages.json");
const cache = new Map(); // fishId -> Canvas | null

function readOverrides() {
  try { return JSON.parse(fs.readFileSync(OVERRIDE_PATH, "utf8")) || {}; } catch { return {}; }
}

/** Đường dẫn file ảnh của một loài (hoặc null). KHÔNG fallback sang ảnh cá khác. */
export function fishImagePath(fish) {
  if (!fish) return null;
  const ov = readOverrides()[fish.id];
  const rel = ov || fish.image || `${fish.rarity || "common"}/${fish.id}.png`;
  const full = path.isAbsolute(rel) ? rel : path.join(FISH_IMG_DIR, rel);
  return fs.existsSync(full) ? full : null;
}

/** Tách con cá khỏi thẻ: giữ vùng tranh, xoá nền tối bằng khoảng cách màu, cắt sát cá. */
async function cutout(file) {
  const img = await loadImage(file);
  const S = img.width;                       // thẻ gốc vuông 512
  const k = S / 512;
  // vùng tranh bên trong khung, loại nhãn độ hiếm (y≈344) và hộp tên (y>370)
  const sx = Math.round(44 * k), sy = Math.round(44 * k);
  const sw = Math.round(424 * k), sh = Math.round(286 * k);
  const c = createCanvas(sw, sh);
  const g = c.getContext("2d");
  g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const d = g.getImageData(0, 0, sw, sh);
  const px = d.data;
  const bg = [px[0], px[1], px[2]];          // góc trên-trái = nền tranh
  let minX = sw, minY = sh, maxX = 0, maxY = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      const dist = Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]);
      const fade = Math.min(1, (sh - y) / (16 * k));   // mờ dần mép dưới, tránh viền cắt cứng
      let a = Math.max(0, Math.min(1, (dist - 22) / 26)) * fade;
      if (a < 0.12) a = 0;                              // xoá hẳn nhiễu nền để không sinh bóng/viền thừa
      px[i + 3] = Math.round(a * 255);
      if (a > 0.5) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return null;
  g.putImageData(d, 0, 0);
  const m = Math.round(sw * 0.03);
  minX = Math.max(0, minX - m); minY = Math.max(0, minY - m);
  maxX = Math.min(sw - 1, maxX + m); maxY = Math.min(sh - 1, maxY + m);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const out = createCanvas(cw, ch);
  out.getContext("2d").drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

/** Ảnh con cá đã tách nền (Canvas) hoặc null nếu loài chưa có ảnh. */
export async function getFishCutout(fish) {
  if (!fish?.id) return null;
  if (cache.has(fish.id)) return cache.get(fish.id);
  let out = null;
  try {
    const file = fishImagePath(fish);
    if (file) out = await cutout(file);
  } catch (e) {
    console.warn("[cauca] cutout lỗi", fish.id, e?.message);
  }
  cache.set(fish.id, out);
  return out;
}
export function clearFishArtCache() { cache.clear(); }

/** Vẽ ảnh cá vừa khít ô (contain, giữ tỉ lệ). Loài thiếu ảnh → cá vector theo độ hiếm. */
export async function drawFish(ctx, fish, x, y, w, h, { glow = false } = {}) {
  const art = await getFishCutout(fish);
  const col = rarityInfo(fish?.rarity).color;
  if (art) {
    const s = Math.min(w / art.width, h / art.height);
    const dw = art.width * s, dh = art.height * s;
    ctx.save();
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = Math.min(w, h) * 0.12; }
    ctx.drawImage(art, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
    return;
  }
  drawVectorFish(ctx, x, y, w, h, col);
}

function drawVectorFish(ctx, x, y, w, h, col) {
  const cx = x + w / 2, cy = y + h / 2;
  const bw = Math.min(w * 0.78, h * 1.5), bh = bw * 0.46;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = col; ctx.shadowBlur = bw * 0.1;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(-bw * 0.05, 0, bw * 0.4, bh / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bw * 0.3, 0); ctx.lineTo(bw * 0.5, -bh * 0.4); ctx.lineTo(bw * 0.5, bh * 0.4); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#0A1426";
  ctx.beginPath(); ctx.arc(-bw * 0.24, -bh * 0.08, bh * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
