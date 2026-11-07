import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = __dirname;
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const PROFILES_PATH = path.join(DATA_DIR, "profiles.json");
export const AVATARS_DIR = path.join(DATA_DIR, "avatars");

const defaultConfig = {
  enabled: true,
  maxDisplayNameLength: 24,
  minDisplayNameLength: 2,
  maxAvatarBytes: 2 * 1024 * 1024,
  sessionTtlMs: 5 * 60 * 1000,
  maxLevel: 100,
  baseExp: 100,
  expGrowth: 1.15,
  showCultivation: true,
  showRank: true,
  showGang: true,
  showAchievements: true,
  showStatistics: true,
};

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(fallbackValue, null, 2), "utf8");
  }
}

export function readJson(filePath, fallbackValue = {}) {
  if (!fs.existsSync(filePath)) return cloneData(fallbackValue);
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return cloneData(fallbackValue);
  try {
    return JSON.parse(raw) ?? cloneData(fallbackValue);
  } catch {
    const backup = `${filePath}.corrupt-${Date.now()}.bak`;
    fs.copyFileSync(filePath, backup);
    throw new Error(`File dữ liệu lỗi: ${path.basename(filePath)}`);
  }
}

export function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = JSON.stringify(data, null, 2);
  try {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, payload, "utf8");
    fs.renameSync(tmpPath, filePath);
  } catch {
    fs.writeFileSync(filePath, payload, "utf8");
  }
  return filePath;
}

export async function ensureDataFiles() {
  ensureFile(CONFIG_PATH, defaultConfig);
  ensureFile(PROFILES_PATH, {});
  fs.mkdirSync(AVATARS_DIR, { recursive: true });

  const config = normalizeObject(readJson(CONFIG_PATH, defaultConfig));
  const merged = { ...defaultConfig, ...config };
  if (JSON.stringify(config) !== JSON.stringify(merged)) {
    writeJson(CONFIG_PATH, merged);
  }
  return { config: merged };
}

export function getConfig() {
  try {
    return { ...defaultConfig, ...normalizeObject(readJson(CONFIG_PATH, defaultConfig)) };
  } catch {
    return cloneData(defaultConfig);
  }
}

export function getProfiles() {
  return normalizeObject(readJson(PROFILES_PATH, {}));
}

export function saveProfiles(data) {
  return writeJson(PROFILES_PATH, data);
}

export function getDefaultConfig() {
  return cloneData(defaultConfig);
}
