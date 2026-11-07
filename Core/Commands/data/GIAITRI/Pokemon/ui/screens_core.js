import {
  C, createScene, toBuffer, paintBg, txt, glass, pill, typeChip, bar, hpColor, plate, groundShadow, drawSprite, drawItem,
  header, footer, fmt, rr, hexA, typeColor, iconCoin, iconStar, iconCheck, iconLock, wrap, RARITY_COLOR, measure, iconBolt,
} from "./kit.js";
import { loadSpecies, loadItem, loadBadge } from "../assets.js";
import { SPECIES, MOVES } from "../db.js";
import { STARTERS, STAT_KEYS, STAT_LABEL, expForSpeciesLevel } from "../pokedex.js";
import { ITEMS, ITEM_CATS } from "../items.js";
import { BADGES } from "../config.js";
import { expForLevel, expToNext } from "../constants.js";
import { getNode } from "../world.js";
import { EGG_TIERS } from "../eggs.js";
import { getConfiguredBotName } from "../../../../../../Utils/Branding.js";

const STAT_COLOR = { hp: "#4ade80", atk: "#fb923c", def: "#38bdf8", spa: "#f472b6", spd: "#a78bfa", spe: "#fbbf24" };

export async function petArt(ctx, speciesId, x, y, w, h, o = {}) {
  const img = await loadSpecies(speciesId);
  const sp = SPECIES[speciesId];
  const col = typeColor(sp?.types?.[0]);
  if (o.plate !== false) plate(ctx, x + w / 2, y + h / 2, Math.max(w, h) * 0.62, col);
  groundShadow(ctx, x + w / 2, y + h * 0.93, w * 0.62);
  return drawSprite(ctx, img, x, y, w, h, { flip: o.flip, grayscale: o.silhouette, alpha: o.alpha ?? 1 });
}

// ── Help / menu ──────────────────────────────────────────
export async function renderHelp({ userName = "Trainer", prefix = "." } = {}) {
  const sc = createScene(1100, 800); const { ctx } = sc;
  paintBg(sc, C.purple, C.cyan, 11);
  header(sc, "POKÉMON RPG · KANTO", `Chào ${userName}! Hành trình trở thành Nhà vô địch bắt đầu từ đây.`, { accent: C.cyan, right: "NEON EDITION" });
  const art = [["charizard", 900, 20], ["pikachu", 790, 40], ["blastoise", 690, 25]];
  for (const [id, x, y] of art) { const img = await loadSpecies(id); drawSprite(ctx, img, x, y, 110, 110); }
  const p = `${prefix}pokemon`;
  const cmds = [
    ["pet", "Chọn Pokémon khởi đầu / xem thẻ Pokémon", C.green],
    ["upt pet", "Nâng cấp: học chiêu, tiến hóa, Rare Candy", C.purple],
    ["balo [item]", "Xem Pokémon / kho vật phẩm", C.cyan],
    ["map", "Bản đồ Kanto · đi tới khu vực", C.blue],
    ["thuphuc [cau]", "Gặp & bắt Pokémon hoang dã", C.yellow],
    ["nhiemvu", "Nhiệm vụ · nhận EXP & tiền", C.pink],
    ["solo", "Đấu Solo PvP · thưởng EXP + tiền", C.red],
    ["gym", "Thách đấu Gym Leader nhận huy hiệu", C.orange],
    ["egg", "Ấp & nở trứng Pokémon", C.green],
    ["dung <vật phẩm>", "Dùng Potion, Berry, Rare Candy…", C.cyan],
    ["hoi", "Hồi phục tại Pokémon Center", C.blue],
    ["rank · info · huy", "Xếp hạng · hồ sơ Trainer · hủy thao tác", C.muted],
  ];
  const cw = 500, ch = 74, gx = 36, gy = 118;
  for (let i = 0; i < cmds.length; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const x = gx + col * (cw + 28), y = gy + row * (ch + 14);
    glass(ctx, x, y, cw, ch, { accent: cmds[i][2], glow: 8 });
    rr(ctx, x + 14, y + 16, 6, ch - 32, 3); ctx.fillStyle = cmds[i][2]; ctx.fill();
    txt(ctx, `${p} ${cmds[i][0]}`, x + 34, y + 32, { size: 17, weight: "800", color: C.text, max: cw - 50 });
    txt(ctx, cmds[i][1], x + 34, y + 56, { size: 13, weight: "600", color: C.muted, max: cw - 50 });
  }
  const y0 = gy + 6 * (ch + 14) + 6;
  glass(ctx, 36, y0, 1028, 66, { accent: C.yellow, glow: 6 });
  txt(ctx, "Mẹo: Trả lời bằng số khi bot hiện menu · Gõ huy để thoát thao tác dang dở · Mua vật phẩm ở .shop → mục Pokémon", 56, y0 + 40, { size: 14, weight: "600", color: C.text, max: 980 });
  footer(sc, `${getConfiguredBotName()} · Dữ liệu & ảnh Pokémon thuộc Nintendo / Game Freak / The Pokémon Company — dùng cho bot fan phi thương mại`);
  return toBuffer(sc);
}

// ── Chọn starter ─────────────────────────────────────────
export async function renderStarterSelect({ userName = "Trainer" } = {}) {
  const sc = createScene(1100, 680); const { ctx } = sc;
  paintBg(sc, C.green, C.cyan, 3);
  header(sc, "CHỌN POKÉMON KHỞI ĐẦU", `${userName}, hãy chọn người bạn đồng hành đầu tiên (Level 5)`, { accent: C.green });
  for (let i = 0; i < 3; i++) {
    const sp = SPECIES[STARTERS[i]];
    const x = 36 + i * 346, y = 112, w = 330, h = 490;
    const col = typeColor(sp.types[0]);
    glass(ctx, x, y, w, h, { accent: col, glow: 14 });
    pill(ctx, `${i + 1}`, x + 28, y + 16, { color: col, size: 16, h: 30, padX: 14, align: "left" });
    await petArt(ctx, sp.id, x + 40, y + 36, w - 80, 190);
    txt(ctx, sp.name, x + w / 2, y + 252, { size: 26, weight: "800", align: "center", glow: 10, glowColor: col });
    let tx = x + w / 2 - sp.types.length * 38;
    for (const t of sp.types) { typeChip(ctx, t, tx, y + 264); tx += 78; }
    const stats = [["HP", sp.base.hp, "hp"], ["ATK", sp.base.atk, "atk"], ["DEF", sp.base.def, "def"], ["SPA", sp.base.spa, "spa"], ["SPD", sp.base.spd, "spd"], ["SPE", sp.base.spe, "spe"]];
    stats.forEach(([lb, v, k], r) => {
      const yy = y + 306 + r * 24;
      txt(ctx, lb, x + 28, yy + 10, { size: 12, color: C.muted });
      bar(ctx, x + 76, yy, w - 76 - 70, 11, v / 130, STAT_COLOR[k], { glow: 4 });
      txt(ctx, v, x + w - 30, yy + 10, { size: 12, align: "right" });
    });
    txt(ctx, `→ ${SPECIES[sp.evolutions[0].to].name} (Lv.${sp.evolutions[0].minLevel})`, x + w / 2, y + h - 16, { size: 13, weight: "600", color: C.muted, align: "center" });
  }
  footer(sc, "Reply 1 / 2 / 3 để chọn · Chỉ được chọn 1 lần duy nhất · Gõ huy để hủy");
  return toBuffer(sc);
}

// ── Balo Pokémon ─────────────────────────────────────────
export const BALO_PAGE = 6;
export async function renderBalo({ trainer, userName = "Trainer", page = 1 }) {
  const list = trainer.collection;
  const pages = Math.max(1, Math.ceil(list.length / BALO_PAGE));
  const pg = Math.min(Math.max(1, page), pages);
  const sc = createScene(1100, 800); const { ctx } = sc;
  paintBg(sc, C.cyan, C.purple, 5);
  header(sc, "BALO POKÉMON", `${userName} · ${list.length} Pokémon · ${trainer.eggs.length} trứng · ${trainer.badges.length}/8 huy hiệu`, { accent: C.cyan, right: `Trang ${pg}/${pages}` });
  const slice = list.slice((pg - 1) * BALO_PAGE, pg * BALO_PAGE);
  if (!slice.length) {
    glass(ctx, 36, 130, 1028, 300, { accent: C.purple });
    txt(ctx, "Balo trống — dùng .pokemon pet để chọn Pokémon khởi đầu", 550, 290, { size: 22, align: "center", color: C.muted });
  }
  const cw = 328, ch = 300;
  for (let i = 0; i < slice.length; i++) {
    const p = slice[i];
    const col = i % 3, row = Math.floor(i / 3);
    const x = 36 + col * (cw + 22), y = 112 + row * (ch + 24);
    const tc = typeColor(p.types?.[0]);
    const active = p.uid === trainer.activePokemon;
    glass(ctx, x, y, cw, ch, { accent: active ? C.yellow : tc, glow: active ? 16 : 8, border: active ? 0.9 : 0.5 });
    pill(ctx, `#${(pg - 1) * BALO_PAGE + i + 1}`, x + 16, y + 14, { color: tc, size: 13, h: 24 });
    if (active) pill(ctx, "CHÍNH", x + cw - 16, y + 14, { color: C.yellow, size: 12, h: 24, align: "right" });
    if (p.hp <= 0) pill(ctx, "NGẤT", x + cw - 16, y + 44, { color: C.red, size: 12, h: 22, align: "right" });
    await petArt(ctx, p.species, x + 70, y + 30, cw - 140, 130);
    txt(ctx, p.name, x + cw / 2, y + 184, { size: 21, weight: "800", align: "center", max: cw - 30 });
    const tw = p.types.length * 70; let tx = x + cw / 2 - tw / 2;
    for (const t of p.types) { typeChip(ctx, t, tx, y + 194); tx += 74; }
    txt(ctx, `Lv.${p.level}`, x + 20, y + 244, { size: 16, weight: "800", color: C.yellow });
    const r = p.maxHp ? p.hp / p.maxHp : 0;
    txt(ctx, `${p.hp}/${p.maxHp}`, x + cw - 20, y + 244, { size: 13, color: C.muted, align: "right" });
    bar(ctx, x + 72, y + 232, cw - 72 - 108, 12, r, hpColor(r), { glow: 5 });
    const lo = expForSpeciesLevel(p.species, p.level), hi = expForSpeciesLevel(p.species, Math.min(100, p.level + 1));
    txt(ctx, "EXP", x + 20, y + 270, { size: 11, color: C.muted });
    bar(ctx, x + 72, y + 260, cw - 72 - 108, 9, p.level >= 100 ? 1 : (p.exp - lo) / Math.max(1, hi - lo), C.cyan, { glow: 3 });
    txt(ctx, `Dex #${(SPECIES[p.species]?.dex ?? 0).toString().padStart(3, "0")}`, x + cw - 20, y + 270, { size: 12, color: C.dim, align: "right" });
  }
  footer(sc, `Reply số 1-${list.length || 1} để xem chi tiết/đặt Pokémon chính · ${pages > 1 ? `trang ${pg}/${pages}: reply "trang N" · ` : ""}.pokemon balo item để xem vật phẩm`);
  return toBuffer(sc);
}

// ── Kho vật phẩm Pokémon ─────────────────────────────────
export async function renderItems({ trainer, userName = "Trainer", money = null }) {
  const owned = Object.entries(trainer.inventory).filter(([, n]) => n > 0).map(([id, n]) => ({ it: ITEMS[id], n })).filter((x) => x.it);
  owned.sort((a, b) => (ITEM_CATS[a.it.cat]?.order || 9) - (ITEM_CATS[b.it.cat]?.order || 9));
  const rows = Math.max(1, Math.ceil(owned.length / 3));
  const sc = createScene(1100, 190 + rows * 120 + 30); const { ctx } = sc;
  paintBg(sc, C.purple, C.blue, 9);
  header(sc, "KHO VẬT PHẨM POKÉMON", `${userName} · ${owned.reduce((s, x) => s + x.n, 0)} vật phẩm`, { accent: C.purple, right: money != null ? `${fmt(money)} GOLD` : "" });
  if (!owned.length) txt(ctx, "Chưa có vật phẩm — mua ở .shop → Pokémon", 550, 190, { size: 20, align: "center", color: C.muted });
  for (let i = 0; i < owned.length; i++) {
    const { it, n } = owned[i];
    const x = 36 + (i % 3) * 346, y = 112 + Math.floor(i / 3) * 120;
    const col = RARITY_COLOR[it.rarity] || C.cyan;
    glass(ctx, x, y, 330, 106, { accent: col, glow: 8 });
    const img = await loadItem(it.id);
    if (it.egg) await drawEggIcon(ctx, it.egg, x + 14, y + 16, 64);
    else drawItem(ctx, img, x + 14, y + 16, 70, { glow: col });
    txt(ctx, it.name, x + 96, y + 36, { size: 17, weight: "800", max: 160 });
    txt(ctx, ITEM_CATS[it.cat]?.name || "", x + 96, y + 56, { size: 12, color: col, weight: "700" });
    txt(ctx, it.desc, x + 96, y + 78, { size: 11, color: C.muted, weight: "600", max: 215 });
    pill(ctx, `x${n}`, x + 316, y + 12, { color: col, size: 14, align: "right", h: 26 });
  }
  footer(sc, "Dùng: .pokemon dung <tên vật phẩm> · Mua thêm: .shop → Pokémon");
  return toBuffer(sc);
}

// ── Thẻ chi tiết Pokémon ─────────────────────────────────
export async function renderPetInfo({ pet, trainer, userName = "Trainer", index = null }) {
  const sp = SPECIES[pet.species];
  const sc = createScene(1100, 760); const { ctx } = sc;
  const tc = typeColor(pet.types[0]);
  paintBg(sc, tc, pet.types[1] ? typeColor(pet.types[1]) : C.cyan, 21);
  header(sc, pet.name.toUpperCase(), `Pokédex #${String(sp.dex).padStart(3, "0")} · Huấn luyện viên ${userName}${index ? ` · Balo #${index}` : ""}`, { accent: tc, right: pet.uid === trainer.activePokemon ? "POKÉMON CHÍNH" : "" });
  glass(ctx, 36, 112, 400, 600, { accent: tc, glow: 16 });
  await petArt(ctx, pet.species, 66, 140, 340, 300);
  let tx = 236 - pet.types.length * 38;
  for (const t of pet.types) { typeChip(ctx, t, tx, 460, { size: 13, h: 24 }); tx += 82; }
  txt(ctx, `Level ${pet.level}`, 236, 520, { size: 34, weight: "800", align: "center", glow: 12, glowColor: tc });
  const lo = expForSpeciesLevel(pet.species, pet.level), hi = expForSpeciesLevel(pet.species, Math.min(100, pet.level + 1));
  bar(ctx, 70, 540, 332, 14, pet.level >= 100 ? 1 : (pet.exp - lo) / Math.max(1, hi - lo), C.cyan);
  txt(ctx, pet.level >= 100 ? "MAX" : `EXP ${fmt(pet.exp - lo)} / ${fmt(hi - lo)}  ·  còn ${fmt(Math.max(0, hi - pet.exp))}`, 236, 578, { size: 13, color: C.muted, align: "center", weight: "600" });
  const r = pet.maxHp ? pet.hp / pet.maxHp : 0;
  bar(ctx, 70, 600, 332, 16, r, hpColor(r));
  txt(ctx, `HP ${pet.hp}/${pet.maxHp}${pet.hp <= 0 ? " · NGẤT" : ""}`, 236, 640, { size: 15, weight: "800", align: "center", color: hpColor(r) });
  txt(ctx, `Nguồn: ${{ starter: "Khởi đầu", wild: "Bắt hoang dã", egg: "Nở từ trứng", legacy: "Dữ liệu cũ" }[pet.origin] || pet.origin} · Thân thiết ${pet.friendship ?? 0}`, 236, 690, { size: 12, color: C.dim, align: "center", weight: "600" });
  // chỉ số
  glass(ctx, 456, 112, 608, 250, { accent: C.cyan });
  txt(ctx, "CHỈ SỐ", 480, 142, { size: 15, weight: "800", color: C.cyan });
  STAT_KEYS.forEach((k, i) => {
    const v = k === "hp" ? pet.maxHp : pet[k];
    const y = 160 + i * 31;
    txt(ctx, STAT_LABEL[k], 480, y + 14, { size: 13, color: C.muted, weight: "700" });
    bar(ctx, 570, y + 3, 380, 13, Math.min(1, v / 250), STAT_COLOR[k], { glow: 4 });
    txt(ctx, v, 1040, y + 14, { size: 14, weight: "800", align: "right" });
  });
  // chiêu
  glass(ctx, 456, 380, 608, 220, { accent: C.purple });
  txt(ctx, "CHIÊU THỨC", 480, 410, { size: 15, weight: "800", color: C.purple });
  const mv = pet.moves || [];
  for (let i = 0; i < 4; i++) {
    const m = MOVES[mv[i]];
    const x = 480 + (i % 2) * 292, y = 424 + Math.floor(i / 2) * 82;
    glass(ctx, x, y, 280, 72, { accent: m ? typeColor(m.type) : C.dim, glow: 4, r: 12, lift: false });
    if (!m) { txt(ctx, "— trống —", x + 140, y + 42, { size: 14, color: C.dim, align: "center" }); continue; }
    txt(ctx, m.name, x + 14, y + 28, { size: 16, weight: "800", max: 150 });
    typeChip(ctx, m.type, x + 280 - 12, y + 10, { align: "right", size: 10, h: 18 });
    txt(ctx, `${m.cls === "physical" ? "Vật lý" : m.cls === "special" ? "Đặc biệt" : "Trạng thái"} · Sức ${m.power ?? "—"} · Chính xác ${m.accuracy ?? "—"} · PP ${m.pp}`, x + 14, y + 54, { size: 11, color: C.muted, weight: "600", max: 255 });
  }
  // tiến hóa
  glass(ctx, 456, 618, 608, 94, { accent: C.yellow });
  txt(ctx, "TIẾN HÓA", 480, 646, { size: 14, weight: "800", color: C.yellow });
  const evs = sp.evolutions;
  if (!evs.length) txt(ctx, sp.evolvesFrom ? "Đã ở dạng cuối trong dữ liệu Kanto." : "Không tiến hóa.", 480, 678, { size: 14, color: C.muted, weight: "600" });
  else txt(ctx, evs.map((e) => `${SPECIES[e.to].name}: ${evoText(e)}`).join("  |  "), 480, 678, { size: 13, color: C.text, weight: "600", max: 570 });
  footer(sc, "Dùng .pokemon upt pet để học chiêu / tiến hóa · .pokemon set <số> để đặt làm Pokémon chính");
  return toBuffer(sc);
}
export function evoText(e) {
  const p = [];
  if (e.minLevel) p.push(`Lv.${e.minLevel}`);
  if (e.trigger === "use-item" && e.item) p.push(ITEMS[Object.values(ITEMS).find((i) => i.stone === e.item)?.id]?.name || e.item);
  if (e.trigger === "trade") p.push("Linking Cord");
  if (e.minHappiness) p.push(`thân thiết ${e.minHappiness}`);
  if (e.timeOfDay) p.push(e.timeOfDay === "day" ? "ban ngày" : "ban đêm");
  if (e.knownMove) p.push(`biết ${e.knownMove}`);
  return p.join(" + ") || "—";
}

// ── Hồ sơ Trainer ────────────────────────────────────────
export async function renderProfile({ trainer, userName = "Trainer", money = 0 }) {
  const sc = createScene(1100, 700); const { ctx } = sc;
  paintBg(sc, C.pink, C.blue, 31);
  const pos = getNode(trainer.position);
  header(sc, "HỒ SƠ TRAINER", `${userName} · đang ở ${pos?.name || "?"}`, { accent: C.pink, right: `Trainer Lv.${trainer.trainerLevel}` });
  glass(ctx, 36, 112, 520, 250, { accent: C.pink });
  const act = trainer.collection.find((p) => p.uid === trainer.activePokemon);
  if (act) await petArt(ctx, act.species, 50, 128, 210, 210);
  txt(ctx, userName, 280, 160, { size: 26, weight: "800", max: 260, glow: 10, glowColor: C.pink });
  const lo = expForLevel(trainer.trainerLevel), hi = expForLevel(trainer.trainerLevel + 1);
  txt(ctx, `EXP ${fmt(trainer.exp)}`, 280, 190, { size: 14, color: C.muted, weight: "700" });
  bar(ctx, 280, 200, 250, 12, (trainer.exp - lo) / Math.max(1, hi - lo), C.pink);
  iconCoin(ctx, 290, 238, 10); txt(ctx, `${fmt(money)} GOLD`, 308, 244, { size: 17, weight: "800", color: C.yellow });
  txt(ctx, `Sức mạnh ${fmt(trainer.stats.power)}`, 280, 280, { size: 15, weight: "700" });
  txt(ctx, `Pokémon chính: ${act ? `${act.name} Lv.${act.level}` : "—"}`, 280, 308, { size: 13, color: C.muted, weight: "600", max: 260 });
  txt(ctx, `Trứng đang ấp: ${trainer.eggs.length}/3`, 280, 332, { size: 13, color: C.muted, weight: "600" });
  glass(ctx, 576, 112, 488, 250, { accent: C.cyan });
  txt(ctx, "THÀNH TÍCH", 600, 142, { size: 15, weight: "800", color: C.cyan });
  const s = trainer.stats;
  const rows = [["Solo thắng / thua / hòa", `${s.wins} / ${s.losses} / ${s.draws || 0}`], ["Gặp Pokémon hoang", s.wildMet || 0], ["Hạ Pokémon hoang", s.wildWins || 0], ["Thu phục", s.captures], ["Pokédex (đã bắt)", `${trainer.dex.caught.length}/151`], ["Tiến hóa · Học chiêu · Nở trứng", `${s.evolutions || 0} · ${s.learned || 0} · ${s.hatched || 0}`], ["Khu vực đã đến", `${trainer.visited.length}/46`]];
  rows.forEach(([k, v], i) => { txt(ctx, k, 600, 176 + i * 25, { size: 13, color: C.muted, weight: "600" }); txt(ctx, v, 1040, 176 + i * 25, { size: 14, weight: "800", align: "right" }); });
  glass(ctx, 36, 382, 1028, 270, { accent: C.yellow });
  txt(ctx, `HUY HIỆU GYM  ${trainer.badges.length}/8`, 60, 414, { size: 16, weight: "800", color: C.yellow });
  for (let i = 0; i < BADGES.length; i++) {
    const b = BADGES[i]; const has = trainer.badges.includes(b.id);
    const x = 60 + i * 124, y = 436;
    glass(ctx, x, y, 112, 196, { accent: has ? C.yellow : C.dim, glow: has ? 12 : 0, r: 14, lift: false });
    const img = await loadBadge(b.id);
    ctx.save(); if (!has) ctx.globalAlpha = 0.28;
    drawItem(ctx, img, x + 16, y + 14, 80, { glow: has ? C.yellow : null });
    ctx.restore();
    if (!has) iconLock(ctx, x + 40, y + 36, 32, C.muted);
    txt(ctx, b.name.replace(" Badge", ""), x + 56, y + 126, { size: 13, weight: "800", align: "center", color: has ? C.text : C.dim });
    txt(ctx, b.leader, x + 56, y + 148, { size: 12, align: "center", color: C.muted, weight: "600" });
    txt(ctx, has ? "ĐÃ CÓ" : "chưa có", x + 56, y + 176, { size: 11, align: "center", color: has ? C.green : C.dim, weight: "800" });
  }
  footer(sc, "Hoàn thành nhiệm vụ & đánh Gym để mở khóa thêm khu vực");
  return toBuffer(sc);
}

// ── Xếp hạng ─────────────────────────────────────────────
export async function renderRank({ ranking, names = {} }) {
  const n = Math.max(1, ranking.length);
  const sc = createScene(1100, 190 + n * 66 + 30); const { ctx } = sc;
  paintBg(sc, C.yellow, C.purple, 13);
  header(sc, "BẢNG XẾP HẠNG TRAINER", "Xếp theo Sức mạnh (tổng chỉ số Pokémon + EXP)", { accent: C.yellow });
  if (!ranking.length) txt(ctx, "Chưa có Trainer nào — hãy là người đầu tiên!", 550, 200, { size: 20, align: "center", color: C.muted });
  for (let i = 0; i < ranking.length; i++) {
    const r = ranking[i]; const y = 112 + i * 66;
    const col = i === 0 ? "#fbbf24" : i === 1 ? "#cbd5e1" : i === 2 ? "#fb923c" : C.cyan;
    glass(ctx, 36, y, 1028, 58, { accent: col, glow: i < 3 ? 12 : 4, r: 14, lift: false });
    if (i < 3) iconStar(ctx, 72, y + 29, 17, col); else txt(ctx, `#${i + 1}`, 72, y + 36, { size: 18, weight: "800", align: "center", color: C.muted });
    const nm = names[r.userId] || r.name || `Trainer ${String(r.userId).slice(-4)}`;
    txt(ctx, nm, 112, y + 26, { size: 18, weight: "800", max: 330 });
    txt(ctx, `Lv.${r.trainerLevel} · ${r.pokemonCount} Pokémon · ${r.badges} huy hiệu · Pokédex ${r.dexCaught}`, 112, y + 46, { size: 12, color: C.muted, weight: "600", max: 440 });
    txt(ctx, `${r.wins}W / ${r.losses}L`, 680, y + 36, { size: 15, weight: "700", color: C.green });
    iconBolt(ctx, 790, y + 14, 26, col);
    txt(ctx, fmt(r.power), 1040, y + 37, { size: 21, weight: "800", align: "right", color: col });
  }
  return toBuffer(sc);
}

// ── Thông báo chung ──────────────────────────────────────
export async function renderNotice({ title, lines = [], tone = "info", footerText = "" }) {
  const col = { info: C.cyan, ok: C.green, warn: C.yellow, err: C.red }[tone] || C.cyan;
  const sc0 = createScene(900, 10); const wrapped = [];
  for (const l of lines) wrapped.push(...wrap(sc0.ctx, l, 780, 16, "600"));
  const h = 200 + wrapped.length * 28;
  const sc = createScene(900, h); const { ctx } = sc;
  paintBg(sc, col, C.purple, 17);
  glass(ctx, 30, 30, 840, h - 60, { accent: col, glow: 16 });
  txt(ctx, title, 450, 92, { size: 28, weight: "800", align: "center", glow: 14, glowColor: col, max: 780 });
  wrapped.forEach((l, i) => txt(ctx, l, 450, 136 + i * 28, { size: 16, weight: "600", color: C.text, align: "center" }));
  if (footerText) footer(sc, footerText);
  return toBuffer(sc);
}
export const renderCancel = () => renderNotice({ title: "ĐÃ HỦY", lines: ["Thao tác Pokémon đã được hủy. Không có gì bị mất."], tone: "warn" });
export const renderNoState = () => renderNotice({ title: "KHÔNG CÓ THAO TÁC", lines: ["Bạn không có thao tác Pokémon nào đang chờ."], tone: "info" });

// ── Trứng icon (dùng PNG asset nếu có, không thì vector) ──
import { loadEgg } from "../assets.js";
export async function drawEggIcon(ctx, tier, x, y, size, progress = null) {
  const img = await loadEgg(tier);
  if (img) { drawSprite(ctx, img, x, y, size, size * 1.2, { glow: EGG_TIERS[tier].color }); return; }
  const t = EGG_TIERS[tier];
  ctx.save();
  const cx = x + size / 2, cy = y + size * 0.6;
  ctx.shadowColor = t.color; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.ellipse(cx, cy, size * 0.36, size * 0.48, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx - size * 0.1, cy - size * 0.2, 2, cx, cy, size * 0.5);
  g.addColorStop(0, "#fff"); g.addColorStop(1, t.accent); ctx.fillStyle = g; ctx.fill(); ctx.restore();
}
