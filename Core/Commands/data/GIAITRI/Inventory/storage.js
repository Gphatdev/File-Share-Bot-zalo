import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = __dirname;
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const USERS_PATH = path.join(DATA_DIR, "users.json");
export const TIERS_PATH = path.join(DATA_DIR, "tiers.json");
export const ITEMS_CATALOG_PATH = path.join(DATA_DIR, "items_catalog.json");

const defaultConfig = {
  enabled: true,
  tiers: {
    BASIC: { name: "BASIC", displayName: "BASIC INVENTORY", capacity: 30, badge: "BASIC", priority: 1 },
    VIP: { name: "VIP", displayName: "VIP INVENTORY", capacity: 100, badge: "VIP", priority: 2 },
    PRE: { name: "PRE", displayName: "PRE INVENTORY", capacity: 300, badge: "PRE", priority: 3 },
    INFINITE: { name: "INFINITE", displayName: "INFINITE INVENTORY", capacity: null, badge: "VÔ HẠN", priority: 4 },
  },
  defaultTier: "BASIC",
  pageSize: 20,
  maxStackDefault: 99,
  currency: "GOLD",
};

const defaultCatalog = {
  "hp_potion": {
    id: "hp_potion",
    name: "Bình máu",
    nameKey: "binh mau",
    stackable: true,
    maxStack: 99,
    locked: false,
    rarity: "common",
    icon: "❤️",
    description: "Hồi phục HP cơ bản",
  },
  "mp_potion": {
    id: "mp_potion",
    name: "Bình mana",
    nameKey: "binh mana",
    stackable: true,
    maxStack: 99,
    locked: false,
    rarity: "common",
    icon: "💙",
    description: "Hồi phục MP cơ bản",
  },
  "gold_coin": {
    id: "gold_coin",
    name: "Xu vàng",
    nameKey: "xu vang",
    stackable: true,
    maxStack: 9999,
    locked: false,
    rarity: "common",
    icon: "🪙",
    description: "Tiền tệ trong game",
  },
  "iron_sword": {
    id: "iron_sword",
    name: "Kiếm sắt",
    nameKey: "kiem sat",
    stackable: false,
    maxStack: 1,
    locked: false,
    rarity: "uncommon",
    icon: "⚔️",
    description: "Vũ khí cận chiến cấp thấp",
  },
  "quest_key": {
    id: "quest_key",
    name: "Chìa khóa nhiệm vụ",
    nameKey: "chia khoa nhiem vu",
    stackable: false,
    maxStack: 1,
    locked: true,
    rarity: "rare",
    icon: "🔑",
    description: "Vật phẩm nhiệm vụ, không thể vứt",
  },
  "fish_common": {
    id: "fish_common",
    name: "Cá thường",
    nameKey: "ca thuong",
    stackable: true,
    maxStack: 50,
    locked: false,
    rarity: "common",
    icon: "🐟",
    description: "Cá câu được từ hồ thường",
  },
  "treasure_chest": {
    id: "treasure_chest",
    name: "Rương kho báu",
    nameKey: "ruong kho bau",
    stackable: false,
    maxStack: 1,
    locked: false,
    rarity: "epic",
    icon: "📦",
    description: "Rương chứa phần thưởng ngẫu nhiên",
  },
  "gem_blue": {
    id: "gem_blue",
    name: "Đá quý xanh",
    nameKey: "da quy xanh",
    stackable: true,
    maxStack: 20,
    locked: false,
    rarity: "rare",
    icon: "💎",
    description: "Đá quý dùng để nâng cấp",
  },
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

export function getDefaultConfig() {
  return cloneData(defaultConfig);
}

export function readJson(filePath, fallbackValue = {}) {
  if (!fs.existsSync(filePath)) {
    return cloneData(fallbackValue);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) {
    return cloneData(fallbackValue);
  }
  try {
    return JSON.parse(raw) ?? cloneData(fallbackValue);
  } catch {
    const backup = `${filePath}.corrupt-${Date.now()}.bak`;
    fs.copyFileSync(filePath, backup);
    throw new Error(
      `File dữ liệu bị lỗi định dạng: ${path.basename(filePath)} (đã sao lưu sang ${path.basename(backup)}).`
    );
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
  ensureFile(USERS_PATH, {});
  ensureFile(TIERS_PATH, {});
  ensureFile(ITEMS_CATALOG_PATH, defaultCatalog);

  const config = normalizeObject(readJson(CONFIG_PATH, defaultConfig));
  const mergedConfig = { ...defaultConfig, ...config, tiers: { ...defaultConfig.tiers, ...(config.tiers || {}) } };
  if (JSON.stringify(config) !== JSON.stringify(mergedConfig)) {
    writeJson(CONFIG_PATH, mergedConfig);
  }

  const catalog = normalizeObject(readJson(ITEMS_CATALOG_PATH, defaultCatalog));
  const mergedCatalog = { ...defaultCatalog, ...catalog };
  if (JSON.stringify(catalog) !== JSON.stringify(mergedCatalog)) {
    writeJson(ITEMS_CATALOG_PATH, mergedCatalog);
  }

  return { config: mergedConfig };
}

export function getConfig() {
  try {
    const raw = normalizeObject(readJson(CONFIG_PATH, defaultConfig));
    return {
      ...defaultConfig,
      ...raw,
      tiers: { ...defaultConfig.tiers, ...(raw.tiers || {}) },
    };
  } catch {
    return getDefaultConfig();
  }
}

export function getUsers() {
  return normalizeObject(readJson(USERS_PATH, {}));
}

export function getTiers() {
  return normalizeObject(readJson(TIERS_PATH, {}));
}

export function getItemsCatalog() {
  try {
    return { ...defaultCatalog, ...normalizeObject(readJson(ITEMS_CATALOG_PATH, defaultCatalog)) };
  } catch {
    return cloneData(defaultCatalog);
  }
}

export function saveUsers(data) {
  return writeJson(USERS_PATH, data);
}

export function saveTiers(data) {
  return writeJson(TIERS_PATH, data);
}

export function saveCatalog(data) {
  return writeJson(ITEMS_CATALOG_PATH, data);
}
