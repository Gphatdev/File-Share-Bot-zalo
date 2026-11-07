import { createCanvas } from "canvas";
import {
  C, createScene, toBuffer, paintBg, txt, glass, pill, typeChip, bar, hpColor, plate, groundShadow, drawSprite, drawItem,
  header, footer, fmt, rr, hexA, typeColor, iconCheck, iconCross, iconArrow, iconStar, wrap,
} from "./kit.js";
import { petArt, evoText, drawEggIcon } from "./screens_core.js";
import { loadSpecies, loadItem } from "../assets.js";
import { SPECIES, MOVES } from "../db.js";
import { STAT_KEYS, STAT_LABEL, expForSpeciesLevel, calcStats } from "../pokedex.js";
import { getLearnable, getUpcoming } from "../moves.js";
import { getEvolutionOptions } from "../evolution.js";
import { ITEMS } from "../items.js";
import { UPGRADE_COST } from "../constants.js";
import { EGG_TIERS, eggPool, eggStatus } from "../eggs.js";
import { drawEggArt, drawRays, silhouette } from "./art.js";

const STAT_COLOR = { hp: "#4ade80", atk: "#fb923c", def: "#38bdf8", spa: "#f472b6", spd: "#a78bfa", spe: "#fbbf24" };
const CLS = { physical: "Vật lý", special: "Đặc biệt", status: "Trạng thái" };

function moveRow(ctx, m, x, y, w, o = {}) {
  const col = typeColor(m.type);
  glass(ctx, x, y, w, 64, { accent: o.accent || col, glow: o.glow ?? 5, r: 12, lift: false, fill: o.fill });
  if (o.num) pill(ctx, String(o.num), x + 12, y + 18, { color: col, size: 14, h: 28, padX: 11 });
  const tx = x + (o.num ? 56 : 16);
  txt(ctx, m.name, tx, y + 28, { size: 17, weight: "800", max: w - (tx - x) - 120 });
  typeChip(ctx, m.type, x + w - 12, y + 10, { align: "right", size: 10, h: 18 });
  txt(ctx, `${CLS[m.cls]} · Sức ${m.power ?? "—"} · CX ${m.accuracy ?? "—"} · PP ${m.pp}${o.tag ? ` · ${o.tag}` : ""}`, tx, y + 50, { size: 11, weight: "600", color: C.muted, max: w - (tx - x) - 12 });
}

// ── Hub nâng cấp: .pokemon upt pet ───────────────────────
export async function renderUpgrade({ pet, trainer }) {
  const sp = SPECIES[pet.species];
  const learnable = getLearnable(pet);
  const upcoming = getUpcoming(pet, 3);
  const evos = getEvolutionOptions(pet, trainer.inventory);
  const sc = createScene(1100, 900); const { ctx } = sc;
  const tc = typeColor(pet.types[0]);
  paintBg(sc, tc, C.purple, 41);
  header(sc, "NÂNG CẤP POKÉMON", `${pet.name} · Lv.${pet.level} · EXP Trainer ${fmt(trainer.exp)}`, { accent: tc, right: pet.hp <= 0 ? "ĐANG NGẤT" : "" });
  // trái
  glass(ctx, 36, 112, 340, 420, { accent: tc, glow: 14 });
  await petArt(ctx, pet.species, 56, 130, 300, 220);
  txt(ctx, pet.name, 206, 378, { size: 26, weight: "800", align: "center", glow: 10, glowColor: tc });
  let tx = 206 - pet.types.length * 38;
  for (const t of pet.types) { typeChip(ctx, t, tx, 390, { size: 12, h: 22 }); tx += 78; }
  txt(ctx, `Level ${pet.level}`, 206, 446, { size: 24, weight: "800", align: "center", color: C.yellow });
  const lo = expForSpeciesLevel(pet.species, pet.level), hi = expForSpeciesLevel(pet.species, Math.min(100, pet.level + 1));
  bar(ctx, 66, 460, 280, 12, pet.level >= 100 ? 1 : (pet.exp - lo) / Math.max(1, hi - lo), C.cyan);
  txt(ctx, pet.level >= 100 ? "MAX LEVEL" : `EXP ${fmt(pet.exp - lo)}/${fmt(hi - lo)} · còn ${fmt(Math.max(0, hi - pet.exp))}`, 206, 492, { size: 12, color: C.muted, align: "center", weight: "600" });
  const r = pet.maxHp ? pet.hp / pet.maxHp : 0;
  bar(ctx, 66, 504, 280, 12, r, hpColor(r));
  // phải trên: cột mốc
  glass(ctx, 396, 112, 668, 150, { accent: C.cyan });
  txt(ctx, "CỘT MỐC", 418, 142, { size: 15, weight: "800", color: C.cyan });
  const ms = [];
  for (const e of sp.evolutions) if (e.minLevel) ms.push({ lv: e.minLevel, text: `Tiến hóa → ${SPECIES[e.to].name}`, evo: true });
  for (const u of upcoming) ms.push({ lv: u.level, text: `Chiêu ${u.move.name}`, evo: false });
  ms.sort((a, b) => a.lv - b.lv);
  const shown = ms.slice(0, 5);
  if (!shown.length) txt(ctx, "Không còn cột mốc cấp độ nào phía trước.", 418, 190, { size: 14, color: C.muted, weight: "600" });
  const lineY = 200;
  if (shown.length) {
    ctx.fillStyle = hexA(C.cyan, 0.3); ctx.fillRect(440, lineY, 580, 3);
    shown.forEach((m, i) => {
      const x = shown.length > 1 ? 500 + i * (460 / (shown.length - 1)) : 700;
      const col = m.evo ? C.yellow : C.purple;
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(x, lineY + 1.5, 7, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      txt(ctx, `Lv.${m.lv}`, x, lineY - 14, { size: 13, weight: "800", align: "center", color: m.lv <= pet.level ? C.green : col });
      txt(ctx, m.text, x, lineY + 28, { size: 11, weight: "600", align: "center", color: C.text, max: 120 });
    });
  }
  // chiêu đang biết
  glass(ctx, 396, 280, 668, 252, { accent: C.purple });
  txt(ctx, "CHIÊU ĐANG BIẾT", 418, 310, { size: 15, weight: "800", color: C.purple });
  for (let i = 0; i < 4; i++) {
    const m = MOVES[pet.moves[i]];
    const x = 416 + (i % 2) * 320, y = 326 + Math.floor(i / 2) * 76;
    if (m) moveRow(ctx, m, x, y, 308); else { glass(ctx, x, y, 308, 64, { accent: C.dim, glow: 0, r: 12, lift: false }); txt(ctx, "— ô trống —", x + 154, y + 38, { size: 14, color: C.dim, align: "center" }); }
  }
  txt(ctx, learnable.length ? `Có ${learnable.length} chiêu có thể học ngay` : "Chưa có chiêu mới để học", 418, 506, { size: 13, weight: "700", color: learnable.length ? C.green : C.muted });
  // tiến hóa
  glass(ctx, 36, 550, 1028, 150, { accent: C.yellow });
  txt(ctx, "ĐIỀU KIỆN TIẾN HÓA", 58, 580, { size: 15, weight: "800", color: C.yellow });
  if (!evos.length) txt(ctx, sp.evolvesFrom ? "Pokémon đã ở dạng cuối của chuỗi tiến hóa (trong dữ liệu Kanto)." : "Pokémon này không tiến hóa.", 58, 620, { size: 15, color: C.muted, weight: "600" });
  const ew = Math.min(330, 980 / Math.max(1, evos.length));
  for (let i = 0; i < evos.length; i++) {
    const e = evos[i]; const x = 58 + i * (ew + 8);
    txt(ctx, `→ ${e.toName}`, x, 612, { size: 16, weight: "800", color: e.ready ? C.green : C.text });
    e.reqs.slice(0, 3).forEach((rq, k) => {
      if (rq.met) iconCheck(ctx, x, 624 + k * 22, 16, C.green); else iconCross(ctx, x, 624 + k * 22, 16, C.red);
      txt(ctx, rq.text, x + 24, 637 + k * 22, { size: 13, weight: "600", color: rq.met ? C.text : C.muted, max: ew - 36 });
    });
  }
  // menu
  const cost = UPGRADE_COST.level(pet.level);
  const candy = trainer.inventory.rare_candy || 0;
  const menu = [
    ["1", "Luyện tập", `+1 Level · tốn ${fmt(cost)} EXP Trainer`, C.cyan, trainer.exp >= cost && pet.level < 100],
    ["2", "Học chiêu", `${learnable.length} chiêu có thể học`, C.purple, learnable.length > 0],
    ["3", "Tiến hóa", evos.some((e) => e.ready) ? "SẴN SÀNG!" : evos.length ? "chưa đủ điều kiện" : "không có", C.yellow, evos.some((e) => e.ready)],
    ["4", "Rare Candy", `+1 Level · có x${candy}`, C.pink, candy > 0 && pet.level < 100],
  ];
  menu.forEach(([n, name, sub, col, ok], i) => {
    const x = 36 + i * 258, y = 716, w = 246;
    glass(ctx, x, y, w, 120, { accent: ok ? col : C.dim, glow: ok ? 12 : 0, r: 16 });
    pill(ctx, n, x + 16, y + 14, { color: ok ? col : C.dim, size: 16, h: 30, padX: 13 });
    txt(ctx, name, x + 62, y + 36, { size: 19, weight: "800", color: ok ? C.text : C.dim });
    txt(ctx, sub, x + 16, y + 74, { size: 12, weight: "600", color: ok ? C.muted : C.dim, max: w - 28 });
    txt(ctx, ok ? "SẴN SÀNG" : "KHÓA", x + 16, y + 100, { size: 11, weight: "800", color: ok ? col : C.dim });
  });
  footer(sc, "Reply 1-4 để chọn · Học chiêu & tiến hóa luôn cần xác nhận · Gõ huy để thoát");
  return toBuffer(sc);
}

// ── Danh sách chiêu có thể học ───────────────────────────
export async function renderLearnList({ pet, learnable }) {
  const n = Math.max(1, learnable.length);
  const sc = createScene(1100, 200 + Math.ceil(n / 2) * 76 + 30); const { ctx } = sc;
  paintBg(sc, C.purple, C.cyan, 43);
  header(sc, "HỌC CHIÊU MỚI", `${pet.name} Lv.${pet.level} · tối đa 4 chiêu`, { accent: C.purple });
  const art = await loadSpecies(pet.species); drawSprite(ctx, art, 940, 18, 110, 80);
  if (!learnable.length) txt(ctx, "Chưa có chiêu nào mới để học ở level này.", 550, 190, { size: 20, align: "center", color: C.muted });
  learnable.forEach((m, i) => moveRow(ctx, m.move, 36 + (i % 2) * 520, 112 + Math.floor(i / 2) * 76, 508, { num: i + 1, tag: `Lv.${m.level}` }));
  footer(sc, `Reply số 1-${learnable.length} để chọn chiêu cần học · Gõ huy để hủy`);
  return toBuffer(sc);
}

// ── Xác nhận học / chọn chiêu thay ───────────────────────
export async function renderLearnConfirm({ pet, moveId, replaceId = null, stage = "confirm" }) {
  const nm = MOVES[moveId];
  const sc = createScene(1100, 560); const { ctx } = sc;
  paintBg(sc, typeColor(nm.type), C.purple, 47);
  header(sc, stage === "pick" ? "CHỌN CHIÊU ĐỂ THAY THẾ" : "XÁC NHẬN HỌC CHIÊU", `${pet.name} đã biết đủ 4 chiêu — học chiêu mới sẽ quên 1 chiêu cũ`, { accent: C.purple });
  const art = await loadSpecies(pet.species); drawSprite(ctx, art, 940, 18, 110, 80);
  txt(ctx, "CHIÊU MỚI", 40, 130, { size: 14, weight: "800", color: C.green });
  moveRow(ctx, nm, 36, 142, 1028, { accent: C.green, glow: 12 });
  txt(ctx, "CHIÊU HIỆN TẠI", 40, 238, { size: 14, weight: "800", color: C.muted });
  for (let i = 0; i < pet.moves.length; i++) {
    const m = MOVES[pet.moves[i]];
    const rep = replaceId === pet.moves[i];
    moveRow(ctx, m, 36 + (i % 2) * 520, 252 + Math.floor(i / 2) * 76, 508, { num: stage === "pick" ? i + 1 : null, accent: rep ? C.red : null, glow: rep ? 14 : 4, tag: rep ? "SẼ BỊ QUÊN" : null });
  }
  if (stage === "pick") footer(sc, "Reply 1-4 chọn chiêu muốn quên · Gõ huy để hủy");
  else footer(sc, replaceId ? `Quên ${MOVES[replaceId].name} để học ${nm.name}? Reply  y  để xác nhận ·  n  để hủy` : `Dạy ${nm.name} cho ${pet.name}? Reply  y  để xác nhận ·  n  để hủy`);
  return toBuffer(sc);
}
export async function renderLearnDone({ pet, learned, replaced }) {
  const sc = createScene(900, 420); const { ctx } = sc;
  paintBg(sc, C.green, C.purple, 49);
  glass(ctx, 30, 30, 840, 360, { accent: C.green, glow: 16 });
  const art = await loadSpecies(pet.species); plate(ctx, 160, 200, 120, C.green); drawSprite(ctx, art, 60, 100, 200, 200);
  txt(ctx, "HỌC CHIÊU THÀNH CÔNG!", 580, 90, { size: 26, weight: "800", align: "center", glow: 12, glowColor: C.green });
  moveRow(ctx, MOVES[learned], 300, 118, 540, { accent: C.green, glow: 10 });
  txt(ctx, replaced ? `${pet.name} đã quên ${MOVES[replaced].name}.` : `${pet.name} có thêm 1 chiêu mới.`, 570, 232, { size: 15, align: "center", weight: "600", color: C.muted });
  pet.moves.forEach((id, i) => { const m = MOVES[id]; pill(ctx, m.name, 330 + (i % 2) * 260, 262 + Math.floor(i / 2) * 40, { color: typeColor(m.type), size: 13, h: 28 }); });
  return toBuffer(sc);
}

// ── Xác nhận tiến hóa ────────────────────────────────────
export async function renderEvolveConfirm({ pet, option, trainer }) {
  const toSp = SPECIES[option.to];
  const sc = createScene(1100, 700); const { ctx } = sc;
  paintBg(sc, C.yellow, typeColor(toSp.types[0]), 51);
  header(sc, "XÁC NHẬN TIẾN HÓA", `${pet.name} → ${toSp.name}`, { accent: C.yellow });
  glass(ctx, 36, 112, 330, 330, { accent: typeColor(pet.types[0]) });
  await petArt(ctx, pet.species, 56, 130, 290, 240);
  txt(ctx, pet.name, 201, 410, { size: 22, weight: "800", align: "center" });
  iconArrow(ctx, 392, 276, 120, C.yellow, 6);
  glass(ctx, 534, 112, 330, 330, { accent: typeColor(toSp.types[0]), glow: 18 });
  await petArt(ctx, toSp.id, 554, 130, 290, 240);
  txt(ctx, toSp.name, 699, 410, { size: 22, weight: "800", align: "center", glow: 12, glowColor: typeColor(toSp.types[0]) });
  // chỉ số
  const now = { hp: pet.maxHp, atk: pet.atk, def: pet.def, spa: pet.spa, spd: pet.spd, spe: pet.spe };
  const after = calcStats(toSp.id, pet.level, pet.iv || {}, pet.bonus || {});
  glass(ctx, 884, 112, 180, 330, { accent: C.cyan });
  STAT_KEYS.forEach((k, i) => {
    const a = k === "hp" ? after.maxHp : after[k]; const d = a - now[k];
    txt(ctx, STAT_LABEL[k], 900, 150 + i * 46, { size: 12, color: C.muted, weight: "700" });
    txt(ctx, `${now[k]} → ${a}`, 900, 172 + i * 46, { size: 14, weight: "800" });
    txt(ctx, `+${d}`, 1048, 172 + i * 46, { size: 13, weight: "800", align: "right", color: C.green });
  });
  glass(ctx, 36, 462, 1028, 170, { accent: C.yellow });
  txt(ctx, "ĐIỀU KIỆN", 58, 494, { size: 15, weight: "800", color: C.yellow });
  option.reqs.forEach((rq, i) => {
    if (rq.met) iconCheck(ctx, 58, 506 + i * 28, 20, C.green); else iconCross(ctx, 58, 506 + i * 28, 20, C.red);
    txt(ctx, rq.text, 88, 523 + i * 28, { size: 16, weight: "700", color: rq.met ? C.text : C.muted });
  });
  txt(ctx, "Chiêu đã học và Level được giữ nguyên · không thể hoàn tác", 560, 560, { size: 14, color: C.muted, weight: "600" });
  if (option.itemId) txt(ctx, `Sẽ tiêu 1x ${ITEMS[option.itemId].name}`, 560, 590, { size: 14, color: C.pink, weight: "800" });
  footer(sc, "Reply  y  để tiến hóa ·  n  để hủy");
  return toBuffer(sc);
}

// ── Hiệu ứng tiến hóa: khung 1 (phát sáng) & khung 2 (kết quả) ──
export async function renderEvolveFrame({ species, toSpecies }) {
  const sc = createScene(900, 600); const { ctx } = sc;
  paintBg(sc, C.cyan, C.purple, 53);
  drawRays(ctx, 450, 280, 520, "#ffffff", 28, 3);
  const img = await loadSpecies(species);
  if (img) {
    const sil = silhouette(createCanvas, img, "#ffffff");
    const s = Math.min(320 / img.width, 320 / img.height);
    ctx.save(); ctx.shadowColor = "#7dd3fc"; ctx.shadowBlur = 40;
    ctx.drawImage(sil, 450 - img.width * s / 2, 280 - img.height * s / 2, img.width * s, img.height * s); ctx.restore();
  }
  txt(ctx, `${SPECIES[species].name} đang tiến hóa...`, 450, 520, { size: 30, weight: "800", align: "center", glow: 20, glowColor: "#7dd3fc" });
  return toBuffer(sc);
}
export async function renderEvolveResult({ pet, from, before }) {
  const toSp = SPECIES[pet.species]; const fromSp = SPECIES[from];
  const tc = typeColor(toSp.types[0]);
  const sc = createScene(1100, 720); const { ctx } = sc;
  paintBg(sc, tc, C.yellow, 55);
  drawRays(ctx, 550, 260, 620, tc, 30, 9);
  header(sc, "TIẾN HÓA THÀNH CÔNG!", `${fromSp.name} đã tiến hóa thành ${toSp.name}!`, { accent: C.yellow });
  const old = await loadSpecies(from);
  drawSprite(ctx, old, 70, 190, 190, 190, { alpha: 0.55 });
  txt(ctx, fromSp.name, 165, 408, { size: 16, weight: "700", align: "center", color: C.muted });
  iconArrow(ctx, 290, 285, 90, C.yellow, 5);
  plate(ctx, 600, 270, 260, tc);
  await petArt(ctx, toSp.id, 440, 120, 320, 300, { plate: false });
  txt(ctx, toSp.name, 600, 462, { size: 36, weight: "800", align: "center", glow: 20, glowColor: tc });
  let tx = 600 - toSp.types.length * 40;
  for (const t of toSp.types) { typeChip(ctx, t, tx, 476, { size: 13, h: 24 }); tx += 82; }
  glass(ctx, 820, 150, 244, 300, { accent: C.cyan });
  txt(ctx, "CHỈ SỐ", 840, 180, { size: 14, weight: "800", color: C.cyan });
  STAT_KEYS.forEach((k, i) => {
    const a = k === "hp" ? pet.maxHp : pet[k]; const b = k === "hp" ? before.maxHp : before[k];
    txt(ctx, STAT_LABEL[k], 840, 214 + i * 40, { size: 12, color: C.muted, weight: "700" });
    txt(ctx, `${b} → ${a}`, 840, 234 + i * 40, { size: 14, weight: "800" });
    txt(ctx, `+${a - b}`, 1046, 234 + i * 40, { size: 13, weight: "800", align: "right", color: C.green });
  });
  glass(ctx, 36, 560, 1028, 110, { accent: C.yellow });
  txt(ctx, "LỊCH SỬ TIẾN HÓA", 58, 592, { size: 14, weight: "800", color: C.yellow });
  const hist = (pet.evoHistory || []).filter((h) => h.from).map((h) => `${SPECIES[h.from]?.name} → ${SPECIES[h.to]?.name} (Lv.${h.level})`);
  txt(ctx, hist.join("   ·   ") || `${fromSp.name} → ${toSp.name}`, 58, 626, { size: 16, weight: "700", max: 980 });
  txt(ctx, `Level ${pet.level} · ${pet.moves.map((m) => MOVES[m]?.name).join(", ")}`, 58, 652, { size: 13, color: C.muted, weight: "600", max: 980 });
  return toBuffer(sc);
}

// ── Trứng ─────────────────────────────────────────────────
export async function renderEggs({ trainer, userName = "Trainer" }) {
  const sc = createScene(1100, 840); const { ctx } = sc;
  paintBg(sc, C.green, C.cyan, 61);
  header(sc, "TRỨNG POKÉMON", `${userName} · lò ấp ${trainer.eggs.length}/3 · ${trainer.badges.length} huy hiệu`, { accent: C.green });
  for (let i = 0; i < 3; i++) {
    const x = 36 + i * 346, y = 112, w = 330, h = 470;
    const egg = trainer.eggs[i];
    if (!egg) {
      glass(ctx, x, y, w, h, { accent: C.dim, glow: 0 });
      iconLock(ctx, x + w / 2 - 22, y + 150, 44);
      txt(ctx, `Ô ${i + 1} trống`, x + w / 2, y + 240, { size: 20, weight: "800", align: "center", color: C.dim });
      txt(ctx, "Mua trứng ở .shop → Pokémon", x + w / 2, y + 270, { size: 13, align: "center", color: C.dim, weight: "600" });
      txt(ctx, ".pokemon egg ap <loại>", x + w / 2, y + 296, { size: 13, align: "center", color: C.dim, weight: "600" });
      continue;
    }
    const t = EGG_TIERS[egg.tier]; const st = eggStatus(egg, trainer.badges.length);
    glass(ctx, x, y, w, h, { accent: st.ready ? C.green : t.color, glow: st.ready ? 18 : 10 });
    pill(ctx, `#${i + 1}`, x + 16, y + 14, { color: t.color, size: 13, h: 24 });
    pill(ctx, t.name.toUpperCase(), x + w - 16, y + 14, { color: t.color, size: 11, h: 24, align: "right" });
    plate(ctx, x + w / 2, y + 150, 130, t.color);
    await drawEggIcon(ctx, egg.tier, x + w / 2 - 80, y + 40, 160);
    bar(ctx, x + 24, y + 262, w - 48, 16, st.pct, st.ready ? C.green : t.color);
    txt(ctx, `${egg.steps}/${egg.need} bước`, x + w / 2, y + 304, { size: 16, weight: "800", align: "center" });
    txt(ctx, st.reason, x + w / 2, y + 328, { size: 13, weight: "700", align: "center", color: st.ready ? C.green : C.yellow, max: w - 30 });
    const pool = eggPool(egg.tier);
    txt(ctx, `Có thể nở (${pool.length} loài):`, x + 20, y + 360, { size: 12, color: C.muted, weight: "700" });
    for (let k = 0; k < 8; k++) {
      const sp = pool[Math.floor((k * pool.length) / 8)];
      const img = await loadSpecies(sp.id);
      drawSprite(ctx, img, x + 18 + (k % 4) * 76, y + 372 + Math.floor(k / 4) * 46, 70, 44, { grayscale: true, alpha: 0.75 });
    }
  }
  glass(ctx, 36, 600, 1028, 190, { accent: C.cyan });
  txt(ctx, "TRỨNG TRONG KHO", 58, 632, { size: 15, weight: "800", color: C.cyan });
  let k = 0;
  for (const tier of Object.values(EGG_TIERS)) {
    const n = trainer.inventory[tier.item] || 0;
    const x = 58 + k * 340;
    await drawEggIcon(ctx, tier.id, x, 644, 56);
    txt(ctx, `${tier.name}  x${n}`, x + 70, 676, { size: 16, weight: "800", color: n ? C.text : C.dim });
    txt(ctx, `${tier.steps} bước · ${tier.badges ? `${tier.badges} huy hiệu` : "không điều kiện"}`, x + 70, 698, { size: 12, color: C.muted, weight: "600" });
    k++;
  }
  txt(ctx, "Trứng tích bước khi: di chuyển (.pokemon map), gặp/hạ Pokémon hoang, Solo, đánh Gym.", 58, 740, { size: 13, color: C.muted, weight: "600" });
  txt(ctx, "Lệnh: .pokemon egg ap <thuong|hiem|cuchiem> · .pokemon egg no <số ô>   (trứng là cơ chế của project)", 58, 766, { size: 13, color: C.text, weight: "700" });
  return toBuffer(sc);
}
import { iconLock } from "./kit.js";

export async function renderHatch({ pet, egg }) {
  const t = EGG_TIERS[egg.tier]; const sp = SPECIES[pet.species]; const tc = typeColor(sp.types[0]);
  const sc = createScene(1000, 700); const { ctx } = sc;
  paintBg(sc, t.color, tc, 63);
  drawRays(ctx, 500, 290, 560, t.accent, 26, 4);
  header(sc, "TRỨNG ĐÃ NỞ!", `${t.name} → ${sp.name}`, { accent: t.color });
  // mảnh vỏ
  for (const [dx, dy, rot] of [[-210, 250, -0.5], [220, 270, 0.6], [-120, 340, 0.3], [150, 350, -0.3]]) {
    ctx.save(); ctx.translate(500 + dx, 260 + dy * 0.6); ctx.rotate(rot); drawEggArt(ctx, 0, 0, 56, 40, egg.tier, 0); ctx.restore();
  }
  plate(ctx, 500, 300, 250, tc);
  await petArt(ctx, pet.species, 340, 130, 320, 300, { plate: false });
  txt(ctx, sp.name, 500, 480, { size: 38, weight: "800", align: "center", glow: 20, glowColor: tc });
  let tx = 500 - sp.types.length * 40;
  for (const ty of sp.types) { typeChip(ctx, ty, tx, 494, { size: 13, h: 24 }); tx += 82; }
  glass(ctx, 200, 548, 600, 100, { accent: t.color });
  txt(ctx, `Level ${pet.level} · HP ${pet.maxHp} · ATK ${pet.atk} · SPE ${pet.spe}`, 500, 590, { size: 18, weight: "800", align: "center" });
  txt(ctx, `Chiêu: ${pet.moves.map((m) => MOVES[m]?.name).join(", ")}`, 500, 622, { size: 14, color: C.muted, weight: "600", align: "center", max: 560 });
  return toBuffer(sc);
}
