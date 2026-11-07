import { unlinkSync } from "node:fs";
import {
  createSession,
  resolveChoice,
  getSession,
  boardMessage,
  resultMessage,
} from "./data/GIAITRI/BauCua/index.js";
import {
  renderBoard,
  renderResult,
  saveBufferToTempImage,
} from "./data/GIAITRI/BauCua/canvas.js";

function normalizeUid(v) {
  return String(v ?? "").trim();
}

const USAGE = [
  "╭━━━━━━ 🎲 ━━━━━━╮",
  "│",
  "│ 🎊 BẦU CUA",
  "│ ━━━━━━━━━━━━━",
  "│",
  "│ ▸ .bcua [tiền]",
  "│ ▸ .bcua x2 [tiền]",
  "│",
  "│ 🎃1 Bầu  🦀2 Cua  🦐3 Tôm",
  "│ 🐟4 Cá   🐓5 Gà   🦌6 Nai",
  "│",
  "│ Reply bàn bằng tên hoặc số",
  "│",
  "╰━━━━━━━━━━━━━━━━╯",
].join("\n");

async function sendImageCard(adapter, threadId, threadType, buffer, caption, fallbackText) {
  let imagePath;
  try {
    imagePath = saveBufferToTempImage(buffer);
    await adapter.sendImage({ threadId, threadType, imagePath, caption });
  } catch (error) {
    console.error("[bcua image]", error);
    await adapter.sendText({
      threadId,
      threadType,
      text: `${fallbackText}\n\n⚠️ Không gửi được ảnh Bầu Cua: ${error?.message || "lỗi không xác định"}`,
    });
  } finally {
    if (imagePath) {
      try {
        unlinkSync(imagePath);
      } catch (error) {
        console.error("[bcua image cleanup]", error);
      }
    }
  }
}

export default {
  name: "bcua",
  description: "Bầu Cua — chọn linh vật, tung 3 mặt, nhận EXP",
  version: "1.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 2,
  aliases: ["baucua", "bau", "bầucua"],
  noPrefix: false,

  async run({ adapter, message, args = [] }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userId = normalizeUid(message.data?.uidFrom);
    const userName = String(message.data?.dName || "Người chơi").slice(0, 40);
    const send = (text) => adapter.sendText({ threadId, threadType, text });

    if (!userId) return send("❌ Không xác định được UID.");

    const a0 = String(args[0] || "").toLowerCase().trim();
    const a1 = String(args[1] || "").trim();

    if (!a0 || a0 === "help" || a0 === "huongdan") {
      const caption = `${USAGE}\n👤 ${userName}`;
      return sendImageCard(
        adapter,
        threadId,
        threadType,
        renderBoard({ guide: true }),
        caption,
        caption,
      );
    }

    let mode = "normal";
    let betRaw = a0;

    if (a0 === "x2" || a0 === "nhandoi") {
      mode = "x2";
      betRaw = a1;
      if (!betRaw) {
        return send(`⚠️ Cú pháp: .bcua x2 [tiền cược]\nVí dụ: .bcua x2 10000\n\n👤 ${userName}`);
      }
    }

    try {
      const res = await createSession(userId, threadId, betRaw, mode, userName);
      if (!res.success) {
        return send(`❌ ${res.error}\n\n👤 ${userName}`);
      }
      const text = boardMessage(res.session, res.balance);
      return sendImageCard(
        adapter,
        threadId,
        threadType,
        renderBoard({ session: res.session, balance: res.balance }),
        text,
        text,
      );
    } catch (err) {
      console.error("[bcua]", err);
      return send(`❌ Lỗi: ${err.message}\n\n👤 ${userName}`);
    }
  },

  async onMessage({ adapter, message, config }) {
    const data = message?.data || {};
    const userId = normalizeUid(data.uidFrom);
    const threadId = message.threadId;
    if (!userId || !threadId) return;

    const session = getSession(userId, threadId);
    if (!session) return;

    const content = typeof data.content === "string" ? data.content.trim() : "";
    if (!content) return;

    const prefix = config?.botPrefix || ".";
    if (content.startsWith(prefix)) return;

    const threadType = message.type === 1 ? "group" : "user";
    const send = (text) => adapter.sendText({ threadId, threadType, text });

    try {
      const res = await resolveChoice(userId, threadId, content);
      if (!res.success) {
        if (res.keepSession) {
          return send(`⚠️ ${res.error}`);
        }
        return send(`❌ ${res.error}`);
      }
      const text = resultMessage(res);
      return sendImageCard(
        adapter,
        threadId,
        threadType,
        renderResult(res),
        text,
        text,
      );
    } catch (err) {
      console.error("[bcua onMessage]", err);
      return send(`❌ Lỗi xử lý: ${err.message}`);
    }
  },
};
