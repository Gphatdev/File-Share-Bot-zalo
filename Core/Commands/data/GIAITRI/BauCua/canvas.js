import { createCanvas } from "canvas";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getConfiguredBotName } from "../../../../../Utils/Branding.js";

const COLORS = {
  ink: "#F8FAFC",
  muted: "#B7C7DA",
  gold: "#F6C453",
  green: "#4ADE80",
  red: "#FB7185",
  panel: "rgba(12, 27, 46, 0.94)",
};

function roundedRect(ctx, x, y, width, height, radius, fill, stroke) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#091322");
  gradient.addColorStop(0.55, "#10243A");
  gradient.addColorStop(1, "#07111F");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.84, 0, 10, width * 0.84, 0, width * 0.72);
  glow.addColorStop(0, "rgba(246, 196, 83, 0.19)");
  glow.addColorStop(1, "rgba(246, 196, 83, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  roundedRect(ctx, 12, 12, width - 24, height - 24, 28, null, "rgba(246,196,83,0.42)");
}

function drawHeader(ctx, title, subtitle, width) {
  roundedRect(ctx, 32, 30, width - 64, 106, 20, "rgba(8,18,32,0.82)", "rgba(246,196,83,0.35)");
  drawDie(ctx, 78, 82, 32, "#F6C453", "3");
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.gold;
  ctx.font = "bold 30px Arial";
  ctx.fillText(title, 130, 67);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "17px Arial";
  ctx.fillText(subtitle, 132, 105);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(248,250,252,0.68)";
  ctx.font = "bold 13px Arial";
  ctx.fillText(`${getConfiguredBotName()}  •  BẦU CUA`, width - 56, 83);
}

function drawDie(ctx, cx, cy, size, color, label) {
  roundedRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.22, color, "rgba(255,255,255,0.55)");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#182235";
  ctx.font = `bold ${Math.round(size * 0.54)}px Arial`;
  ctx.fillText(label, cx, cy + 1);
}

function drawAnimal(ctx, key, cx, cy, size) {
  const scale = size / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (key === "bau") {
    ctx.fillStyle = "#F28C28";
    ctx.beginPath();
    ctx.ellipse(0, 5, 37, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#D96E1F";
    ctx.lineWidth = 4;
    for (const x of [-18, 0, 18]) {
      ctx.beginPath();
      ctx.ellipse(x, 5, 15, 32, 0, -1.2, 1.2);
      ctx.stroke();
    }
    ctx.fillStyle = "#64A848";
    ctx.beginPath();
    ctx.roundRect(-7, -39, 14, 17, 4);
    ctx.fill();
  } else if (key === "cua") {
    ctx.fillStyle = "#EF5A52";
    ctx.beginPath();
    ctx.ellipse(0, 7, 31, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#EF5A52";
    ctx.lineWidth = 7;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = side * (19 + i * 4);
        ctx.beginPath();
        ctx.moveTo(side * 15, 15 + i * 3);
        ctx.lineTo(x, 32 + i * 4);
        ctx.lineTo(x + side * 8, 29 + i * 4);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(side * 23, -3);
      ctx.lineTo(side * 36, -18);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(side * 39, -21, 10, 0, Math.PI * 2);
      ctx.fillStyle = "#EF5A52";
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(side * 39, -22, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#172033";
    for (const x of [-10, 10]) {
      ctx.beginPath();
      ctx.arc(x, 1, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (key === "tom") {
    ctx.strokeStyle = "#FB923C";
    ctx.lineWidth = 13;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-18 + i * 11, 0, 24 - i * 3, -1.1, 1.2);
      ctx.stroke();
    }
    ctx.fillStyle = "#FDBA74";
    ctx.beginPath();
    ctx.ellipse(24, -10, 18, 11, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1E293B";
    ctx.beginPath();
    ctx.arc(31, -12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#FDBA74";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-26, 13);
    ctx.lineTo(-42, 26);
    ctx.lineTo(-29, 22);
    ctx.lineTo(-40, 35);
    ctx.stroke();
  } else if (key === "ca") {
    ctx.fillStyle = "#39A8D8";
    ctx.beginPath();
    ctx.ellipse(-4, 3, 35, 23, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(24, 3);
    ctx.lineTo(47, -16);
    ctx.lineTo(47, 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7DD3FC";
    ctx.beginPath();
    ctx.moveTo(-8, -15);
    ctx.lineTo(2, -31);
    ctx.lineTo(10, -12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(-20, -3, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#172033";
    ctx.beginPath();
    ctx.arc(-21, -3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (key === "ga") {
    ctx.fillStyle = "#F6BD60";
    ctx.beginPath();
    ctx.ellipse(-2, 10, 29, 25, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#E8A23B";
    ctx.beginPath();
    ctx.arc(21, -14, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#E34B4B";
    ctx.beginPath();
    ctx.arc(15, -33, 7, 0, Math.PI * 2);
    ctx.arc(24, -36, 7, 0, Math.PI * 2);
    ctx.arc(32, -31, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#F97316";
    ctx.beginPath();
    ctx.moveTo(36, -14);
    ctx.lineTo(51, -8);
    ctx.lineTo(36, -3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#D18A2F";
    ctx.lineWidth = 4;
    for (const x of [-12, 6]) {
      ctx.beginPath();
      ctx.moveTo(x, 29);
      ctx.lineTo(x, 42);
      ctx.lineTo(x + 7, 42);
      ctx.stroke();
    }
    ctx.fillStyle = "#172033";
    ctx.beginPath();
    ctx.arc(25, -17, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (key === "nai") {
    ctx.fillStyle = "#C98652";
    ctx.beginPath();
    ctx.ellipse(0, 8, 25, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 27, 18, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#E6B37A";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 25, -3, 8, 17, side * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#D7B66D";
    ctx.lineWidth = 6;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 10, -20);
      ctx.lineTo(side * 17, -38);
      ctx.lineTo(side * 29, -45);
      ctx.moveTo(side * 17, -38);
      ctx.lineTo(side * 14, -51);
      ctx.moveTo(side * 25, -42);
      ctx.lineTo(side * 36, -49);
      ctx.stroke();
    }
    ctx.fillStyle = "#172033";
    for (const x of [-9, 9]) {
      ctx.beginPath();
      ctx.arc(x, 1, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#F4D6B2";
    ctx.beginPath();
    ctx.ellipse(0, 20, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function fitText(ctx, text, maxWidth) {
  let value = String(text ?? "");
  while (value.length > 1 && ctx.measureText(value).width > maxWidth) {
    value = `${value.slice(0, -2)}…`;
  }
  return value;
}

function drawCard(ctx, x, y, width, height, fill = COLORS.panel, stroke = "rgba(148,163,184,0.23)") {
  roundedRect(ctx, x, y, width, height, 18, fill, stroke);
}

export function renderBoard({ session, balance, guide = false }) {
  const width = 1000;
  const height = 790;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, width, height);
  drawHeader(
    ctx,
    guide ? "HƯỚNG DẪN BẦU CUA" : session.mode === "x2" ? "BÀN BẦU CUA X2" : "BÀN BẦU CUA",
    guide ? "Mở bàn chơi, chọn một trong sáu linh vật rồi chờ kết quả" : "Chọn một linh vật bằng cách reply tên hoặc số 1–6",
    width,
  );

  const animals = [
    { key: "bau", name: "BẦU", id: 1, color: "#F28C28" },
    { key: "cua", name: "CUA", id: 2, color: "#EF5A52" },
    { key: "tom", name: "TÔM", id: 3, color: "#FB923C" },
    { key: "ca", name: "CÁ", id: 4, color: "#39A8D8" },
    { key: "ga", name: "GÀ", id: 5, color: "#F6BD60" },
    { key: "nai", name: "NAI", id: 6, color: "#C98652" },
  ];
  const xStart = 42;
  const yStart = 160;
  const gap = 16;
  const cardWidth = (width - xStart * 2 - gap * 2) / 3;
  const cardHeight = 206;
  animals.forEach((animal, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = xStart + col * (cardWidth + gap);
    const y = yStart + row * (cardHeight + gap);
    drawCard(ctx, x, y, cardWidth, cardHeight);
    ctx.fillStyle = animal.color;
    ctx.beginPath();
    ctx.arc(x + 32, y + 32, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#142033";
    ctx.font = "bold 15px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(animal.id), x + 32, y + 32);
    drawAnimal(ctx, animal.key, x + cardWidth / 2, y + 98, 102);
    ctx.fillStyle = COLORS.ink;
    ctx.font = "bold 19px Arial";
    ctx.fillText(animal.name, x + cardWidth / 2, y + 169);
  });

  const panelY = 616;
  drawCard(ctx, 42, panelY, width - 84, 140, "rgba(8,18,32,0.86)", "rgba(246,196,83,0.35)");
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.gold;
  ctx.font = "bold 18px Arial";
  ctx.fillText(
    guide ? "MỞ BÀN: .bcua [tiền]" : `CƯỢC: ${Number(session.bet).toLocaleString("vi-VN")}đ`,
    68,
    panelY + 36,
  );
  ctx.fillStyle = COLORS.muted;
  ctx.font = "16px Arial";
  ctx.fillText(
    guide ? ".bcua x2 [tiền]  •  Cược tối thiểu 1.000đ" : `SỐ DƯ: ${Number(balance).toLocaleString("vi-VN")}đ`,
    68,
    panelY + 76,
  );
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = "right";
  ctx.fillText(guide ? "Cách chơi" : `Người chơi: ${fitText(ctx, session.userName, 300)}`, width - 68, panelY + 36);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "15px Arial";
  ctx.fillText(
    guide ? "Chọn linh vật trúng một trong 3 mặt để thắng" : session.mode === "x2" ? "X2 • Thắng +cược • Thua −2×cược" : "Thắng: ăn theo số mặt trùng",
    width - 68,
    panelY + 76,
  );
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(248,250,252,0.72)";
  ctx.font = "14px Arial";
  ctx.fillText(guide ? "Trong bàn chơi, reply ví dụ: Cua  •  2  •  Bầu" : "Reply tin nhắn bàn bằng tên hoặc số linh vật", width / 2, panelY + 116);
  return canvas.toBuffer("image/png");
}

export function renderResult(result) {
  const width = 1000;
  const height = 690;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, width, height);
  const status = result.won ? "CHÚC MỪNG, BẠN THẮNG!" : "VÁN NÀY CHƯA MAY MẮN";
  drawHeader(ctx, result.won ? "KẾT QUẢ BẦU CUA" : "KẾT QUẢ VÁN CHƠI", status, width);

  drawCard(ctx, 42, 160, width - 84, 290);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.muted;
  ctx.font = "bold 16px Arial";
  ctx.fillText("BA MẶT XÚC XẮC", width / 2, 193);

  const diceGap = 20;
  const diceSize = 250;
  const startX = (width - diceSize * 3 - diceGap * 2) / 2;
  result.faces.forEach((face, index) => {
    const x = startX + index * (diceSize + diceGap);
    const y = 220;
    const animal = face?.key || face;
    drawCard(ctx, x, y, diceSize, 204, "rgba(7,17,31,0.88)", "rgba(246,196,83,0.38)");
    drawAnimal(ctx, animal, x + diceSize / 2, y + 84, 112);
    const name = String(face?.name || animal).toUpperCase();
    ctx.fillStyle = COLORS.ink;
    ctx.font = "bold 17px Arial";
    ctx.fillText(name, x + diceSize / 2, y + 165);
  });

  const chosenKey = result.animal?.key;
  const chosen = result.animal?.name || "—";
  drawCard(ctx, 42, 470, 440, 158, "rgba(8,18,32,0.88)", "rgba(148,163,184,0.24)");
  drawAnimal(ctx, chosenKey, 111, 545, 82);
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.muted;
  ctx.font = "15px Arial";
  ctx.fillText("BẠN ĐÃ CHỌN", 170, 515);
  ctx.fillStyle = COLORS.ink;
  ctx.font = "bold 24px Arial";
  ctx.fillText(chosen, 170, 550);
  ctx.fillStyle = result.won ? COLORS.green : COLORS.red;
  ctx.font = "bold 17px Arial";
  ctx.fillText(result.won ? `TRÚNG ${result.hits} MẶT` : "KHÔNG TRÚNG", 170, 588);

  drawCard(ctx, 500, 470, 458, 158, "rgba(8,18,32,0.88)", "rgba(148,163,184,0.24)");
  const moneyRows = [
    ["Tiền cược", `${Number(result.bet).toLocaleString("vi-VN")}đ`, COLORS.ink],
    [result.won ? "Tiền thưởng" : "Tiền mất", `${result.won ? "+" : "−"}${Number(result.won ? result.reward : result.mode === "x2" ? result.holdNeed : result.bet).toLocaleString("vi-VN")}đ`, result.won ? COLORS.green : COLORS.red],
    ["Số dư", `${Number(result.balance).toLocaleString("vi-VN")}đ`, COLORS.gold],
  ];
  moneyRows.forEach(([label, value, color], index) => {
    const y = 505 + index * 39;
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.muted;
    ctx.font = "15px Arial";
    ctx.fillText(label, 526, y);
    ctx.textAlign = "right";
    ctx.fillStyle = color;
    ctx.font = "bold 16px Arial";
    ctx.fillText(value, 932, y);
  });
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(248,250,252,0.72)";
  ctx.font = "15px Arial";
  ctx.fillText(`${result.userName || "Người chơi"}  •  +${Number(result.expGain || 0)} EXP  •  ${result.mode === "x2" ? "CHẾ ĐỘ X2" : "BẦU CUA"}`, width / 2, 658);
  return canvas.toBuffer("image/png");
}

export function saveBufferToTempImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 100) {
    throw new Error("Bầu Cua renderer returned an invalid image buffer.");
  }
  const file = path.join(os.tmpdir(), `bcua-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
  fs.writeFileSync(file, buffer);
  return file;
}
