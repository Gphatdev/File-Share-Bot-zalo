/**
 * Chợ cá — logic nhóm cá trong balo, parser lựa chọn bán và giao dịch bán cá.
 *
 * Nguồn dữ liệu duy nhất cho cá là Inventory (mỗi con cá = 1 mục `caught_fish` có meta).
 * Mọi thay đổi (trừ cá + cộng tiền + thống kê) chạy trong CÙNG khoá người dùng với `doFish`
 * (withUserLock của CauCa) nên không thể vừa câu vừa bán gây lệch dữ liệu.
 */
import { randomUUID } from "node:crypto";
import { getFishList, getUsers, saveUsers, safeNumber } from "./storage.js";
import { withUserLock, normalizeUserRecord } from "./index.js";
import { rarityInfo, RARITY } from "./fishArt.js";
import { getInventoryRaw, removeItem, addItem } from "../Inventory/index.js";
import { addMoney, getBalance } from "../TienGame/index.js";

const RARITY_ORDER = Object.keys(RARITY);

const uidKey = (u) => String(u ?? "").trim();

/** Giá một con cá: giá lúc câu (meta.price, đã tính kích thước/cần/mồi); thiếu thì dùng sellPrice trong fish.json. */
function unitPrice(meta, def) {
  const p = Math.floor(safeNumber(meta?.price, 0));
  if (p > 0) return p;
  return Math.max(1, Math.floor(safeNumber(def?.sellPrice ?? def?.basePrice, 1)));
}

/**
 * Nhóm cá của người chơi theo loài.
 * @returns {Promise<Array<{fishId,name,rarity,count,totalValue,unitAvg,bestSize,items:Array<{itemId,qty,price,size}>,def}>>}
 */
export async function getFishGroups(userId) {
  const defs = new Map(getFishList().map((f) => [f.id, f]));
  const raw = await getInventoryRaw(uidKey(userId));
  const map = new Map();
  for (const e of raw) {
    const m = e.meta || {};
    if (m.type !== "caught_fish" || !m.fishId) continue;
    const def = defs.get(m.fishId) || { id: m.fishId, name: m.fishName || m.fishId, rarity: m.rarity || "common" };
    let g = map.get(m.fishId);
    if (!g) {
      g = { fishId: m.fishId, name: def.name || m.fishName || m.fishId, rarity: def.rarity || m.rarity || "common",
        count: 0, totalValue: 0, bestSize: 0, items: [], def };
      map.set(m.fishId, g);
    }
    const price = unitPrice(m, def);
    const qty = Math.max(1, Math.floor(e.quantity));
    g.count += qty;
    g.totalValue += price * qty;
    g.bestSize = Math.max(g.bestSize, safeNumber(m.size, 0));
    g.items.push({ itemId: e.itemId, qty, price, size: safeNumber(m.size, 0), meta: m });
  }
  const list = [...map.values()];
  for (const g of list) {
    g.unitAvg = Math.round(g.totalValue / Math.max(1, g.count));
    g.items.sort((a, b) => a.price - b.price || a.size - b.size); // bán con rẻ nhất trước, giữ con xịn
  }
  list.sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name, "vi"));
  return list;
}

export function summarizeGroups(groups) {
  return {
    types: groups.length,
    fish: groups.reduce((s, g) => s + g.count, 0),
    value: groups.reduce((s, g) => s + g.totalValue, 0),
  };
}

// ───────────────────────── parser lựa chọn ─────────────────────────
const ALL_WORDS = new Set(["all", "tatca", "tat ca", "het", "bantatca"]);
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").trim();

export const isAllWord = (text) => ALL_WORDS.has(norm(text));
export const isYes = (text) => ["yes", "y", "xacnhan", "xac nhan", "ok", "dongy", "dong y"].includes(norm(text));
export const isNo = (text) => ["no", "n", "huy", "cancel", "khong"].includes(norm(text));

/**
 * Parser dòng trả lời. Hỗ trợ:  "1 2 4" · "1,2,4" · "1x5 2x3" · "1:5 2:3" · "all".
 * Trả về { ok:true, picks:[{index, qty|null}] , all:boolean } hoặc { ok:false, error }.
 * qty = null nghĩa là bán toàn bộ loài đó.
 */
export function parseSellInput(text, maxIndex) {
  const t = norm(text).replace(/×/g, "x");
  if (!t) return { ok: false, error: "Bạn chưa nhập số cá muốn bán." };
  if (isAllWord(t)) return { ok: true, all: true, picks: [] };

  const tokens = t.split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) return { ok: false, error: "Bạn chưa nhập số cá muốn bán." };

  const picks = new Map(); // index -> qty|null
  for (const tok of tokens) {
    const m = /^(\d{1,3})(?:[x:*](\d{1,6}))?$/.exec(tok);
    if (!m) return { ok: false, error: `Không hiểu "${tok}". Ví dụ: 1 2 3 · 1x5 2x3 · all` };
    const index = Number(m[1]);
    if (index < 1 || index > maxIndex) return { ok: false, error: `Số ${index} không có trong danh sách (1–${maxIndex}).` };
    if (m[2] === undefined) { picks.set(index, null); continue; }
    const qty = Number(m[2]);
    if (!Number.isSafeInteger(qty) || qty < 1) return { ok: false, error: `Số lượng của cá ${index} phải từ 1 trở lên.` };
    if (picks.get(index) === null) continue;               // đã chọn "bán hết" thì giữ
    picks.set(index, (picks.get(index) || 0) + qty);
  }
  return { ok: true, all: false, picks: [...picks.entries()].map(([index, qty]) => ({ index, qty })) };
}

/**
 * Chuyển lựa chọn (theo số thứ tự trong snapshot) → kế hoạch bán trên dữ liệu MỚI NHẤT.
 * @param {string[]} order  danh sách fishId theo đúng thứ tự đã hiển thị cho người chơi
 */
export function buildPlan(groups, order, parsed) {
  const byId = new Map(groups.map((g) => [g.fishId, g]));
  const wants = new Map(); // fishId -> qty|null
  if (parsed.all) for (const id of order) wants.set(id, null);
  else for (const p of parsed.picks) wants.set(order[p.index - 1], p.qty);

  const lines = [];
  for (const [fishId, want] of wants) {
    const g = byId.get(fishId);
    if (!g) return { ok: false, error: "Có loại cá bạn chọn không còn trong balo. Hãy gõ lại .cauca sell." };
    const qty = want === null ? g.count : want;
    if (qty > g.count) return { ok: false, error: `Bạn chỉ có ${g.count} con ${g.name}, không thể bán ${qty}.` };
    let need = qty, value = 0;
    const take = [];
    for (const it of g.items) {
      if (need <= 0) break;
      const n = Math.min(it.qty, need);
      take.push({ itemId: it.itemId, n, price: it.price, meta: it.meta });
      value += n * it.price; need -= n;
    }
    lines.push({ fishId, name: g.name, rarity: g.rarity, qty, value, take, def: g.def });
  }
  if (!lines.length) return { ok: false, error: "Chưa chọn cá nào để bán." };
  return { ok: true, lines, total: lines.reduce((s, l) => s + l.value, 0), count: lines.reduce((s, l) => s + l.qty, 0) };
}

/**
 * Thực hiện bán. Luôn tính lại từ balo hiện tại; nếu lệch so với bản xác nhận thì từ chối.
 * Trừ cá → cộng tiền (nếu cộng tiền lỗi thì hoàn cá). Trả { success, lines, total, balance }.
 */
export async function executeSale(userId, order, parsed, { expectTotal = null } = {}) {
  const key = uidKey(userId);
  if (!key) return { success: false, error: "Không xác định được người chơi." };
  return withUserLock(key, async () => {
    const groups = await getFishGroups(key);
    if (!groups.length) return { success: false, error: "Balo của bạn không có cá để bán.", code: "EMPTY" };
    const plan = buildPlan(groups, order, parsed);
    if (!plan.ok) return { success: false, error: plan.error, code: "INVALID" };
    if (expectTotal !== null && plan.total !== expectTotal) {
      return { success: false, error: "Balo đã thay đổi từ lúc xác nhận. Hãy gõ lại .cauca sell.", code: "CHANGED" };
    }

    const removed = []; // để hoàn lại nếu có lỗi
    let total = 0;
    try {
      for (const line of plan.lines) {
        for (const t of line.take) {
          const res = await removeItem(key, t.itemId, t.n, { force: true });
          if (!res.success) throw new Error(res.error || "Không trừ được cá");
          removed.push(t);
          total += t.n * t.price;
        }
      }
      if (total <= 0) throw new Error("Tổng tiền không hợp lệ");
      await addMoney(key, total, {
        type: "FISH_SELL",
        description: `Bán ${plan.count} cá`,
        referenceId: `cauca_sell_${key}_${randomUUID()}`,
      });
    } catch (err) {
      for (const t of removed.reverse()) {       // hoàn cá, không mất đồ
        try { await addItem(key, t.itemId, t.n, { meta: t.meta }); } catch (e) { console.error("[cauca sell] rollback", e?.message); }
      }
      return { success: false, error: `Giao dịch thất bại: ${err.message}`, code: "FAILED" };
    }

    try {
      const users = getUsers();
      const u = normalizeUserRecord(users[key], key);
      u.totalSoldValue = (u.totalSoldValue || 0) + total;
      u.updatedAt = Date.now();
      users[key] = u; saveUsers(users);
    } catch (e) { console.error("[cauca sell] stats", e?.message); }

    const balance = await getBalance(key).catch(() => null);
    return { success: true, lines: plan.lines, total, count: plan.count, balance };
  });
}

export { rarityInfo };
