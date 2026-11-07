import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = __dirname;
export const STATS_PATH = path.join(DATA_DIR, "stats.json");
export const TEMP_DIR = path.join(DATA_DIR, "temp");

function readJson(fp, fb) {
  try {
    if (!fs.existsSync(fp)) return structuredClone(fb);
    return JSON.parse(fs.readFileSync(fp, "utf8")) ?? structuredClone(fb);
  } catch {
    return structuredClone(fb);
  }
}
function writeJson(fp, data) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const tmp = `${fp}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  try { fs.renameSync(tmp, fp); } catch { fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8"); }
}

export function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  if (!fs.existsSync(STATS_PATH)) writeJson(STATS_PATH, {});
}

export function getStats() {
  ensureDataFiles();
  return readJson(STATS_PATH, {});
}
export function saveStats(data) {
  writeJson(STATS_PATH, data);
}

export function getPlayerStats(uid) {
  const all = getStats();
  const key = String(uid);
  if (!all[key]) {
    all[key] = { wins: 0, losses: 0, draws: 0, games: 0, streak: 0, bestStreak: 0, name: "" };
  }
  return all[key];
}

export function updatePlayerStats(uid, name, result) {
  // result: 'win' | 'lose' | 'draw'
  ensureDataFiles();
  const all = getStats();
  const key = String(uid);
  const s = all[key] || { wins: 0, losses: 0, draws: 0, games: 0, streak: 0, bestStreak: 0, name: "" };
  s.name = name || s.name || "";
  s.games = (s.games || 0) + 1;
  if (result === "win") {
    s.wins = (s.wins || 0) + 1;
    s.streak = (s.streak || 0) + 1;
    s.bestStreak = Math.max(s.bestStreak || 0, s.streak);
  } else if (result === "lose") {
    s.losses = (s.losses || 0) + 1;
    s.streak = 0;
  } else {
    s.draws = (s.draws || 0) + 1;
    s.streak = 0;
  }
  all[key] = s;
  saveStats(all);
  return s;
}

export function getTopList(limit = 10) {
  const all = getStats();
  return Object.entries(all)
    .map(([uid, s]) => {
      const games = s.games || 0;
      const wins = s.wins || 0;
      const winRate = games > 0 ? Math.round((wins / games) * 1000) / 10 : 0;
      return { uid, name: s.name || uid.slice(-6), wins, losses: s.losses || 0, draws: s.draws || 0, games, winRate, streak: s.streak || 0 };
    })
    .filter((x) => x.games > 0)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.games - a.games;
    })
    .slice(0, limit);
}
