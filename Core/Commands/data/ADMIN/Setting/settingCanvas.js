/**
 * settingCanvas.js — toàn bộ giao diện Canvas của hệ thống `.setting` (ACCOUNT CONTROL).
 * Phong cách Dark Premium: nền #0B0F19, xanh #2563EB, trắng, xám bạc #94A3B8, điểm nhấn gradient xanh→tím nhẹ.
 * Mọi hàm render trả Promise<Buffer PNG>. Ảnh dùng SCALE 1.5 (1500px rộng) để nhẹ bộ nhớ.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, registerFont } from "canvas";
import { getConfiguredBotName } from "../../../../../Utils/Branding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "..", "..", "MEDIA", "fonts");
const FAMILY = "SettingUI";
let fontsOk = false;
(function registerFonts() {
  for (const [f, w] of [["BeVietnamPro_800ExtraBold.ttf", "800"], ["BeVietnamPro_700Bold.ttf", "bold"], ["BeVietnamPro_600SemiBold.ttf", "600"], ["BeVietnamPro_400Regular.ttf", "normal"]]) {
    const p = path.join(FONT_DIR, f);
    if (fs.existsSync(p)) { try { registerFont(p, { family: FAMILY, weight: w }); fontsOk = true; } catch { /* dùng font hệ thống */ } }
  }
})();
const FACE = fontsOk ? FAMILY : "sans-serif";
const font = (w, s) => `${w === 800 ? "800" : w >= 700 ? "bold" : w >= 600 ? "600" : "normal"} ${s}px ${FACE}`;

export const COLORS = {
  bg: "#0B0F19", blue: "#2563EB", blueHi: "#60A5FA", violet: "#7C3AED", white: "#FFFFFF", silver: "#94A3B8", dim: "#64748B",
  ok: "#22C55E", bad: "#EF4444", warn: "#F59E0B", line: "rgba(148,163,184,0.16)",
};
const C = COLORS;
const W = 1000;
const SCALE = 1.5;
const PAD = 56;

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function rr(ctx, x, y, w, h, r) {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + R, y); ctx.arcTo(x + w, y, x + w, y + h, R); ctx.arcTo(x + w, y + h, x, y + h, R); ctx.arcTo(x, y + h, x, y, R); ctx.arcTo(x, y, x + w, y, R); ctx.closePath();
}
function fit(ctx, s, maxW) { s = String(s ?? ""); if (!maxW || ctx.measureText(s).width <= maxW) return s; while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1); return `${s}…`; }
function txt(ctx, s, x, y, { w = 400, size = 26, color = C.white, align = "left", maxW, spacing = 0 } = {}) {
  ctx.save(); ctx.font = font(w, size); ctx.fillStyle = color; ctx.textAlign = align;
  if (spacing && "letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(maxW ? fit(ctx, s, maxW) : String(s ?? ""), x, y); ctx.restore();
}
function wrap(ctx, s, maxW, w, size) {
  ctx.save(); ctx.font = font(w, size); const out = [];
  for (const para of String(s ?? "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) { const t = line ? `${line} ${word}` : word; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t; }
    out.push(line);
  }
  ctx.restore(); return out;
}
function canvasOf(H, sc = SCALE) { const canvas = createCanvas(Math.max(1, Math.round(W * sc)), Math.max(1, Math.round(H * sc))); const ctx = canvas.getContext("2d"); ctx.scale(sc, sc); ctx.textBaseline = "alphabetic"; return { canvas, ctx }; }
const grad = (ctx, x0, y0, x1, y1, a = C.blue, b = C.violet) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
function glow(ctx, x, y, r, color, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }

function background(ctx, H) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  glow(ctx, 140, 120, 520, C.blue, 0.22); glow(ctx, W - 60, H * 0.45, 560, C.violet, 0.14); glow(ctx, W * 0.5, H - 60, 520, C.blue, 0.12);
  ctx.save(); ctx.strokeStyle = "rgba(148,163,184,0.045)"; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();
  rr(ctx, 14, 14, W - 28, H - 28, 36); ctx.strokeStyle = grad(ctx, 0, 0, W, H, rgba(C.blue, 0.9), rgba(C.violet, 0.55)); ctx.lineWidth = 2; ctx.stroke();
}
function glass(ctx, x, y, w, h, { r = 28, tint = C.blue, a = 0.35, fill = 0.55 } = {}) {
  rr(ctx, x, y, w, h, r); ctx.fillStyle = `rgba(17,24,39,${fill})`; ctx.fill();
  rr(ctx, x, y, w, h, r); ctx.fillStyle = grad(ctx, x, y, x + w, y + h, rgba(tint, 0.10), "rgba(255,255,255,0.02)"); ctx.fill();
  rr(ctx, x, y, w, h, r); ctx.strokeStyle = rgba(tint, a); ctx.lineWidth = 1.5; ctx.stroke();
}

/** Vẽ icon (nét) tại tâm (cx,cy), bán kính s. */
export function icon(ctx, name, cx, cy, s, color = C.white, lw) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw ?? Math.max(2.6, s * 0.13); ctx.lineCap = "round"; ctx.lineJoin = "round";
  switch (name) {
    case "diary": // cuốn nhật ký
      rr(ctx, cx - s * 0.62, cy - s * 0.78, s * 1.24, s * 1.56, s * 0.14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.3, cy - s * 0.78); ctx.lineTo(cx - s * 0.3, cy + s * 0.78); ctx.stroke();
      for (const dy of [-0.3, 0.05, 0.4]) { ctx.beginPath(); ctx.moveTo(cx - s * 0.05, cy + s * dy); ctx.lineTo(cx + s * 0.38, cy + s * dy); ctx.stroke(); } break;
    case "post": // bài viết có ảnh
      rr(ctx, cx - s * 0.8, cy - s * 0.65, s * 1.6, s * 1.3, s * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.65, cy + s * 0.45); ctx.lineTo(cx - s * 0.2, cy - s * 0.05); ctx.lineTo(cx + s * 0.1, cy + s * 0.25); ctx.lineTo(cx + s * 0.3, cy + s * 0.05); ctx.lineTo(cx + s * 0.65, cy + s * 0.45); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + s * 0.38, cy - s * 0.28, s * 0.1, 0, 7); ctx.fill(); break;
    case "video":
      rr(ctx, cx - s * 0.82, cy - s * 0.58, s * 1.64, s * 1.16, s * 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.18, cy - s * 0.3); ctx.lineTo(cx + s * 0.34, cy); ctx.lineTo(cx - s * 0.18, cy + s * 0.3); ctx.closePath(); ctx.fill(); break;
    case "logo": // ảnh đại diện + máy ảnh
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.2, s * 0.34, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.95, s * 0.8, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.86, 0, 7); ctx.stroke(); break;
    case "name": // thẻ tên + bút
      rr(ctx, cx - s * 0.85, cy - s * 0.52, s * 1.7, s * 1.04, s * 0.16); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - s * 0.42, cy - s * 0.1, s * 0.16, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.62, cy + s * 0.32); ctx.quadraticCurveTo(cx - s * 0.42, cy + s * 0.06, cx - s * 0.22, cy + s * 0.32); ctx.stroke();
      for (const [a, b, dy] of [[0.0, 0.58, -0.18], [0.0, 0.42, 0.06], [0.0, 0.5, 0.3]]) { ctx.beginPath(); ctx.moveTo(cx + s * a, cy + s * dy); ctx.lineTo(cx + s * b, cy + s * dy); ctx.stroke(); } break;
    case "check": ctx.beginPath(); ctx.moveTo(cx - s * 0.6, cy + s * 0.02); ctx.lineTo(cx - s * 0.14, cy + s * 0.5); ctx.lineTo(cx + s * 0.7, cy - s * 0.46); ctx.stroke(); break;
    case "cross": ctx.beginPath(); ctx.moveTo(cx - s * 0.5, cy - s * 0.5); ctx.lineTo(cx + s * 0.5, cy + s * 0.5); ctx.moveTo(cx + s * 0.5, cy - s * 0.5); ctx.lineTo(cx - s * 0.5, cy + s * 0.5); ctx.stroke(); break;
    case "clock": ctx.beginPath(); ctx.arc(cx, cy, s * 0.78, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.42); ctx.lineTo(cx, cy); ctx.lineTo(cx + s * 0.32, cy + s * 0.2); ctx.stroke(); break;
    case "lock": rr(ctx, cx - s * 0.55, cy - s * 0.1, s * 1.1, s * 0.82, s * 0.14); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy - s * 0.12, s * 0.34, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy + s * 0.3, s * 0.08, 0, 7); ctx.fill(); break;
    case "warn": ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.74); ctx.lineTo(cx + s * 0.82, cy + s * 0.6); ctx.lineTo(cx - s * 0.82, cy + s * 0.6); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.2); ctx.lineTo(cx, cy + s * 0.2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy + s * 0.42, s * 0.07, 0, 7); ctx.fill(); break;
    case "spinner": for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.globalAlpha = 0.18 + (i / 8) * 0.82; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * s * 0.4, cy + Math.sin(a) * s * 0.4); ctx.lineTo(cx + Math.cos(a) * s * 0.78, cy + Math.sin(a) * s * 0.78); ctx.stroke(); } break;
    case "cog": ctx.beginPath(); ctx.arc(cx, cy, s * 0.32, 0, 7); ctx.stroke(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * s * 0.52, cy + Math.sin(a) * s * 0.52); ctx.lineTo(cx + Math.cos(a) * s * 0.8, cy + Math.sin(a) * s * 0.8); ctx.stroke(); } break;
    case "upload": ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.5); ctx.lineTo(cx, cy - s * 0.5); ctx.moveTo(cx - s * 0.42, cy - s * 0.1); ctx.lineTo(cx, cy - s * 0.55); ctx.lineTo(cx + s * 0.42, cy - s * 0.1); ctx.moveTo(cx - s * 0.7, cy + s * 0.75); ctx.lineTo(cx + s * 0.7, cy + s * 0.75); ctx.stroke(); break;
    case "text": for (const [a, dy] of [[0.7, -0.45], [0.7, -0.1], [0.45, 0.25]]) { ctx.beginPath(); ctx.moveTo(cx - s * 0.7, cy + s * dy); ctx.lineTo(cx - s * 0.7 + s * a * 2, cy + s * dy); ctx.stroke(); } break;
    default: break;
  }
  ctx.restore();
}

function tile(ctx, name, x, y, size, color = C.blue) {
  rr(ctx, x, y, size, size, size * 0.28); ctx.fillStyle = grad(ctx, x, y, x + size, y + size, color, C.violet); ctx.fill();
  rr(ctx, x, y, size, size, size * 0.28); ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1.4; ctx.stroke();
  icon(ctx, name, x + size / 2, y + size / 2, size * 0.3, C.white);
}

function header(ctx, sub = "HỆ THỐNG ĐIỀU KHIỂN TÀI KHOẢN ZALO") {
  txt(ctx, "ACCOUNT CONTROL", W / 2, 118, { w: 800, size: 70, align: "center", spacing: 2 });
  const gw = 300; ctx.fillStyle = grad(ctx, W / 2 - gw / 2, 0, W / 2 + gw / 2, 0); rr(ctx, W / 2 - gw / 2, 138, gw, 5, 2.5); ctx.fill();
  txt(ctx, sub, W / 2, 182, { w: 600, size: 22, color: C.silver, align: "center", spacing: 3 });
}
function footer(ctx, y, note = `${getConfiguredBotName()}  •  ACCOUNT CONTROL SYSTEM`) {
  ctx.fillStyle = C.line; ctx.fillRect(PAD, y, W - PAD * 2, 1.5);
  txt(ctx, note, W / 2, y + 40, { w: 700, size: 19, color: C.dim, align: "center", spacing: 2 });
  return y + 70;
}
async function avatarImg(profile) {
  try {
    if (profile?.avatarBuffer) return await loadImage(profile.avatarBuffer);
    if (profile?.avatarUrl && /^https?:\/\//i.test(profile.avatarUrl)) return await loadImage(profile.avatarUrl);
  } catch { /* dùng chữ cái đầu */ }
  return null;
}
function drawAvatar(ctx, img, name, cx, cy, r) {
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
  if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  else { ctx.fillStyle = grad(ctx, cx - r, cy - r, cx + r, cy + r); ctx.fillRect(cx - r, cy - r, r * 2, r * 2); txt(ctx, (String(name || "?").trim()[0] || "?").toUpperCase(), cx, cy + r * 0.34, { w: 800, size: r, align: "center" }); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, 7); ctx.strokeStyle = grad(ctx, cx - r, cy - r, cx + r, cy + r, C.blueHi, C.violet); ctx.lineWidth = 3.5; ctx.stroke();
}
function chip(ctx, label, x, y, { color = C.blue, h = 40, size = 20, w: wFix } = {}) {
  ctx.save(); ctx.font = font(700, size); const w = wFix ?? ctx.measureText(label).width + 34; ctx.restore();
  rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = rgba(color, 0.18); ctx.fill(); rr(ctx, x, y, w, h, h / 2); ctx.strokeStyle = rgba(color, 0.7); ctx.lineWidth = 1.4; ctx.stroke();
  txt(ctx, label, x + w / 2, y + h / 2 + size * 0.35, { w: 700, size, color: color === C.blue ? C.blueHi : color, align: "center" });
  return w;
}

export const FEATURES = [
  { key: "nhatki", cmd: "nhatki", icon: "diary", title: "ĐĂNG NHẬT KÍ", desc: "Gửi video để đăng lên nhật kí Zalo của tài khoản bot" },
  { key: "baiviet", cmd: "baiviet", icon: "post", title: "ĐĂNG BÀI VIẾT", desc: "Gửi một ảnh rồi nhập caption để đăng bài viết" },
  { key: "video", cmd: "video", icon: "video", title: "ĐĂNG VIDEO ZALO", desc: "Gửi video rồi nhập caption để đăng lên Zalo" },
  { key: "logo", cmd: "logo", icon: "logo", title: "ĐỔI LOGO", desc: "Gửi ảnh mới để đổi ảnh đại diện tài khoản Zalo" },
  { key: "ten", cmd: "ten", icon: "name", title: "ĐỔI TÊN ACC ZALO", desc: "Nhập tên mới để đổi tên hiển thị tài khoản" },
];

/** Bảng điều khiển chính. data = { profile:{name,uid,avatarUrl|avatarBuffer}, connected:true|false|null, support:{nhatki:bool,...}, prefix, activeFeature } */
export async function renderMain(data = {}) {
  const { profile = {}, connected = null, support = {}, prefix = ".", activeFeature = null } = data;
  const img = await avatarImg(profile);
  const H = 1470;
  const { canvas, ctx } = canvasOf(H);
  background(ctx, H); header(ctx);

  // thẻ tài khoản
  glass(ctx, PAD, 224, W - PAD * 2, 170, { r: 34, a: 0.45 });
  drawAvatar(ctx, img, profile.name, PAD + 100, 309, 56);
  txt(ctx, profile.name || "Không rõ tên", PAD + 190, 292, { w: 800, size: 38, maxW: 440 });
  txt(ctx, `UID: ${profile.uid || "—"}`, PAD + 190, 332, { w: 400, size: 23, color: C.silver, maxW: 440 });
  const st = connected === true ? { t: "ĐÃ KẾT NỐI", c: C.ok } : connected === false ? { t: "MẤT KẾT NỐI", c: C.bad } : { t: "CHƯA XÁC MINH", c: C.warn };
  const cw = 250, cx0 = W - PAD - cw - 26;
  rr(ctx, cx0, 276, cw, 64, 32); ctx.fillStyle = rgba(st.c, 0.14); ctx.fill(); rr(ctx, cx0, 276, cw, 64, 32); ctx.strokeStyle = rgba(st.c, 0.75); ctx.lineWidth = 1.6; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx0 + 34, 308, 8, 0, 7); ctx.fillStyle = st.c; ctx.shadowColor = st.c; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
  txt(ctx, st.t, cx0 + 56, 316, { w: 800, size: 22, color: st.c });

  txt(ctx, "CHỨC NĂNG", PAD + 6, 442, { w: 800, size: 22, color: C.silver, spacing: 3 });
  // 5 thẻ chức năng: lưới 2 cột, thẻ thứ 5 rộng
  const gap = 24, cwid = (W - PAD * 2 - gap) / 2, ch = 232;
  FEATURES.forEach((f, i) => {
    const wide = i === 4, x = wide ? PAD : PAD + (i % 2) * (cwid + gap), y = 462 + Math.floor(i / 2) * (ch + gap), w = wide ? W - PAD * 2 : cwid, h = wide ? 190 : ch;
    const on = activeFeature === f.key;
    glass(ctx, x, y, w, h, { r: 30, a: on ? 0.95 : 0.4, tint: on ? C.blueHi : C.blue });
    tile(ctx, f.icon, x + 26, y + 26, 84);
    const ok = support[f.key] !== false;
    const bw = ok ? 124 : 150;
    if (wide) {
      txt(ctx, f.title, x + 134, y + 62, { w: 800, size: 32, maxW: w - 134 - bw - 50 });
      chip(ctx, `${prefix}setting ${f.cmd}`, x + 134, y + 82, { h: 40, size: 20 });
      txt(ctx, f.desc, x + 26, y + 160, { w: 400, size: 21, color: C.silver, maxW: w - 52 });
      chip(ctx, ok ? "SẴN SÀNG" : "CHƯA CÓ API", x + w - 24 - bw, y + 24, { color: ok ? C.ok : C.warn, h: 36, size: 17, w: bw });
    } else {
      chip(ctx, ok ? "SẴN SÀNG" : "CHƯA CÓ API", x + 126, y + 26, { color: ok ? C.ok : C.warn, h: 34, size: 16, w: bw });
      chip(ctx, `${prefix}setting ${f.cmd}`, x + 126, y + 72, { h: 38, size: 19 });
      txt(ctx, f.title, x + 26, y + 148, { w: 800, size: 28, maxW: w - 52 });
      wrap(ctx, f.desc, w - 52, 400, 19).slice(0, 2).forEach((l, k) => txt(ctx, l, x + 26, y + 182 + k * 26, { w: 400, size: 19, color: C.silver, maxW: w - 52 }));
    }
  });
  // hướng dẫn
  const gy = 462 + 2 * (ch + gap) + 190 + 30;
  glass(ctx, PAD, gy, W - PAD * 2, 150, { r: 30, a: 0.5 });
  icon(ctx, "cog", PAD + 66, gy + 75, 30, C.blueHi, 3);
  txt(ctx, "Chọn chức năng bằng lệnh tương ứng bên dưới", PAD + 120, gy + 62, { w: 800, size: 27, maxW: W - PAD * 2 - 150 });
  txt(ctx, `${prefix}setting huy: hủy thao tác  •  ${prefix}setting help: xem lại bảng này`, PAD + 120, gy + 102, { w: 400, size: 21, color: C.silver, maxW: W - PAD * 2 - 150 });
  txt(ctx, "Chỉ OWNER / ADMIN mới được sử dụng", PAD + 120, gy + 132, { w: 600, size: 19, color: C.warn, maxW: W - PAD * 2 - 150 });
  footer(ctx, gy + 176);
  return canvas.toBuffer("image/png");
}

// ---------------------------------------------------------------------
//  Thẻ trạng thái: chờ dữ liệu / đang xử lý / thành công / thất bại / chưa hỗ trợ / hết hạn / đã hủy / không đủ quyền
// ---------------------------------------------------------------------
const KIND = {
  wait: { c: C.blue, i: "upload", t: "ĐANG CHỜ DỮ LIỆU" },
  processing: { c: C.blueHi, i: "spinner", t: "ĐANG XỬ LÝ YÊU CẦU" },
  success: { c: C.ok, i: "check", t: "THAO TÁC THÀNH CÔNG" },
  fail: { c: C.bad, i: "cross", t: "THAO TÁC THẤT BẠI" },
  unsupported: { c: C.warn, i: "warn", t: "CHỨC NĂNG CHƯA ĐƯỢC HỖ TRỢ" },
  expired: { c: C.warn, i: "clock", t: "PHIÊN ĐÃ HẾT HẠN" },
  cancelled: { c: C.silver, i: "cross", t: "PHIÊN ĐÃ BỊ HỦY" },
  denied: { c: C.bad, i: "lock", t: "KHÔNG ĐỦ QUYỀN SỬ DỤNG" },
  busy: { c: C.warn, i: "spinner", t: "ĐANG CÓ THAO TÁC KHÁC" },
};
export const STATE_KINDS = Object.keys(KIND);

function stepper(ctx, y, step) {
  const { index = 1, total = 1, label = "" } = step;
  const w = W - PAD * 2, gap = 12, segW = (w - gap * (total - 1)) / total;
  for (let i = 0; i < total; i++) {
    rr(ctx, PAD + i * (segW + gap), y, segW, 10, 5);
    ctx.fillStyle = i < index ? grad(ctx, PAD, 0, PAD + w, 0) : "rgba(148,163,184,0.18)"; ctx.fill();
  }
  txt(ctx, `BƯỚC ${index}/${total}${label ? "  •  " + label : ""}`, PAD, y + 40, { w: 700, size: 20, color: C.silver, spacing: 2 });
  return y + 62;
}
function mmss(sec) { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

export async function renderState(d = {}) {
  const { kind = "wait", title, subtitle, lines = [], rows = [], chips = [], step, expireSec, icon: iconName, preview, prefix = ".", sub } = d;
  const K = KIND[kind] || KIND.wait;
  const color = K.c;
  let previewImg = null;
  if (preview) { try { previewImg = await loadImage(preview); } catch { previewImg = null; } }
  const draw = (H, sc) => {
    const { canvas, ctx } = canvasOf(H, sc);
    background(ctx, H); header(ctx, sub);
    let y = 222;
    if (step) y = stepper(ctx, y, step) + 20;
    // biểu tượng lớn
    const cy = y + 84;
    glow(ctx, W / 2, cy, 210, color, 0.28);
    for (const [k, a] of [[1.55, 0.16], [1.28, 0.3]]) { ctx.beginPath(); ctx.arc(W / 2, cy, 66 * k, 0, 7); ctx.strokeStyle = rgba(color, a); ctx.lineWidth = 2; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(W / 2, cy, 66, 0, 7); ctx.fillStyle = rgba(color, 0.16); ctx.fill(); ctx.beginPath(); ctx.arc(W / 2, cy, 66, 0, 7); ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke();
    icon(ctx, iconName || K.i, W / 2, cy, 34, C.white, 7);
    y = cy + 66 + 54;
    const tl = wrap(ctx, title || K.t, W - 130, 800, 44).slice(0, 2);
    tl.forEach((l, i) => txt(ctx, l, W / 2, y + i * 54, { w: 800, size: 44, align: "center", maxW: W - 90 }));
    y += (tl.length - 1) * 54 + 18;
    if (subtitle) { const sl = wrap(ctx, subtitle, W - 170, 400, 25).slice(0, 3); sl.forEach((l, i) => txt(ctx, l, W / 2, y + 22 + i * 34, { w: 400, size: 25, color: C.silver, align: "center" })); y += sl.length * 34 + 12; }
    y += 18;
    if (previewImg) {
      const maxW = 360, maxH = 230, sc = Math.min(maxW / previewImg.width, maxH / previewImg.height, 1), pw = previewImg.width * sc, ph = previewImg.height * sc, px = (W - pw) / 2;
      ctx.save(); rr(ctx, px, y, pw, ph, 20); ctx.clip(); ctx.drawImage(previewImg, px, y, pw, ph); ctx.restore();
      rr(ctx, px, y, pw, ph, 20); ctx.strokeStyle = rgba(C.blueHi, 0.7); ctx.lineWidth = 2.5; ctx.stroke();
      y += ph + 28;
    }
    if (lines.length) {
      const inW = W - PAD * 2 - 90, items = lines.map((raw) => { const b = /^[•\-]\s+/.test(raw); return { b, wl: wrap(ctx, raw.replace(/^[•\-]\s+/, ""), inW - (b ? 34 : 0), 400, 25) }; });
      const n = items.reduce((a, b) => a + b.wl.length, 0), h = 50 + n * 38 + (items.length - 1) * 10;
      glass(ctx, PAD, y, W - PAD * 2, h, { r: 28, tint: color, a: 0.4 });
      let ty = y + 46;
      for (const it of items) { if (it.b) { ctx.beginPath(); ctx.arc(PAD + 52, ty - 9, 5, 0, 7); ctx.fillStyle = color; ctx.fill(); } for (const l of it.wl) { txt(ctx, l, PAD + 44 + (it.b ? 34 : 0), ty, { w: 400, size: 25, color: "#E2E8F0" }); ty += 38; } ty += 10; }
      y += h + 24;
    }
    if (rows.length) {
      const rh = 70, h = rows.length * rh + 16;
      glass(ctx, PAD, y, W - PAD * 2, h, { r: 28, tint: color, a: 0.4 });
      rows.forEach((r, i) => { const ry = y + 8 + i * rh + rh / 2 + 9; txt(ctx, r.l, PAD + 34, ry, { w: 400, size: 23, color: C.silver, maxW: 300 }); txt(ctx, r.v, W - PAD - 34, ry, { w: 700, size: 25, align: "right", maxW: W - PAD * 2 - 400, color: r.color || C.white }); if (i < rows.length - 1) { ctx.fillStyle = C.line; ctx.fillRect(PAD + 26, y + 8 + (i + 1) * rh, W - PAD * 2 - 52, 1.5); } });
      y += h + 24;
    }
    if (chips.length) {
      chips.forEach((c, i) => {
        const cyy = y + i * 70; glass(ctx, PAD, cyy, W - PAD * 2, 58, { r: 22, a: 0.35 });
        ctx.save(); ctx.font = font(700, 23); const kw = Math.min(360, ctx.measureText(c.k).width + 40); ctx.restore();
        rr(ctx, PAD + 14, cyy + 9, kw, 40, 12); ctx.fillStyle = rgba(C.blue, 0.22); ctx.fill(); rr(ctx, PAD + 14, cyy + 9, kw, 40, 12); ctx.strokeStyle = rgba(C.blueHi, 0.8); ctx.lineWidth = 1.4; ctx.stroke();
        txt(ctx, c.k, PAD + 14 + kw / 2, cyy + 37, { w: 700, size: 23, align: "center", color: C.blueHi, maxW: kw - 16 });
        txt(ctx, `→  ${c.d}`, PAD + 14 + kw + 20, cyy + 37, { w: 400, size: 23, color: "#E2E8F0", maxW: W - PAD * 2 - kw - 70 });
      });
      y += chips.length * 70 + 6;
    }
    if (expireSec != null) {
      const w = 330, x = (W - w) / 2; rr(ctx, x, y, w, 50, 25); ctx.fillStyle = "rgba(148,163,184,0.1)"; ctx.fill(); rr(ctx, x, y, w, 50, 25); ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke();
      icon(ctx, "clock", x + 36, y + 25, 12, C.silver, 2.4); txt(ctx, `Hết hạn sau ${mmss(expireSec)}`, x + 66, y + 33, { w: 600, size: 21, color: C.silver });
      y += 76;
    }
    const end = footer(ctx, y + 6);
    return { canvas, end };
  };
  const probe = draw(3600, 0.1); // lượt đo chiều cao: canvas rất nhỏ, tiết kiệm bộ nhớ
  const H = Math.max(640, Math.ceil(probe.end + 20));
  return draw(H, SCALE).canvas.toBuffer("image/png");
}
