/**
 * art.js — vẽ vector toàn bộ hình ảnh nông trại bằng node-canvas (không dùng emoji, không cần file ảnh ngoài):
 * hạt giống (gói hạt), nông sản, đất trồng, dụng cụ (cuốc / xô nước / máy tưới), thuốc (lọ thuốc).
 *
 * API:
 *   drawIcon(ctx, kind, id, cx, cy, size)        vẽ icon vào canvas (kind: seed|crop|land|tool|medicine)
 *   drawIconTile(ctx, kind, id, x, y, size, o)   vẽ icon trên ô nền có ánh sáng theo độ hiếm
 *   renderIconPng(kind, id, size)                Buffer PNG nền trong suốt (dùng cho ảnh sản phẩm shop)
 *   iconFile(kind, id, size)                     đường dẫn file PNG (tạo & lưu cache trong images/<kind>s/)
 */
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "canvas";
import { IMG_DIR } from "./storage.js";

const FONT = "FarmFont, sans-serif";
const TAU = Math.PI * 2;

// ───────────── tiện ích ─────────────
function rgb(h) {
  const s = String(h || "#888888").replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s.padEnd(6, "8").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** p>0 sáng hơn, p<0 tối hơn */
export function shade(h, p) {
  const [r, g, b] = rgb(h);
  const f = (v) => Math.max(0, Math.min(255, Math.round(p >= 0 ? v + (255 - v) * p : v * (1 + p))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function alpha(h, a) { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; }
function lin(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
function rad(ctx, x, y, r0, r1, stops, x1 = x, y1 = y) { const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
function rr(ctx, x, y, w, h, r) {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + R, y); ctx.arcTo(x + w, y, x + w, y + h, R); ctx.arcTo(x + w, y + h, x, y + h, R); ctx.arcTo(x, y + h, x, y, R); ctx.arcTo(x, y, x + w, y, R); ctx.closePath();
}
const INK = "rgba(35,22,12,0.55)";
function stroke(ctx, w = 2, c = INK) { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(); }
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }
function groundShadow(ctx, y = 42, rx = 30, ry = 6) { ctx.save(); ell(ctx, 0, y, rx, ry); ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fill(); ctx.restore(); }
function shine(ctx, x, y, rx, ry, rot = -0.6, a = 0.55) { ctx.save(); ell(ctx, x, y, rx, ry, rot); ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill(); ctx.restore(); }
function sparkle(ctx, x, y, r, color = "#FFFFFF") {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color;
  ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; const rr2 = i % 2 ? r * 0.28 : r; ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } ctx.closePath(); ctx.fill(); ctx.restore();
}
function leaf(ctx, x, y, len, wid, rot, c1 = "#6FCF4A", c2 = "#2E8B3A") {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -wid, len, 0); ctx.quadraticCurveTo(len * 0.5, wid, 0, 0); ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, -wid, 0, wid, [[0, c1], [1, c2]]); ctx.fill(); stroke(ctx, 1.6, "rgba(20,70,25,0.6)");
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(len * 0.9, 0); ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();
}

// ───────────── NÔNG SẢN ─────────────
const CROPS = {
  lua(ctx) {
    ctx.save();
    const stalk = (x0, lean, h) => {
      ctx.beginPath(); ctx.moveTo(x0, 44); ctx.quadraticCurveTo(x0 + lean * 0.3, 10, x0 + lean, 44 - h);
      stroke(ctx, 3.4, "#7A8F2A");
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1); const px = x0 + lean * (0.35 + 0.65 * t) * (1 - 0.1 * t); const py = 44 - h * (0.35 + 0.65 * t);
        for (const s of [-1, 1]) {
          ctx.save(); ctx.translate(px + s * 3.2, py); ctx.rotate(s * 0.55 + lean * 0.01);
          ell(ctx, 0, -4, 3.6, 8.2); ctx.fillStyle = lin(ctx, -3, -8, 3, 4, [[0, "#FFE68A"], [1, "#D9A521"]]); ctx.fill(); stroke(ctx, 1.1, "rgba(120,80,10,0.7)"); ctx.restore();
        }
      }
      ctx.save(); ctx.translate(x0 + lean, 44 - h); ell(ctx, 0, -6, 3.6, 9); ctx.fillStyle = lin(ctx, -3, -14, 3, 4, [[0, "#FFE68A"], [1, "#D9A521"]]); ctx.fill(); stroke(ctx, 1.1, "rgba(120,80,10,0.7)"); ctx.restore();
    };
    stalk(-17, -10, 70); stalk(17, 11, 66); stalk(0, 0, 80);
    leaf(ctx, 0, 40, 26, 5, -2.5, "#A8D956", "#4E8F28"); leaf(ctx, 0, 40, 24, 5, -0.65, "#A8D956", "#4E8F28");
    ctx.restore();
  },
  ca_chua(ctx) {
    groundShadow(ctx, 40, 26, 5);
    ctx.save(); ctx.translate(0, 8);
    ctx.beginPath(); ctx.moveTo(-31, 0); ctx.bezierCurveTo(-31, -26, -14, -30, 0, -22); ctx.bezierCurveTo(14, -30, 31, -26, 31, 0); ctx.bezierCurveTo(31, 24, 14, 32, 0, 32); ctx.bezierCurveTo(-14, 32, -31, 24, -31, 0); ctx.closePath();
    ctx.fillStyle = rad(ctx, -10, -8, 3, 40, [[0, "#FF8A73"], [0.45, "#E93A2E"], [1, "#A31A17"]]); ctx.fill(); stroke(ctx, 2.2, "rgba(90,10,10,0.7)");
    shine(ctx, -13, -6, 7, 11, -0.5, 0.6);
    ctx.restore();
    // đài hoa
    ctx.save(); ctx.translate(0, -14);
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.62; leaf(ctx, 0, 2, 17, 4.4, a + Math.PI / 2 * 0 + (i - 2) * 0.1, "#7ED957", "#2E8B3A"); }
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -9); stroke(ctx, 3.6, "#3C8D2F"); ctx.restore();
  },
  carot(ctx) {
    groundShadow(ctx, 44, 24, 4);
    ctx.save(); ctx.rotate(0.45); ctx.translate(2, -2);
    ctx.beginPath(); ctx.moveTo(-15, -22); ctx.quadraticCurveTo(0, -30, 15, -22); ctx.quadraticCurveTo(14, 10, 2, 48); ctx.quadraticCurveTo(0, 50, -2, 48); ctx.quadraticCurveTo(-14, 10, -15, -22); ctx.closePath();
    ctx.fillStyle = lin(ctx, -15, 0, 15, 0, [[0, "#FFB05A"], [0.5, "#F5821F"], [1, "#C85A0C"]]); ctx.fill(); stroke(ctx, 2.2, "rgba(110,45,5,0.7)");
    ctx.strokeStyle = "rgba(150,60,5,0.55)"; ctx.lineWidth = 1.8;
    for (const [y, w] of [[-12, 9], [0, 7], [12, 5], [24, 3]]) { ctx.beginPath(); ctx.moveTo(-w, y); ctx.quadraticCurveTo(0, y + 3, w, y); ctx.stroke(); }
    shine(ctx, -7, -6, 3.2, 14, 0.05, 0.5);
    for (const [r, l] of [[-0.55, 30], [0, 36], [0.55, 30]]) leaf(ctx, 0, -24, l, 5.6, -Math.PI / 2 + r, "#8EE05A", "#2E8B3A");
    ctx.restore();
  },
  dua_hau(ctx) {
    groundShadow(ctx, 40, 36, 5);
    ctx.save(); ctx.translate(0, -2);
    const half = (r) => { ctx.beginPath(); ctx.moveTo(-r, -6); ctx.arc(0, -6, r, Math.PI, 0, true); ctx.arc(0, -6, r, 0, Math.PI, false); ctx.closePath(); };
    // nửa quả (cung dưới)
    ctx.beginPath(); ctx.arc(0, -8, 40, 0, Math.PI, false); ctx.closePath();
    ctx.fillStyle = lin(ctx, -40, 0, 40, 0, [[0, "#2F9D4B"], [0.5, "#58C86A"], [1, "#1F7A38"]]); ctx.fill(); stroke(ctx, 2.2, "rgba(10,60,20,0.75)");
    ctx.save(); ctx.clip(); ctx.strokeStyle = "rgba(15,80,35,0.55)"; ctx.lineWidth = 4;
    for (const a of [0.55, 1.1, 1.6, 2.1, 2.6]) { ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(Math.cos(a) * 46, -8 + Math.sin(a) * 46); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, -8, 34, 0, Math.PI, false); ctx.closePath(); ctx.fillStyle = "#F4F8D8"; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -8, 30, 0, Math.PI, false); ctx.closePath(); ctx.fillStyle = rad(ctx, 0, -8, 4, 32, [[0, "#FF8E8E"], [0.7, "#F2425A"], [1, "#D62849"]]); ctx.fill();
    ctx.fillStyle = "#2B1A1A";
    for (const [x, y, r] of [[-15, 4, 0.2], [-5, 12, 0.1], [6, 8, -0.2], [16, 2, -0.1], [-21, -1, 0.3], [0, 20, 0]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(r); ell(ctx, 0, 0, 2.2, 3.8); ctx.fill(); ctx.restore(); }
    // mặt cắt phẳng
    ell(ctx, 0, -8, 40, 7); ctx.fillStyle = "#F4F8D8"; ctx.fill(); stroke(ctx, 2, "rgba(10,60,20,0.6)");
    ell(ctx, 0, -8, 35, 5.4); ctx.fillStyle = "#F2425A"; ctx.fill();
    ctx.fillStyle = "#2B1A1A"; for (const x of [-22, -10, 4, 17, 27]) { ell(ctx, x, -8 + (x % 2 ? 0.5 : -0.5), 1.8, 1.2); ctx.fill(); }
    ctx.restore();
  },
  nho(ctx) {
    groundShadow(ctx, 44, 22, 4);
    const berries = [[-17, -10], [0, -12], [17, -10], [-9, 4], [9, 4], [-18, 8], [18, 8], [0, 18], [-9, 30], [9, 30], [0, 40]].sort((a, b) => a[1] - b[1]);
    ctx.save(); ctx.translate(0, -4); ctx.scale(0.92, 0.92);
    ctx.beginPath(); ctx.moveTo(2, -26); ctx.quadraticCurveTo(4, -38, 14, -44); stroke(ctx, 3.6, "#6B4A22");
    leaf(ctx, 6, -36, 28, 11, -0.2, "#7ED957", "#2E8B3A");
    for (const [x, y] of berries) {
      ell(ctx, x, y, 11.6, 11.6); ctx.fillStyle = rad(ctx, x - 4, y - 4, 1, 14, [[0, "#C9A2F0"], [0.5, "#7A3FB8"], [1, "#43207A"]]); ctx.fill(); stroke(ctx, 1.6, "rgba(40,15,70,0.65)");
      ell(ctx, x - 4, y - 4.5, 2.6, 3.6, -0.6); ctx.fillStyle = "rgba(255,255,255,0.65)"; ctx.fill();
    }
    ctx.restore();
  },
  dao(ctx) {
    groundShadow(ctx, 40, 26, 5);
    ctx.save(); ctx.translate(0, 8);
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.bezierCurveTo(-30, -38, -44, 8, -20, 30); ctx.bezierCurveTo(-10, 38, 0, 34, 0, 34); ctx.bezierCurveTo(0, 34, 10, 38, 20, 30); ctx.bezierCurveTo(44, 8, 30, -38, 0, -24); ctx.closePath();
    ctx.fillStyle = rad(ctx, -12, -8, 3, 52, [[0, "#FFD1B0"], [0.45, "#FF8FA0"], [1, "#E5527A"]]); ctx.fill(); stroke(ctx, 2.2, "rgba(120,30,50,0.7)");
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.quadraticCurveTo(-7, 0, 0, 34); ctx.strokeStyle = "rgba(190,60,90,0.55)"; ctx.lineWidth = 2.2; ctx.stroke();
    shine(ctx, -17, -2, 5, 11, -0.35, 0.5);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.quadraticCurveTo(2, -26, 6, -30); stroke(ctx, 3, "#6B4A22");
    leaf(ctx, 3, -26, 30, 10, -0.55, "#8EE05A", "#2E8B3A");
  },
  dua_vang(ctx) {
    groundShadow(ctx, 40, 30, 5);
    ctx.save(); ctx.translate(0, 4);
    ell(ctx, 0, 0, 36, 32); ctx.fillStyle = rad(ctx, -10, -12, 3, 50, [[0, "#FFF2A0"], [0.5, "#F7C531"], [1, "#C98C0C"]]); ctx.fill(); stroke(ctx, 2.2, "rgba(120,80,0,0.75)");
    ctx.save(); ell(ctx, 0, 0, 36, 32); ctx.clip();
    ctx.strokeStyle = "rgba(150,95,0,0.45)"; ctx.lineWidth = 1.6;
    for (let i = -5; i <= 5; i++) { ctx.beginPath(); ctx.moveTo(i * 8, -34); ctx.quadraticCurveTo(i * 9.5, 0, i * 8, 34); ctx.stroke(); }
    for (let j = -4; j <= 4; j++) { ctx.beginPath(); ctx.moveTo(-38, j * 8); ctx.quadraticCurveTo(0, j * 8 + 5, 38, j * 8); ctx.stroke(); }
    ctx.restore();
    shine(ctx, -15, -14, 6, 12, -0.6, 0.6);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(0, -37); stroke(ctx, 4.6, "#6B4A22"); leaf(ctx, 2, -34, 20, 7, -0.4, "#8EE05A", "#2E8B3A");
    sparkle(ctx, 26, -26, 7, "#FFFFFF"); sparkle(ctx, -30, 22, 4.5, "#FFF7C0");
  },
  linh_chi(ctx) {
    ctx.save();
    ctx.save(); ell(ctx, 0, 6, 46, 40); ctx.fillStyle = rad(ctx, 0, 6, 8, 52, [[0, "rgba(255,120,80,0.55)"], [1, "rgba(255,120,80,0)"]]); ctx.fill(); ctx.restore();
    groundShadow(ctx, 42, 24, 4);
    ctx.beginPath(); ctx.moveTo(-6, 44); ctx.quadraticCurveTo(-8, 22, -10, 10); ctx.lineTo(10, 10); ctx.quadraticCurveTo(10, 24, 8, 44); ctx.closePath();
    ctx.fillStyle = lin(ctx, -10, 0, 10, 0, [[0, "#7A3B1C"], [1, "#4B2210"]]); ctx.fill(); stroke(ctx, 2, "rgba(40,15,5,0.8)");
    ctx.beginPath(); ctx.moveTo(-40, 6); ctx.bezierCurveTo(-42, -26, -14, -34, 6, -32); ctx.bezierCurveTo(32, -30, 44, -12, 40, 8); ctx.bezierCurveTo(24, 20, -22, 18, -40, 6); ctx.closePath();
    ctx.fillStyle = lin(ctx, -30, -30, 30, 14, [[0, "#E04B2A"], [0.5, "#B5260F"], [1, "#6E1408"]]); ctx.fill(); stroke(ctx, 2.2, "rgba(60,10,5,0.85)");
    ctx.save(); ctx.clip();
    for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.ellipse(2, 8, 12 + i * 8.5, 6 + i * 6.4, 0, Math.PI, TAU); ctx.strokeStyle = `rgba(255,${150 + i * 20},90,${0.38 - i * 0.04})`; ctx.lineWidth = 1.6; ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, 11, 44, 8, 0, 0, TAU); ctx.fillStyle = "rgba(255,214,100,0.9)"; ctx.fill();
    ctx.restore();
    shine(ctx, -16, -16, 9, 4.5, -0.4, 0.55);
    sparkle(ctx, 30, -26, 6, "#FFE9A8"); sparkle(ctx, -36, -22, 4, "#FFE9A8");
    ctx.restore();
  },
};

// ───────────── HẠT GIỐNG (gói hạt) ─────────────
const CROP_COLOR = { lua: "#E8B923", ca_chua: "#E0402E", carot: "#F08A24", dua_hau: "#2F9D4B", nho: "#7A3FB8", dao: "#F2708F", dua_vang: "#E8B923", linh_chi: "#B5260F" };
function drawSeedPacket(ctx, key, rarityColor) {
  const col = CROP_COLOR[key] || "#6FBF4A";
  groundShadow(ctx, 44, 26, 5);
  ctx.save(); ctx.rotate(-0.05);
  // thân gói
  ctx.beginPath(); ctx.moveTo(-28, -32);
  for (let i = 0; i <= 8; i++) ctx.lineTo(-28 + i * 7, -32 + (i % 2 ? 4 : 0)); // mép dập răng cưa
  ctx.lineTo(28, 40); ctx.quadraticCurveTo(0, 44, -28, 40); ctx.closePath();
  ctx.fillStyle = lin(ctx, -28, 0, 28, 0, [[0, shade(col, 0.22)], [0.55, col], [1, shade(col, -0.28)]]); ctx.fill(); stroke(ctx, 2.4, "rgba(40,22,10,0.7)");
  // dải trên (giấy kraft)
  ctx.save(); ctx.clip(); ctx.fillStyle = "rgba(255,244,214,0.95)"; ctx.fillRect(-30, -36, 60, 13);
  ctx.strokeStyle = "rgba(120,90,50,0.35)"; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-30, -33 + i * 3); ctx.lineTo(30, -33 + i * 3); ctx.stroke(); }
  ctx.restore();
  // nhãn tròn
  ell(ctx, 0, 4, 22, 24); ctx.fillStyle = "#FFF6DC"; ctx.fill(); stroke(ctx, 2, "rgba(90,60,20,0.55)");
  ell(ctx, 0, 4, 18.5, 20.5); ctx.strokeStyle = alpha(col, 0.55); ctx.lineWidth = 1.4; ctx.stroke();
  ctx.save(); ctx.translate(0, 5); ctx.scale(0.36, 0.36); (CROPS[key] || CROPS.lua)(ctx); ctx.restore();
  // dải độ hiếm
  ctx.save(); rr(ctx, -28, 30, 56, 7, 3); ctx.fillStyle = rarityColor || "#94A3B8"; ctx.globalAlpha = 0.9; ctx.fill(); ctx.restore();
  shine(ctx, -22, -4, 3, 22, 0.05, 0.28);
  ctx.restore();
  // hạt rơi
  for (const [x, y, r] of [[30, 42, 0.5], [36, 38, -0.4], [24, 45, 0.1]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(r); ell(ctx, 0, 0, 3.6, 2.2); ctx.fillStyle = lin(ctx, 0, -2, 0, 2, [[0, "#C79A5A"], [1, "#7A5428"]]); ctx.fill(); stroke(ctx, 1, "rgba(60,35,10,0.7)"); ctx.restore(); }
}

// ───────────── ĐẤT TRỒNG (ô đất isometric) ─────────────
const LAND_STYLE = {
  land_basic: { top: "#9A6A3E", top2: "#7A4F2B", side: "#5B3A1E", side2: "#472C16", furrow: "rgba(60,35,15,0.5)" },
  land_fertile: { top: "#5E3F25", top2: "#3E2815", side: "#33200F", side2: "#24170B", furrow: "rgba(15,8,3,0.55)" },
  land_premium: { top: "#A8732E", top2: "#7C4F17", side: "#5E3B0F", side2: "#472B08", furrow: "rgba(70,40,5,0.5)" },
  land_magic: { top: "#4B2F7A", top2: "#2D1A52", side: "#241543", side2: "#190E31", furrow: "rgba(12,5,30,0.55)" },
};
function drawLand(ctx, id) {
  const st = LAND_STYLE[id] || LAND_STYLE.land_basic;
  const P = (u, v, z = 0) => [(u + v) * 36, (v - u) * 20 - z];
  const poly = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  ctx.save(); ctx.translate(0, 2); ctx.scale(0.68, 0.68);
  if (id === "land_magic") { ell(ctx, 0, 4, 58, 36); ctx.fillStyle = rad(ctx, 0, 4, 6, 60, [[0, "rgba(190,120,255,0.55)"], [1, "rgba(190,120,255,0)"]]); ctx.fill(); }
  groundShadow(ctx, 30, 48, 8);
  const T = 14; // độ dày
  const A = P(-1, -1), B = P(1, -1), Cc = P(1, 1), D = P(-1, 1);
  // mặt bên trái & phải
  poly([D, Cc, [Cc[0], Cc[1] + T], [D[0], D[1] + T]]); ctx.fillStyle = lin(ctx, 0, 0, 0, 30, [[0, st.side], [1, st.side2]]); ctx.fill(); stroke(ctx, 1.8, "rgba(20,10,4,0.7)");
  poly([Cc, B, [B[0], B[1] + T], [Cc[0], Cc[1] + T]]); ctx.fillStyle = lin(ctx, 0, 0, 0, 30, [[0, shade(st.side, -0.12)], [1, shade(st.side2, -0.1)]]); ctx.fill(); stroke(ctx, 1.8, "rgba(20,10,4,0.7)");
  // lớp đất xếp tầng ở mặt bên
  ctx.save(); poly([D, Cc, [Cc[0], Cc[1] + T], [D[0], D[1] + T]]); ctx.clip(); ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 1.4; for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(D[0], D[1] + (T * k) / 3); ctx.lineTo(Cc[0], Cc[1] + (T * k) / 3); ctx.stroke(); } ctx.restore();
  // mặt trên
  poly([A, B, Cc, D]); ctx.fillStyle = lin(ctx, -40, -20, 40, 24, [[0, st.top], [1, st.top2]]); ctx.fill(); stroke(ctx, 2, "rgba(20,10,4,0.75)");
  ctx.save(); poly([A, B, Cc, D]); ctx.clip();
  // luống cày
  for (let k = -3; k <= 3; k++) {
    const v = k / 3.6; const [x0, y0] = P(-1, v), [x1, y1] = P(1, v);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = st.furrow; ctx.lineWidth = 3.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, y0 - 2.4); ctx.lineTo(x1, y1 - 2.4); ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 1.4; ctx.stroke();
  }
  if (id === "land_basic") {
    ctx.fillStyle = "rgba(60,40,20,0.55)"; for (const [u, v, r] of [[-0.6, 0.2, 2.4], [0.3, -0.5, 2], [0.62, 0.55, 2.6], [-0.1, 0.7, 1.8], [-0.7, -0.6, 1.8]]) { const [x, y] = P(u, v); ell(ctx, x, y, r * 1.5, r); ctx.fill(); }
  } else if (id === "land_fertile") {
    for (const [u, v] of [[-0.55, -0.55], [0, -0.55], [0.55, -0.55], [-0.55, 0.1], [0.1, 0.1], [0.62, 0.1], [-0.3, 0.7], [0.3, 0.7]]) { const [x, y] = P(u, v); ctx.save(); ctx.translate(x, y); ctx.scale(0.42, 0.42); leaf(ctx, 0, 0, 16, 5, -2.2, "#8EE05A", "#2E8B3A"); leaf(ctx, 0, 0, 16, 5, -0.95, "#8EE05A", "#2E8B3A"); ctx.restore(); }
  } else if (id === "land_premium") {
    for (const [u, v] of [[-0.6, -0.3], [-0.1, 0.5], [0.5, -0.4], [0.35, 0.25], [-0.5, 0.65], [0.7, 0.6]]) { const [x, y] = P(u, v); sparkle(ctx, x, y, 4.2, "#FFE27A"); }
    for (const [u, v, c] of [[-0.8, -0.8, "#FFFFFF"], [0.8, 0.8, "#FFD6E8"]]) { const [x, y] = P(u, v); ctx.fillStyle = c; for (let i = 0; i < 5; i++) { const a = (i * TAU) / 5; ell(ctx, x + Math.cos(a) * 2.6, y + Math.sin(a) * 2, 1.9, 1.9); ctx.fill(); } ctx.fillStyle = "#F5B400"; ell(ctx, x, y, 1.6, 1.6); ctx.fill(); }
  } else if (id === "land_magic") {
    for (const [u, v, h] of [[-0.45, -0.2, 14], [0.2, 0.35, 18], [0.5, -0.5, 11]]) {
      const [x, y] = P(u, v); ctx.save(); ctx.translate(x, y);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-5, -h * 0.55); ctx.lineTo(0, -h); ctx.lineTo(5, -h * 0.55); ctx.closePath();
      ctx.fillStyle = lin(ctx, -5, -h, 5, 0, [[0, "#E7D2FF"], [0.5, "#B07CFF"], [1, "#6E3FD0"]]); ctx.shadowColor = "#C894FF"; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0; stroke(ctx, 1.3, "rgba(50,20,100,0.8)"); ctx.restore();
    }
    for (const [u, v] of [[-0.7, 0.3], [0.1, -0.2], [0.7, 0.2], [-0.2, 0.75]]) { const [x, y] = P(u, v); sparkle(ctx, x, y - 4, 3.6, "#F2E0FF"); }
  }
  ctx.restore();
  // viền sáng mép trên
  ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1.6; ctx.stroke();
  if (id === "land_premium") { // hàng rào gỗ nhỏ
    ctx.fillStyle = "#C98F4A"; for (let i = -3; i <= 3; i++) { const [x, y] = P(i / 3.2, 1); rr(ctx, x - 1.6, y - 7, 3.2, 8, 1); ctx.fill(); stroke(ctx, 1, "rgba(60,30,5,0.7)"); }
  }
  ctx.restore();
}

// ───────────── DỤNG CỤ ─────────────
const METAL = {
  wood: ["#D9A66B", "#A06A32", "#6B4220"],
  iron: ["#E6ECF2", "#9AA8B6", "#5A6877"],
  gold: ["#FFF3A8", "#F2B91C", "#B97A07"],
  tin: ["#F1F6FA", "#A9BAC9", "#667789"],
  copper: ["#FFD0A0", "#D9783A", "#8F4318"],
};
function drawHoe(ctx, tier) {
  const m = METAL[tier] || METAL.iron;
  groundShadow(ctx, 44, 30, 5);
  ctx.save(); ctx.rotate(0.55); ctx.translate(-4, 2);
  // cán
  rr(ctx, -3.8, -22, 7.6, 70, 3.8); ctx.fillStyle = lin(ctx, -4, 0, 4, 0, [[0, "#E7B77A"], [0.5, "#B77B3C"], [1, "#7C4A1F"]]); ctx.fill(); stroke(ctx, 1.8, "rgba(50,28,10,0.8)");
  ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-1.4, -18); ctx.lineTo(-1.4, 44); ctx.stroke();
  // đầu cuốc
  ctx.beginPath(); ctx.moveTo(-8, -26); ctx.lineTo(34, -26); ctx.quadraticCurveTo(40, -26, 40, -20); ctx.lineTo(34, 2); ctx.quadraticCurveTo(32, 5, 28, 3); ctx.lineTo(8, -8); ctx.lineTo(-8, -8); ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, -26, 0, 4, [[0, m[0]], [0.5, m[1]], [1, m[2]]]); ctx.fill(); stroke(ctx, 2.2, "rgba(30,20,10,0.8)");
  ctx.beginPath(); ctx.moveTo(-4, -23); ctx.lineTo(33, -23); ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1.6; ctx.stroke();
  // đinh tán
  ctx.fillStyle = shade(m[1], -0.35); for (const x of [-1, 10]) { ell(ctx, x, -17, 1.7, 1.7); ctx.fill(); }
  if (tier === "gold") { ctx.save(); ctx.translate(26, -15); ctx.rotate(0.78); rr(ctx, -4, -4, 8, 8, 1.5); ctx.fillStyle = lin(ctx, -4, -4, 4, 4, [[0, "#C9F2FF"], [1, "#3FA4E0"]]); ctx.fill(); stroke(ctx, 1.2, "rgba(10,50,90,0.8)"); ctx.restore(); sparkle(ctx, 36, -32, 6, "#FFF7C0"); }
  if (tier === "wood") { ctx.strokeStyle = "rgba(70,40,15,0.5)"; ctx.lineWidth = 1.2; for (const y of [-21, -16, -11]) { ctx.beginPath(); ctx.moveTo(2, y); ctx.lineTo(30, y); ctx.stroke(); } }
  ctx.restore();
  // luống đất nhỏ
  ctx.fillStyle = "rgba(90,58,30,0.9)"; ell(ctx, 28, 44, 12, 3); ctx.fill();
}
function drawBucket(ctx, tier) {
  const m = METAL[tier] || METAL.tin;
  groundShadow(ctx, 42, 30, 5);
  // quai
  ctx.beginPath(); ctx.moveTo(-26, -14); ctx.bezierCurveTo(-26, -52, 26, -52, 26, -14); stroke(ctx, 3.6, "#4B5563");
  ctx.beginPath(); ctx.moveTo(-26, -14); ctx.bezierCurveTo(-26, -52, 26, -52, 26, -14); ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.2; ctx.stroke();
  // thân
  ctx.beginPath(); ctx.moveTo(-28, -16); ctx.lineTo(-21, 36); ctx.quadraticCurveTo(0, 44, 21, 36); ctx.lineTo(28, -16); ctx.closePath();
  ctx.fillStyle = lin(ctx, -28, 0, 28, 0, [[0, m[2]], [0.28, m[0]], [0.55, m[1]], [1, m[2]]]); ctx.fill(); stroke(ctx, 2.4, "rgba(25,25,35,0.75)");
  ctx.save(); ctx.clip();
  for (const y of [-2, 24]) { ctx.beginPath(); ctx.moveTo(-32, y); ctx.quadraticCurveTo(0, y + 8, 32, y); ctx.strokeStyle = "rgba(20,20,30,0.45)"; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-32, y - 3); ctx.quadraticCurveTo(0, y + 5, 32, y - 3); ctx.stroke(); }
  ctx.restore();
  shine(ctx, -17, 10, 2.6, 22, 0.1, 0.45);
  // miệng + nước
  ell(ctx, 0, -16, 28, 8); ctx.fillStyle = shade(m[1], -0.25); ctx.fill(); stroke(ctx, 2.4, "rgba(25,25,35,0.75)");
  ell(ctx, 0, -15, 24.5, 6); ctx.fillStyle = lin(ctx, 0, -21, 0, -9, [[0, "#9FE3FF"], [1, "#2FA3E8"]]); ctx.fill();
  ell(ctx, -6, -16, 7, 1.6); ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.2; ctx.stroke();
  // giọt nước
  for (const [x, y, s] of [[34, 6, 1], [38, 22, 0.8]]) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(6, 1, 0, 6); ctx.quadraticCurveTo(-6, 1, 0, -7); ctx.fillStyle = lin(ctx, 0, -7, 0, 6, [[0, "#BDEBFF"], [1, "#2F9BE0"]]); ctx.fill(); stroke(ctx, 1.2, "rgba(10,60,110,0.7)"); ctx.restore(); }
  if (tier === "gold") { sparkle(ctx, -32, -30, 6, "#FFF7C0"); sparkle(ctx, 34, -34, 4.5, "#FFFFFF"); }
}
function drawSprinkler(ctx, tier) {
  const pro = tier === "pro";
  const body = pro ? ["#FFE27A", "#F2A91C", "#A86A07"] : ["#DDE7F0", "#8FA3B7", "#546578"];
  // tia nước
  ctx.save();
  for (const [a, len] of [[-2.55, 30], [-2.15, 36], [-1.75, 38], [-1.4, 38], [-1.05, 36], [-0.65, 30]]) {
    const ex = Math.cos(a) * len, ey = -22 + Math.sin(a) * len * 0.6;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.quadraticCurveTo(Math.cos(a) * len * 0.55, -22 + Math.sin(a) * len * 0.95, ex, ey + 26);
    ctx.strokeStyle = "rgba(120,205,255,0.9)"; ctx.lineWidth = 2.6; ctx.lineCap = "round"; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, ey + 27, 1.8, 0, TAU); ctx.fillStyle = "#9ADBFF"; ctx.fill();
  }
  ctx.restore();
  groundShadow(ctx, 44, 28, 5);
  // đế
  rr(ctx, -22, 34, 44, 10, 4); ctx.fillStyle = lin(ctx, 0, 34, 0, 44, [[0, "#6B7280"], [1, "#374151"]]); ctx.fill(); stroke(ctx, 2, "rgba(15,15,25,0.8)");
  // trụ
  rr(ctx, -5, -6, 10, 42, 3); ctx.fillStyle = lin(ctx, -5, 0, 5, 0, [[0, body[2]], [0.4, body[0]], [1, body[2]]]); ctx.fill(); stroke(ctx, 2, "rgba(15,15,25,0.8)");
  // thân đầu phun
  rr(ctx, -14, -26, 28, 22, 6); ctx.fillStyle = lin(ctx, 0, -26, 0, -4, [[0, body[0]], [0.5, body[1]], [1, body[2]]]); ctx.fill(); stroke(ctx, 2.2, "rgba(15,15,25,0.8)");
  ctx.beginPath(); ctx.arc(0, -26, 9, Math.PI, 0); ctx.fillStyle = lin(ctx, 0, -35, 0, -26, [[0, body[0]], [1, body[1]]]); ctx.fill(); stroke(ctx, 2, "rgba(15,15,25,0.8)");
  ell(ctx, 0, -15, 4.2, 4.2); ctx.fillStyle = "#38BDF8"; ctx.fill(); stroke(ctx, 1.4, "rgba(10,50,90,0.8)");
  // đèn trạng thái
  ell(ctx, -9, -20, 1.8, 1.8); ctx.fillStyle = "#4ADE80"; ctx.shadowColor = "#4ADE80"; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
  if (pro) { // tấm pin mặt trời
    ctx.save(); ctx.translate(20, -34); ctx.rotate(-0.5); rr(ctx, -12, -6, 24, 13, 2); ctx.fillStyle = lin(ctx, -12, -6, 12, 7, [[0, "#3B82F6"], [1, "#1E3A8A"]]); ctx.fill(); stroke(ctx, 1.6, "rgba(10,15,40,0.9)");
    ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 0.9; for (const x of [-4, 4]) { ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x, 7); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(-12, 0.5); ctx.lineTo(12, 0.5); ctx.stroke(); ctx.restore();
    sparkle(ctx, -22, -40, 5, "#FFF7C0");
  }
}

// ───────────── THUỐC (lọ thuốc) ─────────────
const MED = {
  med_growth_small: { shape: "round", liquid: "#58D86B", glow: "#7BFF8A", emblem: "sprout", size: 0.82 },
  med_growth_large: { shape: "tall", liquid: "#2FB85A", glow: "#52F08A", emblem: "sprout2", size: 1 },
  med_growth_field: { shape: "jar", liquid: "#1FC8A8", glow: "#5FFFE0", emblem: "field", size: 1 },
  med_x2_money: { shape: "round", liquid: "#F5C21B", glow: "#FFE35E", emblem: "x2", size: 1, cork: "#7C4A1F" },
  med_rare_boost: { shape: "star", liquid: "#B46BFF", glow: "#D9A8FF", emblem: "star", size: 1, sparkles: true },
  med_golden: { shape: "crown", liquid: "#FFC933", glow: "#FFE98A", emblem: "crown", size: 1.05, sparkles: true, rays: true },
};
function bottlePath(ctx, shape) {
  ctx.beginPath();
  if (shape === "round" || shape === "star") { // bình cầu cổ ngắn
    ctx.moveTo(-8, -34); ctx.lineTo(-8, -18); ctx.bezierCurveTo(-30, -8, -32, 34, 0, 36); ctx.bezierCurveTo(32, 34, 30, -8, 8, -18); ctx.lineTo(8, -34); ctx.closePath();
  } else if (shape === "tall") {
    ctx.moveTo(-8, -40); ctx.lineTo(-8, -26); ctx.bezierCurveTo(-26, -20, -24, -10, -24, -4); ctx.lineTo(-24, 28); ctx.quadraticCurveTo(-24, 38, -14, 38); ctx.lineTo(14, 38); ctx.quadraticCurveTo(24, 38, 24, 28); ctx.lineTo(24, -4); ctx.bezierCurveTo(24, -10, 26, -20, 8, -26); ctx.lineTo(8, -40); ctx.closePath();
  } else if (shape === "jar") {
    ctx.moveTo(-18, -26); ctx.lineTo(-18, -20); ctx.bezierCurveTo(-34, -14, -34, 30, -22, 36); ctx.lineTo(22, 36); ctx.bezierCurveTo(34, 30, 34, -14, 18, -20); ctx.lineTo(18, -26); ctx.closePath();
  } else { // crown: bình trang trí
    ctx.moveTo(-8, -36); ctx.lineTo(-8, -22); ctx.bezierCurveTo(-34, -14, -34, 20, -22, 30); ctx.quadraticCurveTo(-14, 38, 0, 38); ctx.quadraticCurveTo(14, 38, 22, 30); ctx.bezierCurveTo(34, 20, 34, -14, 8, -22); ctx.lineTo(8, -36); ctx.closePath();
  }
}
function liquidTop(shape) { return { round: -8, star: -8, tall: -6, jar: -8, crown: -6 }[shape] ?? -8; }
function drawEmblem(ctx, kind, liquid) {
  ctx.save();
  if (kind === "sprout" || kind === "sprout2") {
    ctx.translate(0, 12); ctx.beginPath(); ctx.moveTo(0, 12); ctx.quadraticCurveTo(1, 2, 0, -6); stroke(ctx, 3, "#1E6B33");
    leaf(ctx, 0, -2, 15, 5, -2.4, "#C8FF9A", "#3FAE4D"); leaf(ctx, 0, -2, 15, 5, -0.75, "#C8FF9A", "#3FAE4D");
    if (kind === "sprout2") { leaf(ctx, 0, 6, 11, 4, -2.7, "#C8FF9A", "#3FAE4D"); leaf(ctx, 0, 6, 11, 4, -0.45, "#C8FF9A", "#3FAE4D"); }
  } else if (kind === "field") {
    ctx.translate(0, 14);
    for (const x of [-12, 0, 12]) { ctx.save(); ctx.translate(x, 6); ctx.scale(0.6, 0.6); ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -6); stroke(ctx, 3.4, "#1E6B33"); leaf(ctx, 0, -2, 14, 5, -2.4, "#C8FF9A", "#3FAE4D"); leaf(ctx, 0, -2, 14, 5, -0.75, "#C8FF9A", "#3FAE4D"); ctx.restore(); }
    ctx.beginPath(); ctx.moveTo(-18, 12); ctx.quadraticCurveTo(0, 8, 18, 12); ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.6; ctx.stroke();
  } else if (kind === "x2") {
    ctx.translate(0, 14); ell(ctx, 0, 0, 14, 14); ctx.fillStyle = lin(ctx, -10, -10, 10, 10, [[0, "#FFF3A8"], [1, "#E19A0B"]]); ctx.fill(); stroke(ctx, 1.8, "rgba(110,60,0,0.9)");
    ctx.font = `bold 15px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#7A4300"; ctx.fillText("x2", 0, 1);
  } else if (kind === "star") {
    ctx.translate(0, 13); ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 6 : 14; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, -14, 0, 14, [[0, "#FFFFFF"], [1, "#F3D7FF"]]); ctx.fill(); stroke(ctx, 1.6, "rgba(70,20,120,0.8)");
  } else if (kind === "crown") {
    ctx.translate(0, 12); ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(-16, -8); ctx.lineTo(-7, 0); ctx.lineTo(0, -12); ctx.lineTo(7, 0); ctx.lineTo(16, -8); ctx.lineTo(14, 10); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, -12, 0, 10, [[0, "#FFF6B0"], [1, "#E19A0B"]]); ctx.fill(); stroke(ctx, 1.7, "rgba(110,60,0,0.9)");
    for (const [x, y] of [[-16, -8], [0, -12], [16, -8]]) { ell(ctx, x, y, 2.4, 2.4); ctx.fillStyle = "#FF5D73"; ctx.fill(); }
  }
  ctx.restore();
}
function drawMedicine(ctx, id) {
  const d = MED[id] || MED.med_growth_small;
  ctx.save(); ctx.scale(d.size, d.size); ctx.translate(0, (1 - d.size) * 14);
  if (d.rays) { ctx.save(); ctx.translate(0, 6); for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(-3, -52); ctx.lineTo(3, -52); ctx.closePath(); ctx.fillStyle = alpha(d.glow, 0.35); ctx.fill(); } ctx.restore(); }
  ell(ctx, 0, 6, 44, 44); ctx.fillStyle = rad(ctx, 0, 6, 8, 46, [[0, alpha(d.glow, 0.5)], [1, alpha(d.glow, 0)]]); ctx.fill();
  groundShadow(ctx, 40, 26, 4.6);
  // thủy tinh (nền)
  bottlePath(ctx, d.shape); ctx.fillStyle = "rgba(235,248,255,0.55)"; ctx.fill();
  // chất lỏng
  ctx.save(); bottlePath(ctx, d.shape); ctx.clip();
  const top = liquidTop(d.shape);
  ctx.beginPath(); ctx.moveTo(-50, top); for (let x = -50; x <= 50; x += 5) ctx.lineTo(x, top + Math.sin(x * 0.22) * 2.1); ctx.lineTo(50, 60); ctx.lineTo(-50, 60); ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, top, 0, 40, [[0, shade(d.liquid, 0.25)], [0.5, d.liquid], [1, shade(d.liquid, -0.35)]]); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)"; for (const [x, y, r] of [[-12, 28, 2.4], [8, 22, 1.8], [14, 30, 2.8], [-4, 14, 1.6], [-16, 12, 1.4]]) { ell(ctx, x, y, r, r); ctx.fill(); }
  ctx.restore();
  bottlePath(ctx, d.shape); stroke(ctx, 2.6, "rgba(30,45,60,0.75)");
  // nhãn / biểu tượng
  drawEmblem(ctx, d.emblem, d.liquid);
  // phản chiếu
  ctx.save(); bottlePath(ctx, d.shape); ctx.clip(); rr(ctx, -22, -16, 5, 44, 2.5); ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fill(); rr(ctx, 16, -4, 3, 22, 1.5); ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fill(); ctx.restore();
  // nút chai
  if (d.shape === "jar") { rr(ctx, -21, -35, 42, 11, 4); ctx.fillStyle = lin(ctx, 0, -35, 0, -24, [[0, "#C89B5A"], [1, "#8A5E2C"]]); ctx.fill(); stroke(ctx, 2.2, "rgba(50,28,10,0.85)"); }
  else if (d.shape === "crown") { rr(ctx, -10, -46, 20, 12, 3); ctx.fillStyle = lin(ctx, 0, -46, 0, -34, [[0, "#FFF3A8"], [1, "#D9930B"]]); ctx.fill(); stroke(ctx, 2.2, "rgba(90,50,0,0.9)"); ell(ctx, 0, -48, 4, 4); ctx.fillStyle = "#FF5D73"; ctx.fill(); stroke(ctx, 1.2, "rgba(90,20,30,0.9)"); }
  else { const cy = d.shape === "tall" ? -50 : -42; rr(ctx, -9, cy, 18, 11, 3); ctx.fillStyle = lin(ctx, 0, cy, 0, cy + 11, [[0, d.cork ? "#C89B5A" : "#E7C58E"], [1, d.cork || "#A87638"]]); ctx.fill(); stroke(ctx, 2.2, "rgba(50,28,10,0.85)"); }
  ctx.restore();
  if (d.sparkles) { sparkle(ctx, -30, -26, 6, "#FFFFFF"); sparkle(ctx, 32, -10, 4.5, d.glow); sparkle(ctx, 26, 30, 3.5, "#FFFFFF"); }
}

// ───────────── giao diện công khai ─────────────
const keyOf = (id) => String(id || "").replace(/^(seed_|crop_)/, "");
const TOOL_DRAW = {
  tool_hoe_wood: (c) => drawHoe(c, "wood"), tool_hoe_iron: (c) => drawHoe(c, "iron"), tool_hoe_gold: (c) => drawHoe(c, "gold"),
  tool_bucket_tin: (c) => drawBucket(c, "tin"), tool_bucket_copper: (c) => drawBucket(c, "copper"), tool_bucket_gold: (c) => drawBucket(c, "gold"),
  tool_sprinkler_auto: (c) => { c.scale(1.15, 1.15); c.translate(0, -3); drawSprinkler(c, "auto"); }, tool_sprinkler_pro: (c) => { c.scale(1.12, 1.12); c.translate(-2, -2); drawSprinkler(c, "pro"); },
};
export const RARITY_HEX = { common: "#94A3B8", uncommon: "#22C55E", rare: "#3B82F6", epic: "#A855F7", legendary: "#F97316", mythic: "#EF4444" };

export function drawIcon(ctx, kind, id, cx, cy, size, opts = {}) {
  ctx.save();
  ctx.translate(cx, cy); const s = size / 100; ctx.scale(s, s);
  try {
    if (kind === "crop") (CROPS[keyOf(id)] || CROPS.lua)(ctx);
    else if (kind === "seed") drawSeedPacket(ctx, keyOf(id), opts.rarityColor);
    else if (kind === "land") drawLand(ctx, id);
    else if (kind === "tool") (TOOL_DRAW[id] || TOOL_DRAW.tool_hoe_wood)(ctx);
    else if (kind === "medicine") drawMedicine(ctx, id);
  } finally { ctx.restore(); }
}


/** Cây đang trồng theo giai đoạn: gò đất + mầm lớn dần; khi chín hiện nông sản. */
export function drawPlantStage(ctx, status, progress, id, cx, cy, size) {
  ctx.save(); ctx.translate(cx, cy); const k = size / 100; ctx.scale(k, k);
  // gò đất
  ctx.save(); ell(ctx, 0, 34, 40, 13); ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-40, 38); ctx.bezierCurveTo(-36, 18, -16, 14, 0, 14); ctx.bezierCurveTo(16, 14, 36, 18, 40, 38); ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, 14, 0, 40, [[0, "#9A6A3E"], [1, "#5B3A1E"]]); ctx.fill(); stroke(ctx, 2.2, "rgba(30,15,5,0.7)");
  ctx.fillStyle = "rgba(60,35,15,0.5)"; for (const [x, y] of [[-20, 28], [-4, 24], [14, 29], [26, 33]]) { ell(ctx, x, y, 3, 1.8); ctx.fill(); }
  ctx.restore();
  if (status === "ready") {
    ctx.save(); ctx.translate(0, -6); ctx.scale(0.8, 0.8); (CROPS[keyOf(id)] || CROPS.lua)(ctx); ctx.restore();
    sparkle(ctx, 30, -30, 8, "#FFF7C0"); sparkle(ctx, -32, -20, 5.5, "#FFFFFF");
  } else if (status === "seeded") {
    ctx.fillStyle = "#C79A5A"; for (const [x, y] of [[-6, 24], [6, 22]]) { ell(ctx, x, y, 4.2, 2.6, 0.4); ctx.fill(); stroke(ctx, 1, "rgba(60,35,10,0.7)"); }
    ctx.beginPath(); ctx.moveTo(0, 16); ctx.quadraticCurveTo(1, 8, 0, 4); stroke(ctx, 2.6, "#3C8D2F"); leaf(ctx, 0, 6, 11, 4, -2.4); leaf(ctx, 0, 6, 11, 4, -0.75);
  } else {
    const t = Math.max(0.2, Math.min(1, progress || 0.3)); const h = 14 + t * 40;
    ctx.beginPath(); ctx.moveTo(0, 18); ctx.quadraticCurveTo(2, 18 - h / 2, 0, 18 - h); stroke(ctx, 3 + t * 1.5, "#3C8D2F");
    const n = status === "almost" ? 3 : 2;
    for (let i = 0; i < n; i++) { const yy = 18 - h * (0.35 + 0.3 * i); const L = 12 + t * 14; leaf(ctx, 0, yy, L, 4.5 + t * 2.2, -Math.PI + 0.55 - i * 0.1); leaf(ctx, 0, yy - 3, L, 4.5 + t * 2.2, -0.55 + i * 0.1); }
    leaf(ctx, 0, 18 - h, 12 + t * 8, 4.6, -Math.PI / 2 - 0.4); leaf(ctx, 0, 18 - h, 12 + t * 8, 4.6, -Math.PI / 2 + 0.4);
    if (status === "almost") { ctx.fillStyle = CROP_COLOR[keyOf(id)] || "#E0402E"; ell(ctx, 8, 18 - h * 0.6, 4, 4); ctx.fill(); stroke(ctx, 1, "rgba(40,20,10,0.6)"); ell(ctx, -9, 18 - h * 0.45, 3.4, 3.4); ctx.fill(); stroke(ctx, 1, "rgba(40,20,10,0.6)"); }
  }
  ctx.restore();
}

/** Ô nền (bo góc, ánh sáng theo độ hiếm) chứa icon — dùng trong các thẻ danh sách. */
export function drawIconTile(ctx, kind, id, x, y, size, o = {}) {
  const col = o.color || RARITY_HEX[o.rarity] || "#7CCB5B";
  ctx.save();
  rr(ctx, x, y, size, size, size * 0.2);
  ctx.fillStyle = lin(ctx, x, y, x, y + size, [[0, shade(col, 0.82)], [1, shade(col, 0.55)]]); ctx.fill();
  ctx.save(); rr(ctx, x, y, size, size, size * 0.2); ctx.clip();
  ctx.fillStyle = rad(ctx, x + size / 2, y + size * 0.55, 2, size * 0.62, [[0, "rgba(255,255,255,0.85)"], [1, "rgba(255,255,255,0)"]]); ctx.fillRect(x, y, size, size);
  ctx.restore();
  rr(ctx, x, y, size, size, size * 0.2); ctx.lineWidth = Math.max(2, size * 0.035); ctx.strokeStyle = col; ctx.stroke();
  ctx.restore();
  drawIcon(ctx, kind, id, x + size / 2, y + size / 2, size * (o.scale || 0.84), { rarityColor: col });
}

export function renderIconPng(kind, id, size = 256) {
  const c = createCanvas(size, size); const ctx = c.getContext("2d");
  drawIcon(ctx, kind, id, size / 2, size / 2, size * 0.9);
  return c.toBuffer("image/png");
}
/** Ảnh sản phẩm có nền (dùng cho thẻ shop). */
export function renderProductPng(kind, id, { rarity = "common", size = 320 } = {}) {
  const c = createCanvas(size, size); const ctx = c.getContext("2d");
  drawIconTile(ctx, kind, id, 6, 6, size - 12, { rarity, scale: 0.82 });
  return c.toBuffer("image/png");
}

const SUBDIR = { seed: "seeds", crop: "crops", land: "lands", tool: "tools", medicine: "medicines" };
/** Tạo (nếu chưa có / lỗi thời) và trả đường dẫn file PNG của icon. Trả "" nếu không tạo được. */
export function iconFile(kind, id, { rarity = "common", size = 320 } = {}) {
  try {
    const dir = path.join(IMG_DIR, SUBDIR[kind] || "icons");
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `${id}.v${ART_VERSION}.png`);
    if (!fs.existsSync(f)) {
      for (const old of fs.readdirSync(dir)) if (old.startsWith(`${id}.`) && old !== path.basename(f)) { try { fs.unlinkSync(path.join(dir, old)); } catch { /* bỏ qua */ } }
      fs.writeFileSync(f, renderProductPng(kind, id, { rarity, size }));
    }
    return f;
  } catch { return ""; }
}
export const ART_VERSION = 1;
export const KNOWN = { crops: Object.keys(CROPS), tools: Object.keys(TOOL_DRAW), medicines: Object.keys(MED), lands: Object.keys(LAND_STYLE) };
