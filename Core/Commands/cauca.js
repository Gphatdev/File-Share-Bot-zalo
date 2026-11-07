import { unlinkSync } from "node:fs";
import {
  doFish, ensureDefaults, getUser, getAllMapsSorted, setMap, getRankList,
  getRodById, getBaitById, getMapById, getRods, getBaits,
  setEquippedRod, setEquippedBait, getConfig, expRequiredForFishingLevel, ensureDataFiles,
} from "./data/GIAITRI/CauCa/index.js";
import {
  renderCatchResult, renderFailResult, renderMapCanvas, renderRankCanvas, saveBufferToTempImage,
} from "./data/GIAITRI/CauCa/canvas.js";
import { getInventoryItems, getInventoryUsage, getInventoryTier } from "./data/GIAITRI/Inventory/index.js";
import {
  renderBalo, renderWorldMap, renderMarket, renderSellConfirm, renderSellSuccess, renderHelp, renderNotice, money,
} from "./data/GIAITRI/CauCa/ui.js";
import {
  getFishGroups, summarizeGroups, parseSellInput, buildPlan, executeSale, isYes, isNo, isAllWord,
} from "./data/GIAITRI/CauCa/market.js";
import { getBalance } from "./data/GIAITRI/TienGame/index.js";
import {
  getOrCreateProfile,
  expRequiredForLevel as profileExpRequired,
  getPlayerAvatarPath,
} from "./data/GIAITRI/PlayerProfile/index.js";

function normalizeUid(v) { return String(v ?? "").trim(); }
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

const sessions = new Map();
const SESSION_TTL = 5 * 60 * 1000;
function sk(uid, tid) { return `${uid}|${tid}`; }
function pruneSessions() {
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expiresAt < now) sessions.delete(k);
}
function setS(uid, tid, data, ttl = SESSION_TTL) {
  if (sessions.size > 200) pruneSessions();
  sessions.set(sk(uid, tid), { ...data, expiresAt: Date.now() + ttl });
}
function getS(uid, tid) {
  const d = sessions.get(sk(uid, tid));
  if (!d) return null;
  if (d.expiresAt < Date.now()) { sessions.delete(sk(uid, tid)); return null; }
  return d;
}
function clearS(uid, tid) { sessions.delete(sk(uid, tid)); }

async function sendImg(adapter, threadId, threadType, buffer, caption) {
  const imagePath = saveBufferToTempImage(buffer, "cauca");
  try {
    await adapter.sendImage({ threadId, threadType, imagePath, caption: caption || undefined });
  } finally {
    try { unlinkSync(imagePath); } catch {}
  }
}

/** Vẽ ảnh rồi gửi kèm chữ trong cùng 1 tin nhắn; vẽ/gửi ảnh lỗi → gửi chữ, không crash. */
async function sendUi(adapter, threadId, threadType, render, caption, fallbackText) {
  try {
    const buf = await render();
    await sendImg(adapter, threadId, threadType, buf, caption);
    return true;
  } catch (err) {
    console.error("[cauca ui]", err?.message);
    try { await adapter.sendText({ threadId, threadType, text: fallbackText || caption || "❌ Không gửi được ảnh." }); } catch {}
    return false;
  }
}

const looksLikeSelection = (t) => isAllWord(t) || /^(?:\d{1,3}(?:[x:*×]\d{1,6})?[\s,;]*)+$/i.test(String(t).trim());

async function getPlayerLevel(userId) {
  try { return (await getOrCreateProfile(userId)).level || 1; } catch { return 1; }
}
async function getAvatar(userId, adapter) {
  try { return (await getPlayerAvatarPath(userId, { adapter, forceRefresh: false }))?.path || null; } catch { return null; }
}

/** Trạng thái các khu vực cho bản đồ (đồng bộ với setMap: level hồ sơ + cần câu yêu cầu). */
async function buildMapView(userId) {
  await ensureDefaults(userId);
  const user = await getUser(userId);
  const level = await getPlayerLevel(userId);
  const inv = await getInventoryItems(userId);
  const owned = new Set(inv.map((i) => i.itemId));
  const maps = getAllMapsSorted().map((m, i) => {
    const rod = m.requiredRod ? getRodById(m.requiredRod) : null;
    const needLv = level < (m.requiredLevel || 1);
    const needRod = !!m.requiredRod && !owned.has(m.requiredRod);
    const reasons = [];
    if (needLv) reasons.push(`Lv.${level}/${m.requiredLevel}`);
    if (needRod) reasons.push("chưa có cần");
    const state = user.currentMap === m.id ? "here" : (needLv || needRod) ? "locked" : "open";
    return {
      id: m.id, name: m.name, index: i + 1, stars: m.stars || m.difficulty || 1, diffLabel: m.difficultyLabel || "",
      requiredLevel: m.requiredLevel || 1,
      reqText: `Lv.${m.requiredLevel || 1}+` + (rod ? ` · ${rod.name}` : ""),
      state, lockReason: reasons.join(" · "), desc: m.description || "",
    };
  });
  return { maps, level, user };
}

const USAGE = [
  "🎣  CÂU CÁ — HNNP FISHING",
  "────────────────────",
  "▸ .cauca cau — bắt đầu câu",
  "▸ .cauca balo — bộ sưu tập cá",
  "▸ .cauca sell — chợ cá, bán cá lấy tiền",
  "▸ .cauca map — bản đồ & di chuyển",
  "▸ .cauca rank — TOP 15 Cần Thủ",
  "▸ .cauca info — thông tin cá nhân",
  "▸ .cauca rod — xem/đổi cần câu",
  "▸ .cauca bait — xem/đổi mồi",
  "",
  "📌 Mặc định: Cần Tre · Mồi Giun · Hồ Bé",
  "💰 Mua cần & mồi: .shop → Trang bị → Câu Cá",
  "🎒 Cá câu được vào .balo",
].join("\n");

async function showBalo({ adapter, threadId, threadType, userId, userName, page = 1 }) {
  await ensureDefaults(userId);
  const user = await getUser(userId);
  const groups = await getFishGroups(userId);
  const sum = summarizeGroups(groups);
  const perPage = Math.max(4, Math.min(16, Number(getConfig().baloPageSize) || 12));
  const pages = Math.max(1, Math.ceil(groups.length / perPage));
  const cur = Math.min(Math.max(1, page), pages);
  const usage = await getInventoryUsage(userId);
  const tier = await getInventoryTier(userId);
  const inv = await getInventoryItems(userId);
  const rod = getRodById(user.equippedRod), bait = getBaitById(user.equippedBait);
  const baitQty = inv.find((i) => i.itemId === user.equippedBait)?.quantity ?? 0;
  const level = await getPlayerLevel(userId);
  const avatarPath = await getAvatar(userId, adapter);
  const caption = [
    `🎒 FISHING INVENTORY — ${userName}`,
    `🐟 ${sum.fish} con · ${sum.types} loài · 💰 ${money(sum.value)}`,
    `📦 Balo ${usage.usedSlots}/${tier.capacity ?? "∞"} ô` + (pages > 1 ? ` · Trang ${cur}/${pages} (reply next/back)` : ""),
  ].join("\n");
  const fallback = caption + "\n" + (groups.length
    ? groups.slice((cur - 1) * perPage, cur * perPage).map((g) => `• ${g.name} x${g.count}`).join("\n")
    : "Balo chưa có cá. Dùng .cauca cau để câu.");
  await sendUi(adapter, threadId, threadType, () => renderBalo({
    name: userName, level, avatarPath,
    groups: groups.slice((cur - 1) * perPage, cur * perPage),
    fishTotal: sum.fish, typeTotal: sum.types, slotsUsed: usage.usedSlots, slotCap: tier.capacity,
    totalValue: sum.value, page: cur, pages,
    rodName: rod?.name, baitText: bait ? `${bait.name} x${baitQty}` : "",
  }), caption, fallback);
  if (pages > 1) setS(userId, threadId, { type: "BALO_PAGE", page: cur, pages, userName });
}

async function askConfirm({ adapter, threadId, threadType, userId, groups, order, parsed }) {
  const plan = buildPlan(groups, order, parsed);
  if (!plan.ok) { await adapter.sendText({ threadId, threadType, text: `❌ ${plan.error}` }); return false; }
  const balance = await getBalance(userId).catch(() => null);
  const lines = plan.lines.map((l) => ({ fishId: l.fishId, name: l.name, rarity: l.rarity, qty: l.qty, value: l.value, def: l.def }));
  const text = [
    "🐟 XÁC NHẬN BÁN CÁ",
    ...lines.map((l) => `• ${l.name} x${l.qty} = ${money(l.value)}`),
    `💰 Tổng nhận: ${money(plan.total)}`,
    'Reply "yes" để xác nhận · "no" để hủy',
  ].join("\n");
  await sendUi(adapter, threadId, threadType,
    () => renderSellConfirm({ lines, total: plan.total, count: plan.count, balance }), text, text);
  setS(userId, threadId, { type: "SELL_CONFIRM", order, parsed, total: plan.total }, getConfig().sellConfirmTtlMs || 120000);
  return true;
}

export default {
  name: "cauca",
  description: "Câu Cá — map, cần, mồi, EXP, Canvas kết quả",
  version: "2.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 1,
  aliases: ["câu", "fishing", "ccau"],
  noPrefix: false,

  async run({ adapter, message, args = [], config }) {
    ensureDataFiles();
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userId = normalizeUid(message.data?.uidFrom);
    const userName = String(message.data?.dName || "Người chơi").slice(0, 40);
    const send = (text) => adapter.sendText({ threadId, threadType, text });
    if (!userId) return send("❌ Không xác định được UID.");

    const sub = norm(args[0] || "");
    const prefix = String(config?.botPrefix || ".");
    if (!sub || sub === "help" || sub === "huongdan" || sub === "hd") {
      await sendUi(adapter, threadId, threadType, () => renderHelp({ prefix }), USAGE, USAGE);
      return;
    }

    if (sub === "cau" || sub === "câu" || sub === "fish" || sub === "cast") {
      try {
        const result = await doFish(userId, userName);
        if (!result.success) return send(result.error || "❌ Không thể câu.");
        if (!result.caught) {
          const buf = await renderFailResult({ baitConsumed: result.baitConsumed });
          await sendImg(adapter, threadId, threadType, buf, "🎣 Câu hụt!");
          return;
        }
        let avatarPath = null;
        try {
          const av = await getPlayerAvatarPath(userId, { adapter, forceRefresh: false });
          avatarPath = av?.path || null;
        } catch (e) {
          console.warn("[cauca] avatar:", e?.message);
        }

        const buf = await renderCatchResult({
          displayName: userName, fishingLevel: result.fishingLevel,
          fishingExp: result.fishingExp, fishingExpRequired: result.fishingExpRequired,
          fish: result.fish, size: result.size, price: result.price, expGain: result.expGain,
          rod: result.rod, bait: result.bait, map: result.map, imagePath: result.imagePath,
          avatarPath, baitRemaining: result.baitRemaining,
        });
        const achLines = (result.newAchievements || []).map((a) => `🏆 Thành tựu mới: ${a.icon || "🏆"} ${a.name}`);
        const caption = [
          `🎣 ${userName} câu được ${result.fish.icon || "🐟"} ${result.fish.name}!`,
          `📏 ${result.size} cm · 💰 +${result.price}$ · ✨ +${result.expGain} EXP`,
          result.leveledUp ? `⭐ Lên Level ${result.fishingLevel}!` : null,
          ...achLines,
        ].filter(Boolean).join("\n");
        await sendImg(adapter, threadId, threadType, buf, caption);
      } catch (err) {
        console.error("[cauca cau]", err);
        return send(`❌ Lỗi câu cá: ${err.message}`);
      }
      return;
    }

    if (sub === "map" || sub === "ban do" || sub === "bando" || sub === "di") {
      try {
        const view = await buildMapView(userId);
        const here = view.maps.find((m) => m.state === "here");
        const caption = [
          "🗺️ FISHING WORLD — Bản đồ câu cá",
          `📍 Đang ở: ${here?.name || "?"}`,
          "Reply số để di chuyển: " + view.maps.map((m) => `${m.index} → ${m.name}${m.state === "locked" ? " 🔒" : ""}`).join(" · "),
        ].join("\n");
        const avatarPath = await getAvatar(userId, adapter);
        const ok = await sendUi(adapter, threadId, threadType,
          () => renderWorldMap({ name: userName, level: view.level, avatarPath, maps: view.maps }), caption, caption);
        if (ok || true) setS(userId, threadId, { type: "MAP_SELECT", maps: view.maps.map((m) => m.id) });
      } catch (err) {
        console.error("[cauca map]", err);
        return send(`❌ Lỗi bản đồ: ${err.message}`);
      }
      return;
    }

    if (sub === "balo" || sub === "bag" || sub === "kho" || sub === "inventory") {
      try { await showBalo({ adapter, threadId, threadType, userId, userName, page: parseInt(args[1], 10) || 1 }); }
      catch (err) { console.error("[cauca balo]", err); return send(`❌ Lỗi balo: ${err.message}`); }
      return;
    }

    if (sub === "sell" || sub === "ban" || sub === "cho" || sub === "market") {
      try {
        await ensureDefaults(userId);
        const groups = await getFishGroups(userId);
        if (!groups.length) {
          const t = "🐟 Balo của bạn chưa có cá để bán. Dùng .cauca cau để câu cá.";
          await sendUi(adapter, threadId, threadType,
            () => renderNotice({ kind: "info", title: "CHƯA CÓ CÁ ĐỂ BÁN", lines: ["Balo của bạn chưa có con cá nào.", "Dùng .cauca cau để bắt đầu câu cá."] }), t, t);
          return;
        }
        const order = groups.map((g) => g.fishId);
        // .cauca sell <lựa chọn>  → đi thẳng tới bước xác nhận
        if (args.length > 1) {
          const parsed = parseSellInput(args.slice(1).join(" "), order.length);
          if (!parsed.ok) return send(`❌ ${parsed.error}`);
          return await askConfirm({ adapter, threadId, threadType, userId, groups, order, parsed });
        }
        const sum = summarizeGroups(groups);
        const balance = await getBalance(userId).catch(() => null);
        const caption = [
          "🐟 FISH MARKET — Chợ cá",
          `Bạn có ${sum.fish} con (${sum.types} loài) · giá trị ${money(sum.value)}`,
          "Reply số cá muốn bán: 1 2 3 · 1x5 2x3 · all",
        ].join("\n");
        await sendUi(adapter, threadId, threadType,
          () => renderMarket({ name: userName, balance, fishTotal: sum.fish, totalValue: sum.value,
            groups: groups.map((g, i) => ({ ...g, index: i + 1 })) }),
          caption,
          caption + "\n" + groups.map((g, i) => `${i + 1}. ${g.name} x${g.count} — ${money(g.totalValue)}`).join("\n"));
        setS(userId, threadId, { type: "SELL_SELECT", order }, getConfig().sellSelectTtlMs || SESSION_TTL);
      } catch (err) {
        console.error("[cauca sell]", err);
        return send(`❌ Lỗi chợ cá: ${err.message}`);
      }
      return;
    }

    if (sub === "rank" || sub === "bxh" || sub === "top") {
      try {
        const list = await getRankList(getConfig().rankTop || 15);
        const buf = await renderRankCanvas(list, { [userId]: userName });
        await sendImg(adapter, threadId, threadType, buf, "🏆 TOP Cần Thủ");
      } catch (err) {
        console.error("[cauca rank]", err);
        return send(`❌ Lỗi rank: ${err.message}`);
      }
      return;
    }

    if (sub === "info" || sub === "me" || sub === "tt" || sub === "status") {
      try {
        await ensureDefaults(userId);
        const user = await getUser(userId);
        const profile = await getOrCreateProfile(userId);
        const need = profileExpRequired(profile.level);
        const rod = getRodById(user.equippedRod);
        const bait = getBaitById(user.equippedBait);
        const map = getMapById(user.currentMap);
        const inv = await getInventoryItems(userId);
        const baitEntry = inv.find((i) => i.itemId === user.equippedBait);
        const qty = baitEntry?.quantity ?? 0;
        return send([
          `🎣 THÔNG TIN CẦN THỦ`, `────────────────`,
          `👤 ${userName}`,
          `⭐ Level ${profile.level} (${profile.exp}/${need} EXP) · đồng bộ Hồ sơ`,
          `🎣 Cần: ${rod?.name || user.equippedRod}`,
          `🪱 Mồi: ${bait?.name || user.equippedBait} (x${qty})`,
          `📍 Vị trí: ${map?.name || user.currentMap}`, ``,
          `🐟 Đã câu: ${user.totalCaught}`,
          `📏 Tổng cm: ${Math.round(user.totalSize)}`,
          `💨 Hụt: ${user.totalFails || 0}`, ``,
          `Dùng .cauca cau để câu · .cauca map để đổi chỗ`,
        ].join("\n"));
      } catch (err) { return send(`❌ Lỗi: ${err.message}`); }
    }

    if (sub === "rod" || sub === "can" || sub === "cần") {
      try {
        await ensureDefaults(userId);
        const user = await getUser(userId);
        const rods = getRods();
        const inv = await getInventoryItems(userId);
        const owned = new Set(inv.map((i) => i.itemId));
        let msg = "🎣 DANH SÁCH CẦN CÂU\n────────────────\n";
        rods.forEach((r, i) => {
          const has = owned.has(r.id);
          const eq = user.equippedRod === r.id ? " ✅" : "";
          msg += `${i + 1}. ${r.icon || "🎣"} ${r.name}${has ? "" : " (chưa có)"}${eq}\n`;
        });
        msg += "\nReply số để trang bị cần đang sở hữu.\nMua cần: .shop → Trang bị → Câu Cá";
        setS(userId, threadId, { type: "ROD_SELECT", rods: rods.map((r) => r.id) });
        return send(msg);
      } catch (err) { return send(`❌ ${err.message}`); }
    }

    if (sub === "bait" || sub === "moi" || sub === "mồi") {
      try {
        await ensureDefaults(userId);
        const user = await getUser(userId);
        const baits = getBaits();
        const inv = await getInventoryItems(userId);
        const qtyMap = {};
        for (const it of inv) qtyMap[it.itemId] = it.quantity || 0;
        let msg = "🪱 DANH SÁCH MỒI\n────────────────\n";
        baits.forEach((b, i) => {
          const q = qtyMap[b.id] || 0;
          const eq = user.equippedBait === b.id ? " ✅" : "";
          msg += `${i + 1}. ${b.icon || "🪱"} ${b.name} x${q}${eq}\n`;
        });
        msg += "\nReply số để dùng mồi đang có.\nMua mồi: .shop → Trang bị → Câu Cá";
        setS(userId, threadId, { type: "BAIT_SELECT", baits: baits.map((b) => b.id) });
        return send(msg);
      } catch (err) { return send(`❌ ${err.message}`); }
    }

    return send(USAGE);
  },

  async onMessage({ adapter, message, config }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userId = normalizeUid(message.data?.uidFrom);
    if (!userId || message.isSelf) return;
    const sess = getS(userId, threadId);
    if (!sess) return;
    const content = String(message.data?.content || "").trim();
    const prefix = String(config?.botPrefix || ".");
    if (!content || content.startsWith(prefix) || content.startsWith(".") || content.startsWith("!") || content.startsWith("/") || content.startsWith(",")) return;
    const send = (text) => adapter.sendText({ threadId, threadType, text });
    const userName = String(message.data?.dName || sess.userName || "Người chơi").slice(0, 40);
    try {
      // ── chọn khu vực trên bản đồ: reply số, không cần gõ lại lệnh ──
      if (sess.type === "MAP_SELECT") {
        if (!/^\d{1,2}$/.test(content)) return;                 // chat bình thường → bỏ qua
        const idx = parseInt(content, 10) - 1;
        if (idx < 0 || idx >= (sess.maps?.length || 0)) return send(`Reply số từ 1 đến ${sess.maps?.length || 4} để di chuyển.`);
        const res = await setMap(userId, sess.maps[idx]);
        if (!res.success) return send(`🔒 ${res.error}\nBạn vẫn có thể reply số khác.`);   // giữ phiên, không bắt gõ lại
        clearS(userId, threadId);
        const map = res.map;
        const user = await getUser(userId);
        const rod = getRodById(user.equippedRod);
        const bait = getBaitById(user.equippedBait);
        const caption = [
          `📍 DI CHUYỂN THÀNH CÔNG — ${map.name}`,
          `🐟 ${map.description || "Khu vực câu cá"} · ⭐ ${map.difficultyLabel || ""}`,
          `🎣 Cần: ${rod?.name || "Cần Tre"} · 🪱 Mồi: ${bait?.name || "Mồi Giun"}`,
          "Bây giờ dùng: .cauca cau",
        ].join("\n");
        const view = await buildMapView(userId);
        const avatarPath = await getAvatar(userId, adapter);
        await sendUi(adapter, threadId, threadType,
          () => renderWorldMap({ name: userName, level: view.level, avatarPath, maps: view.maps }), caption, caption);
        return;
      }

      // ── balo: next / back / số trang ──
      if (sess.type === "BALO_PAGE") {
        const t = content.toLowerCase();
        let page = null;
        if (["next", "tiep", "tiếp", "sau", ">"].includes(t)) page = sess.page + 1;
        else if (["back", "prev", "truoc", "trước", "<"].includes(t)) page = sess.page - 1;
        else if (/^\d{1,2}$/.test(t)) page = parseInt(t, 10);
        if (page === null) return;
        if (page < 1 || page > sess.pages) return send(`Balo có ${sess.pages} trang. Reply số từ 1 đến ${sess.pages}, "next" hoặc "back".`);
        await showBalo({ adapter, threadId, threadType, userId, userName, page });
        return;
      }

      // ── chợ cá: chọn cá (nhiều số / số lượng / all) ──
      if (sess.type === "SELL_SELECT") {
        if (isNo(content)) { clearS(userId, threadId); return send("❎ Đã hủy bán cá."); }
        if (!looksLikeSelection(content)) return;                // không phải lựa chọn bán → bỏ qua
        const groups = await getFishGroups(userId);
        if (!groups.length) { clearS(userId, threadId); return send("🐟 Balo của bạn không còn cá để bán."); }
        const order = sess.order;
        const parsed = parseSellInput(content, order.length);
        if (!parsed.ok) return send(`❌ ${parsed.error}`);
        await askConfirm({ adapter, threadId, threadType, userId, groups, order, parsed });
        return;
      }

      // ── chợ cá: xác nhận yes / no ──
      if (sess.type === "SELL_CONFIRM") {
        if (isNo(content)) { clearS(userId, threadId); return send("❎ Đã hủy bán cá."); }
        if (!isYes(content)) {
          if (looksLikeSelection(content)) {                       // chọn lại ngay trong bước xác nhận
            const groups = await getFishGroups(userId);
            const parsed = parseSellInput(content, sess.order.length);
            if (!parsed.ok) return send(`❌ ${parsed.error}`);
            await askConfirm({ adapter, threadId, threadType, userId, groups, order: sess.order, parsed });
          }
          return;
        }
        clearS(userId, threadId);                                  // chặn "yes" lặp → không bán 2 lần
        const res = await executeSale(userId, sess.order, sess.parsed, { expectTotal: sess.total });
        if (!res.success) return send(`❌ ${res.error}`);
        const lines = res.lines.map((l) => ({ fishId: l.fishId, name: l.name, rarity: l.rarity, qty: l.qty, value: l.value, def: l.def }));
        const text = [
          "✅ BÁN CÁ THÀNH CÔNG",
          ...lines.map((l) => `• ${l.name} x${l.qty} = ${money(l.value)}`),
          `💰 Nhận được: +${money(res.total)}`,
          res.balance != null ? `💳 Số dư mới: ${money(res.balance)}` : "",
        ].filter(Boolean).join("\n");
        await sendUi(adapter, threadId, threadType,
          () => renderSellSuccess({ lines, total: res.total, count: res.count, balance: res.balance }), text, text);
        return;
      }

      if (sess.type === "ROD_SELECT") {
        const idx = parseInt(content, 10) - 1;
        if (!Number.isFinite(idx) || idx < 0 || idx >= (sess.rods?.length || 0))
          return send("Reply số cần hợp lệ.");
        const res = await setEquippedRod(userId, sess.rods[idx]);
        clearS(userId, threadId);
        if (!res.success) return send(`❌ ${res.error}`);
        return send(`✅ Đã trang bị: ${res.rod.icon || "🎣"} ${res.rod.name}`);
      }
      if (sess.type === "BAIT_SELECT") {
        const idx = parseInt(content, 10) - 1;
        if (!Number.isFinite(idx) || idx < 0 || idx >= (sess.baits?.length || 0))
          return send("Reply số mồi hợp lệ.");
        const res = await setEquippedBait(userId, sess.baits[idx]);
        clearS(userId, threadId);
        if (!res.success) return send(`❌ ${res.error}`);
        return send(`✅ Đã dùng mồi: ${res.bait.icon || "🪱"} ${res.bait.name}`);
      }
    } catch (err) {
      console.error("[cauca onMessage]", err);
      await send(`❌ Lỗi: ${err.message}`);
    }
  },
};
