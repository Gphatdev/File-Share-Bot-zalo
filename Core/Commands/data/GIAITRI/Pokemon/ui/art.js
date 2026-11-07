/**
 * Vẽ asset tự tạo của project (trứng, bản đồ nền, hiệu ứng) — dùng cho tools/gen_art.mjs và làm fallback.
 * Đây là ART CỦA PROJECT (không phải art chính thức): trứng Gen 2+ có hình riêng trong game; ở đây là thiết kế neon riêng.
 */
import { createCanvas } from "canvas";
import { C, hexA, rng, rr } from "./kit.js";
import { EGG_TIERS } from "../eggs.js";

/** Trứng neon với hoa văn theo tier. crack: 0..1 mức nứt */
export function drawEggArt(ctx, cx, cy, w, h, tier, crack = 0) {
  const t = EGG_TIERS[tier];
  ctx.save();
  ctx.translate(cx, cy);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.bezierCurveTo(w * 0.62, -h * 0.45, w * 0.6, h * 0.5, 0, h / 2);
    ctx.bezierCurveTo(-w * 0.6, h * 0.5, -w * 0.62, -h * 0.45, 0, -h / 2);
    ctx.closePath();
  };
  ctx.shadowColor = t.color; ctx.shadowBlur = 24;
  path();
  const g = ctx.createRadialGradient(-w * 0.15, -h * 0.2, 4, 0, 0, h * 0.62);
  g.addColorStop(0, "#ffffff"); g.addColorStop(0.45, "#fdf6e3"); g.addColorStop(1, hexA(t.accent, 0.95));
  ctx.fillStyle = g; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.save(); path(); ctx.clip();
  const r = rng(tier.length * 97);
  if (tier === "common") {
    for (let i = 0; i < 14; i++) { ctx.fillStyle = hexA(t.color, 0.55); ctx.beginPath(); ctx.arc((r() - 0.5) * w * 0.9, (r() - 0.35) * h * 0.9 + h * 0.1, 5 + r() * 9, 0, Math.PI * 2); ctx.fill(); }
  } else if (tier === "uncommon") {
    ctx.strokeStyle = hexA(t.color, 0.7); ctx.lineWidth = 6; ctx.lineJoin = "round";
    for (let k = 0; k < 3; k++) { ctx.beginPath(); const y0 = -h * 0.12 + k * h * 0.2; ctx.moveTo(-w * 0.6, y0); for (let i = 0; i < 8; i++) ctx.lineTo(-w * 0.6 + (i + 1) * (w * 1.2) / 8, y0 + (i % 2 ? 14 : -14)); ctx.stroke(); }
  } else {
    for (let i = 0; i < 9; i++) {
      const x = (r() - 0.5) * w * 0.9, y = (r() - 0.3) * h * 0.9, s = 8 + r() * 10;
      ctx.fillStyle = hexA(t.color, 0.85); ctx.beginPath();
      for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + (j * Math.PI) / 5; const rad = j % 2 ? s * 0.45 : s; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
      ctx.closePath(); ctx.fill();
    }
  }
  const hl = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  hl.addColorStop(0, "rgba(255,255,255,0.55)"); hl.addColorStop(0.3, "rgba(255,255,255,0)");
  ctx.fillStyle = hl; ctx.fillRect(-w, -h, w * 2, h * 2);
  ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = hexA(t.color, 0.9); path(); ctx.stroke();
  if (crack > 0) {
    ctx.strokeStyle = "#1e1b4b"; ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-w * 0.35, -h * 0.05);
    const pts = [[-0.2, -0.18], [-0.08, -0.02], [0.04, -0.2], [0.16, -0.04], [0.3, -0.16], [0.38, 0]];
    for (const [px, py] of pts.slice(0, Math.max(2, Math.round(pts.length * crack)))) ctx.lineTo(w * px, h * py);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawRays(ctx, cx, cy, radius, color, n = 24, seed = 5) {
  const r = rng(seed);
  ctx.save(); ctx.translate(cx, cy);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.1;
    const len = radius * (0.55 + r() * 0.45), wd = 0.05 + r() * 0.05;
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    g.addColorStop(0, hexA(color, 0.55)); g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - wd) * len, Math.sin(a - wd) * len); ctx.lineTo(Math.cos(a + wd) * len, Math.sin(a + wd) * len); ctx.closePath(); ctx.fill();
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.5);
  g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(0.4, hexA(color, 0.35)); g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, radius * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Silhouette (tô 1 màu) của ảnh — dùng cho hiệu ứng tiến hóa */
export function silhouette(createCanvas, img, color = "#ffffff") {
  const c = createCanvas(img.width, img.height); const x = c.getContext("2d");
  x.drawImage(img, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Nền bản đồ Kanto (1000x640 logic) — địa hình vẽ theo toạ độ world.js */
export function paintMapBase(ctx0, nodes, edges) {
  let ctx = ctx0;
  const W = 1000, H = 640;
  const r = rng(2024);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  // biển
  const sea = ctx.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, "#07204a"); sea.addColorStop(1, "#0a3a6b");
  ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(125,211,252,0.08)"; ctx.lineWidth = 1.5;
  for (let i = 0; i < 160; i++) {
    const x = r() * W, y = r() * H; ctx.beginPath(); ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 8, y - 5, x + 16, y + 5, x + 24, y); ctx.stroke();
  }
  const SEA = new Set(["sea"]);
  const landNodes = nodes.filter((n) => !SEA.has(n.kind) && n.id !== "seafoam");
  const isLandEdge = (a, b) => !SEA.has(byId[a].kind) && !SEA.has(byId[b].kind) && a !== "seafoam" && b !== "seafoam";
  // lớp đất (vẽ 2 lần: viền sáng rồi thân)
  const landPass = (color, grow) => {
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = "round";
    for (const n of landNodes) { ctx.beginPath(); ctx.arc(n.x, n.y, (n.kind === "town" ? 46 : 38) + grow, 0, Math.PI * 2); ctx.fill(); }
    ctx.lineWidth = 64 + grow * 2;
    for (const [a, b] of edges) {
      if (!isLandEdge(a, b)) continue;
      ctx.beginPath(); ctx.moveTo(byId[a].x, byId[a].y); ctx.lineTo(byId[b].x, byId[b].y); ctx.stroke();
    }
    // mảng đất phụ cho đỡ trống
    for (const [x, y, rad] of [[330, 230, 70], [420, 390, 60], [560, 330, 70], [640, 250, 60], [250, 220, 55], [380, 420, 55], [120, 420, 60], [600, 480, 50], [430, 225, 75], [560, 225, 62], [425, 495, 62], [625, 370, 58], [330, 375, 48], [470, 335, 42], [380, 150, 40]]) { ctx.beginPath(); ctx.arc(x, y, rad + grow, 0, Math.PI * 2); ctx.fill(); }
    for (const id of ["cinnabar", "seafoam", "mansion"]) { const n = byId[id]; ctx.beginPath(); ctx.arc(n.x, n.y, (id === "seafoam" ? 34 : 44) + grow, 0, Math.PI * 2); ctx.fill(); }
  };
  // lớp đất vẽ riêng để thêm sắc thái bằng source-atop
  const sx = ctx.canvas.width / W;
  const land = createCanvas(ctx.canvas.width, ctx.canvas.height);
  const lctx = land.getContext("2d"); lctx.scale(sx, sx);
  const mainCtx = ctx;
  ctx = lctx;
  landPass("#1f7a4d", 0);
  ctx.save(); ctx.globalCompositeOperation = "source-atop";
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = r() * H, rad = 20 + r() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const light = r() < 0.5; g.addColorStop(0, light ? "rgba(134,239,172,0.22)" : "rgba(6,78,59,0.3)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx = mainCtx;
  // hào quang bờ biển rồi đặt đất lên
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowColor = "#5eead4"; ctx.shadowBlur = 26; ctx.drawImage(land, 0, 0); ctx.shadowBlur = 0; ctx.drawImage(land, 0, 0);
  ctx.restore();
  // họa tiết cỏ
  for (let i = 0; i < 700; i++) {
    const x = r() * W, y = r() * H;
    const d = landNodes.some((n) => Math.hypot(n.x - x, n.y - y) < 50);
    if (!d) continue;
    ctx.fillStyle = `rgba(134,239,172,${0.1 + r() * 0.16})`; ctx.fillRect(x, y, 2, 4);
  }
  // hồ
  for (const [x, y, rx, ry] of [[470, 78, 36, 20], [620, 355, 30, 18], [740, 340, 22, 28], [300, 395, 26, 16]]) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0.3, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(x, y, 2, x, y, rx); g.addColorStop(0, "#38bdf8"); g.addColorStop(1, "#0369a1"); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "rgba(186,230,253,0.6)"; ctx.lineWidth = 2; ctx.stroke();
  }
  // núi
  const mountain = (x, y, s) => {
    ctx.fillStyle = "#64748b"; ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.7); ctx.lineTo(x, y - s * 0.7); ctx.lineTo(x + s, y + s * 0.7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.moveTo(x - s * 0.28, y - s * 0.25); ctx.lineTo(x, y - s * 0.7); ctx.lineTo(x + s * 0.28, y - s * 0.25); ctx.lineTo(x + s * 0.1, y - s * 0.12); ctx.lineTo(x - s * 0.05, y - s * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(15,23,42,0.35)"; ctx.beginPath(); ctx.moveTo(x, y - s * 0.7); ctx.lineTo(x + s, y + s * 0.7); ctx.lineTo(x + s * 0.1, y + s * 0.7); ctx.closePath(); ctx.fill();
  };
  for (const id of ["mtmoon", "rocktunnel", "victoryroad", "ceruleancave", "powerplant"]) {
    const n = byId[id]; for (let k = 0; k < 4; k++) mountain(n.x + (r() - 0.5) * 70, n.y - 14 + (r() - 0.5) * 36, 13 + r() * 9);
  }
  // rừng
  const tree = (x, y, s) => { ctx.fillStyle = "#14532d"; ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#22c55e"; ctx.beginPath(); ctx.arc(x - s * 0.25, y - s * 0.25, s * 0.55, 0, Math.PI * 2); ctx.fill(); };
  for (const id of ["vforest", "safari", "r2", "r17"]) {
    const n = byId[id]; for (let k = 0; k < 14; k++) tree(n.x + (r() - 0.5) * 80, n.y + (r() - 0.5) * 60, 5 + r() * 5);
  }
  // sa mạc nhẹ quanh Route 17/vermilion không cần. Vignette biển
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(2,6,23,0.55)"); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}
