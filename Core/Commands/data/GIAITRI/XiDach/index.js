import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import TienGame from "../TienGame/index.js";
import { addExp } from "../PlayerProfile/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "config.json");
const ROOMS_PATH = path.join(__dirname, "rooms.json");
const STATS_PATH = path.join(__dirname, "stats.json");

const ROOM_LOCKS = new Map();
const roomsMem = new Map();
const threadRoom = new Map();
const userRoom = new Map();
/** messageId (lobby canvas/text) -> roomId */
const lobbyMsgMap = new Map();

function readJson(p, fb) {
  try {
    if (!fs.existsSync(p)) return structuredClone(fb);
    return JSON.parse(fs.readFileSync(p, "utf8")) ?? structuredClone(fb);
  } catch {
    return structuredClone(fb);
  }
}
function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  try {
    fs.renameSync(tmp, p);
  } catch {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  }
}

export function getConfig() {
  return {
    enabled: true,
    maxPlayers: 5,
    minPlayers: 2,
    defaultBet: 10000,
    minBet: 1000,
    maxBet: 10_000_000,
    actionTimeoutMs: 180000,
    expWinner: 80,
    expLoser: 40,
    cardsDir: "../BaiCao/cards",
    cardsMapPath: "../BaiCao/cards_map.json",
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
    ...readJson(CONFIG_PATH, {}),
  };
}

export function fmt(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function uid(v) {
  return String(v || "").trim();
}

async function withRoomLock(roomId, task) {
  const k = String(roomId);
  const prev = ROOM_LOCKS.get(k) || Promise.resolve();
  let release;
  const next = new Promise((r) => {
    release = r;
  });
  ROOM_LOCKS.set(k, next);
  await prev;
  try {
    return await task();
  } finally {
    if (ROOM_LOCKS.get(k) === next) ROOM_LOCKS.delete(k);
    release();
  }
}

function nextRoomId() {
  return `XD-${Math.floor(1000 + Math.random() * 9000)}`;
}

function mapPath() {
  const cfg = getConfig();
  return path.resolve(__dirname, cfg.cardsMapPath || "../BaiCao/cards_map.json");
}

function loadCardMap() {
  return readJson(mapPath(), {});
}

export function getCardsDir() {
  const cfg = getConfig();
  return path.resolve(__dirname, cfg.cardsDir || "../BaiCao/cards");
}

export function resolveCardImage(cardKey) {
  const map = loadCardMap();
  const cfg = getConfig();
  const entry = map[cardKey];
  const dir = getCardsDir();
  const candidates = [];
  if (entry?.file) candidates.push(path.join(dir, entry.file));
  for (const ext of cfg.extensions || [".png"]) {
    candidates.push(path.join(dir, `${cardKey}${ext}`));
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function checkDeckImages() {
  const map = loadCardMap();
  const keys = Object.keys(map);
  if (!keys.length) {
    // fallback 52 standard keys
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const suits = ["co", "ro", "chuong", "bich"];
    for (const s of suits) for (const r of ranks) keys.push(`${r}_${s}`);
  }
  const missing = [];
  for (const key of keys) {
    if (!resolveCardImage(key)) missing.push(key);
  }
  return { ok: missing.length === 0, total: keys.length || 52, missing };
}

function buildDeck() {
  const map = loadCardMap();
  let keys = Object.keys(map);
  if (!keys.length) {
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const suits = ["co", "ro", "chuong", "bich"];
    keys = [];
    for (const s of suits) for (const r of ranks) keys.push(`${r}_${s}`);
  }
  return keys.map((key) => {
    const e = map[key] || {};
    return {
      key,
      rank: e.rank || key.split("_")[0],
      suit: e.suit || key.split("_")[1],
      label: e.label || key,
    };
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Blackjack best total ≤ 21 */
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards || []) {
    const r = String(c.rank || "").toUpperCase();
    if (r === "A") {
      aces++;
      total += 11;
    } else if (["10", "J", "Q", "K"].includes(r)) {
      total += 10;
    } else {
      total += Number(r) || 0;
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export function classifyHand(cards) {
  if (!cards || cards.length < 2) {
    return { type: "normal", label: "Bài thường", points: handValue(cards), rankScore: 0 };
  }
  const r0 = String(cards[0].rank).toUpperCase();
  const r1 = String(cards[1].rank).toUpperCase();
  const points = handValue(cards);
  const isTen = (r) => ["10", "J", "Q", "K"].includes(r);

  // Xì Bàn: A+A on first two only
  if (cards.length === 2 && r0 === "A" && r1 === "A") {
    return { type: "xiban", label: "XÌ BÀN", points: 21, rankScore: 300 };
  }
  // Xì Dách: A + 10/J/Q/K
  if (
    cards.length === 2 &&
    ((r0 === "A" && isTen(r1)) || (r1 === "A" && isTen(r0)))
  ) {
    return { type: "xidach", label: "XÌ DÁCH", points: 21, rankScore: 200 };
  }
  if (points > 21) {
    return { type: "quac", label: "QUẮC", points, rankScore: -points };
  }
  return { type: "normal", label: "Bài thường", points, rankScore: points };
}

function cardLabel(c) {
  const suitIcon = { co: "♥️", ro: "♦️", chuong: "♣️", bich: "♠️" };
  return `${c.rank}${suitIcon[c.suit] || c.suit || ""}`;
}

function persistRooms() {
  const obj = {};
  for (const [id, r] of roomsMem) obj[id] = r;
  writeJson(ROOMS_PATH, obj);
}

function loadRoomsFromDisk() {
  const data = readJson(ROOMS_PATH, {});
  for (const [id, r] of Object.entries(data)) {
    if (!r || ["FINISHED", "CANCELLED"].includes(r.status)) continue;
    if (["PLAYING", "DEALING", "SETTLING"].includes(r.status)) {
      // Safe cancel on restart — refund held bets
      r.status = "CANCELLED";
      r.cancelReason = "bot_restart";
    }
    roomsMem.set(id, r);
    if (r.threadId) threadRoom.set(String(r.threadId), id);
    for (const p of r.players || []) {
      if (p.uid) userRoom.set(String(p.uid), id);
    }
    if (r.lobbyMsgId) lobbyMsgMap.set(String(r.lobbyMsgId), id);
  }
}
loadRoomsFromDisk();

function loadStats() {
  return readJson(STATS_PATH, {});
}
function saveStats(s) {
  writeJson(STATS_PATH, s);
}

function updateStats(uid, name, { win, moneyDelta }) {
  const stats = loadStats();
  const k = String(uid);
  if (!stats[k]) {
    stats[k] = { uid: k, name, wins: 0, losses: 0, games: 0, moneyNet: 0 };
  }
  stats[k].name = name || stats[k].name;
  stats[k].games += 1;
  if (win) stats[k].wins += 1;
  else stats[k].losses += 1;
  stats[k].moneyNet += moneyDelta || 0;
  saveStats(stats);
}

export function getRankList(limit = 15) {
  const stats = loadStats();
  return Object.values(stats)
    .sort((a, b) => b.wins - a.wins || b.moneyNet - a.moneyNet)
    .slice(0, limit);
}

export function findRoomByThread(threadId) {
  const id = threadRoom.get(String(threadId));
  return id ? roomsMem.get(id) : null;
}

export function findRoomByUser(userId) {
  const id = userRoom.get(uid(userId));
  return id ? roomsMem.get(id) : null;
}

export function findRoomByLobbyMsg(msgId) {
  const id = lobbyMsgMap.get(String(msgId));
  return id ? roomsMem.get(id) : null;
}

export function getRoom(roomId) {
  return roomsMem.get(roomId) || null;
}

export function bindLobbyMessage(roomId, messageId) {
  if (!roomId || !messageId) return;
  lobbyMsgMap.set(String(messageId), roomId);
  const r = roomsMem.get(roomId);
  if (r) {
    r.lobbyMsgId = String(messageId);
    roomsMem.set(roomId, r);
    persistRooms();
  }
}

export async function createRoom(ownerId, ownerName, threadId, betAmount) {
  const cfg = getConfig();
  const key = uid(ownerId);
  const existing = findRoomByUser(key);
  if (existing && !["FINISHED", "CANCELLED"].includes(existing.status)) {
    return { success: false, error: `Bạn đang ở phòng ${existing.roomId}. Hủy trước khi tạo mới.` };
  }
  const threadExisting = findRoomByThread(threadId);
  if (threadExisting && !["FINISHED", "CANCELLED"].includes(threadExisting.status)) {
    return { success: false, error: `Nhóm đang có sòng ${threadExisting.roomId}.` };
  }

  let bet = Math.floor(Number(betAmount) || cfg.defaultBet);
  bet = Math.max(cfg.minBet, Math.min(cfg.maxBet, bet));

  const balance = await TienGame.getBalance(key);
  if (balance < bet) {
    return { success: false, error: `Cần ít nhất ${fmt(bet)} GOLD. Bạn có ${fmt(balance)}.` };
  }

  const roomId = nextRoomId();
  const room = {
    roomId,
    threadId: String(threadId),
    ownerId: key,
    ownerName: ownerName || "Chủ sòng",
    bet,
    status: "WAITING",
    players: [
      {
        uid: key,
        name: ownerName || "Chủ sòng",
        seat: 1,
        cards: null,
        points: null,
        handType: null,
        handLabel: null,
        rankScore: 0,
        status: "waiting", // waiting | playing | stand | bust | done
        held: false,
        moneyChange: 0,
        exp: 0,
        txId: null,
      },
    ],
    deck: [],
    deckIdx: 0,
    paid: false,
    settled: false,
    createdAt: Date.now(),
    lobbyMsgId: null,
    transactionId: `xd_${Date.now()}_${randomUUID().slice(0, 8)}`,
  };

  roomsMem.set(roomId, room);
  threadRoom.set(String(threadId), roomId);
  userRoom.set(key, roomId);
  persistRooms();
  return { success: true, room };
}

export async function joinRoom(userId, userName, threadId, viaMsgId = null) {
  const cfg = getConfig();
  const key = uid(userId);

  const already = findRoomByUser(key);
  if (already && !["FINISHED", "CANCELLED"].includes(already.status)) {
    if (already.threadId === String(threadId)) {
      return { success: false, error: "Bạn đã ở trong sòng này rồi.", room: already };
    }
    return { success: false, error: `Bạn đang ở phòng ${already.roomId}.` };
  }

  let room = null;
  if (viaMsgId) room = findRoomByLobbyMsg(viaMsgId);
  if (!room) room = findRoomByThread(threadId);
  if (!room || ["FINISHED", "CANCELLED"].includes(room.status)) {
    return { success: false, error: "Không tìm thấy sòng. Hãy reply tin nhắn sòng Xì Dách của bot." };
  }

  return withRoomLock(room.roomId, async () => {
    const r = roomsMem.get(room.roomId);
    if (!r || r.status !== "WAITING") {
      return { success: false, error: "Sòng đã khóa, không thể tham gia." };
    }
    if (r.players.some((p) => p.uid === key)) {
      return { success: false, error: "Bạn đã ở trong sòng này.", room: r };
    }
    if (r.players.length >= cfg.maxPlayers) {
      return { success: false, error: `Sòng đã đủ ${cfg.maxPlayers} người.` };
    }
    const balance = await TienGame.getBalance(key);
    if (balance < r.bet) {
      return {
        success: false,
        error: `Cần ít nhất ${fmt(r.bet)} để vào sòng. Bạn có ${fmt(balance)}.`,
      };
    }
    r.players.push({
      uid: key,
      name: userName || "Người chơi",
      seat: r.players.length + 1,
      cards: null,
      points: null,
      handType: null,
      handLabel: null,
      rankScore: 0,
      status: "waiting",
      held: false,
      moneyChange: 0,
      exp: 0,
      txId: null,
    });
    userRoom.set(key, r.roomId);
    roomsMem.set(r.roomId, r);
    persistRooms();
    return { success: true, room: r };
  });
}

export async function startGame(userId) {
  const key = uid(userId);
  const room = findRoomByUser(key);
  if (!room) return { success: false, error: "Bạn không ở trong sòng nào." };
  if (room.ownerId !== key) return { success: false, error: "Chỉ chủ sòng mới được bắt đầu." };

  const cfg = getConfig();
  const deckCheck = checkDeckImages();
  if (!deckCheck.ok) {
    return {
      success: false,
      error: `Thiếu ảnh bài (${deckCheck.missing.length}/${deckCheck.total}). Bổ sung vào thư mục cards Bài Cào.`,
    };
  }

  return withRoomLock(room.roomId, async () => {
    const r = roomsMem.get(room.roomId);
    if (!r) return { success: false, error: "Phòng không tồn tại." };
    if (r.status !== "WAITING") {
      return { success: false, error: `Sòng đang ${r.status}, không thể start.` };
    }
    if (r.players.length < cfg.minPlayers) {
      return { success: false, error: `Cần ít nhất ${cfg.minPlayers} người. Hiện: ${r.players.length}.` };
    }

    for (const p of r.players) {
      const bal = await TienGame.getBalance(p.uid);
      if (bal < r.bet) {
        return {
          success: false,
          error: `${p.name} không đủ tiền (cần ${fmt(r.bet)}, có ${fmt(bal)}).`,
        };
      }
    }

    // Hold bets
    const held = [];
    try {
      for (const p of r.players) {
        const txId = `${r.transactionId}_${p.uid}`;
        p.txId = txId;
        await TienGame.removeMoney(p.uid, r.bet, {
          description: `Xì Dách cược ${r.roomId}`,
          transactionId: txId,
        });
        p.held = true;
        held.push(p);
      }
    } catch (e) {
      for (const p of held) {
        try {
          await TienGame.addMoney(p.uid, r.bet, {
            description: `Xì Dách hoàn lỗi ${r.roomId}`,
          });
          p.held = false;
        } catch {
          /* ignore */
        }
      }
      return { success: false, error: `Lỗi trừ tiền: ${e.message}` };
    }

    r.status = "DEALING";
    const deck = shuffle(buildDeck());
    r.deck = deck;
    r.deckIdx = 0;

    for (const p of r.players) {
      p.cards = [deck[r.deckIdx++], deck[r.deckIdx++]];
      const cls = classifyHand(p.cards);
      p.points = cls.points;
      p.handType = cls.type;
      p.handLabel = cls.label;
      p.rankScore = cls.rankScore;
      // Auto done if natural Xi Ban / Xi Dach
      if (cls.type === "xiban" || cls.type === "xidach") {
        p.status = "done";
      } else {
        p.status = "playing";
      }
    }

    r.status = "PLAYING";
    roomsMem.set(r.roomId, r);
    persistRooms();
    return { success: true, room: r };
  });
}

function refreshPlayerHand(p) {
  const cls = classifyHand(p.cards);
  p.points = cls.points;
  p.handType = cls.type;
  p.handLabel = cls.label;
  p.rankScore = cls.rankScore;
  if (cls.type === "quac") p.status = "bust";
}

export async function hitCard(userId) {
  const key = uid(userId);
  const room = findRoomByUser(key);
  if (!room) return { success: false, error: "Bạn không ở trong sòng." };

  return withRoomLock(room.roomId, async () => {
    const r = roomsMem.get(room.roomId);
    if (!r || r.status !== "PLAYING") {
      return { success: false, error: "Chưa đến lượt rút bài." };
    }
    const p = r.players.find((x) => x.uid === key);
    if (!p) return { success: false, error: "Bạn không trong sòng này." };
    if (p.status !== "playing") {
      return { success: false, error: "Bạn đã dừng hoặc đã quắc.", already: true };
    }
    if (r.deckIdx >= r.deck.length) {
      return { success: false, error: "Hết bài trong bộ." };
    }

    const card = r.deck[r.deckIdx++];
    p.cards.push(card);
    refreshPlayerHand(p);

    roomsMem.set(r.roomId, r);
    persistRooms();

    const allDone = r.players.every((x) => ["stand", "bust", "done"].includes(x.status));
    return {
      success: true,
      room: r,
      player: p,
      newCard: card,
      allDone,
    };
  });
}

export async function standPlayer(userId) {
  const key = uid(userId);
  const room = findRoomByUser(key);
  if (!room) return { success: false, error: "Bạn không ở trong sòng." };

  return withRoomLock(room.roomId, async () => {
    const r = roomsMem.get(room.roomId);
    if (!r || r.status !== "PLAYING") {
      return { success: false, error: "Chưa đến lượt dừng." };
    }
    const p = r.players.find((x) => x.uid === key);
    if (!p) return { success: false, error: "Bạn không trong sòng này." };
    if (p.status !== "playing") {
      return { success: false, error: "Bạn đã dừng hoặc đã quắc.", already: true };
    }
    p.status = "stand";
    roomsMem.set(r.roomId, r);
    persistRooms();

    const allDone = r.players.every((x) => ["stand", "bust", "done"].includes(x.status));
    return { success: true, room: r, player: p, allDone };
  });
}

export async function settleRoom(roomId) {
  const cfg = getConfig();
  return withRoomLock(roomId, async () => {
    const r = roomsMem.get(roomId);
    if (!r) return { success: false, error: "Phòng không tồn tại." };
    if (r.settled || r.paid || r.status === "FINISHED") {
      return { success: false, error: "Ván đã thanh toán." };
    }
    if (r.status !== "PLAYING" && r.status !== "SETTLING") {
      return { success: false, error: "Chưa thể kết thúc." };
    }

    r.status = "SETTLING";

    // Final classify
    for (const p of r.players) {
      refreshPlayerHand(p);
      if (p.status === "playing") p.status = "stand";
    }

    // Sort ranking
    const ranked = [...r.players].sort((a, b) => {
      // quac last
      const aq = a.handType === "quac" ? 1 : 0;
      const bq = b.handType === "quac" ? 1 : 0;
      if (aq !== bq) return aq - bq;
      return (b.rankScore || 0) - (a.rankScore || 0);
    });
    ranked.forEach((p, i) => {
      p.place = i + 1;
    });

    const nonBust = ranked.filter((p) => p.handType !== "quac");
    const pot = r.bet * r.players.length;
    let winners = [];

    if (nonBust.length === 0) {
      // all bust — refund
      for (const p of r.players) {
        await TienGame.addMoney(p.uid, r.bet, {
          description: `Xì Dách hoàn (all quắc) ${r.roomId}`,
          transactionId: `${r.transactionId}_refund_${p.uid}`,
        });
        p.moneyChange = 0;
        p.exp = cfg.expLoser;
        p.win = false;
      }
    } else {
      const best = nonBust[0].rankScore;
      winners = nonBust.filter((p) => p.rankScore === best);
      const winShare = Math.floor(pot / winners.length);
      const winSet = new Set(winners.map((w) => w.uid));

      for (const p of r.players) {
        if (winSet.has(p.uid)) {
          await TienGame.addMoney(p.uid, winShare, {
            description: `Xì Dách thắng ${r.roomId}`,
            transactionId: `${r.transactionId}_win_${p.uid}`,
          });
          p.moneyChange = winShare - r.bet;
          p.exp = cfg.expWinner;
          p.win = true;
        } else {
          p.moneyChange = -r.bet;
          p.exp = cfg.expLoser;
          p.win = false;
        }
      }
    }

    // EXP + stats (once)
    for (const p of r.players) {
      try {
        await addExp(p.uid, p.exp, { source: `xidach_${r.roomId}` });
      } catch (e) {
        console.error("[xd exp]", e?.message);
      }
      updateStats(p.uid, p.name, { win: !!p.win, moneyDelta: p.moneyChange });
    }

    r.ranked = ranked;
    r.paid = true;
    r.settled = true;
    r.status = "FINISHED";
    roomsMem.set(r.roomId, r);
    persistRooms();

    // cleanup maps after short retention
    for (const p of r.players) {
      if (userRoom.get(p.uid) === r.roomId) userRoom.delete(p.uid);
    }
    if (threadRoom.get(r.threadId) === r.roomId) threadRoom.delete(r.threadId);

    return { success: true, room: r };
  });
}

export async function cancelRoom(userId) {
  const key = uid(userId);
  const room = findRoomByUser(key);
  if (!room) return { success: false, error: "Bạn không ở trong sòng nào." };
  if (room.ownerId !== key) return { success: false, error: "Chỉ chủ sòng được hủy." };

  return withRoomLock(room.roomId, async () => {
    const r = roomsMem.get(room.roomId);
    if (!r) return { success: false, error: "Phòng không tồn tại." };
    if (["FINISHED", "CANCELLED"].includes(r.status)) {
      return { success: false, error: "Sòng đã kết thúc." };
    }

    if (r.status === "WAITING") {
      // no money held
    } else if (["DEALING", "PLAYING", "SETTLING"].includes(r.status) && !r.paid) {
      for (const p of r.players) {
        if (p.held) {
          try {
            await TienGame.addMoney(p.uid, r.bet, {
              description: `Xì Dách hủy hoàn ${r.roomId}`,
              transactionId: `${r.transactionId}_cancel_${p.uid}`,
            });
            p.held = false;
          } catch (e) {
            console.error("[xd cancel refund]", e?.message);
          }
        }
      }
    }

    r.status = "CANCELLED";
    roomsMem.set(r.roomId, r);
    persistRooms();
    for (const p of r.players) {
      if (userRoom.get(p.uid) === r.roomId) userRoom.delete(p.uid);
    }
    if (threadRoom.get(r.threadId) === r.roomId) threadRoom.delete(r.threadId);
    return { success: true, room: r };
  });
}

/* ─── Text UI ─────────────────────────────────────────────── */

export function roomLobbyText(room) {
  const seats = [];
  for (let i = 0; i < 5; i++) {
    const p = room.players[i];
    seats.push(p ? `👤 ${p.name}` : "⭕ Ghế trống");
  }
  return [
    "╭━━━━━━━━━━━━━━━━━━━━╮",
    "│  🎰  XÌ DÁCH  🎰",
    "│",
    `│  🎲 Phòng: ${room.roomId}`,
    `│  👑 Chủ sòng: ${room.ownerName}`,
    `│  💰 Cược: ${fmt(room.bet)}`,
    `│  👥 Người chơi: ${room.players.length}/5`,
    "│",
    ...seats.map((s) => `│  ${s}`),
    "│",
    "│  📩 Reply tin nhắn này để tham gia",
    "│  🎴 Chủ sòng: .xd start",
    "╰━━━━━━━━━━━━━━━━━━━━╯",
  ].join("\n");
}

export function handCaption(player) {
  const labels = (player.cards || []).map(cardLabel).join(" + ");
  const lines = [
    "🎴 XÌ DÁCH — BÀI CỦA BẠN",
    "──────────────",
    `🃏 ${labels}`,
    `🎯 Điểm: ${player.points}`,
  ];
  if (player.handType === "xiban") lines.push("🌟 XÌ BÀN!");
  else if (player.handType === "xidach") lines.push("🌟 XÌ DÁCH!");
  else if (player.handType === "quac") lines.push("💥 QUẮC!");
  else {
    lines.push("");
    lines.push("👉 Reply: rut — rút thêm");
    lines.push("👉 Reply: dung — dừng");
  }
  return lines.join("\n");
}

export function resultBoardText(room) {
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  const lines = ["╭━━ 🎰 XÌ DÁCH — KẾT QUẢ ━━╮", ""];
  const ranked = room.ranked || [...room.players].sort((a, b) => (a.place || 99) - (b.place || 99));

  ranked.forEach((p, i) => {
    const med = medals[i] || `${i + 1}.`;
    const cards = (p.cards || []).map(cardLabel).join(" + ");
    lines.push(`${med} ${p.name}`);
    lines.push(`   🃏 ${cards}`);
    if (p.handType === "quac") lines.push(`   💥 QUẮC — ${p.points} điểm`);
    else lines.push(`   🎴 ${p.handLabel} · ${p.points} điểm`);
    const moneyStr =
      p.moneyChange > 0
        ? `💰 +${fmt(p.moneyChange)}`
        : p.moneyChange < 0
          ? `💰 ${fmt(p.moneyChange)}`
          : `💰 0`;
    lines.push(`   ${moneyStr}  ⭐ +${p.exp} EXP`);
    lines.push("");
  });
  lines.push(`🎰 Phòng: ${room.roomId}`);
  lines.push("╰━━━━━━━━━━━━━━━━━━━━╯");
  return lines.join("\n");
}

export function rankBoardText(list) {
  const medals = ["🥇", "🥈", "🥉"];
  const lines = ["🏆 TOP 15 XÌ DÁCH", "──────────────", ""];
  if (!list.length) {
    lines.push("Chưa có dữ liệu xếp hạng.");
    return lines.join("\n");
  }
  list.forEach((s, i) => {
    const med = medals[i] || `${i + 1}.`;
    lines.push(`${med} ${s.name}`);
    lines.push(`   🏆 ${s.wins} trận thắng · 💰 ${fmt(s.moneyNet)}`);
    lines.push("");
  });
  return lines.join("\n");
}

export { cardLabel };
