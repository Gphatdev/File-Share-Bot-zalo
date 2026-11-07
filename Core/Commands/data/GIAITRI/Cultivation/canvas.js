import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, registerFont } from "canvas";
import { getConfiguredBotName } from "../../../../../Utils/Branding.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(__dirname, "..", "..", "MEDIA", "fonts");
const FONT = "CultSans";

if (fs.existsSync(fontDir)) {
  for (const [file, weight] of [
    ["BeVietnamPro_700Bold.ttf", "bold"],
    ["BeVietnamPro_600SemiBold.ttf", "600"],
    ["BeVietnamPro_400Regular.ttf", "normal"],
  ]) {
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

const C = {
  bg: "#07111F",
  bg2: "#0B1830",
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
  red: "#F43F5E",
};

function rr(ctx, x, y, w, h, r) {
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

function trunc(ctx, text, maxW) {
  let s = String(text || "");
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

function drawBar(ctx, x, y, w, h, progress, c0, c1) {
  const p = Math.min(1, Math.max(0, progress));
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = C.track;
  ctx.fill();
  ctx.strokeStyle = "rgba(37,99,235,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (p > 0.01) {
    const fw = Math.max(h, w * p);
    const g = ctx.createLinearGradient(x, y, x + fw, y);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    rr(ctx, x, y, fw, h, h / 2);
    ctx.fillStyle = g;
    ctx.fill();
  }
}

function paintBg(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, C.bg);
  g.addColorStop(1, C.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.8, 40, 5, w * 0.8, 40, 280);
  glow.addColorStop(0, "rgba(168,85,247,0.18)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

/** Overview / check shared layout */
export async function renderCultivationOverview(view, mode = "overview") {
  const width = 880;
  const height = mode === "check" ? 680 : 640;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  paintBg(ctx, width, height);

  rr(ctx, 18, 18, width - 36, height - 36, 16);
  ctx.fillStyle = "rgba(16,33,58,0.5)";
  ctx.fill();
  ctx.strokeStyle = "rgba(34,211,238,0.45)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Header
  rr(ctx, 36, 36, width - 72, 64, 12);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = "rgba(37,99,235,0.5)";
  ctx.stroke();

  ctx.fillStyle = C.cyan;
  ctx.font = `bold 14px '${FONT}', sans-serif`;
  ctx.fillText(mode === "check" ? "TU TIÊN · KIỂM TRA" : "HỆ THỐNG TU TIÊN", 52, 62);
  ctx.fillStyle = C.text;
  ctx.font = `bold 24px '${FONT}', sans-serif`;
  ctx.fillText(trunc(ctx, view.displayName || "Người chơi", 400), 52, 88);

  ctx.fillStyle = C.muted;
  ctx.font = `13px '${FONT}', sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText(`UID: ${view.userId || "—"}`, width - 52, 72);
  ctx.textAlign = "left";

  // Realm panel
  rr(ctx, 36, 118, width - 72, 130, 12);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = view.domain === "TIEN" ? "rgba(250,204,21,0.5)" : "rgba(168,85,247,0.4)";
  ctx.stroke();

  ctx.fillStyle = C.muted;
  ctx.font = `13px '${FONT}', sans-serif`;
  ctx.fillText("CẢNH GIỚI", 56, 148);

  ctx.fillStyle = view.domain === "TIEN" ? C.gold : C.purple;
  ctx.font = `bold 32px '${FONT}', sans-serif`;
  let realmLabel = view.realmName || "—";
  if (view.stageLabel) realmLabel += ` · ${view.stageLabel}`;
  ctx.fillText(trunc(ctx, realmLabel, 500), 56, 188);

  ctx.fillStyle = C.cyan;
  ctx.font = `bold 14px '${FONT}', sans-serif`;
  ctx.fillText(view.domainName || "Phàm Giới", 56, 218);

  if (view.isMax) {
    ctx.fillStyle = C.gold;
    ctx.font = `bold 14px '${FONT}', sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText("TỐI THƯỢNG", width - 56, 188);
    ctx.textAlign = "left";
  } else if (view.canBreakthrough) {
    ctx.fillStyle = C.green;
    ctx.font = `bold 13px '${FONT}', sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(view.isTribulationReady ? "SẴN SÀNG ĐỘ KIẾP" : "CÓ THỂ ĐỘT PHÁ", width - 56, 188);
    ctx.textAlign = "left";
  }

  // Qi bar
  rr(ctx, 36, 266, width - 72, 100, 12);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = "rgba(236,72,153,0.35)";
  ctx.stroke();

  ctx.fillStyle = C.text;
  ctx.font = `bold 15px '${FONT}', sans-serif`;
  if (view.isMax) {
    ctx.fillText("TU VI — ĐÃ VIÊN MÃN", 56, 300);
    drawBar(ctx, 56, 320, width - 112, 24, 1, C.green, C.gold);
  } else {
    ctx.fillText(
      `EXP TU TIÊN: ${Number(view.qi).toLocaleString("vi-VN")} / ${Number(view.qiRequired).toLocaleString("vi-VN")}`,
      56,
      300
    );
    drawBar(ctx, 56, 320, width - 112, 24, view.progress, C.purple, C.pink);
    ctx.fillStyle = C.pink;
    ctx.font = `bold 14px '${FONT}', sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`${view.progressPercent}%`, width - 56, 300);
    ctx.textAlign = "left";
  }

  // Stats row
  const statsY = 388;
  const items = [
    { label: "Đột phá", value: String(view.breakthroughCount || 0) },
    { label: "Độ Kiếp OK", value: String(view.tribulationSuccess || 0) },
    { label: "Độ Kiếp Fail", value: String(view.tribulationFail || 0) },
    { label: "Hạng", value: view.rank != null ? `#${view.rank}` : "—" },
  ];
  const sw = (width - 72 - 24) / 4;
  items.forEach((it, i) => {
    const x = 36 + i * (sw + 8);
    rr(ctx, x, statsY, sw, 80, 10);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = "rgba(37,99,235,0.3)";
    ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.font = `12px '${FONT}', sans-serif`;
    ctx.fillText(it.label, x + 12, statsY + 28);
    ctx.fillStyle = C.text;
    ctx.font = `bold 22px '${FONT}', sans-serif`;
    ctx.fillText(it.value, x + 12, statsY + 58);
  });

  // Guide / footer
  ctx.fillStyle = C.muted;
  ctx.font = `13px '${FONT}', sans-serif`;
  ctx.textAlign = "center";
  if (mode === "overview") {
    ctx.fillText(
      "Lệnh: .tutien luyentap · check · rank · dotpha · kiep",
      width / 2,
      height - 48
    );
  } else if (view.lastBreakthroughAt) {
    const d = new Date(view.lastBreakthroughAt).toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour12: false,
    });
    ctx.fillText(`Đột phá gần nhất: ${d}`, width / 2, height - 48);
  }
  ctx.fillStyle = "rgba(148,163,184,0.6)";
  ctx.font = `11px '${FONT}', sans-serif`;
  ctx.fillText(`${getConfiguredBotName()} · Immortal Cultivation V1.0`, width / 2, height - 28);

  return canvas.toBuffer("image/png");
}

export async function renderCultivationRank(rankData, pageNames = {}) {
  const width = 900;
  const rows = rankData.items || [];
  const rowH = 52;
  const headerH = 140;
  const height = Math.max(400, headerH + rows.length * rowH + 90);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  paintBg(ctx, width, height);

  rr(ctx, 18, 18, width - 36, height - 36, 16);
  ctx.fillStyle = "rgba(16,33,58,0.5)";
  ctx.fill();
  ctx.strokeStyle = "rgba(250,204,21,0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();

  rr(ctx, 36, 36, width - 72, 80, 12);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = "rgba(250,204,21,0.45)";
  ctx.stroke();

  ctx.fillStyle = C.gold;
  ctx.font = `bold 14px '${FONT}', sans-serif`;
  ctx.fillText("BẢNG XẾP HẠNG TU TIÊN", 52, 64);
  ctx.fillStyle = C.text;
  ctx.font = `bold 22px '${FONT}', sans-serif`;
  ctx.fillText(`Trang ${rankData.page}/${rankData.totalPages}`, 52, 96);

  const st = rankData.stats || {};
  ctx.fillStyle = C.muted;
  ctx.font = `13px '${FONT}', sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText(
    `Tổng: ${st.total || 0} · Phàm: ${st.phamGioi || 0} · Tiên: ${st.tienGioi || 0}`,
    width - 52,
    80
  );
  ctx.textAlign = "left";

  if (rows.length === 0) {
    ctx.fillStyle = C.muted;
    ctx.font = `bold 18px '${FONT}', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("Chưa có người tu tiên trên bảng xếp hạng", width / 2, 250);
    return canvas.toBuffer("image/png");
  }

  let y = headerH;
  rows.forEach((item, i) => {
    const isTop = item.rank <= 3;
    rr(ctx, 36, y, width - 72, rowH - 6, 8);
    ctx.fillStyle = isTop ? "rgba(30, 20, 50, 0.95)" : C.panel;
    ctx.fill();
    ctx.strokeStyle = isTop
      ? item.rank === 1
        ? C.gold
        : item.rank === 2
          ? "#C0C0C0"
          : "#CD7F32"
      : "rgba(37,99,235,0.25)";
    ctx.lineWidth = isTop ? 2 : 1;
    ctx.stroke();

    // Rank number
    ctx.fillStyle = isTop ? C.gold : C.cyan;
    ctx.font = `bold 18px '${FONT}', sans-serif`;
    ctx.fillText(`#${item.rank}`, 52, y + 32);

    // Name
    const name = pageNames[item.userId] || item.userId;
    ctx.fillStyle = C.text;
    ctx.font = `bold 15px '${FONT}', sans-serif`;
    ctx.fillText(trunc(ctx, name, 220), 110, y + 32);

    // Realm
    ctx.fillStyle = item.domain === "TIEN" ? C.gold : C.purple;
    ctx.font = `14px '${FONT}', sans-serif`;
    let realm = item.realmName;
    if (item.stage) realm += ` T${item.stage}`;
    ctx.fillText(trunc(ctx, realm, 200), 360, y + 32);

    // Qi
    ctx.fillStyle = C.muted;
    ctx.font = `13px '${FONT}', sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`${Number(item.qi).toLocaleString("vi-VN")} tu vi`, width - 52, y + 32);
    ctx.textAlign = "left";

    y += rowH;
  });

  ctx.fillStyle = "rgba(148,163,184,0.6)";
  ctx.font = `11px '${FONT}', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${getConfiguredBotName()} · Cultivation Rankings`, width / 2, height - 28);

  return canvas.toBuffer("image/png");
}

export async function renderTribulationCanvas(view) {
  const width = 860;
  const height = 520;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#12081a");
  bg.addColorStop(1, "#0a0610");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width / 2, 80, 10, width / 2, 80, 300);
  glow.addColorStop(0, "rgba(244,63,94,0.25)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  rr(ctx, 20, 20, width - 40, height - 40, 16);
  ctx.fillStyle = "rgba(30,15,40,0.85)";
  ctx.fill();
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = C.red;
  ctx.font = `bold 16px '${FONT}', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("⚡ THIÊN KIẾP ⚡", width / 2, 70);

  ctx.fillStyle = C.text;
  ctx.font = `bold 28px '${FONT}', sans-serif`;
  ctx.fillText(trunc(ctx, view.displayName || "Người chơi", 500), width / 2, 115);

  ctx.fillStyle = C.purple;
  ctx.font = `bold 20px '${FONT}', sans-serif`;
  ctx.fillText(`${view.realmName} · ${view.domainName}`, width / 2, 155);

  ctx.fillStyle = C.muted;
  ctx.font = `15px '${FONT}', sans-serif`;
  ctx.fillText(
    `Tu vi: ${Number(view.qi).toLocaleString("vi-VN")} / ${Number(view.qiRequired).toLocaleString("vi-VN")}`,
    width / 2,
    200
  );

  drawBar(ctx, 80, 220, width - 160, 22, view.progress, C.red, C.gold);

  ctx.fillStyle = C.gold;
  ctx.font = `bold 15px '${FONT}', sans-serif`;
  ctx.fillText("Tỷ lệ thành công mặc định: 70%", width / 2, 280);

  ctx.fillStyle = C.muted;
  ctx.font = `14px '${FONT}', sans-serif`;
  ctx.fillText("Reply 1 để bắt đầu Độ Kiếp · Reply 0 để hủy", width / 2, 320);

  ctx.fillStyle = C.red;
  ctx.font = `13px '${FONT}', sans-serif`;
  ctx.fillText("Thất bại nhẹ: giữ cảnh giới, có thể thử lại", width / 2, 360);

  ctx.fillStyle = "rgba(148,163,184,0.5)";
  ctx.font = `11px '${FONT}', sans-serif`;
  ctx.fillText(`${getConfiguredBotName()} · Thiên Kiếp`, width / 2, height - 36);

  return canvas.toBuffer("image/png");
}

export function saveBufferToTempImage(buffer, prefix = "tutien") {
  const dir = path.join(__dirname, "..", "..", "temp");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(
    dir,
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.png`
  );
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
