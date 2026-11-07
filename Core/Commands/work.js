/**
 * .work — Hệ thống nghề nghiệp (50 nghề, 5 nhóm, 8 cấp bậc).
 * File này chứa TOÀN BỘ phần vẽ Canvas (Celestial Glass UI) + xử lý lệnh.
 * Lõi nghiệp vụ nằm ở data/GIAITRI/WORK/engine.js.
 * Tiền → TienGame, EXP/cấp/hồ sơ → PlayerProfile (không có ví/EXP riêng).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, registerFont } from "canvas";
import { getEngine, WorkError, normName } from "./data/GIAITRI/WORK/engine.js";
import { getPlayerAvatarPath } from "./data/GIAITRI/PlayerProfile/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT = "WorkFont";
(function registerFonts() {
  const dir = path.join(__dirname, "data", "MEDIA", "fonts");
  if (!fs.existsSync(dir)) return;
  for (const [file, weight] of [
    ["BeVietnamPro_800ExtraBold.ttf", "800"],
    ["BeVietnamPro_700Bold.ttf", "bold"],
    ["BeVietnamPro_600SemiBold.ttf", "600"],
    ["BeVietnamPro_400Regular.ttf", "normal"],
  ]) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) {
      try {
        registerFont(p, { family: FONT, weight });
      } catch {
        /* bỏ qua */
      }
    }
  }
})();

// ════════════════════════════ CANVAS DESIGN SYSTEM (CELESTIAL GLASS UI) ════════════════════════════
const W = 960;
const T = {
  bg0: "#060914",
  bg1: "#0c1228",
  bg2: "#131b3a",
  panelTop: "rgba(255, 255, 255, 0.075)",
  panelBot: "rgba(255, 255, 255, 0.025)",
  panelDark: "rgba(6, 9, 20, 0.55)",
  line: "rgba(255, 255, 255, 0.11)",
  lineBright: "rgba(255, 255, 255, 0.24)",
  text: "#f8fafc",
  subText: "#cbd5e1",
  muted: "#8b9bb4",
  gold: "#fbbf24",
  goldLight: "#fde68a",
  green: "#34d399",
  red: "#fb7185",
  blue: "#38bdf8",
  purple: "#a855f7",
  cyan: "#22d3ee",
};

const GROUP_COLOR = {
  laodong: "#f97316",    // Cam rực rỡ
  dichvu: "#14b8a6",     // Ngọc lục bảo
  congnghe: "#38bdf8",   // Xanh điện tử
  sangtao: "#f43f5e",    // Hồng neon
  chuyenmon: "#a855f7",  // Tím hoàng gia
};

const fmt = (n) => `${Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}$`;
const num = (n) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const f = (w, s) => `${w} ${s}px ${FONT}`;

function hexA(hex, a) {
  const h = String(hex || "#a855f7").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rr(ctx, x, y, w, h, r) {
  const R = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + R, y);
  ctx.arcTo(x + w, y, x + w, y + h, R);
  ctx.arcTo(x + w, y + h, x, y + h, R);
  ctx.arcTo(x, y + h, x, y, R);
  ctx.arcTo(x, y, x + w, y, R);
  ctx.closePath();
}

function chamferRect(ctx, x, y, w, h, c = 12) {
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

function fit(ctx, textStr, maxW) {
  let t = String(textStr ?? "");
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

function wrap(ctx, textStr, maxW) {
  const words = String(textStr ?? "").split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function measureLines(textStr, maxW, font) {
  const c = createCanvas(10, 10).getContext("2d");
  c.font = font;
  return wrap(c, textStr, maxW);
}

function newCanvas(h, accent = T.purple) {
  const cv = createCanvas(W, h);
  const ctx = cv.getContext("2d");

  // 1. Nền vũ trụ sâu đa tầng
  const bgGrad = ctx.createLinearGradient(0, 0, W, h);
  bgGrad.addColorStop(0, T.bg0);
  bgGrad.addColorStop(0.45, T.bg1);
  bgGrad.addColorStop(1, T.bg2);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, h);

  // 2. Quầng sáng Ambient Orbs mềm mại
  const orb1 = ctx.createRadialGradient(W - 120, 60, 10, W - 120, 60, 480);
  orb1.addColorStop(0, hexA(accent, 0.26));
  orb1.addColorStop(0.5, hexA(accent, 0.08));
  orb1.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = orb1;
  ctx.fillRect(0, 0, W, h);

  const orb2 = ctx.createRadialGradient(100, h - 80, 10, 100, h - 80, 420);
  orb2.addColorStop(0, hexA(T.blue, 0.14));
  orb2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = orb2;
  ctx.fillRect(0, 0, W, h);

  // 3. Họa tiết chấm bi kiến trúc (Architectural Dot Matrix) ở góc trên
  ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
  for (let gx = W - 320; gx < W - 30; gx += 22) {
    for (let gy = 28; gy < 180; gy += 22) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Đường lưới mảnh tinh tế ở nền dưới
  ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
  ctx.lineWidth = 1;
  for (let y = 120; y < h; y += 80) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(W - 20, y);
    ctx.stroke();
  }

  // 5. Khung viền ngoài kép sang trọng
  rr(ctx, 10, 10, W - 20, h - 20, 28);
  const frameGrad = ctx.createLinearGradient(0, 0, W, h);
  frameGrad.addColorStop(0, hexA(accent, 0.65));
  frameGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.12)");
  frameGrad.addColorStop(1, hexA(accent, 0.35));
  ctx.strokeStyle = frameGrad;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Viền sáng nội tâm mỏng
  rr(ctx, 15, 15, W - 30, h - 30, 24);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Điểm nhấn góc (Corner Brackets)
  const drawCorner = (cx, cy, dx, dy) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx * 26, cy);
    ctx.lineTo(cx + dx * 8, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy + dy * 8);
    ctx.lineTo(cx, cy + dy * 26);
    ctx.strokeStyle = hexA(accent, 0.9);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
  };
  drawCorner(10, 10, 1, 1);
  drawCorner(W - 10, 10, -1, 1);
  drawCorner(10, h - 10, 1, -1);
  drawCorner(W - 10, h - 10, -1, -1);

  return { cv, ctx };
}

/**
 * Vẽ thẻ kính (Glassmorphism Card) với hiệu ứng phản quang cạnh trên và thanh ánh sáng tùy chọn.
 */
function panel(ctx, x, y, w, h, accent = null, r = 20, { leftBar = false, dark = false, glow = false } = {}) {
  ctx.save();
  if (glow && accent) {
    ctx.shadowColor = hexA(accent, 0.25);
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
  }

  rr(ctx, x, y, w, h, r);
  if (dark) {
    ctx.fillStyle = T.panelDark;
  } else {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, T.panelTop);
    g.addColorStop(1, T.panelBot);
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.restore();

  // Phản quang mềm góc thẻ nếu có màu chủ đạo
  if (accent && !dark) {
    ctx.save();
    rr(ctx, x, y, w, h, r);
    ctx.clip();
    const rg = ctx.createRadialGradient(x + 40, y + 20, 5, x + 40, y + 20, Math.max(w * 0.6, 180));
    rg.addColorStop(0, hexA(accent, 0.14));
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(x, y, w, h);

    if (leftBar) {
      const barG = ctx.createLinearGradient(x, y, x, y + h);
      barG.addColorStop(0, accent);
      barG.addColorStop(1, hexA(accent, 0.3));
      ctx.fillStyle = barG;
      ctx.fillRect(x, y, 6, h);
    }
    ctx.restore();
  }

  // Viền kính phản xạ ánh sáng từ trên xuống
  rr(ctx, x, y, w, h, r);
  const strokeG = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  if (accent) {
    strokeG.addColorStop(0, hexA(accent, 0.65));
    strokeG.addColorStop(0.5, "rgba(255, 255, 255, 0.14)");
    strokeG.addColorStop(1, hexA(accent, 0.2));
  } else {
    strokeG.addColorStop(0, "rgba(255, 255, 255, 0.22)");
    strokeG.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
    strokeG.addColorStop(1, "rgba(255, 255, 255, 0.04)");
  }
  ctx.strokeStyle = strokeG;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Đường bóng kính mảnh ở đỉnh thẻ (Top Specular Highlight)
  ctx.beginPath();
  ctx.moveTo(x + r, y + 1);
  ctx.lineTo(x + w - r, y + 1);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function text(ctx, s, x, y, { font = f("normal", 20), color = T.text, align = "left", max = null, shadow = false, glowColor = null } = {}) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  if (shadow || glowColor) {
    ctx.shadowColor = glowColor ? hexA(glowColor, 0.55) : "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = glowColor ? 12 : 6;
    ctx.shadowOffsetY = glowColor ? 0 : 2;
  }
  ctx.fillText(max ? fit(ctx, s, max) : String(s ?? ""), x, y);
  ctx.restore();
}

function bar(ctx, x, y, w, h, pct, color) {
  const r = h / 2;
  // Rãnh nền tối
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = "rgba(6, 9, 20, 0.65)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const p = Math.max(0, Math.min(1, Number(pct) || 0));
  if (p > 0) {
    const fillW = Math.max(h, w * p);
    ctx.save();
    rr(ctx, x, y, fillW, h, r);
    const g = ctx.createLinearGradient(x, y, x + fillW, y);
    g.addColorStop(0, hexA(color, 0.85));
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    ctx.shadowColor = hexA(color, 0.5);
    ctx.shadowBlur = 10;
    ctx.fill();

    // Bóng kính nửa trên thanh tiến độ
    ctx.clip();
    ctx.fillStyle = "rgba(255, 255, 255, 0.26)";
    ctx.fillRect(x, y, fillW, h * 0.42);
    ctx.restore();

    // Điểm sáng đầu thanh
    if (fillW > h) {
      ctx.beginPath();
      ctx.arc(x + fillW - r, y + r, Math.max(2, r - 2), 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  }
}

function chip(ctx, label, x, y, color, { h = 28, font = f("600", 13), pad = 14, align = "left", solid = false } = {}) {
  ctx.font = font;
  const textW = Math.ceil(ctx.measureText(label).width);
  const w = textW + pad * 2;
  const drawX = align === "right" ? x - w : align === "center" ? x - w / 2 : x;

  rr(ctx, drawX, y, w, h, h / 2);
  if (solid) {
    ctx.fillStyle = color;
    ctx.fill();
    text(ctx, label, drawX + w / 2, y + h / 2 + 5, { font, color: "#080b16", align: "center" });
  } else {
    const g = ctx.createLinearGradient(drawX, y, drawX + w, y + h);
    g.addColorStop(0, hexA(color, 0.26));
    g.addColorStop(1, hexA(color, 0.1));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = hexA(color, 0.65);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    text(ctx, label, drawX + w / 2, y + h / 2 + 5, { font, color, align: "center" });
  }
  return w;
}

function header(ctx, title, sub, accent, rightTag = null) {
  // Thanh hiệu hiệu đầu trang (Kicker Tag)
  ctx.save();
  ctx.fillStyle = accent;
  rr(ctx, 38, 28, 8, 8, 4);
  ctx.fill();
  text(ctx, "HNNP CAREER SYSTEM", 54, 36, { font: f("800", 11), color: accent });
  ctx.restore();

  // Tiêu đề chính lớn có đổ bóng nhẹ
  text(ctx, title, 38, 70, { font: f("800", 34), color: T.text, shadow: true, max: W - 260 });

  // Phụ đề
  if (sub) {
    text(ctx, sub, 38, 96, { font: f("normal", 16), color: T.subText, max: W - 220 });
  }

  // Nhãn góc phải nếu có
  if (rightTag) {
    chip(ctx, rightTag, W - 38, 42, T.gold, { h: 32, font: f("bold", 14), pad: 16, align: "right" });
  }

  // Đường phân cách ánh sáng (Glowing Divider)
  const divG = ctx.createLinearGradient(38, 0, W - 38, 0);
  divG.addColorStop(0, accent);
  divG.addColorStop(0.25, hexA(accent, 0.4));
  divG.addColorStop(1, "rgba(255, 255, 255, 0.03)");
  ctx.fillStyle = divG;
  rr(ctx, 38, 108, W - 76, 2, 1);
  ctx.fill();

  // Điểm nút trang trí trên thanh divider
  ctx.fillStyle = accent;
  rr(ctx, 38, 107, 48, 4, 2);
  ctx.fill();
}

function footer(ctx, h, msg) {
  const y = h - 32;
  // Đường kẻ mờ phía trên footer
  const g = ctx.createLinearGradient(60, 0, W - 60, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(60, y - 22, W - 120, 1);

  text(ctx, `✦  ${msg}  ✦`, W / 2, y, {
    font: f("600", 14),
    color: T.muted,
    align: "center",
    max: W - 80,
  });
}

/** Biểu tượng vector sắc nét theo nhóm nghề. */
function glyph(ctx, group, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.11);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (group === "laodong") {
    // Bánh răng cơ khí chính xác
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * s * 0.34, Math.sin(a) * s * 0.34);
      ctx.lineTo(Math.cos(a) * s * 0.48, Math.sin(a) * s * 0.48);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.33, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
  } else if (group === "dichvu") {
    // Túi dịch vụ cao cấp + ngôi sao nhỏ
    rr(ctx, -s * 0.38, -s * 0.18, s * 0.76, s * 0.62, s * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -s * 0.18, s * 0.19, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, s * 0.12, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  } else if (group === "congnghe") {
    // Ký hiệu Code </>
    ctx.beginPath();
    ctx.moveTo(-s * 0.18, -s * 0.28);
    ctx.lineTo(-s * 0.46, 0);
    ctx.lineTo(-s * 0.18, s * 0.28);
    ctx.moveTo(s * 0.18, -s * 0.28);
    ctx.lineTo(s * 0.46, 0);
    ctx.lineTo(s * 0.18, s * 0.28);
    ctx.moveTo(s * 0.09, -s * 0.36);
    ctx.lineTo(-s * 0.09, s * 0.36);
    ctx.stroke();
  } else if (group === "sangtao") {
    // Ngôi sao 4 cánh lấp lánh (Sparkle Star)
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? s * 0.16 : s * 0.48;
      const a = -Math.PI / 2 + (i * Math.PI) / 4;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = hexA(color, 0.28);
    ctx.fill();
    ctx.stroke();
  } else {
    // Cặp hồ sơ chuyên gia (Briefcase)
    rr(ctx, -s * 0.44, -s * 0.18, s * 0.88, s * 0.6, s * 0.1);
    ctx.stroke();
    rr(ctx, -s * 0.16, -s * 0.34, s * 0.32, s * 0.16, s * 0.04);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, s * 0.08);
    ctx.lineTo(s * 0.42, s * 0.08);
    ctx.stroke();
  }
  ctx.restore();
}

/** Huy hiệu đa giác & vòng sáng雙 (Dual-Ring Emblem) */
function badge(ctx, group, x, y, r, color) {
  ctx.save();
  // Quầng sáng ngoài
  const outerG = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.35);
  outerG.addColorStop(0, hexA(color, 0.38));
  outerG.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = outerG;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
  ctx.fill();

  // Nền huy hiệu tròn
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, hexA(color, 0.35));
  g.addColorStop(1, "rgba(10, 15, 34, 0.85)");
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // Viền chính
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Viền phụ bên trong
  ctx.beginPath();
  ctx.arc(x, y, r * 0.82, 0, Math.PI * 2);
  ctx.strokeStyle = hexA("#ffffff", 0.18);
  ctx.lineWidth = 1;
  ctx.stroke();

  glyph(ctx, group, x, y, r * 1.15, color);
  ctx.restore();
}

async function drawAvatar(ctx, avatarPath, x, y, r, name, accent) {
  ctx.save();
  // Hào quang sau Avatar
  const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.45);
  glow.addColorStop(0, hexA(accent, 0.45));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.45, 0, Math.PI * 2);
  ctx.fill();

  // Vòng trang trí ngoài đứt nét nhẹ
  ctx.beginPath();
  ctx.arc(x, y, r + 6, 0, Math.PI * 2);
  ctx.strokeStyle = hexA(accent, 0.45);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cắt hình tròn vẽ ảnh
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  let ok = false;
  if (avatarPath) {
    try {
      const img = await loadImage(avatarPath);
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
      ok = true;
    } catch {
      /* dùng chữ cái đầu dự phòng */
    }
  }
  if (!ok) {
    const fbGrad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    fbGrad.addColorStop(0, hexA(accent, 0.65));
    fbGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = fbGrad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    text(ctx, (String(name || "?").trim()[0] || "?").toUpperCase(), x, y + r * 0.34, {
      font: f("800", Math.round(r * 0.92)),
      color: T.text,
      align: "center",
      shadow: true,
    });
  }
  ctx.restore();

  // Khung viền Avatar kép
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Chấm trạng thái Online góc dưới phải
  const dotX = x + r * 0.72;
  const dotY = y + r * 0.72;
  ctx.beginPath();
  ctx.arc(dotX, dotY, 8, 0, Math.PI * 2);
  ctx.fillStyle = T.bg0;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(dotX, dotY, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = T.green;
  ctx.fill();
}

/** Ô thống kê (Stat Card) có thanh màu nhấn và bố cục hiện đại */
function stat(ctx, x, y, w, label, value, color = T.text, subLabel = null) {
  const h = 84;
  panel(ctx, x, y, w, h, color, 16);

  // Thanh điểm nhấn nhỏ bên trái nhãn
  ctx.fillStyle = color;
  rr(ctx, x + 16, y + 18, 4, 14, 2);
  ctx.fill();

  text(ctx, label.toUpperCase(), x + 26, y + 29, {
    font: f("bold", 12),
    color: T.muted,
    max: w - 36,
  });

  text(ctx, value, x + 16, y + 64, {
    font: f("800", 25),
    color,
    max: w - 32,
    shadow: true,
  });

  if (subLabel) {
    text(ctx, subLabel, x + w - 14, y + 29, {
      font: f("600", 11),
      color: hexA(color, 0.85),
      align: "right",
    });
  }
}

const png = (cv) => cv.toBuffer("image/png");
const accentOf = (job) => (job ? GROUP_COLOR[job.group] || T.purple : T.purple);
const rankColor = (r) => r?.color || T.purple;

// ════════════════════════════ CÁC MÀN HÌNH RENDER ════════════════════════════

export async function renderDashboard(d, avatarPath, prefix) {
  const h = 870;
  const accent = accentOf(d.job);
  const { cv, ctx } = newCanvas(h, accent);

  header(ctx, "HỒ SƠ NGHỀ NGHIỆP", `Ngày ${d.today} · Múi giờ Việt Nam (GMT+7)`, accent, `LV.${d.level}`);

  // 1. Thẻ Nhân Vật & Công Việc Chính (Hero Card)
  panel(ctx, 36, 126, W - 72, 184, accent, 22, { glow: true });
  await drawAvatar(ctx, avatarPath, 122, 218, 62, d.player.name, accent);

  // Tên người chơi & Nghề
  text(ctx, d.player.name || "Người chơi", 210, 168, { font: f("800", 30), max: 430, shadow: true });

  if (d.job) {
    text(ctx, d.job.name, 210, 200, { font: f("bold", 20), color: accent, max: 350 });
    chip(ctx, d.rank.name, 210, 212, rankColor(d.rank), { h: 26, font: f("bold", 13), pad: 12 });
    chip(ctx, `Hệ số x${d.rank.wageMultiplier}`, 218 + Math.ceil(ctx.measureText(d.rank.name).width) + 28, 212, T.gold, {
      h: 26,
      font: f("bold", 13),
      pad: 12,
    });
  } else {
    text(ctx, "Chưa có công việc chính thức", 210, 202, { font: f("600", 18), color: T.muted });
    chip(ctx, "Thất nghiệp", 210, 214, T.muted, { h: 26, font: f("600", 13), pad: 12 });
  }

  // Thanh kinh nghiệm cấp độ nhân vật
  const need = Math.max(1, d.nextExp || 1);
  const pct = Math.min(1, Math.max(0, d.expPct || 0));
  text(ctx, `TIẾN ĐỘ CẤP ${d.level}`, 210, 266, { font: f("800", 12), color: T.subText });
  text(ctx, `${num(d.exp)} / ${num(need)} EXP (${Math.round(pct * 100)}%)`, 580, 266, {
    font: f("600", 12),
    color: T.blue,
    align: "right",
  });
  bar(ctx, 210, 275, 370, 14, pct, T.blue);

  // Hộp Ví Tiền (Bên phải Hero Card)
  panel(ctx, W - 306, 146, 250, 144, T.gold, 18, { dark: true });
  text(ctx, "SỐ DƯ HIỆN TẠI", W - 181, 176, { font: f("800", 12), color: T.muted, align: "center" });
  text(ctx, fmt(d.balance), W - 181, 214, {
    font: f("800", 28),
    color: T.gold,
    align: "center",
    max: 226,
    glowColor: T.gold,
  });

  if (d.job) {
    badge(ctx, d.job.group, W - 245, 258, 19, accent);
    text(ctx, d.job.groupName || "Nghề nghiệp", W - 216, 264, {
      font: f("600", 14),
      color: T.subText,
      max: 140,
    });
  } else {
    text(ctx, `Gõ ${prefix}work nghenghiep`, W - 181, 262, {
      font: f("600", 13),
      color: T.muted,
      align: "center",
    });
  }

  // 2. Dải 4 Ô Thống Kê
  const sw = (W - 72 - 36) / 4;
  stat(ctx, 36, 326, sw, "Ngày công", `${d.player.daysWorked}`, T.green);
  stat(ctx, 36 + sw + 12, 326, sw, "Tổng thu nhập", fmt(d.player.totalIncome), T.gold);
  stat(ctx, 36 + (sw + 12) * 2, 326, sw, "Ca hoàn thành", `${d.player.shiftsDone}`, T.blue);
  stat(ctx, 36 + (sw + 12) * 3, 326, sw, "Nghề mở khóa", `${d.unlocked}/${d.total}`, T.purple);

  // 3. Khu vực Tiến Độ Ca Làm & Thăng Cấp
  panel(ctx, 36, 426, W - 72, 166, accent, 20, { leftBar: true });
  text(ctx, "TRẠNG THÁI CA LÀM & SỰ NGHIỆP", 62, 458, { font: f("800", 15), color: accent });

  if (!d.job) {
    text(ctx, "Bạn hiện chưa gia nhập ngành nghề nào.", 62, 496, { font: f("bold", 20), color: T.text });
    text(ctx, `Sử dụng lệnh ${prefix}work xin viec <tên nghề> để bắt đầu hành trình sự nghiệp.`, 62, 528, {
      font: f("normal", 16),
      color: T.muted,
    });
  } else if (d.shift) {
    const done = d.shift.tasks.filter((t) => t.status === "done").length;
    const tot = Math.max(1, d.shift.tasks.length);
    chip(ctx, "ĐANG TRONG CA", W - 60, 440, T.gold, { h: 26, align: "right" });
    text(ctx, `Tiến độ ca làm hôm nay: ${done}/${tot} nhiệm vụ hoàn tất`, 62, 492, { font: f("bold", 20), color: T.text });
    bar(ctx, 62, 506, W - 124, 16, done / tot, accent);
  } else if (d.doneToday) {
    chip(ctx, "HOÀN TẤT HÔM NAY", W - 60, 440, T.green, { h: 26, align: "right" });
    text(ctx, "Bạn đã hoàn thành xuất sắc ca làm việc hôm nay!", 62, 496, { font: f("bold", 20), color: T.green });
    text(ctx, "Hãy nghỉ ngơi và quay lại vào ngày mai để tiếp tục nhận lương.", 62, 524, {
      font: f("normal", 15),
      color: T.subText,
    });
  } else {
    chip(ctx, "SẴN SÀNG VÀO CA", W - 60, 440, T.blue, { h: 26, align: "right" });
    text(ctx, `Hôm nay bạn chưa bắt đầu ca làm. Gõ ${prefix}work lam để nhận nhiệm vụ!`, 62, 496, {
      font: f("bold", 19),
      color: T.gold,
    });
    text(ctx, `Mức lương cơ bản nghề này: ${fmt(d.job.baseWage)}/ca · Thưởng +${d.job.exp} EXP`, 62, 524, {
      font: f("normal", 15),
      color: T.subText,
    });
  }

  if (d.job && d.progress) {
    const pr = d.progress;
    if (pr.done) {
      text(ctx, "★ Đã đạt đỉnh cao danh vọng: Cấp bậc Giám Đốc", 62, 568, { font: f("bold", 15), color: T.gold });
    } else {
      text(
        ctx,
        `Mục tiêu thăng cấp [${pr.next.name}]: ${pr.jobExp}/${pr.needExp} EXP nghề  ·  ${pr.days}/${pr.needDays} ngày công`,
        62,
        568,
        { font: f("600", 15), color: T.subText, max: W - 124 }
      );
    }
  }

  // 4. Bảng Phím Tắt Lệnh Nhanh (2 Cột Gọn Đẹp)
  panel(ctx, 36, 608, W - 72, 198, null, 20);
  text(ctx, "BẢNG ĐIỀU KHIỂN NHANH", 60, 640, { font: f("800", 15), color: T.purple });

  const shortcuts = [
    [`${prefix}work nghenghiep`, "Danh sách 50 nghề nghiệp"],
    [`${prefix}work lam`, "Vào ca / Tiếp tục ca làm"],
    [`${prefix}work xin viec <tên>`, "Ứng tuyển công việc mới"],
    [`${prefix}work nhiemvu`, "Chi tiết nhiệm vụ trong ngày"],
    [`${prefix}work luong`, "Xem bảng lương & đãi ngộ"],
    [`${prefix}work diem danh`, "Điểm danh nhận thưởng ngày"],
    [`${prefix}work thangcap`, "Lộ trình 8 bậc thăng tiến"],
    [`${prefix}work top`, "Bảng xếp hạng đại gia & chăm chỉ"],
  ];

  const colW = (W - 72 - 60) / 2;
  shortcuts.forEach(([cmd, desc], i) => {
    const colIdx = i % 2;
    const rowIdx = Math.floor(i / 2);
    const cx = 60 + colIdx * (colW + 16);
    const cy = 668 + rowIdx * 32;

    ctx.fillStyle = hexA(T.purple, 0.25);
    rr(ctx, cx, cy - 15, 8, 8, 4);
    ctx.fill();

    text(ctx, cmd, cx + 16, cy - 6, { font: f("bold", 15), color: T.gold });
    text(ctx, `· ${desc}`, cx + 175, cy - 6, { font: f("normal", 14), color: T.subText, max: colW - 180 });
  });

  footer(ctx, h, "HNNP STUDIO · Hệ thống mô phỏng nghề nghiệp chuyên sâu");
  return png(cv);
}

export async function renderJobs({ rows, page, pages, group, groupName, level, prefix, total }) {
  const rowH = 124;
  const h = 158 + rows.length * rowH + 86;
  const accent = group ? GROUP_COLOR[group] : T.purple;
  const { cv, ctx } = newCanvas(h, accent);

  header(
    ctx,
    "DANH MỤC NGHỀ NGHIỆP",
    `${group ? `Nhóm: ${groupName}` : "Tất cả 5 nhóm ngành"} · Tổng ${total} nghề`,
    accent,
    `Cấp của bạn: ${level}`
  );

  rows.forEach((r, i) => {
    const y = 132 + i * rowH;
    const j = r.job;
    const col = GROUP_COLOR[j.group] || T.purple;
    const st = r.status;

    panel(ctx, 36, y, W - 72, rowH - 12, col, 18, { leftBar: true });
    badge(ctx, j.group, 88, y + (rowH - 12) / 2, 30, col);

    // Tên nghề & số thứ tự
    text(ctx, `#${r.index}  ${j.name}`, 136, y + 34, { font: f("800", 22), color: T.text, max: 450 });

    // Mô tả nghề
    text(ctx, j.description, 136, y + 58, { font: f("normal", 14), color: T.subText, max: 520 });

    // Yêu cầu & độ khó
    const reqs = `Yêu cầu Cấp ${j.levelRequired}${j.minDays ? ` · ${j.minDays} ngày công` : ""} · Độ khó: ${j.difficultyLabel}`;
    text(ctx, reqs, 136, y + 83, { font: f("600", 13), color: T.blue, max: 490 });

    if (st.code === "locked") {
      text(ctx, `⚠ ${st.reasons.join(" · ")}`, 136, y + 102, { font: f("600", 12), color: T.red, max: 520 });
    }

    // Cột Lương & EXP bên phải
    text(ctx, `${fmt(j.baseWage)}/ca`, W - 56, y + 36, {
      font: f("800", 22),
      color: T.gold,
      align: "right",
      glowColor: T.gold,
    });
    text(ctx, `+${j.exp} EXP nhân vật`, W - 56, y + 58, { font: f("bold", 14), color: T.green, align: "right" });

    const stCol = st.code === "current" ? T.green : st.code === "open" ? T.blue : T.red;
    chip(ctx, st.label, W - 56, y + 70, stCol, { h: 26, font: f("bold", 13), align: "right" });
  });

  // Thanh phân trang dạng viên thuốc ở đáy
  const py = h - 78;
  chip(ctx, `TRANG ${page} / ${pages}`, W / 2, py, T.gold, { h: 30, font: f("800", 14), pad: 22, align: "center" });

  footer(ctx, h, `${prefix}work nghenghiep <nhóm> <trang>  ·  ${prefix}work xin viec <tên nghề>`);
  return png(cv);
}

export async function renderApply({ job, check, level, prefix, confirmed }) {
  const accent = accentOf(job);
  const descLines = measureLines(job.description, W - 260, f("normal", 17));
  const heroH = Math.max(134, 96 + descLines.length * 24);
  const h = 490 + heroH;
  const { cv, ctx } = newCanvas(h, confirmed ? T.green : accent);

  header(
    ctx,
    confirmed ? "TUYỂN DỤNG THÀNH CÔNG" : "HỒ SƠ ỨNG TUYỂN",
    `Chuyên ngành: ${job.groupName}`,
    confirmed ? T.green : accent,
    confirmed ? "ĐÃ NHẬN VIỆC" : "CHỜ XÁC NHẬN"
  );

  // Thẻ giới thiệu nghề
  panel(ctx, 36, 128, W - 72, heroH, accent, 22, { glow: true, leftBar: true });
  badge(ctx, job.group, 108, 128 + heroH / 2, 42, accent);
  text(ctx, job.name, 174, 172, { font: f("800", 30), max: W - 230, shadow: true });
  descLines.forEach((l, i) => text(ctx, l, 174, 204 + i * 24, { font: f("normal", 17), color: T.subText }));

  // 4 Ô chỉ số công việc
  const y0 = 144 + heroH;
  const sw = (W - 72 - 36) / 4;
  stat(ctx, 36, y0, sw, "Lương cơ bản", fmt(job.baseWage), T.gold, "/ca");
  stat(ctx, 36 + sw + 12, y0, sw, "Thưởng EXP", `+${job.exp}`, T.green, "/ca");
  stat(ctx, 36 + (sw + 12) * 2, y0, sw, "Yêu cầu cấp", `Cấp ${job.levelRequired}`, level >= job.levelRequired ? T.green : T.red);
  stat(ctx, 36 + (sw + 12) * 3, y0, sw, "Độ khó", job.difficultyLabel, T.blue);

  // Bảng Kiểm tra điều kiện
  const yReq = y0 + 102;
  panel(ctx, 36, yReq, W - 72, 132, null, 18);
  text(ctx, "ĐỐI CHIẾU ĐIỀU KIỆN ỨNG TUYỂN", 60, yReq + 32, { font: f("800", 15), color: accent });

  const lvOk = level >= job.levelRequired;
  const dayOk = !job.minDays || check.player.daysWorked >= job.minDays;

  const drawReqRow = (ry, labelStr, valStr, isOk) => {
    const c = isOk ? T.green : T.red;
    ctx.beginPath();
    ctx.arc(68, ry - 6, 9, 0, Math.PI * 2);
    ctx.fillStyle = hexA(c, 0.22);
    ctx.fill();
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    text(ctx, isOk ? "✓" : "✕", 68, ry - 1, { font: f("800", 12), color: c, align: "center" });
    text(ctx, labelStr, 88, ry, { font: f("600", 17), color: T.text });
    chip(ctx, valStr, W - 60, ry - 18, c, { h: 26, font: f("bold", 13), align: "right" });
  };

  drawReqRow(yReq + 68, `Cấp độ nhân vật (Hiện tại: Cấp ${level} / Yêu cầu: Cấp ${job.levelRequired})`, lvOk ? "Đạt yêu cầu" : "Chưa đủ cấp", lvOk);
  drawReqRow(
    yReq + 104,
    job.minDays
      ? `Thâm niên tích lũy (Hiện tại: ${check.player.daysWorked} / Yêu cầu: ${job.minDays} ngày công)`
      : "Thâm niên ngày công (Nghề này không yêu cầu ngày công tối thiểu)",
    dayOk ? "Đạt yêu cầu" : "Thiếu ngày công",
    dayOk
  );

  // Hộp thông báo hành động ở dưới
  const yAct = yReq + 148;
  let msg;
  let col = T.green;
  if (confirmed) {
    msg = `Chúc mừng! Bạn đã chính thức nhận việc. Gõ ${prefix}work lam để bắt đầu ca đầu tiên.`;
  } else if (check.ok) {
    msg = `Hồ sơ hợp lệ! Hãy trả lời tin nhắn này bằng "yes" để ký hợp đồng hoặc "no" để hủy.`;
    col = T.gold;
  } else {
    msg = `Chưa thể ứng tuyển: ${check.reasons.join(" · ")}`;
    col = T.red;
  }

  panel(ctx, 36, yAct, W - 72, 54, col, 14, { dark: true });
  text(ctx, msg, W / 2, yAct + 34, { font: f("bold", 17), color: col, align: "center", max: W - 100 });

  footer(ctx, h, "Mỗi người chơi đảm nhận 1 công việc chính thức tại một thời điểm");
  return png(cv);
}

export async function renderShift({ job, shift, task, challenge, restored, prefix }) {
  const accent = accentOf(job);
  const ch = challenge;
  const qLines = measureLines(ch.prompt, W - 140, f("bold", 22));
  const optH = ch.options ? ch.options.length * 60 : 104;
  const h = 360 + qLines.length * 32 + optH + 96;
  const { cv, ctx } = newCanvas(h, accent);

  const done = shift.tasks.filter((t) => t.status === "done").length;
  header(
    ctx,
    restored ? "TIẾP TỤC CA LÀM VIỆC" : "ĐANG TRONG CA LÀM VIỆC",
    `${job.name} · Nhiệm vụ thứ ${shift.taskIdx + 1} / ${shift.tasks.length}`,
    accent,
    `Đúng ${shift.correct} · Sai ${shift.wrong}`
  );

  // 1. Thẻ Tiến Độ Nhiệm Vụ Hiện Tại
  panel(ctx, 36, 126, W - 72, 96, accent, 18, { leftBar: true });
  badge(ctx, job.group, 82, 174, 24, accent);
  text(ctx, task.name, 120, 162, { font: f("800", 22), max: W - 300 });
  chip(ctx, `Lượt ${task.done}/${task.count}`, W - 56, 140, accent, { h: 26, font: f("bold", 13), align: "right" });

  text(
    ctx,
    `Tiến độ tổng ca làm: Đã hoàn thành ${done}/${shift.tasks.length} hạng mục công việc`,
    120,
    188,
    { font: f("normal", 14), color: T.subText }
  );
  bar(ctx, 120, 198, W - 176, 10, (done + task.done / Math.max(1, task.count)) / Math.max(1, shift.tasks.length), accent);

  // 2. Thẻ Câu Hỏi / Thử Thách Nghiệp Vụ
  const qBoxH = 68 + qLines.length * 32;
  panel(ctx, 36, 236, W - 72, qBoxH, T.blue, 20, { glow: true });
  chip(ctx, ch.title.toUpperCase(), 58, 250, T.blue, { h: 24, font: f("800", 12), pad: 12 });
  qLines.forEach((l, i) => text(ctx, l, 58, 300 + i * 32, { font: f("bold", 22), color: T.text }));

  // 3. Khu vực Đáp Án hoặc Mã Xác Thực
  let y = 236 + qBoxH + 16;
  if (ch.kind === "code") {
    // Khung Cyber Terminal hiển thị mã
    panel(ctx, 110, y, W - 220, 92, T.gold, 20, { dark: true, glow: true });
    text(ctx, "NHẬP CHÍNH XÁC MÃ XÁC THỰC BÊN DƯỚI", W / 2, y + 26, {
      font: f("800", 11),
      color: T.muted,
      align: "center",
    });
    text(ctx, ch.code.split("").join("   "), W / 2, y + 72, {
      font: f("800", 42),
      color: T.gold,
      align: "center",
      glowColor: T.gold,
    });
    y += 104;
  } else {
    ch.options.forEach((o, i) => {
      const oy = y + i * 60;
      panel(ctx, 36, oy, W - 72, 50, null, 14);

      // Nút số thứ tự đáp án
      rr(ctx, 50, oy + 9, 34, 32, 10);
      const btnG = ctx.createLinearGradient(50, oy + 9, 50, oy + 41);
      btnG.addColorStop(0, hexA(accent, 0.45));
      btnG.addColorStop(1, hexA(accent, 0.15));
      ctx.fillStyle = btnG;
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      text(ctx, String(i + 1), 67, oy + 31, { font: f("800", 17), color: T.text, align: "center" });
      text(ctx, o, 100, oy + 32, { font: f("600", 18), color: T.text, max: W - 160 });
    });
    y += ch.options.length * 60;
  }

  // 4. Hướng dẫn trả lời
  const how =
    ch.kind === "code"
      ? `💡 Reply trực tiếp ảnh này bằng mã trên hoặc gõ: ${prefix}work tl <mã>`
      : `💡 Reply trực tiếp ảnh này bằng số đáp án (1-${ch.options.length}) hoặc gõ: ${prefix}work tl <số>`;

  panel(ctx, 36, h - 88, W - 72, 42, T.gold, 12, { dark: true });
  text(ctx, how, W / 2, h - 61, { font: f("bold", 16), color: T.gold, align: "center", max: W - 96 });

  footer(ctx, h, `Dùng ${prefix}work huyca nếu muốn hủy ca làm hiện tại (lưu ý: hủy ca không nhận lương)`);
  return png(cv);
}

export async function renderSettlement(res, balance, prefix) {
  const extra = res.achievements?.length || 0;
  const h = 660 + (res.promoted ? 88 : 0) + extra * 38;
  const { cv, ctx } = newCanvas(h, T.gold);

  header(
    ctx,
    "QUYẾT TOÁN CA LÀM VIỆC",
    `${res.jobName} · ${res.perfect ? "★ Ca Làm Việc Hoàn Hảo" : "Hoàn thành chỉ tiêu"}`,
    T.gold,
    res.perfect ? "PERFECT +10%" : "HOÀN TẤT"
  );

  // Thẻ Vinh Danh Tiền Lương
  panel(ctx, 36, 126, W - 72, 160, T.gold, 24, { glow: true });
  text(ctx, "TỔNG THÙ LAO NHẬN ĐƯỢC", W / 2, 162, { font: f("800", 14), color: T.goldLight, align: "center" });
  text(ctx, `+${fmt(res.wage)}`, W / 2, 232, {
    font: f("800", 62),
    color: T.gold,
    align: "center",
    glowColor: T.gold,
  });

  if (res.capped) {
    text(ctx, "(Thu nhập đã chạm mức trần tối đa trong ngày)", W / 2, 266, {
      font: f("600", 14),
      color: T.red,
      align: "center",
    });
  } else {
    text(ctx, `Đã chuyển khoản trực tiếp vào ví của bạn`, W / 2, 266, {
      font: f("normal", 14),
      color: T.subText,
      align: "center",
    });
  }

  // 3 Ô Thống Kê Kết Quả
  const sw = (W - 72 - 24) / 3;
  stat(ctx, 36, 302, sw, "EXP Nhân vật", `+${res.exp} EXP`, T.green);
  stat(ctx, 36 + sw + 12, 302, sw, "EXP Thông thạo nghề", `+${res.jobExp} EXP`, T.blue);
  stat(
    ctx,
    36 + (sw + 12) * 2,
    302,
    sw,
    "Độ chính xác",
    `${Math.round(res.accuracy * 100)}%`,
    res.perfect ? T.green : T.text,
    `${res.correct} Đúng / ${res.wrong} Sai`
  );

  // Thẻ Tổng Kết Tài Khoản
  panel(ctx, 36, 402, W - 72, 118, null, 18);
  text(ctx, "SỐ DƯ VÍ MỚI", 60, 438, { font: f("bold", 14), color: T.muted });
  text(ctx, fmt(balance), 60, 474, { font: f("800", 30), color: T.gold });

  if (res.level) {
    chip(
      ctx,
      res.leveledUp ? `🎉 LÊN CẤP ${res.level}!` : `Cấp nhân vật: ${res.level}`,
      W - 60,
      424,
      res.leveledUp ? T.green : T.blue,
      { h: 30, font: f("800", 14), align: "right" }
    );
  }
  text(
    ctx,
    `Hoàn tất ${res.tasks.length} nhiệm vụ trong ca · Trạng thái: Đã lưu hồ sơ`,
    W - 60,
    476,
    { font: f("normal", 15), color: T.subText, align: "right" }
  );

  let y = 536;
  if (res.promoted) {
    panel(ctx, 36, y, W - 72, 72, T.purple, 18, { glow: true });
    text(ctx, `★ THĂNG TIẾN CẤP BẬC:  ${res.rankBeforeName.toUpperCase()}  ➔  ${res.rankAfterName.toUpperCase()}`, W / 2, y + 44, {
      font: f("800", 22),
      color: T.gold,
      align: "center",
      max: W - 100,
      glowColor: T.purple,
    });
    y += 88;
  }

  (res.achievements || []).forEach((a, i) => {
    const ay = y + i * 38;
    chip(ctx, `🏆 Thành tựu mới: ${a.name}`, W / 2, ay, T.gold, { h: 30, font: f("bold", 15), pad: 20, align: "center" });
  });

  footer(ctx, h, `${prefix}work luong để xem chi tiết lương  ·  ${prefix}work lichsu để tra cứu nhật ký`);
  return png(cv);
}

export async function renderTasks({ job, shift, prefix, doneToday, tasksPreview }) {
  const accent = accentOf(job);
  const list = shift ? shift.tasks : tasksPreview;
  const h = 196 + list.length * 102 + 76;
  const { cv, ctx } = newCanvas(h, accent);

  header(
    ctx,
    "DANH SÁCH NHIỆM VỤ",
    `${job.name} · ${shift ? "Ca đang diễn ra" : doneToday ? "Đã hoàn thành ca hôm nay" : "Mẫu nhiệm vụ tiêu chuẩn"}`,
    accent,
    shift ? "ĐANG LÀM" : doneToday ? "ĐÃ XONG" : "CHỜ VÀO CA"
  );

  list.forEach((t, i) => {
    const y = 130 + i * 102;
    const st = shift ? t.status : doneToday ? "done" : "pending";
    const col = st === "done" ? T.green : st === "active" ? T.gold : T.muted;

    panel(ctx, 36, y, W - 72, 88, st === "active" ? accent : col, 18, { leftBar: st === "active" });

    // Vòng tròn trạng thái bên trái
    const cx = 80;
    const cy = y + 44;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = hexA(col, 0.2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    if (st === "done") {
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy);
      ctx.lineTo(cx - 2, cy + 7);
      ctx.lineTo(cx + 10, cy - 7);
      ctx.strokeStyle = col;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.stroke();
    } else {
      text(ctx, String(i + 1), cx, cy + 7, { font: f("800", 19), color: col, align: "center" });
    }

    text(ctx, t.name, 122, y + 36, { font: f("800", 20), color: T.text, max: 580 });
    const prog = shift ? `Tiến độ: ${t.done}/${t.count} lượt` : `Yêu cầu: ${t.count} lượt thao tác`;
    const valDesc = t.validation || (t.kind === "code" ? "Nhập mã xác thực" : "Trả lời câu hỏi tình huống");
    text(ctx, `${prog}  ·  Hình thức: ${valDesc}`, 122, y + 64, { font: f("normal", 15), color: T.subText, max: 580 });

    const chipLabel = st === "done" ? "Hoàn thành" : st === "active" ? "Đang thực hiện" : "Đang chờ";
    chip(ctx, chipLabel, W - 56, y + 30, col, { h: 28, font: f("bold", 13), align: "right" });
  });

  footer(ctx, h, shift ? `Gõ ${prefix}work lam để hiển thị câu hỏi hiện tại` : `Gõ ${prefix}work lam để bắt đầu ca làm việc`);
  return png(cv);
}

export async function renderStatus(v, prefix) {
  const job = v.job;
  const accent = accentOf(job);
  const h = 550;
  const { cv, ctx } = newCanvas(h, accent);

  header(ctx, "TRẠNG THÁI CÔNG VIỆC", job ? job.name : "Hồ sơ chưa đăng ký nghề", accent);

  if (!job) {
    panel(ctx, 36, 136, W - 72, 160, null, 20);
    text(ctx, "Bạn hiện chưa có công việc chính thức.", W / 2, 205, { font: f("bold", 22), color: T.text, align: "center" });
    text(ctx, `Hãy gõ ${prefix}work nghenghiep để khám phá 50 ngành nghề hấp dẫn.`, W / 2, 240, {
      font: f("normal", 16),
      color: T.muted,
      align: "center",
    });
    footer(ctx, h, `${prefix}work help để xem hướng dẫn toàn diện`);
    return png(cv);
  }

  panel(ctx, 36, 126, W - 72, 134, accent, 20, { leftBar: true, glow: true });
  badge(ctx, job.group, 98, 193, 38, accent);
  text(ctx, job.name, 158, 168, { font: f("800", 28), max: 500 });
  chip(ctx, v.rank.name, 158, 180, rankColor(v.rank), { h: 26, font: f("bold", 13) });
  chip(ctx, `Hệ số lương x${v.rank.wageMultiplier}`, 168 + Math.ceil(ctx.measureText(v.rank.name).width) + 28, 180, T.gold, {
    h: 26,
    font: f("bold", 13),
  });

  const stText = v.shift
    ? v.shift.status === "active"
      ? "Đang làm việc trong ca"
      : "Đang quyết toán lương"
    : v.doneToday
    ? "Đã hoàn thành ca hôm nay"
    : "Chưa bắt đầu ca hôm nay";
  text(ctx, `Trạng thái hôm nay: ${stText}`, 158, 234, { font: f("600", 16), color: T.subText });

  const sw = (W - 72 - 36) / 4;
  stat(ctx, 36, 278, sw, "EXP Nghề", `${num(v.js.jobExp)}`, T.blue);
  stat(ctx, 36 + sw + 12, 278, sw, "Thâm niên nghề", `${v.js.days} ngày`, T.green);
  stat(ctx, 36 + (sw + 12) * 2, 278, sw, "Thu nhập nghề", fmt(v.js.income), T.gold);
  stat(ctx, 36 + (sw + 12) * 3, 278, sw, "Số ca đã làm", `${v.js.shifts} ca`, T.purple);

  panel(ctx, 36, 378, W - 72, 108, null, 18);
  if (v.progress.done) {
    text(ctx, "★ Bạn đã chinh phục cấp bậc cao nhất của nghề: GIÁM ĐỐC", W / 2, 440, {
      font: f("800", 20),
      color: T.gold,
      align: "center",
    });
  } else {
    const p = v.progress;
    text(ctx, `MỤC TIÊU THĂNG CẤP TIẾP THEO: ${p.next.name.toUpperCase()}`, 60, 412, {
      font: f("800", 15),
      color: rankColor(p.next),
    });
    const pct = Math.min(1, (p.jobExp / Math.max(1, p.needExp) + p.days / Math.max(1, p.needDays)) / 2);
    bar(ctx, 60, 424, W - 120, 14, pct, T.blue);
    text(ctx, `Kinh nghiệm nghề: ${p.jobExp}/${p.needExp} EXP  ·  Thâm niên: ${p.days}/${p.needDays} ngày công`, 60, 464, {
      font: f("600", 15),
      color: T.subText,
    });
  }

  footer(ctx, h, `${prefix}work thangcap  ·  ${prefix}work luong`);
  return png(cv);
}

export async function renderPayroll(pr, prefix) {
  const accent = accentOf(pr.job);
  const h = 640;
  const { cv, ctx } = newCanvas(h, accent);

  header(ctx, "BẢNG KÊ CHẾ ĐỘ LƯƠNG", `${pr.job.name} · Cấp bậc: ${pr.rank.name}`, accent, `x${pr.multiplier}`);

  // Bảng chi tiết các mức lương
  panel(ctx, 36, 126, W - 72, 214, accent, 20, { leftBar: true });
  const rows = [
    ["Lương cơ bản theo hợp đồng / ca", fmt(pr.base), T.text],
    ["Hệ số đãi ngộ cấp bậc hiện tại", `x${pr.multiplier} (${pr.rank.name})`, rankColor(pr.rank)],
    ["Mức lương tối thiểu (khi sai nhiều)", fmt(pr.min), T.subText],
    ["Mức lương tiêu chuẩn (đủ điểm)", fmt(pr.full), T.gold],
    ["Mức lương Ca Hoàn Hảo (Thưởng +10%)", fmt(pr.perfect), T.green],
  ];

  rows.forEach(([labelStr, valStr, c], i) => {
    const ry = 164 + i * 36;
    if (i > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(60, ry - 24, W - 120, 1);
    }
    text(ctx, labelStr, 60, ry, { font: f("normal", 17), color: T.subText });
    text(ctx, valStr, W - 60, ry, { font: f("800", 19), color: c, align: "right" });
  });

  // 3 Ô thông số phụ
  const sw = (W - 72 - 24) / 3;
  stat(ctx, 36, 356, sw, "EXP Nhân vật / ca", `+${pr.exp}`, T.green);
  stat(ctx, 36 + sw + 12, 356, sw, "EXP Nghề / ca", `+${pr.jobExp}`, T.blue);
  stat(ctx, 36 + (sw + 12) * 2, 356, sw, "Đã nhận hôm nay", fmt(pr.earnedToday), T.gold);

  // Hộp Hạn mức ngày
  panel(ctx, 36, 456, W - 72, 114, null, 18);
  text(ctx, `Hạn mức thu nhập tối đa/ngày: ${fmt(pr.cap)}  ·  Hạn mức còn lại: ${fmt(pr.capLeft)}`, 60, 492, {
    font: f("bold", 17),
    color: T.text,
  });
  text(
    ctx,
    pr.doneToday ? "✓ Hôm nay bạn đã hoàn tất ca làm và nhận đủ lương." : "⏳ Hôm nay bạn chưa hoàn thành ca làm việc.",
    60,
    522,
    { font: f("600", 16), color: pr.doneToday ? T.green : T.gold }
  );
  if (pr.nextRank) {
    text(ctx, `Đãi ngộ cấp bậc tiếp theo [${pr.nextRank.name}]: Hệ số lương tăng lên x${pr.nextRank.wageMultiplier}`, 60, 550, {
      font: f("normal", 15),
      color: T.muted,
    });
  }

  footer(ctx, h, "Công thức: Lương thực nhận = Lương cơ bản × Hệ số cấp bậc × Độ chính xác");
  return png(cv);
}

export async function renderHistory(hs, prefix) {
  const rowH = 82;
  const h = 158 + Math.max(1, hs.items.length) * rowH + 84;
  const { cv, ctx } = newCanvas(h, T.blue);

  header(ctx, "NHẬT KÝ HOẠT ĐỘNG", `Lưu trữ ${hs.total} bản ghi sự nghiệp`, T.blue, `Trang ${hs.page}/${hs.pages}`);

  if (!hs.items.length) {
    panel(ctx, 36, 136, W - 72, 90, null, 18);
    text(ctx, "Chưa có dữ liệu lịch sử làm việc nào được ghi nhận.", W / 2, 188, {
      font: f("bold", 18),
      color: T.muted,
      align: "center",
    });
  }

  const LABEL = {
    shift_done: ["Hoàn thành ca", T.green],
    shift_start: ["Bắt đầu ca", T.blue],
    shift_cancel: ["Hủy ca làm", T.red],
    shift_fail: ["Ca thất bại", T.red],
    shift_expire: ["Ca hết hạn", T.muted],
    apply: ["Nhận việc mới", T.purple],
    quit: ["Nghỉ việc", T.red],
    promote: ["Thăng cấp bậc", T.gold],
    attendance: ["Điểm danh ngày", T.green],
  };

  hs.items.forEach((e, i) => {
    const y = 130 + i * rowH;
    const [lb, col] = LABEL[e.type] || [e.type, T.muted];

    panel(ctx, 36, y, W - 72, rowH - 10, col, 15, { leftBar: true });
    chip(ctx, lb, 58, y + 14, col, { h: 24, font: f("bold", 12), pad: 12 });

    const timeStr = new Date(e.ts).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
    text(ctx, timeStr, W - 56, y + 31, { font: f("600", 13), color: T.muted, align: "right" });

    text(ctx, `${e.jobName || "Hệ thống"}${e.detail ? "  ·  " + e.detail : ""}`, 58, y + 58, {
      font: f("600", 15),
      color: T.text,
      max: 620,
    });

    if (e.money) {
      text(ctx, `+${fmt(e.money)}`, W - 56, y + 58, {
        font: f("800", 19),
        color: T.gold,
        align: "right",
        glowColor: T.gold,
      });
    }
  });

  chip(ctx, `TRANG ${hs.page} / ${hs.pages}`, W / 2, h - 76, T.blue, { h: 28, font: f("800", 13), pad: 20, align: "center" });
  footer(ctx, h, `Tra cứu các trang trước bằng lệnh: ${prefix}work lichsu <số trang>`);
  return png(cv);
}

export async function renderPromotion({ job, progress, promoted, before, after, prefix, RANKS }) {
  const h = 590;
  const { cv, ctx } = newCanvas(h, T.purple);

  header(
    ctx,
    promoted ? "CHÚC MỪNG THĂNG CẤP!" : "LỘ TRÌNH THĂNG TIẾN",
    `Ngành nghề: ${job.name}`,
    T.purple,
    promoted ? "THĂNG CẤP MỚI" : `${progress.current.name}`
  );

  // Thẻ Trung Tâm Cấp Bậc
  panel(ctx, 36, 126, W - 72, 146, T.purple, 22, { glow: true });
  if (promoted) {
    text(ctx, "BƯỚC TIẾN SỰ NGHIỆP VƯỢT BẬC", W / 2, 160, { font: f("800", 13), color: T.goldLight, align: "center" });
    text(ctx, `${RANKS[before].name}   ➔   ${RANKS[after].name}`, W / 2, 206, {
      font: f("800", 34),
      color: T.gold,
      align: "center",
      max: W - 100,
      glowColor: T.gold,
    });
    text(ctx, `Đãi ngộ hệ số lương mới: x${RANKS[after].wageMultiplier}`, W / 2, 244, {
      font: f("bold", 19),
      color: T.green,
      align: "center",
    });
  } else {
    text(ctx, "CẤP BẬC ĐẢM NHIỆM HIỆN TẠI", W / 2, 160, { font: f("800", 13), color: T.muted, align: "center" });
    text(ctx, progress.current.name.toUpperCase(), W / 2, 206, {
      font: f("800", 34),
      color: rankColor(progress.current),
      align: "center",
      glowColor: rankColor(progress.current),
    });
    text(ctx, `Hệ số nhân lương hiện hưởng: x${progress.current.wageMultiplier}`, W / 2, 244, {
      font: f("bold", 18),
      color: T.gold,
      align: "center",
    });
  }

  // Sơ đồ 8 Cấp Bậc (8-Node Timeline)
  panel(ctx, 36, 288, W - 72, 108, null, 18, { dark: true });
  const n = RANKS.length;
  const cur = promoted ? after : progress.rank;
  const startX = 84;
  const endX = W - 84;
  const gap = (endX - startX) / (n - 1);
  const lineY = 332;

  // Đường nối nền
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(startX, lineY);
  ctx.lineTo(endX, lineY);
  ctx.stroke();

  // Đường nối đã đạt
  if (cur > 0) {
    const activeGrad = ctx.createLinearGradient(startX, 0, startX + cur * gap, 0);
    activeGrad.addColorStop(0, T.blue);
    activeGrad.addColorStop(1, T.purple);
    ctx.strokeStyle = activeGrad;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(startX, lineY);
    ctx.lineTo(startX + cur * gap, lineY);
    ctx.stroke();
  }

  RANKS.forEach((r, i) => {
    const x = startX + i * gap;
    const passed = i <= cur;
    const isCurrent = i === cur;

    if (isCurrent) {
      ctx.beginPath();
      ctx.arc(x, lineY, 22, 0, Math.PI * 2);
      ctx.fillStyle = hexA(r.color, 0.3);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, lineY, 15, 0, Math.PI * 2);
    ctx.fillStyle = passed ? r.color : "#111827";
    ctx.fill();
    ctx.strokeStyle = passed ? "#ffffff" : r.color;
    ctx.lineWidth = isCurrent ? 3 : 2;
    ctx.stroke();

    text(ctx, String(i + 1), x, lineY + 5, {
      font: f("800", 13),
      color: passed ? "#090d16" : T.muted,
      align: "center",
    });

    text(ctx, r.name, x, lineY + 42, {
      font: f(isCurrent ? "800" : "600", 11),
      color: isCurrent ? T.gold : passed ? T.text : T.muted,
      align: "center",
      max: gap - 6,
    });
  });

  // Hộp Điều kiện cấp tiếp theo
  panel(ctx, 36, 412, W - 72, 108, null, 18);
  if (progress.done) {
    text(ctx, "★ Bạn đã đứng ở đỉnh cao nhất trong hệ thống cấp bậc nghề nghiệp!", W / 2, 472, {
      font: f("bold", 19),
      color: T.gold,
      align: "center",
    });
  } else {
    const p = progress;
    text(ctx, `CẤP TIẾP THEO: ${p.next.name.toUpperCase()} (${p.next.unlock})`, 60, 444, {
      font: f("800", 16),
      color: rankColor(p.next),
      max: W - 120,
    });
    const ratio = Math.min(1, Math.min(p.jobExp / Math.max(1, p.needExp), p.days / Math.max(1, p.needDays)));
    bar(ctx, 60, 456, W - 120, 14, ratio, T.purple);
    text(
      ctx,
      `Yêu cầu: ${p.jobExp}/${p.needExp} EXP nghề  ·  ${p.days}/${p.needDays} ngày công${p.ok ? "  (✓ Đủ điều kiện thăng cấp!)" : ""}`,
      60,
      496,
      { font: f("600", 15), color: p.ok ? T.green : T.subText }
    );
  }

  footer(ctx, h, "Hệ thống tự động xét duyệt thăng cấp ngay sau mỗi ca làm việc đủ điều kiện");
  return png(cv);
}

export async function renderStats(st, prefix) {
  const rows = st.byJob.slice(0, 6);
  const h = 460 + Math.max(1, rows.length) * 64 + 60;
  const { cv, ctx } = newCanvas(h, T.green);

  header(
    ctx,
    "THỐNG KÊ SỰ NGHIỆP",
    `Hồ sơ tổng hợp của ${st.player.name}`,
    T.green,
    `${st.player.achievements.length} Thành tựu`
  );

  const sw = (W - 72 - 36) / 4;
  stat(ctx, 36, 126, sw, "Tổng thu nhập", fmt(st.player.totalIncome), T.gold);
  stat(ctx, 36 + sw + 12, 126, sw, "Tổng ngày công", `${st.player.daysWorked}`, T.green);
  stat(ctx, 36 + (sw + 12) * 2, 126, sw, "Tổng ca đã làm", `${st.player.shiftsDone}`, T.blue);
  stat(ctx, 36 + (sw + 12) * 3, 126, sw, "Lương TB / ca", fmt(st.avgWage), T.text);

  stat(ctx, 36, 222, sw, "Ca hoàn hảo", `${st.player.perfectShifts}`, T.green);
  stat(ctx, 36 + sw + 12, 222, sw, "Tỷ lệ hoàn hảo", `${Math.round(st.perfectRate * 100)}%`, T.cyan);
  stat(ctx, 36 + (sw + 12) * 2, 222, sw, "Tổng điểm danh", `${st.player.attendance.total}`, T.purple);
  stat(ctx, 36 + (sw + 12) * 3, 222, sw, "Chuỗi điểm danh", `${st.player.attendance.streak} ngày`, T.gold);

  const boxH = 56 + Math.max(1, rows.length) * 64;
  panel(ctx, 36, 322, W - 72, boxH, null, 20);
  text(ctx, "THÀNH TÍCH THEO TỪNG NGHỀ NGHIỆP", 60, 354, { font: f("800", 15), color: T.green });

  if (!rows.length) {
    text(ctx, "Chưa có dữ liệu làm việc ở bất kỳ nghề nào.", W / 2, 404, {
      font: f("normal", 17),
      color: T.muted,
      align: "center",
    });
  }

  rows.forEach((r, i) => {
    const y = 372 + i * 64;
    const col = GROUP_COLOR[r.job.group] || T.purple;
    if (i > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(60, y - 6, W - 120, 1);
    }
    badge(ctx, r.job.group, 82, y + 24, 20, col);
    text(ctx, r.job.name, 116, y + 20, { font: f("bold", 18), color: T.text, max: 380 });
    text(ctx, `${st.RANKS[r.rank].name}  ·  ${r.days} ngày công  ·  ${r.shifts} ca hoàn thành`, 116, y + 43, {
      font: f("normal", 14),
      color: T.subText,
      max: 460,
    });
    text(ctx, fmt(r.income), W - 60, y + 32, { font: f("800", 20), color: T.gold, align: "right" });
  });

  footer(ctx, h, "HNNP STUDIO · Dữ liệu thống kê được đồng bộ thời gian thực");
  return png(cv);
}

export async function renderTop(kind, rows, prefix) {
  const label = { tien: "TỔNG THU NHẬP", ngay: "SỐ NGÀY CÔNG", cap: "CẤP BẬC NGHỀ" }[kind] || "TỔNG THU NHẬP";
  const h = 158 + Math.max(1, rows.length) * 70 + 80;
  const { cv, ctx } = newCanvas(h, T.gold);

  header(ctx, "BẢNG VÀNG XẾP HẠNG", `Xếp hạng người chơi theo ${label.toLowerCase()}`, T.gold, `TOP ${rows.length || 10}`);

  if (!rows.length) {
    panel(ctx, 36, 136, W - 72, 90, null, 18);
    text(ctx, "Chưa có người chơi nào ghi danh trên bảng xếp hạng.", W / 2, 188, {
      font: f("bold", 18),
      color: T.muted,
      align: "center",
    });
  }

  const medalColors = ["#fbbf24", "#e2e8f0", "#f97316"];
  rows.forEach((r, i) => {
    const y = 130 + i * 70;
    const isTop3 = i < 3;
    const mCol = isTop3 ? medalColors[i] : null;

    panel(ctx, 36, y, W - 72, 60, mCol, 16, { leftBar: isTop3, glow: i === 0 });

    // Huy chương hạng
    const cx = 74;
    const cy = y + 30;
    ctx.beginPath();
    ctx.arc(cx, cy, 19, 0, Math.PI * 2);
    ctx.fillStyle = isTop3 ? mCol : "rgba(255,255,255,0.1)";
    ctx.fill();
    text(ctx, String(r.pos), cx, cy + 6, {
      font: f("800", 17),
      color: isTop3 ? "#090d16" : T.text,
      align: "center",
    });

    text(ctx, r.name || r.uid, 110, y + 27, {
      font: f("800", 19),
      color: i === 0 ? T.gold : T.text,
      max: 380,
    });
    text(ctx, `${r.jobName || "Chưa có việc"}  ·  ${r.rankName}`, 110, y + 48, {
      font: f("normal", 13),
      color: T.subText,
      max: 420,
    });

    const val = kind === "tien" ? fmt(r.totalIncome) : kind === "ngay" ? `${r.daysWorked} ngày công` : r.rankName;
    text(ctx, val, W - 58, y + 37, {
      font: f("800", 21),
      color: isTop3 ? mCol : T.gold,
      align: "right",
      max: 250,
    });
  });

  footer(ctx, h, `${prefix}work top tien  ·  ${prefix}work top ngay  ·  ${prefix}work top cap`);
  return png(cv);
}

export async function renderNotice({ title, lines = [], kind = "info", sub = "", prefix }) {
  const col = { ok: T.green, err: T.red, warn: T.gold, info: T.blue }[kind] || T.blue;
  const badgeText = { ok: "THÀNH CÔNG", err: "THÔNG BÁO LỖI", warn: "LƯU Ý", info: "THÔNG TIN" }[kind] || "THÔNG BÁO";
  const wrapped = lines.flatMap((l) => measureLines(l, W - 180, f("normal", 19)));
  const boxH = Math.max(100, 48 + wrapped.length * 32);
  const h = 190 + boxH + 56;
  const { cv, ctx } = newCanvas(h, col);

  header(ctx, title, sub || "Hệ thống quản lý nghề nghiệp", col, badgeText);

  panel(ctx, 36, 128, W - 72, boxH, col, 20, { leftBar: true, glow: true });

  // Biểu tượng trạng thái lớn bên trái
  const icX = 88;
  const icY = 128 + boxH / 2;
  ctx.beginPath();
  ctx.arc(icX, icY, 26, 0, Math.PI * 2);
  ctx.fillStyle = hexA(col, 0.2);
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const sym = kind === "ok" ? "✓" : kind === "err" ? "✕" : kind === "warn" ? "!" : "i";
  text(ctx, sym, icX, icY + 9, { font: f("800", 26), color: col, align: "center" });

  wrapped.forEach((l, i) => {
    text(ctx, l, 134, 166 + i * 32, { font: f("600", 19), color: T.text });
  });

  footer(ctx, h, "HNNP STUDIO · Hệ thống nghề nghiệp");
  return png(cv);
}

export async function renderHelp(prefix) {
  const cmds = [
    ["", "Mở hồ sơ nghề nghiệp & bảng điều khiển tổng quan"],
    ["nghenghiep [nhóm] [trang]", "Xem danh sách 50 nghề nghiệp (lọc theo 5 nhóm ngành)"],
    ["xin viec <tên nghề>", "Ứng tuyển vào công việc mong muốn"],
    ["lam", "Bắt đầu ca làm mới hoặc tiếp tục ca đang dở"],
    ["tl <đáp án>", "Trả lời câu hỏi ca làm (hoặc reply trực tiếp vào ảnh)"],
    ["nhiemvu · trangthai", "Kiểm tra danh sách nhiệm vụ & trạng thái nghề"],
    ["luong · thangcap", "Xem bảng kê chế độ lương & lộ trình 8 bậc thăng tiến"],
    ["lichsu [trang] · thongke", "Xem nhật ký hoạt động & thống kê sự nghiệp"],
    ["diem danh", "Điểm danh hằng ngày nhận thưởng chuyên cần"],
    ["top [tien|ngay|cap]", "Xem bảng vàng xếp hạng thu nhập, ngày công, cấp bậc"],
    ["huyca · nghi viec", "Hủy ca đang làm (không lương) hoặc nộp đơn nghỉ việc"],
  ];

  const h = 185 + cmds.length * 54 + 66;
  const { cv, ctx } = newCanvas(h, T.purple);

  header(ctx, "CẨM NANG LỆNH .WORK", "Chọn nghề phù hợp, hoàn thành ca làm mỗi ngày và thăng tiến", T.purple, "50 NGHỀ · 8 CẤP");

  cmds.forEach(([cmdStr, descStr], i) => {
    const y = 128 + i * 54;
    panel(ctx, 36, y, W - 72, 46, null, 13);

    const fullCmd = `${prefix}work ${cmdStr}`.trim();
    chip(ctx, fullCmd, 48, y + 9, T.gold, { h: 28, font: f("800", 14), pad: 14 });
    text(ctx, descStr, 365, y + 29, { font: f("normal", 15), color: T.text, max: W - 410 });
  });

  const gy = h - 72;
  chip(
    ctx,
    "5 Nhóm ngành:  laodong  ·  dichvu  ·  congnghe  ·  sangtao  ·  chuyenmon",
    W / 2,
    gy,
    T.blue,
    { h: 28, font: f("bold", 13), pad: 22, align: "center" }
  );

  footer(ctx, h, "Mỗi ngày làm 1 ca chính thức · Thù lao tính theo cấp bậc & độ chính xác");
  return png(cv);
}

// ════════════════════════════ LỆNH & XỬ LÝ SỰ KIỆN ════════════════════════════
const TMP_DIR = path.join(os.tmpdir(), "hnnp-work");
const prefixOf = (config) => String(config?.botPrefix || ".");
const norm = (s) => normName(s).replace(/ /g, "");

/** Gom mọi id tin nhắn trong kết quả gửi của zca (msgId / cliMsgId / globalMsgId, lồng nhau). */
function collectIds(info, depth = 0, out = new Set()) {
  if (info == null || depth > 5) return out;
  if (Array.isArray(info)) {
    for (const x of info) collectIds(x, depth + 1, out);
    return out;
  }
  if (typeof info === "object") {
    for (const k of ["msgId", "cliMsgId", "globalMsgId", "realMsgId"]) {
      if (info[k] != null && info[k] !== "") out.add(String(info[k]));
    }
    for (const v of Object.values(info)) {
      if (v && typeof v === "object") collectIds(v, depth + 1, out);
    }
  }
  return out;
}
const quoteIdsOf = (q) =>
  q ? ["msgId", "cliMsgId", "globalMsgId", "realMsgId"].map((k) => q[k]).filter((v) => v != null && v !== "").map(String) : [];

// ── phiên chờ (reply đáp án / xác nhận) ──
const sessions = new Map();
const sk = (uid, tid) => `${uid}|${tid}`;
function setS(uid, tid, data, ttl) {
  if (sessions.size > 400) pruneS();
  sessions.set(sk(uid, tid), { ...data, expiresAt: Date.now() + ttl });
}
function getS(uid, tid) {
  const d = sessions.get(sk(uid, tid));
  if (!d) return null;
  if (d.expiresAt < Date.now()) {
    sessions.delete(sk(uid, tid));
    return null;
  }
  return d;
}
function clearS(uid, tid) {
  sessions.delete(sk(uid, tid));
}
function pruneS() {
  const n = Date.now();
  for (const [k, v] of sessions) if (v.expiresAt < n) sessions.delete(k);
}
export function _resetSessionsForTests() {
  sessions.clear();
}
export function _sessionsForTests() {
  return sessions;
}

async function sendPng(c, buffer, caption = "") {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, `work-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
  try {
    fs.writeFileSync(file, buffer);
    const info = await c.adapter.sendImage({
      threadId: c.threadId,
      threadType: c.threadType,
      imagePath: file,
      caption: caption || undefined,
    });
    return { ok: true, ids: [...collectIds(info)] };
  } catch (err) {
    c.logger?.warn?.("[work] gửi ảnh lỗi:", err?.message);
    return { ok: false, ids: [] };
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
      /* đã xóa */
    }
  }
}

async function sendText(c, t) {
  try {
    const info = await c.adapter.sendText({ threadId: c.threadId, threadType: c.threadType, text: t });
    return { ok: true, ids: [...collectIds(info)] };
  } catch (err) {
    c.logger?.warn?.("[work] gửi chữ lỗi:", err?.message);
    return { ok: false, ids: [] };
  }
}

/** Vẽ → gửi ảnh; vẽ/gửi lỗi → gửi chữ dự phòng (không bao giờ làm sập lệnh). */
async function card(c, render, fallback, caption = "") {
  let buf = null;
  try {
    buf = await render();
  } catch (err) {
    c.logger?.warn?.("[work] lỗi vẽ Canvas:", err?.message);
  }
  if (buf) {
    const r = await sendPng(c, buf, caption);
    if (r.ok) return r;
  }
  return sendText(c, [caption, fallback].filter(Boolean).join("\n"));
}

const notice = (c, title, lines, kind = "info", sub = "") =>
  card(c, () => renderNotice({ title, lines, kind, sub, prefix: c.prefix }), [title, ...lines].join("\n"));

async function avatarFor(c) {
  try {
    const r = await Promise.race([
      getPlayerAvatarPath(c.uid, { adapter: c.adapter }),
      new Promise((res) => setTimeout(() => res(null), 3500)),
    ]);
    return r?.path || null;
  } catch {
    return null;
  }
}

const ERR_TITLE = {
  NO_JOB: "KHÔNG TÌM THẤY NGHỀ",
  SAME_JOB: "ĐANG LÀM NGHỀ NÀY",
  HAS_JOB: "BẠN ĐANG CÓ VIỆC",
  LOCKED: "CHƯA ĐỦ ĐIỀU KIỆN",
  NO_JOB_NOW: "CHƯA CÓ VIỆC LÀM",
  DAILY_DONE: "ĐÃ XONG CA HÔM NAY",
  CAP_REACHED: "ĐẠT TRẦN THU NHẬP",
  NO_SHIFT: "CHƯA VÀO CA",
  EXPIRED: "CA LÀM HẾT HẠN",
  SETTLING: "ĐANG TÍNH LƯƠNG",
  ALREADY_ATT: "ĐÃ ĐIỂM DANH",
  SHIFT_FAILED: "CA LÀM THẤT BẠI",
  UNFINISHED: "CÒN CA CHƯA XONG",
};

async function replyError(c, err) {
  if (err instanceof WorkError) {
    if (err.code === "COOLDOWN" || err.code === "TOO_FAST" || err.code === "INVALID_INPUT") {
      return sendText(c, err.message);
    }
    return notice(
      c,
      ERR_TITLE[err.code] || "KHÔNG THỂ THỰC HIỆN",
      [err.message],
      err.code === "ALREADY_ATT" || err.code === "DAILY_DONE" ? "warn" : "err"
    );
  }
  c.logger?.error?.("[work] lỗi:", err);
  return sendText(c, "Có lỗi khi xử lý lệnh nghề nghiệp, vui lòng thử lại sau.");
}

// ── các màn hình dùng chung ──
async function showShift(c, view, { restored = false, caption = "" } = {}) {
  const fb = `${view.task.name} (${view.task.done}/${view.task.count})\n${view.challenge.prompt}\n${(
    view.challenge.options || []
  )
    .map((o, i) => `${i + 1}. ${o}`)
    .join("\n")}${view.challenge.code ? `\nMã: ${view.challenge.code}` : ""}\nTrả lời: ${c.prefix}work tl <đáp án>`;
  const r = await card(
    c,
    () =>
      renderShift({
        job: view.job,
        shift: view.shift,
        task: view.task,
        challenge: view.challenge,
        restored,
        prefix: c.prefix,
      }),
    fb,
    caption
  );
  setS(c.uid, c.threadId, { type: "ANSWER", ids: r.ids, shiftId: view.shift.id }, c.E.cfg.session.answerTtlMs);
}

function settleResult(c, r) {
  const E = c.E;
  return {
    ...r,
    job: E.getJob(r.jobId),
    rankBeforeName: E.rankInfo(r.rankBefore).name,
    rankAfterName: E.rankInfo(r.rankAfter).name,
  };
}

async function showSettlement(c, st, caption = "") {
  const res = settleResult(c, st.result);
  const fb = `Hoàn thành ca! +${fmt(res.wage)} · +${res.exp} EXP · chính xác ${Math.round(res.accuracy * 100)}%${
    res.promoted ? `\nThăng cấp: ${res.rankBeforeName} → ${res.rankAfterName}` : ""
  }\nSố dư: ${fmt(st.balance)}`;
  await card(c, () => renderSettlement(res, st.balance, c.prefix), fb, caption);
  if (res.promoted) {
    const E = c.E;
    const ps = await E.promotionStatus(c.uid);
    await card(
      c,
      () =>
        renderPromotion({
          job: res.job,
          progress: ps.progress,
          promoted: true,
          before: res.rankBefore,
          after: res.rankAfter,
          prefix: c.prefix,
          RANKS: E.RANKS,
        }),
      `Thăng cấp: ${res.rankBeforeName} → ${res.rankAfterName}`
    );
  }
  clearS(c.uid, c.threadId);
}

async function cmdDashboard(c) {
  const E = c.E;
  const d = await E.dashboard(c.uid, c.userName);
  const { expRequiredForLevel } = await import("./data/GIAITRI/PlayerProfile/index.js");
  d.nextExp = expRequiredForLevel(d.level) || 1;
  d.expPct = d.nextExp ? d.exp / d.nextExp : 1;
  d.doneToday = d.player.lastShiftDate === d.today && (d.player.shiftsToday?.[d.today] || 0) >= 1;
  const av = await avatarFor(c);
  const fb = `HỒ SƠ NGHỀ NGHIỆP\n${d.player.name} · Cấp ${d.level} · ${fmt(d.balance)}\nNghề: ${
    d.job ? `${d.job.name} (${d.rank.name})` : "chưa có"
  }\nNgày công: ${d.player.daysWorked} · Tổng thu nhập: ${fmt(d.player.totalIncome)}\n${c.prefix}work help để xem lệnh`;
  return card(c, () => renderDashboard(d, av, c.prefix), fb);
}

async function cmdJobs(c, args) {
  const E = c.E;
  let page = 1;
  const rest = args.slice();
  if (rest.length && /^\d+$/.test(rest[rest.length - 1])) page = Number(rest.pop());
  let group = null;
  if (rest.length) {
    group = E.findGroup(rest.join(" "));
    if (!group) {
      return notice(
        c,
        "NHÓM NGHỀ KHÔNG HỢP LỆ",
        ["Các nhóm: laodong, dichvu, congnghe, sangtao, chuyenmon"],
        "err"
      );
    }
  }
  const p = await E.getPlayer(c.uid);
  const level = await E.levelOf(c.uid);
  const all = E.listJobs({ group });
  const size = E.cfg.jobList.pageSize;
  const pages = Math.max(1, Math.ceil(all.length / size));
  page = Math.min(Math.max(1, page), pages);
  const rows = all
    .slice((page - 1) * size, page * size)
    .map((job) => ({ job, index: E.JOBS.indexOf(job) + 1, status: E.jobStatus(job, level, p) }));
  const fb = `Nghề (trang ${page}/${pages}):\n${rows
    .map((r) => `${r.index}. ${r.job.name} — cấp ${r.job.levelRequired} — ${fmt(r.job.baseWage)}/ca — ${r.status.label}`)
    .join("\n")}`;
  return card(
    c,
    () =>
      renderJobs({
        rows,
        page,
        pages,
        group,
        groupName: group ? E.GROUPS[group].name : "",
        level,
        prefix: c.prefix,
        total: all.length,
      }),
    fb
  );
}

async function cmdApply(c, args) {
  const E = c.E;
  const q = args.join(" ").trim();
  if (!q) {
    return notice(
      c,
      "XIN VIỆC",
      [`Cú pháp: ${c.prefix}work xin viec <tên nghề>`, `Xem danh sách: ${c.prefix}work nghenghiep`],
      "info"
    );
  }
  const found = E.findJobs(q);
  if (!found.length) {
    return notice(
      c,
      "KHÔNG TÌM THẤY NGHỀ",
      [`Không có nghề nào khớp "${q}".`, `Gõ ${c.prefix}work nghenghiep để xem danh sách.`],
      "err"
    );
  }
  if (found.length > 1) {
    return notice(
      c,
      "NHIỀU NGHỀ KHỚP",
      [`Có ${found.length} nghề khớp "${q}":`, ...found.slice(0, 6).map((j) => `• ${j.name}`), "Hãy gõ rõ tên hơn."],
      "warn"
    );
  }
  const job = found[0];
  const check = await E.checkApply(c.uid, job);
  if (check.code === "HAS_JOB" || check.code === "SAME_JOB") {
    return notice(
      c,
      ERR_TITLE[check.code],
      [check.reasons[0] + ".", `Dùng ${c.prefix}work nghi viec nếu muốn đổi nghề.`],
      "warn"
    );
  }
  const fb = `${job.name}\nLương cơ bản ${fmt(job.baseWage)}/ca · EXP +${job.exp}\nCấp yêu cầu ${
    job.levelRequired
  } (bạn ${check.level})${
    check.ok ? '\nTrả lời "yes" để xác nhận, "no" để hủy.' : `\nKhông đủ điều kiện: ${check.reasons.join("; ")}`
  }`;
  const r = await card(c, () => renderApply({ job, check, level: check.level, prefix: c.prefix }), fb);
  if (check.ok) {
    setS(c.uid, c.threadId, { type: "CONFIRM_APPLY", jobId: job.id, ids: r.ids }, E.cfg.cooldowns.applyConfirmTtlMs);
  }
}

async function cmdQuit(c) {
  const E = c.E;
  const p = await E.getPlayer(c.uid);
  if (!p.jobId) return replyError(c, new WorkError("NO_JOB_NOW", "Bạn chưa có việc làm."));
  const job = E.getJob(p.jobId);
  const unfinished = !!p.shift;
  await notice(
    c,
    "XÁC NHẬN NGHỈ VIỆC",
    [
      `Bạn sẽ nghỉ việc: ${job.name}.`,
      unfinished
        ? "CẢNH BÁO: ca làm đang dở sẽ bị hủy và KHÔNG nhận lương."
        : "Lịch sử, EXP nghề và tiền của bạn được giữ nguyên.",
      'Trả lời "yes" để xác nhận, "no" để hủy.',
    ],
    "warn"
  );
  setS(c.uid, c.threadId, { type: "CONFIRM_QUIT" }, E.cfg.cooldowns.applyConfirmTtlMs);
}

async function cmdWork(c) {
  const E = c.E;
  const r = await E.startShift(c.uid, c.userName);
  const view = await E.shiftView(c.uid);
  return showShift(c, view, {
    restored: r.restored,
    caption: r.restored
      ? "Tiếp tục ca làm hôm nay."
      : `Bắt đầu ca làm: ${r.job.name}. Hôm nay có ${r.shift.tasks.length} nhiệm vụ.`,
  });
}

async function doAnswer(c, input) {
  const E = c.E;
  let out;
  try {
    out = await E.submitAnswer(c.uid, input);
  } catch (err) {
    if (err instanceof WorkError && err.code === "SHIFT_FAILED") clearS(c.uid, c.threadId);
    return replyError(c, err);
  }
  if (out.settlement) {
    const st = out.settlement;
    if (st.done && st.result) return showSettlement(c, st, "Bạn đã hoàn thành tất cả nhiệm vụ!");
    return sendText(
      c,
      `Đã hoàn thành ca, đang tính lương (${st.reason || "xử lý"}). Gõ ${c.prefix}work lam để hệ thống thử lại.`
    );
  }
  const cap = out.correct
    ? out.taskDone
      ? `Chính xác! Hoàn thành nhiệm vụ: ${out.taskName}`
      : "Chính xác! Tiến độ đã được lưu."
    : `Chưa đúng${out.rerolled ? " — câu hỏi đã được đổi" : ""}. Hãy thử lại.`;
  return showShift(c, out.view, { caption: cap });
}

async function cmdTasks(c) {
  const E = c.E;
  const v = await E.shiftView(c.uid);
  const p = v.player;
  if (!p.jobId) return replyError(c, new WorkError("NO_JOB_NOW", "Bạn chưa có việc làm."));
  const job = E.getJob(p.jobId);
  const doneToday = p.lastShiftDate === E.today() && (p.shiftsToday?.[E.today()] || 0) >= 1;
  const preview = job.taskIds
    .map((id) => E.TASK_BY_ID.get(id))
    .filter(Boolean)
    .map((t) => ({ name: t.name, count: t.count, kind: t.kind, validation: t.validation }));
  const shift = v.shift
    ? { ...v.shift, tasks: v.shift.tasks.map((t) => ({ ...t, validation: E.TASK_BY_ID.get(t.taskId)?.validation })) }
    : null;
  const fb = (shift ? shift.tasks : preview)
    .map((t, i) => `${i + 1}. ${t.name} — ${shift ? `${t.done}/${t.count}` : `cần ${t.count}`}`)
    .join("\n");
  return card(
    c,
    () => renderTasks({ job, shift, prefix: c.prefix, doneToday, tasksPreview: preview }),
    `Nhiệm vụ:\n${fb}`
  );
}

async function cmdStatus(c) {
  const E = c.E;
  const p = await E.getPlayer(c.uid);
  if (!p.jobId) return card(c, () => renderStatus({ job: null }, c.prefix), "Bạn chưa có việc làm.");
  const job = E.getJob(p.jobId);
  const js = E.jobState(p, job.id);
  const v = {
    job,
    rank: E.rankInfo(js.rank),
    js,
    progress: E.nextRankProgress(p, job),
    shift: p.shift,
    doneToday: p.lastShiftDate === E.today() && (p.shiftsToday?.[E.today()] || 0) >= 1,
  };
  return card(c, () => renderStatus(v, c.prefix), `${job.name} · ${v.rank.name} · ${js.jobExp} EXP nghề · ${js.days} ngày`);
}

async function cmdPayroll(c) {
  const pr = await c.E.payroll(c.uid);
  return card(
    c,
    () => renderPayroll(pr, c.prefix),
    `Bảng lương ${pr.job.name} (${pr.rank.name}): ${fmt(pr.min)} – ${fmt(pr.perfect)}/ca · đã nhận hôm nay ${fmt(
      pr.earnedToday
    )}`
  );
}

async function cmdPromote(c) {
  const E = c.E;
  const r = await E.promote(c.uid);
  return card(
    c,
    () =>
      renderPromotion({
        job: r.job,
        progress: r.progress,
        promoted: r.promoted,
        before: r.before,
        after: r.after,
        prefix: c.prefix,
        RANKS: E.RANKS,
      }),
    r.promoted
      ? `Thăng cấp: ${E.rankInfo(r.before).name} → ${E.rankInfo(r.after).name}`
      : `Cấp hiện tại: ${r.progress.current.name}`
  );
}

async function cmdHistory(c, args) {
  const page = Number(args[0]) > 0 ? Number(args[0]) : 1;
  const hs = c.E.history(c.uid, page);
  return card(
    c,
    () => renderHistory(hs, c.prefix),
    hs.items.length
      ? hs.items
          .map(
            (e) =>
              `${new Date(e.ts).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · ${e.detail}${
                e.money ? ` · +${fmt(e.money)}` : ""
              }`
          )
          .join("\n")
      : "Chưa có lịch sử."
  );
}

async function cmdStats(c) {
  const st = await c.E.stats(c.uid);
  st.RANKS = c.E.RANKS;
  return card(
    c,
    () => renderStats(st, c.prefix),
    `Thống kê: ${st.player.daysWorked} ngày công · ${st.player.shiftsDone} ca · tổng thu nhập ${fmt(
      st.player.totalIncome
    )}`
  );
}

async function cmdTop(c, args) {
  const k = norm(args[0] || "tien");
  const kind = ["tien", "ngay", "cap"].includes(k) ? k : "tien";
  const rows = c.E.top(kind);
  return card(
    c,
    () => renderTop(kind, rows, c.prefix),
    rows.length
      ? rows
          .map(
            (r) =>
              `${r.pos}. ${r.name} — ${
                kind === "tien" ? fmt(r.totalIncome) : kind === "ngay" ? r.daysWorked + " ngày" : r.rankName
              }`
          )
          .join("\n")
      : "Chưa có dữ liệu xếp hạng."
  );
}

async function cmdAttendance(c) {
  const r = await c.E.attendance(c.uid, c.userName);
  if (!r.done || !r.result) {
    return sendText(c, "Điểm danh đã ghi nhận, đang hoàn tất cộng thưởng. Thử lại sau giây lát.");
  }
  const x = r.result;
  return notice(
    c,
    "ĐIỂM DANH THÀNH CÔNG",
    [
      `Chuỗi điểm danh chuyên cần: ${x.streak} ngày liên tiếp`,
      `Phần thưởng: +${fmt(x.reward)}  ·  +${x.exp} EXP  ·  +${x.jobExp} EXP nghề`,
      `Số dư ví hiện tại: ${fmt(r.balance)}`,
      "Điểm danh là phần thưởng thêm, không thay thế lương ca làm việc.",
    ],
    "ok"
  );
}

async function cmdCancel(c) {
  const r = await c.E.cancelShift(c.uid);
  clearS(c.uid, c.threadId);
  return notice(
    c,
    "ĐÃ HỦY CA LÀM",
    [
      `Ca làm việc ${r.job?.name || ""} đã được hủy (${r.progress}/${r.total} nhiệm vụ).`,
      "Ca bị hủy không nhận lương. Bạn có thể bắt đầu lại bất cứ lúc nào bằng lệnh làm.",
    ],
    "warn"
  );
}

const SUB = {
  help: "help",
  huongdan: "help",
  hd: "help",
  "?": "help",
  nghenghiep: "jobs",
  nghe: "jobs",
  jobs: "jobs",
  ds: "jobs",
  danhsach: "jobs",
  xinviec: "apply",
  xin: "apply",
  apply: "apply",
  lam: "work",
  work: "work",
  ca: "work",
  start: "work",
  vaoca: "work",
  tl: "answer",
  traloi: "answer",
  dapan: "answer",
  answer: "answer",
  a: "answer",
  nghiviec: "quit",
  nghi: "quit",
  quit: "quit",
  nhiemvu: "tasks",
  nv: "tasks",
  tasks: "tasks",
  trangthai: "status",
  tt: "status",
  status: "status",
  luong: "payroll",
  bangluong: "payroll",
  payroll: "payroll",
  lichsu: "history",
  history: "history",
  thangcap: "promote",
  promote: "promote",
  thongke: "stats",
  stats: "stats",
  diemdanh: "attendance",
  diem: "attendance",
  dd: "attendance",
  checkin: "attendance",
  top: "top",
  bxh: "top",
  huyca: "cancel",
  huy: "cancel",
  cancel: "cancel",
};

export default {
  name: "work",
  description: "Nghề nghiệp — 50 nghề, ca làm hằng ngày, lương, thăng cấp (Canvas Celestial Glass)",
  version: "2.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 1,
  aliases: ["job", "nghe", "nghenghiep", "congviec"],
  noPrefix: false,

  async run({ adapter, message, args = [], config, logger }) {
    const threadId = String(message.threadId);
    const c = {
      adapter,
      config,
      logger,
      threadId,
      threadType: message.type === 1 ? "group" : "user",
      uid: String(message.data?.uidFrom || "").trim(),
      userName: String(message.data?.dName || "Người chơi").slice(0, 40),
      prefix: prefixOf(config),
      E: getEngine(),
    };
    if (!c.uid) return sendText(c, "Không xác định được UID của bạn.");
    try {
      c.E.throttle(c.uid);
      let rest = args.map(String);
      let first = norm(rest[0] || "");
      // ghép "xin viec", "nghi viec", "diem danh"
      if (["xin", "nghi", "diem"].includes(first) && rest[1] && ["viec", "danh"].includes(norm(rest[1]))) {
        first += norm(rest[1]);
        rest = rest.slice(2);
      } else {
        rest = rest.slice(1);
      }
      const action = !first ? "dash" : SUB[first] || (/^[1-9]$|^[a-d]$/i.test(first) ? "answer" : null);
      const rawFirst = String(args[0] ?? "");
      if (!action) {
        return notice(
          c,
          "LỆNH KHÔNG HỢP LỆ",
          [`Không tìm thấy lệnh con "${rawFirst}".`, `Gõ ${c.prefix}work help để xem cẩm nang hướng dẫn.`],
          "err"
        );
      }

      // phục hồi giao dịch dở dang (mất điện / lỗi giữa chừng) trước khi làm việc khác
      if (action !== "help") {
        const rec = await c.E.recover(c.uid).catch(() => ({}));
        if (rec?.settle?.done && rec.settle.result) {
          await showSettlement(c, rec.settle, "Hệ thống đã hoàn tất tính lương cho ca trước của bạn.");
        }
      }
      switch (action) {
        case "dash":
          return await cmdDashboard(c);
        case "help":
          return await card(
            c,
            () => renderHelp(c.prefix),
            `Lệnh: ${c.prefix}work [nghenghiep|xin viec|lam|tl|nhiemvu|trangthai|luong|lichsu|thangcap|thongke|diem danh|top|huyca|nghi viec]`
          );
        case "jobs":
          return await cmdJobs(c, rest);
        case "apply":
          return await cmdApply(c, rest);
        case "work":
          return await cmdWork(c);
        case "answer":
          return await doAnswer(
            c,
            /^[1-9]$|^[a-d]$/i.test(first) && action === "answer" && !SUB[first] ? rawFirst : rest.join(" ")
          );
        case "quit":
          return await cmdQuit(c);
        case "tasks":
          return await cmdTasks(c);
        case "status":
          return await cmdStatus(c);
        case "payroll":
          return await cmdPayroll(c);
        case "history":
          return await cmdHistory(c, rest);
        case "promote":
          return await cmdPromote(c);
        case "stats":
          return await cmdStats(c);
        case "top":
          return await cmdTop(c, rest);
        case "attendance":
          return await cmdAttendance(c);
        case "cancel":
          return await cmdCancel(c);
        default:
          return undefined;
      }
    } catch (err) {
      return replyError(c, err);
    }
  },

  /** Reply vào ảnh câu hỏi bằng đáp án / trả lời yes-no khi đang chờ xác nhận. */
  async onMessage({ adapter, message, config, logger }) {
    try {
      if (!message || message.isSelf) return;
      const data = message.data || {};
      if (typeof data.content !== "string") return;
      const uid = String(data.uidFrom || "").trim();
      const threadId = String(message.threadId);
      if (!uid) return;
      const s = getS(uid, threadId);
      if (!s) return;
      let content = data.content;
      if (Array.isArray(data.mentions) && data.mentions.length) {
        for (const m of [...data.mentions].sort((a, b) => (b.pos ?? 0) - (a.pos ?? 0))) {
          const p0 = Number(m.pos),
            l = Number(m.len);
          if (Number.isFinite(p0) && Number.isFinite(l)) content = content.slice(0, p0) + content.slice(p0 + l);
        }
      }
      content = content.trim();
      const prefix = prefixOf(config);
      if (!content || content.startsWith(prefix)) return;
      const c = {
        adapter,
        config,
        logger,
        threadId,
        threadType: message.type === 1 ? "group" : "user",
        uid,
        userName: String(data.dName || "Người chơi").slice(0, 40),
        prefix,
        E: getEngine(),
      };
      const consume = () => {
        message.__workConsumed = true;
        if (typeof message.data.content === "string") message.data.content = "";
      };
      if (s.type === "CONFIRM_APPLY" || s.type === "CONFIRM_QUIT") {
        const w = norm(content);
        const yes = ["yes", "y", "co", "dongy", "ok", "xacnhan"].includes(w);
        const no = ["no", "n", "khong", "huy", "thoi"].includes(w);
        if (!yes && !no) return;
        consume();
        clearS(uid, threadId);
        if (no) return void (await sendText(c, "Đã hủy."));
        try {
          if (s.type === "CONFIRM_APPLY") {
            const r = await c.E.applyJob(uid, s.jobId, c.userName);
            const check = { ok: true, player: r.player, reasons: [] };
            const lv = await c.E.levelOf(uid);
            return void (await card(
              c,
              () => renderApply({ job: r.job, check, level: lv, prefix, confirmed: true }),
              `Xin việc thành công: ${r.job.name}. Gõ ${prefix}work lam để vào ca.`
            ));
          }
          const r = await c.E.quitJob(uid, { confirm: true });
          return void (await notice(
            c,
            "ĐÃ NGHỈ VIỆC",
            [
              `Bạn đã nghỉ việc: ${r.job.name}.`,
              r.cancelledShift ? "Ca làm dở đã bị hủy, không có lương." : "Lịch sử, EXP nghề và tiền được giữ nguyên.",
              `Xin nghề mới bằng ${prefix}work xin viec <tên nghề>.`,
            ],
            "ok"
          ));
        } catch (err) {
          return void (await replyError(c, err));
        }
      }
      if (s.type === "ANSWER") {
        const q = data.quote;
        if (!q) return; // chỉ nhận khi reply vào ảnh câu hỏi
        const own = String(adapter?.raw?.getOwnId?.() ?? "");
        const qOwner = String(q.ownerId ?? "");
        const match = quoteIdsOf(q).some((id) => s.ids.includes(id)) || (own && qOwner === own);
        if (!match) return;
        let ans = content;
        if (/@/.test(ans)) ans = ans.replace(/^(?:@\S+\s*)+/, "").trim();
        if (!ans) return;
        consume();
        return void (await doAnswer(c, ans.split(/\s+/)[0]));
      }
    } catch (err) {
      logger?.warn?.("[work] onMessage lỗi:", err?.message);
    }
  },
};