import { unlinkSync } from "node:fs";
import {
  getFarmOverview,
  getOwnedSeeds,
  plantSeeds,
  buyLand,
  harvestPlots,
  getSellableCrops,
  sellCrops,
  useMedicine,
  getPlotList,
  getLands,
  getMedicines,
  getTools,
  getOwnedTools,
  toolBonusesFrom,
  getSeedById,
  getLandById,
  getMedicineById,
} from "./data/GIAITRI/NongTrai/index.js";
import {
  renderOverview,
  renderSeedList,
  renderLandShop,
  renderGarden,
  renderHarvestResult,
  renderMarket,
  renderSellSuccess,
  renderPlantSuccess,
  renderBuyLandSuccess,
  renderMedicines,
  renderTools,
  saveBufferToTempImage,
} from "./data/GIAITRI/NongTrai/canvas.js";
import { getBalance } from "./data/GIAITRI/TienGame/index.js";
import { getInventoryItems } from "./data/GIAITRI/Inventory/index.js";
import { getPlayerAvatarPath } from "./data/GIAITRI/PlayerProfile/index.js";

const sessions = new Map();
const SESSION_TTL = 5 * 60 * 1000;

function sk(uid, tid) {
  return `${uid}|${tid}`;
}
function setS(uid, tid, data, ttl = SESSION_TTL) {
  if (sessions.size > 300) {
    const now = Date.now();
    for (const [k, v] of sessions) if (v.expiresAt < now) sessions.delete(k);
  }
  sessions.set(sk(uid, tid), { ...data, expiresAt: Date.now() + ttl });
}
function getS(uid, tid) {
  const d = sessions.get(sk(uid, tid));
  if (!d) return null;
  if (d.expiresAt < Date.now()) {
    sessions.delete(sk(uid, tid));
    return null;
  }
  return d;
}
function clearS(uid, tid) {
  sessions.delete(sk(uid, tid));
}

function normalizeUid(v) {
  return String(v ?? "").trim();
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

async function sendImg(adapter, threadId, threadType, buffer, caption) {
  const imagePath = saveBufferToTempImage(buffer, "nongtrai");
  try {
    await adapter.sendImage({ threadId, threadType, imagePath, caption: caption || undefined });
  } finally {
    try {
      unlinkSync(imagePath);
    } catch {
      /* ignore */
    }
  }
}

async function sendUi(adapter, threadId, threadType, renderFn, caption, fallbackText) {
  try {
    const buf = await renderFn();
    await sendImg(adapter, threadId, threadType, buf, caption);
  } catch (e) {
    console.error("[nongtrai canvas]", e?.message || e);
    if (fallbackText) {
      await adapter.sendText({ threadId, threadType, text: fallbackText });
    }
  }
}

export default {
  name: "nongtrai",
  description: "Hệ thống Nông Trại — trồng cây, thu hoạch, mua đất, bán nông sản",
  version: "1.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 2,
  aliases: ["farm", "nt", "nong", "vuon"],
  noPrefix: false,

  async run({ adapter, message, args = [] }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userId = normalizeUid(message.data?.uidFrom);
    const displayName = String(message.data?.dName || "Người chơi").slice(0, 40);
    const send = (t) => adapter.sendText({ threadId, threadType, text: t });

    if (!userId) return send("Không xác định được UID.");

    const sub = norm(args[0] || "");

    // ─── Overview ───────────────────────────────────────────
    if (!sub || sub === "menu" || sub === "info" || sub === "xem") {
      try {
        let avatarPath = null;
        try {
          avatarPath = (await getPlayerAvatarPath(userId))?.path || null;
        } catch {
          /* optional */
        }
        const view = await getFarmOverview(userId, { displayName, avatarPath });
        await sendUi(
          adapter,
          threadId,
          threadType,
          () => renderOverview(view),
          `🌾 Nông trại của ${displayName}`,
          `Nông trại Lv.${view.user.farmLevel} | Đất: ${view.totalPlots} | Trồng: ${view.usedPlots} | Thu hoạch: ${view.readyCount}`
        );
      } catch (e) {
        console.error("[nongtrai]", e);
        return send("Lỗi tải nông trại: " + (e?.message || e));
      }
      return;
    }

    // ─── Trồng cây ──────────────────────────────────────────
    if (sub === "trong" || sub === "plant" || sub === "gieo") {
      try {
        const overview = await getFarmOverview(userId, { displayName });
        if (overview.totalPlots <= 0) {
          return send("Bạn chưa có đất trồng.\nDùng .nongtrai muadat để mua đất.");
        }
        if (overview.emptySlots <= 0) {
          return send("Không còn ô đất trống. Thu hoạch hoặc mua thêm đất.");
        }
        const seeds = await getOwnedSeeds(userId);
        if (seeds.length === 0) {
          return send("Kho không có hạt giống.\nMua hạt giống tại .shop → Vật phẩm → Nông Trại.");
        }
        await sendUi(
          adapter,
          threadId,
          threadType,
          () => renderSeedList(seeds, overview.emptySlots, overview.user.farmLevel),
          "Reply số thứ tự hạt giống để trồng",
          seeds.map((s, i) => `${i + 1}. ${s.name} x${s.quantity}`).join("\n")
        );
        setS(userId, threadId, {
          action: "plant_select",
          seeds,
          emptySlots: overview.emptySlots,
        });
      } catch (e) {
        console.error("[nongtrai trong]", e);
        return send("Lỗi: " + (e?.message || e));
      }
      return;
    }

    // ─── Mua đất ────────────────────────────────────────────
    if (sub === "muadat" || sub === "land" || sub === "dat") {
      try {
        const overview = await getFarmOverview(userId, { displayName });
        const lands = getLands();
        const balance = await getBalance(userId);
        await sendUi(
          adapter,
          threadId,
          threadType,
          () => renderLandShop(lands, overview.user.farmLevel, balance),
          "Reply số thứ tự đất để mua",
          lands.map((l, i) => `${i + 1}. ${l.name} — ${l.price} xu`).join("\n")
        );
        setS(userId, threadId, { action: "buy_land", lands });
      } catch (e) {
        console.error("[nongtrai muadat]", e);
        return send("Lỗi: " + (e?.message || e));
      }
      return;
    }

    // ─── Thu hoạch ──────────────────────────────────────────
    if (sub === "thuhoach" || sub === "harvest" || sub === "thu") {
      try {
        const plots = await getPlotList(userId);
        const ready = plots.filter((p) => p.status === "ready");
        if (ready.length === 0) {
          if (plots.length === 0) return send("Chưa có cây nào đang trồng.");
          await sendUi(
            adapter,
            threadId,
            threadType,
            () => renderGarden(plots, "view"),
            "Chưa có cây sẵn sàng thu hoạch",
            "Cây đang phát triển..."
          );
          return;
        }
        // harvest all ready by default; or show list
        const arg1 = norm(args[1] || "");
        if (arg1 === "all" || arg1 === "het" || !arg1) {
          const result = await harvestPlots(userId, null);
          if (!result.ok) return send(result.error);
          await sendUi(
            adapter,
            threadId,
            threadType,
            () => renderHarvestResult(result),
            `Thu hoạch ${result.results.filter((r) => !r.error).length} cây • +${result.totalExp} EXP`,
            `Thu hoạch thành công! +${result.totalExp} EXP`
          );
          return;
        }
        // specific index
        const idx = parseInt(args[1], 10);
        if (!Number.isFinite(idx) || idx < 1 || idx > plots.length) {
          await sendUi(
            adapter,
            threadId,
            threadType,
            () => renderGarden(plots, "harvest"),
            "Reply số ô hoặc .nongtrai thuhoach all",
            null
          );
          setS(userId, threadId, { action: "harvest_select", plots });
          return;
        }
        const target = plots[idx - 1];
        if (target.status !== "ready") return send("Ô này chưa sẵn sàng thu hoạch.");
        const result = await harvestPlots(userId, [target.id]);
        if (!result.ok) return send(result.error);
        await sendUi(
          adapter,
          threadId,
          threadType,
          () => renderHarvestResult(result),
          `Thu hoạch thành công • +${result.totalExp} EXP`
        );
      } catch (e) {
        console.error("[nongtrai thuhoach]", e);
        return send("Lỗi: " + (e?.message || e));
      }
      return;
    }

    // ─── Sell / Chợ ─────────────────────────────────────────
    if (sub === "sell" || sub === "ban" || sub === "cho") {
      try {
        const sellable = await getSellableCrops(userId);
        const balance = await getBalance(userId);
        await sendUi(
          adapter,
          threadId,
          threadType,
          () => renderMarket(sellable, balance),
          "Reply số thứ tự / số lượng / all để bán",
          sellable.length
            ? sellable.map((s, i) => `${i + 1}. ${s.name} x${s.quantity} — ${s.unitPrice}/sp`).join("\n")
            : "Kho nông sản trống."
        );
        setS(userId, threadId, { action: "sell_select", sellable });
      } catch (e) {
        console.error("[nongtrai sell]", e);
        return send("Lỗi: " + (e?.message || e));
      }
      return;
    }

    // ─── Vườn chi tiết ──────────────────────────────────────
    if (sub === "vuon" || sub === "garden" || sub === "plots") {
      try {
        const plots = await getPlotList(userId);
        await sendUi(
          adapter,
          threadId,
          threadType,
          () => renderGarden(plots, "view"),
          `Khu vườn — ${plots.length} ô`,
          plots.length ? plots.map((p, i) => `${i + 1}. ${p.seed?.name || p.seedId} — ${p.status}`).join("\n") : "Vườn trống"
        );
      } catch (e) {
        return send("Lỗi: " + (e?.message || e));
      }
      return;
    }

    // ─── Thuốc ──────────────────────────────────────────────
    if (sub === "thuoc" || sub === "medicine" || sub === "med") {
      try {
        const all = getMedicines();
        const inv = await getInventoryItems(userId).catch(() => []);
        const owned = [];
        for (const m of all) {
          const it = inv.find((x) => x.itemId === m.id);
          if (it && it.quantity > 0) owned.push({ ...m, quantity: it.quantity });
        }
        await sendUi(
          adapter,
          threadId,
          threadType,
          () => renderMedicines(owned, all),
          owned.length ? "Reply số thứ tự thuốc để dùng" : "Mua thuốc tại .shop → Thuốc → Trồng Trọt",
          null
        );
        if (owned.length) {
          setS(userId, threadId, { action: "med_select", medicines: owned });
        }
      } catch (e) {
        return send("Lỗi: " + (e?.message || e));
      }
      return;
    }

    // ─── Dụng cụ ────────────────────────────────────────────
    if (sub === "dungcu" || sub === "tool" || sub === "tools" || sub === "dc") {
      try {
        const all = getTools();
        const owned = await getOwnedTools(userId);
        const bonuses = toolBonusesFrom(owned);
        await sendUi(
          adapter,
          threadId,
          threadType,
          () => renderTools(all, owned, bonuses),
          "Dụng cụ trồng trọt — mua tại .shop → Vật phẩm → Nông Trại",
          all.map((t) => `${t.name}${owned.some((o) => o.id === t.id) ? " (đã có)" : ` — ${t.price} xu`}`).join("\n")
        );
      } catch (e) {
        return send("Lỗi: " + (e?.message || e));
      }
      return;
    }

    // help
    return send(
      `🌾 NÔNG TRẠI — Lệnh:\n` +
        `.nongtrai — Tổng quan\n` +
        `.nongtrai trong — Trồng cây\n` +
        `.nongtrai muadat — Mua đất\n` +
        `.nongtrai thuhoach — Thu hoạch\n` +
        `.nongtrai sell — Bán nông sản\n` +
        `.nongtrai vuon — Xem vườn\n` +
        `.nongtrai thuoc — Dùng thuốc\n` +
        `.nongtrai dungcu — Dụng cụ & hiệu ứng\n` +
        `Hạt giống & dụng cụ: .shop → Vật phẩm → Nông Trại\n` +
        `Thuốc: .shop → Thuốc → Trồng Trọt`
    );
  },

  async onMessage({ adapter, message }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userId = normalizeUid(message.data?.uidFrom);
    if (!userId) return false;

    const sess = getS(userId, threadId);
    if (!sess) return false;

    const text = String(message.data?.content || message.body || "").trim();
    if (!text) return false;
    const send = (t) => adapter.sendText({ threadId, threadType, text: t });
    const lower = norm(text);

    // cancel
    if (["huy", "cancel", "0", "no", "khong"].includes(lower)) {
      clearS(userId, threadId);
      await send("Đã hủy thao tác nông trại.");
      return true;
    }

    try {
      // ── plant_select ──
      if (sess.action === "plant_select") {
        const idx = parseInt(text, 10);
        if (!Number.isFinite(idx) || idx < 1 || idx > sess.seeds.length) {
          await send(`Chọn số từ 1–${sess.seeds.length} (hoặc hủy).`);
          return true;
        }
        const seed = sess.seeds[idx - 1];
        const maxPlant = Math.min(seed.quantity, sess.emptySlots);
        if (maxPlant <= 1) {
          clearS(userId, threadId);
          const result = await plantSeeds(userId, seed.id, 1);
          if (!result.ok) {
            await send(result.error);
            return true;
          }
          await sendUi(
            adapter,
            threadId,
            threadType,
            () => renderPlantSuccess(result),
            `Đã trồng ${result.quantity} ${result.seed.name}`
          );
          return true;
        }
        setS(userId, threadId, {
          action: "plant_qty",
          seed,
          maxPlant,
        });
        await send(`Bạn muốn trồng bao nhiêu ${seed.name}?\nTối đa: ${maxPlant}\nReply số lượng (hoặc all).`);
        return true;
      }

      if (sess.action === "plant_qty") {
        let qty = 1;
        if (lower === "all" || lower === "het" || lower === "max") qty = sess.maxPlant;
        else qty = parseInt(text, 10);
        if (!Number.isFinite(qty) || qty < 1) {
          await send(`Nhập số từ 1–${sess.maxPlant}`);
          return true;
        }
        qty = Math.min(qty, sess.maxPlant);
        clearS(userId, threadId);
        const result = await plantSeeds(userId, sess.seed.id, qty);
        if (!result.ok) {
          await send(result.error);
          return true;
        }
        await sendUi(
          adapter,
          threadId,
          threadType,
          () => renderPlantSuccess(result),
          `Đã trồng ${result.quantity} ${result.seed.name}`
        );
        return true;
      }

      // ── buy_land ──
      if (sess.action === "buy_land") {
        const idx = parseInt(text, 10);
        if (!Number.isFinite(idx) || idx < 1 || idx > sess.lands.length) {
          await send(`Chọn số từ 1–${sess.lands.length}`);
          return true;
        }
        const land = sess.lands[idx - 1];
        setS(userId, threadId, { action: "buy_land_confirm", land });
        await send(
          `Xác nhận mua ${land.name}?\n` +
            `Giá: ${land.price.toLocaleString("vi-VN")} xu\n` +
            `Số ô: ${land.plots}\n` +
            `Reply: có / không`
        );
        return true;
      }

      if (sess.action === "buy_land_confirm") {
        if (!["co", "yes", "y", "1", "ok", "mua"].includes(lower)) {
          clearS(userId, threadId);
          await send("Đã hủy mua đất.");
          return true;
        }
        clearS(userId, threadId);
        const result = await buyLand(userId, sess.land.id);
        if (!result.ok) {
          await send(result.error);
          return true;
        }
        await sendUi(
          adapter,
          threadId,
          threadType,
          () => renderBuyLandSuccess(result),
          `Đã mua ${result.land.name}`
        );
        return true;
      }

      // ── harvest_select ──
      if (sess.action === "harvest_select") {
        if (lower === "all" || lower === "het") {
          clearS(userId, threadId);
          const result = await harvestPlots(userId, null);
          if (!result.ok) {
            await send(result.error);
            return true;
          }
          await sendUi(adapter, threadId, threadType, () => renderHarvestResult(result), `+${result.totalExp} EXP`);
          return true;
        }
        const idx = parseInt(text, 10);
        if (!Number.isFinite(idx) || idx < 1 || idx > sess.plots.length) {
          await send(`Chọn số từ 1–${sess.plots.length} hoặc all`);
          return true;
        }
        const plot = sess.plots[idx - 1];
        if (plot.status !== "ready") {
          await send("Ô này chưa sẵn sàng thu hoạch.");
          return true;
        }
        clearS(userId, threadId);
        const result = await harvestPlots(userId, [plot.id]);
        if (!result.ok) {
          await send(result.error);
          return true;
        }
        await sendUi(adapter, threadId, threadType, () => renderHarvestResult(result), `+${result.totalExp} EXP`);
        return true;
      }

      // ── sell_select ──
      if (sess.action === "sell_select") {
        if (lower === "all" || lower === "het" || lower === "ban all") {
          clearS(userId, threadId);
          const result = await sellCrops(userId, "all");
          if (!result.ok) {
            await send(result.error);
            return true;
          }
          await sendUi(
            adapter,
            threadId,
            threadType,
            () => renderSellSuccess(result),
            `+${result.totalMoney.toLocaleString("vi-VN")} xu`
          );
          return true;
        }
        const parts = text.split(/\s+/);
        const idx = parseInt(parts[0], 10);
        if (!Number.isFinite(idx) || idx < 1 || idx > sess.sellable.length) {
          await send(`Chọn số từ 1–${sess.sellable.length} hoặc all`);
          return true;
        }
        const item = sess.sellable[idx - 1];
        let qty = item.quantity;
        if (parts[1]) {
          if (norm(parts[1]) === "all") qty = item.quantity;
          else qty = parseInt(parts[1], 10);
        }
        if (!Number.isFinite(qty) || qty < 1) {
          await send("Số lượng không hợp lệ.");
          return true;
        }
        if (qty > item.quantity) {
          await send(`Bạn chỉ có ${item.quantity} ${item.name}.`);
          return true;
        }
        // confirm if large value
        const value = item.unitPrice * qty;
        if (value >= 50000 && !sess.confirmed) {
          setS(userId, threadId, {
            action: "sell_confirm",
            cropId: item.id,
            qty,
            item,
            value,
          });
          await send(
            `Xác nhận bán ${qty} ${item.name}?\n` +
              `Đơn giá: ${item.unitPrice.toLocaleString("vi-VN")} xu\n` +
              `Tổng: ${value.toLocaleString("vi-VN")} xu\n` +
              `Reply: có / không`
          );
          return true;
        }
        clearS(userId, threadId);
        const result = await sellCrops(userId, item.id, qty);
        if (!result.ok) {
          await send(result.error);
          return true;
        }
        await sendUi(
          adapter,
          threadId,
          threadType,
          () => renderSellSuccess(result),
          `+${result.totalMoney.toLocaleString("vi-VN")} xu`
        );
        return true;
      }

      if (sess.action === "sell_confirm") {
        if (!["co", "yes", "y", "1", "ok"].includes(lower)) {
          clearS(userId, threadId);
          await send("Đã hủy bán.");
          return true;
        }
        clearS(userId, threadId);
        const result = await sellCrops(userId, sess.cropId, sess.qty);
        if (!result.ok) {
          await send(result.error);
          return true;
        }
        await sendUi(
          adapter,
          threadId,
          threadType,
          () => renderSellSuccess(result),
          `+${result.totalMoney.toLocaleString("vi-VN")} xu`
        );
        return true;
      }

      // ── med_select ──
      if (sess.action === "med_select") {
        const idx = parseInt(text, 10);
        if (!Number.isFinite(idx) || idx < 1 || idx > sess.medicines.length) {
          await send(`Chọn số từ 1–${sess.medicines.length}`);
          return true;
        }
        const med = sess.medicines[idx - 1];
        const result = await useMedicine(userId, med.id, null);
        if (result.needPlot) {
          setS(userId, threadId, {
            action: "med_plot",
            medicine: med,
            plots: result.plots,
          });
          const lines = result.plots
            .map((p, i) => {
              const name = p.seedId || "?";
              return `${i + 1}. Ô ${p.id} — ${name}`;
            })
            .join("\n");
          await send(`Chọn ô đất để dùng ${med.name}:\n${lines}`);
          return true;
        }
        clearS(userId, threadId);
        if (!result.ok) {
          await send(result.error);
          return true;
        }
        await send(
          `✅ Đã dùng ${result.medicine.name}` +
            (result.mode === "all" ? ` lên ${result.affected} cây.` : ".")
        );
        return true;
      }

      if (sess.action === "med_plot") {
        const idx = parseInt(text, 10);
        if (!Number.isFinite(idx) || idx < 1 || idx > sess.plots.length) {
          await send(`Chọn số từ 1–${sess.plots.length}`);
          return true;
        }
        const plot = sess.plots[idx - 1];
        clearS(userId, threadId);
        const result = await useMedicine(userId, sess.medicine.id, plot.id);
        if (!result.ok) {
          await send(result.error);
          return true;
        }
        await send(`✅ Đã dùng ${result.medicine.name} lên ô ${plot.id}.`);
        return true;
      }
    } catch (e) {
      console.error("[nongtrai onMessage]", e);
      clearS(userId, threadId);
      await send("Lỗi xử lý: " + (e?.message || e));
      return true;
    }

    return false;
  },
};
