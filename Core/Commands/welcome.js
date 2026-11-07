import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "canvas";
import { resolveSenderRole } from "../../Handlers/HandleCommandRouter.js";

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  const characters = Array.from(String(text || ""));
  if (ctx.measureText(characters.join("")).width <= maxWidth) return characters.join("");
  while (characters.length && ctx.measureText(`${characters.join("")}…`).width > maxWidth) {
    characters.pop();
  }
  return `${characters.join("")}…`;
}

async function loadAvatar(url, logger, threadId) {
  if (!url) return null;
  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;
    const response = await fetch(parsedUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    logger?.warn?.("[welcome] Không tải được avatar thành viên, dùng ảnh chữ cái:", {
      message: err?.message,
      threadId,
    });
    return null;
  }
}

function renderWelcomeCard({ name, groupName, memberCount, avatar }) {
  const width = 1200;
  const height = 560;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#dfc9ff");
  background.addColorStop(0.55, "#f3c7f1");
  background.addColorStop(1, "#ffc5e7");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(220, 260, 20, 220, 260, 390);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.62)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 550, height);

  for (let i = 0; i < 44; i++) {
    const x = (i * 181 + 37) % width;
    const y = (i * 127 + 19) % height;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((i % 7) * 0.18);
    ctx.fillStyle = i % 2 ? "rgba(138, 64, 226, 0.42)" : "rgba(255, 255, 255, 0.72)";
    ctx.fillRect(-5, -12, 10, 24);
    ctx.restore();
  }

  roundedRect(ctx, 22, 22, width - 44, height - 44, 28);
  ctx.strokeStyle = "#8b5cff";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#9e64ff";
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;

  roundedRect(ctx, 58, 60, width - 116, height - 120, 32);
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.shadowColor = "rgba(86, 38, 125, 0.24)";
  ctx.shadowBlur = 28;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();
  roundedRect(ctx, 58, 60, 390, height - 120, 32);
  ctx.clip();
  const side = ctx.createLinearGradient(58, 60, 448, height - 60);
  side.addColorStop(0, "#d5b7f5");
  side.addColorStop(1, "#b98cdb");
  ctx.fillStyle = side;
  ctx.fillRect(58, 60, 390, height - 120);
  ctx.restore();

  const avatarX = 253;
  const avatarY = 280;
  const avatarRadius = 105;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#f4edff";
  ctx.fill();
  if (avatar) {
    const scale = Math.max((avatarRadius * 2) / avatar.width, (avatarRadius * 2) / avatar.height);
    const drawWidth = avatar.width * scale;
    const drawHeight = avatar.height * scale;
    avatar &&
      ctx.drawImage(
        avatar,
        avatarX - drawWidth / 2,
        avatarY - drawHeight / 2,
        drawWidth,
        drawHeight,
      );
  } else {
    ctx.fillStyle = "#713bd1";
    ctx.font = "bold 84px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(Array.from(name.trim())[0]?.toLocaleUpperCase("vi-VN") || "?", avatarX, avatarY);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius + 5, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 7;
  ctx.shadowColor = "#8b5cff";
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const badgeX = 330;
  const badgeY = 350;
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, 42, 0, Math.PI * 2);
  ctx.fillStyle = "#3fbf26";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("NEW", badgeX, badgeY);

  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.font = "18px Arial";
  ctx.textAlign = "center";
  ctx.fillText("NHÀ MÌNH CÓ THÊM BẠN", avatarX, 435);

  const textX = 495;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  roundedRect(ctx, textX, 112, 340, 42, 21);
  ctx.fillStyle = "#713bd1";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 15px Arial";
  ctx.textAlign = "center";
  ctx.fillText("CHÀO MỪNG THÀNH VIÊN MỚI", textX + 170, 140);

  ctx.textAlign = "left";
  ctx.fillStyle = "#111827";
  ctx.font = "bold 66px Arial";
  ctx.fillText(fitText(ctx, name, 620), textX, 245);

  ctx.fillStyle = "#718096";
  ctx.font = "24px Arial";
  ctx.fillText("đã gia nhập", textX, 292);
  ctx.fillStyle = "#713bd1";
  ctx.font = "bold 26px Arial";
  ctx.fillText(fitText(ctx, groupName, 445), textX + 135, 292);

  roundedRect(ctx, textX, 327, 180, 95, 20);
  ctx.fillStyle = "#713bd1";
  ctx.shadowColor = "rgba(113, 59, 209, 0.35)";
  ctx.shadowBlur = 16;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#e9dcff";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText("THÀNH VIÊN THỨ", textX + 90, 357);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Arial";
  ctx.fillText(`#${memberCount ?? "?"}`, textX + 90, 402);

  ctx.textAlign = "left";
  ctx.fillStyle = "#26344d";
  ctx.font = "bold 18px Arial";
  ctx.fillText(
    `Nhóm hiện có ${memberCount ?? "?"} thành viên`,
    textX + 205,
    364,
  );
  ctx.fillStyle = "#76839a";
  ctx.font = "16px Arial";
  ctx.fillText("Rất vui được gặp bạn", textX + 205, 393);

  ctx.beginPath();
  ctx.moveTo(textX, 442);
  ctx.lineTo(1125, 442);
  ctx.strokeStyle = "#d8dced";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#3c4963";
  ctx.font = "17px Arial";
  ctx.fillText("Chúc bạn tìm được những người bạn thật sự hợp cạ ở đây!", textX, 475);

  return canvas.toBuffer("image/png");
}

function getSetting(db, threadId, key, fallback = "0") {
  const rows = db.query(
    "SELECT value FROM settings WHERE thread_id = ? AND key = ?",
    [threadId, key],
  );
  return rows.length ? rows[0].value : fallback;
}

function setSetting(db, threadId, key, value) {
  db.query(
    `INSERT INTO settings (thread_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(thread_id, key) DO UPDATE SET value = excluded.value`,
    [threadId, key, String(value)],
  );
}

function getNewMembers(event) {
  const data = event?.data ?? {};
  const sources = [
    data.updateMembers,
    data.members,
    data.memberIds,
    data.userIds,
    data.uids,
    data.member,
    data.user,
    data.uid,
    data.userId,
    data.memberId,
  ];
  for (const source of sources) {
    const values = Array.isArray(source) ? source : source ? [source] : [];
    const members = values
      .map((value) => {
        const id = value?.id ?? value?.uid ?? value?.userId ?? value?.memberId ??
          (typeof value === "string" || typeof value === "number" ? value : "");
        return {
          id: String(id).trim(),
          name: String(value?.dName ?? value?.displayName ?? value?.userName ?? value?.name ?? "").trim(),
          avatar: value?.avatar ?? value?.avatarUrl ?? null,
        };
      })
      .filter((member) => member.id || member.name);
    if (members.length) return members;
  }
  return [];
}

function groupMemberCount(info) {
  const count = Number(info?.totalMember ?? info?.memberCount);
  if (Number.isFinite(count) && count > 0) return count;
  for (const members of [info?.memberIds, info?.members, info?.memVerList]) {
    if (Array.isArray(members) && members.length) return members.length;
  }
  return null;
}

export default {
  name: "welcome",
  description: "Chào mừng thành viên mới bằng tin nhắn và ảnh Canvas",
  version: "1.0.0",
  author: "HNNP STUDIO",
  group: "moderation",
  role: 0,
  cooldown: 2,
  aliases: ["wel", "chaomung"],
  noPrefix: false,

  async run({ adapter, message, args = [], config, db }) {
    const threadId = message.threadId;
    if (message.type !== 1) {
      await adapter.sendText({ threadId, threadType: "user", text: "🏠 Lệnh này chỉ có thể sử dụng trong nhóm." });
      return;
    }

    const action = String(args[0] || "status").toLowerCase();
    if (action === "status") {
      const enabled = getSetting(db, threadId, "welcome:enabled", "0") === "1";
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: `🎉 Thông báo chào thành viên mới đang ${enabled ? "BẬT" : "TẮT"}.`,
      });
      return;
    }

    const role = await resolveSenderRole(
      { adapter, isOwner: (uid) => String(uid) === String(config.ownerZaloId) },
      message,
      message.data.uidFrom,
    );
    if (role < 1) {
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: "🔐 Chỉ quản trị viên hoặc owner mới có thể thay đổi cài đặt này.",
      });
      return;
    }
    if (!["on", "off"].includes(action)) {
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: "Cú pháp: !welcome on | off | status\nVí dụ: !welcome on",
      });
      return;
    }

    setSetting(db, threadId, "welcome:enabled", action === "on" ? "1" : "0");
    await adapter.sendText({
      threadId,
      threadType: "group",
      text: `✅ Đã ${action === "on" ? "bật" : "tắt"} thông báo chào thành viên mới.`,
    });
  },

  async onGroupEvent({ adapter, event, db, logger }) {
    const threadId = event?.threadId ?? event?.data?.groupId ?? event?.data?.group_id;
    if (!threadId || getSetting(db, threadId, "welcome:enabled", "0") !== "1") return;
    const joinEventTypes = new Set(["join", "add_member", "add_members"]);
    const isJoinEvent = [
      event?.type,
      event?.eventType,
      event?.act,
      event?.data?.action,
      event?.data?.type,
    ].some((type) => joinEventTypes.has(String(type ?? "").toLowerCase().replace(/[\s-]+/g, "_")));
    if (!isJoinEvent) return;

    const newMembers = getNewMembers(event);
    if (!newMembers.length) {
      logger?.warn?.("[welcome] Sự kiện join không có thông tin thành viên.", { threadId });
      return;
    }

    let groupInfo = null;
    try {
      groupInfo = await adapter.getGroupInfo(threadId);
    } catch (err) {
      logger?.warn?.("[welcome] Không lấy được thông tin nhóm, dùng dữ liệu event:", {
        message: err?.message,
        threadId,
      });
    }
    const groupName = String(event.data?.groupName || groupInfo?.name || "nhóm của chúng ta").trim();
    const memberCount = groupMemberCount(groupInfo) ??
      (Number(event.data?.totalMember ?? event.data?.memberCount) || null);

    for (const member of newMembers) {
      const name = member.name || "Thành viên mới";
      const welcomeName = member.name || "bạn";
      const countText = memberCount ?? "chưa xác định";
      const caption =
        `🎉 NHÀ MÌNH CÓ THÊM BẠN MỚI 🎉\n` +
        `🎈 Xin chào @${welcomeName}!\n` +
        `🏠 Chào mừng bạn đã gia nhập "${groupName}"\n` +
        `🏅 Bạn là thành viên thứ #${countText} của nhóm\n` +
        `👥 Nhóm hiện có ${countText} thành viên\n` +
        `💬 Chúc bạn tìm được những người bạn thật sự hợp cạ ở đây!\n` +
        `🎁 Đọc nội quy và giới thiệu bản thân để mọi người làm quen với bạn nhé!`;
      const mentions = member.id && member.name
        ? [{ uid: member.id, pos: caption.indexOf(member.name), len: member.name.length }]
        : [];
      const imagePath = path.join(
        os.tmpdir(),
        `welcome-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
      );

      try {
        const avatar = await loadAvatar(member.avatar, logger, threadId);
        const image = renderWelcomeCard({ name, groupName, memberCount, avatar });
        await writeFile(imagePath, image);
        await adapter.sendImage({
          threadId,
          threadType: "group",
          imagePath,
          caption,
          mentions,
        });
      } catch (err) {
        logger?.warn?.("[welcome] Không gửi được ảnh Canvas, chuyển sang gửi chữ:", {
          message: err?.message,
          threadId,
          userId: member.id,
        });
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: caption,
          mentions,
        });
      } finally {
        try {
          await unlink(imagePath);
        } catch (err) {
          if (err?.code !== "ENOENT") {
            logger?.warn?.("[welcome] Không xóa được ảnh tạm:", {
              message: err?.message,
              imagePath,
            });
          }
        }
      }
    }
  },
};
