import { unlinkSync } from "node:fs";
import TienGame from "./data/GIAITRI/TienGame/index.js";
import { getConfig } from "./data/GIAITRI/TienGame/storage.js";
import {
  renderAccountCard,
  renderAdminCreditCard,
  renderDepositCard,
  saveBufferToTempImage,
} from "./data/GIAITRI/TienGame/canvas.js";
import { config as botConfig } from "../../App/Config.js";
import { MAX_ADMIN_CREDIT } from "./data/GIAITRI/TienGame/moneyFormatter.js";

const TZ = "Asia/Ho_Chi_Minh";

function fmt(value) {
  return Number(value || 0).toLocaleString("vi-VN");
}

function normalizeUid(value) {
  return String(value ?? "").trim();
}

// Cùng logic với isBotAdmin trong App/BotInstance.js: chủ bot, admin cấu hình,
// và admin cập nhật lúc chạy. Không dựa vào tên hiển thị.
function isBotAdmin(uid) {
  const candidate = normalizeUid(uid);
  if (!candidate) return false;
  const owner = normalizeUid(botConfig?.ownerZaloId);
  const configured = Array.isArray(botConfig?.legacyAdminBot) ? botConfig.legacyAdminBot : [];
  const runtime = Array.isArray(global.users?.admin) ? global.users.admin : [];
  if (owner && owner === candidate) return true;
  return [...configured, ...runtime].map(normalizeUid).includes(candidate);
}

function parseAmount(raw, max) {
  const text = String(raw ?? "");
  if (!/^\d+$/.test(text)) {
    return { error: "Số tiền phải là số nguyên dương, không có dấu, dấu thập phân hay chữ." };
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return { error: "Số tiền phải lớn hơn 0." };
  }
  if (value > max) {
    return { error: `Số tiền vượt giới hạn cho phép (${fmt(max)}).` };
  }
  return { value };
}

function nextInterestLabel(lastInterestAt, periodHours) {
  if (!lastInterestAt) return "Chưa có";
  const next = Number(lastInterestAt) + Number(periodHours || 24) * 60 * 60 * 1000;
  return new Date(next).toLocaleString("vi-VN", { timeZone: TZ, hour12: false });
}

// Lấy người nhận từ tag (mention) trước, sau đó từ reply/quote.
function resolveTarget(message) {
  const mention = message.data?.mentions?.[0];
  if (mention?.uid) {
    const content = typeof message.data?.content === "string" ? message.data.content : "";
    const label = content.substr(Number(mention.pos) || 0, Number(mention.len) || 0).replace(/^@/, "");
    return { uid: normalizeUid(mention.uid), name: label || "Người được tag" };
  }
  const quote = message.data?.quote;
  const quoteOwner = quote && (quote.ownerId || quote.uidFrom || quote.senderId);
  if (quoteOwner) {
    return { uid: normalizeUid(quoteOwner), name: String(quote.dName || quote.senderName || "Người chơi") };
  }
  return null;
}

async function sendCard(adapter, threadId, threadType, buffer, caption) {
  const imagePath = saveBufferToTempImage(buffer, "napthe");
  try {
    await adapter.sendImage({ threadId, threadType, imagePath, caption });
  } finally {
    try {
      unlinkSync(imagePath);
    } catch {
      // file tạm có thể đã bị xóa; không ảnh hưởng giao dịch
    }
  }
}

const USAGE = [
  "Cách dùng:",
  ".napthe check — xem tài khoản tiền game",
  ".napthe tk <số tiền> — gửi tiết kiệm",
  ".napthe <số tiền> — (admin) reply tin nhắn người nhận rồi nhập",
  ".napthe @tên <số tiền> — (admin) tag người nhận",
].join("\n");

export default {
  name: "napthe",
  description: "Quản lý tiền game: xem tài khoản, gửi tiết kiệm, admin cộng tiền",
  version: "1.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 2,
  aliases: [],
  noPrefix: false,

  async run({ adapter, message, args = [] }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const senderId = normalizeUid(message.data?.uidFrom);
    const senderName = String(message.data?.dName || "Người chơi").slice(0, 40);
    const send = (text) => adapter.sendText({ threadId, threadType, text });

    const config = getConfig();
    if (config.enabled === false) {
      return send("Hệ thống tiền game đang tạm tắt.");
    }

    const sub = String(args[0] || "").toLowerCase();

    // .napthe check
    if (sub === "check") {
      try {
        const user = await TienGame.getUser(senderId);
        const savings = await TienGame.getSavings(senderId);
        const balance = Number(user.balance || 0);
        const totalAssets = balance + Number(savings.total || 0);
        const buffer = await renderAccountCard({
          user,
          displayName: senderName,
          balance,
          savings: savings.total,
          totalAssets,
          rate: Math.round(Number(config.dailyInterestRate || 0) * 100),
          nextInterest: nextInterestLabel(savings.lastInterestAt, config.interestPeriodHours),
        });
        const caption = `Lãi đã phát sinh: ${fmt(savings.interestAccrued)}`;
        try {
          await sendCard(adapter, threadId, threadType, buffer, caption);
        } catch (err) {
          console.error("[napthe] Lỗi gửi ảnh check:", err?.message);
          await send(`Số dư: ${fmt(balance)}\nTiết kiệm: ${fmt(savings.total)}\nTổng tài sản: ${fmt(totalAssets)}`);
        }
      } catch (err) {
        await send(`Không thể lấy thông tin tài khoản: ${err.message}`);
      }
      return;
    }

    // .napthe tk <số tiền>
    if (sub === "tk") {
      if (args.length < 2) return send("Cú pháp: .napthe tk <số tiền>");
      const parsed = parseAmount(args[1], Number(config.maximumDeposit || 1000000000));
      if (parsed.error) return send(parsed.error);
      try {
        // depositSavings kiểm tra số dư và thực hiện trừ/cộng trong một thao tác có khóa.
        const result = await TienGame.depositSavings(senderId, parsed.value);
        const savings = await TienGame.getSavings(senderId);
        const buffer = await renderDepositCard({
          userId: senderId,
          amount: parsed.value,
          balanceAfter: result.balance,
          savingsAfter: result.savings,
          rate: Math.round(Number(config.dailyInterestRate || 0) * 100),
        });
        try {
          await sendCard(adapter, threadId, threadType, buffer, `Đã gửi ${fmt(parsed.value)} vào tiết kiệm.`);
        } catch (err) {
          console.error("[napthe] Lỗi gửi ảnh tiết kiệm:", err?.message);
          await send(`Đã gửi ${fmt(parsed.value)} vào tiết kiệm. Số dư: ${fmt(result.balance)} • Tiết kiệm: ${fmt(savings.total)}`);
        }
      } catch (err) {
        await send(`Không thể gửi tiết kiệm: ${err.message}`);
      }
      return;
    }

    // .napthe <số tiền> | .napthe @tên <số tiền>  (chỉ admin)
    if (args.length === 0) return send(USAGE);

    if (!isBotAdmin(senderId)) {
      return send("Bạn không có quyền sử dụng lệnh cộng tiền.");
    }

    const amountArg = args[args.length - 1];
    const parsed = parseAmount(amountArg, Math.min(Number(config.maximumAdminCredit || MAX_ADMIN_CREDIT), MAX_ADMIN_CREDIT));
    if (parsed.error) return send(parsed.error);

    const target = resolveTarget(message);
    if (!target || !target.uid) {
      return send("Không xác định được người nhận. Hãy reply tin nhắn của họ hoặc tag họ rồi nhập lại.");
    }

    // Từ đây giao dịch đã được ghi nếu không có lỗi; không bao giờ thử cộng lại.
    // msgId của tin nhắn lệnh làm khóa chống xử lý lặp (cùng lệnh không được cộng hai lần).
    const referenceId = String(message.data?.msgId || "").trim() || null;
    let updated;
    try {
      updated = await TienGame.addMoney(target.uid, parsed.value, {
        type: "ADMIN_CREDIT",
        description: `Admin ${senderId} cộng tiền`,
        adminId: senderId,
        referenceId,
      });
    } catch (err) {
      if (err.code === "DUPLICATE_REFERENCE") return send("Lệnh này đã được xử lý trước đó, không cộng lại.");
      return send(`Không thể cộng tiền: ${err.message}`);
    }

    try {
      const buffer = await renderAdminCreditCard({
        targetName: target.name,
        userId: target.uid,
        amount: parsed.value,
        newBalance: updated.balance,
        adminId: senderId,
      });
      await sendCard(adapter, threadId, threadType, buffer, `Đã cộng ${fmt(parsed.value)} cho ${target.name}.`);
    } catch (err) {
      console.error("[napthe] Lỗi gửi ảnh xác nhận:", err?.message);
      try {
        await send(`Đã cộng ${fmt(parsed.value)} cho ${target.uid}. Số dư mới: ${fmt(updated.balance)}. (Không gửi được ảnh xác nhận.)`);
      } catch {
        // giao dịch đã thành công; không làm gì thêm
      }
    }
  },
};
