/**
 * [PORT TỪ NKNP] boxinfo.js
 * Tự động chuyển đổi bởi codemod NKNP V3 — logic bên trong giữ nguyên vẹn,
 * chỉ thay đổi phần "vỏ bọc" (module.exports -> wrapLegacyCommand).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { wrapLegacyCommand } from "../../Handlers/HandleLegacyBridge.js";
import { renderBoxInfo } from "./data/GROUP/BoxInfo/canvas.js";

const { ThreadType } = require("zca-js");
const fs = require("fs").promises;
const path = require("path");

const __legacyConfig = {
    name: "boxinfo",
    version: "2.0.0",
    role: 0,
    author: "NLam182",
    description: "Hiển thị thông tin chi tiết của nhóm chat (dạng ảnh)",
    category: "Tiện ích",
    usage: "<prefix>info",
    cooldowns: 2
};
const __legacyRun = async function({ api, event }) {
    const { threadId, type } = event;

    if (type !== ThreadType.Group) {
        return api.sendMessage("Lệnh này chỉ có thể được sử dụng trong nhóm chat.", threadId, type);
    }

    const tempPath = path.join(__dirname, 'temp');
    try {
        await fs.mkdir(tempPath, { recursive: true });
    } catch (e) {
        console.error("Không thể tạo thư mục temp:", e);
    }

    let tempFilePath;

    // Lấy tên + avatar của một người dùng (không làm hỏng cả lệnh nếu lỗi)
    const getProfile = async (uid) => {
        try {
            const info = await api.getUserInfo(uid);
            const p = info?.changed_profiles?.[uid] || info?.unchanged_profiles?.[uid] || info?.[uid] || {};
            return {
                uid,
                name: p.displayName || p.zaloName || p.name || "Không rõ",
                avatar: p.avatar || p.avatarUrl || p.photo || null,
            };
        } catch {
            return { uid, name: "Không rõ", avatar: null };
        }
    };

    try {
        const groupInfo = await api.getGroupInfo(threadId);
        const details = groupInfo.gridInfoMap[threadId];

        if (!details) {
            return api.sendMessage("Không thể lấy được thông tin của nhóm này.", threadId, type);
        }
        const creatorId = details.creatorId;
        const deputyIds = (details.adminIds || []).filter(id => id !== creatorId);

        const [creator, ...deputies] = await Promise.all([
            getProfile(creatorId),
            ...deputyIds.map(getProfile),
        ]);

        const fallbackMsg = `📝 Thông Tin Nhóm 📝\n\n` +
                    `- Tên nhóm: ${details.name}\n` +
                    `- ID Nhóm: ${details.groupId}\n` +
                    `- Số lượng thành viên: ${details.totalMember}\n` +
                    `- Trưởng nhóm: ${creator.name}\n` +
                    `- Phó nhóm: ${deputies.length ? deputies.map(d => d.name).join(", ") : "Không có"}`;

        try {
            const buffer = await renderBoxInfo({
                name: details.name,
                groupId: details.groupId,
                totalMember: details.totalMember,
                avatar: details.fullAvt || details.avt || null,
                desc: details.desc || "",
                createdTime: details.createdTime,
                creator,
                deputies,
            });
            tempFilePath = path.join(tempPath, `boxinfo_${Date.now()}.png`);
            await fs.writeFile(tempFilePath, buffer);
            await api.sendMessage({ msg: "", attachments: [tempFilePath] }, threadId, type);
        } catch (err) {
            console.warn("Không thể vẽ ảnh thông tin nhóm, gửi dạng chữ:", err);
            await api.sendMessage(fallbackMsg, threadId, type);
        }

    } catch (error) {
        console.error("Lỗi khi lấy thông tin nhóm:", error);
        await api.sendMessage("Đã xảy ra lỗi khi cố gắng lấy thông tin nhóm.", threadId, type);
    } finally {
        if (tempFilePath) {
            try {
                await fs.unlink(tempFilePath);
            } catch (_) {}
        }
    }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);
