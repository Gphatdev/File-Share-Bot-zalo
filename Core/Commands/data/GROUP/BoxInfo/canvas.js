/**
 * BoxInfo canvas — thẻ thông tin nhóm (neon).
 * renderBoxInfo({ name, groupId, totalMember, avatar, desc, createdTime,
 *                 creator:{uid,name,avatar}, deputies:[{uid,name,avatar}] })
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, registerFont } from "canvas";
import { getConfiguredBotName } from "../../../../../Utils/Branding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(__dirname, "..", "..", "MEDIA", "fonts");
const FONT = "BoxInfoUI";
(function () {
  for (const [f, w] of [
    ["BeVietnamPro_800ExtraBold.ttf", "800"],
    ["BeVietnamPro_700Bold.ttf", "bold"],
    ["BeVietnamPro_600SemiBold.ttf", "600"],
    ["BeVietnamPro_400Regular.ttf", "normal"],
  ]) {
    const p = path.join(fontDir, f);
    if (fs.existsSync(p)) { try { registerFont(p, { family: FONT, weight: w }); } catch {} }
  }
})();

const W = 1000, SCALE = 2;
const C = { cyan: "#22D3EE", violet: "#8B5CFF", gold: "#FBBF24", pink: "#FF4DA6", text: "#F4F8FF", sub: "#8FA3C4", bg: "#050814" };

function rgba(hex, a) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function hex(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    i ? ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}
function neon(ctx, color, width = 2, blur = 16) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.restore();
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, width * 0.6); ctx.stroke(); ctx.restore();
}
function fit(ctx, v, maxW) {
  let s = String(v ?? "");
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}
function txt(ctx, v, x, y, { weight = 400, size = 24, color = C.text, align = "left", maxW, glow = 0 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.fillText(maxW ? fit(ctx, v, maxW) : String(v ?? ""), x, y);
  ctx.restore();
}
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
  const lines = []; let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width <= maxW) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (words.length && lines.length === maxLines) {
    const joined = lines.join(" ");
    if (joined.length < String(text).replace(/\s+/g, " ").trim().length) lines[maxLines - 1] = fit(ctx, lines[maxLines - 1] + "…", maxW);
  }
  return lines;
}
async function loadAv(src) {
  if (!src) return null;
  try {
    if (!/^https?:\/\//i.test(src) && !fs.existsSync(src)) return null;
    return await Promise.race([loadImage(src), new Promise((_, j) => setTimeout(() => j(new Error("timeout")), 6000))]);
  } catch { return null; }
}
function glow(ctx, x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function avatar(ctx, img, name, cx, cy, R, color, shape = "circle") {
  const shp = () => (shape === "hex" ? hex(ctx, cx, cy, R) : (ctx.beginPath(), ctx.arc(cx, cy, R, 0, Math.PI * 2)));
  ctx.save();
  shape === "hex" ? hex(ctx, cx, cy, R + 5) : (ctx.beginPath(), ctx.arc(cx, cy, R + 5, 0, Math.PI * 2));
  neon(ctx, color, 3.5, 20);
  ctx.restore();
  ctx.save(); shp(); ctx.clip();
  if (img) {
    const sc = Math.max((R * 2) / img.width, (R * 2) / img.height);
    ctx.drawImage(img, cx - (img.width * sc) / 2, cy - (img.height * sc) / 2, img.width * sc, img.height * sc);
  } else {
    const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    g.addColorStop(0, rgba(color, 0.6)); g.addColorStop(1, "#0B1220");
    ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = "#fff"; ctx.font = `800 ${Math.round(R * 0.95)}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(name || "?").trim().slice(0, 1).toUpperCase() || "?", cx, cy + 1);
  }
  ctx.restore();
}
function crown(ctx, cx, cy, s, color) {
  const w = s, h = s * 0.72, x = cx - w / 2, y = cy - h / 2;
  ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x, y + h); ctx.lineTo(x, y + h * 0.28); ctx.lineTo(x + w * 0.25, y + h * 0.58); ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.75, y + h * 0.58); ctx.lineTo(x + w, y + h * 0.28); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function shield(ctx, cx, cy, s, color) {
  ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s / 2); ctx.lineTo(cx + s * 0.42, cy - s * 0.3); ctx.lineTo(cx + s * 0.42, cy + s * 0.05);
  ctx.quadraticCurveTo(cx + s * 0.4, cy + s * 0.38, cx, cy + s / 2);
  ctx.quadraticCurveTo(cx - s * 0.4, cy + s * 0.38, cx - s * 0.42, cy + s * 0.05);
  ctx.lineTo(cx - s * 0.42, cy - s * 0.3); ctx.closePath(); ctx.fill(); ctx.restore();
}
function people(ctx, cx, cy, s, color) {
  ctx.save(); ctx.fillStyle = color;
  for (const [dx, k] of [[-s * 0.28, 0.8], [s * 0.28, 0.8], [0, 1]]) {
    ctx.beginPath(); ctx.arc(cx + dx, cy - s * 0.2 * k, s * 0.17 * k, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + dx - s * 0.3 * k, cy + s * 0.42);
    ctx.quadraticCurveTo(cx + dx - s * 0.3 * k, cy + s * 0.02, cx + dx, cy + s * 0.02);
    ctx.quadraticCurveTo(cx + dx + s * 0.3 * k, cy + s * 0.02, cx + dx + s * 0.3 * k, cy + s * 0.42);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function calendar(ctx, cx, cy, s, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = "round";
  rr(ctx, cx - s / 2, cy - s * 0.42, s, s * 0.9, 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - s / 2, cy - s * 0.1); ctx.lineTo(cx + s / 2, cy - s * 0.1);
  ctx.moveTo(cx - s * 0.2, cy - s * 0.55); ctx.lineTo(cx - s * 0.2, cy - s * 0.3);
  ctx.moveTo(cx + s * 0.2, cy - s * 0.55); ctx.lineTo(cx + s * 0.2, cy - s * 0.3); ctx.stroke();
  ctx.restore();
}
function idIcon(ctx, cx, cy, s, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.1, cy - s * 0.5); ctx.lineTo(cx - s * 0.25, cy + s * 0.5);
  ctx.moveTo(cx + s * 0.25, cy - s * 0.5); ctx.lineTo(cx + s * 0.1, cy + s * 0.5);
  ctx.moveTo(cx - s * 0.45, cy - s * 0.15); ctx.lineTo(cx + s * 0.5, cy - s * 0.15);
  ctx.moveTo(cx - s * 0.5, cy + s * 0.18); ctx.lineTo(cx + s * 0.45, cy + s * 0.18);
  ctx.stroke(); ctx.restore();
}

function fmtDate(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "Không rõ";
  try {
    return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(n));
  } catch { return "Không rõ"; }
}
const fmtNum = (n) => Number(n || 0).toLocaleString("vi-VN");

export async function renderBoxInfo(d = {}) {
  const deputies = (d.deputies || []).slice(0, 8);
  const moreDep = (d.deputies || []).length - deputies.length;
  const DEP_ROWS = Math.ceil(deputies.length / 2);

  // đo chiều cao
  const probe = createCanvas(10, 10).getContext("2d");
  probe.font = `400 24px ${FONT}`;
  const descLines = d.desc ? wrap(probe, d.desc, W - 160 - 60, 3) : [];
  const heroH = 470;
  const descH = descLines.length ? 56 + descLines.length * 36 : 0;
  const statsY = heroH + 20;
  let y = statsY + 150 + 20;
  const idY = y; y += 92 + 24;
  const descY = y; y += descH + (descH ? 24 : 0);
  const leaderY = y; y += 130 + 24;
  const depTitleY = y; y += 60;
  const depGridY = y; y += (DEP_ROWS ? DEP_ROWS * 100 : 96) + (moreDep > 0 ? 40 : 0) + 24;
  const H = y + 90;

  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  const [gAv, cAv, ...dAvs] = await Promise.all([loadAv(d.avatar), loadAv(d.creator?.avatar), ...deputies.map((p) => loadAv(p.avatar))]);

  /* nền */
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  glow(ctx, 160, 140, 560, C.cyan, 0.24);
  glow(ctx, W - 80, H - 200, 620, C.violet, 0.22);
  ctx.fillStyle = "rgba(160,190,255,0.045)";
  for (let yy = 18; yy < H; yy += 36) for (let xx = 18; xx < W; xx += 36) { ctx.beginPath(); ctx.arc(xx, yy, 1.3, 0, 7); ctx.fill(); }

  /* hero: avatar nhóm phóng to mờ làm nền */
  ctx.save();
  rr(ctx, 30, 30, W - 60, heroH - 30, 40); ctx.clip();
  if (gAv) {
    const sc = Math.max((W - 60) / gAv.width, (heroH - 30) / gAv.height) * 1.25;
    ctx.globalAlpha = 0.5;
    ctx.filter = "blur(18px)";
    try { ctx.drawImage(gAv, W / 2 - (gAv.width * sc) / 2, heroH / 2 - (gAv.height * sc) / 2, gAv.width * sc, gAv.height * sc); } catch {}
    ctx.filter = "none";
    ctx.globalAlpha = 1;
  } else {
    const g = ctx.createLinearGradient(30, 30, W - 30, heroH);
    g.addColorStop(0, rgba(C.cyan, 0.35)); g.addColorStop(1, rgba(C.violet, 0.4));
    ctx.fillStyle = g; ctx.fillRect(30, 30, W - 60, heroH);
  }
  const ov = ctx.createLinearGradient(0, 30, 0, heroH);
  ov.addColorStop(0, "rgba(5,8,20,0.35)"); ov.addColorStop(1, "rgba(5,8,20,0.95)");
  ctx.fillStyle = ov; ctx.fillRect(30, 30, W - 60, heroH);
  ctx.restore();
  rr(ctx, 30, 30, W - 60, heroH - 30, 40); neon(ctx, rgba(C.cyan, 0.85), 3, 22);

  txt(ctx, "THÔNG TIN NHÓM", W / 2, 84, { weight: 800, size: 20, color: C.cyan, align: "center", glow: 10 });
  avatar(ctx, gAv, d.name, W / 2, 205, 92, C.cyan, "hex");
  ctx.font = `800 52px ${FONT}`;
  const nameLines = wrap(ctx, d.name || "Nhóm không tên", W - 200, 2);
  const size = nameLines.length > 1 ? 40 : 52;
  nameLines.forEach((l, i) => txt(ctx, l, W / 2, 370 + i * (size + 6) - (nameLines.length > 1 ? 14 : 0), { weight: 800, size, align: "center", glow: 16, maxW: W - 160 }));
  txt(ctx, "ZALO GROUP", W / 2, heroH - 28, { weight: 600, size: 17, color: C.sub, align: "center" });

  /* 3 ô thống kê */
  const stats = [
    { label: "THÀNH VIÊN", value: fmtNum(d.totalMember), color: C.cyan, icon: people },
    { label: "PHÓ NHÓM", value: fmtNum((d.deputies || []).length), color: C.violet, icon: shield },
    { label: "NGÀY TẠO", value: fmtDate(d.createdTime), color: C.pink, icon: calendar },
  ];
  const sw = (W - 60 - 40) / 3;
  stats.forEach((s, i) => {
    const x = 30 + i * (sw + 20);
    ctx.save(); rr(ctx, x, statsY, sw, 150, 28); ctx.fillStyle = "rgba(10,16,34,0.92)"; ctx.fill(); ctx.restore();
    rr(ctx, x, statsY, sw, 150, 28); neon(ctx, rgba(s.color, 0.6), 2, 12);
    ctx.save(); ctx.beginPath(); ctx.arc(x + sw / 2, statsY + 42, 26, 0, Math.PI * 2); ctx.fillStyle = rgba(s.color, 0.16); ctx.fill(); ctx.restore();
    s.icon(ctx, x + sw / 2, statsY + 42, 28, s.color);
    txt(ctx, s.value, x + sw / 2, statsY + 106, { weight: 800, size: i === 2 ? 30 : 40, color: s.color, align: "center", glow: 14, maxW: sw - 20 });
    txt(ctx, s.label, x + sw / 2, statsY + 134, { weight: 700, size: 15, color: C.sub, align: "center" });
  });

  /* ID nhóm */
  ctx.save(); rr(ctx, 30, idY, W - 60, 92, 28); ctx.fillStyle = "rgba(10,16,34,0.92)"; ctx.fill(); ctx.restore();
  rr(ctx, 30, idY, W - 60, 92, 28); neon(ctx, rgba(C.cyan, 0.5), 2, 10);
  ctx.save(); ctx.beginPath(); ctx.arc(86, idY + 46, 26, 0, Math.PI * 2); ctx.fillStyle = rgba(C.cyan, 0.16); ctx.fill(); ctx.restore();
  idIcon(ctx, 86, idY + 46, 26, C.cyan);
  txt(ctx, "ID NHÓM", 136, idY + 38, { weight: 700, size: 16, color: C.sub });
  txt(ctx, d.groupId || "—", 136, idY + 72, { weight: 800, size: 30, maxW: W - 220 });

  /* mô tả */
  if (descLines.length) {
    ctx.save(); rr(ctx, 30, descY, W - 60, descH, 28); ctx.fillStyle = "rgba(10,16,34,0.85)"; ctx.fill(); ctx.restore();
    rr(ctx, 30, descY, W - 60, descH, 28); neon(ctx, rgba(C.violet, 0.45), 2, 10);
    txt(ctx, "MÔ TẢ NHÓM", 66, descY + 40, { weight: 700, size: 16, color: C.violet });
    descLines.forEach((l, i) => txt(ctx, l, 66, descY + 82 + i * 36, { size: 24, color: "#D6E2F5", maxW: W - 132 }));
  }

  /* trưởng nhóm */
  ctx.save(); rr(ctx, 30, leaderY, W - 60, 130, 32);
  const lg = ctx.createLinearGradient(30, 0, W - 30, 0);
  lg.addColorStop(0, rgba(C.gold, 0.2)); lg.addColorStop(0.6, "rgba(10,16,34,0.94)"); lg.addColorStop(1, "rgba(10,16,34,0.94)");
  ctx.fillStyle = lg; ctx.fill(); ctx.restore();
  rr(ctx, 30, leaderY, W - 60, 130, 32); neon(ctx, rgba(C.gold, 0.7), 2.5, 16);
  avatar(ctx, cAv, d.creator?.name, 112, leaderY + 65, 44, C.gold);
  txt(ctx, d.creator?.name || "Không rõ", 184, leaderY + 66, { weight: 800, size: 32, maxW: W - 184 - 260 });
  txt(ctx, `UID: ${d.creator?.uid || "—"}`, 184, leaderY + 100, { size: 17, color: C.sub, maxW: W - 184 - 260 });
  // nhãn
  ctx.save(); ctx.font = `800 17px ${FONT}`;
  const bw = ctx.measureText("TRƯỞNG NHÓM").width + 74;
  rr(ctx, W - 60 - bw, leaderY + 44, bw, 42, 21); ctx.fillStyle = rgba(C.gold, 0.15); ctx.fill(); ctx.restore();
  ctx.save(); rr(ctx, W - 60 - bw, leaderY + 44, bw, 42, 21); neon(ctx, C.gold, 1.8, 10); ctx.restore();
  crown(ctx, W - 60 - bw + 30, leaderY + 65, 26, C.gold);
  txt(ctx, "TRƯỞNG NHÓM", W - 60 - bw + 52, leaderY + 71, { weight: 800, size: 17, color: C.gold });

  /* phó nhóm */
  txt(ctx, "PHÓ NHÓM", 40, depTitleY + 30, { weight: 800, size: 24, color: C.violet, glow: 8 });
  const gl = ctx.createLinearGradient(190, 0, W - 40, 0);
  gl.addColorStop(0, rgba(C.violet, 0.7)); gl.addColorStop(1, rgba(C.violet, 0));
  ctx.fillStyle = gl; ctx.fillRect(190, depTitleY + 24, W - 230, 2);

  if (!deputies.length) {
    ctx.save(); rr(ctx, 30, depGridY, W - 60, 84, 28); ctx.fillStyle = "rgba(10,16,34,0.8)"; ctx.fill(); ctx.restore();
    rr(ctx, 30, depGridY, W - 60, 84, 28); neon(ctx, rgba(C.violet, 0.3), 1.5, 6);
    txt(ctx, "Nhóm chưa có phó nhóm", W / 2, depGridY + 52, { weight: 600, size: 24, color: C.sub, align: "center" });
  } else {
    const cw = (W - 60 - 20) / 2;
    deputies.forEach((p, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 30 + col * (cw + 20), yy = depGridY + row * 100;
      ctx.save(); rr(ctx, x, yy, cw, 84, 26); ctx.fillStyle = "rgba(10,16,34,0.92)"; ctx.fill(); ctx.restore();
      rr(ctx, x, yy, cw, 84, 26); neon(ctx, rgba(C.violet, 0.55), 2, 10);
      avatar(ctx, dAvs[i], p.name, x + 54, yy + 42, 28, C.violet);
      txt(ctx, p.name || "Không rõ", x + 102, yy + 40, { weight: 700, size: 24, maxW: cw - 120 });
      txt(ctx, "Phó nhóm", x + 102, yy + 66, { size: 15, color: C.violet });
    });
    if (moreDep > 0) txt(ctx, `… và ${moreDep} phó nhóm khác`, W / 2, depGridY + DEP_ROWS * 100 + 14, { weight: 600, size: 18, color: C.sub, align: "center" });
  }

  txt(ctx, `${getConfiguredBotName()}  •  WORK TOGETHER  •  GROW TOGETHER`, W / 2, H - 40, { weight: 700, size: 15, color: C.cyan, align: "center" });

  /* khung ngoài */
  rr(ctx, 14, 14, W - 28, H - 28, 44); neon(ctx, rgba(C.cyan, 0.55), 2, 18);
  return canvas.toBuffer("image/png");
}
