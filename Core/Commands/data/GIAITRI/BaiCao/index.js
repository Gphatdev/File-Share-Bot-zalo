import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import TienGame from "../TienGame/index.js";
import { addExp } from "../PlayerProfile/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "config.json");
const MAP_PATH = path.join(__dirname, "cards_map.json");
const ROOMS_PATH = path.join(__dirname, "rooms.json");
const STATS_PATH = path.join(__dirname, "stats.json");
const HISTORY_PATH = path.join(__dirname, "history.json");

const ROOM_LOCKS = new Map();
const roomsMem = new Map(); // roomId -> room
const threadRoom = new Map(); // threadId -> roomId
const userRoom = new Map(); // userId -> roomId

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
    readyTimeoutMs: 180000,
    expWinner: 80,
    expLoser: 40,
    cardsDir: "cards",
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

function now() {
  return Date.now();
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
  const n = Math.floor(1000 + Math.random() * 9000);
  return `BC-${n}`;
}

function loadCardMap() {
  return readJson(MAP_PATH, {});
}

export function getCardsDir() {
  const cfg = getConfig();
  return path.join(__dirname, cfg.cardsDir || "cards");
}

/** Resolve local image path for a card key like A_co */
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
  const missing = [];
  for (const key of keys) {
    if (!resolveCardImage(key)) missing.push(key);
  }
  return { ok: missing.length === 0, total: keys.length, missing };
}

function cardPoint(rank) {
  const r = String(rank).toUpperCase();
  if (r === "A") return 1;
  if (["10", "J", "Q", "K"].includes(r)) return 0;
  const n = Number(r);
  return Number.isFinite(n) ? n : 0;
}

export function calcNut(cards) {
  let sum = 0;
  for (const c of cards) sum += cardPoint(c.rank);
  return sum % 10;
}

function buildDeck() {
  const map = loadCardMap();
  return Object.keys(map).map((key) => {
    const e = map[key];
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

function persistRooms() {
  const obj = {};
  for (const [id, r] of roomsMem) {
    // strip hands from disk for security? keep for restart recovery but redact in logs
    obj[id] = r;
  }
  writeJson(ROOMS_PATH, obj);
}

function loadRoomsFromDisk() {
  const data = readJson(ROOMS_PATH, {});
  for (const [id, r] of Object.entries(data)) {
    if (!r || ["FINISHED", "CANCELLED"].includes(r.status)) continue;
    // On restart: cancel dealing rooms to avoid stuck money — refund if held
    if (["DEALING", "WAITING_READY", "STARTING", "REVEALING"].includes(r.status)) {
      r.status = "CANCELLED";
      r.cancelReason = "Bot restart — phòng đang chơi đã hủy";
    }
    roomsMem.set(id, r);
    if (r.threadId) threadRoom.set(String(r.threadId), id);
    for (const p of r.players || []) {
      if (p.uid) userRoom.set(p.uid, id);
    }
  }
}
loadRoomsFromDisk();

function getStats() {
  return readJson(STATS_PATH, {});
}
function saveStats(s) {
  writeJson(STATS_PATH, s);
}

function updatePlayerStats(userId, { win, moneyChange, exp }) {
  const stats = getStats();
  const k = uid(userId);
  if (!stats[k]) {
    stats[k] = {
      userId: k,
      name: "",
      plays: 0,
      wins: 0,
      losses: 0,
      totalWinMoney: 0,
      totalLoseMoney: 0,
      totalExp: 0,
    };
  }
  const s = stats[k];
  s.plays += 1;
  if (win) {
    s.wins += 1;
    if (moneyChange > 0) s.totalWinMoney += moneyChange;
  } else {
    s.losses += 1;
    if (moneyChange < 0) s.totalLoseMoney += Math.abs(moneyChange);
  }
  s.totalExp += exp || 0;
  stats[k] = s;
  saveStats(stats);
}

export function getRankList(limit = 10) {
  const stats = getStats();
  return Object.values(stats)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return (b.totalWinMoney || 0) - (a.totalWinMoney || 0);
    })
    .slice(0, limit);
}

export function findRoomByThread(threadId) {
  const id = threadRoom.get(String(threadId));
  if (!id) return null;
  return roomsMem.get(id) || null;
}

export function findRoomByUser(userId) {
  const id = userRoom.get(uid(userId));
  if (!id) return null;
  return roomsMem.get(id) || null;
}

export function getRoom(roomId) {
  return roomsMem.get(roomId) || null;
}

export async function createRoom(ownerId, ownerName, threadId, betAmount) {
  const cfg = getConfig();
  const key = uid(ownerId);
  if (!key) return { success: false, error: "UID không hợp lệ." };

  const existing = findRoomByUser(key);
  if (existing && !["FINISHED", "CANCELLED"].includes(existing.status)) {
    return {
      success: false,
      error: `Bạn đang ở phòng ${existing.roomId}. Hủy hoặc hoàn thành trước.`,
    };
  }

  const threadExisting = findRoomByThread(threadId);
  if (threadExisting && !["FINISHED", "CANCELLED"].includes(threadExisting.status)) {
    return {
      success: false,
      error: `Nhóm này đang có sòng ${threadExisting.roomId}. Hủy trước khi mở sòng mới.`,
    };
  }

  let bet = Math.floor(Number(betAmount ?? cfg.defaultBet));
  if (!Number.isFinite(bet) || bet <= 0) bet = cfg.defaultBet;
  if (bet < cfg.minBet) return { success: false, error: `Cược tối thiểu ${fmt(cfg.minBet)}.` };
  if (bet > cfg.maxBet) return { success: false, error: `Cược tối đa ${fmt(cfg.maxBet)}.` };

  const balance = await TienGame.getBalance(key);
  if (balance < bet) {
    return { success: false, error: `Số dư không đủ. Cần ${fmt(bet)}, bạn có ${fmt(balance)}.` };
  }

  const roomId = nextRoomId();
  const room = {
    roomId,
    threadId: String(threadId),
    ownerId: key,
    bet,
    status: "WAITING",
    players: [
      {
        uid: key,
        name: ownerName || "Chủ sòng",
        seat: 1,
        ready: false,
        cards: null,
        points: null,
        held: false,
        moneyChange: 0,
        exp: 0,
      },
    ],
    createdAt: now(),
    startedAt: null,
    finishedAt: null,
    transactionId: null,
    paid: false,
  };

  roomsMem.set(roomId, room);
  threadRoom.set(String(threadId), roomId);
  userRoom.set(key, roomId);
  persistRooms();

  return { success: true, room };
}

export async function joinRoom(userId, userName, threadId) {
  const key = uid(userId);
  const cfg = getConfig();

  const already = findRoomByUser(key);
  if (already && !["FINISHED", "CANCELLED"].includes(already.status)) {
    if (already.threadId === String(threadId)) {
      return { success: false, error: "Bạn đã ở trong sòng này rồi.", room: already };
    }
    return { success: false, error: `Bạn đang ở phòng ${already.roomId}.` };
  }

  const room = findRoomByThread(threadId);
  if (!room || ["FINISHED", "CANCELLED"].includes(room.status)) {
    return { success: false, error: "Không có sòng đang mở trong nhóm này. Dùng .baicao tp để mở." };
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
      ready: false,
      cards: null,
      points: null,
      held: false,
      moneyChange: 0,
      exp: 0,
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

  return withRoomLock(room.roomId, async () => {
    const r = roomsMem.get(room.roomId);
    if (!r) return { success: false, error: "Phòng không tồn tại." };
    if (r.status !== "WAITING") {
      return { success: false, error: `Sòng đang ở trạng thái ${r.status}, không thể start.` };
    }
    if (r.players.length < cfg.minPlayers) {
      return { success: false, error: `Cần ít nhất ${cfg.minPlayers} người. Hiện: ${r.players.length}.` };
    }

    // Verify balances
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
    for (const p of r.players) {
      try {
        await TienGame.removeMoney(p.uid, r.bet, {
          description: `Bài Cào giữ cược ${r.roomId}`,
        });
        p.held = true;
      } catch (err) {
        // refund already held
        for (const q of r.players) {
          if (q.held) {
            try {
              await TienGame.addMoney(q.uid, r.bet, { description: `Bài Cào hoàn lỗi ${r.roomId}` });
              q.held = false;
            } catch {
              /* ignore */
            }
          }
        }
        return { success: false, error: `Không giữ được tiền của ${p.name}: ${err.message}` };
      }
    }

    r.status = "DEALING";
    r.startedAt = now();
    r.transactionId = `BC-${r.roomId}-${randomUUID().slice(0, 6)}`;

    let deck = shuffle(buildDeck());
    if (deck.length < r.players.length * 3) {
      return { success: false, error: "Bộ bài không đủ lá." };
    }

    for (const p of r.players) {
      p.cards = [deck.pop(), deck.pop(), deck.pop()];
      p.points = calcNut(p.cards);
      p.ready = false;
    }

    r.status = "WAITING_READY";
    r.readyDeadline = now() + (cfg.readyTimeoutMs || 180000);
    roomsMem.set(r.roomId, r);
    persistRooms();

    return {
      success: true,
      room: r,
      deckImagesOk: deckCheck.ok,
      missingImages: deckCheck.missing,
    };
  });
}

export async function playerReady(userId) {
  const key = uid(userId);
  const room = findRoomByUser(key);
  if (!room) return { success: false, error: "Bạn không ở trong sòng." };

  return withRoomLock(room.roomId, async () => {
    const r = roomsMem.get(room.roomId);
    if (!r || r.status !== "WAITING_READY") {
      return { success: false, error: "Chưa đến lúc xác nhận bài." };
    }
    const p = r.players.find((x) => x.uid === key);
    if (!p) return { success: false, error: "Bạn không thuộc sòng này." };
    if (p.ready) return { success: false, error: "Bạn đã sẵn sàng rồi.", already: true, room: r };

    p.ready = true;
    roomsMem.set(r.roomId, r);
    persistRooms();

    const readyCount = r.players.filter((x) => x.ready).length;
    const allReady = readyCount === r.players.length;

    return {
      success: true,
      room: r,
      player: p,
      readyCount,
      total: r.players.length,
      allReady,
    };
  });
}

/**
 * Reveal, rank, pay, exp. Call when all ready.
 */
export async function settleRoom(roomId) {
  return withRoomLock(roomId, async () => {
    const r = roomsMem.get(roomId);
    if (!r) return { success: false, error: "Phòng không tồn tại." };
    if (r.paid || r.status === "FINISHED") {
      return { success: false, error: "Ván đã thanh toán." };
    }
    if (r.status !== "WAITING_READY" && r.status !== "REVEALING") {
      return { success: false, error: "Chưa thể công bố kết quả." };
    }

    r.status = "REVEALING";
    const cfg = getConfig();

    // Sort by points desc
    const ranked = [...r.players].sort((a, b) => {
      if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
      return a.seat - b.seat;
    });

    const pot = r.bet * r.players.length;
    const topScore = ranked[0]?.points ?? 0;
    const winners = ranked.filter((p) => p.points === topScore);
    const winShare = Math.floor(pot / winners.length);
    let distributed = 0;

    for (const p of r.players) {
      const isWin = winners.some((w) => w.uid === p.uid);
      if (isWin) {
        p.moneyChange = winShare - r.bet; // net
        p.exp = cfg.expWinner;
        try {
          await TienGame.addMoney(p.uid, winShare, {
            description: `Bài Cào thắng ${r.roomId}`,
          });
        } catch (e) {
          console.error("[baicao pay]", e?.message);
        }
        distributed += winShare;
      } else {
        p.moneyChange = -r.bet;
        p.exp = cfg.expLoser;
        // bet already held
      }
      try {
        await addExp(p.uid, p.exp, { source: `baicao_${r.roomId}` });
      } catch (e) {
        console.error("[baicao exp]", e?.message);
      }
      updatePlayerStats(p.uid, {
        win: isWin,
        moneyChange: p.moneyChange,
        exp: p.exp,
      });
      const st = getStats();
      if (st[p.uid]) {
        st[p.uid].name = p.name;
        saveStats(st);
      }
    }

    r.ranked = ranked.map((p, i) => ({
      rank: i + 1,
      uid: p.uid,
      name: p.name,
      points: p.points,
      cards: p.cards,
      moneyChange: p.moneyChange,
      exp: p.exp,
      seat: p.seat,
    }));
    // fix ranks for ties
    let prevPts = null;
    let prevRank = 0;
    r.ranked.forEach((row, i) => {
      if (prevPts === row.points) row.rank = prevRank;
      else {
        row.rank = i + 1;
        prevRank = row.rank;
        prevPts = row.points;
      }
    });

    r.paid = true;
    r.status = "FINISHED";
    r.finishedAt = now();
    roomsMem.set(r.roomId, r);
    persistRooms();

    // free user maps
    for (const p of r.players) userRoom.delete(p.uid);
    threadRoom.delete(String(r.threadId));

    writeJson(HISTORY_PATH, [
      ...readJson(HISTORY_PATH, []).slice(-100),
      {
        roomId: r.roomId,
        bet: r.bet,
        players: r.ranked,
        at: r.finishedAt,
      },
    ]);

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
      return { success: false, error: "Sòng đã kết thúc / đã hủy." };
    }
    if (r.paid) return { success: false, error: "Đã thanh toán, không hủy được." };

    const refunds = [];
    for (const p of r.players) {
      if (p.held) {
        try {
          await TienGame.addMoney(p.uid, r.bet, {
            description: `Bài Cào hoàn hủy ${r.roomId}`,
          });
          refunds.push({ name: p.name, amount: r.bet });
          p.held = false;
        } catch (e) {
          console.error("[baicao refund]", e?.message);
        }
      }
    }

    r.status = "CANCELLED";
    r.finishedAt = now();
    roomsMem.set(r.roomId, r);
    persistRooms();

    for (const p of r.players) userRoom.delete(p.uid);
    threadRoom.delete(String(r.threadId));

    return { success: true, room: r, refunds };
  });
}

export function roomLobbyText(room) {
  const cfg = getConfig();
  const lines = [
    "╭━━━━ 🃏 BÀI CÀO ━━━━╮",
    "│",
    "│  🎰 SÒNG BÀI",
    `│  🆔 Phòng: ${room.roomId}`,
    `│  💰 Mức cược: ${fmt(room.bet)}`,
    `│  👥 Người chơi: ${room.players.length}/${cfg.maxPlayers}`,
    "│",
  ];
  for (let i = 1; i <= cfg.maxPlayers; i++) {
    const p = room.players.find((x) => x.seat === i);
    if (p) {
      const crown = p.uid === room.ownerId ? " 👑" : "";
      lines.push(`│  🪑 Ghế ${String(i).padStart(2, "0")} — ${p.name}${crown}`);
    } else {
      lines.push(`│  🪑 Ghế ${String(i).padStart(2, "0")} — Trống`);
    }
  }
  lines.push(
    "│",
    `│  🎲 Trạng thái: ${statusLabel(room.status)}`,
    "│",
    "│  📩 Reply: tham gia / join",
    "│  👑 Chủ sòng: .baicao start",
    "│",
    "╰━━━━━━━━━━━━━━━━╯"
  );
  return lines.join("\n");
}

function statusLabel(s) {
  const m = {
    WAITING: "ĐANG CHỜ",
    DEALING: "ĐANG CHIA BÀI",
    WAITING_READY: "CHỜ ÚP BÀI",
    REVEALING: "ĐANG LẬT BÀI",
    FINISHED: "KẾT THÚC",
    CANCELLED: "ĐÃ HỦY",
  };
  return m[s] || s;
}

export function readyProgressText(room, playerName) {
  const ready = room.players.filter((p) => p.ready).length;
  const total = room.players.length;
  const dots = Array.from({ length: total }, (_, i) => (i < ready ? "🟢" : "⚪")).join("");
  return [
    "╭━━━━ 🎴 SÒNG BÀI ━━━━╮",
    "│",
    "│  🔔 NGƯỜI CHƠI ĐÃ SẴN SÀNG!",
    `│  👤 ${playerName}`,
    "│  🃏 Đã úp bài — sẵn sàng ra bài",
    "│",
    `│  ⏳ Tiến độ: ${dots} ${ready}/${total}`,
    "│",
    "╰━━━━━━━━━━━━━━━━╯",
    `🎰 Bàn: ${room.roomId}`,
  ].join("\n");
}

export function resultBoardText(room) {
  const medal = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  const lines = [
    "╭━━━ 🏆 KẾT QUẢ BÀI CÀO ━━━╮",
    "│",
    `│  🎰 SÒNG ${room.roomId}`,
    `│  💰 Mức cược: ${fmt(room.bet)}`,
    "│",
  ];
  for (const row of room.ranked || []) {
    const icon = medal[(row.rank || 1) - 1] || "🎴";
    const money =
      row.moneyChange >= 0
        ? `💰 +${fmt(row.moneyChange)}`
        : `💸 ${fmt(row.moneyChange)}`;
    const cards = (row.cards || []).map((c) => c.label || c.key).join(" ");
    lines.push(
      `│  ${icon} #${row.rank} ${row.name}`,
      `│  🎴 ${row.points} NÚT  ·  ${cards}`,
      `│  ${money}  ·  ✨ +${row.exp} EXP`,
      "│"
    );
  }
  lines.push("╰━━━━━━━━━━━━━━━━━━╯", "🏆 Chúc mừng người chiến thắng!");
  return lines.join("\n");
}

export function handCaption(room, player) {
  const cards = player.cards || [];
  const labels = cards.map((c) => c.label || c.key).join(" · ");
  return [
    "🃏 BÀI CỦA BẠN",
    `🎰 Sòng: ${room.roomId}`,
    `👤 ${player.name}`,
    "",
    `🎴 ${labels}`,
    `🔢 Số nút: ${player.points} NÚT`,
    "",
    "📩 Reply tin này:",
    "👉 úp   hoặc   up",
    "",
    "⚠️ Xác nhận khi sẵn sàng ra bài",
  ].join("\n");
}
