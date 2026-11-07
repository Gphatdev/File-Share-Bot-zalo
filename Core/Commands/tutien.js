import { unlinkSync } from "node:fs";
import {
  getCultivationView,
  getCultivationProfile,
  breakthrough,
  resolveTribulation,
  getCultivationRank,
  canBreakthrough,
  practiceCultivation,
} from "./data/GIAITRI/Cultivation/index.js";
import {
  renderCultivationOverview,
  renderCultivationRank,
  renderTribulationCanvas,
  saveBufferToTempImage,
} from "./data/GIAITRI/Cultivation/canvas.js";

const sessions = new Map();

function sKey(uid, tid) {
  return `${uid}|${tid}`;
}
function setSess(uid, tid, data) {
  sessions.set(sKey(uid, tid), { ...data, expiresAt: Date.now() + 5 * 60 * 1000 });
}
function getSess(uid, tid) {
  const d = sessions.get(sKey(uid, tid));
  if (!d) return null;
  if (d.expiresAt < Date.now()) {
    sessions.delete(sKey(uid, tid));
    return null;
  }
  return d;
}
function clearSess(uid, tid) {
  sessions.delete(sKey(uid, tid));
}

function normalizeUid(v) {
  return String(v ?? "").trim();
}

async function sendImg(adapter, threadId, threadType, buffer, caption) {
  const p = saveBufferToTempImage(buffer, "tutien");
  try {
    await adapter.sendImage({ threadId, threadType, imagePath: p, caption });
  } finally {
    try {
      unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

export default {
  name: "tutien",
  description: "Hệ thống Tu Tiên RPG — cảnh giới, tu vi, đột phá, Thiên Kiếp, xếp hạng",
  version: "1.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 2,
  aliases: ["cultivation", "tu", "xiuxian"],
  noPrefix: false,

  async run({ adapter, message, args = [] }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userId = normalizeUid(message.data?.uidFrom);
    const displayName = String(message.data?.dName || "Người chơi").slice(0, 40);
    const send = (t) => adapter.sendText({ threadId, threadType, text: t });

    if (!userId) return send("Không xác định được UID.");

    const sub = String(args[0] || "").toLowerCase().trim();

    // ─── .tutien luyentap ─────────────────────────────────────
    if (["luyentap", "luyện tập", "train", "cultivate"].includes(sub)) {
      try {
        const result = await practiceCultivation(userId);
        if (!result.success) return send(`⏳ ${result.error}`);
        const progress = result.required > 0
          ? `EXP tu tiên: ${result.qi.toLocaleString("vi-VN")} / ${result.required.toLocaleString("vi-VN")}`
          : `EXP tu tiên hiện có: ${result.qi.toLocaleString("vi-VN")}`;
        return send(
          `✨ Tĩnh tu thành công, nhận +${result.added.toLocaleString("vi-VN")} EXP Hồ sơ, đã đồng bộ vào tu vi.\n${progress}` +
          (result.canBreakthrough ? "\n🌟 Đã đủ EXP! Dùng .tutien dotpha để đột phá." : "") +
          `\nCó thể luyện tiếp sau ${result.cooldownMinutes} phút.`
        );
      } catch (err) {
        console.error("[tutien luyentap]", err);
        return send(`Lỗi luyện tu: ${err.message}`);
      }
    }

    // ─── .tutien check ───────────────────────────────────────
    if (sub === "check" || sub === "kiemtra" || sub === "status") {
      try {
        const view = await getCultivationView(userId, { displayName });
        const buf = await renderCultivationOverview(view, "check");
        await sendImg(adapter, threadId, threadType, buf, `🔮 Tu tiên · ${view.realmName}`);
      } catch (err) {
        console.error("[tutien check]", err);
        await send(`Lỗi: ${err.message}`);
      }
      return;
    }

    // ─── .tutien rank ────────────────────────────────────────
    if (sub === "rank" || sub === "bxh" || sub === "top") {
      try {
        const page = Math.max(1, parseInt(args[1], 10) || 1);
        const rankData = await getCultivationRank(page);
        // Names: only have display names for self in this context
        const names = { [userId]: displayName };
        const buf = await renderCultivationRank(rankData, names);
        await sendImg(
          adapter,
          threadId,
          threadType,
          buf,
          `🏆 BXH Tu Tiên · Trang ${rankData.page}/${rankData.totalPages}`
        );
      } catch (err) {
        console.error("[tutien rank]", err);
        await send(`Lỗi: ${err.message}`);
      }
      return;
    }

    // ─── .tutien dotpha / breakthrough ───────────────────────
    if (sub === "dotpha" || sub === "độtphá" || sub === "break" || sub === "bt") {
      try {
        const check = await canBreakthrough(userId);
        if (!check.ok) {
          return send(`❌ Không thể đột phá: ${check.reason}`);
        }
        if (check.isTribulation) {
          const view = await getCultivationView(userId, { displayName });
          const buf = await renderTribulationCanvas(view);
          setSess(userId, threadId, { type: "CONFIRM_TRIBULATION" });
          await sendImg(
            adapter,
            threadId,
            threadType,
            buf,
            "⚡ Sẵn sàng Độ Kiếp — Reply 1 để bắt đầu, 0 để hủy"
          );
          return;
        }

        const result = await breakthrough(userId);
        if (!result.success) return send(`❌ ${result.error}`);
        if (result.needTribulation) {
          const view = await getCultivationView(userId, { displayName });
          const buf = await renderTribulationCanvas(view);
          setSess(userId, threadId, { type: "CONFIRM_TRIBULATION" });
          await sendImg(adapter, threadId, threadType, buf, result.message);
          return;
        }
        return send(`✅ ${result.message}\nTu vi còn lại: ${Number(result.qi).toLocaleString("vi-VN")}`);
      } catch (err) {
        console.error("[tutien dotpha]", err);
        return send(`Lỗi đột phá: ${err.message}`);
      }
    }

    // ─── .tutien kiep (explicit tribulation) ─────────────────
    if (sub === "kiep" || sub === "kiếp" || sub === "tribulation") {
      try {
        const view = await getCultivationView(userId, { displayName });
        if (!view.isTribulationReady && view.realmId !== "do_kiep") {
          return send("Bạn chưa đủ điều kiện Độ Kiếp. Cần hoàn thành Đại Thừa và tích lũy đủ tu vi.");
        }
        const buf = await renderTribulationCanvas(view);
        setSess(userId, threadId, { type: "CONFIRM_TRIBULATION" });
        await sendImg(adapter, threadId, threadType, buf, "⚡ Thiên Kiếp — Reply 1 để bắt đầu");
      } catch (err) {
        return send(`Lỗi: ${err.message}`);
      }
      return;
    }

    // ─── default .tutien overview ────────────────────────────
    try {
      // Ensure profile exists (auto-init once)
      await getCultivationProfile(userId);
      const view = await getCultivationView(userId, { displayName });
      const buf = await renderCultivationOverview(view, "overview");
      let caption = `🕊️ ${view.realmName}`;
      if (view.stageLabel) caption += ` · ${view.stageLabel}`;
      caption += ` · ${view.progressPercent}%`;
      if (view.canBreakthrough) caption += " · Có thể đột phá!";
      await sendImg(adapter, threadId, threadType, buf, caption);
    } catch (err) {
      console.error("[tutien]", err);
      await send(`Lỗi hệ thống tu tiên: ${err.message}`);
    }
  },

  async onMessage({ adapter, message, config }) {
    const data = message?.data || {};
    const userId = normalizeUid(data.uidFrom);
    const threadId = message.threadId;
    if (!userId || !threadId) return;

    const session = getSess(userId, threadId);
    if (!session) return;

    const content = typeof data.content === "string" ? data.content.trim() : "";
    const prefix = config?.botPrefix || ".";
    if (content.startsWith(prefix)) return;

    const threadType = message.type === 1 ? "group" : "user";
    const send = (t) => adapter.sendText({ threadId, threadType, text: t });

    if (session.type === "CONFIRM_TRIBULATION") {
      if (content === "0" || content.toLowerCase() === "huy" || content.toLowerCase() === "hủy") {
        clearSess(userId, threadId);
        return send("Đã hủy Độ Kiếp.");
      }
      if (content === "1" || content.toLowerCase() === "ok" || content.toLowerCase() === "batdau") {
        clearSess(userId, threadId);
        try {
          const result = await resolveTribulation(userId);
          if (!result.success) return send(`❌ ${result.error}`);
          if (result.tribulationSuccess) {
            return send(`🌟 ${result.message}\nTu vi còn: ${Number(result.qi).toLocaleString("vi-VN")}`);
          }
          return send(`💔 ${result.message}`);
        } catch (err) {
          return send(`Lỗi Thiên Kiếp: ${err.message}`);
        }
      }
    }
  },
};
