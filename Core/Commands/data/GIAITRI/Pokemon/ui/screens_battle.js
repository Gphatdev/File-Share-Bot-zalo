import {
  C, createScene, toBuffer, paintBg, txt, glass, pill, typeChip, bar, hpColor, plate, groundShadow, drawSprite, drawItem,
  header, footer, fmt, rr, hexA, typeColor, iconCoin, iconStar, iconCheck, iconCross, wrap, measure,
} from "./kit.js";
import { petArt } from "./screens_core.js";
import { loadSpecies, loadItem, loadBadge } from "../assets.js";
import { SPECIES, MOVES } from "../db.js";
import { getMoveInfo } from "../battle.js";
import { ITEMS } from "../items.js";
import { drawRays } from "./art.js";
import { getNode } from "../world.js";

const CLS = { physical: "Vật lý", special: "Đặc biệt", status: "Trạng thái" };

function hpPanel(ctx, c, x, y, w, accent, label = "") {
  glass(ctx, x, y, w, 96, { accent, glow: 8, r: 14 });
  txt(ctx, c.name, x + 16, y + 30, { size: 20, weight: "800", max: w - 120 });
  txt(ctx, `Lv.${c.level}`, x + w - 16, y + 30, { size: 17, weight: "800", color: C.yellow, align: "right" });
  let tx = x + 16; for (const t of c.types) tx += typeChip(ctx, t, tx, y + 40, { size: 10, h: 18 }) + 6;
  if (label) txt(ctx, label, x + w - 16, y + 54, { size: 11, color: C.muted, align: "right", weight: "700" });
  const r = c.maxHp ? c.hp / c.maxHp : 0;
  bar(ctx, x + 16, y + 68, w - 90, 13, r, hpColor(r), { glow: 5 });
  txt(ctx, `${c.hp}/${c.maxHp}`, x + w - 16, y + 79, { size: 13, weight: "800", align: "right" });
}
function partyDots(ctx, party, idx, x, y, align = "left") {
  party.forEach((p, i) => {
    const dx = align === "left" ? x + i * 20 : x - (party.length - i) * 20 + 10;
    ctx.fillStyle = p.hp <= 0 ? "#475569" : i === idx ? C.yellow : C.green;
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = p.hp > 0 ? 6 : 0;
    ctx.beginPath(); ctx.arc(dx, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  });
}
function moveGrid(ctx, c, x, y, w, o = {}) {
  const mv = c.moves;
  for (let i = 0; i < 4; i++) {
    const m = mv[i]; const mi = m && getMoveInfo(m.id);
    const bw = (w - 12) / 2; const bx = x + (i % 2) * (bw + 12), by = y + Math.floor(i / 2) * 70;
    if (!mi) { glass(ctx, bx, by, bw, 62, { accent: C.dim, glow: 0, r: 12, lift: false }); txt(ctx, "—", bx + bw / 2, by + 38, { size: 16, color: C.dim, align: "center" }); continue; }
    const col = typeColor(mi.type); const dead = m.pp <= 0;
    glass(ctx, bx, by, bw, 62, { accent: dead ? C.dim : col, glow: dead ? 0 : 6, r: 12, lift: false });
    pill(ctx, String(i + 1), bx + 10, by + 15, { color: dead ? C.dim : col, size: 13, h: 26, padX: 10 });
    txt(ctx, mi.name, bx + 50, by + 26, { size: 15, weight: "800", color: dead ? C.dim : C.text, max: bw - 140 });
    typeChip(ctx, mi.type, bx + bw - 10, by + 10, { align: "right", size: 9, h: 16 });
    txt(ctx, `${CLS[mi.cls]} · Sức ${mi.power ?? "—"} · PP ${m.pp}/${m.maxPp}`, bx + 50, by + 49, { size: 11, color: C.muted, weight: "600", max: bw - 60 });
  }
}
function logBox(ctx, lines, x, y, w, h, accent = C.cyan) {
  glass(ctx, x, y, w, h, { accent, glow: 6, r: 14 });
  const last = lines.slice(-4);
  last.forEach((l, i) => txt(ctx, l, x + 16, y + 28 + i * 24, { size: 13, weight: i === last.length - 1 ? "700" : "600", color: i === last.length - 1 ? C.text : C.muted, max: w - 32 }));
}

// ── Trận PvE (hoang dã / Gym) ────────────────────────────
export async function renderBattle({ kind = "wild", player, enemy, node, log = [], balls = null, enemyLabel = "", enemyParty = null, eIdx = 0, playerParty = null, pIdx = 0, caption = "" }) {
  const sc = createScene(1100, 760); const { ctx } = sc;
  const accent = kind === "gym" ? C.yellow : typeColor(enemy.types[0]);
  paintBg(sc, accent, typeColor(player.types[0]), 91);
  const nd = node ? getNode(node) : null;
  header(sc, kind === "gym" ? `GYM ${enemyLabel.toUpperCase()}` : "POKÉMON HOANG DÃ", `${nd?.name || ""}${caption ? " · " + caption : ""}`, { accent });
  // sân đấu
  ctx.save(); rr(ctx, 36, 108, 1028, 330, 18); ctx.clip();
  const g = ctx.createLinearGradient(0, 108, 0, 438); g.addColorStop(0, hexA(accent, 0.18)); g.addColorStop(1, "rgba(5,8,22,0.9)"); ctx.fillStyle = g; ctx.fillRect(36, 108, 1028, 330);
  ctx.strokeStyle = "rgba(255,255,255,0.05)"; for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(36, 300 + i * 12); ctx.lineTo(1064, 300 + i * 12); ctx.stroke(); }
  ctx.restore();
  glass(ctx, 36, 108, 1028, 330, { accent, glow: 12, fill: "rgba(0,0,0,0)" });
  hpPanel(ctx, enemy, 60, 124, 360, C.red, enemyParty ? `Đối thủ ${eIdx + 1}/${enemyParty.length}` : "HOANG DÃ");
  if (enemyParty) partyDots(ctx, enemyParty, eIdx, 440, 136);
  await petArt(ctx, enemy.species, 700, 116, 290, 214);
  hpPanel(ctx, player, 680, 336, 360, C.green, playerParty ? `Đội ${pIdx + 1}/${playerParty.length}` : "CỦA BẠN");
  if (playerParty) partyDots(ctx, playerParty, pIdx, 668, 392, "right");
  await petArt(ctx, player.species, 100, 232, 260, 200, { flip: false });
  // điều khiển
  moveGrid(ctx, player, 36, 456, 640);
  logBox(ctx, log, 696, 456, 368, 140, accent);
  if (balls) {
    glass(ctx, 36, 604, 1028, 92, { accent: C.cyan, glow: 6, r: 14 });
    txt(ctx, "BÓNG", 56, 640, { size: 13, weight: "800", color: C.cyan });
    let bx = 120;
    for (const id of ["pokeball", "greatball", "ultraball", "masterball"]) {
      const img = await loadItem(id); const n = balls[id] || 0;
      drawItem(ctx, img, bx, 616, 44); txt(ctx, `x${n}`, bx + 50, 645, { size: 15, weight: "800", color: n ? C.text : C.dim });
      bx += 120;
    }
    txt(ctx, "ball <loại> · item <tên> · chay", 1044, 640, { size: 13, weight: "700", color: C.muted, align: "right" });
    txt(ctx, "VD: ball great   |   item potion", 1044, 664, { size: 12, color: C.dim, weight: "600", align: "right" });
  } else {
    glass(ctx, 36, 604, 1028, 92, { accent: C.cyan, glow: 6, r: 14 });
    txt(ctx, "Reply 1-4 để dùng chiêu · item <tên> để hồi máu (tốn 1 lượt) · chay để bỏ cuộc (thua Gym)", 550, 656, { size: 14, weight: "700", color: C.muted, align: "center" });
  }
  footer(sc, "Chiêu trạng thái chưa có hiệu ứng trong phiên bản này · PP hồi đầy sau mỗi trận");
  return toBuffer(sc);
}

// ── Ném bóng ─────────────────────────────────────────────
export async function renderThrowBall({ ballId, wild, result }) {
  const sc = createScene(900, 620); const { ctx } = sc;
  const ok = result.success; const col = ok ? C.green : C.red;
  paintBg(sc, col, C.cyan, 93);
  header(sc, ok ? "THU PHỤC THÀNH CÔNG!" : "THU PHỤC THẤT BẠI", ok ? `${wild.name} đã vào ${ITEMS[ballId].name}` : `${wild.name} thoát ra khỏi ${ITEMS[ballId].name}`, { accent: col });
  if (ok) drawRays(ctx, 450, 300, 420, C.green, 22, 6);
  const img = await loadSpecies(wild.species);
  plate(ctx, 450, 300, 200, typeColor(wild.types[0]));
  if (!ok) drawSprite(ctx, img, 300, 140, 300, 280);
  else { const bimg = await loadItem(ballId); drawItem(ctx, bimg, 360, 200, 180, { glow: C.green }); }
  txt(ctx, `${wild.name} Lv.${wild.level}`, 450, 470, { size: 26, weight: "800", align: "center" });
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i < result.shakes ? col : "#334155"; ctx.shadowColor = col; ctx.shadowBlur = i < result.shakes ? 10 : 0;
    ctx.beginPath(); ctx.arc(390 + i * 40, 510, 10, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
  txt(ctx, `Lắc ${result.shakes}/4 lần · tỉ lệ ~${Math.round((result.chance || 0) * 100)}%`, 450, 560, { size: 14, color: C.muted, weight: "700", align: "center" });
  return toBuffer(sc);
}

// ── Chiến thắng hoang dã / Gym ──────────────────────────
export async function renderPveResult({ win, title, subtitle, petRows = [], extra = [], badgeId = null, money = null, exp = null }) {
  const col = win ? C.green : C.red;
  const sc = createScene(1000, 360 + petRows.length * 72 + (badgeId ? 120 : 0)); const { ctx, w } = sc;
  paintBg(sc, col, C.yellow, 95);
  if (win) drawRays(ctx, 500, 120, 520, col, 24, 8);
  txt(ctx, title, 500, 100, { size: 46, weight: "800", align: "center", glow: 24, glowColor: col });
  { const w = Math.min(900, measure(ctx, subtitle, 16, "700") + 40); ctx.fillStyle = "rgba(5,8,22,0.62)"; rr(ctx, 500 - w / 2, 122, w, 28, 14); ctx.fill(); }
  txt(ctx, subtitle, 500, 142, { size: 16, weight: "700", align: "center", color: C.text, max: 880 });
  let y = 170;
  if (badgeId) {
    const b = await loadBadge(badgeId); drawItem(ctx, b, 440, y, 100, { glow: C.yellow }); y += 120;
  }
  for (const r of petRows) {
    glass(ctx, 50, y, 900, 62, { accent: col, glow: 6, r: 14, lift: false });
    const img = await loadSpecies(r.species); drawSprite(ctx, img, 60, y + 4, 54, 54);
    txt(ctx, `${r.name} Lv.${r.level}`, 130, y + 28, { size: 17, weight: "800" });
    txt(ctx, r.text, 130, y + 50, { size: 12, color: C.muted, weight: "600", max: 560 });
    txt(ctx, r.right || "", 930, y + 38, { size: 15, weight: "800", color: C.cyan, align: "right" });
    y += 72;
  }
  const bits = [];
  if (exp != null) bits.push([`+${fmt(exp)} EXP`, C.cyan]);
  if (money != null) bits.push([`+${fmt(money)} GOLD`, C.yellow]);
  for (const e of extra) bits.push([e, C.text]);
  let x = 500 - bits.reduce((s, b) => s + measure(ctx, b[0], 18, "800") + 36, 0) / 2;
  for (const [t, c] of bits) { txt(ctx, t, x, y + 30, { size: 18, weight: "800", color: c }); x += measure(ctx, t, 18, "800") + 36; }
  return toBuffer(sc);
}

// ── Solo ─────────────────────────────────────────────────
export async function renderSoloRoom({ room }) {
  const sc = createScene(1000, 520); const { ctx } = sc;
  paintBg(sc, C.red, C.blue, 97);
  header(sc, "PHÒNG SOLO POKÉMON", room.guestUid ? "Sẵn sàng!" : "Đang chờ đối thủ…", { accent: C.red, right: `Mã ${room.roomId.slice(-6)}` });
  for (const [i, side] of [["host", room.hostName], ["guest", room.guestName]].entries()) {
    const x = 36 + i * 480, pet = i === 0 ? room.hostPet : room.guestPet;
    glass(ctx, x, 112, 448, 290, { accent: i === 0 ? C.cyan : C.pink, glow: 12 });
    txt(ctx, i === 0 ? "CHỦ PHÒNG" : "KHÁCH", x + 20, 142, { size: 12, weight: "800", color: i === 0 ? C.cyan : C.pink });
    txt(ctx, side[1] || "Chờ người chơi…", x + 20, 176, { size: 22, weight: "800", color: side[1] ? C.text : C.dim, max: 400 });
    if (pet) { await petArt(ctx, pet.species, x + 80, 190, 288, 160); txt(ctx, `${pet.name} Lv.${pet.level}`, x + 224, 380, { size: 16, weight: "800", align: "center" }); }
    else txt(ctx, "?", x + 224, 300, { size: 80, weight: "800", align: "center", color: C.dim });
  }
  txt(ctx, "VS", 500, 270, { size: 44, weight: "800", align: "center", glow: 18, glowColor: C.red });
  footer(sc, "Người khác dùng  .pokemon solo thamgia  để vào · Gõ  .pokemon huy  để hủy phòng");
  return toBuffer(sc);
}
export async function renderSoloBattle({ room, log = [], forUid = null }) {
  const turnHost = room.turn === room.hostUid;
  const cur = turnHost ? room.hostPet : room.guestPet;
  const sc = createScene(1100, 760); const { ctx } = sc;
  paintBg(sc, C.red, C.cyan, 99);
  header(sc, "SOLO POKÉMON", `Lượt ${room.turnCount || 1} · ${turnHost ? room.hostName : room.guestName} chọn chiêu`, { accent: C.red, right: `Tối đa ${room.maxTurns || 60} lượt` });
  glass(ctx, 36, 108, 1028, 330, { accent: C.red, glow: 12 });
  hpPanel(ctx, room.guestPet, 60, 124, 360, C.pink, room.guestName);
  partyDots(ctx, room.guestParty, room.guestParty.findIndex((p) => p.uid === room.guestPet.uid), 440, 136);
  await petArt(ctx, room.guestPet.species, 700, 116, 290, 214);
  hpPanel(ctx, room.hostPet, 680, 336, 360, C.cyan, room.hostName);
  partyDots(ctx, room.hostParty, room.hostParty.findIndex((p) => p.uid === room.hostPet.uid), 668, 392, "right");
  await petArt(ctx, room.hostPet.species, 100, 232, 260, 200);
  moveGrid(ctx, cur, 36, 456, 640);
  logBox(ctx, log, 696, 456, 368, 140, C.red);
  glass(ctx, 36, 604, 1028, 92, { accent: C.cyan, glow: 6, r: 14 });
  txt(ctx, `Lượt của ${turnHost ? room.hostName : room.guestName}`, 550, 640, { size: 20, weight: "800", align: "center", color: turnHost ? C.cyan : C.pink });
  txt(ctx, "Reply 1-4 để dùng chiêu · dohang để đầu hàng", 550, 672, { size: 13, weight: "600", color: C.muted, align: "center" });
  return toBuffer(sc);
}

export async function renderSoloResult({ result, name, oppName, pet, exp, money, stats, matchId, turns }) {
  const win = result === "win", draw = result === "draw";
  const col = win ? C.green : draw ? C.yellow : C.red;
  const sc = createScene(1000, 640); const { ctx } = sc;
  paintBg(sc, col, C.purple, 101);
  if (win) drawRays(ctx, 500, 190, 560, col, 26, 12);
  txt(ctx, win ? "VICTORY" : draw ? "DRAW" : "DEFEAT", 500, 100, { size: 64, weight: "800", align: "center", glow: 30, glowColor: col });
  { const tx = `${name}  vs  ${oppName}`; const w = Math.min(900, measure(ctx, tx, 17, "700") + 44); ctx.fillStyle = "rgba(5,8,22,0.62)"; rr(ctx, 500 - w / 2, 120, w, 30, 15); ctx.fill(); }
  txt(ctx, `${name}  vs  ${oppName}`, 500, 142, { size: 17, weight: "700", align: "center", color: C.text, max: 880 });
  glass(ctx, 50, 170, 420, 250, { accent: col, glow: 14 });
  if (pet) { await petArt(ctx, pet.species, 70, 180, 380, 190, { alpha: win || draw ? 1 : 0.8 }); txt(ctx, `${pet.name} Lv.${pet.level}`, 260, 400, { size: 17, weight: "800", align: "center" }); }
  glass(ctx, 490, 170, 460, 250, { accent: C.yellow, glow: 10 });
  txt(ctx, "PHẦN THƯỞNG", 514, 200, { size: 13, weight: "800", color: C.yellow });
  iconStar(ctx, 528, 242, 12, C.cyan); txt(ctx, `+${fmt(exp)} EXP`, 552, 252, { size: 28, weight: "800", color: C.cyan });
  iconCoin(ctx, 528, 304, 13); txt(ctx, `+${fmt(money)} GOLD`, 552, 314, { size: 28, weight: "800", color: C.yellow });
  txt(ctx, `${win ? "Thắng" : draw ? "Hòa" : "Thua"} sau ${turns} lượt`, 514, 362, { size: 14, color: C.muted, weight: "700" });
  txt(ctx, `Mã trận ${matchId}`, 514, 392, { size: 11, color: C.dim, weight: "600" });
  glass(ctx, 50, 440, 900, 130, { accent: C.cyan, glow: 6 });
  const rows = [["Thắng", stats.wins], ["Thua", stats.losses], ["Hòa", stats.draws || 0], ["Tổng EXP Trainer", fmt(stats.exp)], ["Trainer Lv.", stats.trainerLevel]];
  rows.forEach(([k, v], i) => { const x = 90 + i * 170; txt(ctx, String(v), x, 505, { size: 30, weight: "800" }); txt(ctx, k, x, 535, { size: 12, color: C.muted, weight: "700" }); });
  footer(sc, "Thưởng chỉ trả 1 lần cho mỗi trận · Gõ .pokemon rank để xem bảng xếp hạng");
  return toBuffer(sc);
}
