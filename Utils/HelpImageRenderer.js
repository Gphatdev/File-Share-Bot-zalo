import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "Data", "help-cache");
const CACHE_VERSION = "6";
const ANTI_CACHE_VERSION = "11";
const WIDTH = 2400;
const COLORS = {
  background: "#0b1020",
  panel: "#121a2e",
  panelAlt: "#17223b",
  border: "#263756",
  primary: "#62e6ff",
  secondary: "#ffbd69",
  text: "#f4f7fb",
  muted: "#9eacc4",
  success: "#6ee7b7",
};

let canvasModulePromise;

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

async function getCanvasModule() {
  canvasModulePromise ||= import("canvas");
  return canvasModulePromise;
}

function commandFingerprint(commands, prefix) {
  const values = [...commands.values()]
    .map((command) => ({
      name: command.name,
      description: command.description || "",
      group: command.group || "general",
      role: command.role || 0,
      cooldown: command.cooldown || 0,
      aliases: command.aliases || [],
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return crypto
    .createHash("sha1")
    .update(JSON.stringify({ version: CACHE_VERSION, prefix, values }))
    .digest("hex")
    .slice(0, 16);
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke = null) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawBackground(ctx, width, height) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(98, 230, 255, 0.12)");
  gradient.addColorStop(0.5, "rgba(11, 16, 32, 0)");
  gradient.addColorStop(1, "rgba(255, 189, 105, 0.08)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawHeader(ctx, width, title, subtitle, height = 210) {
  roundRect(ctx, 55, 45, width - 110, height, 24, COLORS.panel, COLORS.border);
  ctx.fillStyle = COLORS.primary;
  ctx.fillRect(55, 45, 14, height);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "bold 30px sans-serif";
  ctx.fillStyle = COLORS.secondary;
  ctx.fillText("NKNP STUDIO  /  COMMAND CENTER", 105, 105);
  ctx.font = "bold 64px sans-serif";
  ctx.fillStyle = COLORS.text;
  ctx.fillText(title, 105, 175);
  ctx.font = "28px sans-serif";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(subtitle, 105, 220);
}

function fitText(ctx, value, maxWidth) {
  const text = String(value || "");
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 0 && ctx.measureText(`${result}...`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}

function groupCommands(commands) {
  const groups = new Map();
  for (const command of commands.values()) {
    const group = command.group || "general";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(command);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, items]) => [name, items.sort((left, right) => left.name.localeCompare(right.name))]);
}

function roleLabel(role) {
  if (role >= 2) return "BOT ADMIN";
  if (role === 1) return "GROUP ADMIN";
  return "MEMBER";
}

async function renderToCache(cacheName, draw) {
  ensureCacheDir();
  const outputPath = path.join(CACHE_DIR, cacheName);
  if (fs.existsSync(outputPath)) return outputPath;

  const { createCanvas } = await getCanvasModule();
  const { canvas, width, height } = draw(createCanvas);
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  return outputPath;
}

async function renderHelpImage({ botName, prefix, commands }) {
  const fingerprint = commandFingerprint(commands, prefix);
  const items = [...commands.values()].sort((left, right) => {
    const groupOrder = (left.group || "general").localeCompare(right.group || "general");
    return groupOrder || left.name.localeCompare(right.name);
  });
  const cardWidth = 545;
  const cardHeight = 112;
  const columnGap = 35;
  const startX = 65;
  const headerHeight = 360;
  const rowHeight = 145;
  const rows = Math.ceil(items.length / 4);
  const height = headerHeight + rows * rowHeight + 100;

  return renderToCache(`help-main-${fingerprint}.png`, (createCanvas) => {
    const canvas = createCanvas(WIDTH, height);
    const ctx = canvas.getContext("2d");
    drawBackground(ctx, WIDTH, height);
    ctx.strokeStyle = "#20243a";
    ctx.lineWidth = 7;
    ctx.strokeRect(30, 30, WIDTH - 60, height - 60);
    ctx.strokeStyle = "#ff3d81";
    ctx.lineWidth = 2;
    ctx.strokeRect(45, 45, WIDTH - 90, height - 90);

    ctx.fillStyle = "#111526";
    ctx.fillRect(70, 62, WIDTH - 140, 112);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "bold 40px monospace";
    ctx.fillStyle = "#53f59d";
    ctx.fillText("SYSTEM: ONLINE", 110, 118);
    ctx.fillStyle = "#ffea61";
    ctx.fillText(`PREFIX: ${prefix}`, 650, 118);
    ctx.fillStyle = "#c56cff";
    ctx.fillText("CORE: NKNP V3", 1120, 118);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff3d81";
    ctx.fillText(`${commands.size} COMMANDS`, WIDTH - 110, 118);

    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 78px sans-serif";
    ctx.fillText(`${botName} HELP CORE`, WIDTH / 2, 260);

    items.forEach((command, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const x = startX + column * (cardWidth + columnGap);
      const y = headerHeight + row * rowHeight;
      const centerY = y + cardHeight / 2;
      const number = `${String(index + 1).padStart(2, "0")}.`;

      roundRect(ctx, x, y, cardWidth, cardHeight, 16, "#111526", "#29355b");
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 42px monospace";
      ctx.fillStyle = "#ff3d81";
      ctx.fillText(number, x + 25, centerY - 15);
      const numberWidth = ctx.measureText(number).width;

      ctx.font = "bold 37px sans-serif";
      ctx.fillStyle = COLORS.primary;
      ctx.fillText(`${prefix}${command.name}`, x + 38 + numberWidth, centerY - 16);
      ctx.font = "20px sans-serif";
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(fitText(ctx, command.description || "Chưa có mô tả", 440), x + 38 + numberWidth, centerY + 25);
      ctx.textAlign = "right";
      ctx.font = "bold 17px sans-serif";
      ctx.fillStyle = command.role >= 1 ? COLORS.secondary : COLORS.success;
      ctx.fillText(roleLabel(command.role), x + cardWidth - 22, y + 25);
    });

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "22px sans-serif";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`Dùng ${prefix}help <tên lệnh> để xem thông tin chi tiết`, 80, height - 45);
    return { canvas, width: WIDTH, height };
  });
}

async function renderHelpDetail({ botName, prefix, command }) {
  const fingerprint = crypto
    .createHash("sha1")
    .update(JSON.stringify({ version: CACHE_VERSION, command }))
    .digest("hex")
    .slice(0, 16);
  const aliases = command.aliases?.length ? command.aliases.join(", ") : "Không có";
  const rows = [
    ["COMMAND", `${prefix}${command.name}`],
    ["MÔ TẢ", command.description || "Chưa có mô tả"],
    ["NHÓM", command.group || "general"],
    ["ALIAS", aliases],
    ["QUYỀN", roleLabel(command.role)],
    ["COOLDOWN", `${command.cooldown || 0} giây`],
  ];

  return renderToCache(`help-detail-${command.name}-${fingerprint}.png`, (createCanvas) => {
    const width = 1600;
    const height = 860;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    drawBackground(ctx, width, height);
    drawHeader(ctx, width, `${prefix}${command.name}`, `${botName}  •  Chi tiết command`, 190);

    let y = 285;
    for (const [label, value] of rows) {
      roundRect(ctx, 80, y, 330, 68, 14, "#1a2742", COLORS.border);
      roundRect(ctx, 440, y, 1080, 68, 14, COLORS.panel, COLORS.border);
      ctx.font = "bold 24px sans-serif";
      ctx.fillStyle = COLORS.secondary;
      ctx.fillText(label, 110, y + 43);
      ctx.font = "26px sans-serif";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(fitText(ctx, value, 1020), 475, y + 43);
      y += 78;
    }

    ctx.font = "22px sans-serif";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`Dùng ${prefix}help để quay lại danh sách command`, 80, height - 42);
    return { canvas, width, height };
  });
}

async function renderAntiImage({ botName, prefix, settings, features = [] }) {
  const states = features.map(({ key }) => settings.features?.[key] ? "1" : "0").join("");
  const enabledCount = features.filter(({ key }) => settings.features?.[key]).length;
  const identity = crypto
    .createHash("sha1")
    .update(JSON.stringify({ botName, prefix, states, version: ANTI_CACHE_VERSION }))
    .digest("hex")
    .slice(0, 12);
  const cacheName = `anti-main-${ANTI_CACHE_VERSION}-${identity}.png`;

  return renderToCache(cacheName, (createCanvas) => {
    const width = 1800;
    const columns = 3;
    const cardWidth = 530;
    const cardHeight = 78;
    const gapX = 35;
    const gapY = 14;
    const startX = 85;
    const startY = 410;
    const rows = Math.ceil(features.length / columns);
    const height = startY + rows * (cardHeight + gapY) + 145;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    drawBackground(ctx, width, height);

    const glow = ctx.createRadialGradient(width - 180, 90, 15, width - 180, 90, 720);
    glow.addColorStop(0, "rgba(98, 230, 255, 0.18)");
    glow.addColorStop(1, "rgba(98, 230, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(width - 900, 0, 900, 460);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 1;
    for (let x = 70; x < width; x += 54) {
      ctx.beginPath();
      ctx.moveTo(x, 205);
      ctx.lineTo(x, height - 65);
      ctx.stroke();
    }
    for (let y = 205; y < height - 65; y += 54) {
      ctx.beginPath();
      ctx.moveTo(70, y);
      ctx.lineTo(width - 70, y);
      ctx.stroke();
    }
    ctx.restore();

    roundRect(ctx, 48, 48, width - 96, height - 96, 34, "rgba(11, 16, 32, 0.72)", "#263756");
    const header = ctx.createLinearGradient(78, 70, width - 78, 190);
    header.addColorStop(0, "#17223b");
    header.addColorStop(0.55, "#17233e");
    header.addColorStop(1, "#202349");
    roundRect(ctx, 78, 70, width - 156, 112, 24, header, "#344563");

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = "bold 23px monospace";
    ctx.fillStyle = COLORS.success;
    ctx.beginPath();
    ctx.arc(120, 126, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText("PROTECTION ONLINE", 143, 126);
    ctx.beginPath();
    ctx.moveTo(440, 98);
    ctx.lineTo(440, 154);
    ctx.strokeStyle = "#344563";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = "bold 25px monospace";
    ctx.fillStyle = COLORS.primary;
    ctx.fillText("ANTI SECURITY CENTER", 480, 126);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.secondary;
    ctx.fillText(fitText(ctx, botName || "HNNP STUDIO", 400), width - 112, 126);

    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.text;
    ctx.font = "bold 72px Arial";
    ctx.fillText("TRUNG TÂM BẢO VỆ", width / 2, 265);
    ctx.font = "27px Arial";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`BẢNG ĐIỀU KHIỂN ANTI     /     PREFIX ${prefix}     /     TRẢ LỜI 01-${String(features.length).padStart(2, "0")} XEM HƯỚNG DẪN`, width / 2, 322);

    roundRect(ctx, 295, 350, 1210, 40, 20, "#121a2e", "#263756");
    ctx.textAlign = "center";
    ctx.font = "bold 19px Arial";
    ctx.fillStyle = COLORS.secondary;
    ctx.fillText("LẦN ĐẦU: XÓA + CẢNH BÁO", 600, 370);
    ctx.fillStyle = "#43516e";
    ctx.fillText("•", 900, 370);
    ctx.fillStyle = COLORS.primary;
    ctx.fillText("TÁI PHẠM LẦN 2: KICK", 1200, 370);

    features.forEach(({ key, title }, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + column * (cardWidth + gapX);
      const y = startY + row * (cardHeight + gapY);
      const enabled = Boolean(settings.features?.[key]);
      const fill = ctx.createLinearGradient(x, y, x + cardWidth, y + cardHeight);
      fill.addColorStop(0, enabled ? "#123c38" : "#151e33");
      fill.addColorStop(1, enabled ? "#17342f" : "#111a2d");
      roundRect(ctx, x, y, cardWidth, cardHeight, 18, fill, enabled ? "#347f68" : "#263756");

      ctx.beginPath();
      ctx.arc(x + 43, y + cardHeight / 2, 23, 0, Math.PI * 2);
      ctx.fillStyle = enabled ? "rgba(110, 231, 183, 0.16)" : "rgba(98, 230, 255, 0.10)";
      ctx.fill();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 17px monospace";
      ctx.fillStyle = enabled ? COLORS.success : COLORS.primary;
      ctx.textAlign = "center";
      ctx.fillText(String(index + 1).padStart(2, "0"), x + 43, y + cardHeight / 2);

      ctx.textAlign = "left";
      ctx.font = "bold 24px Arial";
      ctx.fillStyle = COLORS.text;
      ctx.fillText(fitText(ctx, title, 330), x + 82, y + cardHeight / 2);

      const pillWidth = 78;
      const pillHeight = 34;
      const pillX = x + cardWidth - pillWidth - 16;
      const pillY = y + (cardHeight - pillHeight) / 2;
      roundRect(ctx, pillX, pillY, pillWidth, pillHeight, 17, enabled ? "#205c4c" : "#253149");
      ctx.textAlign = "center";
      ctx.font = "bold 16px monospace";
      ctx.fillStyle = enabled ? "#a7f3d0" : "#9eacc4";
      ctx.fillText(enabled ? "ON" : "OFF", pillX + pillWidth / 2, y + cardHeight / 2);
    });

    roundRect(ctx, 78, height - 115, width - 156, 48, 18, "#121a2e", "#263756");
    ctx.textAlign = "left";
    ctx.font = "bold 19px monospace";
    ctx.fillStyle = COLORS.success;
    ctx.fillText(`ACTIVE  ${String(enabledCount).padStart(2, "0")} / ${String(features.length).padStart(2, "0")}`, 108, height - 91);
    ctx.textAlign = "right";
    ctx.font = "20px Arial";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`Reply: all bật/tắt  •  1 bật 2 tắt  |  ${prefix}anti status`, width - 108, height - 91);

    ctx.textAlign = "center";
    ctx.font = "16px Arial";
    ctx.fillStyle = "#687792";
    ctx.fillText("HNNP STUDIO  /  BẢO VỆ NHÓM", width / 2, height - 47);
    return { canvas, width, height };
  });
}

export { renderHelpImage, renderHelpDetail, renderAntiImage };
