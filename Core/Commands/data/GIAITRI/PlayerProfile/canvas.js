import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, registerFont } from "canvas";
import { getConfiguredBotName } from "../../../../../Utils/Branding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(__dirname, "..", "..", "MEDIA", "fonts");
const FONT = "ProfileSans";

if (fs.existsSync(fontDir)) {
  const fonts = [
    { file: "BeVietnamPro_700Bold.ttf", weight: "bold" },
    { file: "BeVietnamPro_600SemiBold.ttf", weight: "600" },
    { file: "BeVietnamPro_400Regular.ttf", weight: "normal" },
    { file: "BeVietnamPro_800ExtraBold.ttf", weight: "800" },
  ];
  for (const { file, weight } of fonts) {
    const p = path.join(fontDir, file);
    if (fs.existsSync(p)) {
      try {
        registerFont(p, { family: FONT, weight });
      } catch {
        /* ignore */
      }
    }
  }
}

const COLORS = {
  bgMain: "#07111F",
  bgSub: "#0B1830",
  panel: "#10213A",
  border: "#2563EB",
  cyan: "#22D3EE",
  purple: "#A855F7",
  pink: "#EC4899",
  green: "#22C55E",
  gold: "#FACC15",
  text: "#F8FAFC",
  muted: "#94A3B8",
  track: "#1a2a42",
};

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncate(ctx, text, maxWidth) {
  let s = String(text || "");
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length > 0 && ctx.measureText(`${s}…`).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

function drawProgressBar(ctx, x, y, w, h, progress, colors) {
  const p = Math.min(1, Math.max(0, progress));
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = COLORS.track;
  ctx.fill();
  ctx.strokeStyle = "rgba(37, 99, 235, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (p > 0.01) {
    const fillW = Math.max(h, w * p);
    const grad = ctx.createLinearGradient(x, y, x + fillW, y);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    roundRect(ctx, x, y, fillW, h, h / 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // soft highlight
    ctx.globalAlpha = 0.25;
    roundRect(ctx, x + 2, y + 2, fillW - 4, h * 0.35, h / 4);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

async function loadAvatarImage(view) {
  // Priority: avatarPath (custom/zalo cache) → customAvatar → Zalo URL → null
  const candidates = [];
  if (view.avatarPath) candidates.push(view.avatarPath);
  if (view.customAvatar) candidates.push(view.customAvatar);
  // convention cache zalo_{uid}.jpg/png
  if (view.userId) {
    const avDir = path.join(__dirname, "avatars");
    candidates.push(
      path.join(avDir, `zalo_${view.userId}.jpg`),
      path.join(avDir, `zalo_${view.userId}.png`),
      path.join(avDir, `${view.userId}.jpg`),
      path.join(avDir, `${view.userId}.png`),
      path.join(avDir, `${view.userId}.webp`),
    );
  }
  for (const p of candidates) {
    if (!p || !fs.existsSync(p)) continue;
    try {
      return await loadImage(p);
    } catch {
      /* try next */
    }
  }
  if (view.zaloAvatarUrl) {
    try {
      return await loadImage(view.zaloAvatarUrl);
    } catch {
      /* fall through */
    }
  }
  return null;
}

function findLogoPath() {
  const candidates = [
    path.join(__dirname, "..", "..", "KINHTE", "QRAPIAssets", "logos", "logo.png"),
    path.join(__dirname, "..", "..", "KINHTE", "QRAPIAssets", "logos", "logo.png"),
    path.join(__dirname, "..", "..", "..", "..", "..", "assets", "logo.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Render player profile card.
 * @param {object} view - from getProfileView()
 */
export async function renderProfileCanvas(view) {
  const width = 900;
  const height = 720;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, COLORS.bgMain);
  bg.addColorStop(1, COLORS.bgSub);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Soft glow top-right
  const glow = ctx.createRadialGradient(width * 0.85, 60, 10, width * 0.85, 60, 320);
  glow.addColorStop(0, "rgba(37, 99, 235, 0.22)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Outer frame
  roundRect(ctx, 18, 18, width - 36, height - 36, 18);
  ctx.fillStyle = "rgba(16, 33, 58, 0.55)";
  ctx.fill();
  ctx.strokeStyle = "rgba(37, 99, 235, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── Header ──
  roundRect(ctx, 36, 36, width - 72, 70, 12);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  ctx.strokeStyle = "rgba(37, 99, 235, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Logo
  const logoPath = findLogoPath();
  if (logoPath) {
    try {
      const logo = await loadImage(logoPath);
      ctx.drawImage(logo, 48, 46, 48, 48);
    } catch {
      drawLogoPlaceholder(ctx, 48, 46, 48);
    }
  } else {
    drawLogoPlaceholder(ctx, 48, 46, 48);
  }

  ctx.fillStyle = COLORS.cyan;
  ctx.font = `bold 14px '${FONT}', sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("HỒ SƠ NGƯỜI CHƠI", 110, 62);

  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 22px '${FONT}', sans-serif`;
  ctx.fillText("PLAYER PROFILE", 110, 90);

  ctx.fillStyle = COLORS.muted;
  ctx.font = `13px '${FONT}', sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText(`UID: ${view.userId || "—"}`, width - 52, 78);
  ctx.textAlign = "left";

  // ── Character panel ──
  const charY = 124;
  roundRect(ctx, 36, charY, width - 72, 170, 14);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  ctx.strokeStyle = "rgba(34, 211, 238, 0.3)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Avatar circle with multi-layer frame
  const ax = 70;
  const ay = charY + 28;
  const as = 114;
  const cx = ax + as / 2;
  const cy = ay + as / 2;
  const r = as / 2;

  // outer glow ring
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(37, 99, 235, 0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.cyan;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(168, 85, 247, 0.6)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // clip avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const avatarImg = await loadAvatarImage(view);
  if (avatarImg) {
    // cover-fit
    const iw = avatarImg.width;
    const ih = avatarImg.height;
    const scale = Math.max((r * 2) / iw, (r * 2) / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(avatarImg, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    ctx.fillStyle = "#1e3a5f";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `bold 36px '${FONT}', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", cx, cy);
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();

  // Name + meta
  const nameX = 210;
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 28px '${FONT}', sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(truncate(ctx, view.displayName || "Người chơi", 480), nameX, charY + 58);

  if (view.zaloName && view.customDisplayName) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `14px '${FONT}', sans-serif`;
    ctx.fillText(`Zalo: ${truncate(ctx, view.zaloName, 400)}`, nameX, charY + 82);
  }

  // Rank badge (only if real data)
  if (view.showRank) {
    const rankLabel = view.rank?.name || "CHƯA XẾP HẠNG";
    const rankColor = view.rank?.color || COLORS.muted;
    ctx.font = `bold 13px '${FONT}', sans-serif`;
    const rw = ctx.measureText(rankLabel).width + 24;
    roundRect(ctx, nameX, charY + 100, rw, 28, 8);
    ctx.fillStyle = "rgba(15, 30, 55, 0.9)";
    ctx.fill();
    ctx.strokeStyle = rankColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = rankColor;
    ctx.fillText(rankLabel, nameX + 12, charY + 119);
  }

  // Level pill
  const lvText = `LV ${view.level}`;
  ctx.font = `bold 16px '${FONT}', sans-serif`;
  const lvW = ctx.measureText(lvText).width + 28;
  const lvX = width - 52 - lvW;
  const lvGrad = ctx.createLinearGradient(lvX, 0, lvX + lvW, 0);
  lvGrad.addColorStop(0, "#2563EB");
  lvGrad.addColorStop(1, "#22D3EE");
  roundRect(ctx, lvX, charY + 40, lvW, 34, 10);
  ctx.fillStyle = lvGrad;
  ctx.fill();
  ctx.fillStyle = "#07111F";
  ctx.textAlign = "center";
  ctx.fillText(lvText, lvX + lvW / 2, charY + 63);
  ctx.textAlign = "left";

  // ── EXP bar ──
  const expY = 314;
  roundRect(ctx, 36, expY, width - 72, 88, 12);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  ctx.strokeStyle = "rgba(168, 85, 247, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 16px '${FONT}', sans-serif`;
  if (view.isMaxLevel) {
    ctx.fillText(`LEVEL ${view.level} — TỐI ĐA`, 56, expY + 32);
    drawProgressBar(ctx, 56, expY + 48, width - 112, 22, 1, ["#22C55E", "#FACC15"]);
    ctx.fillStyle = COLORS.green;
    ctx.font = `bold 13px '${FONT}', sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText("MAX", width - 56, expY + 32);
  } else {
    ctx.fillText(`LEVEL ${view.level}`, 56, expY + 32);
    const expLabel = `EXP: ${Number(view.exp).toLocaleString("vi-VN")} / ${Number(view.expRequired).toLocaleString("vi-VN")}`;
    ctx.fillStyle = COLORS.muted;
    ctx.font = `14px '${FONT}', sans-serif`;
    ctx.fillText(expLabel, 160, expY + 32);

    drawProgressBar(ctx, 56, expY + 48, width - 112, 22, view.progress, ["#A855F7", "#EC4899"]);

    ctx.fillStyle = COLORS.pink;
    ctx.font = `bold 13px '${FONT}', sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`${view.progressPercent}%`, width - 56, expY + 32);
  }
  ctx.textAlign = "left";

  // ── Stats grid ──
  const gridY = 420;
  const colW = (width - 72 - 24) / 3;
  const colH = 150;
  const cols = [
    { title: "THÀNH TỰU", key: "achievements" },
    { title: "CHIẾN TÍCH", key: "stats" },
    { title: "BANG HỘI", key: "gang" },
  ];

  for (let i = 0; i < 3; i++) {
    const x = 36 + i * (colW + 12);
    roundRect(ctx, x, gridY, colW, colH, 12);
    ctx.fillStyle = COLORS.panel;
    ctx.fill();
    ctx.strokeStyle = "rgba(37, 99, 235, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = COLORS.cyan;
    ctx.font = `bold 13px '${FONT}', sans-serif`;
    ctx.fillText(cols[i].title, x + 16, gridY + 28);

    if (i === 0) {
      // Achievements
      if (!view.showAchievements || view.achievementTotal === 0) {
        ctx.fillStyle = COLORS.muted;
        ctx.font = `14px '${FONT}', sans-serif`;
        ctx.fillText("Chưa có thành tựu", x + 16, gridY + 70);
      } else {
        ctx.fillStyle = COLORS.gold;
        ctx.font = `bold 28px '${FONT}', sans-serif`;
        ctx.fillText(String(view.achievementTotal), x + 16, gridY + 70);
        ctx.fillStyle = COLORS.muted;
        ctx.font = `13px '${FONT}', sans-serif`;
        ctx.fillText("đã mở khóa", x + 16, gridY + 92);
        const top = (view.achievements || []).slice(0, 2);
        top.forEach((a, idx) => {
          ctx.fillStyle = COLORS.text;
          ctx.font = `12px '${FONT}', sans-serif`;
          ctx.fillText(
            truncate(ctx, `• ${a.name || a.id || "Thành tựu"}`, colW - 32),
            x + 16,
            gridY + 116 + idx * 18
          );
        });
      }
    } else if (i === 1) {
      // Statistics
      if (!view.showStatistics || !view.statistics?.hasData) {
        ctx.fillStyle = COLORS.muted;
        ctx.font = `14px '${FONT}', sans-serif`;
        ctx.fillText("Chưa có chiến tích", x + 16, gridY + 70);
      } else {
        const s = view.statistics;
        ctx.fillStyle = COLORS.text;
        ctx.font = `14px '${FONT}', sans-serif`;
        ctx.fillText(`Trận: ${s.matchesPlayed}`, x + 16, gridY + 60);
        ctx.fillStyle = COLORS.green;
        ctx.fillText(`Thắng: ${s.wins}`, x + 16, gridY + 84);
        ctx.fillStyle = COLORS.pink;
        ctx.fillText(`Thua: ${s.losses}`, x + 16, gridY + 108);
        if (s.winRate != null) {
          ctx.fillStyle = COLORS.gold;
          ctx.font = `bold 14px '${FONT}', sans-serif`;
          ctx.fillText(`Tỷ lệ: ${s.winRate}%`, x + 16, gridY + 132);
        }
      }
    } else {
      // Gang
      if (!view.showGang || !view.gang) {
        ctx.fillStyle = COLORS.muted;
        ctx.font = `14px '${FONT}', sans-serif`;
        ctx.fillText("CHƯA THAM GIA GANG", x + 16, gridY + 70);
      } else {
        ctx.fillStyle = COLORS.text;
        ctx.font = `bold 16px '${FONT}', sans-serif`;
        ctx.fillText(truncate(ctx, view.gang.name, colW - 32), x + 16, gridY + 64);
        if (view.gang.role) {
          ctx.fillStyle = COLORS.purple;
          ctx.font = `13px '${FONT}', sans-serif`;
          ctx.fillText(view.gang.role, x + 16, gridY + 90);
        }
      }
    }
  }

  // ── Cultivation strip (hidden if not enabled) ──
  if (view.showCultivation) {
    const cy2 = gridY + colH + 16;
    roundRect(ctx, 36, cy2, width - 72, 50, 10);
    ctx.fillStyle = COLORS.panel;
    ctx.fill();
    ctx.strokeStyle = "rgba(168, 85, 247, 0.4)";
    ctx.stroke();
    ctx.fillStyle = COLORS.purple;
    ctx.font = `bold 13px '${FONT}', sans-serif`;
    ctx.fillText("TU TIÊN", 56, cy2 + 32);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `13px '${FONT}', sans-serif`;
    if (view.cultivation) {
      const parts = [view.cultivation.realm || view.cultivation.realmId || "—"];
      if (view.cultivation.stage) parts.push(view.cultivation.stage);
      if (view.cultivation.domain) parts.push(view.cultivation.domain);
      parts.push(`EXP tu tiên: ${Number(view.cultivation.qi || 0).toLocaleString("vi-VN")}`);
      ctx.fillText(parts.join(" · "), 140, cy2 + 32);
    } else {
      ctx.fillText("Chưa tu luyện — dùng .tutien để bắt đầu", 140, cy2 + 32);
    }
  }

  // Footer
  ctx.fillStyle = COLORS.muted;
  ctx.font = `12px '${FONT}', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${getConfiguredBotName()} · Player Profile System V1.0`, width / 2, height - 30);

  return canvas.toBuffer("image/png");
}

function drawLogoPlaceholder(ctx, x, y, size) {
  roundRect(ctx, x, y, size, size, 10);
  ctx.fillStyle = "#1e3a5f";
  ctx.fill();
  ctx.strokeStyle = COLORS.cyan;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = COLORS.cyan;
  ctx.font = `bold 18px '${FONT}', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("HP", x + size / 2, y + size / 2);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

export function saveBufferToTempImage(buffer, prefix = "hoso") {
  const dir = path.join(__dirname, "..", "..", "temp");
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.png`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
