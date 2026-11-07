import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "canvas";
import { resolveSenderRole } from "../../Handlers/HandleCommandRouter.js";
import { takeKickActor } from "./data/GROUP/kickActorTracker.js";

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

function renderGoodbyeCard(name, groupName) {
  const width = 1200;
  const height = 560;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#07152f");
  background.addColorStop(0.55, "#160d3b");
  background.addColorStop(1, "#281044");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(260, 275, 10, 260, 275, 350);
  glow.addColorStop(0, "rgba(48, 147, 255, 0.38)");
  glow.addColorStop(1, "rgba(48, 147, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 70; i++) {
    const x = (i * 197 + 53) % width;
    const y = (i * 113 + 29) % height;
    ctx.fillStyle = `rgba(205, 220, 255, ${0.2 + (i % 5) * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, i % 9 === 0 ? 2 : 1, 0, Math.PI * 2);
    ctx.fill();
  }

  roundedRect(ctx, 22, 22, width - 44, height - 44, 28);
  ctx.strokeStyle = "#5b8cff";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#477cff";
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const avatarX = 270;
  const avatarY = 280;
  const avatarRadius = 112;
  const avatarGlow = ctx.createRadialGradient(avatarX, avatarY, 20, avatarX, avatarY, 150);
  avatarGlow.addColorStop(0, "rgba(83, 189, 255, 0.75)");
  avatarGlow.addColorStop(1, "rgba(83, 189, 255, 0)");
  ctx.fillStyle = avatarGlow;
  ctx.fillRect(avatarX - 160, avatarY - 160, 320, 320);

  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#e7f2ff";
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#174b91";
  ctx.font = "bold 72px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(Array.from(name.trim())[0]?.toLocaleUpperCase("vi-VN") || "?", avatarX, avatarY);

  const textX = 500;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#b9c9ff";
  ctx.font = "bold 32px Arial";
  ctx.fillText("TẠM BIỆT THÀNH VIÊN", textX, 155);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 76px Arial";
  ctx.fillText(fitText(ctx, name, 620), textX, 270);

  ctx.fillStyle = "#77caff";
  ctx.font = "bold 32px Arial";
  ctx.fillText("đã rời khỏi nhóm", textX, 330);

  ctx.fillStyle = "#4ce4ef";
  ctx.font = "bold 30px Arial";
  ctx.fillText(fitText(ctx, groupName || "NHÓM CỦA CHÚNG TA", 620), textX, 405);

  ctx.fillStyle = "rgba(190, 205, 255, 0.7)";
  ctx.font = "20px Arial";
  ctx.fillText("HẸN GẶP LẠI!", textX, 485);

  return canvas.toBuffer("image/png");
}

function userInitial(name) {
  return Array.from(String(name || "?").trim())[0]?.toLocaleUpperCase("vi-VN") || "?";
}

async function loadAvatar(avatarUrl, logger, uid) {
  if (!avatarUrl || typeof avatarUrl !== "string" || !/^https?:\/\//i.test(avatarUrl)) return null;
  try {
    const response = await fetch(avatarUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > 5 * 1024 * 1024) throw new Error("Avatar exceeds 5 MB");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 5 * 1024 * 1024) throw new Error("Avatar exceeds 5 MB");
    return await loadImage(buffer);
  } catch (error) {
    logger?.warn?.("[goodbye] Không tải được avatar thành viên:", { uid, message: error?.message });
    return null;
  }
}

function drawProfile(ctx, { x, y, radius, name, image, accent, label }) {
  const gradient = ctx.createRadialGradient(x, y, radius * 0.4, x, y, radius * 1.6);
  gradient.addColorStop(0, `${accent}66`);
  gradient.addColorStop(1, `${accent}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius * 1.7, y - radius * 1.7, radius * 3.4, radius * 3.4);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  if (image) {
    const scale = Math.max((radius * 2) / image.width, (radius * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
  } else {
    ctx.fillStyle = "#e7f2ff";
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.fillStyle = "#174b91";
    ctx.font = "bold 84px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(userInitial(name), x, y);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#a8bbd5";
  ctx.font = "bold 20px Arial";
  ctx.fillText(label, x, y + radius + 42);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px Arial";
  ctx.fillText(fitText(ctx, name, 310), x, y + radius + 82);
}

async function renderKickCard({ actor, removed, groupName, logger }) {
  const [actorImage, removedImage] = await Promise.all([
    loadAvatar(actor.avatar, logger, actor.uid),
    loadAvatar(removed.avatar, logger, removed.uid),
  ]);
  const width = 1200;
  const height = 560;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#07152f");
  background.addColorStop(0.52, "#111b3d");
  background.addColorStop(1, "#281044");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width / 2, 250, 20, width / 2, 250, 520);
  glow.addColorStop(0, "rgba(88, 110, 255, 0.2)");
  glow.addColorStop(1, "rgba(88, 110, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  roundedRect(ctx, 22, 22, width - 44, height - 44, 28);
  ctx.strokeStyle = "#5b8cff";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#477cff";
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#d7e3ff";
  ctx.font = "bold 36px Arial";
  ctx.fillText("BIẾN ĐỘNG THÀNH VIÊN", width / 2, 94);
  ctx.fillStyle = "#90a8d6";
  ctx.font = "20px Arial";
  ctx.fillText(fitText(ctx, groupName || "NHÓM CỦA CHÚNG TA", width - 160), width / 2, 132);

  drawProfile(ctx, {
    x: 310,
    y: 282,
    radius: 102,
    name: actor.name || "Quản trị viên",
    image: actorImage,
    accent: "#48d9c2",
    label: "NGƯỜI THỰC HIỆN",
  });
  drawProfile(ctx, {
    x: 890,
    y: 282,
    radius: 102,
    name: removed.name || "Thành viên",
    image: removedImage,
    accent: "#ff718b",
    label: "THÀNH VIÊN BỊ MỜI",
  });

  ctx.beginPath();
  ctx.moveTo(465, 282);
  ctx.lineTo(735, 282);
  ctx.strokeStyle = "rgba(207, 220, 255, 0.46)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#ff8ba1";
  ctx.beginPath();
  ctx.moveTo(746, 282);
  ctx.lineTo(727, 269);
  ctx.lineTo(727, 295);
  ctx.closePath();
  ctx.fill();

  roundedRect(ctx, width / 2 - 115, 228, 230, 108, 24);
  ctx.fillStyle = "#131a36";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 113, 139, 0.72)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#ff9cad";
  ctx.font = "bold 25px Arial";
  ctx.textBaseline = "middle";
  ctx.fillText("ĐÃ MỜI RA", width / 2, 282);

  ctx.fillStyle = "rgba(190, 205, 255, 0.72)";
  ctx.font = "18px Arial";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Hoạt động quản trị nhóm", width / 2, 514);
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

function eventName(event) {
  return [
    event?.type,
    event?.eventType,
    event?.act,
    event?.action,
    event?.data?.type,
    event?.data?.eventType,
    event?.data?.action,
  ]
    .map((type) => String(type ?? "").toLowerCase().replace(/[\s-]+/g, "_"))
    .filter(Boolean);
}

function eventUserIds(event) {
  const data = event?.data ?? {};
  const sources = [
    data.updateMembers,
    data.members,
    data.memberIds,
    data.userIds,
    data.users,
    data.member,
    data.user,
    data.uid,
    data.userId,
    data.memberId,
    data.uids,
  ];
  const result = [];
  for (const source of sources) {
    const values = Array.isArray(source) ? source : source ? [source] : [];
    for (const value of values) {
      const id = value?.id ?? value?.uid ?? value?.userId ?? value?.memberId ??
        (typeof value === "string" || typeof value === "number" ? value : "");
      if (id) result.push(String(id));
    }
  }
  return [...new Set(result)];
}

export default {
  name: "goodbye",
  description: "Thông báo khi thành viên rời nhóm",
  version: "1.0.0",
  author: "NKNP V3",
  group: "moderation",
  role: 0,
  cooldown: 2,
  aliases: ["bye"],
  noPrefix: false,

  async run({ adapter, message, args, config, db }) {
    const threadId = message.threadId;
    if (message.type !== 1) {
      await adapter.sendText({ threadId, threadType: "user", text: "🏠 Lệnh này chỉ có thể sử dụng trong nhóm." });
      return;
    }
    const action = (args[0] || "status").toLowerCase();
    if (action === "status") {
      const enabled = getSetting(db, threadId, "goodbye:enabled", "0") === "1";
      await adapter.sendText({ threadId, threadType: "group", text: `👋 Thông báo thành viên rời nhóm đang ${enabled ? "BẬT" : "TẮT"}.` });
      return;
    }
    const role = await resolveSenderRole(
      { adapter, isOwner: (uid) => String(uid) === String(config.ownerZaloId) },
      message,
      message.data.uidFrom,
    );
    if (role < 1) {
      await adapter.sendText({ threadId, threadType: "group", text: "🔐 Chỉ quản trị viên hoặc owner mới có thể thay đổi cài đặt này." });
      return;
    }
    if (!['on', 'off'].includes(action)) {
      await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !goodbye on | off | status\nVí dụ: !goodbye on" });
      return;
    }
    setSetting(db, threadId, "goodbye:enabled", action === "on" ? "1" : "0");
    await adapter.sendText({ threadId, threadType: "group", text: `✅ Đã ${action === "on" ? "bật" : "tắt"} thông báo thành viên rời nhóm.` });
  },

  async onGroupEvent({ adapter, event, db, logger }) {
    const threadId = event?.threadId ?? event?.data?.groupId ?? event?.data?.group_id;
    if (!threadId || getSetting(db, threadId, "goodbye:enabled", "0") !== "1") return;
    const eventTypes = eventName(event);
    const isKick = eventTypes.some((type) =>
      type === "remove_member" || type === "block_member" || type === "kick"
    );
    const isLeave = eventTypes.includes("leave") && !isKick;
    if (!isKick && !isLeave) return;
    const ids = eventUserIds(event);
    const members = Array.isArray(event.data?.updateMembers)
      ? event.data.updateMembers
      : Array.isArray(event.data?.members) ? event.data.members : [];
    const removedId = ids[0] || "";
    const requestedActor = isKick ? takeKickActor(threadId, removedId) : null;
    const removedMember = members.find((member) =>
      String(member?.id ?? member?.uid ?? member?.userId ?? "") === removedId
    ) || members[0] || {};
    const name = String(removedMember?.dName ?? removedMember?.displayName ?? removedMember?.name ?? "").trim() ||
      (removedId || "Một thành viên");
    const groupName = String(event.data?.groupName || event.data?.name || "NHÓM CỦA CHÚNG TA").trim();
    const imagePath = path.join(os.tmpdir(), `goodbye-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    const actorId = String(requestedActor?.uid ?? event.data?.actorId ?? event.data?.sourceId ??
      event.data?.operatorId ?? event.data?.operator?.id ?? event.data?.actor?.id ??
      event.data?.uidFrom ?? event.uidFrom ?? "").trim();
    const actorMember = requestedActor ?? event.data?.actor ?? event.data?.operator ?? {};
    const getProfile = async (uid, member = {}) => {
      let profile = member;
      if (uid && typeof adapter.raw?.getUserInfo === "function" &&
        !(profile?.avatar || profile?.avatarUrl || profile?.photo)) {
        try {
          const response = await adapter.raw.getUserInfo(uid);
          profile = {
            ...member,
            ...(response?.changed_profiles?.[uid] ||
            response?.unchanged_profiles?.[uid] ||
            response?.[uid] ||
            {}),
          };
        } catch (error) {
          logger?.warn?.("[goodbye] Không lấy được thông tin thành viên:", { uid, message: error?.message });
        }
      }
      return {
        uid,
        name: String(profile?.dName ?? profile?.displayName ?? profile?.name ?? profile?.zaloName ?? "").trim() || uid || "Quản trị viên",
        avatar: profile?.avatar ?? profile?.avatarUrl ?? profile?.photo ?? null,
      };
    };

    try {
      if (isKick) {
        const actorUid = actorId || (event.isSelf && typeof adapter.getOwnId === "function" ? adapter.getOwnId() : "");
        const [actorProfile, removedProfile] = await Promise.all([
          getProfile(actorUid, actorMember),
          getProfile(removedId, removedMember),
        ]);
        await writeFile(imagePath, await renderKickCard({
          actor: actorProfile,
          removed: { ...removedProfile, name },
          groupName,
          logger,
        }));
        await adapter.sendImage({
          threadId,
          threadType: "group",
          imagePath,
          caption: `🛡️ ${actorProfile.name}  →  ${name}\nBiến động thành viên trong ${groupName}.`,
        });
      } else {
        const caption = `👋 ${name} đã rời khỏi nhóm ${groupName}. Chúc bạn mọi điều thuận lợi!`;
        await writeFile(imagePath, renderGoodbyeCard(name, groupName));
        await adapter.sendImage({ threadId, threadType: "group", imagePath, caption });
      }
    } catch (err) {
      logger?.warn?.("[goodbye] Không gửi được ảnh Canvas:", {
        message: err?.message,
        threadId,
      });
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: isKick
          ? `⚠️ Có thành viên bị mời khỏi nhóm ${groupName}, nhưng không gửi được ảnh thông báo.`
          : `👋 ${name} đã rời khỏi nhóm ${groupName}. Chúc bạn mọi điều thuận lợi!`,
      });
    } finally {
      try {
        await unlink(imagePath);
      } catch (err) {
        if (err?.code !== "ENOENT") {
          logger?.warn?.("[goodbye] Không xóa được ảnh tạm:", { message: err?.message, imagePath });
        }
      }
    }
  },
};
