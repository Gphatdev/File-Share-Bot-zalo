import fs from "node:fs";
import { randomUUID } from "node:crypto";
import {
  CONFIG_PATH,
  USERS_PATH,
  SAVINGS_PATH,
  TRANSACTIONS_PATH,
  ensureDataFiles,
  getConfig,
  getSavings as getSavingsStore,
  getTransactions,
  getUsers,
  normalizeSavingsRecord,
  normalizeUserRecord,
  safeNumber,
  writeJson,
} from "./storage.js";
import { calculateInterest } from "./interest.js";

const USER_LOCKS = new Map();

async function withUserLock(userId, task) {
  const key = String(userId);
  const previous = USER_LOCKS.get(key) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  USER_LOCKS.set(key, next);
  await previous;
  try {
    return await task();
  } finally {
    // Chỉ xóa khóa nếu không có người khác đã xếp hàng sau mình.
    if (USER_LOCKS.get(key) === next) USER_LOCKS.delete(key);
    release();
  }
}

function formatUserKey(userId) {
  return String(userId || "").trim();
}

function getNow() {
  return Date.now();
}

async function ensureUserExists(userId) {
  await ensureDataFiles();
  const users = getUsers();
  const key = formatUserKey(userId);
  const now = getNow();

  if (!users[key]) {
    users[key] = normalizeUserRecord(key, {
      userId: key,
      balance: 0,
      savings: 0,
      createdAt: now,
      updatedAt: now,
    });
    writeJson(USERS_PATH, users);
  }

  return normalizeUserRecord(key, users[key] || {});
}

async function ensureSavingsExists(userId) {
  await ensureDataFiles();
  const savings = getSavingsStore();
  const key = formatUserKey(userId);
  const now = getNow();

  if (!savings[key]) {
    savings[key] = normalizeSavingsRecord(key, {
      userId: key,
      principal: 0,
      interestAccrued: 0,
      lastInterestAt: now,
      createdAt: now,
      updatedAt: now,
    });
    writeJson(SAVINGS_PATH, savings);
  }

  return normalizeSavingsRecord(key, savings[key] || {});
}

async function syncUserSavings(userId) {
  const users = getUsers();
  const savings = getSavingsStore();
  const key = formatUserKey(userId);
  const user = normalizeUserRecord(key, users[key] || {});
  const record = normalizeSavingsRecord(key, savings[key] || {});
  const totalSavings = record.principal + record.interestAccrued;
  user.savings = totalSavings;
  user.updatedAt = getNow();
  users[key] = user;
  writeJson(USERS_PATH, users);
  return user;
}

async function appendTransaction(entry) {
  const tx = getTransactions();
  const config = getConfig();
  const trimmed = [...tx, entry].slice(-(config.transactionLimit || 200));
  writeJson(TRANSACTIONS_PATH, trimmed);
  return entry;
}

async function recordTransaction({ userId, type, amount, description, adminId, beforeBalance, afterBalance, beforeSavings, afterSavings, referenceId = null, status = "success" }) {
  const entry = {
    id: `TX-${Date.now()}-${randomUUID().slice(0, 8)}`,
    userId: formatUserKey(userId),
    type,
    referenceId: referenceId ? String(referenceId) : null,
    amount: Number(amount || 0),
    description: description || "",
    adminId: adminId ? String(adminId) : null,
    beforeBalance: Number(beforeBalance || 0),
    afterBalance: Number(afterBalance || 0),
    beforeSavings: Number(beforeSavings || 0),
    afterSavings: Number(afterSavings || 0),
    createdAt: getNow(),
    status,
  };
  return appendTransaction(entry);
}

export async function getUser(userId) {
  const key = formatUserKey(userId);
  if (!key) return null;

  const user = await ensureUserExists(key);
  const savingsRecord = await ensureSavingsExists(key);
  await calculateInterest(key, Date.now());
  return syncUserSavings(key).then(() => normalizeUserRecord(key, getUsers()[key] || user));
}

export async function getBalance(userId) {
  const user = await getUser(userId);
  return user ? Number(user.balance || 0) : 0;
}

export async function getSavings(userId) {
  const key = formatUserKey(userId);
  if (!key) return { principal: 0, interestAccrued: 0, total: 0 };
  await ensureDataFiles();
  const savings = getSavingsStore();
  const record = normalizeSavingsRecord(key, savings[key] || {});
  await calculateInterest(key, Date.now());
  const updated = normalizeSavingsRecord(key, getSavingsStore()[key] || {});
  return {
    userId: key,
    principal: Number(updated.principal || 0),
    interestAccrued: Number(updated.interestAccrued || 0),
    total: Number(updated.principal || 0) + Number(updated.interestAccrued || 0),
    lastInterestAt: Number(updated.lastInterestAt || 0),
    createdAt: Number(updated.createdAt || 0),
    updatedAt: Number(updated.updatedAt || 0),
  };
}

export async function getTotalAssets(userId) {
  const balance = await getBalance(userId);
  const savingsInfo = await getSavings(userId);
  return balance + Number(savingsInfo.total || 0);
}

export async function addMoney(userId, amount, options = {}) {
  const key = formatUserKey(userId);
  if (!key) throw new Error("Thiếu userId khi cộng tiền.");
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !Number.isInteger(numericAmount)) {
    throw new Error("Số tiền cộng không hợp lệ.");
  }

  const referenceId = options.referenceId ? String(options.referenceId) : null;

  return withUserLock(key, async () => {
    // Chống cộng tiền hai lần khi cùng một tin nhắn lệnh được xử lý lại.
    if (referenceId && getTransactions().some((item) => item.referenceId === referenceId)) {
      const error = new Error("Giao dịch này đã được xử lý.");
      error.code = "DUPLICATE_REFERENCE";
      throw error;
    }

    const users = getUsers();
    const savings = getSavingsStore();
    const config = getConfig();
    const maxLimit = Number(config.maximumAdminCredit ?? config.maximumDeposit ?? 1000000000);
    if (numericAmount > maxLimit) {
      throw new Error(`Số tiền vượt quá giới hạn ${maxLimit}.`);
    }

    const user = normalizeUserRecord(key, users[key] || {});
    const beforeBalance = Number(user.balance || 0);
    const beforeSavings = Number(normalizeSavingsRecord(key, savings[key] || {}).principal || 0) + Number(normalizeSavingsRecord(key, savings[key] || {}).interestAccrued || 0);
    const afterBalance = beforeBalance + numericAmount;
    if (!Number.isSafeInteger(afterBalance)) {
      throw new Error("Số dư sau giao dịch vượt giới hạn hệ thống, không thể cộng.");
    }

    user.balance = afterBalance;
    user.updatedAt = getNow();
    users[key] = user;
    writeJson(USERS_PATH, users);

    const tx = {
      userId: key,
      type: options.type || "ADMIN_CREDIT",
      amount: numericAmount,
      description: options.description || "Cộng tiền",
      adminId: options.adminId || null,
      beforeBalance,
      afterBalance,
      beforeSavings,
      afterSavings: beforeSavings,
      referenceId,
      status: "success",
    };

    await recordTransaction(tx);
    return normalizeUserRecord(key, users[key]);
  });
}

export async function removeMoney(userId, amount, options = {}) {
  const key = formatUserKey(userId);
  if (!key) throw new Error("Thiếu userId khi trừ tiền.");
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !Number.isInteger(numericAmount)) {
    throw new Error("Số tiền trừ không hợp lệ.");
  }

  return withUserLock(key, async () => {
    const users = getUsers();
    const savings = getSavingsStore();
    const user = normalizeUserRecord(key, users[key] || {});
    const beforeBalance = Number(user.balance || 0);
    const beforeSavings = Number(normalizeSavingsRecord(key, savings[key] || {}).principal || 0) + Number(normalizeSavingsRecord(key, savings[key] || {}).interestAccrued || 0);

    if (beforeBalance < numericAmount) {
      throw new Error("Số dư không đủ để trừ.");
    }

    const afterBalance = beforeBalance - numericAmount;
    user.balance = afterBalance;
    user.updatedAt = getNow();
    users[key] = user;
    writeJson(USERS_PATH, users);

    await recordTransaction({
      userId: key,
      type: options.type || "GAME_LOSE",
      amount: -numericAmount,
      description: options.description || "Trừ tiền",
      adminId: options.adminId || null,
      beforeBalance,
      afterBalance,
      beforeSavings,
      afterSavings: beforeSavings,
      status: "success",
    });

    return normalizeUserRecord(key, users[key]);
  });
}

export async function depositSavings(userId, amount) {
  const key = formatUserKey(userId);
  const numericAmount = Number(amount);
  if (!key) throw new Error("Thiếu userId khi gửi tiết kiệm.");
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !Number.isInteger(numericAmount)) {
    throw new Error("Số tiền gửi tiết kiệm không hợp lệ.");
  }

  return withUserLock(key, async () => {
    const config = getConfig();
    const minimum = Number(config.minimumDeposit ?? 1);
    const maximum = Number(config.maximumDeposit ?? 1000000000);

    if (numericAmount < minimum || numericAmount > maximum) {
      throw new Error(`Số tiền gửi tiết kiệm phải nằm trong khoảng ${minimum} đến ${maximum}.`);
    }

    const users = getUsers();
    const savings = getSavingsStore();
    const user = normalizeUserRecord(key, users[key] || {});
    const record = normalizeSavingsRecord(key, savings[key] || {});
    const beforeBalance = Number(user.balance || 0);
    const beforeSavings = record.principal + record.interestAccrued;

    if (beforeBalance < numericAmount) {
      throw new Error("Số dư khả dụng không đủ để gửi tiết kiệm.");
    }

    const now = getNow();
    await calculateInterest(key, now);

    const refreshedUser = normalizeUserRecord(key, getUsers()[key] || user);
    const refreshedSavings = normalizeSavingsRecord(key, getSavingsStore()[key] || record);
    const afterBalance = refreshedUser.balance - numericAmount;
    const afterSavings = refreshedSavings.principal + refreshedSavings.interestAccrued + numericAmount;

    if (afterBalance < 0) {
      throw new Error("Số dư không đủ để thực hiện gửi tiết kiệm.");
    }

    refreshedUser.balance = afterBalance;
    refreshedUser.updatedAt = now;
    const nextRecord = {
      ...refreshedSavings,
      principal: refreshedSavings.principal + numericAmount,
      lastInterestAt: now,
      updatedAt: now,
    };
    refreshedUser.savings = nextRecord.principal + nextRecord.interestAccrued;

    users[key] = refreshedUser;
    savings[key] = normalizeSavingsRecord(key, nextRecord);
    writeJson(USERS_PATH, users);
    writeJson(SAVINGS_PATH, savings);

    await recordTransaction({
      userId: key,
      type: "DEPOSIT",
      amount: numericAmount,
      description: "Gửi tiết kiệm",
      adminId: null,
      beforeBalance,
      afterBalance,
      beforeSavings,
      afterSavings,
      status: "success",
    });

    return {
      ok: true,
      balance: refreshedUser.balance,
      savings: refreshedUser.savings,
      total: refreshedUser.balance + refreshedUser.savings,
    };
  });
}

export async function calculateInterestForUser(userId) {
  const key = formatUserKey(userId);
  if (!key) return 0;
  const result = await calculateInterest(key, Date.now());
  return Number(result.interest || 0);
}

export async function getTransactionHistory(userId, limit = 20) {
  const key = formatUserKey(userId);
  const tx = getTransactions();
  const filtered = tx
    .filter((item) => String(item.userId) === key)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, Number(limit) || 20);

  return filtered;
}

export async function ensureAccountState(userId) {
  const key = formatUserKey(userId);
  await ensureDataFiles();
  const user = await ensureUserExists(key);
  await ensureSavingsExists(key);
  return user;
}

export async function transfer(fromId, toId, amount, options = {}) {
  const from = formatUserKey(fromId);
  const to = formatUserKey(toId);
  if (!from || !to) throw new Error("Thiếu người gửi hoặc người nhận.");
  if (from === to) throw new Error("Không thể chuyển tiền cho chính mình.");
  const numericAmount = Number(amount);
  if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
    throw new Error("Số tiền chuyển không hợp lệ.");
  }

  // Khóa hai tài khoản theo thứ tự cố định để tránh deadlock.
  const [first, second] = [from, to].sort();
  return withUserLock(first, () =>
    withUserLock(second, async () => {
      const referenceId = options.referenceId ? String(options.referenceId) : null;
      if (referenceId && getTransactions().some((item) => item.referenceId === referenceId)) {
        const error = new Error("Giao dịch này đã được xử lý.");
        error.code = "DUPLICATE_REFERENCE";
        throw error;
      }

      const users = getUsers();
      const sender = normalizeUserRecord(from, users[from] || {});
      const recipient = normalizeUserRecord(to, users[to] || {});
      if (sender.balance < numericAmount) {
        throw new Error("Số dư khả dụng không đủ để chuyển.");
      }

      const now = getNow();
      const senderAfter = sender.balance - numericAmount;
      const recipientAfter = recipient.balance + numericAmount;
      users[from] = { ...sender, balance: senderAfter, updatedAt: now };
      users[to] = { ...recipient, balance: recipientAfter, updatedAt: now };
      writeJson(USERS_PATH, users);

      const base = {
        type: options.type || "TRANSFER",
        amount: numericAmount,
        adminId: null,
        referenceId,
        status: "success",
        createdAt: now,
      };
      const savings = getSavingsStore();
      const senderSavings = normalizeSavingsRecord(from, savings[from] || {});
      const recipientSavings = normalizeSavingsRecord(to, savings[to] || {});
      const senderSavingsTotal = senderSavings.principal + senderSavings.interestAccrued;
      const recipientSavingsTotal = recipientSavings.principal + recipientSavings.interestAccrued;

      await appendTransaction({
        ...base,
        id: `TX-${now}-${randomUUID().slice(0, 8)}`,
        userId: from,
        counterpartyId: to,
        amount: -numericAmount,
        description: options.description || `Chuyển tiền cho ${to}`,
        beforeBalance: sender.balance,
        afterBalance: senderAfter,
        beforeSavings: senderSavingsTotal,
        afterSavings: senderSavingsTotal,
      });
      await appendTransaction({
        ...base,
        id: `TX-${now}-${randomUUID().slice(0, 8)}`,
        userId: to,
        counterpartyId: from,
        description: options.description || `Nhận tiền từ ${from}`,
        beforeBalance: recipient.balance,
        afterBalance: recipientAfter,
        beforeSavings: recipientSavingsTotal,
        afterSavings: recipientSavingsTotal,
      });

      return {
        senderBalance: senderAfter,
        recipientBalance: recipientAfter,
      };
    })
  );
}

const TienGame = {
  getUser,
  getBalance,
  getSavings,
  getTotalAssets,
  addMoney,
  removeMoney,
  transfer,
  depositSavings,
  calculateInterest: calculateInterestForUser,
  getTransactionHistory,
  ensureAccountState,
};

export default TienGame;
