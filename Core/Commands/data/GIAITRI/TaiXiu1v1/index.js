import { randomUUID } from "node:crypto";
import TienGame from "../TienGame/index.js";
import { addExp, recordMatchResult } from "../PlayerProfile/index.js";
import {
  ensureDataFiles,
  getConfig,
  getRooms,
  saveRooms,
  getHistory,
  saveHistory,
  getMeta,
  saveMeta,
  safeNumber,
} from "./storage.js";

const ROOM_LOCKS = new Map();
const USER_LOCKS = new Map();

async function withLock(map, key, task) {
  const k = String(key);
  const prev = map.get(k) || Promise.resolve();
  let release;
  const next = new Promise((r) => {
    release = r;
  });
  map.set(k, next);
  await prev;
  try {
    return await task();
  } finally {
    if (map.get(k) === next) map.delete(k);
    release();
  }
}

function uid(v) {
  return String(v || "").trim();
}

function now() {
  return Date.now();
}

function fmt(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function nextRoomId() {
  const meta = getMeta();
  meta.roomCounter = safeNumber(meta.roomCounter, 0) + 1;
  saveMeta(meta);
  const num = String(meta.roomCounter).padStart(4, "0");
  return `TX-${num}`;
}

function findUserRoom(rooms, userId) {
  const id = uid(userId);
  for (const room of Object.values(rooms)) {
    if (!room || ["FINISHED", "CANCELLED"].includes(room.status)) continue;
    if (room.player1Id === id || room.player2Id === id) return room;
  }
  return null;
}

function createRoom(ownerId, ownerName) {
  return {
    roomId: nextRoomId(),
    ownerId: uid(ownerId),
    player1Id: uid(ownerId),
    player1Name: ownerName || "Người chơi",
    player2Id: null,
    player2Name: null,
    player1Choice: null,
    player2Choice: null,
    player1Bet: 0,
    player2Bet: 0,
    player1Held: false,
    player2Held: false,
    status: "WAITING",
    createdAt: now(),
    startedAt: null,
    finishedAt: null,
    dice: null,
    total: null,
    resultGate: null,
    winnerId: null,
    loserId: null,
    transactionId: null,
    expWinner: 0,
    expLoser: 0,
    paid: false,
    special: false,
  };
}

export function calcWinExp(potAmount) {
  const cfg = getConfig();
  const tiers = Array.isArray(cfg.expTiers) ? cfg.expTiers : [];
  const amount = safeNumber(potAmount, 0);
  for (const t of tiers) {
    const min = safeNumber(t.min, 0);
    const max = t.max == null ? Infinity : safeNumber(t.max, Infinity);
    if (amount >= min && amount <= max) return safeNumber(t.exp, 20);
  }
  return 20;
}

export function calcLoseExp(winExp) {
  const cfg = getConfig();
  const rate = safeNumber(cfg.loserExpRate, 0.3);
  return Math.max(1, Math.floor(safeNumber(winExp, 20) * rate));
}

function rollDice() {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
}

function resolveGate(total) {
  if (total === 3 || total === 18) return "SPECIAL";
  if (total >= 4 && total <= 10) return "XIU";
  if (total >= 11 && total <= 17) return "TAI";
  return "SPECIAL";
}

function appendHistory(entry) {
  const cfg = getConfig();
  const list = getHistory();
  list.push(entry);
  const limit = cfg.historyLimit || 200;
  while (list.length > limit) list.shift();
  saveHistory(list);
}

/**
 * Create or join a room.
 */
export async function joinOrCreateRoom(userId, userName) {
  await ensureDataFiles();
  const key = uid(userId);
  if (!key) return { success: false, error: "UID không hợp lệ" };

  return withLock(USER_LOCKS, key, async () => {
    const rooms = getRooms();
    const existing = findUserRoom(rooms, key);
    if (existing) {
      return {
        success: true,
        alreadyIn: true,
        room: existing,
        message: `Bạn đang ở phòng ${existing.roomId}. Hoàn thành hoặc hủy trước khi tạo/tham gia phòng khác.`,
      };
    }

    // Find a WAITING room with 1 player
    let openRoom = null;
    for (const r of Object.values(rooms)) {
      if (r.status === "WAITING" && r.player1Id && !r.player2Id) {
        openRoom = r;
        break;
      }
    }

    if (openRoom) {
      return withLock(ROOM_LOCKS, openRoom.roomId, async () => {
        const rooms2 = getRooms();
        const room = rooms2[openRoom.roomId];
        if (!room || room.status !== "WAITING" || room.player2Id) {
          // Race: create new instead
          const newRoom = createRoom(key, userName);
          rooms2[newRoom.roomId] = newRoom;
          saveRooms(rooms2);
          return { success: true, created: true, room: newRoom };
        }
        if (room.player1Id === key) {
          return { success: true, alreadyIn: true, room };
        }
        room.player2Id = key;
        room.player2Name = userName || "Người chơi";
        room.status = "READY";
        rooms2[room.roomId] = room;
        saveRooms(rooms2);
        return { success: true, joined: true, room };
      });
    }

    const newRoom = createRoom(key, userName);
    rooms[newRoom.roomId] = newRoom;
    saveRooms(rooms);
    return { success: true, created: true, room: newRoom };
  });
}

/**
 * Place or update bet before match starts.
 */
export async function placeBet(userId, choice, amountOrAll, userName) {
  await ensureDataFiles();
  const key = uid(userId);
  const cfg = getConfig();
  const choiceNorm = String(choice || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  let gate = null;
  if (choiceNorm === "tai" || choiceNorm === "tài") gate = "TAI";
  if (choiceNorm === "xiu" || choiceNorm === "xiu" || choiceNorm === "xỉu") gate = "XIU";
  if (!gate) return { success: false, error: "Cửa không hợp lệ. Dùng: tài hoặc xỉu." };

  return withLock(USER_LOCKS, key, async () => {
    const rooms = getRooms();
    const room = findUserRoom(rooms, key);

    // Chỉ đặt cược trong phòng 1vs1 — không tự tạo phòng
    if (!room) {
      return {
        success: false,
        error: "NO_ROOM",
        message: "Bạn chưa ở trong phòng 1vs1. Dùng .tx tài/xỉu để chơi nhanh, hoặc .tx tp để tạo phòng đối kháng.",
      };
    }

    return withLock(ROOM_LOCKS, room.roomId, async () => {
      const rooms2 = getRooms();
      const r = rooms2[room.roomId];
      if (!r || ["RUNNING", "FINISHED", "CANCELLED"].includes(r.status)) {
        return { success: false, error: "Phòng không còn nhận cược." };
      }
      if (r.player1Id !== key && r.player2Id !== key) {
        return { success: false, error: "Bạn không thuộc phòng này." };
      }

      const isP1 = r.player1Id === key;
      const prevHeld = isP1 ? r.player1Held : r.player2Held;
      const prevBet = isP1 ? r.player1Bet : r.player2Bet;

      // Refund previous hold if changing bet
      if (prevHeld && prevBet > 0) {
        await TienGame.addMoney(key, prevBet, {
          description: `TX hoàn cược cũ ${r.roomId}`,
        });
        if (isP1) {
          r.player1Held = false;
          r.player1Bet = 0;
        } else {
          r.player2Held = false;
          r.player2Bet = 0;
        }
      }

      const balance = await TienGame.getBalance(key);
      let betAmount = 0;
      const raw = String(amountOrAll || "").toLowerCase().trim();
      if (raw === "all" || raw === "allin") {
        betAmount = Math.floor(balance);
      } else {
        betAmount = Math.floor(safeNumber(raw, 0));
      }

      if (!Number.isFinite(betAmount) || betAmount <= 0) {
        return { success: false, error: "Số tiền cược không hợp lệ." };
      }
      if (betAmount < cfg.minBet) {
        return { success: false, error: `Cược tối thiểu ${fmt(cfg.minBet)}.` };
      }
      if (betAmount > cfg.maxBet) {
        return { success: false, error: `Cược tối đa ${fmt(cfg.maxBet)}.` };
      }
      if (betAmount > balance) {
        return {
          success: false,
          error: `Số dư không đủ. Bạn có ${fmt(balance)}.`,
        };
      }

      // Hold money
      try {
        await TienGame.removeMoney(key, betAmount, {
          description: `TX giữ cược ${r.roomId}`,
        });
      } catch (err) {
        return { success: false, error: err.message || "Không thể giữ tiền cược." };
      }

      if (isP1) {
        r.player1Choice = gate;
        r.player1Bet = betAmount;
        r.player1Held = true;
        r.player1Name = userName || r.player1Name;
      } else {
        r.player2Choice = gate;
        r.player2Bet = betAmount;
        r.player2Held = true;
        r.player2Name = userName || r.player2Name;
      }

      if (r.player1Id && r.player2Id) r.status = "READY";
      rooms2[r.roomId] = r;
      saveRooms(rooms2);

      const newBal = await TienGame.getBalance(key);
      return {
        success: true,
        room: r,
        gate,
        bet: betAmount,
        balance: newBal,
      };
    });
  });
}

/**
 * Start match — owner only, atomic, no double pay.
 */
export async function startMatch(userId) {
  await ensureDataFiles();
  const key = uid(userId);

  const rooms = getRooms();
  const room = findUserRoom(rooms, key);
  if (!room) return { success: false, error: "Bạn không ở trong phòng nào." };
  if (room.ownerId !== key) {
    return { success: false, error: "Chỉ chủ phòng mới được bắt đầu trận." };
  }

  return withLock(ROOM_LOCKS, room.roomId, async () => {
    const rooms2 = getRooms();
    const r = rooms2[room.roomId];
    if (!r) return { success: false, error: "Phòng không tồn tại." };
    if (r.status === "RUNNING") {
      return { success: false, error: "Trận đang được xử lý, vui lòng chờ." };
    }
    if (r.status === "FINISHED" || r.paid) {
      return { success: false, error: "Trận đã kết thúc." };
    }
    if (r.status === "CANCELLED") {
      return { success: false, error: "Phòng đã bị hủy." };
    }
    if (!r.player1Id || !r.player2Id) {
      return { success: false, error: "Chưa đủ 2 người chơi." };
    }
    if (!r.player1Choice || !r.player2Choice) {
      return { success: false, error: "Cả hai người phải đặt cửa Tài/Xỉu trước." };
    }
    if (!r.player1Held || !r.player2Held || r.player1Bet <= 0 || r.player2Bet <= 0) {
      return { success: false, error: "Cược chưa được giữ thành công cho cả hai người." };
    }

    // Lock room
    r.status = "RUNNING";
    r.startedAt = now();
    r.transactionId = `TXN-${r.roomId}-${randomUUID().slice(0, 8)}`;
    rooms2[r.roomId] = r;
    saveRooms(rooms2);

    const dice = rollDice();
    const total = dice[0] + dice[1] + dice[2];
    const resultGate = resolveGate(total);
    const pot = r.player1Bet + r.player2Bet;

    r.dice = dice;
    r.total = total;
    r.resultGate = resultGate;
    r.special = resultGate === "SPECIAL";

    let winnerId = null;
    let loserId = null;
    let expWinner = 0;
    let expLoser = 0;

    if (resultGate === "SPECIAL") {
      // Both lose bets (already held). Give special EXP.
      expWinner = 0;
      expLoser = 0;
      const specialExp = safeNumber(getConfig().specialExp, 20);
      try {
        await addExp(r.player1Id, specialExp, { source: `tx_special_${r.roomId}` });
        await addExp(r.player2Id, specialExp, { source: `tx_special_${r.roomId}` });
      } catch (e) {
        console.error("[TX] EXP special error:", e?.message);
      }
      r.expWinner = specialExp;
      r.expLoser = specialExp;
    } else {
      const p1Win = r.player1Choice === resultGate;
      const p2Win = r.player2Choice === resultGate;

      if (p1Win && !p2Win) {
        winnerId = r.player1Id;
        loserId = r.player2Id;
      } else if (p2Win && !p1Win) {
        winnerId = r.player2Id;
        loserId = r.player1Id;
      } else if (p1Win && p2Win) {
        // Same choice both win vs house — split pot back? Spec says winner takes all.
        // If same gate and it wins: both "win" — return each their bet + nothing extra
        // Actually pot is sum of both. Spec: winner receives entire pot.
        // If both chose winning gate, each should get their own bet back (push).
        // Safer: refund both their bets (push).
        try {
          await TienGame.addMoney(r.player1Id, r.player1Bet, {
            description: `TX hòa cùng cửa ${r.roomId}`,
          });
          await TienGame.addMoney(r.player2Id, r.player2Bet, {
            description: `TX hòa cùng cửa ${r.roomId}`,
          });
        } catch (e) {
          console.error("[TX] refund same-choice:", e?.message);
        }
        const pushExp = 20;
        try {
          await addExp(r.player1Id, pushExp, { source: `tx_push_${r.roomId}` });
          await addExp(r.player2Id, pushExp, { source: `tx_push_${r.roomId}` });
        } catch {
          /* ignore */
        }
        r.expWinner = pushExp;
        r.expLoser = pushExp;
        r.winnerId = null;
        r.loserId = null;
        r.paid = true;
        r.status = "FINISHED";
        r.finishedAt = now();
        rooms2[r.roomId] = r;
        saveRooms(rooms2);
        appendHistory({ ...r });
        return {
          success: true,
          room: r,
          dice,
          total,
          resultGate,
          push: true,
          message: "Cả hai chọn cùng cửa thắng — hoàn lại tiền cược (hòa).",
        };
      } else {
        // Both chose losing gate
        try {
          // bets already held — house keeps (both lose)
        } catch {
          /* ignore */
        }
        const loseExp = 10;
        try {
          await addExp(r.player1Id, loseExp, { source: `tx_bothlose_${r.roomId}` });
          await addExp(r.player2Id, loseExp, { source: `tx_bothlose_${r.roomId}` });
        } catch {
          /* ignore */
        }
        r.expWinner = loseExp;
        r.expLoser = loseExp;
        r.paid = true;
        r.status = "FINISHED";
        r.finishedAt = now();
        rooms2[r.roomId] = r;
        saveRooms(rooms2);
        appendHistory({ ...r });
        return {
          success: true,
          room: r,
          dice,
          total,
          resultGate,
          bothLose: true,
          message: "Cả hai chọn cửa thua — mất tiền cược.",
        };
      }

      // Normal win/lose
      expWinner = calcWinExp(pot);
      expLoser = calcLoseExp(expWinner);

      try {
        await TienGame.addMoney(winnerId, pot, {
          description: `TX thắng ${r.roomId} pot=${pot}`,
        });
      } catch (e) {
        console.error("[TX] pay winner failed:", e?.message);
        // Critical: try to not leave money stuck — mark unpaid for manual review
        r.paid = false;
        r.status = "FINISHED";
        r.finishedAt = now();
        r.winnerId = winnerId;
        r.loserId = loserId;
        rooms2[r.roomId] = r;
        saveRooms(rooms2);
        return {
          success: false,
          error: "Lỗi thanh toán người thắng. Đã ghi log, liên hệ admin.",
          room: r,
        };
      }

      try {
        await addExp(winnerId, expWinner, { source: `tx_win_${r.roomId}` });
        await addExp(loserId, expLoser, { source: `tx_lose_${r.roomId}` });
        await recordMatchResult(winnerId, "win");
        await recordMatchResult(loserId, "loss");
      } catch (e) {
        console.error("[TX] EXP error:", e?.message);
      }

      r.winnerId = winnerId;
      r.loserId = loserId;
      r.expWinner = expWinner;
      r.expLoser = expLoser;
    }

    r.paid = true;
    r.status = "FINISHED";
    r.finishedAt = now();
    rooms2[r.roomId] = r;
    saveRooms(rooms2);
    appendHistory({ ...r });

    return {
      success: true,
      room: r,
      dice,
      total,
      resultGate,
      pot,
      winnerId,
      loserId,
      expWinner: r.expWinner,
      expLoser: r.expLoser,
      special: r.special,
    };
  });
}

/**
 * Cancel room — owner only, before start.
 */
export async function cancelRoom(userId) {
  await ensureDataFiles();
  const key = uid(userId);
  const rooms = getRooms();
  const room = findUserRoom(rooms, key);
  if (!room) return { success: false, error: "Bạn không ở trong phòng nào." };
  if (room.ownerId !== key) {
    return { success: false, error: "Chỉ chủ phòng mới được hủy bàn." };
  }

  return withLock(ROOM_LOCKS, room.roomId, async () => {
    const rooms2 = getRooms();
    const r = rooms2[room.roomId];
    if (!r) return { success: false, error: "Phòng không tồn tại." };
    if (r.status === "RUNNING") {
      return { success: false, error: "Trận đang chạy, không thể hủy." };
    }
    if (r.status === "FINISHED" || r.paid) {
      return { success: false, error: "Trận đã kết thúc, không thể hủy." };
    }
    if (r.status === "CANCELLED") {
      return { success: false, error: "Phòng đã bị hủy trước đó." };
    }

    const refunds = [];
    if (r.player1Held && r.player1Bet > 0 && r.player1Id) {
      try {
        await TienGame.addMoney(r.player1Id, r.player1Bet, {
          description: `TX hoàn hủy ${r.roomId}`,
        });
        refunds.push({ userId: r.player1Id, name: r.player1Name, amount: r.player1Bet });
        r.player1Held = false;
      } catch (e) {
        console.error("[TX] refund p1:", e?.message);
      }
    }
    if (r.player2Held && r.player2Bet > 0 && r.player2Id) {
      try {
        await TienGame.addMoney(r.player2Id, r.player2Bet, {
          description: `TX hoàn hủy ${r.roomId}`,
        });
        refunds.push({ userId: r.player2Id, name: r.player2Name, amount: r.player2Bet });
        r.player2Held = false;
      } catch (e) {
        console.error("[TX] refund p2:", e?.message);
      }
    }

    r.status = "CANCELLED";
    r.finishedAt = now();
    rooms2[r.roomId] = r;
    saveRooms(rooms2);
    appendHistory({ ...r, refunds });

    return { success: true, room: r, refunds };
  });
}


/**
 * Chơi nhanh với nhà cái — không cần phòng / đối thủ.
 * Thắng nhận gấp đôi tiền cược (hoàn cược + thưởng = 1:1).
 * Tổng 3 hoặc 18: thua (nhà cái).
 */
export async function playSolo(userId, choice, amountOrAll, userName) {
  await ensureDataFiles();
  const key = uid(userId);
  const cfg = getConfig();
  if (!key) return { success: false, error: "UID không hợp lệ" };

  const choiceNorm = String(choice || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  let gate = null;
  if (choiceNorm === "tai" || choiceNorm === "tài") gate = "TAI";
  if (choiceNorm === "xiu" || choiceNorm === "xỉu") gate = "XIU";
  if (!gate) return { success: false, error: "Cửa không hợp lệ. Dùng: tài hoặc xỉu." };

  return withLock(USER_LOCKS, key, async () => {
    const balance = await TienGame.getBalance(key);
    let betAmount = 0;
    const raw = String(amountOrAll || "").toLowerCase().trim();
    if (raw === "all" || raw === "allin") {
      betAmount = Math.floor(balance);
    } else {
      betAmount = Math.floor(safeNumber(raw, 0));
    }

    if (!Number.isFinite(betAmount) || betAmount <= 0) {
      return { success: false, error: "Số tiền cược không hợp lệ." };
    }
    if (betAmount < cfg.minBet) {
      return { success: false, error: `Cược tối thiểu ${fmt(cfg.minBet)}.` };
    }
    if (betAmount > cfg.maxBet) {
      return { success: false, error: `Cược tối đa ${fmt(cfg.maxBet)}.` };
    }
    if (betAmount > balance) {
      return { success: false, error: `Số dư không đủ. Bạn có ${fmt(balance)}.` };
    }

    try {
      await TienGame.removeMoney(key, betAmount, {
        description: `TX solo cược ${gate}`,
      });
    } catch (err) {
      return { success: false, error: err.message || "Không thể trừ tiền cược." };
    }

    const dice = rollDice();
    const total = dice[0] + dice[1] + dice[2];
    const resultGate = resolveGate(total);
    const special = resultGate === "SPECIAL";
    const won = !special && resultGate === gate;

    let payout = 0;
    let expGain = 0;
    let outcome = "LOSE";

    if (special) {
      outcome = "SPECIAL";
      expGain = safeNumber(cfg.specialExp, 20);
      // tiền đã trừ, không hoàn
    } else if (won) {
      outcome = "WIN";
      payout = betAmount * 2; // hoàn cược + thắng 1:1
      try {
        await TienGame.addMoney(key, payout, {
          description: `TX solo thắng ${gate}`,
        });
      } catch (e) {
        console.error("[TX solo] pay win failed:", e?.message);
        return { success: false, error: "Lỗi trả thưởng. Liên hệ admin." };
      }
      expGain = calcWinExp(betAmount);
    } else {
      outcome = "LOSE";
      expGain = calcLoseExp(calcWinExp(betAmount));
    }

    try {
      await addExp(key, expGain, { source: `tx_solo_${outcome.toLowerCase()}` });
      if (outcome === "WIN") await recordMatchResult(key, "win");
      else if (outcome === "LOSE") await recordMatchResult(key, "loss");
    } catch (e) {
      console.error("[TX solo] EXP error:", e?.message);
    }

    const newBal = await TienGame.getBalance(key);
    appendHistory({
      mode: "SOLO",
      userId: key,
      userName: userName || "Người chơi",
      choice: gate,
      bet: betAmount,
      dice,
      total,
      resultGate,
      outcome,
      payout,
      expGain,
      at: now(),
    });

    return {
      success: true,
      mode: "SOLO",
      gate,
      bet: betAmount,
      dice,
      total,
      resultGate,
      special,
      won,
      outcome,
      payout,
      expGain,
      balance: newBal,
      userName: userName || "Người chơi",
    };
  });
}

export async function getUserRoom(userId) {
  await ensureDataFiles();
  const rooms = getRooms();
  return findUserRoom(rooms, userId);
}

export { fmt, ensureDataFiles, getConfig };
