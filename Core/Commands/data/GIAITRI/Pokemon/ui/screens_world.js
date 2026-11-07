import {
  C, createScene, toBuffer, paintBg, txt, glass, pill, typeChip, bar, drawSprite, drawItem, header, footer, fmt, rr, hexA, typeColor,
  iconCoin, iconStar, iconCheck, iconLock, iconPin, plate, measure, wrap,
} from "./kit.js";
import { loadSpecies, loadMapBase, loadBadge, loadItem } from "../assets.js";
import { SPECIES } from "../db.js";
import { NODES, EDGES, getNode, unlockStatus, wildList, availableMethods, METHOD_LABEL } from "../world.js";
import { GYMS } from "../gyms.js";
import { BADGES } from "../config.js";
import { listQuests, QUEST_CATS, getQuest } from "../quests.js";
import { ITEMS } from "../items.js";

const KIND_LABEL = { town: "Thị trấn", route: "Đường", forest: "Rừng", cave: "Hang động", sea: "Biển", mountain: "Núi", tower: "Tháp", building: "Công trình" };
export function shortName(n) {
  if (n.kind === "route" || n.kind === "sea") return n.name.replace("Route ", "R").replace(" (biển)", "~");
  return n.name.replace(" City", "").replace(" Town", "").replace(" Island", "").replace("Pokémon ", "").replace(" Islands", "");
}

// ── Bản đồ Kanto ─────────────────────────────────────────
export async function renderMap({ trainer, selectedId = null, userName = "Trainer" }) {
  const W = 1100;
  const cur = getNode(trainer.position);
  const sel = getNode(selectedId) || cur;
  const rowsNeeded = unlockStatus(sel, trainer).open ? Math.min(2, availableMethods(sel.id).length) : 0;
  const H = Math.max(1010, 786 + 110 + rowsNeeded * 94 + 24 + 36);
  const sc = createScene(W, H); const { ctx } = sc;
  paintBg(sc, C.blue, C.green, 71);
  header(sc, "BẢN ĐỒ KANTO", `${userName} · đang ở ${cur.name} · ${trainer.badges.length}/8 huy hiệu`, { accent: C.cyan, right: `${trainer.visited.length}/${NODES.length} khu vực` });
  const mx = 36, my = 108, mw = 1028, mh = 660, k = mw / 1000;
  glass(ctx, mx - 4, my - 4, mw + 8, mh + 8, { accent: C.cyan, glow: 12, r: 18 });
  ctx.save(); rr(ctx, mx, my, mw, mh, 14); ctx.clip();
  const base = await loadMapBase();
  if (base) ctx.drawImage(base, mx, my, mw, 640 * k); else { ctx.fillStyle = "#0a3a6b"; ctx.fillRect(mx, my, mw, mh); }
  const P = (n) => [mx + n.x * k, my + n.y * k];
  const st = Object.fromEntries(NODES.map((n) => [n.id, unlockStatus(n, trainer)]));
  // đường đi
  for (const [a, b] of EDGES) {
    const A = getNode(a), B = getNode(b); const open = st[a].open && st[b].open;
    const [x1, y1] = P(A), [x2, y2] = P(B);
    ctx.save(); ctx.lineCap = "round";
    if (open) { ctx.strokeStyle = "rgba(253,230,138,0.9)"; ctx.shadowColor = "#fde68a"; ctx.shadowBlur = 8; ctx.lineWidth = 4; }
    else { ctx.strokeStyle = "rgba(148,163,184,0.5)"; ctx.setLineDash([6, 7]); ctx.lineWidth = 3; }
    if (A.kind === "sea" || B.kind === "sea") { ctx.strokeStyle = open ? "rgba(125,211,252,0.9)" : "rgba(148,163,184,0.45)"; }
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }
  // điểm xuất hiện hoang dã quanh địa điểm đang chọn
  const methods = availableMethods(sel.id);
  if (methods.length && st[sel.id].open) {
    const list = wildList(sel.id, methods[0]).slice(0, 6);
    const [sx, sy] = P(sel);
    for (let i = 0; i < list.length; i++) {
      const ang = -Math.PI / 2 + (i / list.length) * Math.PI * 2; const bx = sx + Math.cos(ang) * 52, by = sy + Math.sin(ang) * 52;
      const img = await loadSpecies(list[i].s);
      ctx.save(); ctx.beginPath(); ctx.arc(bx, by, 17, 0, Math.PI * 2); ctx.fillStyle = "rgba(15,23,42,0.85)"; ctx.fill(); ctx.strokeStyle = hexA(typeColor(SPECIES[list[i].s].types[0]), 0.95); ctx.lineWidth = 2; ctx.shadowColor = typeColor(SPECIES[list[i].s].types[0]); ctx.shadowBlur = 8; ctx.stroke(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(bx, by, 16, 0, Math.PI * 2); ctx.clip(); drawSprite(ctx, img, bx - 15, by - 15, 30, 30); ctx.restore();
    }
  }
  // node
  NODES.forEach((n, i) => {
    const [x, y] = P(n); const open = st[n.id].open; const isCur = n.id === cur.id; const isSel = n.id === sel.id;
    const col = !open ? "#64748b" : n.gym ? C.yellow : n.kind === "town" ? C.cyan : n.kind === "sea" ? "#7dd3fc" : n.kind === "cave" || n.kind === "mountain" ? "#c4b5fd" : C.green;
    ctx.save();
    if (open) { ctx.shadowColor = col; ctx.shadowBlur = isSel ? 18 : 8; }
    ctx.fillStyle = "rgba(8,12,30,0.92)"; ctx.strokeStyle = col; ctx.lineWidth = isSel ? 3.5 : 2.2;
    if (n.kind === "town") { rr(ctx, x - 9, y - 9, 18, 18, 5); ctx.fill(); ctx.stroke(); }
    else if (n.kind === "cave" || n.kind === "mountain" || n.kind === "tower") { ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 10, y + 8); ctx.lineTo(x - 10, y + 8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    if (n.gym && open) iconStar(ctx, x, y, 5, C.yellow);
    if (n.center && open && n.kind === "town") { ctx.fillStyle = C.red; ctx.fillRect(x - 1.5, y - 5, 3, 10); ctx.fillRect(x - 5, y - 1.5, 10, 3); }
    if (!open) iconLock(ctx, x - 7, y - 8, 14, "#94a3b8");
    const label = n.kind === "town" || isCur || isSel || n.kind === "cave" || n.kind === "tower" ? `${i + 1}. ${shortName(n)}` : `${i + 1}`;
    ctx.save(); ctx.font = `bold 11px PokeUI`; const tw = ctx.measureText(label).width; ctx.restore();
    const lx = Math.min(mx + mw - tw - 14, Math.max(mx + 6, x - tw / 2 - 5)); const ly = y + 14;
    rr(ctx, lx, ly, tw + 10, 17, 8); ctx.fillStyle = isSel ? "rgba(34,211,238,0.88)" : "rgba(5,8,22,0.78)"; ctx.fill();
    txt(ctx, label, lx + 5, ly + 12.5, { size: 11, weight: "bold", color: isSel ? "#04121f" : open ? C.text : C.dim });
  });
  // người chơi
  const [px, py] = P(cur);
  ctx.save(); ctx.strokeStyle = "rgba(251,191,36,0.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  iconPin(ctx, px, py - 14, 26, C.red);
  ctx.restore();
  // chú giải (góc phải trên, vùng biển trống)
  const legend = [["Thị trấn", C.cyan], ["Gym", C.yellow], ["Đường/Rừng", C.green], ["Hang/Núi", "#c4b5fd"], ["Khóa", "#64748b"]];
  rr(ctx, mx + mw - 150, my + 14, 136, 118, 10); ctx.fillStyle = "rgba(5,8,22,0.7)"; ctx.fill();
  legend.forEach(([t, col], i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx + mw - 134, my + 34 + i * 20, 5, 0, Math.PI * 2); ctx.fill(); txt(ctx, t, mx + mw - 120, my + 38 + i * 20, { size: 11, weight: "600", color: C.text }); });
  // panel thông tin
  const iy = my + mh + 18;
  const s = st[sel.id];
  glass(ctx, 36, iy, 1028, H - iy - 36, { accent: s.open ? C.cyan : C.dim, glow: 10 });
  const idx = NODES.indexOf(sel) + 1;
  pill(ctx, `${idx}`, 56, iy + 18, { color: C.cyan, size: 14, h: 26, padX: 12 });
  txt(ctx, sel.name, 100, iy + 38, { size: 24, weight: "800", glow: 10, glowColor: C.cyan });
  pill(ctx, KIND_LABEL[sel.kind], 1044, iy + 18, { color: C.purple, align: "right", size: 12 });
  const tags = [];
  if (sel.id === cur.id) tags.push(["BẠN Ở ĐÂY", C.yellow]);
  if (sel.center) tags.push(["Pokémon Center", C.red]);
  if (sel.gym) { const g = GYMS[sel.gym]; tags.push([`Gym ${g.leader} (${g.type})`, C.yellow]); }
  let tx = 100; for (const [t, col] of tags) { tx += pill(ctx, t, tx, iy + 52, { color: col, size: 11, h: 20 }) + 8; }
  if (!s.open) {
    iconLock(ctx, 56, iy + 88, 30, C.yellow);
    txt(ctx, "ĐANG KHÓA", 96, iy + 108, { size: 18, weight: "800", color: C.yellow });
    s.reasons.forEach((r, i) => txt(ctx, r, 56, iy + 140 + i * 24, { size: 15, weight: "700", color: C.text }));
    txt(ctx, s.hint || "", 56, iy + 140 + s.reasons.length * 24 + 8, { size: 14, weight: "600", color: C.muted, max: 960 });
    if (sel.note) txt(ctx, sel.note, 56, iy + 140 + s.reasons.length * 24 + 34, { size: 13, weight: "600", color: C.dim, max: 960 });
  } else {
    if (sel.note) txt(ctx, sel.note, 56, iy + 92, { size: 13, weight: "600", color: C.muted, max: 960 });
    const ms = availableMethods(sel.id);
    if (!ms.length) txt(ctx, "Không có Pokémon hoang dã ở đây.", 56, iy + 120, { size: 15, color: C.muted, weight: "600" });
    let yy = iy + (sel.note ? 110 : 94);
    for (const m of ms.slice(0, 2)) {
      txt(ctx, `${METHOD_LABEL[m].toUpperCase()}`, 56, yy + 14, { size: 12, weight: "800", color: m === "walk" ? C.green : m === "surf" ? C.blue : C.cyan });
      const list = wildList(sel.id, m).slice(0, 9);
      for (let i = 0; i < list.length; i++) {
        const e = list[i]; const x = 150 + i * 100;
        const img = await loadSpecies(e.s);
        drawSprite(ctx, img, x, yy - 4, 50, 46);
        txt(ctx, SPECIES[e.s].name, x + 25, yy + 58, { size: 10, weight: "700", align: "center", max: 94 });
        txt(ctx, `Lv.${e.min === e.max ? e.min : `${e.min}-${e.max}`} · ${e.pct >= 1 ? Math.round(e.pct) : "<1"}%`, x + 25, yy + 72, { size: 10, color: C.muted, weight: "600", align: "center" });
      }
      yy += 94;
    }
  }
  footer(sc, "Reply số địa điểm để đi tới · hoặc  xem <số>  để xem thông tin · Gõ huy để thoát");
  return toBuffer(sc);
}

// ── Nhiệm vụ ─────────────────────────────────────────────
export const QUEST_PAGE = 6;
export async function renderQuests({ trainer, page = 1, userName = "Trainer" }) {
  const all = listQuests();
  const pages = Math.max(1, Math.ceil(all.length / QUEST_PAGE));
  const pg = Math.min(Math.max(1, page), pages);
  const slice = all.slice((pg - 1) * QUEST_PAGE, pg * QUEST_PAGE);
  const claimable = all.filter((q) => trainer.quests[q.id]?.status === "completed").length;
  const done = all.filter((q) => trainer.quests[q.id]?.claimed).length;
  const sc = createScene(1100, 140 + slice.length * 112 + 60); const { ctx } = sc;
  paintBg(sc, C.pink, C.purple, 81);
  header(sc, "NHIỆM VỤ POKÉMON", `${userName} · hoàn thành ${done}/${all.length} · ${claimable} nhiệm vụ chờ nhận`, { accent: C.pink, right: `Trang ${pg}/${pages}` });
  for (let i = 0; i < slice.length; i++) {
    const q = slice[i]; const st = trainer.quests[q.id] || { status: "locked", progress: 0 };
    const y = 112 + i * 112; const gi = (pg - 1) * QUEST_PAGE + i + 1;
    const col = { locked: C.dim, available: C.cyan, in_progress: C.yellow, completed: C.green, claimed: "#64748b" }[st.status] || C.cyan;
    glass(ctx, 36, y, 1028, 102, { accent: col, glow: st.status === "completed" ? 16 : 5, border: st.status === "claimed" ? 0.25 : 0.55 });
    pill(ctx, String(gi), 54, y + 16, { color: col, size: 14, h: 28, padX: 12 });
    txt(ctx, q.name, 104, y + 34, { size: 19, weight: "800", color: st.status === "locked" ? C.dim : C.text, max: 520 });
    pill(ctx, QUEST_CATS[q.cat].name, 1044, y + 14, { color: C.purple, size: 11, h: 20, align: "right" });
    txt(ctx, q.description, 104, y + 58, { size: 13, weight: "600", color: st.status === "locked" ? C.dim : C.muted, max: 640 });
    if (st.status === "locked") {
      iconLock(ctx, 104, y + 68, 22, C.dim);
      const need = (q.requires || []).filter((r) => !trainer.quests[r]?.claimed).map((r) => getQuest(r)?.name).filter(Boolean);
      txt(ctx, `Cần nhận thưởng: ${need.join(", ")}`, 134, y + 86, { size: 12, weight: "600", color: C.dim, max: 600 });
    } else {
      bar(ctx, 104, y + 72, 360, 12, st.progress / q.target, col, { glow: 4 });
      txt(ctx, `${st.progress}/${q.target}`, 476, y + 83, { size: 13, weight: "800", color: C.text });
    }
    // phần thưởng
    const rx = 1044;
    const moneyTxt = st.money?.legacy ? "đã nhận" : st.money?.value != null && st.status !== "available" && st.status !== "in_progress" ? fmt(st.money.value) : `${fmt(q.money[0])}–${fmt(q.money[1])}`;
    const moneyLabel = st.status === "completed" || st.status === "claimed" ? "thực nhận" : "dự kiến";
    iconCoin(ctx, rx - 214, y + 52, 9);
    txt(ctx, `${moneyTxt}`, rx - 198, y + 58, { size: 15, weight: "800", color: C.yellow });
    txt(ctx, `(${moneyLabel})`, rx - 198 + measure(ctx, moneyTxt, 15, "800") + 6, y + 58, { size: 11, weight: "600", color: C.muted });
    txt(ctx, `+${fmt(q.expReward)} EXP${q.items ? " · +" + Object.entries(q.items).map(([id, n]) => `${n} ${ITEMS[id]?.name}`).join(", ") : ""}`, rx, y + 82, { size: 12, weight: "700", color: C.cyan, align: "right", max: 360 });
    if (st.status === "completed") pill(ctx, "NHẬN THƯỞNG", rx - 160, y + 14, { color: C.green, size: 11, h: 20, align: "right", textColor: C.green });
    if (st.status === "claimed") iconCheck(ctx, rx - 30, y + 38, 20, "#64748b");
  }
  footer(sc, `Reply số nhiệm vụ để nhận thưởng · "tatca" nhận hết · "trang N" đổi trang · Gõ huy để thoát`);
  return toBuffer(sc);
}

export async function renderQuestClaim({ def, exp, money, items = {}, paid = true, trainer }) {
  const sc = createScene(900, 520); const { ctx } = sc;
  paintBg(sc, C.green, C.yellow, 83);
  glass(ctx, 30, 30, 840, 460, { accent: C.green, glow: 18 });
  txt(ctx, "NHẬN THƯỞNG THÀNH CÔNG", 450, 90, { size: 28, weight: "800", align: "center", glow: 14, glowColor: C.green });
  txt(ctx, def.name, 450, 128, { size: 18, weight: "700", align: "center", color: C.muted, max: 760 });
  iconCoin(ctx, 300, 200, 22);
  txt(ctx, `+${fmt(money)} GOLD`, 340, 212, { size: 38, weight: "800", color: C.yellow, glow: 10 });
  txt(ctx, `khoảng ${fmt(def.money[0])} – ${fmt(def.money[1])} · đã random & chốt 1 lần`, 450, 250, { size: 13, align: "center", color: C.muted, weight: "600" });
  txt(ctx, `+${fmt(exp)} EXP Trainer`, 450, 300, { size: 26, weight: "800", align: "center", color: C.cyan });
  const its = Object.entries(items);
  if (its.length) txt(ctx, its.map(([id, n]) => `+${n} ${ITEMS[id]?.name}`).join(" · "), 450, 342, { size: 18, weight: "700", align: "center", color: C.pink });
  if (!paid) txt(ctx, "Ví đang bận — tiền sẽ được bù tự động ở lần dùng lệnh kế tiếp.", 450, 400, { size: 14, align: "center", color: C.yellow, weight: "700" });
  txt(ctx, `Trainer Lv.${trainer.trainerLevel} · EXP ${fmt(trainer.exp)}`, 450, 450, { size: 14, align: "center", color: C.muted, weight: "600" });
  return toBuffer(sc);
}
