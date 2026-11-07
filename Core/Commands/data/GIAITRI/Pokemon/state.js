/**
 * Phiên chờ-trả-lời (theo uid|thread) và phòng Solo — trong bộ nhớ, tự dọn khi quá hạn.
 */
import { CONFIG } from "./config.js";

const STATE_TTL = CONFIG.battle.sessionTtlMs;
const userStates = new Map(); // key: uid|tid
const soloRooms = new Map();  // key: roomId

const sk = (uid, tid) => `${uid}|${tid}`;

export function setState(uid, tid, data) {
  userStates.set(sk(uid, tid), { ...data, expiresAt: Date.now() + STATE_TTL });
}
export function getState(uid, tid) {
  const key = sk(uid, tid);
  const d = userStates.get(key);
  if (!d) return null;
  if (d.expiresAt < Date.now()) { userStates.delete(key); return null; }
  return d;
}
export function touchState(uid, tid) {
  const d = userStates.get(sk(uid, tid));
  if (d) d.expiresAt = Date.now() + STATE_TTL;
}
export function clearState(uid, tid) {
  userStates.delete(sk(uid, tid));
}
export function clearAllUserStates(uid) {
  for (const key of [...userStates.keys()]) if (key.startsWith(`${uid}|`)) userStates.delete(key);
}

// ── Solo rooms ────────────────────────────────────────────
export function createSoloRoom(hostUid, hostName, threadId) {
  for (const [id, r] of soloRooms) if (r.hostUid === hostUid && r.status === "waiting") soloRooms.delete(id);
  const roomId = `solo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const room = {
    roomId, threadId, hostUid, hostName, guestUid: null, guestName: null,
    status: "waiting", // waiting | battling | finished
    turn: null, turnCount: 0, maxTurns: CONFIG.solo.maxTurns,
    hostPet: null, guestPet: null, hostParty: [], guestParty: [],
    log: [], settled: false, createdAt: Date.now(), lastActive: Date.now(),
  };
  soloRooms.set(roomId, room);
  return room;
}
export function getSoloRoom(roomId) {
  return soloRooms.get(roomId) || null;
}
export function findSoloRoomByUser(uid) {
  for (const r of soloRooms.values()) if ((r.hostUid === uid || r.guestUid === uid) && r.status !== "finished") return r;
  return null;
}
export function findWaitingRoom(threadId) {
  for (const r of soloRooms.values()) if (r.threadId === threadId && r.status === "waiting" && !r.guestUid) return r;
  return null;
}
export function updateSoloRoom(roomId, patch) {
  const r = soloRooms.get(roomId);
  if (!r) return null;
  Object.assign(r, patch, { lastActive: Date.now() });
  return r;
}
export function deleteSoloRoom(roomId) {
  soloRooms.delete(roomId);
}

// dọn định kỳ (phòng chờ quá hạn / trận bị bỏ dở không ai trả lời → hủy, KHÔNG phát thưởng)
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of userStates) if (v.expiresAt < now) userStates.delete(k);
  for (const [id, r] of soloRooms) {
    const limit = r.status === "battling" ? CONFIG.solo.idleForfeitMs : CONFIG.solo.roomTtlMs;
    if (now - r.lastActive > limit && !r.settled) {
      r.settled = true;
      for (const uid of [r.hostUid, r.guestUid]) if (uid) userStates.delete(sk(uid, r.threadId));
      soloRooms.delete(id);
    }
  }
}, 30_000);
sweeper.unref?.();
