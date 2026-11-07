import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = __dirname;
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const ROOMS_PATH = path.join(DATA_DIR, "rooms.json");
export const HISTORY_PATH = path.join(DATA_DIR, "history.json");
export const META_PATH = path.join(DATA_DIR, "meta.json");

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function normalizeObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

export function safeNumber(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

export function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return clone(fallback);
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return clone(fallback);
  try {
    return JSON.parse(raw) ?? clone(fallback);
  } catch {
    const bak = `${filePath}.corrupt-${Date.now()}.bak`;
    fs.copyFileSync(filePath, bak);
    throw new Error(`File dữ liệu lỗi: ${path.basename(filePath)}`);
  }
}

export function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = JSON.stringify(data, null, 2);
  try {
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, payload, "utf8");
    fs.renameSync(tmp, filePath);
  } catch {
    fs.writeFileSync(filePath, payload, "utf8");
  }
  return filePath;
}

const defaultConfig = {
  enabled: true,
  minBet: 1000,
  maxBet: 1_000_000_000,
  allowSameChoice: true,
  expTiers: [
    { min: 0, max: 49999, exp: 20 },
    { min: 50000, max: 199999, exp: 30 },
    { min: 200000, max: 499999, exp: 40 },
    { min: 500000, max: 999999, exp: 60 },
    { min: 1000000, max: 4999999, exp: 80 },
    { min: 5000000, max: null, exp: 100 },
  ],
  loserExpRate: 0.3,
  specialExp: 20,
  roomIdleMs: 30 * 60 * 1000,
  historyLimit: 200,
};

export function getConfig() {
  try {
    return { ...defaultConfig, ...normalizeObject(readJson(CONFIG_PATH, defaultConfig)) };
  } catch {
    return clone(defaultConfig);
  }
}

export function getRooms() {
  return normalizeObject(readJson(ROOMS_PATH, {}));
}

export function saveRooms(data) {
  return writeJson(ROOMS_PATH, data);
}

export function getHistory() {
  const h = readJson(HISTORY_PATH, []);
  return Array.isArray(h) ? h : [];
}

export function saveHistory(list) {
  return writeJson(HISTORY_PATH, list);
}

export function getMeta() {
  return normalizeObject(readJson(META_PATH, { roomCounter: 0 }));
}

export function saveMeta(data) {
  return writeJson(META_PATH, data);
}

export async function ensureDataFiles() {
  if (!fs.existsSync(CONFIG_PATH)) writeJson(CONFIG_PATH, defaultConfig);
  if (!fs.existsSync(ROOMS_PATH)) writeJson(ROOMS_PATH, {});
  if (!fs.existsSync(HISTORY_PATH)) writeJson(HISTORY_PATH, []);
  if (!fs.existsSync(META_PATH)) writeJson(META_PATH, { roomCounter: 0 });
}
