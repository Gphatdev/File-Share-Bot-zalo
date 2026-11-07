import { SAVINGS_PATH, USERS_PATH, getConfig, getSavings, getUsers, normalizeSavingsRecord, safeNumber, writeJson } from "./storage.js";

function ensureUserSavingsSync(userId, users, savings) {
  const user = users[String(userId)] || {};
  const record = savings[String(userId)] || {};
  const normalized = normalizeSavingsRecord(userId, record);
  const total = normalized.principal + normalized.interestAccrued;
  user.userId = String(userId);
  user.balance = safeNumber(user.balance, 0);
  user.savings = total;
  user.updatedAt = Date.now();
  users[String(userId)] = user;
  savings[String(userId)] = normalized;
  return { user, savingsRecord: normalized };
}

export async function calculateInterest(userId, now = Date.now()) {
  const config = getConfig();
  const users = getUsers();
  const savings = getSavings();
  const key = String(userId);
  const record = normalizeSavingsRecord(key, savings[key] || {});
  const principal = record.principal;
  const interestAccrued = record.interestAccrued;
  const totalValue = principal + interestAccrued;

  if (totalValue <= 0) {
    return { userId: key, interest: 0, periods: 0, updated: false, total: 0 };
  }

  const rate = Number(config.dailyInterestRate ?? 0.1);
  const periodMs = Math.max(1, Number(config.interestPeriodHours ?? 24) * 60 * 60 * 1000);
  const lastInterestAt = Number(record.lastInterestAt) || Number(record.createdAt) || now;
  const elapsed = Math.max(0, now - lastInterestAt);
  const periods = Math.floor(elapsed / periodMs);

  if (periods <= 0) {
    return { userId: key, interest: 0, periods: 0, updated: false, total: totalValue };
  }

  let currentValue = totalValue;
  let interestGenerated = 0;

  for (let index = 0; index < periods; index += 1) {
    const previous = currentValue;
    // Làm tròn xuống theo từng kỳ để số dư luôn là số nguyên (tiền game không có phần lẻ).
    currentValue = previous + Math.floor(previous * rate);
    interestGenerated += currentValue - previous;
  }

  const nextSavings = {
    ...record,
    interestAccrued: interestAccrued + interestGenerated,
    lastInterestAt: lastInterestAt + periods * periodMs,
    updatedAt: now,
  };

  savings[key] = normalizeSavingsRecord(key, nextSavings);
  const synced = ensureUserSavingsSync(key, users, savings);
  writeJson(USERS_PATH, users);
  writeJson(SAVINGS_PATH, savings);

  return {
    userId: key,
    interest: Number(interestGenerated.toFixed(2)),
    periods,
    updated: true,
    total: Number(synced.user.savings || 0),
  };
}

export function getInterestSnapshot(userId) {
  const savings = getSavings();
  const record = normalizeSavingsRecord(String(userId), savings[String(userId)] || {});
  return {
    principal: record.principal,
    interestAccrued: record.interestAccrued,
    total: record.principal + record.interestAccrued,
    lastInterestAt: record.lastInterestAt,
  };
}
