/**
 * Solo PvP — logic phòng + chốt thưởng đúng 1 lần cho mỗi trận.
 * Không có lệnh nào gọi trực tiếp settleSolo: chỉ luồng trận (hết máu / đầu hàng / hết lượt) gọi nội bộ.
 */
import { randInt, CONFIG } from "./config.js";
import { makeCombatant, useMove, aiPickMove, describeMove, getMoveInfo, usableMoves } from "./battle.js";
import { recordMatch, updateMatch, findMatch, pendingMatches } from "./history.js";
import { applySoloOutcome } from "./storage.js";

export function partyFrom(trainer) {
  const alive = trainer.collection.filter((p) => p.hp > 0);
  const active = alive.find((p) => p.uid === trainer.activePokemon);
  return [...(active ? [active] : []), ...alive.filter((p) => p !== active)].slice(0, CONFIG.trainer.maxParty).map(makeCombatant);
}

/** Một lượt solo. Trả {ok, lines, outcome?}. outcome: {kind:'win', winnerUid, loserUid} | {kind:'draw'} */
export function soloMove(room, uid, idx) {
  if (room.status !== "battling" || room.settled) return { ok: false, message: "Trận đã kết thúc." };
  if (room.turn !== uid) return { ok: false, message: "Chưa đến lượt bạn!" };
  const isHost = room.hostUid === uid;
  const my = isHost ? room.hostPet : room.guestPet;
  const foe = isHost ? room.guestPet : room.hostPet;
  const slot = my.moves[idx];
  const struggle = usableMoves(my).length === 0;
  if (!struggle && (!slot || slot.pp <= 0)) return { ok: false, message: slot ? "Chiêu này hết PP!" : "Không có chiêu số đó." };
  const r = useMove(my, foe, struggle ? "struggle" : slot.id);
  const lines = [`${isHost ? room.hostName : room.guestName}: ${describeMove(my, r)}`];
  room.turnCount++;
  let outcome = null;
  if (foe.hp <= 0) {
    lines.push(`${foe.name} đã ngất!`);
    const party = isHost ? room.guestParty : room.hostParty;
    const next = party.find((p) => p.uid !== foe.uid && p.hp > 0);
    if (!next) outcome = { kind: "win", winnerUid: uid, loserUid: isHost ? room.guestUid : room.hostUid, reason: "ko" };
    else { if (isHost) room.guestPet = next; else room.hostPet = next; lines.push(`Đối thủ đưa ${next.name} vào trận!`); }
  }
  if (!outcome && room.turnCount >= room.maxTurns) outcome = { kind: "draw", reason: "turn_limit" };
  if (!outcome) room.turn = isHost ? room.guestUid : room.hostUid;
  room.log = [...(room.log || []), ...lines].slice(-6);
  return { ok: true, lines, outcome };
}

/**
 * Chốt trận. Đồng bộ đặt cờ `settled` TRƯỚC mọi await → gọi 2 lần chỉ trả thưởng 1 lần.
 * kind: win | draw | cancel | error. cancel/error: không thưởng.
 */
export async function settleSolo(room, outcome, rng = { int: randInt }) {
  if (room.settled) return { ok: false, already: true };
  room.settled = true;
  room.status = "finished";
  if (outcome.kind === "cancel" || outcome.kind === "error") return { ok: true, rewarded: false, kind: outcome.kind };
  const matchId = room.roomId;
  if (findMatch(matchId)) return { ok: true, rewarded: false, duplicate: true };
  const players = [];
  const uids = [room.hostUid, room.guestUid];
  for (const uid of uids) {
    const isWinner = outcome.kind === "win" && outcome.winnerUid === uid;
    const result = outcome.kind === "draw" ? "draw" : isWinner ? "win" : "lose";
    const cfg = CONFIG.solo[result];
    const pet = uid === room.hostUid ? room.hostParty[0] : room.guestParty[0];
    players.push({
      uid, name: uid === room.hostUid ? room.hostName : room.guestName, result,
      exp: cfg.exp, money: rng.int(cfg.money[0], cfg.money[1]),
      petUid: pet?.uid || null, petExp: CONFIG.solo.petExp[result], applied: false,
    });
  }
  // ghi lịch sử TRƯỚC khi trả thưởng (kèm số tiền đã roll) → có thể khôi phục an toàn, không roll lại
  recordMatch({ matchId, at: Date.now(), threadId: room.threadId, kind: outcome.kind, reason: outcome.reason || null, turns: room.turnCount, players });
  const out = [];
  for (const p of players) {
    const r = await applySoloOutcome(p.uid, { result: p.result, exp: p.exp, petExp: p.petExp, petUid: p.petUid, moneyValue: p.money, matchId });
    p.applied = r.paid !== false;
    p.paid = r.paid; p.payError = r.payError;
    out.push({ ...p, levelUp: r.levelUp });
  }
  updateMatch(matchId, { players: players.map(({ uid, name, result, exp, money, petUid, petExp, applied }) => ({ uid, name, result, exp, money, petUid, petExp, applied })) });
  return { ok: true, rewarded: true, matchId, players: out, turns: room.turnCount };
}

/** Khởi động lại bot: hoàn tất các trận còn dang dở thanh toán (idempotent theo matchId/referenceId) */
export async function recoverPendingMatches() {
  let n = 0;
  for (const m of pendingMatches()) {
    let allOk = true;
    for (const p of m.players) {
      if (p.applied) continue;
      const r = await applySoloOutcome(p.uid, { result: p.result, exp: p.exp, petExp: p.petExp, petUid: p.petUid, moneyValue: p.money, matchId: m.matchId });
      if (r.paid === false) allOk = false; else p.applied = true;
    }
    updateMatch(m.matchId, { players: m.players });
    if (allOk) n++;
  }
  return n;
}
