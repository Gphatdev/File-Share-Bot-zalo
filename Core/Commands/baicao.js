import {
  createRoom,
  joinRoom,
  startGame,
  playerReady,
  settleRoom,
  cancelRoom,
  getRankList,
  findRoomByUser,
  findRoomByThread,
  checkDeckImages,
  resolveCardImage,
  roomLobbyText,
  readyProgressText,
  resultBoardText,
  handCaption,
  fmt,
  getConfig,
} from "./data/GIAITRI/BaiCao/index.js";

function normalizeUid(v) {
  return String(v ?? "").trim();
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const USAGE = [
  "🃏  BÀI CÀO 5 NGƯỜI",
  "──────────────",
  "▸ .baicao tp [tiền] — mở sòng",
  "▸ Reply: tham gia / join — vào sòng",
  "▸ .baicao start — chủ sòng bắt đầu",
  "▸ Reply: úp / up — xác nhận bài",
  "▸ .baicao huy — hủy sòng",
  "▸ .baicao rank — xếp hạng",
  "",
  "📌 Mỗi người 3 lá · Điểm % 10",
  "💰 Cược mặc định theo mức sòng",
].join("\n");

export default {
  name: "baicao",
  description: "Bài Cào 5 người — sòng bài, chia bài riêng, EXP",
  version: "1.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 1,
  aliases: ["bc", "caoro", "bài cào"],
  noPrefix: false,

  async run({ adapter, message, args = [] }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userId = normalizeUid(message.data?.uidFrom);
    const userName = String(message.data?.dName || "Người chơi").slice(0, 40);
    const send = (text) => adapter.sendText({ threadId, threadType, text });
    const sendDM = (uid, text) =>
      adapter.sendText({ threadId: uid, threadType: "user", text });
    const sendDMImages = async (uid, paths, caption) => {
      // Gửi lần lượt 3 ảnh + caption ở ảnh cuối
      for (let i = 0; i < paths.length; i++) {
        const cap = i === paths.length - 1 ? caption : "";
        try {
          await adapter.sendImage({
            threadId: uid,
            threadType: "user",
            imagePath: paths[i],
            caption: cap || undefined,
          });
        } catch (e) {
          console.error("[baicao] send card image:", e?.message);
        }
      }
    };

    if (!userId) return send("❌ Không xác định được UID.");

    const sub = norm(args[0] || "");
    const arg1 = args[1];

    if (!sub || sub === "help" || sub === "huongdan") {
      return send(`${USAGE}\n\n👤 ${userName}`);
    }

    // ─── .baicao tp ──────────────────────────────────────────
    if (sub === "tp" || sub === "tao" || sub === "create") {
      try {
        const res = await createRoom(userId, userName, threadId, arg1);
        if (!res.success) return send(`❌ ${res.error}\n\n👤 ${userName}`);
        const msg = [
          roomLobbyText(res.room),
          "",
          "🎰 Sòng bài đã được mở!",
          "📩 Reply tin nhắn nhóm: tham gia / join",
          `👤 Chủ sòng: ${userName}`,
        ].join("\n");
        return send(msg);
      } catch (err) {
        console.error("[baicao tp]", err);
        return send(`❌ Lỗi: ${err.message}`);
      }
    }

    // ─── .baicao join (backup nếu không reply) ───────────────
    if (sub === "join" || sub === "thamgia" || sub === "vao") {
      try {
        const res = await joinRoom(userId, userName, threadId);
        if (!res.success) return send(`❌ ${res.error}\n\n👤 ${userName}`);
        return send(roomLobbyText(res.room) + `\n\n✅ ${userName} đã vào sòng!`);
      } catch (err) {
        return send(`❌ ${err.message}`);
      }
    }

    // ─── .baicao start ───────────────────────────────────────
    if (sub === "start" || sub === "batdau") {
      try {
        const deck = checkDeckImages();
        if (!deck.ok) {
          const list = deck.missing.slice(0, 12).join(", ");
          const more = deck.missing.length > 12 ? ` … (+${deck.missing.length - 12})` : "";
          return send(
            [
              "⚠️ BÀI CÀO — THIẾU ẢNH LÁ BÀI",
              `❌ Thiếu ${deck.missing.length}/${deck.total} lá`,
              `• ${list}${more}`,
              "",
              "📁 Thêm ảnh vào:",
              "Core/Commands/data/GIAITRI/BaiCao/cards/",
              "Ví dụ: A_co.png, K_bich.png …",
            ].join("\n")
          );
        }

        const res = await startGame(userId);
        if (!res.success) return send(`❌ ${res.error}\n\n👤 ${userName}`);

        const r = res.room;
        await send(
          [
            "╭━━━━ 🎰 SÒNG BẮT ĐẦU ━━━━╮",
            "│",
            `│  🆔 ${r.roomId}`,
            `│  👥 ${r.players.length} người`,
            `│  💰 Cược: ${fmt(r.bet)} / người`,
            "│  🃏 Đang chia bài riêng…",
            "│",
            "╰━━━━━━━━━━━━━━━━╯",
          ].join("\n")
        );

        // Gửi bài riêng từng người
        for (const p of r.players) {
          const paths = [];
          for (const c of p.cards || []) {
            const img = resolveCardImage(c.key);
            if (img) paths.push(img);
          }
          const caption = handCaption(r, p);
          if (paths.length === 3) {
            await sendDMImages(p.uid, paths, caption);
          } else {
            // Fallback text nếu thiếu ảnh runtime
            await sendDM(p.uid, caption);
          }
        }

        await send(
          [
            "🎴 Bài đã gửi riêng cho từng người.",
            "📩 Reply tin nhắn bài của bạn: úp / up",
            `⏳ Chờ xác nhận: 0/${r.players.length}`,
          ].join("\n")
        );
      } catch (err) {
        console.error("[baicao start]", err);
        return send(`❌ Lỗi start: ${err.message}`);
      }
      return;
    }

    // ─── .baicao huy ─────────────────────────────────────────
    if (sub === "huy" || sub === "cancel") {
      try {
        const res = await cancelRoom(userId);
        if (!res.success) return send(`❌ ${res.error}\n\n👤 ${userName}`);
        const lines = [
          "╭━━━━ 🚫 HỦY SÒNG ━━━━╮",
          "│",
          `│  🎰 Phòng: ${res.room.roomId}`,
          "│  ❌ Sòng bài đã hủy",
          "│",
        ];
        if (res.refunds?.length) {
          for (const rf of res.refunds) {
            lines.push(`│  💰 ${rf.name}: hoàn ${fmt(rf.amount)}`);
          }
        } else {
          lines.push("│  Không có tiền cần hoàn");
        }
        lines.push("│", "╰━━━━━━━━━━━━━━━━╯", `👑 Chủ sòng: ${userName}`);
        return send(lines.join("\n"));
      } catch (err) {
        return send(`❌ ${err.message}`);
      }
    }

    // ─── .baicao rank ────────────────────────────────────────
    if (sub === "rank" || sub === "bxh" || sub === "top") {
      const list = getRankList(10);
      if (!list.length) {
        return send(`Chưa có dữ liệu xếp hạng Bài Cào.\n\n👤 ${userName}`);
      }
      const medal = ["🥇", "🥈", "🥉"];
      const lines = ["╭━━━ 🏆 BÀI CÀO RANK ━━━╮", "│", "│  🎰 TOP CAO THỦ", "│"];
      list.forEach((s, i) => {
        const icon = medal[i] || `#${i + 1}`;
        lines.push(
          `│  ${icon} ${s.name || s.userId}`,
          `│  🏆 ${s.wins} thắng / ${s.plays} trận`,
          `│  💰 +${fmt(s.totalWinMoney || 0)}`,
          "│"
        );
      });
      lines.push("╰━━━━━━━━━━━━━━━━╯", `👤 ${userName}`);
      return send(lines.join("\n"));
    }

    // ─── .baicao status ──────────────────────────────────────
    if (sub === "status" || sub === "phong") {
      const r = findRoomByUser(userId) || findRoomByThread(threadId);
      if (!r) return send(`Không có sòng đang mở.\n\n👤 ${userName}`);
      return send(roomLobbyText(r));
    }

    // ─── .baicao checkdeck ───────────────────────────────────
    if (sub === "checkdeck" || sub === "deck") {
      const d = checkDeckImages();
      if (d.ok) return send(`✅ Đủ ${d.total}/52 ảnh lá bài.\n\n👤 ${userName}`);
      return send(
        `❌ Thiếu ${d.missing.length} lá:\n${d.missing.slice(0, 20).join(", ")}\n\n👤 ${userName}`
      );
    }

    return send(`${USAGE}\n\n👤 ${userName}`);
  },

  async onMessage({ adapter, message, config }) {
    const data = message?.data || {};
    const userId = normalizeUid(data.uidFrom);
    const threadId = message.threadId;
    if (!userId || !threadId) return;

    const content = typeof data.content === "string" ? data.content.trim() : "";
    if (!content) return;

    const prefix = config?.botPrefix || ".";
    if (content.startsWith(prefix)) return;

    const threadType = message.type === 1 ? "group" : "user";
    const userName = String(data.dName || "Người chơi").slice(0, 40);
    const sendGroup = (text) =>
      adapter.sendText({ threadId, threadType, text });
    // DM replies come with threadId = user id
    const isPrivate = message.type !== 1;

    const n = norm(content);

    // Join keywords in group
    if (!isPrivate && ["thamgia", "join", "vao", "vao phong", "tham gia"].includes(n)) {
      try {
        const res = await joinRoom(userId, userName, threadId);
        if (!res.success) {
          await sendGroup(`❌ ${res.error}`);
          return;
        }
        await sendGroup(roomLobbyText(res.room) + `\n\n✅ ${userName} đã vào sòng!`);
      } catch (err) {
        await sendGroup(`❌ ${err.message}`);
      }
      return;
    }

    // Ready: up / úp
    if (["up", "úp", "upbai", "ups", "san sang", "sansang"].includes(n) || n === "up") {
      try {
        const res = await playerReady(userId);
        if (!res.success) {
          if (res.already) return;
          // silent if not in ready phase
          if (res.error?.includes("Chưa đến lúc")) return;
          const r = findRoomByUser(userId);
          if (r) {
            await adapter.sendText({
              threadId: r.threadId,
              threadType: "group",
              text: `⚠️ ${userName}: ${res.error}`,
            });
          }
          return;
        }

        const groupId = res.room.threadId;
        await adapter.sendText({
          threadId: groupId,
          threadType: "group",
          text: readyProgressText(res.room, res.player.name),
        });

        if (res.allReady) {
          await adapter.sendText({
            threadId: groupId,
            threadType: "group",
            text: [
              "🎰 TẤT CẢ ĐÃ SẴN SÀNG!",
              "🃏 SÒNG BÀI CHÍNH THỨC MỞ!",
              "🎲 Đang lật bài…",
            ].join("\n"),
          });

          const settled = await settleRoom(res.room.roomId);
          if (settled.success) {
            await adapter.sendText({
              threadId: groupId,
              threadType: "group",
              text: resultBoardText(settled.room),
            });
          } else {
            await adapter.sendText({
              threadId: groupId,
              threadType: "group",
              text: `❌ Lỗi kết quả: ${settled.error}`,
            });
          }
        }
      } catch (err) {
        console.error("[baicao ready]", err);
      }
    }
  },
};
