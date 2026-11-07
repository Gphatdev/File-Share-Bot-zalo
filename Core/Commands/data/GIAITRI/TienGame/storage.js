import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = __dirname;
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const USERS_PATH = path.join(DATA_DIR, "users.json");
export const SAVINGS_PATH = path.join(DATA_DIR, "savings.json");
export const TRANSACTIONS_PATH = path.join(DATA_DIR, "transactions.json");

const defaultConfig = {
  enabled: true,
  dailyInterestRate: 0.1,
  interestPeriodHours: 24,
  minimumDeposit: 1,
  maximumDeposit: 1000000000,
  maximumAdminCredit: 1000000000000,
  currency: "GOLD",
  transactionLimit: 200,
};

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeNumber(value, fallback = 0) {
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
    // Không bao giờ âm thầm ghi đè file lỗi: sao lưu rồi báo lỗi để thao tác bị từ chối.
    const backup = `${filePath}.corrupt-${Date.now()}.bak`;
    fs.copyFileSync(filePath, backup);
    throw new Error(`File dữ liệu bị lỗi định dạng: ${path.basename(filePath)} (đã sao lưu sang ${path.basename(backup)}).`);
  }
}

export function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
  return filePath;
}

export async function ensureDataFiles() {
  ensureFile(CONFIG_PATH, defaultConfig);
  ensureFile(USERS_PATH, {});
  ensureFile(SAVINGS_PATH, {});
  ensureFile(TRANSACTIONS_PATH, []);

  // Chỉ bổ sung khóa cấu hình còn thiếu; không ghi lại users/savings/transactions
  // để tránh làm mất dữ liệu khi có thay đổi chưa ghi xong.
  const config = normalizeObject(readJson(CONFIG_PATH, defaultConfig));
  const mergedConfig = { ...defaultConfig, ...config };
  if (JSON.stringify(config) !== JSON.stringify(mergedConfig)) {
    writeJson(CONFIG_PATH, mergedConfig);
  }

  return { config: mergedConfig };
}

export function getConfig() {
  try {
    return { ...defaultConfig, ...normalizeObject(readJson(CONFIG_PATH, defaultConfig)) };
  } catch {
    return getDefaultConfig();
  }
}

export function getUsers() {
  return normalizeObject(readJson(USERS_PATH, {}));
}

export function getSavings() {
  return normalizeObject(readJson(SAVINGS_PATH, {}));
}

export function getTransactions() {
  const tx = readJson(TRANSACTIONS_PATH, []);
  return Array.isArray(tx) ? tx : [];
}

export function normalizeUserRecord(userId, record = {}) {
  const id = String(userId);
  const now = Date.now();
  const base = normalizeObject(record);
  const balance = safeNumber(base.balance, 0);
  const savings = safeNumber(base.savings, 0);
  return {
    userId: id,
    balance,
    savings,
    createdAt: Number(base.createdAt) || now,
    updatedAt: Number(base.updatedAt) || now,
  };
}

export function normalizeSavingsRecord(userId, record = {}) {
  const id = String(userId);
  const now = Date.now();
  const base = normalizeObject(record);
  const principal = safeNumber(base.principal, 0);
  const interestAccrued = safeNumber(base.interestAccrued, 0);
  return {
    userId: id,
    principal,
    interestAccrued,
    lastInterestAt: Number(base.lastInterestAt) || now,
    createdAt: Number(base.createdAt) || now,
    updatedAt: Number(base.updatedAt) || now,
  };
}

export { safeNumber };
