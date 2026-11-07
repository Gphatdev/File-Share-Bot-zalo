/**
 * Admin canvas — vẽ ảnh cho lệnh `admin`
 *  - renderAdminMenu      : menu chức năng của lệnh admin
 *  - renderAdminResult    : kết quả THÊM / XÓA admin & support (xanh / đỏ, có avatar Zalo + thời gian)
 *  - renderAdminList      : danh sách quản trị (phong cách riêng: navy + vàng + cyan, hình mờ phía sau)
 *  - renderStatusCard     : thẻ lỗi / từ chối quyền
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, registerFont } from "canvas";
import { getConfiguredBotName } from "../../../../Utils/Branding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(__dirname, "..", "MEDIA", "fonts");
const TEMP = path.join(__dirname, "temp");
const FONT = "AdminUI";

(function () {
  if (!fs.existsSync(fontDir)) return;
  for (const [f, w] of [
    ["BeVietnamPro_800ExtraBold.ttf", "800"],
    ["BeVietnamPro_700Bold.ttf", "bold"],
    ["BeVietnamPro_600SemiBold.ttf", "600"],
    ["BeVietnamPro_400Regular.ttf", "normal"],
  ]) {
    const p = path.join(fontDir, f);
    if (fs.existsSync(p)) {
      try { registerFont(p, { family: FONT, weight: w }); } catch {}
    }
  }
})();

/* ───────────────────────── helpers ───────────────────────── */

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

/** Khung vát góc (chamfer) */
function chamfer(ctx, x, y, w, h, c) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

function hexPath(ctx, cx, cy, r, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rot + (i * Math.PI) / 3;
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function fit(ctx, t, maxW) {
  let s = String(t || "");
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

function rgba(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Tải ảnh từ đường dẫn hoặc URL (có timeout để không treo bot) */
async function loadAv(src) {
  if (!src) return null;
  try {
    if (!/^https?:\/\//i.test(src) && !fs.existsSync(src)) return null;
    return await Promise.race([
      loadImage(src),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000)),
    ]);
  } catch {
    return null;
  }
}

/** Giờ Việt Nam: "14:32:05 · 08/10/2026" */
export function formatVNTime(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).reduce((o, p) => ((o[p.type] = p.value), o), {});
    const hh = parts.hour === "24" ? "00" : parts.hour;
    return `${hh}:${parts.minute}:${parts.second} · ${parts.day}/${parts.month}/${parts.year}`;
  } catch {
    return date.toLocaleString("vi-VN");
  }
}

/** Vẽ avatar tròn / lục giác, fallback = chữ cái đầu hoặc bóng người */
function drawAvatar(ctx, img, name, cx, cy, R, color, shape = "circle") {
  const clipShape = () => {
    if (shape === "hex") hexPath(ctx, cx, cy, R);
    else { ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); }
  };
  // glow + ring
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = color;
  if (shape === "hex") hexPath(ctx, cx, cy, R + 4);
  else { ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI * 2); }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  clipShape();
  ctx.clip();
  if (img) {
    const sc = Math.max((R * 2) / img.width, (R * 2) / img.height);
    const dw = img.width * sc, dh = img.height * sc;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    g.addColorStop(0, rgba(color, 0.55));
    g.addColorStop(1, "#0B1220");
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `800 ${Math.round(R * 0.95)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(name || "?").trim().slice(0, 1).toUpperCase() || "?", cx, cy + 1);
  }
  ctx.restore();
}

function pill(ctx, text, x, y, h, color, opts = {}) {
  ctx.font = `800 ${opts.font || 13}px ${FONT}`;
  const w = ctx.measureText(text).width + (opts.pad || 26);
  ctx.save();
  rr(ctx, x - w, y - h / 2, w, h, h / 2);
  ctx.fillStyle = rgba(color, 0.16);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = rgba(color, 0.85);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x - w / 2, y + 1);
  ctx.restore();
  return w;
}

function dotGrid(ctx, W, H, color, a = 0.06, step = 28) {
  ctx.fillStyle = rgba(color, a);
  for (let y = step / 2; y < H; y += step)
    for (let x = step / 2; x < W; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
}

function glow(ctx, x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/* ───────────────────────── icons ───────────────────────── */

function iconCheck(ctx, cx, cy, s, color, lw = 8) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy + s * 0.02);
  ctx.lineTo(cx - s * 0.12, cy + s * 0.4);
  ctx.lineTo(cx + s * 0.55, cy - s * 0.38);
  ctx.stroke();
  ctx.restore();
}

function iconCross(ctx, cx, cy, s, color, lw = 8) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.42, cy - s * 0.42); ctx.lineTo(cx + s * 0.42, cy + s * 0.42);
  ctx.moveTo(cx + s * 0.42, cy - s * 0.42); ctx.lineTo(cx - s * 0.42, cy + s * 0.42);
  ctx.stroke();
  ctx.restore();
}

function iconCrown(ctx, cx, cy, s, color) {
  const w = s, h = s * 0.72;
  const x = cx - w / 2, y = cy - h / 2;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + h * 0.28);
  ctx.lineTo(x + w * 0.25, y + h * 0.58);
  ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.75, y + h * 0.58);
  ctx.lineTo(x + w, y + h * 0.28);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function iconShield(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s / 2);
  ctx.lineTo(cx + s * 0.42, cy - s * 0.3);
  ctx.lineTo(cx + s * 0.42, cy + s * 0.05);
  ctx.quadraticCurveTo(cx + s * 0.4, cy + s * 0.38, cx, cy + s / 2);
  ctx.quadraticCurveTo(cx - s * 0.4, cy + s * 0.38, cx - s * 0.42, cy + s * 0.05);
  ctx.lineTo(cx - s * 0.42, cy - s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function iconList(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.arc(cx - s * 0.36, cy + i * s * 0.3, s * 0.07, 0, Math.PI * 2); ctx.fill();
    rr(ctx, cx - s * 0.2, cy + i * s * 0.3 - s * 0.055, s * 0.6, s * 0.11, s * 0.05); ctx.fill();
  }
  ctx.restore();
}

function iconPlus(ctx, cx, cy, s, color, lw = 5) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.4, cy); ctx.lineTo(cx + s * 0.4, cy);
  ctx.moveTo(cx, cy - s * 0.4); ctx.lineTo(cx, cy + s * 0.4);
  ctx.stroke();
  ctx.restore();
}

function iconMinus(ctx, cx, cy, s, color, lw = 5) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.4, cy); ctx.lineTo(cx + s * 0.4, cy);
  ctx.stroke();
  ctx.restore();
}

function iconClock(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy, s / 2, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.3); ctx.lineTo(cx, cy); ctx.lineTo(cx + s * 0.22, cy + s * 0.14);
  ctx.stroke();
  ctx.restore();
}

function iconUser(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy - s * 0.2, s * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.42, cy + s * 0.46);
  ctx.quadraticCurveTo(cx - s * 0.42, cy + s * 0.08, cx, cy + s * 0.08);
  ctx.quadraticCurveTo(cx + s * 0.42, cy + s * 0.08, cx + s * 0.42, cy + s * 0.46);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ───────────────────────── 1. MENU CHỨC NĂNG ───────────────────────── */

export async function renderAdminMenu(data = {}) {
  const prefix = data.prefix ?? ".";
  const items = [
    { cmd: "admin list", arg: "", title: "Danh sách quản trị", desc: "Xem toàn bộ admin & support của bot", color: "#38BDF8", icon: iconList },
    { cmd: "admin add", arg: "@tag / UID", title: "Thêm admin", desc: "Cấp quyền BOT ADMIN cho người được tag", color: "#22E58B", icon: iconPlus },
    { cmd: "admin rm", arg: "@tag / UID", title: "Xóa admin", desc: "Gỡ quyền BOT ADMIN khỏi người được tag", color: "#FF4D5E", icon: iconMinus },
    { cmd: "admin sp", arg: "@tag / UID", title: "Thêm support", desc: "Cấp quyền SUPPORT cho người được tag", color: "#FBBF24", icon: iconShield },
    { cmd: "admin rmsp", arg: "@tag / UID", title: "Xóa support", desc: "Gỡ quyền SUPPORT khỏi người được tag", color: "#FB923C", icon: iconShield },
  ];
  const W = 900, headH = 190, rowH = 96, gap = 14, footH = 92;
  const H = headH + items.length * (rowH + gap) + footH;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const bgG = ctx.createLinearGradient(0, 0, W, H);
  bgG.addColorStop(0, "#050A16"); bgG.addColorStop(0.55, "#0A1226"); bgG.addColorStop(1, "#0D0A1E");
  ctx.fillStyle = bgG; ctx.fillRect(0, 0, W, H);
  dotGrid(ctx, W, H, "#7DD3FC", 0.05);
  glow(ctx, W / 2, 40, 420, "#38BDF8", 0.20);
  glow(ctx, W - 80, H - 60, 340, "#A855F7", 0.14);

  ctx.save();
  ctx.shadowColor = "#38BDF8"; ctx.shadowBlur = 14;
  ctx.strokeStyle = "rgba(56,189,248,0.7)"; ctx.lineWidth = 2.5;
  chamfer(ctx, 14, 14, W - 28, H - 28, 26); ctx.stroke();
  ctx.restore();

  // header
  iconCrown(ctx, W / 2, 56, 40, "#FBBF24");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.save();
  ctx.shadowColor = "rgba(56,189,248,0.8)"; ctx.shadowBlur = 20;
  ctx.fillStyle = "#F8FAFC"; ctx.font = `800 40px ${FONT}`;
  ctx.fillText("CHỨC NĂNG ADMIN", W / 2, 108);
  ctx.restore();
  ctx.fillStyle = "#7DD3FC"; ctx.font = `600 15px ${FONT}`;
  ctx.fillText("QUẢN LÝ ADMIN  •  SUPPORT  •  PHÂN QUYỀN", W / 2, 146);
  ctx.strokeStyle = "rgba(125,211,252,0.25)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(60, 170); ctx.lineTo(W - 60, 170); ctx.stroke();

  let y = headH;
  items.forEach((it, i) => {
    const x = 44, w = W - 88;
    ctx.save();
    rr(ctx, x, y, w, rowH, 18);
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, rgba(it.color, 0.16)); g.addColorStop(0.5, "rgba(15,23,42,0.88)"); g.addColorStop(1, "rgba(15,23,42,0.88)");
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = rgba(it.color, 0.45); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    // accent bar
    ctx.fillStyle = it.color;
    rr(ctx, x, y + 16, 5, rowH - 32, 3); ctx.fill();

    // icon badge
    const bx = x + 58, by = y + rowH / 2;
    hexPath(ctx, bx, by, 31);
    ctx.fillStyle = "rgba(2,6,23,0.8)"; ctx.fill();
    ctx.save();
    ctx.shadowColor = it.color; ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5; ctx.strokeStyle = it.color; ctx.stroke();
    ctx.restore();
    it.icon(ctx, bx, by, 28, it.color);

    // text
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#F8FAFC"; ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(it.title, x + 112, y + 34);
    ctx.fillStyle = "rgba(148,163,184,0.95)"; ctx.font = `15px ${FONT}`;
    ctx.fillText(fit(ctx, it.desc, w - 112 - 280), x + 112, y + 63);

    // command chip
    const label = `${prefix}${it.cmd}${it.arg ? " " + it.arg : ""}`;
    ctx.font = `bold 15px ${FONT}`;
    const cw = ctx.measureText(label).width + 30;
    rr(ctx, x + w - cw - 22, y + rowH / 2 - 19, cw, 38, 19);
    ctx.fillStyle = "rgba(2,6,23,0.75)"; ctx.fill();
    ctx.strokeStyle = rgba(it.color, 0.8); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = it.color; ctx.textAlign = "center";
    ctx.fillText(label, x + w - cw / 2 - 22, y + rowH / 2 + 1);

    y += rowH + gap;
  });

  // footer
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(148,163,184,0.9)"; ctx.font = `600 14px ${FONT}`;
  ctx.fillText(`Có thể tag nhiều người hoặc nhập nhiều UID cùng lúc  •  Yêu cầu quyền OWNER / BOT ADMIN`, W / 2, H - 56);
  ctx.fillStyle = "#38BDF8"; ctx.font = `bold 13px ${FONT}`;
  ctx.fillText(`${getConfiguredBotName()}  •  ${data.roleLabel || "BOT ADMIN"}: ${data.name || "Admin"}`, W / 2, H - 34);

  return canvas.toBuffer("image/png");
}

/** Giữ tên cũ để code cũ import không bị lỗi */
export const renderAdminDashboard = renderAdminMenu;

/* ───────────────────────── 2. KẾT QUẢ THÊM / XÓA ───────────────────────── */

/**
 * @param {object} d
 * @param {"add"|"rm"} d.mode
 * @param {"admin"|"support"} d.role
 * @param {{uid:string,name:string,avatar?:string}[]} d.targets
 * @param {string} d.by      tên người thực hiện
 * @param {string} [d.time]  chuỗi thời gian (mặc định: bây giờ, giờ VN)
 */
export async function renderAdminResult(d) {
  const add = d.mode !== "rm";
  const roleTxt = d.role === "support" ? "SUPPORT" : "ADMIN";
  const C = add
    ? { main: "#22E58B", soft: "#0B3D2A", dim: "#0A1F18" }
    : { main: "#FF4D5E", soft: "#4A1119", dim: "#240A0E" };
  const title = `${add ? "THÊM" : "XÓA"} ${roleTxt} THÀNH CÔNG`;
  const targets = (d.targets || []).slice(0, 5);
  const extra = (d.targets || []).length - targets.length;
  const time = d.time || formatVNTime();

  const W = 900, headH = 230, rowH = 108, gap = 14, infoH = 120;
  const H = headH + targets.length * (rowH + gap) + (extra > 0 ? 36 : 0) + infoH + 44;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // nền
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#050810"); g.addColorStop(0.5, C.dim); g.addColorStop(1, "#06070D");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  dotGrid(ctx, W, H, C.main, 0.05);
  glow(ctx, W / 2, 80, 430, C.main, 0.26);
  glow(ctx, W / 2, H, 380, C.main, 0.10);

  // khung neon vát góc
  ctx.save();
  ctx.shadowColor = C.main; ctx.shadowBlur = 20;
  ctx.strokeStyle = C.main; ctx.lineWidth = 3;
  chamfer(ctx, 14, 14, W - 28, H - 28, 30); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = rgba(C.main, 0.25); ctx.lineWidth = 1;
  chamfer(ctx, 26, 26, W - 52, H - 52, 24); ctx.stroke();

  // huy hiệu tròn + dấu ✓ / ✗
  const hx = W / 2, hy = 88;
  ctx.save();
  ctx.shadowColor = C.main; ctx.shadowBlur = 36;
  ctx.beginPath(); ctx.arc(hx, hy, 46, 0, Math.PI * 2);
  const bg2 = ctx.createRadialGradient(hx, hy, 4, hx, hy, 46);
  bg2.addColorStop(0, rgba(C.main, 0.35)); bg2.addColorStop(1, rgba(C.main, 0.08));
  ctx.fillStyle = bg2; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = C.main; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); ctx.arc(hx, hy, 56, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(C.main, 0.3); ctx.lineWidth = 1.5; ctx.stroke();
  if (add) iconCheck(ctx, hx, hy, 46, "#FFFFFF", 8);
  else iconCross(ctx, hx, hy, 46, "#FFFFFF", 8);

  // tiêu đề
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.save();
  ctx.shadowColor = C.main; ctx.shadowBlur = 22;
  ctx.fillStyle = "#FFFFFF"; ctx.font = `800 40px ${FONT}`;
  ctx.fillText(title, W / 2, 168);
  ctx.restore();
  ctx.fillStyle = rgba(C.main, 0.95); ctx.font = `600 14px ${FONT}`;
  ctx.fillText(`${getConfiguredBotName()}  •  HỆ THỐNG QUẢN TRỊ`, W / 2, 202);

  // danh sách người được thêm / xóa
  const avs = await Promise.all(targets.map((t) => loadAv(t.avatar)));
  let y = headH;
  targets.forEach((t, i) => {
    const x = 48, w = W - 96;
    ctx.save();
    rr(ctx, x, y, w, rowH, 20);
    const rg = ctx.createLinearGradient(x, y, x + w, y);
    rg.addColorStop(0, rgba(C.main, 0.14)); rg.addColorStop(0.45, "rgba(12,16,28,0.9)"); rg.addColorStop(1, "rgba(12,16,28,0.9)");
    ctx.fillStyle = rg; ctx.fill();
    ctx.strokeStyle = rgba(C.main, 0.5); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    drawAvatar(ctx, avs[i], t.name, x + 66, y + rowH / 2, 36, C.main);

    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFFFFF"; ctx.font = `bold 26px ${FONT}`;
    ctx.fillText(fit(ctx, t.name || t.uid, w - 330), x + 124, y + 38);
    ctx.fillStyle = "rgba(148,163,184,0.95)"; ctx.font = `15px ${FONT}`;
    ctx.fillText(`UID: ${t.uid}`, x + 124, y + 70);

    // chip phải
    const px = x + w - 24;
    pill(ctx, add ? `+ ĐÃ THÊM` : `– ĐÃ XÓA`, px, y + 34, 32, C.main, { font: 14, pad: 30 });
    pill(ctx, roleTxt === "ADMIN" ? "BOT ADMIN" : "SUPPORT BOT", px, y + 74, 26, "#CBD5E1", { font: 12, pad: 24 });
    y += rowH + gap;
  });
  if (extra > 0) {
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(148,163,184,0.9)"; ctx.font = `600 15px ${FONT}`;
    ctx.fillText(`… và ${extra} người khác`, W / 2, y + 8);
    y += 36;
  }

  // thanh thông tin: thời gian / người thực hiện / số lượng
  const ix = 48, iw = W - 96, iy = y + 6;
  ctx.save();
  rr(ctx, ix, iy, iw, infoH - 16, 20);
  ctx.fillStyle = "rgba(2,6,23,0.7)"; ctx.fill();
  ctx.strokeStyle = rgba(C.main, 0.35); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
  const cols = [
    { label: "THỜI GIAN", val: time, icon: iconClock, w: 0.46 },
    { label: "THỰC HIỆN BỞI", val: d.by || "Admin", icon: iconUser, w: 0.34 },
    { label: add ? "ĐÃ THÊM" : "ĐÃ XÓA", val: `${(d.targets || []).length} ${roleTxt}`, icon: add ? iconPlus : iconMinus, w: 0.20 },
  ];
  let cx0 = ix + 26;
  cols.forEach((c, i) => {
    const cw = iw * c.w;
    c.icon(ctx, cx0 + 12, iy + 33, 22, C.main);
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = rgba(C.main, 0.9); ctx.font = `800 12px ${FONT}`;
    ctx.fillText(c.label, cx0 + 34, iy + 33);
    ctx.fillStyle = "#F8FAFC"; ctx.font = `bold 18px ${FONT}`;
    ctx.fillText(fit(ctx, c.val, cw - 50), cx0, iy + 66);
    cx0 += cw;
    if (i < cols.length - 1) {
      ctx.strokeStyle = rgba(C.main, 0.22); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx0 - 14, iy + 18); ctx.lineTo(cx0 - 14, iy + infoH - 34); ctx.stroke();
    }
  });

  return canvas.toBuffer("image/png");
}

/* ───────────────────────── 3. DANH SÁCH QUẢN TRỊ ───────────────────────── */

/**
 * @param {{admins:{uid,name,avatar?,isOwner?}[], supports:{uid,name,avatar?}[]}} data
 */
export async function renderAdminList(data) {
  const admins = (data.admins || []).slice(0, 12);
  const supports = (data.supports || []).slice(0, 12);
  const moreA = (data.admins || []).length - admins.length;
  const moreS = (data.supports || []).length - supports.length;

  const W = 900, headH = 210, rowH = 92, gap = 12, secH = 56, footH = 90;
  const nA = Math.max(admins.length, 1), nS = Math.max(supports.length, 1);
  const H = headH + secH * 2 + (nA + nS) * (rowH + gap) + (moreA > 0 ? 30 : 0) + (moreS > 0 ? 30 : 0) + 30 + footH;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  /* nền */
  const bgG = ctx.createLinearGradient(0, 0, 0, H);
  bgG.addColorStop(0, "#04101C"); bgG.addColorStop(0.5, "#07162A"); bgG.addColorStop(1, "#0B0F1E");
  ctx.fillStyle = bgG; ctx.fillRect(0, 0, W, H);

  // mạng lục giác mờ
  ctx.save();
  ctx.strokeStyle = "rgba(34,211,238,0.07)"; ctx.lineWidth = 1.2;
  const hr = 34, hw = hr * Math.sqrt(3), vh = hr * 1.5;
  for (let row = -1; row * vh < H + hr; row++)
    for (let col = -1; col * hw < W + hw; col++) {
      hexPath(ctx, col * hw + (row % 2 ? hw / 2 : 0), row * vh, hr - 1.5);
      ctx.stroke();
    }
  ctx.restore();
  glow(ctx, W / 2, 110, 460, "#22D3EE", 0.22);
  glow(ctx, W / 2, H * 0.55, 520, "#FBBF24", 0.07);

  /* hình dạng mờ phía sau chữ: vương miện + lục giác khổng lồ */
  ctx.save();
  ctx.globalAlpha = 0.08;
  hexPath(ctx, W / 2, H * 0.52, Math.min(W * 0.62, H * 0.42));
  const sg = ctx.createLinearGradient(0, 0, W, H);
  sg.addColorStop(0, "#22D3EE"); sg.addColorStop(1, "#FBBF24");
  ctx.fillStyle = sg; ctx.fill();
  ctx.globalAlpha = 0.16; ctx.lineWidth = 6; ctx.strokeStyle = "#67E8F9"; ctx.stroke();
  ctx.restore();

  /* khung */
  ctx.save();
  ctx.shadowColor = "#22D3EE"; ctx.shadowBlur = 18;
  ctx.strokeStyle = "rgba(34,211,238,0.85)"; ctx.lineWidth = 3;
  chamfer(ctx, 14, 14, W - 28, H - 28, 34); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "rgba(251,191,36,0.35)"; ctx.lineWidth = 1.2;
  chamfer(ctx, 26, 26, W - 52, H - 52, 26); ctx.stroke();

  /* tiêu đề */
  iconCrown(ctx, W / 2, 66, 44, "#FBBF24");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.save();
  ctx.shadowColor = "rgba(34,211,238,0.9)"; ctx.shadowBlur = 26;
  ctx.fillStyle = "#FFFFFF"; ctx.font = `800 46px ${FONT}`;
  ctx.fillText("DANH SÁCH QUẢN TRỊ", W / 2, 122);
  ctx.restore();
  ctx.fillStyle = "#67E8F9"; ctx.font = `600 15px ${FONT}`;
  const total = (data.admins || []).length + (data.supports || []).length;
  ctx.fillText(`ADMIN  •  SUPPORT  •  TỔNG ${total} THÀNH VIÊN`, W / 2, 162);
  const lg = ctx.createLinearGradient(60, 0, W - 60, 0);
  lg.addColorStop(0, "rgba(34,211,238,0)"); lg.addColorStop(0.5, "rgba(251,191,36,0.8)"); lg.addColorStop(1, "rgba(34,211,238,0)");
  ctx.strokeStyle = lg; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(60, 188); ctx.lineTo(W - 60, 188); ctx.stroke();

  /* avatars */
  const [avA, avS] = await Promise.all([
    Promise.all(admins.map((a) => loadAv(a.avatar))),
    Promise.all(supports.map((a) => loadAv(a.avatar))),
  ]);

  const section = (y, label, count, color) => {
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = color; ctx.font = `800 18px ${FONT}`;
    ctx.fillText(label, 74, y + secH / 2 + 2);
    const lw = ctx.measureText(label).width;
    pill(ctx, `${count}`, 74 + lw + 16 + 38, y + secH / 2 + 2, 24, color, { font: 13, pad: 22 });
    ctx.strokeStyle = rgba(color, 0.3); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(74 + lw + 80, y + secH / 2 + 2); ctx.lineTo(W - 74, y + secH / 2 + 2); ctx.stroke();
  };

  const row = (y, idx, p, img, color, badge) => {
    const x = 60, w = W - 120;
    ctx.save();
    rr(ctx, x, y, w, rowH, 22);
    const rg = ctx.createLinearGradient(x, y, x + w, y);
    rg.addColorStop(0, "rgba(8,20,38,0.82)"); rg.addColorStop(1, rgba(color, 0.12));
    ctx.fillStyle = rg; ctx.fill();
    ctx.strokeStyle = rgba(color, 0.4); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = rgba(color, 0.55); ctx.font = `800 20px ${FONT}`;
    ctx.fillText(String(idx).padStart(2, "0"), x + 34, y + rowH / 2);

    drawAvatar(ctx, img, p.name, x + 98, y + rowH / 2, 31, color, "hex");

    ctx.textAlign = "left";
    ctx.fillStyle = "#FFFFFF"; ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(fit(ctx, p.name || p.uid, w - 400), x + 148, y + 34);
    ctx.fillStyle = "rgba(148,163,184,0.95)"; ctx.font = `14px ${FONT}`;
    ctx.fillText(`UID: ${p.uid}`, x + 148, y + 62);

    pill(ctx, badge, x + w - 26, y + rowH / 2, 34, color, { font: 14, pad: 36 });
  };

  let y = headH;
  section(y, "ADMIN BOT", (data.admins || []).length, "#FBBF24");
  y += secH;
  if (!admins.length) {
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(148,163,184,0.8)"; ctx.font = `15px ${FONT}`;
    ctx.fillText("Chưa có admin nào.", W / 2, y + rowH / 2); y += rowH + gap;
  } else {
    admins.forEach((a, i) => { row(y, i + 1, a, avA[i], "#FBBF24", a.isOwner ? "OWNER" : "ADMIN"); y += rowH + gap; });
  }
  if (moreA > 0) { ctx.textAlign = "center"; ctx.fillStyle = "rgba(148,163,184,0.9)"; ctx.font = `600 14px ${FONT}`; ctx.fillText(`… và ${moreA} admin khác`, W / 2, y + 8); y += 30; }

  y += 6;
  section(y, "SUPPORT BOT", (data.supports || []).length, "#22D3EE");
  y += secH;
  if (!supports.length) {
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(148,163,184,0.8)"; ctx.font = `15px ${FONT}`;
    ctx.fillText("Chưa có support nào.", W / 2, y + rowH / 2); y += rowH + gap;
  } else {
    supports.forEach((a, i) => { row(y, i + 1, a, avS[i], "#22D3EE", "SUPPORT"); y += rowH + gap; });
  }
  if (moreS > 0) { ctx.textAlign = "center"; ctx.fillStyle = "rgba(148,163,184,0.9)"; ctx.font = `600 14px ${FONT}`; ctx.fillText(`… và ${moreS} support khác`, W / 2, y + 8); y += 30; }

  /* chân trang */
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#67E8F9"; ctx.font = `bold 14px ${FONT}`;
  ctx.fillText(`${getConfiguredBotName()}  •  CÙNG NHAU PHÁT TRIỂN`, W / 2, H - 58);
  ctx.fillStyle = "rgba(148,163,184,0.8)"; ctx.font = `13px ${FONT}`;
  ctx.fillText(`Cập nhật: ${data.time || formatVNTime()}`, W / 2, H - 36);

  return canvas.toBuffer("image/png");
}

/* ───────────────────────── 4. THẺ TRẠNG THÁI (lỗi / từ chối) ───────────────────────── */

export async function renderStatusCard(kind, title, lines = []) {
  const colors = {
    error: { main: "#F87171", icon: "x" },
    deny: { main: "#FBBF24", icon: "shield" },
    success: { main: "#4ADE80", icon: "check" },
  };
  const c = colors[kind] || colors.error;
  const W = 760, H = 250 + Math.min(lines.length, 6) * 30;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#07090F"); g.addColorStop(1, "#12090C");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  dotGrid(ctx, W, H, c.main, 0.05);
  glow(ctx, W / 2, 70, 320, c.main, 0.22);
  ctx.save();
  ctx.shadowColor = c.main; ctx.shadowBlur = 18;
  ctx.strokeStyle = c.main; ctx.lineWidth = 3;
  chamfer(ctx, 12, 12, W - 24, H - 24, 26); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = c.main; ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.arc(W / 2, 80, 38, 0, Math.PI * 2);
  ctx.fillStyle = rgba(c.main, 0.18); ctx.fill();
  ctx.lineWidth = 3.5; ctx.strokeStyle = c.main; ctx.stroke();
  ctx.restore();
  if (c.icon === "x") iconCross(ctx, W / 2, 80, 38, "#FFFFFF", 7);
  else if (c.icon === "check") iconCheck(ctx, W / 2, 80, 38, "#FFFFFF", 7);
  else iconShield(ctx, W / 2, 80, 40, "#FFFFFF");

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF"; ctx.font = `800 30px ${FONT}`;
  ctx.fillText(String(title), W / 2, 148);
  ctx.font = `16px ${FONT}`; ctx.fillStyle = "#CBD5E1";
  let y = 190;
  for (const line of lines.slice(0, 6)) {
    ctx.fillText(fit(ctx, String(line), W - 100), W / 2, y);
    y += 30;
  }
  return canvas.toBuffer("image/png");
}

export function saveTemp(buf, prefix = "admin") {
  fs.mkdirSync(TEMP, { recursive: true });
  const f = path.join(TEMP, `${prefix}_${Date.now()}.png`);
  fs.writeFileSync(f, buf);
  return f;
}
