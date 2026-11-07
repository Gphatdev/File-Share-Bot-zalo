/**
 * LIMIT PRO canvas — HNNP STUDIO (nền xanh đen, viền neon cyan)
 *  renderPanel       : bảng điều khiển chính
 *  renderGroupDetail : chi tiết 1 tổ hợp (có phân trang)
 *  renderBlockList   : danh sách lệnh BLOCK riêng (có phân trang)
 * Mọi số liệu truyền vào từ dữ liệu runtime — file này không chứa số cố định.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, registerFont } from "canvas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(__dirname, "..", "..", "MEDIA", "fonts");
const FONT = "LimitUI";
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  fontsReady = true;
  for (const [f, w] of [["BeVietnamPro_800ExtraBold.ttf", "800"], ["BeVietnamPro_700Bold.ttf", "bold"], ["BeVietnamPro_600SemiBold.ttf", "600"], ["BeVietnamPro_400Regular.ttf", "normal"]]) {
    const p = path.join(fontDir, f);
    if (fs.existsSync(p)) { try { registerFont(p, { family: FONT, weight: w }); } catch { /* đã đăng ký */ } }
  }
}
const FAM = `"${FONT}", "Be Vietnam Pro", "Segoe UI", Arial, sans-serif`;

const C = {
  bg0: "#050a16", bg1: "#08142a", cyan: "#22d3ee", cyanSoft: "rgba(34,211,238,0.16)", text: "#e8f1ff", muted: "#8aa0c0", dim: "#546a8c",
  green: "#34d399", red: "#fb5a6e", yellow: "#fbbf24", panel: "rgba(12,24,48,0.82)",
};
const W = 1080;
export const PER_PAGE_GROUP = 24;
export const PER_PAGE_BLOCK = 12;

function rr(ctx, x, y, w, h, r) {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + R, y); ctx.arcTo(x + w, y, x + w, y + h, R); ctx.arcTo(x + w, y + h, x, y + h, R);
  ctx.arcTo(x, y + h, x, y, R); ctx.arcTo(x, y, x + w, y, R); ctx.closePath();
}
function font(ctx, size, weight = "normal") { ctx.font = `${weight} ${size}px ${FAM}`; }
function fit(ctx, text, maxW) {
  let t = String(text ?? "");
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
function txt(ctx, s, x, y, { size = 20, weight = "normal", color = C.text, align = "left", max = null, glow = null } = {}) {
  font(ctx, size, weight); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  const t = max ? fit(ctx, s, max) : String(s ?? "");
  if (glow) { ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = 14; ctx.fillText(t, x, y); ctx.restore(); }
  ctx.fillText(t, x, y);
}
function glass(ctx, x, y, w, h, { accent = C.cyan, r = 18, glow = 10, fill = C.panel } = {}) {
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  ctx.shadowColor = accent; ctx.shadowBlur = glow; ctx.strokeStyle = accent; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
}
function pill(ctx, label, x, y, h, color, { size = 16, padX = 16, align = "left", solid = false } = {}) {
  font(ctx, size, "800"); const w = ctx.measureText(label).width + padX * 2;
  const x0 = align === "right" ? x - w : x;
  ctx.save(); rr(ctx, x0, y, w, h, h / 2);
  ctx.fillStyle = solid ? color : "rgba(255,255,255,0.05)"; ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  txt(ctx, label, x0 + w / 2, y + h / 2 + size * 0.36, { size, weight: "800", color: solid ? "#04101f" : color, align: "center" });
  return w;
}
function lockIcon(ctx, cx, cy, s, color, open = false) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2, s * 0.12);
  rr(ctx, cx - s / 2, cy - s * 0.1, s, s * 0.7, s * 0.12); ctx.fill();
  ctx.beginPath();
  if (open) { ctx.arc(cx + s * 0.18, cy - s * 0.1, s * 0.3, Math.PI, 0); ctx.lineTo(cx + s * 0.48, cy - s * 0.35); }
  else ctx.arc(cx, cy - s * 0.1, s * 0.3, Math.PI, 0);
  ctx.stroke(); ctx.restore();
}
function scene(h) {
  ensureFonts();
  const canvas = createCanvas(W, h); const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, W, h); g.addColorStop(0, C.bg0); g.addColorStop(1, C.bg1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, h);
  // lưới mờ + vầng sáng góc
  ctx.strokeStyle = "rgba(34,211,238,0.045)"; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const r1 = ctx.createRadialGradient(W, 0, 10, W, 0, 520); r1.addColorStop(0, "rgba(34,211,238,0.20)"); r1.addColorStop(1, "rgba(34,211,238,0)");
  ctx.fillStyle = r1; ctx.fillRect(0, 0, W, h);
  ctx.strokeStyle = "rgba(34,211,238,0.5)"; ctx.lineWidth = 2; rr(ctx, 10, 10, W - 20, h - 20, 22); ctx.stroke();
  return { canvas, ctx, h };
}
function header(ctx, title, sub, right) {
  txt(ctx, title, 44, 78, { size: 46, weight: "800", glow: C.cyan });
  txt(ctx, sub, 46, 112, { size: 19, color: C.muted, max: 700 });
  if (right) right();
  ctx.strokeStyle = C.cyan; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.moveTo(44, 132); ctx.lineTo(W - 44, 132); ctx.stroke(); ctx.globalAlpha = 1;
}
function footer(ctx, h, line) {
  txt(ctx, line, W / 2, h - 28, { size: 15, color: C.dim, align: "center", max: W - 80 });
}
const png = (c) => c.canvas.toBuffer("image/png");
const statusPill = (ctx, enabled) => pill(ctx, enabled ? "ĐANG BẬT" : "ĐANG TẮT", W - 44, 52, 40, enabled ? C.green : C.red, { size: 19, padX: 22, align: "right", solid: true });

/** @param {{enabled:boolean, groups:string[], blocked:string[], categories:{id,label,color,count}[], totalCommands:number, unclassified:number, prefix:string, threadName?:string}} d */
export function renderPanel(d) {
  const rowH = 106, cols = 2, rows = Math.ceil(d.categories.length / cols);
  const h = 132 + 180 + rows * (rowH + 12) + 280;
  const s = scene(h); const { ctx } = s;
  header(ctx, "LIMIT PRO", d.threadName ? `Nhóm: ${d.threadName}` : "Quản lý quyền dùng lệnh theo nhóm chat", () => statusPill(ctx, d.enabled));
  // 4 thẻ thống kê
  const stats = [
    ["TỔ HỢP", d.categories.length, C.cyan],
    ["NHÓM BỊ KHÓA", d.groups.length, d.groups.length ? C.red : C.green],
    ["LỆNH BỊ BLOCK", d.blocked.length, d.blocked.length ? C.yellow : C.green],
    ["LỆNH PHÁT HIỆN", d.totalCommands, C.cyan],
  ];
  const cw = (W - 88 - 3 * 16) / 4;
  stats.forEach(([label, val, col], i) => {
    const x = 44 + i * (cw + 16), y = 156;
    glass(ctx, x, y, cw, 128, { accent: col, glow: 8 });
    txt(ctx, String(val), x + cw / 2, y + 74, { size: 52, weight: "800", color: col, align: "center", glow: col });
    txt(ctx, label, x + cw / 2, y + 108, { size: 15, weight: "800", color: C.muted, align: "center" });
  });
  // lưới 10 tổ hợp
  const gw = (W - 88 - 16) / 2;
  d.categories.forEach((c, i) => {
    const x = 44 + (i % cols) * (gw + 16), y = 312 + Math.floor(i / cols) * (rowH + 12);
    const locked = d.groups.includes(c.id);
    glass(ctx, x, y, gw, rowH, { accent: locked ? C.red : C.cyan, glow: locked ? 12 : 4, r: 16 });
    ctx.fillStyle = c.color; rr(ctx, x + 14, y + 16, 6, rowH - 32, 3); ctx.fill();
    txt(ctx, `${i + 1}.  ${c.label}`, x + 34, y + 32, { size: 22, weight: "800", max: gw - 220 });
    txt(ctx, `${c.count} lệnh · ${c.id}`, x + 34, y + 58, { size: 15, color: C.muted, max: gw - 220 });
    const names = Array.isArray(c.preview) ? c.preview : [];
    const shown = names.slice(0, 7).join("  ·  ") + (names.length > 7 ? `  +${names.length - 7}` : "");
    txt(ctx, shown || "(chưa có lệnh)", x + 34, y + 88, { size: 14, color: C.cyan, max: gw - 56 });
    lockIcon(ctx, x + gw - 128, y + 36, 22, locked ? C.red : C.green, !locked);
    pill(ctx, locked ? "KHÓA" : "MỞ", x + gw - 18, y + 16, 34, locked ? C.red : C.green, { size: 16, padX: 16, align: "right", solid: locked });
  });
  // hướng dẫn
  const gy = 312 + rows * (rowH + 12) + 6;
  glass(ctx, 44, gy, W - 88, 200, { accent: C.cyan, glow: 6 });
  txt(ctx, "CÚ PHÁP", 68, gy + 36, { size: 16, weight: "800", color: C.cyan });
  const p = d.prefix || ".";
  const lines = [
    [`${p}limit on | off`, "bật / tắt hệ thống"],
    [`${p}limit add | del <nhóm>`, "khóa / mở khóa tổ hợp"],
    [`${p}limit list <nhóm> [trang]`, "xem lệnh của tổ hợp"],
    [`${p}limit block | unblock <lệnh>`, "chặn / gỡ chặn từng lệnh"],
    [`${p}limit blocklist [trang]`, "danh sách lệnh bị BLOCK"],
    [`${p}limit clear | clearblock`, "xóa khóa nhóm / xóa BLOCK"],
  ];
  lines.forEach(([a, b], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 68 + col * ((W - 136) / 2), y = gy + 72 + row * 42;
    txt(ctx, a, x, y, { size: 18, weight: "800", max: 270 });
    txt(ctx, b, x, y + 20, { size: 14, color: C.muted, max: 450 });
  });
  const note = d.unclassified ? `${d.unclassified} lệnh chưa phân loại — không bị khóa theo nhóm` : "Admin nhóm / bot admin / owner luôn được miễn trừ";
  footer(ctx, h, note);
  return png(s);
}

/** @param {{cat:{id,label,color,desc}, commands:string[], blocked:string[], locked:boolean, enabled:boolean, page:number, prefix:string}} d */
export function renderGroupDetail(d) {
  const pages = Math.max(1, Math.ceil(d.commands.length / PER_PAGE_GROUP));
  const page = Math.min(Math.max(1, d.page || 1), pages);
  const slice = d.commands.slice((page - 1) * PER_PAGE_GROUP, page * PER_PAGE_GROUP);
  const cols = 3, rows = Math.max(1, Math.ceil(slice.length / cols));
  const h = 132 + 150 + rows * 62 + 190;
  const s = scene(h); const { ctx } = s;
  header(ctx, d.cat.label, d.cat.desc, () => statusPill(ctx, d.enabled));
  const cw = (W - 88 - 2 * 16) / 3;
  const info = [
    ["TRẠNG THÁI NHÓM", d.locked ? "ĐANG KHÓA" : "ĐANG MỞ", d.locked ? C.red : C.green],
    ["TỔNG SỐ LỆNH", String(d.commands.length), d.cat.color],
    ["BLOCK RIÊNG", String(d.commands.filter((c) => d.blocked.includes(c)).length), C.yellow],
  ];
  info.forEach(([l, v, col], i) => {
    const x = 44 + i * (cw + 16);
    glass(ctx, x, 154, cw, 100, { accent: col, glow: 8 });
    txt(ctx, v, x + cw / 2, 206, { size: 34, weight: "800", color: col, align: "center", glow: col });
    txt(ctx, l, x + cw / 2, 238, { size: 14, weight: "800", color: C.muted, align: "center" });
  });
  if (!slice.length) txt(ctx, "Chưa có lệnh nào thuộc tổ hợp này.", W / 2, 330, { size: 22, color: C.muted, align: "center" });
  slice.forEach((name, i) => {
    const x = 44 + (i % cols) * (cw + 16), y = 280 + Math.floor(i / cols) * 62;
    const b = d.blocked.includes(name);
    glass(ctx, x, y, cw, 50, { accent: b ? C.yellow : C.cyan, glow: 3, r: 12 });
    ctx.fillStyle = b ? C.yellow : d.cat.color; rr(ctx, x + 8, y + 12, 4, 26, 2); ctx.fill();
    txt(ctx, name, x + 24, y + 33, { size: 21, weight: "800", max: cw - (b ? 110 : 30), color: b ? C.yellow : C.text });
    if (b) pill(ctx, "BLOCK", x + cw - 10, y + 10, 30, C.yellow, { size: 13, padX: 10, align: "right", solid: true });
  });
  const gy = 280 + rows * 62 + 8, p = d.prefix || ".";
  glass(ctx, 44, gy, W - 88, 110, { accent: C.cyan, glow: 5 });
  txt(ctx, d.locked ? `Mở khóa:  ${p}limit del ${d.cat.id}` : `Khóa nhóm:  ${p}limit add ${d.cat.id}`, 68, gy + 40, { size: 20, weight: "800" });
  txt(ctx, `Chặn riêng 1 lệnh:  ${p}limit block <lệnh>   ·   Gỡ:  ${p}limit unblock <lệnh>`, 68, gy + 72, { size: 16, color: C.muted, max: W - 140 });
  if (pages > 1) txt(ctx, `Xem trang khác:  ${p}limit list ${d.cat.id} <số trang>`, 68, gy + 95, { size: 15, color: C.dim, max: W - 140 });
  footer(ctx, h, `Trang ${page}/${pages}  ·  khóa nhóm và BLOCK lệnh hoạt động độc lập`);
  return png(s);
}

/** @param {{items:{name:string,catLabel:string,catColor:string,groupLocked:boolean}[], enabled:boolean, page:number, prefix:string}} d */
export function renderBlockList(d) {
  const pages = Math.max(1, Math.ceil(d.items.length / PER_PAGE_BLOCK));
  const page = Math.min(Math.max(1, d.page || 1), pages);
  const slice = d.items.slice((page - 1) * PER_PAGE_BLOCK, page * PER_PAGE_BLOCK);
  const empty = !d.items.length;
  const h = empty ? 700 : 132 + 140 + slice.length * 78 + 190;
  const s = scene(h); const { ctx } = s;
  header(ctx, "BLOCKED COMMANDS", "Lệnh bị chặn riêng trong nhóm chat này", () => statusPill(ctx, d.enabled));
  const p = d.prefix || ".";
  if (empty) {
    glass(ctx, 44, 170, W - 88, 330, { accent: C.green, glow: 10 });
    lockIcon(ctx, W / 2, 290, 70, C.green, true);
    txt(ctx, "KHÔNG CÓ LỆNH NÀO BỊ BLOCK", W / 2, 400, { size: 30, weight: "800", color: C.green, align: "center" });
    txt(ctx, "Danh sách trống — đây không phải lỗi hệ thống.", W / 2, 440, { size: 18, color: C.muted, align: "center" });
    txt(ctx, `Chặn một lệnh:  ${p}limit block <tên lệnh>`, W / 2, 560, { size: 20, weight: "800", align: "center" });
    txt(ctx, `Gỡ chặn:  ${p}limit unblock <tên lệnh>`, W / 2, 596, { size: 18, color: C.muted, align: "center" });
    footer(ctx, h, "BLOCK chỉ có hiệu lực khi LIMIT đang BẬT · cấu hình được lưu theo từng nhóm");
    return png(s);
  }
  glass(ctx, 44, 154, W - 88, 84, { accent: C.yellow, glow: 8 });
  txt(ctx, String(d.items.length), 90, 210, { size: 46, weight: "800", color: C.yellow, glow: C.yellow });
  txt(ctx, "LỆNH ĐANG BỊ BLOCK", 160, 196, { size: 18, weight: "800", color: C.muted });
  txt(ctx, d.enabled ? "Đang có hiệu lực với thành viên thường" : "LIMIT đang TẮT — chưa có hiệu lực, cấu hình vẫn được giữ", 160, 222, { size: 15, color: d.enabled ? C.green : C.red, max: 780 });
  slice.forEach((it, i) => {
    const y = 262 + i * 78;
    glass(ctx, 44, y, W - 88, 66, { accent: C.yellow, glow: 5, r: 14 });
    lockIcon(ctx, 84, y + 33, 24, C.yellow);
    txt(ctx, it.name, 124, y + 41, { size: 26, weight: "800", max: 300 });
    ctx.fillStyle = it.catColor; rr(ctx, 440, y + 22, 6, 22, 3); ctx.fill();
    txt(ctx, it.catLabel, 458, y + 40, { size: 18, weight: "bold", color: C.muted, max: 250 });
    pill(ctx, it.groupLocked ? "BLOCK + NHÓM KHÓA" : "BLOCK RIÊNG", W - 62, y + 16, 34, it.groupLocked ? C.red : C.yellow, { size: 14, padX: 14, align: "right", solid: it.groupLocked });
  });
  const gy = 262 + slice.length * 78 + 4;
  glass(ctx, 44, gy, W - 88, 100, { accent: C.cyan, glow: 5 });
  txt(ctx, `Chặn:  ${p}limit block <lệnh>      Gỡ chặn:  ${p}limit unblock <lệnh>`, 68, gy + 42, { size: 19, weight: "800", max: W - 140 });
  txt(ctx, pages > 1 ? `Trang khác:  ${p}limit blocklist <số trang>` : `Xóa toàn bộ BLOCK:  ${p}limit clearblock`, 68, gy + 74, { size: 16, color: C.muted, max: W - 140 });
  footer(ctx, h, `Trang ${page}/${pages}  ·  gỡ BLOCK không tự mở khóa tổ hợp chức năng`);
  return png(s);
}

// ───────────── thẻ thông báo / trạng thái / trợ giúp (mọi phản hồi đều là ảnh) ─────────────
const KIND = {
  ok: { color: C.green, tag: "THÀNH CÔNG", icon: "check" },
  lock: { color: C.red, tag: "ĐÃ KHÓA", icon: "lock" },
  unlock: { color: C.green, tag: "ĐÃ MỞ KHÓA", icon: "unlock" },
  block: { color: C.yellow, tag: "ĐÃ BLOCK", icon: "lock" },
  warn: { color: C.yellow, tag: "CẢNH BÁO", icon: "warn" },
  deny: { color: C.red, tag: "BỊ TỪ CHỐI", icon: "cross" },
  info: { color: C.cyan, tag: "THÔNG TIN", icon: "info" },
};
function badge(ctx, cx, cy, r, kind) {
  const k = KIND[kind] || KIND.info;
  ctx.save();
  ctx.fillStyle = "rgba(12,24,48,0.95)"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = k.color; ctx.shadowBlur = 24; ctx.strokeStyle = k.color; ctx.lineWidth = 5; ctx.stroke(); ctx.restore();
  ctx.save(); ctx.strokeStyle = k.color; ctx.fillStyle = k.color; ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (k.icon === "check") { ctx.beginPath(); ctx.moveTo(cx - r * 0.42, cy + 2); ctx.lineTo(cx - r * 0.1, cy + r * 0.32); ctx.lineTo(cx + r * 0.45, cy - r * 0.32); ctx.stroke(); }
  else if (k.icon === "cross") { ctx.beginPath(); ctx.moveTo(cx - r * 0.38, cy - r * 0.38); ctx.lineTo(cx + r * 0.38, cy + r * 0.38); ctx.moveTo(cx + r * 0.38, cy - r * 0.38); ctx.lineTo(cx - r * 0.38, cy + r * 0.38); ctx.stroke(); }
  else if (k.icon === "warn") { ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx + r * 0.5, cy + r * 0.38); ctx.lineTo(cx - r * 0.5, cy + r * 0.38); ctx.closePath(); ctx.lineWidth = 6; ctx.stroke(); ctx.fillRect(cx - 3, cy - r * 0.18, 6, r * 0.34); ctx.fillRect(cx - 3, cy + r * 0.22, 6, 6); }
  else if (k.icon === "info") { ctx.fillRect(cx - 4, cy - r * 0.05, 8, r * 0.5); ctx.beginPath(); ctx.arc(cx, cy - r * 0.32, 5.5, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.restore(); lockIcon(ctx, cx, cy - 2, r * 0.8, k.color, k.icon === "unlock"); return; }
  ctx.restore();
}
function wrap(ctx, text, maxW, size, weight = "normal") {
  font(ctx, size, weight);
  const out = [];
  for (const para of String(text ?? "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
function chipRows(ctx, chips, x0, y0, maxW) {
  let x = x0, y = y0;
  for (const c of chips) {
    font(ctx, 18, "800");
    const w = Math.min(maxW, ctx.measureText(c.text).width + 36);
    if (x + w > x0 + maxW) { x = x0; y += 48; }
    ctx.save(); rr(ctx, x, y, w, 38, 19);
    ctx.fillStyle = c.solid ? c.color : "rgba(255,255,255,0.05)"; ctx.fill(); ctx.strokeStyle = c.color; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    txt(ctx, c.text, x + w / 2, y + 26, { size: 18, weight: "800", color: c.solid ? "#04101f" : c.color, align: "center", max: w - 16 });
    x += w + 10;
  }
  return y + 38;
}
/**
 * Thẻ thông báo dùng cho MỌI phản hồi của limit.
 * @param {{kind:string,title:string,lines?:string[],chips?:{text:string,color:string,solid?:boolean}[],enabled:boolean,groups:number,blocked:number,prefix:string,hint?:string}} d
 */
export function renderNotice(d) {
  const k = KIND[d.kind] || KIND.info;
  const probe = scene(300).ctx;
  const body = (d.lines || []).flatMap((l) => wrap(probe, l, W - 200, 24));
  // đo trước số hàng chip
  let rows = 0;
  if (d.chips?.length) { let x = 0; rows = 1; for (const c of d.chips) { font(probe, 18, "800"); const w = probe.measureText(c.text).width + 36 + 10; if (x + w > W - 136) { x = 0; rows++; } x += w; } }
  const chipH = rows ? rows * 48 + 20 : 0;
  const h = 452 + body.length * 36 + (rows ? 8 + chipH : 0) + (d.hint ? 70 : 0) + 30 + 150;
  const s = scene(h); const { ctx } = s;
  header(ctx, "LIMIT PRO", "Quản lý quyền dùng lệnh theo nhóm chat", () => statusPill(ctx, d.enabled));
  glass(ctx, 44, 156, W - 88, h - 156 - 150, { accent: k.color, glow: 12 });
  badge(ctx, W / 2, 252, 58, d.kind);
  font(ctx, 15, "800"); const tw = ctx.measureText(k.tag).width + 36;
  pill(ctx, k.tag, W / 2 - tw / 2, 330, 32, k.color, { size: 15, padX: 18, solid: true });
  txt(ctx, d.title, W / 2, 402, { size: 34, weight: "800", align: "center", max: W - 160, glow: k.color });
  let y = 452;
  for (const l of body) { txt(ctx, l, W / 2, y, { size: 24, color: C.text, align: "center", max: W - 160 }); y += 36; }
  if (d.chips?.length) { y += 8; chipRows(ctx, d.chips, 68, y, W - 136); y += chipH; }
  if (d.hint) txt(ctx, d.hint, W / 2, y + 36, { size: 19, weight: "800", color: C.cyan, align: "center", max: W - 140 });
  // thanh số liệu runtime
  const sy = h - 130, cw = (W - 88 - 32) / 3;
  [["HỆ THỐNG", d.enabled ? "BẬT" : "TẮT", d.enabled ? C.green : C.red], ["NHÓM BỊ KHÓA", String(d.groups), d.groups ? C.red : C.green], ["LỆNH BỊ BLOCK", String(d.blocked), d.blocked ? C.yellow : C.green]].forEach(([l, v, col], i) => {
    const x = 44 + i * (cw + 16);
    glass(ctx, x, sy, cw, 84, { accent: col, glow: 5, r: 14 });
    txt(ctx, v, x + cw / 2, sy + 44, { size: 32, weight: "800", color: col, align: "center" });
    txt(ctx, l, x + cw / 2, sy + 70, { size: 13, weight: "800", color: C.muted, align: "center" });
  });
  footer(ctx, h, `Gõ ${d.prefix || "."}limit để mở bảng điều khiển  ·  Admin nhóm / owner luôn được miễn trừ`);
  return png(s);
}

/** Trạng thái chi tiết: nhóm đang khóa + lệnh bị BLOCK. @param {{enabled,locked:{label,color,count}[],blocked:string[],totalCommands:number,unclassified:number,prefix:string,categories:{label,color,locked:boolean,count:number}[]}} d */
export function renderStatus(d) {
  const blockedShown = d.blocked.slice(0, 40);
  let rows = 1; { const probe = scene(300).ctx; let x = 0; for (const n of blockedShown) { font(probe, 18, "800"); const w = probe.measureText(n).width + 46; if (x + w > W - 136) { x = 0; rows++; } x += w; } }
  const h = 132 + 150 + 56 + d.categories.length * 52 + 70 + rows * 48 + 70;
  const s = scene(h); const { ctx } = s;
  header(ctx, "LIMIT STATUS", "Trạng thái LIMIT PRO của nhóm chat này", () => statusPill(ctx, d.enabled));
  const cw = (W - 88 - 48) / 4;
  [["TỔ HỢP KHÓA", d.locked.length, d.locked.length ? C.red : C.green], ["LỆNH BLOCK", d.blocked.length, d.blocked.length ? C.yellow : C.green], ["LỆNH PHÁT HIỆN", d.totalCommands, C.cyan], ["CHƯA PHÂN LOẠI", d.unclassified, C.muted]].forEach(([l, v, col], i) => {
    const x = 44 + i * (cw + 16);
    glass(ctx, x, 154, cw, 110, { accent: col, glow: 8 });
    txt(ctx, String(v), x + cw / 2, 214, { size: 46, weight: "800", color: col, align: "center", glow: col });
    txt(ctx, l, x + cw / 2, 246, { size: 14, weight: "800", color: C.muted, align: "center" });
  });
  let y = 300;
  txt(ctx, "10 TỔ HỢP CHỨC NĂNG", 48, y, { size: 16, weight: "800", color: C.cyan });
  y += 16;
  d.categories.forEach((c) => {
    glass(ctx, 44, y, W - 88, 44, { accent: c.locked ? C.red : C.cyan, glow: c.locked ? 8 : 2, r: 12 });
    ctx.fillStyle = c.color; rr(ctx, 58, y + 10, 5, 24, 2); ctx.fill();
    txt(ctx, c.label, 78, y + 30, { size: 20, weight: "800", max: 520 });
    txt(ctx, `${c.count} lệnh`, 640, y + 30, { size: 16, color: C.muted });
    pill(ctx, c.locked ? "KHÓA" : "MỞ", W - 62, y + 6, 32, c.locked ? C.red : C.green, { size: 14, padX: 14, align: "right", solid: c.locked });
    y += 52;
  });
  y += 30;
  txt(ctx, "LỆNH BỊ BLOCK RIÊNG", 48, y, { size: 16, weight: "800", color: C.yellow });
  y += 14;
  if (!blockedShown.length) txt(ctx, "Không có lệnh nào bị BLOCK.", 68, y + 28, { size: 20, color: C.muted });
  else chipRows(ctx, blockedShown.map((n) => ({ text: n, color: C.yellow })), 44, y, W - 88);
  footer(ctx, h, d.blocked.length > blockedShown.length ? `Hiển thị ${blockedShown.length}/${d.blocked.length} lệnh BLOCK — gõ ${d.prefix}limit blocklist để xem đủ` : `Gõ ${d.prefix}limit để mở bảng điều khiển`);
  return png(s);
}

/** Bảng cú pháp (dùng cho limit help và khi gõ sai). @param {{prefix:string,enabled:boolean,note?:string}} d */
export function renderHelp(d) {
  const p = d.prefix || ".";
  const rows = [
    [`${p}limit`, "Mở bảng điều khiển", "mọi người"],
    [`${p}limit status`, "Trạng thái chi tiết", "mọi người"],
    [`${p}limit list <nhóm> [trang]`, "Xem lệnh của 1 tổ hợp", "mọi người"],
    [`${p}limit blocklist [trang]`, "Danh sách lệnh bị BLOCK", "mọi người"],
    [`${p}limit on | off`, "Bật / tắt hệ thống", "admin"],
    [`${p}limit add <nhóm>`, "Khóa 1 tổ hợp chức năng", "admin"],
    [`${p}limit del <nhóm>`, "Mở khóa 1 tổ hợp", "admin"],
    [`${p}limit clear`, "Mở khóa tất cả tổ hợp", "admin"],
    [`${p}limit block <lệnh>`, "Chặn riêng 1 lệnh (nhận cả alias)", "admin"],
    [`${p}limit unblock <lệnh>`, "Gỡ chặn 1 lệnh", "admin"],
    [`${p}limit clearblock`, "Gỡ toàn bộ BLOCK riêng", "admin"],
  ];
  const h = 132 + 70 + rows.length * 62 + (d.note ? 70 : 0) + 120;
  const s = scene(h); const { ctx } = s;
  header(ctx, "LIMIT HELP", "Bảng cú pháp LIMIT PRO", () => statusPill(ctx, d.enabled));
  let y = 160;
  if (d.note) { glass(ctx, 44, y, W - 88, 54, { accent: C.red, glow: 8, r: 14 }); txt(ctx, d.note, W / 2, y + 35, { size: 20, weight: "800", color: C.red, align: "center", max: W - 140 }); y += 70; }
  rows.forEach(([a, b, who]) => {
    const adm = who === "admin";
    glass(ctx, 44, y, W - 88, 52, { accent: adm ? C.yellow : C.cyan, glow: 3, r: 12 });
    txt(ctx, a, 66, y + 34, { size: 20, weight: "800", max: 380 });
    txt(ctx, b, 470, y + 34, { size: 17, color: C.muted, max: 380 });
    pill(ctx, adm ? "ADMIN" : "MỌI NGƯỜI", W - 62, y + 10, 32, adm ? C.yellow : C.green, { size: 13, padX: 14, align: "right" });
    y += 62;
  });
  txt(ctx, "<nhóm>: giaitri · admin · tinhdiem · anti · kinhte · ai · dapt · qlnhom · hethong · tienich (hoặc số 1-10)", W / 2, y + 28, { size: 16, color: C.cyan, align: "center", max: W - 100 });
  footer(ctx, h, "BLOCK và khóa nhóm hoạt động độc lập · admin nhóm / owner luôn được miễn trừ");
  return png(s);
}
