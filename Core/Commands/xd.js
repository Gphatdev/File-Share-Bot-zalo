import {
  createRoom,
  joinRoom,
  startGame,
  hitCard,
  standPlayer,
  settleRoom,
  cancelRoom,
  getRankList,
  findRoomByUser,
  findRoomByThread,
  findRoomByLobbyMsg,
  bindLobbyMessage,
  checkDeckImages,
  resolveCardImage,
  roomLobbyText,
  resultBoardText,
  handCaption,
  rankBoardText,
  fmt,
  getConfig,
} from "./data/GIAITRI/XiDach/index.js";

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
  "🎰  XÌ DÁCH",
  "──────────────",
  "▸ .xd tp [tiền] — mở sòng (tối đa 5)",
  "▸ Reply tin nhắn sòng — tham gia",
  "▸ .xd start — chủ sòng bắt đầu",
  "▸ Reply: rut / dung — rút hoặc dừng",
  "▸ .xd huy — hủy sòng",
  "▸ .xd rank — TOP 15",
  "",
  "📌 2 lá đầu · A linh hoạt · Xì Bàn / Xì Dách / Quắc",
].join("\n");

async function sendDMImages(adapter, uid, paths, caption) {
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
      console.error("[xd dm image]", e?.message);
      if (i === paths.length - 1) {
        await adapter.sendText({ threadId: uid, threadType: "user", text: caption });
      }
    }
  }
}

async function dealPrivateHands(adapter, room) {
  for (const p of room.players) {
    const paths = (p.cards || [])
      .map((c) => resolveCardImage(c.key))
      .filter(Boolean);
    const caption = handCaption(p);
    if (paths.length) {
      await sendDMImages(adapter, p.uid, paths, caption);
    } else {
      await adapter.sendText({
        threadId: p.uid,
        threadType: "user",
        text: caption,
      });
    }
  }
}

export default {
  name: "xd",
  description: "Xì Dách — sòng tối đa 5 người, rút/dừng, EXP",
  version: "1.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 1,
  aliases: ["xidach", "blackjack", "xì dách"],
  noPrefix: false,

  async run({ adapter, message, args = [] }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userId = normalizeUid(message.data?.uidFrom);
    const userName = String(message.data?.dName || "Người chơi").slice(0, 40);
    const send = (text) => adapter.sendText({ threadId, threadType, text });
    if (!userId) return send("❌ Không xác định UID.");

    const sub = String(args[0] || "").toLowerCase().trim();

    // ─── .xd tp ──────────────────────────────────────────────
    if (sub === "tp" || sub === "tao" || sub === "create") {
      const betArg = args[1];
      try {
        const res = await createRoom(userId, userName, threadId, betArg);
        if (!res.success) return send(`❌ ${res.error}`);

        const text = roomLobbyText(res.room);
        const sent = await send(text);
        // Bind message id for reply-join if adapter returns it
        const msgId =
          sent?.messageId ||
          sent?.msgId ||
          sent?.data?.msgId ||
          message.data?.msgId;
        if (msgId) bindLobbyMessage(res.room.roomId, msgId);
        // Also bind the outgoing message if structure differs
        return;
      } catch (err) {
        console.error("[xd tp]", err);
        return send(`❌ ${err.message}`);
      }
    }

    // ─── .xd start ───────────────────────────────────────────
    if (sub === "start" || sub === "batdau") {
      try {
        const res = await startGame(userId);
        if (!res.success) return send(`❌ ${res.error}`);

        await send(
          [
            "🎰 XÌ DÁCH BẮT ĐẦU",
            `👥 Người chơi: ${res.room.players.length}/5`,
            `💰 Cược: ${fmt(res.room.bet)}`,
            "🎴 Đang xào bài…",
            "🃏 Đang chia 2 lá cho mỗi người (tin nhắn riêng)…",
          ].join("\n")
        );

        await dealPrivateHands(adapter, res.room);

        // Auto-settle if everyone already done (all naturals)
        const allDone = res.room.players.every((p) =>
          ["stand", "bust", "done"].includes(p.status)
        );
        if (allDone) {
          const settled = await settleRoom(res.room.roomId);
          if (settled.success) {
            await send(resultBoardText(settled.room));
          }
        } else {
          await send(
            "⏳ Mỗi người kiểm tra tin nhắn riêng.\nReply **rut** hoặc **dung**."
          );
        }
        return;
      } catch (err) {
        console.error("[xd start]", err);
        return send(`❌ ${err.message}`);
      }
    }

    // ─── .xd huy ─────────────────────────────────────────────
    if (sub === "huy" || sub === "cancel" || sub === "hủy") {
      try {
        const res = await cancelRoom(userId);
        if (!res.success) return send(`❌ ${res.error}`);
        return send(
          [
            "🛑 SÒNG XÌ DÁCH ĐÃ HỦY",
            `🎰 Phòng: ${res.room.roomId}`,
            "Sòng đã được đóng. Tiền cược (nếu có) đã hoàn.",
          ].join("\n")
        );
      } catch (err) {
        return send(`❌ ${err.message}`);
      }
    }

    // ─── .xd rank ────────────────────────────────────────────
    if (sub === "rank" || sub === "top" || sub === "bxh") {
      const list = getRankList(15);
      return send(rankBoardText(list));
    }

    // ─── .xd checkdeck ───────────────────────────────────────
    if (sub === "checkdeck" || sub === "deck") {
      const d = checkDeckImages();
      return send(
        d.ok
          ? `✅ Đủ ${d.total}/52 ảnh bài (dùng chung Bài Cào).`
          : `⚠️ Thiếu ${d.missing.length}/${d.total}: ${d.missing.slice(0, 8).join(", ")}…`
      );
    }

    // ─── help ────────────────────────────────────────────────
    return send(USAGE);
  },

  async onMessage({ adapter, message }) {
    const data = message?.data || {};
    const userId = normalizeUid(data.uidFrom);
    if (!userId) return;

    let content = typeof data.content === "string" ? data.content.trim() : "";
    if (!content) return;

    // Ignore commands
    if (content.startsWith(".")) return;

    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userName = String(data.dName || "Người chơi").slice(0, 40);
    const n = norm(content);
    const isPrivate = message.type !== 1;

    // ── Join via reply to lobby ──────────────────────────────
    // Quote/reply id from ZCA structures
    const quoteId =
      data.quote?.globalMsgId ||
      data.quote?.msgId ||
      data.reply?.msgId ||
      data.msgIdQuote ||
      data.quoteMsgId ||
      null;

    const joinKeywords = [
      "thamgia",
      "join",
      "vao",
      "vao phong",
      "tham gia",
      "choi",
      "chơi",
      "+",
    ];

    if (!isPrivate) {
      // Reply to lobby message OR keyword join in group with active room
      const repliedRoom = quoteId ? findRoomByLobbyMsg(quoteId) : null;
      const threadRoom = findRoomByThread(threadId);
      const wantJoin =
        repliedRoom ||
        (threadRoom && threadRoom.status === "WAITING" && joinKeywords.includes(n)) ||
        (quoteId && threadRoom && threadRoom.status === "WAITING");

      if (wantJoin) {
        try {
          const res = await joinRoom(
            userId,
            userName,
            threadId,
            repliedRoom ? quoteId : null
          );
          if (!res.success) {
            await adapter.sendText({
              threadId,
              threadType: "group",
              text: `❌ ${res.error}`,
            });
            return;
          }
          await adapter.sendText({
            threadId,
            threadType: "group",
            text: [
              "🎴 THAM GIA SÒNG THÀNH CÔNG",
              `👤 ${userName}`,
              `🎰 Phòng: ${res.room.roomId}`,
              `👥 ${res.room.players.length}/5`,
              "",
              roomLobbyText(res.room),
            ].join("\n"),
          });
        } catch (err) {
          await adapter.sendText({
            threadId,
            threadType: "group",
            text: `❌ ${err.message}`,
          });
        }
        return;
      }
    }

    // ── Hit / Stand (private or group) ───────────────────────
    const isHit = ["rut", "hit", "draw", "them"].includes(n);
    const isStand = ["dung", "stand", "stop", "duong", "dừng"].includes(n);
    if (!isHit && !isStand) return;

    const room = findRoomByUser(userId);
    if (!room || room.status !== "PLAYING") return;

    try {
      if (isHit) {
        const res = await hitCard(userId);
        if (!res.success) {
          if (res.already) return;
          await adapter.sendText({
            threadId: isPrivate ? userId : room.threadId,
            threadType: isPrivate ? "user" : "group",
            text: `⚠️ ${res.error}`,
          });
          return;
        }

        const paths = (res.player.cards || [])
          .map((c) => resolveCardImage(c.key))
          .filter(Boolean);
        let caption;
        if (res.player.handType === "quac") {
          caption = [
            "💥 BẠN ĐÃ QUẮC!",
            `🃏 Lá mới: ${res.newCard?.rank || "?"}`,
            `🎯 Tổng điểm: ${res.player.points}`,
            "❌ Bạn thua ván này.",
          ].join("\n");
        } else {
          caption = [
            "🎴 BẠN ĐÃ RÚT 1 LÁ",
            `🃏 Lá mới: ${res.newCard?.rank || "?"}`,
            `🎯 Tổng điểm: ${res.player.points}`,
            "",
            "👉 rut = Rút tiếp",
            "👉 dung = Dừng",
          ].join("\n");
        }

        if (paths.length) {
          await sendDMImages(adapter, userId, paths.slice(-1), caption);
          // also send full hand summary
          await adapter.sendText({
            threadId: userId,
            threadType: "user",
            text: handCaption(res.player),
          });
        } else {
          await adapter.sendText({
            threadId: userId,
            threadType: "user",
            text: caption,
          });
        }

        if (res.allDone) {
          const settled = await settleRoom(res.room.roomId);
          if (settled.success) {
            await adapter.sendText({
              threadId: res.room.threadId,
              threadType: "group",
              text: resultBoardText(settled.room),
            });
          }
        } else if (res.player.handType === "quac") {
          await adapter.sendText({
            threadId: res.room.threadId,
            threadType: "group",
            text: `💥 ${res.player.name} đã QUẮC (${res.player.points}).`,
          });
        }
        return;
      }

      if (isStand) {
        const res = await standPlayer(userId);
        if (!res.success) {
          if (res.already) return;
          return;
        }

        await adapter.sendText({
          threadId: userId,
          threadType: "user",
          text: [
            "🛑 BẠN ĐÃ DỪNG",
            `🎯 Tổng điểm: ${res.player.points}`,
            "⏳ Đang chờ những người chơi khác…",
          ].join("\n"),
        });

        await adapter.sendText({
          threadId: res.room.threadId,
          threadType: "group",
          text: `🛑 ${res.player.name} đã dừng ở ${res.player.points} điểm.`,
        });

        if (res.allDone) {
          const settled = await settleRoom(res.room.roomId);
          if (settled.success) {
            await adapter.sendText({
              threadId: res.room.threadId,
              threadType: "group",
              text: resultBoardText(settled.room),
            });
          }
        }
      }
    } catch (err) {
      console.error("[xd onMessage]", err);
    }
  },
};
