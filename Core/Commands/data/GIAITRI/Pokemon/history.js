/**
 * Lịch sử trận Solo/Gym (JSON, ghi atomic). Dùng để chống trả thưởng 2 lần (matchId duy nhất).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "./config.js";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "history.json");
let cache = null;

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { cache = { matches: [] }; }
  if (!Array.isArray(cache.matches)) cache.matches = [];
  return cache;
}
function persist() {
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
}
export function findMatch(matchId) {
  return load().matches.find((m) => m.matchId === matchId) || null;
}
export function recordMatch(entry) {
  const h = load();
  if (h.matches.some((m) => m.matchId === entry.matchId)) return false;
  h.matches.push(entry);
  if (h.matches.length > CONFIG.solo.historyKeep) h.matches = h.matches.slice(-CONFIG.solo.historyKeep);
  persist();
  return true;
}
export function updateMatch(matchId, patch) {
  const m = load().matches.find((x) => x.matchId === matchId);
  if (!m) return false;
  Object.assign(m, patch);
  persist();
  return true;
}
export function pendingMatches() {
  return load().matches.filter((m) => m.players.some((p) => !p.applied));
}
export function matchesOf(uid, limit = 10) {
  return load().matches.filter((m) => m.players.some((p) => p.uid === uid)).slice(-limit).reverse();
}
export function _resetForTests() { cache = null; }
