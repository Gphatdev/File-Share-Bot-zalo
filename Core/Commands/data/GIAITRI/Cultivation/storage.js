import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = __dirname;
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const PROFILES_PATH = path.join(DATA_DIR, "profiles.json");

function cloneData(v) {
  return JSON.parse(JSON.stringify(v));
}

function normalizeObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

export function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return cloneData(fallback);
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return cloneData(fallback);
  try {
    return JSON.parse(raw) ?? cloneData(fallback);
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

let _configCache = null;

export function getConfig() {
  if (_configCache) return _configCache;
  try {
    _configCache = readJson(CONFIG_PATH, {});
  } catch {
    _configCache = {};
  }
  return _configCache;
}

export function reloadConfig() {
  _configCache = null;
  return getConfig();
}

export function getProfiles() {
  return normalizeObject(readJson(PROFILES_PATH, {}));
}

export function saveProfiles(data) {
  return writeJson(PROFILES_PATH, data);
}

export async function ensureDataFiles() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error("Thiếu config.json của hệ thống Tu Tiên");
  }
  if (!fs.existsSync(PROFILES_PATH)) {
    writeJson(PROFILES_PATH, {});
  }
}
