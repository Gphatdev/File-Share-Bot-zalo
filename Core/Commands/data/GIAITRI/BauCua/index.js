import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TienGame from "../TienGame/index.js";
import { addExp } from "../PlayerProfile/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.join(__dirname, "history.json");
const SESSION_TTL_MS = 3 * 60 * 1000;

export const ANIMALS = [
  { id: 1, key: "bau", name: "BẦU", icon: "🎃", aliases: ["bau", "bầu", "1"] },
  { id: 2, key: "cua", name: "CUA", icon: "🦀", aliases: ["cua", "2"] },
  { id: 3, key: "tom", name: "TÔM", icon: "🦐", aliases: ["tom", "tôm", "3"] },
  { id: 4, key: "ca", name: "CÁ", icon: "🐟", aliases: ["ca", "cá", "4"] },
  { id: 5, key: "ga", name: "GÀ", icon: "🐓", aliases: ["ga", "gà", "5"] },
  { id: 6, key: "nai", name: "NAI", icon: "🦌", aliases: ["nai", "6"] },
];

const sessions = new Map(); // key: userId|threadId
const locks = new Map();

function sKey(uid, tid) {
  return `${uid}|${tid}`;
}

function uid(v) {
  return String(v || "").trim();
}

export function fmt(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function parseAnimal(input) {
  const n = normalizeText(input);
  if (!n) return null;
  for (const a of ANIMALS) {
    if (a.aliases.some((al) => normalizeText(al) === n)) return a;
    if (normalizeText(a.name) === n) return a;
    if (normalizeText(a.key) === n) return a;
  }
  return null;
}

export function rollThree() {
  const faces = [];
  for (let i = 0; i < 3; i++) {
    faces.push(ANIMALS[Math.floor(Math.random() * ANIMALS.length)]);
  }
  return faces;
}

function randExp(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function withLock(key, task) {
  const k = String(key);
  const prev = locks.get(k) || Promise.resolve();
  let release;
  const next = new Promise((r) => {
    release = r;
  });
  locks.set(k, next);
  await prev;
  try {
    return await task();
  } finally {
    if (locks.get(k) === next) locks.delete(k);
    release();
  }
}

function appendHistory(entry) {
  try {
    let list = [];
    if (fs.existsSync(HISTORY_PATH)) {
      list = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8") || "[]");
      if (!Array.isArray(list)) list = [];
    }
    list.push(entry);
    while (list.length > 300) list.shift();
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    const tmp = `${HISTORY_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, HISTORY_PATH);
  } catch (e) {
    console.error("[bcua] history:", e?.message);
  }
}

export function getSession(userId, threadId) {
  const key = sKey(uid(userId), threadId);
  const s = sessions.get(key);
  if (!s) return null;
  if (s.expiresAt < Date.now() || s.status === "DONE") {
    sessions.delete(key);
    return null;
  }
  return s;
}

export function clearSession(userId, threadId) {
  sessions.delete(sKey(uid(userId), threadId));
}

/**
 * Tạo phiên chờ chọn linh vật. Chưa trừ tiền.
 */
export async function createSession(userId, threadId, bet, mode, userName) {
  const key = uid(userId);
  if (!key) return { success: false, error: "UID không hợp lệ." };

  const amount = Math.floor(Number(bet));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Số tiền cược phải là số nguyên dương." };
  }
  if (amount < 1000) {
    return { success: false, error: "Cược tối thiểu 1.000." };
  }

  const isX2 = mode === "x2";
  const holdNeed = isX2 ? amount * 2 : amount;
  const balance = await TienGame.getBalance(key);

  if (balance < holdNeed) {
    return {
      success: false,
      error: isX2
        ? `Chế độ x2 cần ít nhất ${fmt(holdNeed)} (gấp đôi cược). Bạn có ${fmt(balance)}.`
        : `Số dư không đủ. Bạn có ${fmt(balance)}, cần ${fmt(amount)}.`,
    };
  }

  // Một UID một phiên / thread
  const sk = sKey(key, threadId);
  const existing = sessions.get(sk);
  if (existing && existing.status === "WAITING" && existing.expiresAt > Date.now()) {
    return {
      success: false,
      error: "Bạn đang có bàn Bầu Cua chờ chọn. Hãy reply bàn đó hoặc đợi hết hạn (~3 phút).",
    };
  }

  const session = {
    sessionId: randomUUID().slice(0, 8),
    userId: key,
    threadId: String(threadId),
    userName: userName || "Người chơi",
    bet: amount,
    mode: isX2 ? "x2" : "normal",
    holdNeed,
    status: "WAITING",
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    processing: false,
  };
  sessions.set(sk, session);

  return { success: true, session, balance };
}

/**
 * Xử lý lựa chọn + tung + thanh toán (atomic).
 */
export async function resolveChoice(userId, threadId, animalInput) {
  const key = uid(userId);
  const sk = sKey(key, threadId);

  return withLock(sk, async () => {
    const session = sessions.get(sk);
    if (!session || session.expiresAt < Date.now()) {
      sessions.delete(sk);
      return { success: false, error: "Phiên đã hết hạn hoặc không tồn tại. Gõ .bcua [tiền] để mở bàn mới." };
    }
    if (session.userId !== key) {
      return { success: false, error: "Bạn không phải chủ phiên này." };
    }
    if (session.status !== "WAITING" || session.processing) {
      return { success: false, error: "Phiên đã được xử lý hoặc đang xử lý." };
    }

    const animal = parseAnimal(animalInput);
    if (!animal) {
      return {
        success: false,
        error: "Lựa chọn không hợp lệ. Reply: Bầu/Cua/Tôm/Cá/Gà/Nai hoặc số 1–6.",
        keepSession: true,
      };
    }

    session.processing = true;
    session.status = "RUNNING";

    const isX2 = session.mode === "x2";
    const bet = session.bet;
    const holdNeed = isX2 ? bet * 2 : bet;

    // Giữ tiền
    try {
      await TienGame.removeMoney(key, holdNeed, {
        description: `Bầu Cua ${session.mode} giữ ${session.sessionId}`,
      });
    } catch (err) {
      sessions.delete(sk);
      return { success: false, error: err.message || "Không thể trừ tiền cược." };
    }

    const faces = rollThree();
    const hits = faces.filter((f) => f.id === animal.id).length;
    const won = hits > 0;

    let payout = 0; // số tiền cộng lại vào ví
    let netChange = 0;
    let reward = 0;

    if (isX2) {
      // Đã giữ 2*bet
      if (won) {
        // Net +bet → hoàn 2*bet + thưởng bet = 3*bet
        payout = bet * 3;
        reward = bet;
        netChange = bet;
        try {
          await TienGame.addMoney(key, payout, {
            description: `Bầu Cua x2 thắng ${session.sessionId}`,
          });
        } catch (e) {
          console.error("[bcua x2 pay]", e?.message);
        }
      } else {
        // Giữ 2*bet → net -2*bet
        payout = 0;
        reward = 0;
        netChange = -holdNeed;
      }
    } else {
      // Đã giữ bet
      if (won) {
        // Trả: bet (hoàn) + bet * hits (thưởng mỗi lần)
        payout = bet + bet * hits;
        reward = bet * hits;
        netChange = reward;
        try {
          await TienGame.addMoney(key, payout, {
            description: `Bầu Cua thắng x${hits} ${session.sessionId}`,
          });
        } catch (e) {
          console.error("[bcua pay]", e?.message);
        }
      } else {
        payout = 0;
        reward = 0;
        netChange = -bet;
      }
    }

    const expGain = isX2 ? randExp(50, 75) : randExp(30, 45);
    try {
      await addExp(key, expGain, { source: `bcua_${session.mode}` });
    } catch (e) {
      console.error("[bcua exp]", e?.message);
    }

    const balance = await TienGame.getBalance(key);

    const result = {
      success: true,
      sessionId: session.sessionId,
      userName: session.userName,
      mode: session.mode,
      bet,
      animal,
      faces,
      hits,
      won,
      reward,
      netChange,
      payout,
      holdNeed,
      expGain,
      balance,
    };

    appendHistory({
      ...result,
      faces: faces.map((f) => f.key),
      animal: animal.key,
      userId: key,
      at: Date.now(),
    });

    sessions.delete(sk);
    return result;
  });
}

export function boardMessage(session, balance) {
  const isX2 = session.mode === "x2";
  const lines = [
    "╭━━━━━━━ 🎲 ━━━━━━━╮",
    "│",
    isX2 ? "│ 🎊 BÀN BẦU CUA · X2" : "│ 🎊 BÀN BẦU CUA",
    "│ ━━━━━━━━━━━━━━━",
    "│",
  ];
  for (const a of ANIMALS) {
    lines.push(`│ ${a.icon} ${a.id}. ${a.name}`);
  }
  lines.push(
    "│",
    "│ ━━━━━━━━━━━━━━━",
    `│ 💰 Tiền cược: ${fmt(session.bet)}`,
  );
  if (isX2) {
    lines.push(
      `│ ⚠️ Rủi ro x2: cần ${fmt(session.holdNeed)}`,
      "│ 🎉 Thắng: +cược  ·  💥 Thua: −2×cược"
    );
  }
  lines.push(
    `│ ✨ EXP: ${isX2 ? "50–75" : "30–45"}`,
    `│ 👛 Số dư: ${fmt(balance)}`,
    "│ ⏳ Chờ lựa chọn",
    "│",
    "│ 📩 Reply tin này bằng tên hoặc số",
    "│    (vd: Cua / 2 / Bầu / 1)",
    "│",
    "╰━━━━━━━━━━━━━━━━━━╯",
    `👤 Người chơi: ${session.userName}`
  );
  return lines.join("\n");
}

export function resultMessage(res) {
  const faceStr = res.faces.map((f) => f.icon).join(" ");
  const lines = [];

  if (res.won) {
    lines.push(
      "╭━━━━━━ 🏆 ━━━━━━╮",
      "│",
      res.mode === "x2" ? "│ 🎉 BẦU CUA X2 — THẮNG!" : "│ 🎉 BẦU CUA — CHIẾN THẮNG!",
      "│",
      `│ 🎯 Bạn chọn: ${res.animal.icon} ${res.animal.name}`,
      `│ 🎲 Kết quả: ${faceStr}`,
      `│ 🔥 Số lần trúng: ${res.hits}`,
      "│",
      `│ 💰 Tiền cược: ${fmt(res.bet)}`,
      `│ 💵 Tiền thưởng: ${fmt(res.reward)}`,
      `│ 📈 Thay đổi: +${fmt(res.netChange)}`,
      `│ ✨ EXP: +${res.expGain}`,
      "│",
      `│ 👛 Số dư: ${fmt(res.balance)}`,
      "│ 📌 Hoàn tất",
      "│",
      "╰━━━━━━━━━━━━━━━━━━╯",
      `👤 Người chơi: ${res.userName}`
    );
  } else {
    const lost = res.mode === "x2" ? res.holdNeed : res.bet;
    lines.push(
      "╭━━━━━━ 💥 ━━━━━━╮",
      "│",
      res.mode === "x2" ? "│ 😢 BẦU CUA X2 — THUA" : "│ 😢 BẦU CUA — THUA CUỘC",
      "│",
      `│ 🎯 Bạn chọn: ${res.animal.icon} ${res.animal.name}`,
      `│ 🎲 Kết quả: ${faceStr}`,
      "│ ❌ Không trúng linh vật",
      "│",
      `│ 💸 Mất: ${fmt(lost)}`,
      `│ ✨ EXP: +${res.expGain}`,
      "│",
      `│ 👛 Số dư: ${fmt(res.balance)}`,
      "│ 📌 Hoàn tất",
      "│",
      "╰━━━━━━━━━━━━━━━━━━╯",
      `👤 Người chơi: ${res.userName}`
    );
  }
  return lines.join("\n");
}
