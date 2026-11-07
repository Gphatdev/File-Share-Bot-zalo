import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, registerFont } from "canvas";
import { getConfiguredBotName } from "../../../../../Utils/Branding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(__dirname, "..", "..", "MEDIA", "fonts");

const FONT_FAMILY = "InvSans";

if (fs.existsSync(fontDir)) {
  const candidates = [
    { file: "BeVietnamPro_700Bold.ttf", weight: "bold" },
    { file: "BeVietnamPro_600SemiBold.ttf", weight: "600" },
    { file: "BeVietnamPro_400Regular.ttf", weight: "normal" },
    { file: "BeVietnamPro_800ExtraBold.ttf", weight: "800" },
  ];
  for (const { file, weight } of candidates) {
    const candidate = path.join(fontDir, file);
    if (fs.existsSync(candidate)) {
      try {
        registerFont(candidate, { family: FONT_FAMILY, weight });
      } catch {
        // ignore invalid font
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Theme definitions per tier – shared layout language
// ─────────────────────────────────────────────────────────────
const THEMES = {
  BASIC: {
    bgTop: "#0f1419",
    bgBottom: "#1a2332",
    cardBg: "rgba(22, 32, 48, 0.96)",
    cardBorder: "rgba(100, 140, 180, 0.45)",
    headerBg: "rgba(30, 45, 65, 0.95)",
    headerBorder: "rgba(120, 160, 200, 0.55)",
    accent: "#7eb8e8",
    accentSoft: "rgba(126, 184, 232, 0.25)",
    badgeBg: "#3a5a7a",
    badgeText: "#e8f0f8",
    slotBg: "rgba(28, 40, 58, 0.9)",
    slotBorder: "rgba(90, 120, 150, 0.4)",
    textPrimary: "#e8f0f8",
    textSecondary: "rgba(180, 200, 220, 0.85)",
    textMuted: "rgba(140, 160, 180, 0.7)",
    rarity: {
      common: "#a0b0c0",
      uncommon: "#5ec27a",
      rare: "#5b9bd5",
      epic: "#b07ce8",
      legendary: "#f0c050",
    },
  },
  VIP: {
    bgTop: "#0a121c",
    bgBottom: "#0d1e2e",
    cardBg: "rgba(12, 28, 42, 0.97)",
    cardBorder: "rgba(70, 160, 220, 0.55)",
    headerBg: "rgba(15, 35, 55, 0.95)",
    headerBorder: "rgba(255, 200, 80, 0.65)",
    accent: "#f0c050",
    accentSoft: "rgba(240, 192, 80, 0.22)",
    badgeBg: "#1a4a6e",
    badgeText: "#f5d878",
    slotBg: "rgba(18, 35, 52, 0.92)",
    slotBorder: "rgba(80, 150, 200, 0.5)",
    textPrimary: "#f0f6fc",
    textSecondary: "rgba(200, 220, 240, 0.9)",
    textMuted: "rgba(150, 175, 200, 0.7)",
    rarity: {
      common: "#a8b8c8",
      uncommon: "#4ecb7a",
      rare: "#4a9fe0",
      epic: "#c08ef0",
      legendary: "#ffd060",
    },
  },
  PRE: {
    bgTop: "#100818",
    bgBottom: "#180e28",
    cardBg: "rgba(22, 14, 38, 0.97)",
    cardBorder: "rgba(140, 90, 200, 0.5)",
    headerBg: "rgba(30, 18, 50, 0.95)",
    headerBorder: "rgba(180, 120, 255, 0.55)",
    accent: "#c49bff",
    accentSoft: "rgba(180, 120, 255, 0.2)",
    badgeBg: "#4a2a7a",
    badgeText: "#e8d0ff",
    slotBg: "rgba(28, 18, 48, 0.92)",
    slotBorder: "rgba(120, 80, 180, 0.45)",
    textPrimary: "#f4eefc",
    textSecondary: "rgba(210, 190, 240, 0.9)",
    textMuted: "rgba(160, 140, 190, 0.7)",
    rarity: {
      common: "#b0a0c0",
      uncommon: "#6ad090",
      rare: "#70a0f0",
      epic: "#d090ff",
      legendary: "#ffc860",
    },
  },
  INFINITE: {
    bgTop: "#080c14",
    bgBottom: "#0c1420",
    cardBg: "rgba(10, 18, 32, 0.98)",
    cardBorder: "rgba(100, 180, 220, 0.5)",
    headerBg: "rgba(12, 24, 42, 0.96)",
    headerBorder: "rgba(120, 220, 255, 0.6)",
    accent: "#60d4ff",
    accentSoft: "rgba(96, 212, 255, 0.2)",
    badgeBg: "#0e3a55",
    badgeText: "#a0f0ff",
    slotBg: "rgba(14, 26, 42, 0.94)",
    slotBorder: "rgba(80, 160, 200, 0.45)",
    textPrimary: "#e8f8ff",
    textSecondary: "rgba(180, 220, 240, 0.9)",
    textMuted: "rgba(130, 170, 200, 0.7)",
    rarity: {
      common: "#90b0c8",
      uncommon: "#50d090",
      rare: "#50b0f0",
      epic: "#b080f0",
      legendary: "#ffd070",
    },
  },
};

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncateText(ctx, text, maxWidth) {
  let result = String(text || "");
  if (ctx.measureText(result).width <= maxWidth) return result;
  while (result.length > 0 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function drawBadge(ctx, text, x, y, theme) {
  ctx.font = `bold 18px '${FONT_FAMILY}', sans-serif`;
  const tw = ctx.measureText(text).width;
  const padX = 14;
  const padY = 6;
  const bw = tw + padX * 2;
  const bh = 28;

  roundRect(ctx, x, y, bw, bh, 8);
  ctx.fillStyle = theme.badgeBg;
  ctx.fill();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = theme.badgeText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + bw / 2, y + bh / 2 + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  return bw;
}

/**
 * Render inventory canvas for a given tier.
 * data: {
 *   displayName, tier, badge, userName, userId,
 *   usedSlots, capacity (null = unlimited),
 *   uniqueTypes, totalQuantity,
 *   items: [{ name, icon, quantity, locked, rarity }],
 *   page, totalPages
 * }
 */
export async function renderInventoryCanvas(data = {}) {
  const tier = String(data.tier || "BASIC").toUpperCase();
  const theme = THEMES[tier] || THEMES.BASIC;

  const cols = 5;
  const rows = 4;
  const slotSize = 110;
  const slotGap = 14;
  const padding = 36;
  const headerH = 150;
  const footerH = 48;

  const gridW = cols * slotSize + (cols - 1) * slotGap;
  const gridH = rows * slotSize + (rows - 1) * slotGap;
  const width = gridW + padding * 2 + 40;
  const height = headerH + gridH + footerH + padding * 2;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, theme.bgTop);
  bg.addColorStop(1, theme.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Soft accent glow (top-right)
  const glow = ctx.createRadialGradient(width * 0.85, 40, 10, width * 0.85, 40, width * 0.5);
  glow.addColorStop(0, theme.accentSoft);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Outer card
  roundRect(ctx, 18, 18, width - 36, height - 36, 20);
  ctx.fillStyle = theme.cardBg;
  ctx.fill();
  ctx.strokeStyle = theme.cardBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Header bar
  roundRect(ctx, 36, 36, width - 72, headerH - 20, 14);
  ctx.fillStyle = theme.headerBg;
  ctx.fill();
  ctx.strokeStyle = theme.headerBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Title
  ctx.fillStyle = theme.accent;
  ctx.font = `bold 22px '${FONT_FAMILY}', sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("KHO ĐỒ", 56, 68);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = `bold 32px '${FONT_FAMILY}', sans-serif`;
  ctx.fillText(data.displayName || theme === THEMES.INFINITE ? "INFINITE INVENTORY" : `${tier} INVENTORY`, 56, 108);

  // Badge
  drawBadge(ctx, data.badge || tier, width - 56 - 100, 52, theme);

  // Player name
  ctx.fillStyle = theme.textSecondary;
  ctx.font = `18px '${FONT_FAMILY}', sans-serif`;
  const playerLabel = truncateText(ctx, data.userName || "Người chơi", 280);
  ctx.fillText(playerLabel, 56, 140);

  // Capacity / usage info (right side of header)
  ctx.textAlign = "right";
  ctx.fillStyle = theme.textSecondary;
  ctx.font = `16px '${FONT_FAMILY}', sans-serif`;

  let capacityText;
  if (data.capacity === null || data.capacity === undefined) {
    capacityText = `Đã sử dụng: ${(data.usedSlots || 0).toLocaleString("vi-VN")} ô`;
    ctx.fillText(capacityText, width - 56, 100);
    ctx.fillStyle = theme.accent;
    ctx.font = `bold 15px '${FONT_FAMILY}', sans-serif`;
    ctx.fillText("KHÔNG GIỚI HẠN", width - 56, 122);
  } else {
    capacityText = `Dung lượng: ${data.usedSlots || 0} / ${data.capacity} ô`;
    ctx.fillText(capacityText, width - 56, 100);
    ctx.fillStyle = theme.textMuted;
    ctx.font = `14px '${FONT_FAMILY}', sans-serif`;
    ctx.fillText(
      `${data.uniqueTypes || 0} loại · ${(data.totalQuantity || 0).toLocaleString("vi-VN")} vật phẩm`,
      width - 56,
      122
    );
  }

  // Pagination
  if (data.totalPages > 1) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = `14px '${FONT_FAMILY}', sans-serif`;
    ctx.fillText(`Trang ${data.page || 1}/${data.totalPages}`, width - 56, 145);
  }

  ctx.textAlign = "left";

  // Item grid
  const items = Array.isArray(data.items) ? data.items : [];
  const startX = (width - gridW) / 2;
  const startY = headerH + padding;

  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (slotSize + slotGap);
    const y = startY + row * (slotSize + slotGap);

    // Slot background
    roundRect(ctx, x, y, slotSize, slotSize, 12);
    ctx.fillStyle = theme.slotBg;
    ctx.fill();
    ctx.strokeStyle = theme.slotBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const item = items[i];
    if (!item) continue;

    const rarityColor = theme.rarity[item.rarity] || theme.rarity.common;

    // Rarity accent top bar
    ctx.fillStyle = rarityColor;
    ctx.globalAlpha = 0.35;
    roundRect(ctx, x + 2, y + 2, slotSize - 4, 6, 3);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Icon (emoji)
    let drewFish = false;
    if (item.fishId) {
      try {
        const { drawFish } = await import("../CauCa/fishArt.js");
        const { getFishList } = await import("../CauCa/storage.js");
        const def = getFishList().find((f) => f.id === item.fishId);
        if (def) { await drawFish(ctx, def, x + 12, y + 14, slotSize - 24, 56, { glow: false }); drewFish = true; }
      } catch { /* dùng icon dự phòng */ }
    }
    if (!drewFish) {
      ctx.font = `42px '${FONT_FAMILY}', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.icon || "❓", x + slotSize / 2, y + 42);
    }

    // Name
    ctx.fillStyle = theme.textPrimary;
    ctx.font = `13px '${FONT_FAMILY}', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const name = truncateText(ctx, item.name || item.itemId, slotSize - 12);
    ctx.fillText(name, x + slotSize / 2, y + 78);

    // Quantity
    ctx.fillStyle = theme.accent;
    ctx.font = `bold 14px '${FONT_FAMILY}', sans-serif`;
    ctx.fillText(`x${item.quantity}`, x + slotSize / 2, y + 98);

    // Locked indicator
    if (item.locked) {
      ctx.fillStyle = "rgba(255, 80, 80, 0.9)";
      ctx.font = `12px '${FONT_FAMILY}', sans-serif`;
      ctx.fillText("🔒", x + slotSize - 18, y + 20);
    }
  }

  // Footer
  ctx.fillStyle = theme.textMuted;
  ctx.font = `13px '${FONT_FAMILY}', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${getConfiguredBotName()} · Inventory System V2.0`, width / 2, height - 28);

  return canvas.toBuffer("image/png");
}

export function saveBufferToTempImage(buffer, prefix = "balo") {
  const dir = path.join(__dirname, "..", "..", "temp");
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.png`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
