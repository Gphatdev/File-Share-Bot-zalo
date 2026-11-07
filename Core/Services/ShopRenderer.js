import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, registerFont } from "canvas";
import { RARITIES, CATEGORIES } from "./ShopService.js";
import { drawIcon as drawFarmIcon } from "../Commands/data/GIAITRI/NongTrai/art.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT = "ShopUI";
const fontDir = path.join(__dirname, "..", "Commands", "data", "MEDIA", "fonts");

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

/* ── Game palette ─────────────────────────────────────────── */
const C = {
  bgDeep: "#0a0e1a",
  bgMid: "#0f1729",
  bgCard: "#151b2e",
  bgCard2: "#1a1030",
  bgPanel: "#1a1525",
  gold: "#ffd700",
  goldSoft: "#fbbf24",
  cyan: "#22d3ee",
  purple: "#a855f7",
  purpleDeep: "#7c3aed",
  pink: "#ec4899",
  pinkSoft: "#f472b6",
  green: "#4ade80",
  greenBtn: "#22c55e",
  text: "#ffffff",
  textSoft: "#e2e8f0",
  muted: "#94a3b8",
  muted2: "#64748b",
  border: "#334155",
  orange: "#f97316",
  blue: "#3b82f6",
  red: "#ef4444",
};

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function trunc(ctx, text, maxW) {
  let s = String(text || "");
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

function fmt(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function rarityOf(id) {
  return RARITIES[id] || RARITIES.common;
}

/** Dark radial + purple vignette — RPG store background */
function paintGameBg(ctx, w, h, accent = "purple") {
  ctx.fillStyle = C.bgDeep;
  ctx.fillRect(0, 0, w, h);

  const cx = accent === "orange" ? w * 0.3 : w * 0.5;
  const cy = accent === "orange" ? h * 0.2 : h * 0.15;
  const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(w, h) * 0.7);
  if (accent === "orange") {
    g.addColorStop(0, "rgba(249,115,22,0.18)");
    g.addColorStop(0.45, "rgba(42,21,8,0.5)");
  } else {
    g.addColorStop(0, "rgba(124,58,237,0.22)");
    g.addColorStop(0.5, "rgba(26,16,64,0.55)");
  }
  g.addColorStop(1, "rgba(10,14,26,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // subtle top bar wash
  const top = ctx.createLinearGradient(0, 0, 0, 120);
  top.addColorStop(0, "rgba(45,27,78,0.45)");
  top.addColorStop(1, "rgba(10,14,26,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, 140);
}

function outerFrame(ctx, w, h, strokeColor, strokeW = 3) {
  rr(ctx, 20, 20, w - 40, h - 40, 20);
  ctx.fillStyle = "rgba(15,23,41,0.92)";
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeW;
  ctx.stroke();
  // inner thin line
  rr(ctx, 28, 28, w - 56, h - 56, 16);
  ctx.strokeStyle = "rgba(124,58,237,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawBalance(ctx, w, balance, y = 78) {
  ctx.textAlign = "right";
  ctx.fillStyle = C.green;
  ctx.font = `bold 18px '${FONT}', sans-serif`;
  ctx.fillText(fmt(balance), w - 70, y);
  ctx.fillStyle = C.goldSoft;
  ctx.font = `bold 13px '${FONT}', sans-serif`;
  ctx.fillText("GOLD", w - 70, y + 20);
  ctx.textAlign = "left";
}

async function tryLoad(p) {
  if (!p) return null;
  const candidates = [p];
  if (!path.isAbsolute(p)) {
    candidates.push(path.join(process.cwd(), p));
    candidates.push(path.join(__dirname, "../../", p));
    candidates.push(path.join(__dirname, "../Commands/data/CauCa/items/rods", path.basename(p)));
    candidates.push(path.join(__dirname, "../Commands/data/CauCa/items/baits", path.basename(p)));
  } else if (!fs.existsSync(p)) {
    const base = path.basename(p);
    candidates.push(path.join(process.cwd(), "assets/shop_items", base));
    candidates.push(path.join(__dirname, "../../assets/shop_items", base));
    candidates.push(path.join(__dirname, "../Commands/data/CauCa/items/rods", base));
    candidates.push(path.join(__dirname, "../Commands/data/CauCa/items/baits", base));
  }
  for (const c of candidates) {
    if (!c || !fs.existsSync(c)) continue;
    try { return await loadImage(c); } catch {}
  }
  return null;
}

function drawWrapped(ctx, text, x, y, maxW, lineH, maxLines = 6) {
  const words = String(text || "").split(/\s+/);
  let line = "";
  let cy = y;
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineH;
      lines++;
      if (lines >= maxLines) break;
    } else line = test;
  }
  if (line && lines < maxLines) ctx.fillText(line, x, cy);
  return cy;
}

class ShopRenderer {
  /** ═══ MAIN HUB — 3 category cards ═══ */
  static async renderMainShop({ displayName, balance, categories }) {
    const w = 960;
    const h = 680;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    paintGameBg(ctx, w, h, "purple");
    outerFrame(ctx, w, h, C.gold, 3);

    // Header bar
    rr(ctx, 48, 48, w - 96, 110, 14);
    ctx.fillStyle = "#1e1035";
    ctx.fill();
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = C.gold;
    ctx.font = `bold 15px '${FONT}', sans-serif`;
    ctx.fillText("GAME STORE", 70, 82);
    ctx.fillStyle = C.text;
    ctx.font = `bold 36px '${FONT}', sans-serif`;
    ctx.fillText("SHOP", 70, 128);
    ctx.fillStyle = "#a78bfa";
    ctx.font = `bold 14px '${FONT}', sans-serif`;
    ctx.fillText("ITEM MARKET", 200, 128);

    ctx.textAlign = "right";
    ctx.fillStyle = "#c4b5fd";
    ctx.font = `13px '${FONT}', sans-serif`;
    ctx.fillText(trunc(ctx, displayName || "Người chơi", 200), w - 70, 82);
    ctx.fillStyle = C.green;
    ctx.font = `bold 20px '${FONT}', sans-serif`;
    ctx.fillText(fmt(balance), w - 70, 118);
    ctx.fillStyle = C.goldSoft;
    ctx.font = `bold 12px '${FONT}', sans-serif`;
    ctx.fillText("GOLD", w - 70, 138);
    ctx.textAlign = "left";

    const cards = categories || [];
    const accents = [C.cyan, C.purple, C.pink];
    const softAccents = ["#e0f2fe", "#f3e8ff", "#fce7f3"];
    const cardW = 265;
    const gap = 30;
    const totalW = cards.length * cardW + Math.max(0, cards.length - 1) * gap;
    let x = (w - totalW) / 2;
    const y = 190;

    cards.forEach((cat, i) => {
      const accent = accents[i % accents.length];
      rr(ctx, x, y, cardW, 340, 18);
      ctx.fillStyle = C.bgCard;
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Icon circle
      ctx.beginPath();
      ctx.arc(x + cardW / 2, y + 95, 36, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.fillStyle = C.bgDeep;
      ctx.font = `bold 22px '${FONT}', sans-serif`;
      ctx.textAlign = "center";
      const short = ["VP", "TB", "TH"][i] || (cat.icon || "•");
      ctx.fillText(short, x + cardW / 2, y + 103);

      ctx.fillStyle = softAccents[i % softAccents.length];
      ctx.font = `bold 20px '${FONT}', sans-serif`;
      ctx.fillText(String(cat.name || "").toUpperCase(), x + cardW / 2, y + 175);

      ctx.fillStyle = C.muted;
      ctx.font = `14px '${FONT}', sans-serif`;
      ctx.fillText(`${cat.count || 0} sản phẩm`, x + cardW / 2, y + 210);

      // Button
      rr(ctx, x + 55, y + 255, cardW - 110, 42, 10);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.fillStyle = C.bgDeep;
      ctx.font = `bold 16px '${FONT}', sans-serif`;
      ctx.fillText(`[ ${i + 1} ]`, x + cardW / 2, y + 282);
      ctx.textAlign = "left";

      x += cardW + gap;
    });

    ctx.textAlign = "center";
    ctx.fillStyle = C.muted2;
    ctx.font = `13px '${FONT}', sans-serif`;
    ctx.fillText("Chọn danh mục bằng cách reply số", w / 2, h - 52);
    ctx.fillStyle = "#475569";
    ctx.font = `11px '${FONT}', sans-serif`;
    ctx.fillText("HNNP STUDIO  |  Shop V2.0  |  RPG Market", w / 2, h - 30);

    return canvas.toBuffer("image/png");
  }

  /** ═══ GAME LIST (equip) ═══ */
  static async renderGameList({ games, balance, displayName }) {
    const rows = Math.max(games?.length || 1, 1);
    const w = 900;
    const h = Math.max(420, 160 + rows * 85 + 70);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    paintGameBg(ctx, w, h, "purple");
    outerFrame(ctx, w, h, C.purple, 3);

    ctx.fillStyle = "#c084fc";
    ctx.font = `bold 14px '${FONT}', sans-serif`;
    ctx.fillText("⚔️  TRANG BỊ", 48, 62);
    ctx.fillStyle = C.text;
    ctx.font = `bold 28px '${FONT}', sans-serif`;
    ctx.fillText("CHỌN GAME", 48, 100);
    drawBalance(ctx, w, balance, 75);

    if (!games?.length) {
      ctx.fillStyle = C.muted;
      ctx.font = `bold 18px '${FONT}', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Chưa có trang bị. Admin dùng .shop add", w / 2, h / 2);
      return canvas.toBuffer("image/png");
    }

    let y = 135;
    games.forEach((g, i) => {
      rr(ctx, 48, y, w - 96, 70, 14);
      ctx.fillStyle = C.bgCard2;
      ctx.fill();
      ctx.strokeStyle = C.purpleDeep;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Number badge
      ctx.beginPath();
      ctx.arc(90, y + 35, 16, 0, Math.PI * 2);
      ctx.fillStyle = C.gold;
      ctx.fill();
      ctx.fillStyle = C.bgDeep;
      ctx.font = `bold 15px '${FONT}', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), 90, y + 40);

      ctx.textAlign = "left";
      ctx.fillStyle = C.text;
      ctx.font = `bold 18px '${FONT}', sans-serif`;
      ctx.fillText(`🎮  ${trunc(ctx, g.name, 420)}`, 120, y + 42);

      ctx.textAlign = "right";
      ctx.fillStyle = "#a78bfa";
      ctx.font = `14px '${FONT}', sans-serif`;
      ctx.fillText(`${g.count} món`, w - 70, y + 42);
      ctx.textAlign = "left";
      y += 82;
    });

    ctx.textAlign = "center";
    ctx.fillStyle = C.muted2;
    ctx.font = `12px '${FONT}', sans-serif`;
    ctx.fillText("Reply số để chọn game", w / 2, h - 36);

    return canvas.toBuffer("image/png");
  }

  /** ═══ DANH SÁCH MỤC CON (Vật phẩm → Nông Trại / Thuốc → Trồng Trọt) ═══ */
  static async renderGroupList({ categoryId, groups, balance }) {
    const cat = CATEGORIES[categoryId] || { name: "Danh mục" };
    const rows = Math.max(groups?.length || 1, 1);
    const w = 900;
    const h = Math.max(380, 170 + rows * 112 + 60);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    paintGameBg(ctx, w, h, "purple");
    outerFrame(ctx, w, h, C.purple, 3);
    ctx.fillStyle = "#c084fc";
    ctx.font = `bold 14px '${FONT}', sans-serif`;
    ctx.fillText(cat.name.toUpperCase(), 48, 62);
    ctx.fillStyle = C.text;
    ctx.font = `bold 28px '${FONT}', sans-serif`;
    ctx.fillText("CHỌN MỤC", 48, 100);
    drawBalance(ctx, w, balance, 75);
    let y = 130;
    (groups || []).forEach((g, i) => {
      rr(ctx, 48, y, w - 96, 98, 16);
      ctx.fillStyle = g.farm ? "rgba(20,70,40,0.55)" : C.bgCard2;
      ctx.fill();
      ctx.strokeStyle = g.farm ? "#4ade80" : C.purpleDeep;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(86, y + 49, 17, 0, Math.PI * 2);
      ctx.fillStyle = C.gold;
      ctx.fill();
      ctx.fillStyle = C.bgDeep;
      ctx.font = `bold 16px '${FONT}', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), 86, y + 55);
      ctx.textAlign = "left";
      ctx.fillStyle = C.text;
      ctx.font = `bold 21px '${FONT}', sans-serif`;
      ctx.fillText(trunc(ctx, g.name, 360), 124, y + 44);
      ctx.fillStyle = g.farm ? "#86efac" : "#a78bfa";
      ctx.font = `13px '${FONT}', sans-serif`;
      ctx.fillText(g.farm ? (categoryId === "item" ? "Hạt giống · cuốc · xô nước · máy tưới" : "Thuốc tăng trưởng · x2 tiền · hiếm hóa · vàng kim") : "Các sản phẩm khác", 124, y + 70);
      if (g.farm) {
        const kinds = categoryId === "item"
          ? [["seed", "seed_ca_chua"], ["seed", "seed_nho"], ["tool", "tool_hoe_gold"], ["tool", "tool_bucket_copper"], ["tool", "tool_sprinkler_auto"]]
          : [["medicine", "med_growth_small"], ["medicine", "med_x2_money"], ["medicine", "med_rare_boost"], ["medicine", "med_golden"]];
        kinds.forEach(([k, id], n) => drawFarmIcon(ctx, k, id, w - 330 + n * 52, y + 42, 56));
      }
      ctx.textAlign = "right";
      ctx.fillStyle = g.farm ? "#86efac" : "#a78bfa";
      ctx.font = `bold 14px '${FONT}', sans-serif`;
      ctx.fillText(`${g.count} món`, w - 70, y + 91);
      ctx.textAlign = "left";
      y += 112;
    });
    ctx.textAlign = "center";
    ctx.fillStyle = C.muted2;
    ctx.font = `12px '${FONT}', sans-serif`;
    ctx.fillText("Reply số để chọn mục", w / 2, h - 36);
    return canvas.toBuffer("image/png");
  }

  /** ═══ PRODUCT GRID ═══ */
  static async renderProductGrid({ title, products, page = 1, totalPages = 1, balance }) {
    const perPage = 6;
    const list = products || [];
    const start = (page - 1) * perPage;
    const slice = list.slice(start, start + perPage);
    const cols = 3;
    const cardW = 278;
    const cardH = 300;
    const gap = 22;
    const w = 48 + cols * cardW + (cols - 1) * gap + 48;
    const rows = Math.ceil(Math.max(slice.length, 1) / cols);
    const h = Math.max(420, 130 + rows * (cardH + gap) + 70);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    paintGameBg(ctx, w, h, "purple");
    outerFrame(ctx, w, h, C.cyan, 3);

    ctx.fillStyle = C.cyan;
    ctx.font = `bold 13px '${FONT}', sans-serif`;
    ctx.fillText("SHOP", 48, 58);
    ctx.fillStyle = C.text;
    ctx.font = `bold 24px '${FONT}', sans-serif`;
    ctx.fillText(trunc(ctx, title || "Sản phẩm", 520), 48, 92);

    ctx.textAlign = "right";
    ctx.fillStyle = C.green;
    ctx.font = `bold 16px '${FONT}', sans-serif`;
    ctx.fillText(fmt(balance), w - 48, 58);
    ctx.fillStyle = C.muted;
    ctx.font = `12px '${FONT}', sans-serif`;
    ctx.fillText(`Trang ${page}/${totalPages}`, w - 48, 82);
    ctx.textAlign = "left";

    if (!slice.length) {
      ctx.fillStyle = C.muted;
      ctx.font = `bold 18px '${FONT}', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Chưa có sản phẩm trong mục này", w / 2, 260);
      return canvas.toBuffer("image/png");
    }

    for (let i = 0; i < slice.length; i++) {
      const p = slice[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 48 + col * (cardW + gap);
      const y = 120 + row * (cardH + gap);
      const rar = rarityOf(p.rarity);

      rr(ctx, x, y, cardW, cardH, 16);
      ctx.fillStyle = C.bgCard;
      ctx.fill();
      ctx.strokeStyle = rar.color || C.cyan;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Image panel
      rr(ctx, x + 14, y + 14, cardW - 28, 130, 12);
      ctx.fillStyle = "#1e293b";
      ctx.fill();
      const img = await tryLoad(p.imageUrl);
      if (img) {
        ctx.save();
        rr(ctx, x + 14, y + 14, cardW - 28, 130, 12);
        ctx.clip();
        const scale = Math.min((cardW - 28) / img.width, 130 / img.height);
        const iw = img.width * scale;
        const ih = img.height * scale;
        ctx.drawImage(img, x + 14 + (cardW - 28 - iw) / 2, y + 14 + (130 - ih) / 2, iw, ih);
        ctx.restore();
      } else {
        ctx.fillStyle = rar.color;
        ctx.font = `bold 28px '${FONT}', sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(rar.icon || "•", x + cardW / 2, y + 90);
        ctx.textAlign = "left";
      }

      ctx.fillStyle = C.textSoft;
      ctx.font = `bold 15px '${FONT}', sans-serif`;
      ctx.fillText(trunc(ctx, p.name, cardW - 28), x + 16, y + 170);

      ctx.fillStyle = rar.color;
      ctx.font = `12px '${FONT}', sans-serif`;
      ctx.fillText(`${rar.icon} ${rar.name}`, x + 16, y + 195);

      ctx.fillStyle = C.goldSoft;
      ctx.font = `bold 17px '${FONT}', sans-serif`;
      ctx.fillText(fmt(p.price), x + 16, y + 228);

      rr(ctx, x + 16, y + 250, 150, 28, 8);
      ctx.fillStyle = "#334155";
      ctx.fill();
      ctx.fillStyle = C.muted;
      ctx.font = `11px '${FONT}', sans-serif`;
      ctx.fillText(`[${i + 1}] Xem / Mua`, x + 28, y + 268);
    }

    ctx.textAlign = "center";
    ctx.fillStyle = C.muted2;
    ctx.font = `12px '${FONT}', sans-serif`;
    ctx.fillText("Reply số xem · mua [số] · .shop trang [n]", w / 2, h - 36);

    return canvas.toBuffer("image/png");
  }

  /** ═══ PRODUCT DETAIL ═══ */
  static async renderProductDetail({ product, balance, displayName }) {
    const w = 960;
    const h = 600;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    const rar = rarityOf(product?.rarity);
    paintGameBg(ctx, w, h, "orange");
    outerFrame(ctx, w, h, rar.color || C.orange, 4);

    // Left image panel
    rr(ctx, 48, 50, 372, 460, 18);
    ctx.fillStyle = C.bgPanel;
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    rr(ctx, 68, 70, 332, 310, 14);
    ctx.fillStyle = "#0f172a";
    ctx.fill();

    const img = await tryLoad(product?.imageUrl);
    if (img) {
      ctx.save();
      rr(ctx, 68, 70, 332, 310, 14);
      ctx.clip();
      const scale = Math.min(332 / img.width, 310 / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      ctx.drawImage(img, 68 + (332 - iw) / 2, 70 + (310 - ih) / 2, iw, ih);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(234, 220, 55, 0, Math.PI * 2);
      ctx.fillStyle = rar.color || C.orange;
      ctx.fill();
      ctx.fillStyle = C.bgDeep;
      ctx.font = `bold 22px '${FONT}', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(String(product?.name || "ITEM").slice(0, 6).toUpperCase(), 234, 228);
      ctx.textAlign = "left";
    }

    // Rarity badge under image
    rr(ctx, 120, 410, 228, 40, 10);
    ctx.fillStyle = rar.color || C.orange;
    ctx.fill();
    ctx.fillStyle = C.bgDeep;
    ctx.font = `bold 14px '${FONT}', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${rar.icon}  ${rar.name.toUpperCase()}`, 234, 436);
    ctx.textAlign = "left";

    // Right info
    const rx = 460;
    ctx.fillStyle = C.cyan;
    ctx.font = `bold 13px '${FONT}', sans-serif`;
    ctx.fillText("SHOP ITEM DETAIL", rx, 75);

    ctx.fillStyle = C.text;
    ctx.font = `bold 28px '${FONT}', sans-serif`;
    const name = String(product?.name || "Sản phẩm");
    let ny = 120;
    const words = name.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > 440) {
        ctx.fillText(line, rx, ny);
        line = word;
        ny += 34;
      } else line = test;
    }
    if (line) {
      ctx.fillText(line, rx, ny);
      ny += 10;
    }

    ctx.fillStyle = C.goldSoft;
    ctx.font = `bold 26px '${FONT}', sans-serif`;
    ctx.fillText(`${fmt(product?.price)} GOLD`, rx, ny + 45);

    const cat = CATEGORIES[product?.category] || { name: product?.category, icon: "📦" };
    ctx.fillStyle = C.muted;
    ctx.font = `14px '${FONT}', sans-serif`;
    ctx.fillText(
      `${cat.icon || ""} ${cat.name || ""}${product?.gameName ? `  |  ${product.gameName}` : ""}`,
      rx,
      ny + 75
    );

    // Description box
    rr(ctx, rx, ny + 100, 440, 140, 12);
    ctx.fillStyle = C.bgPanel;
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.muted2;
    ctx.font = `bold 12px '${FONT}', sans-serif`;
    ctx.fillText("MÔ TẢ", rx + 18, ny + 128);
    ctx.fillStyle = C.textSoft;
    ctx.font = `14px '${FONT}', sans-serif`;
    drawWrapped(ctx, product?.description || "Không có mô tả.", rx + 18, ny + 155, 400, 22, 4);

    if (product?.effects) {
      ctx.fillStyle = C.purple;
      ctx.font = `13px '${FONT}', sans-serif`;
      ctx.fillText(`⚔️ ${String(product.effects).slice(0, 55)}`, rx, ny + 260);
    }

    // Buttons
    const by = h - 130;
    rr(ctx, rx, by, 200, 58, 14);
    ctx.fillStyle = C.greenBtn;
    ctx.fill();
    ctx.fillStyle = "#052e16";
    ctx.font = `bold 20px '${FONT}', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("MUA NGAY", rx + 100, by + 38);

    rr(ctx, rx + 220, by, 200, 58, 14);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.cyan;
    ctx.fillText("QUAY LẠI", rx + 320, by + 38);
    ctx.textAlign = "left";

    ctx.fillStyle = C.muted2;
    ctx.font = `12px '${FONT}', sans-serif`;
    ctx.fillText(`Số dư: ${fmt(balance)}  ·  Reply: mua  |  0 quay lại`, rx, h - 50);

    return canvas.toBuffer("image/png");
  }

  /** Subcategory list */
  static async renderSubList({ title, items, balance }) {
    const w = 800;
    const h = Math.max(400, 150 + (items?.length || 1) * 68 + 60);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    paintGameBg(ctx, w, h, "purple");
    outerFrame(ctx, w, h, C.cyan, 3);

    ctx.fillStyle = C.cyan;
    ctx.font = `bold 15px '${FONT}', sans-serif`;
    ctx.fillText(title || "DANH MỤC", 48, 65);
    drawBalance(ctx, w, balance, 65);

    let y = 110;
    (items || []).forEach((it, i) => {
      rr(ctx, 48, y, w - 96, 56, 12);
      ctx.fillStyle = C.bgCard;
      ctx.fill();
      ctx.strokeStyle = "rgba(34,211,238,0.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(80, y + 28, 14, 0, Math.PI * 2);
      ctx.fillStyle = C.gold;
      ctx.fill();
      ctx.fillStyle = C.bgDeep;
      ctx.font = `bold 13px '${FONT}', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), 80, y + 33);

      ctx.textAlign = "left";
      ctx.fillStyle = C.text;
      ctx.font = `bold 16px '${FONT}', sans-serif`;
      ctx.fillText(`${it.icon || ""} ${it.name}`, 110, y + 35);

      ctx.textAlign = "right";
      ctx.fillStyle = C.muted;
      ctx.font = `13px '${FONT}', sans-serif`;
      ctx.fillText(`${it.count ?? ""}`, w - 68, y + 35);
      ctx.textAlign = "left";
      y += 66;
    });

    return canvas.toBuffer("image/png");
  }

  // Legacy
  static async renderCategoryList(categories, userBalance) {
    return this.renderMainShop({
      displayName: "Người chơi",
      balance: userBalance,
      categories: (categories || []).map((c, i) => ({
        id: c.id,
        name: c.name,
        icon: ["🎒", "⚔️", "🧪"][i] || "📦",
        count: c.itemCount || 0,
      })),
    });
  }

  static async renderMarketplace(listings, page = 1, totalPages = 1, userBalance) {
    return this.renderProductGrid({
      title: "☠️ CHỢ ĐEN",
      products: (listings || []).map((l) => ({
        id: l.id,
        name: l.itemName,
        price: (l.pricePerUnit || 0) * (l.quantity || 1),
        rarity: "rare",
        imageUrl: null,
        description: `x${l.quantity} · ${l.sellerName}`,
      })),
      page,
      totalPages,
      balance: userBalance,
    });
  }
}

export default ShopRenderer;
