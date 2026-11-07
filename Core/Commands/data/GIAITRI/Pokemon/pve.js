/**
 * Trận PvE (Pokémon hoang dã / Gym) — logic thuần, không I/O. Command layer lưu kết quả.
 */
import { makeCombatant, useMove, aiPickMove, describeMove, tryCapture, getMoveInfo, usableMoves } from "./battle.js";
import { createInstance, expForSpeciesLevel } from "./pokedex.js";
import { SPECIES, MOVES } from "./db.js";
import { getItem } from "./items.js";
import { CONFIG } from "./config.js";

export function buildPlayerParty(trainer) {
  const alive = trainer.collection.filter((p) => p.hp > 0);
  const active = alive.find((p) => p.uid === trainer.activePokemon);
  const ordered = [...(active ? [active] : []), ...alive.filter((p) => p !== active)].slice(0, CONFIG.trainer.maxParty);
  return ordered.map(makeCombatant);
}
export function makeWild(spawn) {
  const inst = createInstance(spawn.species, spawn.level, { origin: "wild" });
  const c = makeCombatant(inst);
  c.name = SPECIES[spawn.species].name;
  return c;
}
export function makeGymTeam(gym) {
  return gym.team.map(([sp, lv]) => makeCombatant(createInstance(sp, lv, { origin: "gym", iv: { hp: 12, atk: 12, def: 12, spa: 12, spd: 12, spe: 12 } })));
}

export function newSession({ kind, node, method = null, playerParty, enemyParty, gymCity = null, leader = "" }) {
  return {
    type: "PVE", kind, node, method, gymCity, leader,
    playerParty, pIdx: 0, enemyParty, eIdx: 0, participants: [playerParty[0].uid],
    log: [], turns: 0, over: false, result: null, caught: null, startedAt: Date.now(),
  };
}
export const cur = (s) => s.playerParty[s.pIdx];
export const foe = (s) => s.enemyParty[s.eIdx];

function markParticipant(s) {
  const id = cur(s).uid;
  if (!s.participants.includes(id)) s.participants.push(id);
}

/** Phía người chơi bị hạ → đổi con kế tiếp hoặc thua */
function afterPlayerFaint(s, lines) {
  lines.push(`${cur(s).name} đã ngất!`);
  const next = s.playerParty.findIndex((p, i) => i !== s.pIdx && p.hp > 0);
  if (next < 0) { s.over = true; s.result = "lose"; lines.push("Tất cả Pokémon của bạn đã ngất…"); return; }
  s.pIdx = next; markParticipant(s);
  lines.push(`Bạn đưa ${cur(s).name} vào trận!`);
}
function afterFoeFaint(s, lines) {
  lines.push(`${foe(s).name} đã bị hạ gục!`);
  const next = s.enemyParty.findIndex((p, i) => i > s.eIdx && p.hp > 0);
  if (next < 0) { s.over = true; s.result = "win"; return; }
  s.eIdx = next;
  lines.push(`${s.leader || "Đối thủ"} đưa ${foe(s).name} vào trận!`);
}

function enemyAct(s, lines) {
  const a = foe(s), d = cur(s);
  const id = aiPickMove(a, d);
  const r = useMove(a, d, id);
  lines.push(describeMove(a, r));
  if (d.hp <= 0) afterPlayerFaint(s, lines);
}

/** Người chơi dùng chiêu số idx (0-based). Thứ tự theo ưu tiên rồi tốc độ. */
export function playerMove(s, idx) {
  const lines = [];
  const p = cur(s), e = foe(s);
  const slot = p.moves[idx];
  const useStruggle = usableMoves(p).length === 0;
  if (!useStruggle && (!slot || slot.pp <= 0)) return { ok: false, message: slot ? "Chiêu này hết PP!" : "Không có chiêu số đó." };
  const pid = useStruggle ? "struggle" : slot.id;
  s.turns++;
  const eid = aiPickMove(e, p);
  const pPri = getMoveInfo(pid)?.priority || 0, ePri = getMoveInfo(eid)?.priority || 0;
  const playerFirst = pPri !== ePri ? pPri > ePri : p.spe >= e.spe;
  const doPlayer = () => { const r = useMove(p, e, pid); lines.push(describeMove(p, r)); if (e.hp <= 0) afterFoeFaint(s, lines); };
  const doEnemy = () => { const r = useMove(e, p, eid); lines.push(describeMove(e, r)); if (p.hp <= 0) afterPlayerFaint(s, lines); };
  if (playerFirst) { doPlayer(); if (!s.over && foe(s) === e && e.hp > 0) doEnemy(); }
  else { doEnemy(); if (!s.over && cur(s) === p && p.hp > 0) doPlayer(); }
  s.log.push(...lines);
  s.log = s.log.slice(-8);
  return { ok: true, lines };
}

/** Dùng vật phẩm hồi máu trong trận (đã trừ kho ở command). Tốn 1 lượt. */
export function itemHeal(s, item) {
  const p = cur(s);
  if (p.hp <= 0) return { ok: false, message: "Pokémon đã ngất." };
  if (item.revive) return { ok: false, message: "Revive dùng ngoài trận (.pokemon dung revive) hoặc ở Pokémon Center." };
  if (!(item.heal || item.healPct)) return { ok: false, message: "Vật phẩm này không dùng được trong trận." };
  if (p.hp >= p.maxHp) return { ok: false, message: `${p.name} đã đầy HP.` };
  return { ok: true };
}
export function applyItemHeal(s, item) {
  const p = cur(s); const lines = [];
  const amt = item.heal || Math.floor(p.maxHp * item.healPct);
  const before = p.hp; p.hp = Math.min(p.maxHp, p.hp + amt);
  lines.push(`Dùng ${item.name}: ${p.name} hồi ${p.hp - before} HP.`);
  s.turns++;
  if (!s.over && s.kind !== "wild-ended") enemyAct(s, lines);
  s.log.push(...lines); s.log = s.log.slice(-8);
  return { lines };
}

/** Ném bóng (đã trừ kho). Trả {captured, result}. Bắt hỏng → Pokémon hoang phản công hoặc bỏ chạy. */
export function throwBall(s, ballId) {
  const w = foe(s); const lines = [];
  s.turns++;
  const result = tryCapture(w, ballId);
  if (result.success) {
    s.over = true; s.result = "caught"; s.caught = w;
    lines.push(`Gotcha! ${w.name} đã bị thu phục!`);
    s.log.push(...lines);
    return { captured: true, result, lines };
  }
  lines.push(`${w.name} thoát khỏi bóng (lắc ${result.shakes}/4)!`);
  if (Math.random() < 0.12) {
    s.over = true; s.result = "fled";
    lines.push(`${w.name} đã bỏ chạy!`);
  } else {
    enemyAct(s, lines);
  }
  s.log.push(...lines); s.log = s.log.slice(-8);
  return { captured: false, result, lines };
}

/** EXP chia cho Pokémon đã tham chiến còn sống (công thức chính thức: baseExp*L/7, ×1.5 nếu là trainer) */
export function computeExp(s) {
  const trainerMul = s.kind === "gym" ? 1.5 : 1;
  const total = s.enemyParty.reduce((sum, e) => sum + (e.hp <= 0 ? Math.floor(((SPECIES[e.species]?.baseExp || 50) * e.level * trainerMul) / 7) : 0), 0);
  const alive = s.participants.filter((uid) => s.playerParty.find((p) => p.uid === uid && p.hp > 0));
  const each = alive.length ? Math.max(1, Math.floor(total / alive.length)) : 0;
  return { total, each, uids: alive };
}
