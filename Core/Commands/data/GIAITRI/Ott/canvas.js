import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, registerFont } from "canvas";
import { TEMP_DIR, ensureDataFiles } from "./storage.js";
import { CHOICES } from "./rooms.js";
import { getConfiguredBotName } from "../../../../../Utils/Branding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(__dirname, "..", "..", "MEDIA", "fonts");
const FONT = "OttFont";
(function () {
  if (!fs.existsSync(fontDir)) return;
  for (const [file, weight] of [
    ["BeVietnamPro_800ExtraBold.ttf", "800"],
    ["BeVietnamPro_700Bold.ttf", "bold"],
    ["BeVietnamPro_600SemiBold.ttf", "600"],
    ["BeVietnamPro_400Regular.ttf", "normal"],
  ]) {
    const p = path.join(fontDir, file);
    if (fs.existsSync(p)) {
      try { registerFont(p, { family: FONT, weight }); } catch {}
    }
  }
})();

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

function fit(ctx, text, maxW) {
  let t = String(text || "");
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

async function loadAv(p) {
  if (!p || !fs.existsSync(p)) return null;
  try { return await loadImage(p); } catch { return null; }
}

/**
 * @param {{
 *  p1: { name, avatarPath, choice },
 *  p2: { name, avatarPath, choice },
 *  result: 'P1'|'P2'|'DRAW',
 *  exp1: number, exp2: number
 * }} data
 */
export async function renderResultCanvas(data) {
  ensureDataFiles();
  const W = 900, H = 520;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#060E18");
  bg.addColorStop(0.5, "#0A1628");
  bg.addColorStop(1, "#071220");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(34,211,238,0.45)";
  ctx.lineWidth = 2.5;
  rr(ctx, 10, 10, W - 20, H - 20, 18);
  ctx.stroke();

  // header
  ctx.fillStyle = "rgba(8,24,40,0.95)";
  rr(ctx, 24, 22, W - 48, 56, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(34,211,238,0.4)";
  ctx.lineWidth = 1.5;
  rr(ctx, 24, 22, W - 48, 56, 12);
  ctx.stroke();

  ctx.font = `bold 24px ${FONT}`;
  ctx.fillStyle = "#22D3EE";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🎮  OẢN TÙ TÌ — KẾT QUẢ", W / 2, 50);

  const cardW = 320, cardH = 340, cardY = 100;
  const leftX = 50, rightX = W - 50 - cardW;

  async function drawPlayer(x, player, isWinner, isDraw, exp) {
    const choice = CHOICES[player.choice] || { icon: "?", name: "?" };
    // card bg
    if (isDraw) {
      ctx.fillStyle = "rgba(20,40,60,0.95)";
      ctx.strokeStyle = "rgba(148,163,184,0.6)";
    } else if (isWinner) {
      ctx.fillStyle = "rgba(14,50,40,0.95)";
      ctx.strokeStyle = "#4ADE80";
    } else {
      ctx.fillStyle = "rgba(30,20,28,0.9)";
      ctx.strokeStyle = "rgba(100,80,90,0.5)";
    }
    ctx.lineWidth = isWinner && !isDraw ? 3 : 1.5;
    rr(ctx, x, cardY, cardW, cardH, 16);
    ctx.fill();
    rr(ctx, x, cardY, cardW, cardH, 16);
    ctx.stroke();

    // avatar
    const cx = x + cardW / 2, cy = cardY + 90, R = 52;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
    ctx.strokeStyle = isWinner && !isDraw ? "#4ADE80" : "#22D3EE";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "#0E2A40";
    ctx.fill();
    const av = await loadAv(player.avatarPath);
    if (av) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
      ctx.clip();
      const scale = Math.max((R * 2) / av.width, (R * 2) / av.height);
      const iw = av.width * scale, ih = av.height * scale;
      ctx.drawImage(av, cx - iw / 2, cy - ih / 2, iw, ih);
      ctx.restore();
    } else {
      ctx.font = `bold 28px ${FONT}`;
      ctx.fillStyle = "#22D3EE";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(player.name || "?").slice(0, 1).toUpperCase(), cx, cy);
    }

    // name
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = isWinner && !isDraw ? "#F0FDF4" : "#E0F2FE";
    ctx.textAlign = "center";
    ctx.fillText(fit(ctx, player.name || "Người chơi", cardW - 30), cx, cardY + 170);

    // choice
    ctx.font = `bold 36px ${FONT}`;
    ctx.fillStyle = "#FBBF24";
    ctx.fillText(`${choice.icon}  ${choice.name}`, cx, cardY + 230);

    // status
    ctx.font = `bold 18px ${FONT}`;
    if (isDraw) {
      ctx.fillStyle = "#94A3B8";
      ctx.fillText("🤝  HÒA", cx, cardY + 280);
    } else if (isWinner) {
      ctx.fillStyle = "#4ADE80";
      ctx.fillText("🏆  WINNER", cx, cardY + 280);
    } else {
      ctx.fillStyle = "#F87171";
      ctx.fillText("💀  LOSER", cx, cardY + 280);
    }

    // exp
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = "#22D3EE";
    ctx.fillText(exp > 0 ? `✨ +${exp} EXP` : "—", cx, cardY + 315);
  }

  const isDraw = data.result === "DRAW";
  const p1Win = data.result === "P1";
  const p2Win = data.result === "P2";

  await drawPlayer(leftX, data.p1, p1Win, isDraw, data.exp1 || 0);
  await drawPlayer(rightX, data.p2, p2Win, isDraw, data.exp2 || 0);

  // VS center
  ctx.font = `bold 32px ${FONT}`;
  ctx.fillStyle = "#F472B6";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VS", W / 2, cardY + 160);

  // footer
  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = "rgba(150,180,200,0.7)";
  ctx.fillText(`${getConfiguredBotName()} · OẢN TÙ TÌ`, W / 2, H - 28);

  return canvas.toBuffer("image/png");
}

export function saveBuffer(buffer, prefix = "ott") {
  ensureDataFiles();
  const file = path.join(TEMP_DIR, `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`);
  fs.writeFileSync(file, buffer);
  return file;
}
