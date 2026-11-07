import { unlinkSync } from "node:fs";
import {
  getInventoryTier,
  getInventoryUsage,
  getInventoryPage,
  removeItem,
  findItemByName,
  isOverCapacity,
} from "./data/GIAITRI/Inventory/index.js";
import { renderInventoryCanvas, saveBufferToTempImage } from "./data/GIAITRI/Inventory/canvas.js";

function normalizeUid(value) {
  return String(value ?? "").trim();
}

async function sendCard(adapter, threadId, threadType, buffer, caption) {
  const imagePath = saveBufferToTempImage(buffer, "balo");
  try {
    await adapter.sendImage({ threadId, threadType, imagePath, caption });
  } finally {
    try {
      unlinkSync(imagePath);
    } catch {
      // file tạm có thể đã bị xóa
    }
  }
}

const USAGE = [
  "Cách dùng:",
  ".balo open [trang] — mở kho đồ (có phân trang)",
  ".balo vut <tên vật phẩm> [số lượng] — vứt vật phẩm",
].join("\n");

export default {
  name: "balo",
  description: "Hệ thống Kho Đồ V2.0 — mở / vứt vật phẩm (BASIC · VIP · PRE · VÔ HẠN)",
  version: "2.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 2,
  aliases: ["inventory", "kho", "bag"],
  noPrefix: false,

  async run({ adapter, message, args = [] }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const uid = normalizeUid(message.data?.uidFrom);
    const userName = String(message.data?.dName || "Người chơi").slice(0, 40);
    const send = (text) => adapter.sendText({ threadId, threadType, text });

    if (!uid) {
      return send("Không xác định được ID người dùng.");
    }

    const sub = String(args[0] || "").toLowerCase().trim();

    // ─── .balo open [page] ───────────────────────────────────
    if (!sub || sub === "open" || sub === "xem" || sub === "mở") {
      try {
        const pageArg =
          sub === "open" || sub === "xem" || sub === "mở" ? args[1] : args[0];
        const page = Math.max(1, parseInt(pageArg, 10) || 1);

        const tierInfo = await getInventoryTier(uid);
        const usage = await getInventoryUsage(uid);
        const pageData = await getInventoryPage(uid, page);

        const buffer = await renderInventoryCanvas({
          tier: tierInfo.tier,
          displayName: tierInfo.displayName,
          badge: tierInfo.badge,
          userName,
          userId: uid,
          usedSlots: usage.usedSlots,
          capacity: tierInfo.capacity,
          uniqueTypes: usage.uniqueTypes,
          totalQuantity: usage.totalQuantity,
          items: pageData.items,
          page: pageData.page,
          totalPages: pageData.totalPages,
        });

        let caption = `🎒 ${tierInfo.displayName}`;
        if (tierInfo.capacity === null) {
          caption += ` · ${usage.usedSlots} ô · KHÔNG GIỚI HẠN`;
        } else {
          caption += ` · ${usage.usedSlots}/${tierInfo.capacity} ô`;
        }
        if (pageData.totalPages > 1) {
          caption += ` · Trang ${pageData.page}/${pageData.totalPages}`;
        }

        if (await isOverCapacity(uid)) {
          caption +=
            "\n⚠️ Kho đang vượt dung lượng cho phép. Hãy vứt bớt vật phẩm hoặc nâng cấp cấp kho để nhận thêm.";
        }

        try {
          await sendCard(adapter, threadId, threadType, buffer, caption);
        } catch (err) {
          console.error("[balo] Lỗi gửi ảnh:", err?.message);
          await send(
            `${caption}\n(Không gửi được ảnh Canvas — kiểm tra module canvas)`
          );
        }
      } catch (err) {
        console.error("[balo open]", err);
        await send(`Lỗi khi mở kho đồ: ${err.message}`);
      }
      return;
    }

    // ─── .balo vut <name> [qty] ──────────────────────────────
    if (sub === "vut" || sub === "vứt" || sub === "drop" || sub === "discard") {
      const nameParts = args.slice(1);
      if (nameParts.length === 0) {
        return send(
          "Cú pháp: .balo vut <tên vật phẩm> [số lượng]\nVí dụ: .balo vut Bình máu 2"
        );
      }

      let qty = null;
      let nameQuery = nameParts.join(" ");
      const last = nameParts[nameParts.length - 1];
      if (/^\d+$/.test(last) && nameParts.length > 1) {
        qty = parseInt(last, 10);
        nameQuery = nameParts.slice(0, -1).join(" ");
      }

      try {
        const found = await findItemByName(uid, nameQuery);
        if (!found) {
          return send("Bạn không sở hữu vật phẩm này.");
        }

        const result = await removeItem(uid, found.itemId, qty);
        if (!result.success) {
          return send(result.error || "Không thể vứt vật phẩm.");
        }

        const capacity = result.capacity;
        let capText;
        if (capacity === null) {
          capText = `Đã sử dụng: ${result.usedSlots} ô (KHÔNG GIỚI HẠN)`;
        } else {
          capText = `Dung lượng kho: ${result.usedSlots} / ${capacity} ô`;
        }

        return send(`✅ Đã vứt ${result.removed}x ${result.name}.\n${capText}`);
      } catch (err) {
        console.error("[balo vut]", err);
        return send(`Lỗi khi vứt vật phẩm: ${err.message}`);
      }
    }

    return send(USAGE);
  },
};
