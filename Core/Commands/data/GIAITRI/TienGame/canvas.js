import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, registerFont } from "canvas";
import { drawMoney, formatFull, pickDisplay } from "./moneyFormatter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(__dirname, "..", "..", "MEDIA", "fonts");

if (fs.existsSync(fontDir)) {
  const candidates = [
    "NotoSansTC-Regular.otf",
    "NotoSans-Regular.ttf",
    "Roboto-Regular.ttf",
    "Arial.ttf",
  ];
  for (const name of candidates) {
    const candidate = path.join(fontDir, name);
    if (fs.existsSync(candidate)) {
      try {
        registerFont(candidate, { family: "CustomSans" });
      } catch {
        // bỏ qua font không hợp lệ
      }
    }
  }
}

function roundRect(ctx, x, y, width, height, radius) {
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
}

function truncateText(ctx, text, maxWidth) {
  let result = String(text || "");
  if (ctx.measureText(result).width <= maxWidth) return result;
  while (result.length > 0 && ctx.measureText(`${result}...`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}

function wrapText(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) {
        break;
      }
    }
  }

  if (current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    const last = lines[maxLines - 1];
    lines.splice(maxLines - 1, lines.length - maxLines + 1, `${last}...`);
  }

  return lines;
}

function createCard(width, height, title, subtitle) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#07121c");
  bg.addColorStop(0.5, "#0d1b2a");
  bg.addColorStop(1, "#0c1325");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.7, height * 0.15, 20, width * 0.7, height * 0.15, width * 0.8);
  glow.addColorStop(0, "rgba(87, 193, 255, 0.35)");
  glow.addColorStop(1, "rgba(87, 193, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 30, 30, width - 60, height - 60, 26);
  ctx.fillStyle = "rgba(17, 30, 47, 0.96)";
  ctx.fill();

  ctx.strokeStyle = "rgba(94, 173, 255, 0.45)";
  ctx.lineWidth = 2;
  ctx.stroke();

  roundRect(ctx, 55, 55, width - 110, 120, 18);
  ctx.fillStyle = "rgba(11, 24, 36, 0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 184, 77, 0.7)";
  ctx.stroke();

  ctx.fillStyle = "#f9d55c";
  ctx.font = "bold 26px 'CustomSans', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("TIẾNGAME", 92, 110);

  ctx.fillStyle = "#eaf5ff";
  ctx.font = "bold 42px 'CustomSans', sans-serif";
  ctx.fillText(title, 360, 116);

  ctx.fillStyle = "rgba(202, 220, 240, 0.9)";
  ctx.font = "18px 'CustomSans', sans-serif";
  ctx.fillText(subtitle, 92, 160);

  return { canvas, ctx };
}

export function saveBufferToTempImage(buffer, prefix = "tiangame") {
  const dir = path.join(__dirname, "..", "..", "temp");
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.png`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export async function renderAccountCard(data = {}) {
  const { user, displayName = "Người chơi", balance = 0, savings = 0, totalAssets = 0, rate = 10, nextInterest = "Chưa có" } = data;
  const width = 1200;
  const height = 675;
  const { canvas, ctx } = createCard(width, height, "THẺ TÀI KHOẢN", `ID: ${user?.userId || data.userId || "unknown"}`);

  ctx.fillStyle = "rgba(22, 38, 54, 0.9)";
  roundRect(ctx, 72, 195, width - 144, 150, 24);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 46px 'CustomSans', sans-serif";
  ctx.textAlign = "left";
  const safeName = truncateText(ctx, displayName, 430);
  ctx.fillText(safeName, 98, 250);

  ctx.font = "20px 'CustomSans', sans-serif";
  ctx.fillStyle = "#8eb3d6";
  ctx.fillText(`Tài khoản Zalo • ${user?.userId || data.userId || "unknown"}`, 98, 297);

  ctx.fillStyle = "#ffc857";
  ctx.font = "bold 24px 'CustomSans', sans-serif";
  ctx.fillText("SỐ DƯ KHẢ DỤNG", 90, 420);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 54px 'CustomSans', sans-serif";
  drawMoney(ctx, balance, 90, 490, 540, { minSize: 30 });

  ctx.fillStyle = "#8fe7b3";
  ctx.font = "bold 24px 'CustomSans', sans-serif";
  ctx.fillText("TIẾT KIỆM", 690, 420);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px 'CustomSans', sans-serif";
  drawMoney(ctx, savings, 690, 490, 190, { minSize: 22 });

  ctx.fillStyle = "#7ad9ff";
  ctx.font = "bold 24px 'CustomSans', sans-serif";
  ctx.fillText("TỔNG TÀI SẢN", 900, 420);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px 'CustomSans', sans-serif";
  drawMoney(ctx, totalAssets, 900, 490, 200, { minSize: 22 });

  roundRect(ctx, 72, 548, 260, 74, 18);
  ctx.fillStyle = "rgba(39, 156, 107, 0.28)";
  ctx.fill();
  ctx.fillStyle = "#8fe7b3";
  ctx.font = "bold 20px 'CustomSans', sans-serif";
  ctx.fillText(`LÃI SUẤT: ${rate}%/ngày`, 96, 592);

  roundRect(ctx, 350, 548, 390, 74, 18);
  ctx.fillStyle = "rgba(96, 131, 255, 0.25)";
  ctx.fill();
  ctx.fillStyle = "#8ecbff";
  ctx.fillText(`LÃI ĐÃ TÍCH LŨY: ${pickDisplay(data.interestAccrued || 0, (t) => ctx.measureText(`LÃI ĐÃ TÍCH LŨY: ${t}`).width <= 360)}`, 374, 592);

  roundRect(ctx, 760, 548, 330, 74, 18);
  ctx.fillStyle = "rgba(255, 196, 72, 0.22)";
  ctx.fill();
  ctx.fillStyle = "#ffd975";
  ctx.fillText(`KỲ TÍNH LÃI: ${nextInterest}`, 784, 592);

  return canvas.toBuffer("image/png");
}

export async function renderDepositCard(data = {}) {
  const { userId = "unknown", amount = 0, balanceAfter = 0, savingsAfter = 0, rate = 10 } = data;
  const width = 1200;
  const height = 675;
  const { canvas, ctx } = createCard(width, height, "GỬI TIẾT KIỆM", `ID: ${userId}`);

  ctx.fillStyle = "#f2f8ff";
  ctx.font = "bold 36px 'CustomSans', sans-serif";
  ctx.fillText("SỐ TIỀN GỬI", 110, 245);

  ctx.fillStyle = "#ffc857";
  ctx.font = "bold 60px 'CustomSans', sans-serif";
  drawMoney(ctx, amount, 110, 330, 960, { minSize: 30 });

  ctx.fillStyle = "#bfe7ff";
  ctx.font = "20px 'CustomSans', sans-serif";
  ctx.fillText(`Lãi suất: ${rate}%/ngày • tính lãi theo chu kỳ 24h`, 110, 380);

  roundRect(ctx, 115, 440, 470, 140, 22);
  ctx.fillStyle = "rgba(25, 61, 90, 0.75)";
  ctx.fill();
  ctx.fillStyle = "#dff6ff";
  ctx.font = "22px 'CustomSans', sans-serif";
  ctx.fillText("SỐ DƯ SAU GIAO DỊCH", 145, 490);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px 'CustomSans', sans-serif";
  drawMoney(ctx, balanceAfter, 145, 540, 400, { minSize: 22 });

  roundRect(ctx, 610, 440, 470, 140, 22);
  ctx.fillStyle = "rgba(30, 110, 76, 0.72)";
  ctx.fill();
  ctx.fillStyle = "#d8ffe9";
  ctx.font = "22px 'CustomSans', sans-serif";
  ctx.fillText("TIẾT KIỆM HIỆN TẠI", 640, 490);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px 'CustomSans', sans-serif";
  drawMoney(ctx, savingsAfter, 640, 540, 400, { minSize: 22 });

  return canvas.toBuffer("image/png");
}

export async function renderAdminCreditCard(data = {}) {
  const { targetName = "Người chơi", userId = "unknown", amount = 0, newBalance = 0, adminId = "unknown" } = data;
  const width = 1200;
  const height = 675;
  const { canvas, ctx } = createCard(width, height, "CỘNG TIỀN ADMIN", `Admin: ${adminId}`);

  ctx.fillStyle = "#f2f8ff";
  ctx.font = "bold 44px 'CustomSans', sans-serif";
  ctx.fillText(`${targetName}`, 110, 245);

  ctx.fillStyle = "#8eb3d6";
  ctx.font = "20px 'CustomSans', sans-serif";
  ctx.fillText(`UID: ${userId}`, 110, 295);

  ctx.fillStyle = "#ffcb6b";
  ctx.font = "bold 32px 'CustomSans', sans-serif";
  ctx.fillText("SỐ TIỀN CỘNG", 110, 408);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 60px 'CustomSans', sans-serif";
  drawMoney(ctx, amount, 110, 488, 560, { minSize: 30 });

  roundRect(ctx, 700, 205, 390, 220, 22);
  ctx.fillStyle = "rgba(27, 123, 102, 0.7)";
  ctx.fill();
  ctx.fillStyle = "#d9fff1";
  ctx.font = "22px 'CustomSans', sans-serif";
  ctx.fillText("SỐ DƯ MỚI", 760, 280);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px 'CustomSans', sans-serif";
  drawMoney(ctx, newBalance, 760, 360, 300, { minSize: 22 });

  return canvas.toBuffer("image/png");
}

export async function renderSavingsCard(data = {}) {
  const { userId = "unknown", principal = 0, interestAccrued = 0, total = 0, rate = 10, nextInterest = "Chưa có" } = data;
  const width = 1200;
  const height = 675;
  const { canvas, ctx } = createCard(width, height, "THẺ TIẾT KIỆM", `ID: ${userId}`);

  roundRect(ctx, 80, 200, 1040, 190, 24);
  ctx.fillStyle = "rgba(25, 61, 90, 0.75)";
  ctx.fill();

  ctx.fillStyle = "#ebf7ff";
  ctx.font = "bold 32px 'CustomSans', sans-serif";
  ctx.fillText("TỔNG TIỀN TIẾT KIỆM", 120, 260);

  ctx.fillStyle = "#ffc857";
  ctx.font = "bold 60px 'CustomSans', sans-serif";
  drawMoney(ctx, total, 120, 335, 980, { minSize: 30 });

  roundRect(ctx, 90, 440, 300, 120, 20);
  ctx.fillStyle = "rgba(64, 104, 130, 0.9)";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "20px 'CustomSans', sans-serif";
  ctx.fillText("VỐN GỐC", 120, 490);
  ctx.font = "bold 32px 'CustomSans', sans-serif";
  drawMoney(ctx, principal, 120, 530, 260, { minSize: 18 });

  roundRect(ctx, 430, 440, 300, 120, 20);
  ctx.fillStyle = "rgba(60, 123, 88, 0.9)";
  ctx.fill();
  ctx.fillStyle = "#dcffe9";
  ctx.font = "20px 'CustomSans', sans-serif";
  ctx.fillText("LÃI TÍCH LŨY", 460, 490);
  ctx.font = "bold 32px 'CustomSans', sans-serif";
  drawMoney(ctx, interestAccrued, 460, 530, 250, { minSize: 18 });

  roundRect(ctx, 770, 440, 300, 120, 20);
  ctx.fillStyle = "rgba(143, 94, 22, 0.8)";
  ctx.fill();
  ctx.fillStyle = "#ffe7a8";
  ctx.font = "20px 'CustomSans', sans-serif";
  ctx.fillText("LÃI SUẤT", 800, 490);
  ctx.font = "bold 32px 'CustomSans', sans-serif";
  ctx.fillText(`${rate}%/ngày`, 800, 530);

  ctx.fillStyle = "#bfe7ff";
  ctx.font = "18px 'CustomSans', sans-serif";
  ctx.fillText(`Kỳ tính lãi: ${nextInterest}`, 120, 610);

  return canvas.toBuffer("image/png");
}

export async function renderTransactionHistory(data = {}) {
  const records = Array.isArray(data.items) ? data.items : [];
  const width = 1200;
  const height = 675;
  const { canvas, ctx } = createCard(width, height, "LỊCH SỬ GIAO DỊCH", `Tổng: ${records.length} giao dịch`);

  ctx.fillStyle = "#e9f5ff";
  ctx.font = "bold 30px 'CustomSans', sans-serif";
  ctx.fillText("GIAO DỊCH GẦN NHẤT", 90, 225);

  for (let index = 0; index < Math.min(records.length, 5); index += 1) {
    const item = records[index];
    const y = 270 + index * 76;
    roundRect(ctx, 90, y, 1020, 58, 18);
    ctx.fillStyle = "rgba(19, 30, 51, 0.92)";
    ctx.fill();

    ctx.fillStyle = "#ffc857";
    ctx.font = "bold 20px 'CustomSans', sans-serif";
    ctx.fillText((item.type || "UNKNOWN").replace(/_/g, " "), 120, y + 25);

    ctx.fillStyle = "#ffffff";
    ctx.font = "20px 'CustomSans', sans-serif";
    ctx.fillText(item.description || "Giao dịch", 120, y + 50);

    ctx.textAlign = "right";
    ctx.fillStyle = Number(item.amount || 0) >= 0 ? "#8fe7b3" : "#ff9ea4";
    ctx.font = "bold 22px 'CustomSans', sans-serif";
    drawMoney(ctx, Math.abs(Number(item.amount || 0)), 1080, y + 28, 360, { prefix: Number(item.amount || 0) >= 0 ? "+" : "-", minSize: 16 });
    ctx.textAlign = "left";
  }

  return canvas.toBuffer("image/png");
}
