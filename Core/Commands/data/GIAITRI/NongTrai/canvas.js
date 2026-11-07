/**
 * canvas.js — giao diện Canvas của Nông Trại (v2): toàn bộ hình ảnh vẽ bằng vector (art.js), không dùng emoji.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, registerFont } from "canvas";
import { TEMP_DIR, ensureDataFiles } from "./storage.js";
import { drawIcon, drawIconTile, drawPlantStage, RARITY_HEX, shade } from "./art.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(__dirname, "..", "..", "MEDIA", "fonts");
const FONT = "FarmFont";

(function registerFonts() {
  if (!fs.existsSync(fontDir)) return;
  for (const [file, weight] of [
    ["BeVietnamPro_800ExtraBold.ttf", "800"],
    ["BeVietnamPro_700Bold.ttf", "bold"],
    ["BeVietnamPro_600SemiBold.ttf", "600"],
    ["BeVietnamPro_400Regular.ttf", "normal"],
  ]) {
    const p = path.join(fontDir, file);
    if (fs.existsSync(p)) {
      try { registerFont(p, { family: FONT, weight }); } catch { /* bỏ qua */ }
    }
  }
})();

const C = {
  green: "#8BCF65",
  greenDark: "#1F5E32",
  yellow: "#FFD166",
  orange: "#F08A24",
  cream: "#FFF6DC",
  brown: "#7A4A24",
  white: "#FFFFFF",
  red: "#E5484D",
  text: "#23361F",
  muted: "#5B7355",
  card: "rgba(255,252,240,0.96)",
  shadow: "rgba(25,70,35,0.28)",
};
const RARITY_VN = { common: "THƯỜNG", uncommon: "KHÔNG PHỔ BIẾN", rare: "HIẾM", epic: "SỬ THI", legendary: "HUYỀN THOẠI", mythic: "TỐI THƯỢNG" };
const rc = (r) => RARITY_HEX[r] || RARITY_HEX.common;

function roundRect(ctx, x, y, w, h, r) {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + R, y); ctx.arcTo(x + w, y, x + w, y + h, R); ctx.arcTo(x + w, y + h, x, y + h, R); ctx.arcTo(x, y + h, x, y, R); ctx.arcTo(x, y, x + w, y, R); ctx.closePath();
}
function fitText(ctx, text, maxW) {
  let t = String(text || "");
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
const money = (n) => Number(n || 0).toLocaleString("vi-VN");
function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}p ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}p`;
}
async function safeLoadImage(p) {
  if (!p || !fs.existsSync(p)) return null;
  try { return await loadImage(p); } catch { return null; }
}

/** Nền: bầu trời, mây, đồi cỏ và luống rau mờ phía dưới. */
function drawBg(ctx, W, H) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#BFE6FA"); sky.addColorStop(0.18, "#DDF3E0"); sky.addColorStop(0.3, "#A8DC82"); sky.addColorStop(1, "#4E9D45");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (const [x, y, s] of [[W * 0.12, 34, 1], [W * 0.78, 26, 1.2], [W * 0.5, 52, 0.7]]) {
    ctx.beginPath(); ctx.arc(x, y, 16 * s, 0, 7); ctx.arc(x + 18 * s, y + 4 * s, 13 * s, 0, 7); ctx.arc(x - 18 * s, y + 5 * s, 11 * s, 0, 7); ctx.arc(x + 4 * s, y - 9 * s, 12 * s, 0, 7); ctx.fill();
  }
  // đồi
  ctx.fillStyle = "rgba(60,140,60,0.35)";
  ctx.beginPath(); ctx.moveTo(0, 130); ctx.quadraticCurveTo(W * 0.25, 90, W * 0.5, 125); ctx.quadraticCurveTo(W * 0.78, 160, W, 112); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  // họa tiết luống
  ctx.strokeStyle = "rgba(20,80,30,0.10)"; ctx.lineWidth = 6;
  for (let y = 190; y < H; y += 46) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 10); ctx.stroke(); }
}

function drawCard(ctx, x, y, w, h, o = {}) {
  ctx.save();
  ctx.shadowColor = C.shadow; ctx.shadowBlur = o.shadow ?? 14; ctx.shadowOffsetY = 5;
  roundRect(ctx, x, y, w, h, o.radius ?? 18);
  ctx.fillStyle = o.bg || C.card; ctx.fill();
  ctx.shadowColor = "transparent";
  if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = o.borderWidth || 2.5; roundRect(ctx, x, y, w, h, o.radius ?? 18); ctx.stroke(); }
  ctx.restore();
}

/** Bảng gỗ tiêu đề + 2 icon trang trí. */
function drawHeader(ctx, W, title, subtitle, icon) {
  ctx.save();
  ctx.shadowColor = "rgba(40,20,5,0.4)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
  roundRect(ctx, 16, 12, W - 32, 74, 20);
  const g = ctx.createLinearGradient(0, 12, 0, 86); g.addColorStop(0, "#B97C43"); g.addColorStop(1, "#7A4A24");
  ctx.fillStyle = g; ctx.fill(); ctx.restore();
  roundRect(ctx, 22, 18, W - 44, 62, 15); ctx.strokeStyle = "rgba(255,230,170,0.55)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  for (const x of [34, W - 34]) for (const y of [28, 70]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `800 27px ${FONT}`; ctx.fillStyle = "#FFF3CF"; ctx.shadowColor = "rgba(40,15,0,0.55)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.fillText(title, W / 2, subtitle ? 38 : 49);
  ctx.shadowColor = "transparent";
  if (subtitle) { ctx.font = `600 13px ${FONT}`; ctx.fillStyle = "#FFE3A8"; ctx.fillText(subtitle, W / 2, 63); }
  if (icon) { drawIcon(ctx, icon[0], icon[1], 64, 49, 58); drawIcon(ctx, icon[0], icon[1], W - 64, 49, 58); }
}

function drawProgressBar(ctx, x, y, w, h, progress, color = C.green) {
  roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = "rgba(30,80,40,0.18)"; ctx.fill();
  const pw = Math.max(0, Math.min(1, progress)) * w;
  if (pw > 1) {
    ctx.save(); roundRect(ctx, x, y, Math.max(pw, h), h, h / 2);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, shade(color, 0.3)); g.addColorStop(1, color);
    ctx.fillStyle = g; ctx.fill(); ctx.restore();
  }
}

function numBadge(ctx, n, x, y, color = C.greenDark) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, 19, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.stroke();
  ctx.font = `800 18px ${FONT}`; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(n), x, y + 1);
  ctx.restore();
}
function chip(ctx, text, x, y, color, h = 22) {
  ctx.save(); ctx.font = `bold 11px ${FONT}`;
  const w = ctx.measureText(text).width + 18;
  roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = shade(color, 0.85); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = shade(color, -0.35); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, x + 9, y + h / 2 + 0.5);
  ctx.restore();
  return w;
}
function footer(ctx, W, H, text) {
  ctx.save(); ctx.font = `600 12px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,50,10,0.6)"; ctx.shadowBlur = 4; ctx.fillText(text, W / 2, H - 16); ctx.restore();
}
function newCanvas(W, H) { ensureDataFiles(); const canvas = createCanvas(W, H); const ctx = canvas.getContext("2d"); drawBg(ctx, W, H); return { canvas, ctx }; }
const png = (c) => c.toBuffer("image/png");

export function saveBufferToTempImage(buffer, prefix = "farm") {
  ensureDataFiles();
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const p = path.join(TEMP_DIR, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}.png`);
  fs.writeFileSync(p, buffer);
  return p;
}

/** 1. Tổng quan — .nongtrai */
export async function renderOverview(data) {
  const W = 920; const tools = data.tools || [];
  const H = 860;
  const { canvas, ctx } = newCanvas(W, H);
  drawHeader(ctx, W, "NÔNG TRẠI CỦA BẠN", data.title?.name || "Nông Dân Tập Sự", ["crop", "crop_lua"]);

  // thẻ người chơi
  drawCard(ctx, 24, 104, 300, 176);
  const avSize = 70, avX = 44, avY = 122;
  ctx.save(); ctx.beginPath(); ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, 7); ctx.closePath(); ctx.clip();
  const av = await safeLoadImage(data.avatarPath);
  if (av) ctx.drawImage(av, avX, avY, avSize, avSize);
  else {
    ctx.fillStyle = C.green; ctx.fillRect(avX, avY, avSize, avSize);
    ctx.font = `bold 30px ${FONT}`; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(data.displayName || "?").slice(0, 1).toUpperCase(), avX + avSize / 2, avY + avSize / 2);
  }
  ctx.restore();
  ctx.strokeStyle = "#B97C43"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2 + 1, 0, 7); ctx.stroke();
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.font = `bold 18px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(fitText(ctx, data.displayName || "Người chơi", 170), avX + avSize + 14, avY + 18);
  ctx.font = `600 13px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(`Cấp nông nghiệp ${data.user.farmLevel}`, avX + avSize + 14, avY + 42);
  const expNeed = data.expRequired || 0; const expPct = expNeed > 0 ? data.user.farmExp / expNeed : 1;
  drawProgressBar(ctx, avX + avSize + 14, avY + 56, 150, 11, expPct, C.orange);
  ctx.font = `12px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(`EXP ${data.user.farmExp}/${expNeed || "MAX"}`, avX + avSize + 14, avY + 80);
  ctx.font = `bold 15px ${FONT}`; ctx.fillStyle = C.greenDark; ctx.fillText(`Số dư: ${money(data.balance)} xu`, 44, 232);
  ctx.font = `600 13px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(`Nông sản trong kho: ~${money(data.cropValue)} xu`, 44, 256);

  // lưới thống kê
  const stats = [
    { icon: ["land", "land_basic"], label: "Tổng đất", value: `${data.totalPlots} ô` },
    { icon: ["seed", "seed_lua"], label: "Đã trồng", value: `${data.usedPlots} ô` },
    { icon: ["land", "land_fertile"], label: "Còn trống", value: `${data.emptySlots} ô` },
    { icon: ["tool", "tool_bucket_tin"], label: "Đang lớn", value: `${data.growingCount}` },
    { icon: ["crop", "crop_dua_hau"], label: "Sẵn sàng thu", value: `${data.readyCount}` },
    { icon: ["crop", "crop_nho"], label: "Tổng thu hoạch", value: `${data.user.totalHarvests}` },
  ];
  const cardW = 178, cardH = 82, startX = 340, startY = 104;
  for (let i = 0; i < stats.length; i++) {
    const x = startX + (i % 3) * (cardW + 10); const y = startY + Math.floor(i / 3) * (cardH + 12);
    drawCard(ctx, x, y, cardW, cardH, { radius: 16 });
    drawIcon(ctx, stats[i].icon[0], stats[i].icon[1], x + 36, y + cardH / 2, 58);
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = `600 12px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(stats[i].label, x + 72, y + 28);
    ctx.font = `800 21px ${FONT}`; ctx.fillStyle = C.greenDark; ctx.fillText(String(stats[i].value), x + 72, y + 54);
  }

  // đất sở hữu
  drawCard(ctx, 24, 300, W - 48, 150);
  ctx.textAlign = "left"; ctx.font = `800 16px ${FONT}`; ctx.fillStyle = C.greenDark; ctx.fillText("ĐẤT SỞ HỮU", 44, 326);
  const lands = data.lands || [];
  if (!lands.length) {
    ctx.font = `14px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText("Chưa có đất — dùng .nongtrai muadat để mua mảnh đất đầu tiên", 44, 380);
  } else {
    let lx = 44;
    for (const l of lands.slice(0, 6)) {
      drawCard(ctx, lx, 340, 130, 98, { radius: 14, bg: "rgba(139,207,101,0.2)", border: l.def?.color || C.green, borderWidth: 2, shadow: 4 });
      drawIcon(ctx, "land", l.landId, lx + 65, 372, 66);
      ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = C.text; ctx.textAlign = "center"; ctx.fillText(fitText(ctx, l.def?.name || l.landId, 116), lx + 65, 418);
      ctx.font = `11px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(`${l.def?.plots || l.plots} ô`, lx + 65, 432);
      lx += 138;
    }
  }

  // dụng cụ
  drawCard(ctx, 24, 466, W - 48, 150);
  ctx.textAlign = "left"; ctx.font = `800 16px ${FONT}`; ctx.fillStyle = C.greenDark; ctx.fillText("DỤNG CỤ ĐANG CÓ", 44, 492);
  if (!tools.length) {
    ctx.font = `14px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText("Chưa có dụng cụ — mua tại .shop → Vật phẩm → Nông Trại (cuốc, xô nước, máy tưới)", 44, 548);
  } else {
    let tx = 44;
    for (const t of tools.slice(0, 7)) {
      drawIconTile(ctx, "tool", t.id, tx, 506, 88, { rarity: t.rarity });
      ctx.font = `600 11px ${FONT}`; ctx.fillStyle = C.text; ctx.textAlign = "center"; ctx.fillText(fitText(ctx, t.name, 118), tx + 44, 604);
      tx += 122;
    }
  }

  // hướng dẫn
  drawCard(ctx, 24, 632, W - 48, 200);
  ctx.textAlign = "left"; ctx.font = `800 16px ${FONT}`; ctx.fillStyle = C.greenDark; ctx.fillText("LỆNH NÔNG TRẠI", 44, 658);
  const helps = [
    [".nongtrai trong", "Trồng cây từ hạt giống trong kho"], [".nongtrai thuhoach", "Thu hoạch cây đã chín"],
    [".nongtrai muadat", "Mua đất trồng"], [".nongtrai sell", "Bán nông sản ở chợ"],
    [".nongtrai thuoc", "Dùng thuốc trồng trọt"], [".nongtrai dungcu", "Xem dụng cụ & hiệu ứng"],
    [".nongtrai vuon", "Xem chi tiết từng ô đất"], [".shop", "Mua hạt giống, dụng cụ, thuốc"],
  ];
  helps.forEach(([cmd, desc], i) => {
    const col = i % 2, row = Math.floor(i / 2); const x = 44 + col * 430; const y = 690 + row * 34;
    ctx.font = `bold 13px ${FONT}`; ctx.fillStyle = C.orange; ctx.fillText(cmd, x, y);
    ctx.font = `13px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(desc, x + 160, y);
  });
  return png(canvas);
}

/** 2. Chọn hạt giống để trồng */
export async function renderSeedList(seeds, emptySlots, farmLevel) {
  const rows = Math.max(1, seeds.length);
  const W = 900, H = Math.min(1200, 110 + rows * 114 + 50);
  const { canvas, ctx } = newCanvas(W, H);
  drawHeader(ctx, W, "CHỌN HẠT GIỐNG ĐỂ TRỒNG", `Ô trống: ${emptySlots}  •  Cấp nông nghiệp: ${farmLevel}`, ["seed", "seed_ca_chua"]);
  if (!seeds.length) {
    drawCard(ctx, 40, 120, W - 80, 100);
    ctx.font = `16px ${FONT}`; ctx.fillStyle = C.muted; ctx.textAlign = "center"; ctx.fillText("Kho không có hạt giống. Mua tại .shop → Vật phẩm → Nông Trại", W / 2, 170);
    return png(canvas);
  }
  let y = 104;
  seeds.forEach((s, i) => {
    drawCard(ctx, 24, y, W - 48, 104, { border: rc(s.rarity), borderWidth: 2.5 });
    numBadge(ctx, i + 1, 56, y + 52);
    drawIconTile(ctx, "seed", s.id, 86, y + 8, 88, { rarity: s.rarity });
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = `800 19px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(s.name, 190, y + 28);
    chip(ctx, RARITY_VN[s.rarity] || "THƯỜNG", 190, y + 42, rc(s.rarity));
    ctx.font = `13px ${FONT}`; ctx.fillStyle = C.muted;
    ctx.fillText(`Sinh trưởng ${fmtTime(s.growTimeMs)}  •  Thu ${s.yieldMin}-${s.yieldMax} quả  •  Giá bán ~${money(s.baseSellPrice)}/quả`, 190, y + 84);
    ctx.font = `800 15px ${FONT}`; ctx.fillStyle = C.greenDark; ctx.textAlign = "right"; ctx.fillText(`Có ${s.quantity}`, W - 48, y + 38);
    ctx.font = `600 12px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(`Trồng tối đa: ${Math.min(s.quantity, emptySlots)}`, W - 48, y + 62);
    y += 114;
  });
  footer(ctx, W, H, "Reply số thứ tự hạt giống để trồng");
  return png(canvas);
}

/** 3. Cửa hàng đất */
export async function renderLandShop(lands, farmLevel, balance) {
  const W = 900, H = 112 + lands.length * 138 + 40;
  const { canvas, ctx } = newCanvas(W, H);
  drawHeader(ctx, W, "CỬA HÀNG ĐẤT TRỒNG", `Số dư: ${money(balance)} xu  •  Cấp: ${farmLevel}`, ["land", "land_fertile"]);
  let y = 104;
  lands.forEach((l, i) => {
    const locked = farmLevel < l.unlockLevel;
    drawCard(ctx, 24, y, W - 48, 126, { bg: locked ? "rgba(226,228,220,0.94)" : C.card, border: l.color || C.brown, borderWidth: 2.5 });
    numBadge(ctx, i + 1, 56, y + 63, l.color || C.brown);
    ctx.save(); if (locked) ctx.globalAlpha = 0.55;
    drawIconTile(ctx, "land", l.id, 86, y + 10, 106, { color: l.color });
    ctx.restore();
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = `800 19px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(l.name, 210, y + 28);
    ctx.font = `13px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(fitText(ctx, l.description, 470), 210, y + 52);
    ctx.font = `600 12px ${FONT}`; ctx.fillStyle = C.greenDark; ctx.fillText(fitText(ctx, `${l.plots} ô  •  ${(l.privileges || []).join("  •  ")}`, 480), 210, y + 76);
    if (locked) chip(ctx, `CẦN CẤP ${l.unlockLevel}`, 210, y + 92, C.red); else chip(ctx, `YÊU CẦU CẤP ${l.unlockLevel}`, 210, y + 92, "#3B82F6");
    ctx.font = `800 21px ${FONT}`; ctx.fillStyle = locked ? "#8A8F85" : C.orange; ctx.textAlign = "right"; ctx.fillText(`${money(l.price)} xu`, W - 48, y + 63);
    y += 138;
  });
  footer(ctx, W, H, "Reply số thứ tự đất để mua");
  return png(canvas);
}

/** 4. Khu vườn */
export async function renderGarden(plots, mode = "view") {
  const W = 920; const rows = Math.ceil(Math.max(1, plots.length) / 2);
  const H = Math.min(1500, 112 + rows * 132 + 44);
  const { canvas, ctx } = newCanvas(W, H);
  drawHeader(ctx, W, mode === "harvest" ? "THU HOẠCH NÔNG SẢN" : "KHU VƯỜN CỦA BẠN", `${plots.length} ô đang theo dõi`, ["land", "land_basic"]);
  if (!plots.length) {
    drawCard(ctx, 40, 120, W - 80, 90);
    ctx.font = `16px ${FONT}`; ctx.fillStyle = C.muted; ctx.textAlign = "center"; ctx.fillText("Chưa có cây nào. Dùng .nongtrai trong để trồng.", W / 2, 165);
    return png(canvas);
  }
  const cardW = (W - 60) / 2;
  plots.forEach((p, i) => {
    const x = 24 + (i % 2) * (cardW + 12); const y = 104 + Math.floor(i / 2) * 132;
    const ready = p.status === "ready";
    drawCard(ctx, x, y, cardW, 120, { radius: 16, border: ready ? C.yellow : C.green, borderWidth: ready ? 3.5 : 2, bg: ready ? "rgba(255,246,200,0.98)" : C.card });
    drawPlantStage(ctx, p.status, p.progress, p.seed?.id || p.seedId, x + 56, y + 58, 84);
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = `800 16px ${FONT}`; ctx.fillStyle = C.greenDark; ctx.fillText(fitText(ctx, `#${i + 1}  ${p.seed?.name?.replace("Hạt ", "") || p.seedId}`, cardW - 120), x + 112, y + 26);
    const label = { seeded: "Mới gieo hạt", growing: "Đang phát triển", almost: "Sắp trưởng thành", ready: "Có thể thu hoạch!" }[p.status] || p.status;
    ctx.font = `600 12px ${FONT}`; ctx.fillStyle = ready ? "#B7790A" : C.muted; ctx.fillText(label, x + 112, y + 50);
    drawProgressBar(ctx, x + 112, y + 66, cardW - 132, 13, p.progress || 0, ready ? C.yellow : C.green);
    ctx.font = `12px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(ready ? "Sẵn sàng!" : `${p.progressPercent || 0}%  •  còn ${fmtTime(p.remainingMs || 0)}`, x + 112, y + 96);
    if ((p.effects || []).length) { let ex = x + cardW - 20; for (const e of p.effects.slice(0, 3)) { ctx.beginPath(); ctx.arc(ex, y + 20, 7, 0, 7); ctx.fillStyle = e.type === "x2money" ? "#F5C21B" : e.type === "growth" ? "#58D86B" : "#B46BFF"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.stroke(); ex -= 18; } }
  });
  if (mode === "harvest") footer(ctx, W, H, "Reply số ô hoặc .nongtrai thuhoach all");
  return png(canvas);
}

export async function renderHarvestResult(result) {
  const items = (result.results || []).filter((r) => !r.error);
  const W = 880, H = Math.min(1100, 112 + items.length * 84 + 90);
  const { canvas, ctx } = newCanvas(W, H);
  drawHeader(ctx, W, "THU HOẠCH THÀNH CÔNG", `+${result.totalExp || 0} EXP nông nghiệp`, ["crop", "crop_dua_hau"]);
  let y = 104;
  for (const r of items) {
    drawCard(ctx, 24, y, W - 48, 74, { radius: 16, border: rc(r.rarity), borderWidth: 2 });
    drawIconTile(ctx, "crop", r.seedId || "crop_lua", 36, y + 7, 60, { rarity: r.rarity });
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = `800 17px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(`${r.name}  x${r.quantity}`, 112, y + 26);
    chip(ctx, RARITY_VN[r.rarity] || "THƯỜNG", 112, y + 42, rc(r.rarity), 20);
    ctx.font = `700 13px ${FONT}`; ctx.fillStyle = C.greenDark; ctx.textAlign = "right"; ctx.fillText(`+${r.exp} EXP`, W - 48, y + 37);
    y += 84;
  }
  drawCard(ctx, 24, y + 4, W - 48, 56, { radius: 16, bg: "rgba(255,230,150,0.9)" });
  ctx.font = `700 14px ${FONT}`; ctx.fillStyle = C.brown; ctx.textAlign = "center"; ctx.fillText("Dùng .nongtrai sell để bán nông sản tại chợ", W / 2, y + 33);
  return png(canvas);
}

/** 5. Chợ nông sản */
export async function renderMarket(sellable, balance) {
  const list = sellable || [];
  const W = 940; const H = Math.max(560, 124 + Math.max(list.length, 1) * 92 + 50);
  const { canvas, ctx } = newCanvas(W, H);
  drawHeader(ctx, W, "CHỢ NÔNG SẢN", `Số dư: ${money(balance)} xu`, ["crop", "crop_ca_chua"]);
  const leftW = 600;
  drawCard(ctx, 16, 102, leftW, H - 124);
  ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = `800 16px ${FONT}`; ctx.fillStyle = C.greenDark; ctx.fillText("KHO NÔNG SẢN CÓ THỂ BÁN", 36, 128);
  if (!list.length) {
    ctx.font = `14px ${FONT}`; ctx.fillStyle = C.muted; ctx.textAlign = "center"; ctx.fillText("Kho trống — hãy trồng và thu hoạch trước", 16 + leftW / 2, 220);
  } else {
    let y = 148;
    list.forEach((it, i) => {
      drawCard(ctx, 30, y, leftW - 28, 82, { radius: 14, bg: "rgba(139,207,101,0.12)", border: rc(it.rarity), borderWidth: 2, shadow: 4 });
      numBadge(ctx, i + 1, 56, y + 41);
      drawIconTile(ctx, "crop", it.id, 84, y + 8, 66, { rarity: it.rarity });
      ctx.textAlign = "left"; ctx.font = `800 15px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(it.name, 162, y + 26);
      ctx.font = `12px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(`x${it.quantity}  •  ${money(it.unitPrice)} xu/sp`, 162, y + 48);
      const trend = it.mult >= 1.02 ? "▲" : it.mult <= 0.98 ? "▼" : "•";
      ctx.fillStyle = it.mult >= 1.02 ? "#1B9E4B" : it.mult <= 0.98 ? C.red : C.muted; ctx.fillText(`${trend} giá chợ x${Number(it.mult || 1).toFixed(2)}`, 162, y + 66);
      ctx.textAlign = "right"; ctx.font = `800 16px ${FONT}`; ctx.fillStyle = C.orange; ctx.fillText(`${money(it.totalValue)} xu`, leftW - 14, y + 41);
      y += 92;
    });
  }
  const rx = leftW + 28;
  drawCard(ctx, rx, 102, W - rx - 16, H - 124, { bg: "rgba(255,243,208,0.97)" });
  ctx.textAlign = "left"; ctx.font = `800 16px ${FONT}`; ctx.fillStyle = C.brown; ctx.fillText("CÁCH BÁN", rx + 20, 128);
  ctx.font = `13px ${FONT}`; ctx.fillStyle = C.text;
  ["Reply số thứ tự: bán 1 loại", "Reply: <số> <số lượng>", "Reply: all — bán toàn bộ", "Giá chợ đổi sau mỗi phiên", "Phiên hết hạn sau 5 phút"].forEach((t, i) => ctx.fillText("• " + t, rx + 20, 164 + i * 30));
  drawIcon(ctx, "crop", "crop_dao", rx + (W - rx - 16) / 2, 356, 110);
  return png(canvas);
}

export async function renderSellSuccess(data) {
  const sold = data.sold || []; const W = 760; const H = 190 + sold.length * 70;
  const { canvas, ctx } = newCanvas(W, H);
  drawHeader(ctx, W, "BÁN THÀNH CÔNG", `+${money(data.totalMoney)} xu`, ["crop", "crop_lua"]);
  let y = 104;
  for (const s of sold) {
    drawCard(ctx, 24, y, W - 48, 60, { radius: 14 });
    drawIcon(ctx, "crop", s.id, 62, y + 30, 48);
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = `bold 15px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(`${s.name}  x${s.soldQty}`, 100, y + 30);
    ctx.textAlign = "right"; ctx.font = `800 16px ${FONT}`; ctx.fillStyle = C.orange; ctx.fillText(`+${money(s.money)} xu`, W - 48, y + 30);
    y += 70;
  }
  ctx.textAlign = "center"; ctx.font = `800 16px ${FONT}`; ctx.fillStyle = "#fff"; ctx.shadowColor = "rgba(0,50,10,0.6)"; ctx.shadowBlur = 4;
  ctx.fillText(`Số dư mới: ${money(data.balance)} xu`, W / 2, y + 30);
  return png(canvas);
}

export async function renderPlantSuccess(data) {
  const W = 760, H = 340;
  const { canvas, ctx } = newCanvas(W, H);
  drawHeader(ctx, W, "TRỒNG THÀNH CÔNG", data.seed?.name || "", ["seed", data.seed?.id || "seed_lua"]);
  drawCard(ctx, 36, 108, W - 72, 200);
  drawPlantStage(ctx, "growing", 0.45, data.seed?.id, 140, 208, 150);
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const rows = [["Đã trồng", `${data.quantity} cây`], ["Thời gian sinh trưởng", fmtTime(data.seed?.growTimeMs || 0)], ["Ô đất trống còn lại", `${data.emptySlots}`], ["Cấp nông nghiệp", `${data.farmLevel}`]];
  rows.forEach(([k, v], i) => { ctx.font = `13px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(k, 250, 148 + i * 40); ctx.font = `800 17px ${FONT}`; ctx.fillStyle = C.greenDark; ctx.fillText(v, 470, 148 + i * 40); });
  return png(canvas);
}

export async function renderBuyLandSuccess(data) {
  const W = 760, H = 330;
  const { canvas, ctx } = newCanvas(W, H);
  drawHeader(ctx, W, "MUA ĐẤT THÀNH CÔNG", data.land?.name || "", ["land", data.land?.id || "land_basic"]);
  drawCard(ctx, 36, 108, W - 72, 190);
  drawIconTile(ctx, "land", data.land?.id || "land_basic", 60, 126, 130, { color: data.land?.color });
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.font = `800 20px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(data.land?.name || "", 220, 152);
  ctx.font = `14px ${FONT}`; ctx.fillStyle = C.muted;
  ctx.fillText(`${data.land?.plots} ô trồng mới`, 220, 188); ctx.fillText(`Tổng ô đất hiện có: ${data.totalPlots}`, 220, 218); ctx.fillText(`Số dư còn: ${money(data.balance)} xu`, 220, 248);
  return png(canvas);
}

/** Danh sách thuốc */
export async function renderMedicines(owned, all) {
  const list = owned.length ? owned : all;
  const W = 900, H = Math.min(1300, 110 + list.length * 108 + 50);
  const { canvas, ctx } = newCanvas(W, H);
  drawHeader(ctx, W, "THUỐC TRỒNG TRỌT", owned.length ? "Thuốc trong kho — reply số để dùng" : "Danh mục thuốc (mua tại .shop → Thuốc → Trồng Trọt)", ["medicine", "med_growth_large"]);
  let y = 104;
  list.forEach((m, i) => {
    drawCard(ctx, 24, y, W - 48, 98, { border: m.color || rc(m.rarity), borderWidth: 2.5 });
    numBadge(ctx, i + 1, 56, y + 49, m.color || C.greenDark);
    drawIconTile(ctx, "medicine", m.id, 86, y + 8, 82, { color: m.color, rarity: m.rarity });
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = `800 17px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(m.name + (m.quantity != null ? `  x${m.quantity}` : ""), 182, y + 26);
    chip(ctx, RARITY_VN[m.rarity] || "THƯỜNG", 182, y + 40, rc(m.rarity), 20);
    ctx.font = `12px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(fitText(ctx, m.description, 560), 182, y + 76);
    if (m.quantity == null) { ctx.textAlign = "right"; ctx.font = `800 15px ${FONT}`; ctx.fillStyle = C.orange; ctx.fillText(`${money(m.price)} xu`, W - 46, y + 49); }
    y += 108;
  });
  return png(canvas);
}

/** Dụng cụ trồng trọt + hiệu ứng đang áp dụng */
export async function renderTools(all, owned, bonuses) {
  const ownedIds = new Set((owned || []).map((t) => t.id));
  const W = 920; const rows = Math.ceil(all.length / 2);
  const H = 112 + 92 + rows * 128 + 44;
  const { canvas, ctx } = newCanvas(W, H);
  drawHeader(ctx, W, "DỤNG CỤ TRỒNG TRỌT", "Mua tại .shop → Vật phẩm → Nông Trại", ["tool", "tool_hoe_gold"]);
  drawCard(ctx, 24, 102, W - 48, 76, { bg: "rgba(255,243,208,0.97)" });
  ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = `800 15px ${FONT}`; ctx.fillStyle = C.brown; ctx.fillText("HIỆU ỨNG ĐANG ÁP DỤNG", 44, 126);
  ctx.font = `13px ${FONT}`; ctx.fillStyle = C.text;
  ctx.fillText(`Cây lớn nhanh hơn +${Math.round((bonuses?.growth || 0) * 100)}%   •   Sản lượng thu hoạch +${Math.round((bonuses?.yield || 0) * 100)}%   (mỗi loại dụng cụ chỉ tính cái tốt nhất)`, 44, 154);
  const cardW = (W - 60) / 2;
  all.forEach((t, i) => {
    const x = 24 + (i % 2) * (cardW + 12); const y = 192 + Math.floor(i / 2) * 128; const has = ownedIds.has(t.id);
    drawCard(ctx, x, y, cardW, 116, { border: rc(t.rarity), borderWidth: has ? 3.5 : 2, bg: has ? "rgba(230,250,214,0.98)" : C.card });
    drawIconTile(ctx, "tool", t.id, x + 12, y + 12, 92, { rarity: t.rarity });
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = `800 16px ${FONT}`; ctx.fillStyle = C.text; ctx.fillText(fitText(ctx, t.name, cardW - 130), x + 116, y + 28);
    ctx.font = `12px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(fitText(ctx, t.description, cardW - 130), x + 116, y + 52);
    if (has) chip(ctx, "ĐÃ SỞ HỮU", x + 116, y + 70, "#1B9E4B", 22); else chip(ctx, `${money(t.price)} xu`, x + 116, y + 70, C.orange, 22);
    ctx.font = `11px ${FONT}`; ctx.fillStyle = C.muted; ctx.fillText(`Cần cấp ${t.unlockLevel}`, x + 116, y + 104);
  });
  return png(canvas);
}
