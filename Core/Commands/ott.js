import { unlinkSync } from "node:fs";
import {
  createRoom,
  setRoomMessageIds,
  joinRoom,
  startRoom,
  setChoice,
  cancelRoom,
  getRoom,
  deleteRoom,
  setRoomTimeout,
  isHeartIcon,
  extractReactionMeta,
  normalizeChoice,
  decideWinner,
  CHOICES,
  STATUS,
  findPlayingByUid,
} from "./data/GIAITRI/Ott/rooms.js";
import { getTopList, updatePlayerStats, ensureDataFiles } from "./data/GIAITRI/Ott/storage.js";
import { renderResultCanvas, saveBuffer } from "./data/GIAITRI/Ott/canvas.js";
import { addExp, unlockAchievement } from "./data/GIAITRI/PlayerProfile/index.js";

const CHOICE_TIMEOUT_MS = 60_000;
const EXP_WIN = 50;
const EXP_LOSE = 25;
const VUA_OTT = {
  id: "ott_vua_ott",
  name: "Vua OTT",
  description: "Đứng Top 1 bảng xếp hạng Oẳn Tù Tì",
  icon: "👑",
};

function uid(v) {
  return String(v ?? "").trim();
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

async function resolveAvatar(userId, adapter) {
  try {
    const mod = await import("./data/GIAITRI/PlayerProfile/index.js");
    if (typeof mod.getPlayerAvatarPath === "function") {
      const r = await mod.getPlayerAvatarPath(userId, { adapter });
      return r?.path || null;
    }
  } catch {}
  return null;
}

async function resolveName(adapter, userId, fallback) {
  try {
    const api = adapter?.raw || adapter?.api || adapter;
    if (api && typeof api.getUserInfo === "function") {
      const info = await api.getUserInfo(userId);
      const p =
        info?.changed_profiles?.[userId] ||
        info?.unchanged_profiles?.[userId] ||
        info?.[userId];
      if (p?.displayName || p?.zaloName || p?.name) {
        return p.displayName || p.zaloName || p.name;
      }
    }
  } catch {}
  return fallback || "Người chơi";
}

function extractMsgIds(sendResult) {
  // zca-mt: { message: { msgId, cliMsgId }, attachment: [] }
  const m = sendResult?.message || sendResult || {};
  return {
    msgId: m.msgId ?? m.messageId ?? sendResult?.msgId ?? null,
    cliMsgId: m.cliMsgId ?? sendResult?.cliMsgId ?? null,
  };
}

async function finishMatch(adapter, room, logger) {
  const groupId = room.groupId;
  const [p1, p2] = room.players;
  const c1 = room.choices[p1.uid];
  const c2 = room.choices[p2.uid];
  if (!c1 || !c2) return;

  const result = decideWinner(c1, c2);
  let exp1 = 0, exp2 = 0;

  if (result === "DRAW") {
    updatePlayerStats(p1.uid, p1.name, "draw");
    updatePlayerStats(p2.uid, p2.name, "draw");
  } else if (result === "P1") {
    exp1 = EXP_WIN;
    exp2 = EXP_LOSE;
    updatePlayerStats(p1.uid, p1.name, "win");
    updatePlayerStats(p2.uid, p2.name, "lose");
  } else {
    exp1 = EXP_LOSE;
    exp2 = EXP_WIN;
    updatePlayerStats(p1.uid, p1.name, "lose");
    updatePlayerStats(p2.uid, p2.name, "win");
  }

  if (exp1 > 0) {
    try { await addExp(p1.uid, exp1, { source: "ott" }); } catch (e) { logger?.warn?.("[ott] exp1", e?.message); }
  }
  if (exp2 > 0) {
    try { await addExp(p2.uid, exp2, { source: "ott" }); } catch (e) { logger?.warn?.("[ott] exp2", e?.message); }
  }

  // Achievement Vua OTT for top1
  try {
    const top = getTopList(1);
    if (top[0]) {
      await unlockAchievement(top[0].uid, VUA_OTT);
    }
  } catch (e) {
    logger?.warn?.("[ott] achievement", e?.message);
  }

  const av1 = await resolveAvatar(p1.uid, adapter);
  const av2 = await resolveAvatar(p2.uid, adapter);

  let imagePath = null;
  try {
    const buf = await renderResultCanvas({
      p1: { name: p1.name, avatarPath: av1, choice: c1 },
      p2: { name: p2.name, avatarPath: av2, choice: c2 },
      result,
      exp1,
      exp2,
    });
    imagePath = saveBuffer(buf, "ott_result");
    await adapter.sendImage({
      threadId: groupId,
      threadType: "group",
      imagePath,
      caption: result === "DRAW"
        ? "🤝 HÒA!"
        : result === "P1"
          ? `🏆 ${p1.name} thắng!`
          : `🏆 ${p2.name} thắng!`,
    });
  } catch (e) {
    logger?.error?.("[ott] canvas", e?.message);
    const ch1 = CHOICES[c1], ch2 = CHOICES[c2];
    await adapter.sendText({
      threadId: groupId,
      threadType: "group",
      text: [
        "🎮 KẾT QUẢ OẢN TÙ TÌ",
        `${p1.name}: ${ch1.icon} ${ch1.name}`,
        `${p2.name}: ${ch2.icon} ${ch2.name}`,
        result === "DRAW" ? "🤝 HÒA" : result === "P1" ? `🏆 ${p1.name} thắng (+${exp1} EXP)` : `🏆 ${p2.name} thắng (+${exp2} EXP)`,
      ].join("\n"),
    });
  } finally {
    if (imagePath) {
      try { unlinkSync(imagePath); } catch {}
    }
  }

  deleteRoom(groupId);
}

const USAGE = [
  "🎮  OẢN TÙ TÌ",
  "────────────────",
  "▸ .ott tp — tạo phòng (chủ phòng)",
  "▸ ❤️ thả tim vào tin nhắn phòng — tham gia",
  "▸ .ott start — chủ phòng bắt đầu",
  "▸ .ott huy — hủy phòng/trận",
  "▸ .ott top — TOP 10",
  "",
  "✊ BÚA  ·  ✌️ KÉO  ·  ✋ BAO",
].join("\n");

export default {
  name: "ott",
  description: "Oẳn Tù Tì 2 người — tạo phòng, thả tim tham gia, EXP, Canvas",
  version: "1.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 1,
  aliases: ["oantuti", "oẳntùtì", "rps"],
  noPrefix: false,

  async run({ adapter, message, args = [], logger }) {
    ensureDataFiles();
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userId = uid(message.data?.uidFrom);
    const userName = String(message.data?.dName || "Người chơi").slice(0, 40);
    const send = (text) => adapter.sendText({ threadId, threadType, text });

    if (!userId) return send("❌ Không xác định UID.");

    const sub = normalizeText(args[0] || "");

    if (!sub || sub === "help" || sub === "huongdan") {
      return send(USAGE);
    }

    // ─── .ott tp ─────────────────────────────────────────────
    if (sub === "tp" || sub === "tao" || sub === "create") {
      if (threadType !== "group") {
        return send("⚠️ Oẳn Tù Tì chỉ chơi trong nhóm.");
      }
      const avatar = await resolveAvatar(userId, adapter);
      const res = await createRoom(threadId, { uid: userId, name: userName, avatar });
      if (!res.ok) {
        const room = res.existing;
        if (room.players.length >= 2) {
          return send(
            [
              "⚠️ PHÒNG ĐÃ ĐỦ 2 NGƯỜI!",
              `👤 ${room.players[0]?.name}`,
              "VS",
              `👤 ${room.players[1]?.name}`,
              "⏳ Hãy chờ trận đấu kết thúc.",
            ].join("\n")
          );
        }
        return send(
          [
            "⚠️ GROUP ĐANG CÓ PHÒNG OẢN TÙ TÌ!",
            `👥 Người chơi: ${room.players.length}/2`,
            "❤️ Hãy thả tim vào tin nhắn phòng để tham gia.",
          ].join("\n")
        );
      }

      const text = [
        "🎮 OẢN TÙ TÌ",
        `👑 Chủ phòng: ${userName}`,
        "👥 Người chơi: 1/2",
        "🟢 PHÒNG ĐANG CHỜ",
        "",
        "❤️ THẢ TIM TIN NHẮN NÀY ĐỂ THAM GIA",
        "⏳ Đang chờ người chơi thứ 2...",
      ].join("\n");

      const sent = await send(text);
      const ids = extractMsgIds(sent);
      await setRoomMessageIds(threadId, ids.msgId, ids.cliMsgId);
      if (!ids.msgId && !ids.cliMsgId) {
        logger?.warn?.("[ott] Không lấy được msgId từ sendText — reaction có thể không khớp.");
      }
      return;
    }

    // ─── .ott start ──────────────────────────────────────────
    if (sub === "start" || sub === "batdau") {
      if (threadType !== "group") return send("⚠️ Chỉ dùng trong nhóm.");
      const res = await startRoom(threadId, userId);
      if (!res.ok) {
        if (res.code === "NO_ROOM") return send("⚠️ Chưa có phòng. Dùng .ott tp để tạo.");
        if (res.code === "NOT_HOST") return send("⚠️ CHỈ CHỦ PHÒNG MỚI CÓ THỂ BẮT ĐẦU TRẬN!");
        if (res.code === "NEED_PLAYERS") {
          return send(
            [
              "⚠️ CHƯA ĐỦ NGƯỜI!",
              `👥 Hiện tại: ${res.room?.players?.length || 0}/2`,
              "❤️ Hãy chờ người chơi thứ 2 thả tim vào tin nhắn phòng.",
            ].join("\n")
          );
        }
        if (res.code === "ALREADY_STARTED") return send("⚠️ Trận đã bắt đầu.");
        return send("⚠️ Không thể bắt đầu.");
      }

      const room = res.room;
      const [a, b] = room.players;
      await send(
        [
          "🎮 OẢN TÙ TÌ BẮT ĐẦU!",
          `👑 ${a.name}`,
          `⚔️ ${b.name}`,
          "",
          "🤫 Hai người chơi hãy kiểm tra tin nhắn riêng từ bot.",
          "✊ BÚA  ·  ✌️ KÉO  ·  ✋ BAO",
          "⏳ Hãy lựa chọn trước khi hết thời gian!",
        ].join("\n")
      );

      const dmText = [
        "🎮 OẢN TÙ TÌ",
        "Trận đấu đã bắt đầu!",
        "",
        "Hãy chọn một trong ba:",
        "✊ BÚA",
        "✌️ KÉO",
        "✋ BAO",
        "",
        "💬 Trả lời bằng chữ: búa / kéo / bao",
        "⏳ Thời gian: 60 giây",
      ].join("\n");

      for (const p of room.players) {
        try {
          await adapter.sendText({ threadId: p.uid, threadType: "user", text: dmText });
        } catch (e) {
          logger?.warn?.("[ott] DM fail", p.uid, e?.message);
          await send(`⚠️ Không gửi được tin nhắn riêng cho ${p.name}. Hãy inbox bot trước.`);
        }
      }

      // timeout
      const tid = setTimeout(async () => {
        const r = getRoom(threadId);
        if (!r || r.status !== STATUS.PLAYING) return;
        const both = r.players.every((p) => r.choices[p.uid]);
        if (both) return;
        try {
          await adapter.sendText({
            threadId,
            threadType: "group",
            text: [
              "⏰ TRẬN ĐẤU ĐÃ HẾT THỜI GIAN!",
              "Một người chơi chưa đưa ra lựa chọn.",
              "🎮 Trận đấu đã bị hủy.",
            ].join("\n"),
          });
        } catch {}
        deleteRoom(threadId);
      }, CHOICE_TIMEOUT_MS);
      setRoomTimeout(threadId, tid);
      return;
    }

    // ─── .ott huy ────────────────────────────────────────────
    if (sub === "huy" || sub === "cancel" || sub === "stop") {
      if (threadType !== "group") return send("⚠️ Chỉ dùng trong nhóm.");
      let isAdmin = false;
      try {
        if (typeof adapter.getGroupAdmins === "function") {
          const admins = await adapter.getGroupAdmins(threadId);
          isAdmin = Array.isArray(admins) && admins.map(String).includes(userId);
        }
      } catch {}
      const res = await cancelRoom(threadId, userId, isAdmin);
      if (!res.ok) {
        if (res.code === "NO_ROOM") return send("⚠️ Không có phòng OTT nào đang mở.");
        if (res.code === "NOT_HOST") return send("⚠️ Chỉ chủ phòng hoặc admin mới hủy được.");
        return send("⚠️ Không thể hủy.");
      }
      return send("🛑 ĐÃ HỦY TRẬN OẢN TÙ TÌ\nPhòng chơi hiện tại đã được đóng.");
    }

    // ─── .ott top ────────────────────────────────────────────
    if (sub === "top" || sub === "rank" || sub === "bxh") {
      const list = getTopList(10);
      if (!list.length) return send("🏆 Chưa có dữ liệu xếp hạng OTT.");
      const medals = ["🥇", "🥈", "🥉"];
      const lines = ["🏆 TOP OẢN TÙ TÌ", "────────────────"];
      list.forEach((u, i) => {
        const m = medals[i] || `${i + 1}.`;
        lines.push(
          `${m} ${u.name}`,
          `├─ 🏆 ${u.wins} thắng`,
          `├─ 🎮 ${u.games} trận`,
          `└─ 📊 Win Rate: ${u.winRate}%`
        );
      });
      return send(lines.join("\n"));
    }

    return send(USAGE);
  },

  /** Reaction ❤️ vào tin nhắn phòng */
  async onReaction({ adapter, reaction, logger }) {
    const meta = extractReactionMeta(reaction);
    if (!meta.threadId || !meta.uid) return;
    if (!isHeartIcon(meta.icon)) return;

    const room = getRoom(meta.threadId);
    if (!room) return;
    if (room.status !== STATUS.WAITING && room.status !== STATUS.READY) return;

    // messageId must match
    const mid = meta.msgId || meta.cliMsgId;
    const roomIds = [room.messageId, room.cliMsgId].filter((v) => v != null && v !== "").map(String);
    if (roomIds.length && meta.msgIds.length) {
      // khớp nếu BẤT KỲ id nào của tin bị thả tim trùng id tin phòng (gMsgID/cMsgID)
      if (!meta.msgIds.some((id) => roomIds.includes(id))) return; // thả tim vào tin khác
    }
    // không lấy được id lúc tạo phòng hoặc reaction không kèm id -> cho tham gia theo nhóm (degraded)

    const name = await resolveName(adapter, meta.uid, meta.name);
    const avatar = await resolveAvatar(meta.uid, adapter);
    const res = await joinRoom(
      meta.threadId,
      { uid: meta.uid, name, avatar },
      null // đã khớp tin nhắn ở trên
    );

    if (!res.ok) {
      if (res.code === "ALREADY") {
        try {
          await adapter.sendText({
            threadId: meta.threadId,
            threadType: "group",
            text: `⚠️ ${name} đã tham gia phòng này rồi!`,
          });
        } catch {}
      } else if (res.code === "FULL") {
        try {
          await adapter.sendText({
            threadId: meta.threadId,
            threadType: "group",
            text: [
              "⚠️ PHÒNG ĐÃ ĐẦY!",
              "Phòng hiện tại chỉ cho phép tối đa 2 người chơi.",
              `🏆 ${res.room.players[0]?.name} VS ${res.room.players[1]?.name}`,
            ].join("\n"),
          });
        } catch {}
      }
      return;
    }

    const r = res.room;
    if (r.players.length >= 2) {
      await adapter.sendText({
        threadId: meta.threadId,
        threadType: "group",
        text: [
          "✅ ĐÃ ĐỦ NGƯỜI CHƠI!",
          "🎮 OẢN TÙ TÌ",
          `👑 ${r.players[0].name}`,
          `⚔️ ${r.players[1].name}`,
          "👥 2/2",
          "🟢 PHÒNG ĐÃ SẴN SÀNG!",
          "👑 Chủ phòng sử dụng .ott start để bắt đầu.",
        ].join("\n"),
      });
    } else {
      await adapter.sendText({
        threadId: meta.threadId,
        threadType: "group",
        text: `✅ ${name} đã tham gia!\n👥 Người chơi: ${r.players.length}/2`,
      });
    }
  },

  /** DM choice */
  async onMessage({ adapter, message, logger }) {
    const data = message?.data || {};
    const userId = uid(data.uidFrom);
    if (!userId) return;

    const content = typeof data.content === "string" ? data.content.trim() : "";
    if (!content || content.startsWith(".") || content.startsWith("!") || content.startsWith("/")) return;

    const choice = normalizeChoice(content);
    if (!choice) return;

    const room = findPlayingByUid(userId);
    if (!room) return;

    const res = await setChoice(room.groupId, userId, choice);
    if (!res.ok) {
      if (res.code === "ALREADY_CHOSEN") {
        try {
          await adapter.sendText({
            threadId: userId,
            threadType: "user",
            text: "⚠️ Bạn đã chọn rồi!\nVui lòng chờ kết quả.",
          });
        } catch {}
      }
      return;
    }

    const ch = CHOICES[choice];
    try {
      await adapter.sendText({
        threadId: userId,
        threadType: "user",
        text: `✅ Bạn đã chọn: ${ch.icon} ${ch.name}\n⏳ Đang chờ người chơi còn lại...`,
      });
    } catch {}

    if (res.both) {
      try {
        await adapter.sendText({
          threadId: room.groupId,
          threadType: "group",
          text: "✅ 2 NGƯỜI CHƠI ĐÃ CHUẨN BỊ!\n🎮 Đang xác định kết quả...",
        });
      } catch {}
      try {
        await finishMatch(adapter, res.room, logger);
      } catch (e) {
        logger?.error?.("[ott] finishMatch", e?.message);
        deleteRoom(room.groupId);
      }
    }
  },
};
