/** In-memory OTT rooms: Map<groupId, Room> */
const rooms = new Map();
const LOCKS = new Map();

export const STATUS = {
  WAITING: "waiting",
  READY: "ready",
  PLAYING: "playing",
  DONE: "done",
};

export const CHOICES = {
  BUA: { id: "BUA", name: "BÚA", icon: "✊" },
  KEO: { id: "KEO", name: "KÉO", icon: "✌️" },
  BAO: { id: "BAO", name: "BAO", icon: "✋" },
};

export function normalizeChoice(text) {
  const t = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
  if (["bua", "búa", "rock", "dam"].includes(t) || t === "1") return "BUA";
  if (["keo", "kéo", "scissors", "keo"].includes(t) || t === "2") return "KEO";
  if (["bao", "paper", "la"].includes(t) || t === "3") return "BAO";
  return null;
}

export function decideWinner(c1, c2) {
  if (c1 === c2) return "DRAW";
  if (
    (c1 === "BUA" && c2 === "KEO") ||
    (c1 === "KEO" && c2 === "BAO") ||
    (c1 === "BAO" && c2 === "BUA")
  )
    return "P1";
  return "P2";
}

async function withGroupLock(groupId, fn) {
  const key = String(groupId);
  const prev = LOCKS.get(key) || Promise.resolve();
  let release;
  const next = new Promise((r) => { release = r; });
  LOCKS.set(key, next);
  await prev;
  try {
    return await fn();
  } finally {
    if (LOCKS.get(key) === next) LOCKS.delete(key);
    release();
  }
}

export function getRoom(groupId) {
  return rooms.get(String(groupId)) || null;
}

export function deleteRoom(groupId) {
  const r = rooms.get(String(groupId));
  if (r?.timeoutId) {
    try { clearTimeout(r.timeoutId); } catch {}
  }
  rooms.delete(String(groupId));
}

export async function createRoom(groupId, host) {
  return withGroupLock(groupId, async () => {
    const existing = rooms.get(String(groupId));
    if (existing && existing.status !== STATUS.DONE) {
      return { ok: false, existing };
    }
    const room = {
      roomId: `ott_${groupId}_${Date.now()}`,
      groupId: String(groupId),
      messageId: null,
      cliMsgId: null,
      hostId: String(host.uid),
      players: [
        {
          uid: String(host.uid),
          name: host.name || "Người chơi",
          avatar: host.avatar || null,
        },
      ],
      status: STATUS.WAITING,
      createdAt: Date.now(),
      startedAt: null,
      choices: {},
      timeoutId: null,
    };
    rooms.set(String(groupId), room);
    return { ok: true, room };
  });
}

export async function setRoomMessageIds(groupId, messageId, cliMsgId) {
  return withGroupLock(groupId, async () => {
    const room = rooms.get(String(groupId));
    if (!room) return null;
    if (messageId != null) room.messageId = String(messageId);
    if (cliMsgId != null) room.cliMsgId = String(cliMsgId);
    return room;
  });
}

export async function joinRoom(groupId, player, messageId) {
  return withGroupLock(groupId, async () => {
    const room = rooms.get(String(groupId));
    if (!room) return { ok: false, code: "NO_ROOM" };
    if (room.status !== STATUS.WAITING && room.status !== STATUS.READY) {
      return { ok: false, code: "NOT_JOINABLE", room };
    }
    // messageId check
    const mid = messageId != null ? String(messageId) : null;
    if (room.messageId && mid && mid !== String(room.messageId) && mid !== String(room.cliMsgId || "")) {
      return { ok: false, code: "WRONG_MSG" };
    }
    const uid = String(player.uid);
    if (room.players.some((p) => p.uid === uid)) {
      return { ok: false, code: "ALREADY", room };
    }
    if (room.players.length >= 2) {
      return { ok: false, code: "FULL", room };
    }
    room.players.push({
      uid,
      name: player.name || "Người chơi",
      avatar: player.avatar || null,
    });
    if (room.players.length >= 2) room.status = STATUS.READY;
    return { ok: true, room };
  });
}

export async function startRoom(groupId, requesterId) {
  return withGroupLock(groupId, async () => {
    const room = rooms.get(String(groupId));
    if (!room) return { ok: false, code: "NO_ROOM" };
    if (String(requesterId) !== String(room.hostId)) {
      return { ok: false, code: "NOT_HOST", room };
    }
    if (room.players.length < 2) {
      return { ok: false, code: "NEED_PLAYERS", room };
    }
    if (room.status === STATUS.PLAYING) {
      return { ok: false, code: "ALREADY_STARTED", room };
    }
    room.status = STATUS.PLAYING;
    room.startedAt = Date.now();
    room.choices = {};
    return { ok: true, room };
  });
}

export async function setChoice(groupId, uid, choice) {
  return withGroupLock(groupId, async () => {
    const room = rooms.get(String(groupId));
    if (!room || room.status !== STATUS.PLAYING) {
      return { ok: false, code: "NO_PLAY" };
    }
    const id = String(uid);
    if (!room.players.some((p) => p.uid === id)) {
      return { ok: false, code: "NOT_PLAYER" };
    }
    if (room.choices[id]) {
      return { ok: false, code: "ALREADY_CHOSEN", choice: room.choices[id] };
    }
    room.choices[id] = choice;
    const both =
      room.players.length === 2 &&
      room.players.every((p) => room.choices[p.uid]);
    return { ok: true, room, both };
  });
}

export async function cancelRoom(groupId, requesterId, isAdmin = false) {
  return withGroupLock(groupId, async () => {
    const room = rooms.get(String(groupId));
    if (!room) return { ok: false, code: "NO_ROOM" };
    if (!isAdmin && String(requesterId) !== String(room.hostId)) {
      return { ok: false, code: "NOT_HOST", room };
    }
    if (room.timeoutId) {
      try { clearTimeout(room.timeoutId); } catch {}
    }
    rooms.delete(String(groupId));
    return { ok: true, room };
  });
}

export function setRoomTimeout(groupId, timeoutId) {
  const room = rooms.get(String(groupId));
  if (room) room.timeoutId = timeoutId;
}

export function isHeartIcon(icon) {
  if (!icon) return false;
  const s = String(icon).trim();
  // emoji variants + possible type codes
  const hearts = new Set([
    "❤", "❤️", "♥", "♥️", "💕", "💗", "💖", "💘", "💝",
    "/-heart", "heart", "HEART", "r/heart",
  ]);
  if (hearts.has(s)) return true;
  // contains heart emoji
  if (/❤|♥|💕|💗|💖/.test(s)) return true;
  return false;
}

export function extractReactionMeta(reaction) {
  const data = reaction?.data || reaction || {};
  const threadId = String(reaction?.threadId || data.threadId || "");
  const uid = String(
    data.uidFrom || data.reactorId || data.userId || data.idTo || ""
  );
  // zca-mt: data.content = { rMsg:[{gMsgID,cMsgID}], rIcon, rType }. data.msgId/cliMsgId là id của CHÍNH sự kiện
  // reaction, KHÔNG phải tin nhắn được thả tim -> chỉ dùng khi không có rMsg.
  const content = data.content && typeof data.content === "object" ? data.content : {};
  const targets = Array.isArray(content.rMsg) ? content.rMsg : [];
  const ids = new Set();
  for (const t of targets) { for (const v of [t?.gMsgID, t?.cMsgID, t?.msgId, t?.cliMsgId]) if (v != null && v !== "") ids.add(String(v)); }
  if (!ids.size) for (const v of [data.rMsgId, data.rCliMsgId, data.msgId, data.cliMsgId]) if (v != null && v !== "") ids.add(String(v));
  const msgId = targets[0]?.gMsgID != null ? String(targets[0].gMsgID) : (data.rMsgId != null ? String(data.rMsgId) : (data.msgId != null ? String(data.msgId) : null));
  const cliMsgId = targets[0]?.cMsgID != null ? String(targets[0].cMsgID) : (data.rCliMsgId != null ? String(data.rCliMsgId) : (data.cliMsgId != null ? String(data.cliMsgId) : null));
  const icon = content.rIcon || data.rIcon || data.icon || data.reaction || data.emoji || "";
  const name = data.dName || data.displayName || data.name || "Người chơi";
  return { threadId, uid, msgId, cliMsgId, msgIds: [...ids], icon, name, data };
}


export function findPlayingByUid(uid) {
  const id = String(uid);
  for (const room of rooms.values()) {
    if (room.status !== STATUS.PLAYING) continue;
    if (room.players.some((p) => p.uid === id)) return room;
  }
  return null;
}

export function listActiveRooms() {
  return [...rooms.values()];
}
