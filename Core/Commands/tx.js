import { playSolo, fmt } from "./data/GIAITRI/TaiXiu1v1/index.js";

function normalizeUid(v) {
  return String(v ?? "").trim();
}

function gateLabel(g) {
  if (g === "TAI") return "🔴 TÀI";
  if (g === "XIU") return "🔵 XỈU";
  return g || "—";
}

const USAGE = [
  "🎲  TÀI XỈU",
  "──────────────",
  "▸ .tx tài [số/all]",
  "▸ .tx xỉu [số/all]",
  "",
  "📌 Luật nhanh",
  "• 3 xúc xắc · Tổng 4–10 → XỈU",
  "• Tổng 11–17 → TÀI",
  "• Tổng 3 hoặc 18 → đặc biệt (thua)",
  "• Thắng nhận gấp đôi tiền cược",
].join("\n");

export default {
  name: "tx",
  description: "Tài Xỉu — chơi nhanh với nhà cái, nhận EXP",
  version: "2.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 2,
  aliases: ["taixiu1v1", "tx1v1"],
  noPrefix: false,

  async run({ adapter, message, args = [] }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userId = normalizeUid(message.data?.uidFrom);
    const userName = String(message.data?.dName || "Người chơi").slice(0, 40);
    const send = (text) => adapter.sendText({ threadId, threadType, text });

    if (!userId) return send("❌ Không xác định được UID.");

    const sub = String(args[0] || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (!sub || sub === "help" || sub === "huongdan") {
      return send(`${USAGE}\n\n👤 ${userName}`);
    }

    // Chế độ phòng đã tắt
    if (["tp", "join", "tao", "start", "batdau", "huy", "cancel", "status", "phong", "info"].includes(sub)) {
      return send(
        [
          "ℹ️ Chế độ đối kháng 1vs1 đã tắt.",
          "Chơi ngay bằng:",
          "▸ .tx tài [số/all]",
          "▸ .tx xỉu [số/all]",
          "",
          `👤 ${userName}`,
        ].join("\n")
      );
    }

    if (sub === "tai" || sub === "xiu") {
      const amountArg = args[1];
      if (!amountArg) {
        return send(
          `⚠️ Cú pháp: .tx ${sub === "tai" ? "tài" : "xỉu"} [số tiền/all]\n\n👤 ${userName}`
        );
      }

      try {
        const res = await playSolo(userId, sub, amountArg, userName);
        if (!res.success) {
          return send(`❌ ${res.error || res.message}\n\n👤 ${userName}`);
        }

        const diceStr = (res.dice || []).join(" · ");
        const lines = [
          "🎲  KẾT QUẢ TÀI XỈU",
          "──────────────",
          `🎯 Bạn chọn:  ${gateLabel(res.gate)}`,
          `💵 Tiền cược:  ${fmt(res.bet)}`,
          "",
          `🎲 Xúc xắc:  ${diceStr}`,
          `🔢 Tổng điểm:  ${res.total}`,
          "",
        ];

        if (res.special) {
          lines.push(
            "⚡ Kết quả đặc biệt (3 hoặc 18)",
            "💔 Bạn thua — mất tiền cược",
            `✨ EXP:  +${res.expGain}`
          );
        } else if (res.won) {
          lines.push(
            `🥇 THẮNG  ·  ${gateLabel(res.resultGate)}`,
            `💰 Nhận về:  ${fmt(res.payout)}  (x2)`,
            `✨ EXP:  +${res.expGain}`
          );
        } else {
          lines.push(
            `🥀 THUA  ·  Cửa thắng: ${gateLabel(res.resultGate)}`,
            `💸 Mất:  ${fmt(res.bet)}`,
            `✨ EXP:  +${res.expGain}`
          );
        }

        lines.push(
          "",
          `👛 Số dư:  ${fmt(res.balance)}`,
          "──────────────",
          `👤 ${userName}`
        );

        return send(lines.join("\n"));
      } catch (err) {
        console.error("[tx]", err);
        return send(`❌ Lỗi: ${err.message}\n\n👤 ${userName}`);
      }
    }

    return send(`${USAGE}\n\n👤 ${userName}`);
  },
};
