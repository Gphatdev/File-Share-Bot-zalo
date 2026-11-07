/**
 * LIMIT PRO — HNNP STUDIO
 * Khóa lệnh theo 10 tổ hợp chức năng + BLOCK từng lệnh, cấu hình riêng cho từng nhóm chat.
 *
 * Cơ chế chặn: router gọi `commandGuard` của file này TRƯỚC khi chạy bất kỳ lệnh nào
 * (xem Handlers/HandleCommandRouter.js). Hook `onMessage` cũ chạy trước router và không nhận
 * `commands` nên không thể chặn lệnh — đã thay hoàn toàn bằng guard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRole } from "../../Utils/Permission.js";
import {
  CATEGORIES, getCategory, resolveCategory, classifyCommand, buildCatalog, resolveCommandName, PROTECTED_COMMANDS, norm,
} from "./data/ADMIN/Limit/categories.js";
import {
  loadState, setEnabled, lockGroup, unlockGroup, clearGroups, blockCommand, unblockCommand, clearBlocked,
} from "./data/ADMIN/Limit/store.js";
import { renderPanel, renderGroupDetail, renderBlockList, renderNotice, renderStatus, renderHelp } from "./data/ADMIN/Limit/canvas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, "data", "ADMIN", "Limit", "temp");
const MANAGE_SUBS = new Set(["on", "off", "add", "del", "clear", "block", "unblock", "clearblock"]);
const SUB_ALIAS = {
  "": "panel", panel: "panel", status: "status", st: "status",
  on: "on", bat: "on", off: "off", tat: "off",
  add: "add", lock: "add", khoa: "add",
  del: "del", remove: "del", rm: "del", unlock: "del", mo: "del",
  list: "list", ls: "list", clear: "clear", reset: "clear",
  block: "block", chan: "block", unblock: "unblock", bochan: "unblock",
  blocklist: "blocklist", bl: "blocklist", clearblock: "clearblock",
  help: "help", h: "help", huongdan: "help",
};

const prefixOf = (config) => String(config?.botPrefix || config?.prefix || ".");
const senderOf = (message) => String(message?.data?.uidFrom ?? "").trim();

async function sendText(adapter, threadId, text) {
  try { await adapter.sendText({ threadId, threadType: "group", text }); }
  catch (err) { /* nền tảng lỗi — không để crash */ }
}

async function sendCanvas(adapter, threadId, buffer, caption, logger) {
  let file = null;
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length < 100) throw new Error("buffer ảnh không hợp lệ");
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    file = path.join(TEMP_DIR, `limit-${Date.now()}-${Math.random().toString(16).slice(2, 7)}.png`);
    fs.writeFileSync(file, buffer);
    await adapter.sendImage({ threadId, threadType: "group", imagePath: file, caption: caption || "" });
    return true;
  } catch (err) {
    logger?.warn?.("[limit] Không gửi được ảnh Canvas:", { message: err?.message });
    return false;
  } finally {
    if (file) { try { fs.unlinkSync(file); } catch { /* đã xóa */ } }
  }
}

async function tryDeleteMessage(adapter, message, logger) {
  try { await adapter.deleteMessage(message); return true; }
  catch (err) {
    if (err?.code !== "FEATURE_UNAVAILABLE") logger?.warn?.("[limit] Không thể xóa tin nhắn:", { message: err?.message });
    return false;
  }
}

/** Mọi phản hồi đều là ảnh Canvas; chỉ rơi về chữ khi gửi ảnh thất bại. */
async function notify(ctx, kind, title, lines = [], extra = {}) {
  const { adapter, threadId, db, config, logger } = ctx;
  let st = { enabled: true, groups: [], blocked: [] };
  try { st = loadState(db, threadId); } catch { /* dùng mặc định */ }
  let buf = null;
  try {
    buf = renderNotice({ kind, title, lines, chips: extra.chips, hint: extra.hint, enabled: st.enabled, groups: st.groups.length, blocked: st.blocked.length, prefix: prefixOf(config) });
  } catch (err) { logger?.warn?.("[limit] Lỗi vẽ thẻ thông báo:", { message: err?.message }); }
  const ok = buf ? await sendCanvas(adapter, threadId, buf, title, logger) : false;
  if (!ok) await sendText(adapter, threadId, [title, ...lines, extra.hint].filter(Boolean).join("\n"));
}

async function showHelp(ctx, note) {
  const { adapter, threadId, db, config, logger } = ctx;
  let enabled = true; try { enabled = loadState(db, threadId).enabled; } catch { /* mặc định */ }
  let buf = null;
  try { buf = renderHelp({ prefix: prefixOf(config), enabled, note }); } catch { /* fallback chữ */ }
  const ok = buf ? await sendCanvas(adapter, threadId, buf, "LIMIT HELP", logger) : false;
  if (!ok) await sendText(adapter, threadId, `${note ? note + "\n" : ""}Cú pháp: ${prefixOf(config)}limit [status|on|off|add|del|list|clear|block|unblock|blocklist|clearblock]`);
}

function threadNameOf(db, threadId) {
  try {
    const rows = db.query("SELECT name FROM groups WHERE thread_id = ?", [String(threadId)]);
    const n = rows[0]?.name;
    return typeof n === "string" && n.trim() ? n.trim().slice(0, 40) : "";
  } catch { return ""; }
}

function panelData({ db, threadId, commands, config }) {
  const state = loadState(db, threadId);
  const cat = buildCatalog(commands);
  return {
    enabled: state.enabled, groups: state.groups, blocked: state.blocked,
    categories: CATEGORIES.map((c) => ({ id: c.id, label: c.label, color: c.color, count: cat.byCategory[c.id].length, preview: cat.byCategory[c.id] })),
    totalCommands: cat.total, unclassified: cat.unclassified.length, prefix: prefixOf(config), threadName: threadNameOf(db, threadId),
  };
}

async function showStatus(ctx) {
  const { adapter, threadId, logger } = ctx;
  const d = panelData(ctx);
  const buf = renderStatus({
    enabled: d.enabled, blocked: d.blocked, totalCommands: d.totalCommands, unclassified: d.unclassified, prefix: d.prefix,
    locked: d.categories.filter((c) => d.groups.includes(c.id)),
    categories: d.categories.map((c) => ({ label: c.label, color: c.color, count: c.count, locked: d.groups.includes(c.id) })),
  });
  const ok = await sendCanvas(adapter, threadId, buf, "LIMIT STATUS", logger);
  if (!ok) await sendText(adapter, threadId, statusText(ctx));
}

async function showPanel(ctx) {
  const { adapter, threadId, logger } = ctx;
  const ok = await sendCanvas(adapter, threadId, renderPanel(panelData(ctx)), "LIMIT PRO", logger);
  if (!ok) await sendText(adapter, threadId, statusText(ctx));
}

function statusText({ db, threadId, commands, config }) {
  const d = panelData({ db, threadId, commands, config });
  const label = (id) => getCategory(id)?.label || id;
  return `🛡️ LIMIT PRO\n• Hệ thống: ${d.enabled ? "BẬT" : "TẮT"}\n• Nhóm đang khóa: ${d.groups.length ? d.groups.map(label).join(", ") : "(không)"}\n• Lệnh bị BLOCK: ${d.blocked.length ? d.blocked.join(", ") : "(không)"}\n• Lệnh phát hiện: ${d.totalCommands}`;
}

function groupListHint(prefix) {
  return CATEGORIES.map((c, i) => `${i + 1}. ${c.label} → ${c.id}`).join("\n") + `\nVí dụ: ${prefix}limit add giaitri`;
}

async function groupError(ctx, raw) {
  const prefix = prefixOf(ctx.config);
  return notify(ctx, "deny", `Không có tổ hợp "${String(raw).slice(0, 24)}"`, ["Chọn một trong 10 tổ hợp bên dưới (hoặc số 1-10)."], {
    chips: CATEGORIES.map((c, i) => ({ text: `${i + 1}. ${c.id}`, color: c.color })), hint: `Ví dụ: ${prefix}limit add giaitri`,
  });
}

function parseGroupArg(raw) {
  if (/^\d+$/.test(String(raw || "").trim())) { const c = CATEGORIES[Number(raw) - 1]; return c ? c.id : null; }
  return resolveCategory(raw);
}

async function handleList(ctx, args) {
  const { adapter, threadId, commands, db, config, logger } = ctx;
  const prefix = prefixOf(config);
  const raw = args[1];
  if (!raw) return showPanel(ctx);
  const cat = buildCatalog(commands);
  if (["chuaphanloai", "unclassified", "khac"].includes(norm(raw).replace(/ /g, ""))) {
    return notify(ctx, "info", `Lệnh chưa phân loại (${cat.unclassified.length})`, cat.unclassified.length ? ["Không bị khóa theo nhóm nhưng vẫn BLOCK riêng được."] : ["Mọi lệnh đều đã có tổ hợp."], { chips: cat.unclassified.slice(0, 60).map((n) => ({ text: n, color: "#8aa0c0" })) });
  }
  const id = parseGroupArg(raw);
  if (!id) return groupError(ctx, raw);
  const state = loadState(db, threadId);
  const c = getCategory(id);
  const page = Math.max(1, parseInt(args[2], 10) || 1);
  const buf = renderGroupDetail({ cat: c, commands: cat.byCategory[id], blocked: state.blocked, locked: state.groups.includes(id), enabled: state.enabled, page, prefix });
  const ok = await sendCanvas(adapter, threadId, buf, c.label, logger);
  if (!ok) await sendText(adapter, threadId, `${c.label} (${cat.byCategory[id].length} lệnh):\n${cat.byCategory[id].join(", ") || "(trống)"}`);
}

async function handleBlockList(ctx, args) {
  const { adapter, threadId, commands, db, config, logger } = ctx;
  const state = loadState(db, threadId);
  const items = state.blocked.map((name) => {
    const cmd = commands.get(name);
    const id = cmd ? classifyCommand(cmd) : null;
    const c = id ? getCategory(id) : null;
    return { name, catLabel: c ? c.label : cmd ? "CHƯA PHÂN LOẠI" : "KHÔNG CÒN TRONG REGISTRY", catColor: c ? c.color : "#8aa0c0", groupLocked: !!id && state.groups.includes(id) };
  });
  const page = Math.max(1, parseInt(args[1], 10) || 1);
  const ok = await sendCanvas(adapter, threadId, renderBlockList({ items, enabled: state.enabled, page, prefix: prefixOf(config) }), "BLOCKED COMMANDS", logger);
  if (!ok) await sendText(adapter, threadId, `Lệnh bị BLOCK (${items.length}): ${items.map((i) => i.name).join(", ") || "(không có)"}`);
}

/** Khóa nhóm / BLOCK mà hệ thống đang TẮT thì sẽ không có tác dụng -> tự BẬT để lệnh có hiệu lực ngay. */
function autoEnable(db, threadId) {
  try {
    if (loadState(db, threadId).enabled) return undefined;
    setEnabled(db, threadId, true);
    return "LIMIT đang TẮT nên đã được tự động BẬT để có hiệu lực ngay";
  } catch { return undefined; }
}

async function handleManage(ctx, sub, args) {
  const { adapter, threadId, db, commands, aliases, config } = ctx;
  const prefix = prefixOf(config);

  switch (sub) {
    case "on": setEnabled(db, threadId, true); return notify(ctx, "ok", "Đã BẬT LIMIT PRO", ["Các tổ hợp đang khóa và lệnh bị BLOCK bắt đầu có hiệu lực với thành viên thường."]);
    case "off": setEnabled(db, threadId, false); return notify(ctx, "warn", "Đã TẮT LIMIT PRO", ["Cấu hình khóa / BLOCK vẫn được giữ và áp dụng lại khi bật."]);
    case "add": case "del": {
      if (!args[1]) return groupError(ctx, "(trống)");
      const id = parseGroupArg(args[1]);
      if (!id) return groupError(ctx, args[1]);
      const label = getCategory(id).label;
      if (sub === "add") {
        const r = lockGroup(db, threadId, id);
        if (!r.ok) return notify(ctx, "info", `${label} đã bị khóa từ trước`, ["Không có gì thay đổi."]);
        const off = autoEnable(db, threadId);
        return notify(ctx, "lock", `Đã khóa tổ hợp ${label}`, [`Thành viên thường không dùng được ${getCategory(id).desc ? "các lệnh " : ""}trong tổ hợp này.`], { chips: buildCatalog(commands).byCategory[id].slice(0, 40).map((n) => ({ text: n, color: getCategory(id).color })), hint: off });
      }
      const r = unlockGroup(db, threadId, id);
      return r.ok ? notify(ctx, "unlock", `Đã mở khóa ${label}`, ["Các lệnh BLOCK riêng vẫn được giữ nguyên."]) : notify(ctx, "info", `${label} hiện không bị khóa`, ["Không có gì thay đổi."]);
    }
    case "clear": { const n = clearGroups(db, threadId); return n ? notify(ctx, "unlock", `Đã mở khóa ${n} tổ hợp`, ["Danh sách BLOCK riêng không bị thay đổi."]) : notify(ctx, "info", "Không có tổ hợp nào đang bị khóa", []); }
    case "clearblock": { const n = clearBlocked(db, threadId); return n ? notify(ctx, "unlock", `Đã gỡ BLOCK ${n} lệnh`, ["Khóa theo tổ hợp không bị thay đổi."]) : notify(ctx, "info", "Không có lệnh nào đang bị BLOCK", []); }
    case "block": case "unblock": {
      const input = args[1];
      if (!input) return notify(ctx, "deny", "Thiếu tên lệnh", [`Cú pháp: ${prefix}limit ${sub} <tên lệnh>`]);
      const name = resolveCommandName(input, commands, aliases);
      if (sub === "unblock") {
        // cho phép gỡ cả lệnh đã bị xóa khỏi registry (dữ liệu cũ)
        const target = name || String(input).trim().toLowerCase();
        const r = unblockCommand(db, threadId, target);
        return r.ok ? notify(ctx, "unlock", `Đã gỡ BLOCK "${target}"`, ["Khóa theo tổ hợp (nếu có) vẫn giữ nguyên."]) : notify(ctx, "info", `"${String(input).slice(0, 24)}" không nằm trong danh sách BLOCK`, []);
      }
      if (!name) return notify(ctx, "deny", `Không tìm thấy lệnh "${String(input).slice(0, 24)}"`, ["Lệnh không có trong hệ thống."], { hint: `Dùng ${prefix}limit list <tổ hợp> để xem tên lệnh` });
      if (PROTECTED_COMMANDS.has(name)) return notify(ctx, "deny", `Không thể BLOCK "${name}"`, ["Đây là lệnh quản trị LIMIT, được bảo vệ để admin không tự khóa mình."]);
      const r = blockCommand(db, threadId, name);
      if (!r.ok) return notify(ctx, r.reason === "full" ? "deny" : "info", r.reason === "full" ? "Danh sách BLOCK đã đầy" : `"${name}" đã bị BLOCK từ trước`, []);
      const via = name !== String(input).toLowerCase() ? ` (alias "${input}" → lệnh chính "${name}")` : "";
      const off = autoEnable(db, threadId);
      return notify(ctx, "block", `Đã BLOCK lệnh "${name}"`, [via.trim() ? via.trim().replace(/^\(|\)$/g, "") : "Các lệnh khác không bị ảnh hưởng."], { hint: off });
    }
    default: return undefined;
  }
}

// ── throttle cảnh báo để không spam khi 1 người gõ liên tục ──
const warnedAt = new Map();
function shouldWarn(key, gap = 10_000) {
  const now = Date.now();
  const last = warnedAt.get(key) || 0;
  if (now - last < gap) return false;
  warnedAt.set(key, now);
  if (warnedAt.size > 500) for (const [k, t] of warnedAt) if (now - t > 60_000) warnedAt.delete(k);
  return true;
}

async function evaluate({ adapter, message, command, config, db, logger }) {
    if (message?.type !== 1 || !command?.name || PROTECTED_COMMANDS.has(command.name)) return { allow: true };
    const threadId = message.threadId;
    const state = loadState(db, threadId);
    if (!state.enabled) return { allow: true };

    const catId = classifyCommand(command);
    const byGroup = !!catId && state.groups.includes(catId);
    const byCommand = state.blocked.includes(command.name);
    if (!byGroup && !byCommand) return { allow: true };

    const sender = senderOf(message);
    const role = await resolveRole(sender, { config, adapter, threadId, isGroup: true });
    if (role >= 1) {
      // Admin/owner luôn được miễn trừ — báo rõ (ít spam) để admin không tưởng LIMIT bị lỗi khi tự thử.
      if (shouldWarn(`ex:${threadId}:${sender}`, 300_000)) {
        const why = [];
        if (byCommand) why.push(`lệnh "${command.name}" đang bị BLOCK`);
        if (byGroup) why.push(`tổ hợp ${getCategory(catId).label} đang bị khóa`);
        await notify({ adapter, threadId, db, config, logger }, "warn", "Bạn được miễn trừ LIMIT", [`${why.join(" và ")}, nhưng admin nhóm / owner vẫn dùng được.`, "Thành viên thường sẽ bị chặn. Hãy thử bằng tài khoản thành viên."], { hint: "Thông báo này chỉ hiện 1 lần mỗi 5 phút" });
      }
      return { allow: true };
    }

    await tryDeleteMessage(adapter, message, logger);
    if (shouldWarn(`${threadId}:${sender}:${command.name}`)) {
      const lines = [];
      const chips = [];
      if (byCommand) { lines.push(`Lệnh "${command.name}" đã bị BLOCK bởi quản trị viên.`); chips.push({ text: `BLOCK · ${command.name}`, color: "#fbbf24", solid: true }); }
      if (byGroup) { lines.push(`Tổ hợp ${getCategory(catId).label} đang bị khóa.`); chips.push({ text: getCategory(catId).label, color: "#fb5a6e", solid: true }); }
      await notify({ adapter, threadId, db, config, logger }, "deny", "Lệnh đang bị hạn chế", lines, { chips, hint: "Liên hệ quản trị viên nhóm nếu cần dùng" });
    }
    return { allow: false };
}

export default {
  name: "limit",
  description: "LIMIT PRO — khóa lệnh theo 10 tổ hợp chức năng và BLOCK từng lệnh cho từng nhóm chat",
  version: "2.0.0",
  author: "HNNP STUDIO",
  group: "moderation",
  role: 0,
  cooldown: 2,
  aliases: ["lockcmd"],
  noPrefix: false,

  async run({ adapter, message, args = [], config, db, logger, commands, aliases }) {
    const threadId = message.threadId;
    if (message.type !== 1) {
      await adapter.sendText({ threadId, threadType: "user", text: "Lệnh limit chỉ áp dụng cho hội thoại nhóm." }).catch(() => {});
      return;
    }
    const ctx = { adapter, message, threadId, config, db, logger, commands: commands instanceof Map ? commands : new Map(), aliases };
    const sub = SUB_ALIAS[norm(args[0] || "")];
    if (!sub) return showHelp(ctx, `Cú pháp không hợp lệ: "${String(args[0]).slice(0, 30)}"`);

    if (MANAGE_SUBS.has(sub)) {
      const role = await resolveRole(senderOf(message), { config, adapter, threadId, isGroup: true });
      if (role < 1) return notify(ctx, "deny", "Không đủ quyền", ["Chỉ quản trị viên nhóm hoặc owner mới thay đổi được cấu hình LIMIT."], { hint: "Bạn vẫn xem được: limit · status · list · blocklist" });
      return handleManage(ctx, sub, args);
    }
    if (sub === "status") return showStatus(ctx);
    if (sub === "help") return showHelp(ctx);
    if (sub === "list") return handleList(ctx, args);
    if (sub === "blocklist") return handleBlockList(ctx, args);
    return showPanel(ctx);
  },

  /**
   * Hook nền (chạy TRƯỚC router, kể cả khi router chưa được vá): tự thi hành LIMIT.
   * Nếu lệnh bị hạn chế với người gửi → xóa tin, gửi thẻ từ chối và làm rỗng nội dung tin để router không chạy lệnh.
   * (global.__NKNP_BOT__ do zalo.js gán; hook nền không nhận `commands` nên phải lấy từ đây.)
   */
  async onMessage({ adapter, message, config, db, logger }) {
    try {
      if (message?.type !== 1 || message?.isSelf) return;
      const content = message?.data?.content;
      if (typeof content !== "string") return;
      const prefix = String(config?.botPrefix || ".");
      if (!content.startsWith(prefix)) return;
      const first = content.slice(prefix.length).trim().split(/\s+/)[0];
      if (!first) return;
      const bot = global.__NKNP_BOT__;
      const reg = bot?.commands instanceof Map ? bot.commands : null;
      if (!reg) return;
      const name = bot.aliases?.get?.(first.toLowerCase()) || first.toLowerCase();
      const command = reg.get(name);
      if (!command) return;
      const verdict = await evaluate({ adapter, message, command, config, db, logger });
      if (verdict && verdict.allow === false) {
        // Router (cũ hoặc mới) đọc lại message.data.content → rỗng thì không coi là lệnh.
        message.__limitBlocked = true;
        message.data.content = "";
      }
    } catch (err) {
      logger?.warn?.("[limit] Lỗi hook onMessage:", { message: err?.message });
    }
  },

  /** Router (đã vá) gọi trước khi chạy mọi lệnh. Trả {allow:false} để chặn. */
  async commandGuard({ adapter, message, command, config, db, logger }) {
    return evaluate({ adapter, message, command, config, db, logger });
  },
};
