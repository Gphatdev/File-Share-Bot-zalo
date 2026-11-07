import fs from "node:fs";
import path from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import TienGame from "../TienGame/index.js";
import QRCode from "qrcode";
import axios from "axios";
import { getTransactions, readJson, writeJson } from "../TienGame/storage.js";
import { DEFAULT_CONFIG } from "./defaultConfig.js";
import { normalizePhone, findPhoneInText, phoneFromMessageData, isContactCard, isSkipInput } from "./phone.js";
import { decodeQrFromImage } from "../../../../../Utils/Qrdecoder.js";
import {
  renderAccountCard,
  renderTransferBill,
  renderReceiveBill,
  renderHistoryCard,
  renderQrCard,
  renderNotice,
  renderMenuCard,
  maskAccountNumber,
  maskPhone,
} from "./canvas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "config.json");
const ACCOUNTS_PATH = path.join(__dirname, "accounts.json");
const TEMP_DIR = path.join(__dirname, "temp");

const HELP = [
  "🏦 NGÂN HÀNG ẢO VBANK",
  "━━━━━━━━━━━━━━",
  "🆕 .vbank tao <tên tài khoản> — tạo tài khoản",
  "👁️ .vbank xem — xem thông tin ngân hàng hiện tại",
  "✏️ .vbank edit — chỉnh sửa tài khoản",
  "💸 .vbank bank <số tiền> @người nhận — chuyển tiền game",
  "🔢 .vbank bank <số tiền> <số tài khoản> — chuyển theo số tài khoản",
  "📜 .vbank lichsu [trang] — xem lịch sử giao dịch",
  "📱 .vbank qr — xem mã QR nhận tiền của bạn",
  "📷 .vbank bankqr — chuyển tiền bằng ảnh QR người nhận",
  "❌ .vbank huy — hủy thao tác đang thực hiện (hoặc gõ huy)",
].join("\n");

const sessions = new Map();

const SESSION_NAMES = { create: "tạo tài khoản", edit: "chỉnh sửa tài khoản", bankqr: "chuyển tiền bằng QR" };
const CANCEL_HINT = "💡 Gõ huy để hủy.";

/** Người dùng gõ huy / hủy / cancel / thoat */
function isCancelInput(raw) {
  return /^(huy|hủy|cancel|thoat|thoát)$/i.test(String(raw || "").trim());
}

/** Có phiên đang mở (chưa hết hạn)? Dùng để chặn lặp lệnh. */
function getLiveSession(userId) {
  const key = String(userId);
  const session = sessions.get(key);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(key);
    return null;
  }
  return session;
}

function busyNotice(userId) {
  const session = getLiveSession(userId);
  if (!session) return null;
  return [
    text(
      `⚠️ Bạn đang trong thao tác "${SESSION_NAMES[session.type] || "VBANK"}".\n` +
        "Hãy hoàn tất bước hiện tại hoặc gõ huy (hay .vbank huy) để hủy rồi chạy lệnh mới."
    ),
  ];
}

/** .vbank huy */
async function cancelSession({ senderId }) {
  const session = getLiveSession(senderId);
  if (!session) return [text("ℹ️ Bạn không có thao tác VBANK nào đang thực hiện.")];
  sessions.delete(String(senderId));
  return [text(`❌ Đã hủy thao tác "${SESSION_NAMES[session.type] || "VBANK"}".`)];
}

// ---------- cấu hình & dữ liệu ----------

function loadConfig() {
  // config.json thiếu / hỏng / không có danh sách ngân hàng -> dùng mặc định (không bao giờ ghi đè file hỏng)
  let cfg = {};
  let broken = false;
  try { cfg = readJson(CONFIG_PATH, {}) || {}; } catch { broken = true; }
  const merged = { ...DEFAULT_CONFIG, ...cfg };
  if (!Array.isArray(merged.banks) || !merged.banks.length) merged.banks = DEFAULT_CONFIG.banks;
  if (!broken && !fs.existsSync(CONFIG_PATH)) { try { writeJson(CONFIG_PATH, merged); } catch { /* chỉ là cache */ } }
  return merged;
}

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_PATH)) writeJson(ACCOUNTS_PATH, []);
  // readJson ném lỗi nếu file hỏng, nên không bao giờ ghi đè dữ liệu lỗi.
  const data = readJson(ACCOUNTS_PATH, []);
  return Array.isArray(data) ? data : [];
}

let writeChain = Promise.resolve();
function withAccountsLock(task) {
  const run = writeChain.then(task, task);
  writeChain = run.catch(() => {});
  return run;
}

function activeAccounts(list) {
  return list.filter((item) => item.status === "active");
}

export function findByOwner(userId) {
  const uid = String(userId);
  return activeAccounts(loadAccounts()).find((item) => item.ownerUserId === uid) || null;
}

export function findByNumber(accountNumber) {
  const number = String(accountNumber);
  return activeAccounts(loadAccounts()).find((item) => item.accountNumber === number) || null;
}

function getBank(bankId) {
  const config = loadConfig();
  return (config.banks || []).find((bank) => bank.id === bankId) || null;
}

const bankKey = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]/g, "");

function resolveBank(input) {
  const config = loadConfig();
  const banks = config.banks || [];
  const value = String(input || "").trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const index = Number(value) - 1;
    return banks[index] || null;
  }
  const lower = value.toLowerCase();
  return (
    banks.find((bank) => bank.id.toLowerCase() === lower) ||
    banks.find((bank) => bank.name.toLowerCase() === lower || bank.shortName.toLowerCase() === lower) ||
    // gõ liền / bỏ dấu / bỏ khoảng trắng: "mbbank" = "MB Bank", "vietin" không khớp nhưng "vietinbank" khớp
    banks.find((bank) => [bank.id, bank.name, bank.shortName].some((v) => bankKey(v) === bankKey(value))) ||
    null
  );
}

function bankListText() {
  const banks = loadConfig().banks || [];
  return banks.map((bank, index) => `${index + 1}. ${bank.name} (${bank.id})`).join("\n");
}

/** Lấy số điện thoại từ chữ người dùng gõ (mọi kiểu chữ số/ngăn cách) hoặc từ danh thiếp Zalo. */
function readPhone(input, messageData) {
  return normalizePhone(input) || findPhoneInText(input) || phoneFromMessageData(messageData);
}

function phoneRetryText(messageData, edit = false) {
  const base = isContactCard(messageData)
    ? "Danh thiếp này không có số điện thoại (có thể bị ẩn). Hãy gõ số hoặc gửi danh thiếp khác."
    : "Số điện thoại không hợp lệ. Gõ số điện thoại Việt Nam (vd 0912345678, +84 912 345 678) hoặc gửi danh thiếp.";
  return base + (edit ? "" : "\n⏭️ Gõ boqua để bỏ qua bước này.") + "\n" + CANCEL_HINT;
}

function validateAccountNumber(raw) {
  const config = loadConfig();
  const value = String(raw || "").trim();
  if (!/^\d+$/.test(value)) return { error: "Số tài khoản chỉ được chứa chữ số." };
  if (value.length < config.accountNumberMin || value.length > config.accountNumberMax) {
    return { error: `Số tài khoản phải có từ ${config.accountNumberMin} đến ${config.accountNumberMax} chữ số.` };
  }
  return { value };
}

function generateAccountNumber(list) {
  const config = loadConfig();
  const used = new Set(list.map((item) => item.accountNumber));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const length = config.accountNumberMin;
    let value = "";
    for (let i = 0; i < length; i += 1) value += String(randomInt(0, 10));
    if (value[0] !== "0" && !used.has(value)) return value;
  }
  throw new Error("Không tạo được số tài khoản ngẫu nhiên, vui lòng thử lại.");
}

function parseAmount(raw, max) {
  const text = String(raw ?? "");
  if (!/^\d+$/.test(text)) return { error: "Số tiền phải là số nguyên dương, không có dấu hay chữ." };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value <= 0) return { error: "Số tiền phải lớn hơn 0." };
  if (value > max) return { error: `Số tiền vượt giới hạn cho phép (${Number(max).toLocaleString("vi-VN")}).` };
  return { value };
}

function nowLabel() {
  return new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
}

// ---------- ghi dữ liệu tài khoản (có khóa, kiểm tra lại bên trong khóa) ----------

async function createAccountRecord(ownerUserId, fields) {
  return withAccountsLock(() => {
    const list = loadAccounts();
    if (list.some((item) => item.status === "active" && item.ownerUserId === ownerUserId)) {
      throw new Error("Bạn đã có tài khoản VBANK. Dùng .vbank edit để chỉnh sửa.");
    }
    if (list.some((item) => item.status === "active" && item.accountNumber === fields.accountNumber)) {
      throw new Error("Số tài khoản này đã được sử dụng.");
    }
    const now = Date.now();
    const record = {
      accountId: `STK-${now.toString(36)}-${randomUUID().slice(0, 6)}`,
      ownerUserId,
      accountName: fields.accountName,
      accountNumber: fields.accountNumber,
      bankId: fields.bankId,
      phoneNumber: fields.phoneNumber,
      logoPath: fields.logoPath || null,
      createdAt: now,
      updatedAt: now,
      status: "active",
    };
    list.push(record);
    writeJson(ACCOUNTS_PATH, list);
    return record;
  });
}

async function updateAccountRecord(ownerUserId, patch) {
  return withAccountsLock(() => {
    const list = loadAccounts();
    const index = list.findIndex((item) => item.status === "active" && item.ownerUserId === ownerUserId);
    if (index === -1) throw new Error("Không tìm thấy tài khoản VBANK của bạn.");
    if (patch.accountNumber && list.some((item, i) => i !== index && item.status === "active" && item.accountNumber === patch.accountNumber)) {
      throw new Error("Số tài khoản này đã được sử dụng.");
    }
    list[index] = { ...list[index], ...patch, updatedAt: Date.now() };
    writeJson(ACCOUNTS_PATH, list);
    return list[index];
  });
}

// ---------- output helpers ----------

const text = (msg, card) => ({ type: "text", text: msg, card: { ...autoCard(msg), ...(card || {}) } });
const money = (value) => Number(value || 0).toLocaleString("vi-VN");
const groupAcc = (n) => String(n ?? "").replace(/(\d{4})(?=\d)/g, "$1 ");

// ---------- mọi tin nhắn chữ của VBANK đều được vẽ thành thẻ ảnh (có chữ dự phòng) ----------
const CREATE_LABELS = ["Tên", "Số TK", "Ngân hàng", "SĐT", "Logo"];
const createStep = (index) => ({ index, labels: CREATE_LABELS });

const LEAD_KIND = [
  [/^❌/, "err"], [/^⚠/, "warn"], [/^ℹ/, "info"], [/^✅/, "ok"], [/^⌛/, "wait"],
  [/^🔢/, "ask", "SỐ TÀI KHOẢN", "hash"], [/^📞/, "ask", "SỐ ĐIỆN THOẠI", "phone"], [/^🏦/, "ask", "CHỌN NGÂN HÀNG", "bank"],
  [/^👤/, "ask", "TÊN TÀI KHOẢN", "user"], [/^🖼/, "ask", "LOGO NGÂN HÀNG", "image"], [/^📷/, "ask", "GỬI ẢNH QR", "qr"],
  [/^💰/, "ask", "SỐ TIỀN CHUYỂN", "coin"], [/^⏭/, "info"], [/^✍/, "ask"],
];
const LEAD_RE = /^[^\p{L}\p{N}\s"'(.\[]+\s*/u;

/** Phân tích chữ thành thẻ: loại, tiêu đề, nội dung, các lệnh gợi ý (chip) và lời nhắc. */
function autoCard(msg) {
  const raw = String(msg ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !/^[━─=\-]{3,}$/.test(l));
  const first = raw[0] || "";
  let kind = "info", title = null, icon = null;
  for (const [re, k, t, g] of LEAD_KIND) if (re.test(first)) { kind = k; title = t || null; icon = g || null; break; }
  const chips = []; let hint = null; const lines = [];
  for (let line of raw) {
    line = line.replace(LEAD_RE, "").trim();
    if (/^Gõ huy để hủy\.?$/i.test(line)) { hint = "Gõ huy bất cứ lúc nào để hủy thao tác."; if (!chips.some((c) => c.k === "huy")) chips.push({ k: "huy", d: "hủy thao tác" }); continue; }
    for (const m of line.matchAll(/(?:hoặc\s+)?[gG]õ\s+(ngaunhien|boqua|xacnhan|huy)\s+để\s+([^.\n(,]+?)(?=\s+hoặc\b|[.\n(,)]|$)/g)) {
      if (!chips.some((c) => c.k === m[1])) chips.push({ k: m[1], d: m[2].trim() });
      line = line.replace(m[0], "");
    }
    line = line.replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").replace(/[,\s]+$/, "").trim();
    if (line && line !== ".") lines.push(line);
  }
  if (kind === "info") {
    const all = lines.join(" ");
    if (/^Đã hủy|^Đã hủy/i.test(lines[0] || "") || /Đã hủy (thao tác|chỉnh sửa)/.test(all)) { kind = "cancel"; }
    else if (/^Cú pháp/i.test(lines[0] || "")) { title = "CÚ PHÁP LỆNH"; icon = "list"; }
    else if (/chưa có tài khoản/i.test(all)) { kind = "warn"; title = "CHƯA CÓ TÀI KHOẢN VBANK"; icon = "bank"; }
    else if (/đã có tài khoản/i.test(all)) { kind = "warn"; title = "BẠN ĐÃ CÓ TÀI KHOẢN"; icon = "bank"; }
    else if (/tạm tắt/i.test(all)) { kind = "warn"; title = "VBANK ĐANG TẠM TẮT"; icon = "clock"; }
    else if (/không|lỗi|phải|chỉ được|đã có người|hết hạn|không đủ|hợp lệ|chưa/i.test(all)) kind = "err";
    else if (/Giao dịch thành công/i.test(all)) { kind = "ok"; title = "GIAO DỊCH THÀNH CÔNG"; }
    else if (/^Gõ \w+/.test(all)) kind = "warn";
  }
  if (kind === "err" && /không có thao tác|không tìm thấy|không khớp|không hợp lệ/i.test(lines.join(" "))) title = title || "KHÔNG HỢP LỆ";
  if (kind === "err" && /không thể (chuyển|hoàn tất)|lỗi/i.test(lines.join(" "))) title = title || "KHÔNG THỂ THỰC HIỆN";
  return { kind, title, icon, lines, chips, hint };
}

function bankMenuOutput(extra = {}) {
  const banks = loadConfig().banks || [];
  return {
    type: "text",
    text: `🏦 Chọn ngân hàng — nhập số thứ tự hoặc mã:\n${bankListText()}\n${CANCEL_HINT}`,
    card: {
      menu: {
        title: extra.title || "CHỌN NGÂN HÀNG", glyph: "bank", columns: 2,
        subtitle: "Nhập số thứ tự hoặc mã ngân hàng bên dưới",
        items: banks.map((b, i) => ({ badge: "emblem", bankName: b.name, label: `${i + 1}. ${b.name}`, right: b.id })),
        hint: "Gõ huy bất cứ lúc nào để hủy thao tác.",
      },
      step: extra.step,
    },
  };
}

const HELP_ITEMS = [
  ["wallet", "Tạo tài khoản", ".vbank tao <tên tài khoản>"],
  ["user", "Xem tài khoản", ".vbank xem"],
  ["edit", "Chỉnh sửa tài khoản", ".vbank edit"],
  ["send", "Chuyển tiền (tag)", ".vbank bank <số tiền> @người nhận"],
  ["hash", "Chuyển theo số tài khoản", ".vbank bank <số tiền> <số tài khoản>"],
  ["list", "Lịch sử giao dịch", ".vbank lichsu [trang]"],
  ["qr", "Mã QR nhận tiền", ".vbank qr"],
  ["image", "Chuyển bằng ảnh QR", ".vbank bankqr"],
  ["cross", "Hủy thao tác đang làm", ".vbank huy  (hoặc gõ huy)"],
];
const helpOutput = () => ({
  type: "text", text: HELP,
  card: { menu: { title: "NGÂN HÀNG ẢO VBANK", glyph: "bank", subtitle: "Danh sách lệnh — tiền game, không phải tiền thật",
    items: HELP_ITEMS.map(([badge, label, desc], i) => ({ badge, label, desc, color: ["#22C97E", "#33B4FF", "#B666FF", "#FF8A5C", "#22D3EE", "#8B5CFF", "#4F82FF", "#FF7AC6", "#FF5C7A"][i] })) } },
});
export const helpOutputs = () => [helpOutput()];

const EDIT_ITEMS = [
  ["user", "Đổi tên tài khoản", "Tên hiển thị trên thẻ"],
  ["hash", "Đổi số tài khoản", "8–13 chữ số hoặc ngẫu nhiên"],
  ["bank", "Đổi ngân hàng", "Chọn trong danh sách"],
  ["phone", "Đổi số điện thoại", "Gõ số hoặc gửi danh thiếp"],
  ["image", "Đổi logo", "Logo mặc định của ngân hàng"],
  ["wallet", "Xem thông tin hiện tại", "Hiện thẻ tài khoản"],
  ["cross", "Hủy chỉnh sửa", "Thoát không thay đổi"],
];
const editMenuOutput = () => ({
  type: "text", text: EDIT_MENU,
  card: { menu: { title: "QUẢN LÝ TÀI KHOẢN", glyph: "edit", subtitle: "Nhập số từ 1 đến 7 để chọn",
    items: EDIT_ITEMS.map(([g, label, desc], i) => ({ badge: String(i + 1), label, desc, color: ["#33B4FF", "#22D3EE", "#B666FF", "#22C97E", "#FF7AC6", "#FFC93D", "#FF5C7A"][i] })),
    hint: "Gõ huy bất cứ lúc nào để thoát." } },
});

/** Vẽ thẻ cho một output chữ; lỗi vẽ thì trả null để gửi chữ dự phòng. */
function cardBuffer(output) {
  try {
    const c = output.card;
    if (!c) return null;
    if (c.menu) return renderMenuCard({ ...c.menu, step: undefined });
    return renderNotice(c);
  } catch (err) {
    console.error("[STK] Lỗi vẽ thẻ thông báo:", err?.message);
    return null;
  }
}

function imageOutput(buffer, caption) {
  return { type: "image", buffer, caption };
}

function cardOutputOrText(render, fallbackText, caption) {
  try {
    return imageOutput(render(), caption);
  } catch (err) {
    console.error("[STK] Lỗi vẽ Canvas:", err?.message);
    return text(fallbackText);
  }
}

async function buildAccountCard(account, caption) {
  const bank = getBank(account.bankId);
  const balance = await TienGame.getBalance(account.ownerUserId);
  const fallback = [
    `${bank?.name || "Ngân hàng ảo"} — ${account.accountName}`,
    `Số tài khoản: ${maskAccountNumber(account.accountNumber)}`,
    `Số dư tiền game: ${Number(balance).toLocaleString("vi-VN")} GOLD`,
  ].join("\n");
  return cardOutputOrText(
    () =>
      renderAccountCard({
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        bankName: bank?.name || "Ngân hàng ảo",
        brandColor: bank?.brandColor || loadConfig().defaultBrandColor,
        phoneNumber: account.phoneNumber,
        balance,
        accountId: account.accountId,
      }),
    fallback,
    caption
  );
}

// ---------- .vbank tao ----------

async function startCreate({ args, senderId }) {
  const busy = busyNotice(senderId);
  if (busy) return busy;
  const accountName = args.slice(1).join(" ").trim();
  if (!accountName || accountName.length > 40) {
    return [text("Cú pháp: .vbank tao <tên tài khoản> (tối đa 40 ký tự).")];
  }
  if (findByOwner(senderId)) {
    return [text("Bạn đã có tài khoản VBANK. Dùng .vbank edit để chỉnh sửa.")];
  }
  sessions.set(String(senderId), {
    type: "create",
    step: "number",
    data: { accountName },
    expiresAt: Date.now() + loadConfig().conversationTtlMs,
  });
  return [
    text(
      `🔢 Bạn muốn đặt số tài khoản ngân hàng ảo là gì?\n` +
        `Nhập ${loadConfig().accountNumberMin}–${loadConfig().accountNumberMax} chữ số, hoặc gõ ngaunhien để hệ thống tạo ngẫu nhiên.\n${CANCEL_HINT}`,
      { step: createStep(2), title: "CHỌN SỐ TÀI KHOẢN", subtitle: `Tên tài khoản: ${accountName}` }
    ),
  ];
}

async function continueCreate(session, senderId, input, messageData) {
  if (session.step === "number") {
    let value;
    if (input.toLowerCase() === "ngaunhien") {
      value = generateAccountNumber(loadAccounts());
    } else {
      const checked = validateAccountNumber(input);
      if (checked.error) return [text(checked.error)];
      value = checked.value;
    }
    if (findByNumber(value)) return [text("Số tài khoản này đã có người dùng. Vui lòng chọn số khác.")];
    session.data.accountNumber = value;
    session.step = "bank";
    return [bankMenuOutput({ step: createStep(3) })];
  }

  if (session.step === "bank") {
    const bank = resolveBank(input);
    if (!bank) return [text("Không tìm thấy ngân hàng này. Nhập lại số thứ tự hoặc mã ngân hàng trong danh sách.")];
    session.data.bankId = bank.id;
    session.step = "phone";
    return [text("📞 Bạn muốn liên kết số điện thoại nào với tài khoản?\n• Gõ số (0912345678, +84 912 345 678, chữ số kiểu nào cũng được)\n• Hoặc gửi DANH THIẾP của người đó\n⏭️ Gõ boqua để bỏ qua bước này.\n" + CANCEL_HINT, { step: createStep(4), title: "LIÊN KẾT SỐ ĐIỆN THOẠI" })];
  }

  if (session.step === "phone") {
    let phone = null;
    if (isSkipInput(input)) {
      session.data.phoneNumber = null; // bỏ qua: không liên kết SĐT
    } else {
      phone = readPhone(input, messageData);
      if (!phone) return [text(phoneRetryText(messageData), { step: createStep(4), kind: "err", title: "SỐ ĐIỆN THOẠI CHƯA HỢP LỆ" })];
      session.data.phoneNumber = phone;
    }
    session.step = "logo";
    return [text(`${phone ? `✅ Đã nhận số điện thoại ${phone}.` : "⏭️ Đã bỏ qua số điện thoại."}\n🖼️ Logo: hiện chỉ dùng logo mặc định của ngân hàng. Gõ boqua để hoàn tất.\n` + CANCEL_HINT, { step: createStep(5), title: "LOGO NGÂN HÀNG" })];
  }

  if (session.step === "logo") {
    if (!isSkipInput(input)) return [text("Gõ boqua để tiếp tục.")];
    const bank = getBank(session.data.bankId);
    sessions.delete(String(senderId));
    const account = await createAccountRecord(String(senderId), {
      accountName: session.data.accountName,
      accountNumber: session.data.accountNumber,
      bankId: session.data.bankId,
      phoneNumber: session.data.phoneNumber,
      logoPath: bank?.logoPath || null,
    });
    return [await buildAccountCard(account, "✅ Tạo tài khoản VBANK thành công.")];
  }

  return [text("Phiên không hợp lệ, vui lòng thử lại.")];
}

// ---------- .vbank edit ----------

const EDIT_FIELDS = {
  1: { field: "accountName", label: "👤 Nhập tên tài khoản mới:" },
  2: { field: "accountNumber", label: "🔢 Nhập số tài khoản mới:" },
  3: { field: "bankId", label: () => `🏦 Chọn ngân hàng mới (số thứ tự hoặc mã):\n${bankListText()}` },
  4: { field: "phoneNumber", label: "📞 Nhập số điện thoại mới (hoặc gửi danh thiếp):" },
  5: { field: "logoPath", label: "🖼️ Gõ boqua để dùng logo mặc định của ngân hàng." },
};

const EDIT_MENU = [
  "⚙️ QUẢN LÝ TÀI KHOẢN VBANK",
  "━━━━━━━━━━━━━━",
  "1️⃣ 👤 Đổi tên tài khoản",
  "2️⃣ 🔢 Đổi số tài khoản",
  "3️⃣ 🏦 Đổi ngân hàng",
  "4️⃣ 📞 Đổi số điện thoại",
  "5️⃣ 🖼️ Đổi logo",
  "6️⃣ 👁️ Xem thông tin hiện tại",
  "7️⃣ ❌ Hủy chỉnh sửa",
  "━━━━━━━━━━━━━━",
  "✍️ Nhập số từ 1 đến 7 để chọn (hoặc gõ huy để thoát).",
].join("\n");

async function startEdit({ args, senderId }) {
  if (isCancelInput(args[1])) return cancelSession({ senderId });
  const busy = busyNotice(senderId);
  if (busy) return busy;
  const account = findByOwner(senderId);
  if (!account) return [text("Bạn chưa có tài khoản VBANK. Dùng .vbank tao <tên tài khoản> để tạo.")];
  const typedName = args.slice(1).join(" ").trim();
  if (typedName && typedName.toLowerCase() !== account.accountName.toLowerCase()) {
    return [text("Tên tài khoản không khớp với tài khoản của bạn.")];
  }
  sessions.set(String(senderId), {
    type: "edit",
    step: "menu",
    data: {},
    expiresAt: Date.now() + loadConfig().conversationTtlMs,
  });
  return [editMenuOutput()];
}

async function continueEdit(session, senderId, input, messageData) {
  if (session.step === "menu") {
    const choice = Number(input);
    if (!Number.isInteger(choice) || choice < 1 || choice > 7) {
      return [text("⚠️ Vui lòng nhập số từ 1 đến 7 (hoặc gõ huy để thoát).")];
    }
    if (choice === 7) {
      sessions.delete(String(senderId));
      return [text("❌ Đã hủy chỉnh sửa.")];
    }
    if (choice === 6) {
      sessions.delete(String(senderId));
      return [await buildAccountCard(findByOwner(senderId), "👁️ Thông tin tài khoản hiện tại.")];
    }
    session.step = "value";
    session.data.choice = choice;
    const label = EDIT_FIELDS[choice].label;
    if (choice === 3) return [bankMenuOutput({ title: "ĐỔI NGÂN HÀNG" })];
    return [text(`${typeof label === "function" ? label() : label}\n${CANCEL_HINT}`, { title: ["", "TÊN TÀI KHOẢN MỚI", "SỐ TÀI KHOẢN MỚI", "", "SỐ ĐIỆN THOẠI MỚI", "LOGO NGÂN HÀNG"][choice] || undefined })];
  }

  if (session.step === "value") {
    const { field } = EDIT_FIELDS[session.data.choice];
    let patch;
    if (field === "accountName") {
      const name = input.trim();
      if (!name || name.length > 40) return [text("Tên tài khoản phải từ 1 đến 40 ký tự.")];
      patch = { accountName: name };
    } else if (field === "accountNumber") {
      const checked = validateAccountNumber(input);
      if (checked.error) return [text(checked.error)];
      patch = { accountNumber: checked.value };
    } else if (field === "bankId") {
      const bank = resolveBank(input);
      if (!bank) return [text("Không tìm thấy ngân hàng này. Nhập lại số thứ tự hoặc mã ngân hàng.")];
      patch = { bankId: bank.id };
    } else if (field === "phoneNumber") {
      if (isSkipInput(input)) { sessions.delete(String(senderId)); return [await buildAccountCard(findByOwner(senderId), "⏭️ Giữ nguyên số điện thoại hiện tại.")]; }
      const phone = readPhone(input, messageData);
      if (!phone) return [text(phoneRetryText(messageData, true).replace(CANCEL_HINT, "⏭️ Gõ boqua để giữ nguyên.\n" + CANCEL_HINT))];
      patch = { phoneNumber: phone };
    } else {
      if (!isSkipInput(input)) return [text("Gõ boqua để dùng logo mặc định.")];
      patch = { logoPath: null };
    }

    sessions.delete(String(senderId));
    const updated = await updateAccountRecord(String(senderId), patch);
    return [await buildAccountCard(updated, "✅ Cập nhật tài khoản VBANK thành công.")];
  }

  return [text("Phiên không hợp lệ, vui lòng thử lại.")];
}

// ---------- .vbank xem ----------

async function handleView({ senderId }) {
  const account = findByOwner(senderId);
  if (!account) return [text("⚠️ Bạn chưa có tài khoản VBANK. Dùng .vbank tao <tên tài khoản> để tạo.")];
  const bank = getBank(account.bankId);
  const balance = await TienGame.getBalance(account.ownerUserId);
  const info = [
    "🏦 THÔNG TIN NGÂN HÀNG CỦA BẠN",
    "━━━━━━━━━━━━━━",
    `👤 Chủ tài khoản: ${account.accountName}`,
    `🔢 Số tài khoản: ${maskAccountNumber(account.accountNumber)}`,
    `🏛️ Ngân hàng: ${bank?.name || "Ngân hàng ảo"}`,
    `📞 SĐT liên kết: ${maskPhone(account.phoneNumber)}`,
    `💰 Số dư: ${money(balance)} GOLD`,
    `🕒 Ngày tạo: ${formatTime(account.createdAt)}`,
    `✅ Trạng thái: ${account.status === "active" ? "Đang hoạt động" : account.status}`,
  ].join("\n");
  return [await buildAccountCard(account, info)];
}

// ---------- .vbank bank ----------

async function transferMoney({ args, senderId, mention, msgId }) {
  const config = loadConfig();
  if (args.length < 2) return [text("Cú pháp: .vbank bank <số tiền> @người nhận hoặc .vbank bank <số tiền> <số tài khoản>")];

  const from = findByOwner(senderId);
  if (!from) return [text("Bạn cần có tài khoản VBANK trước. Dùng .vbank tao <tên tài khoản>.")];

  const parsed = parseAmount(args[1], Number(config.maxTransfer));
  if (parsed.error) return [text(parsed.error)];

  let to = null;
  if (mention?.uid) {
    to = findByOwner(String(mention.uid));
    if (!to) return [text("Người nhận chưa có tài khoản VBANK.")];
  } else if (args[2]) {
    to = findByNumber(String(args[2]));
    if (!to) return [text("Không tìm thấy tài khoản VBANK với số này.")];
  } else {
    return [text("Hãy tag người nhận hoặc nhập số tài khoản người nhận.")];
  }

  if (to.ownerUserId === from.ownerUserId) return [text("Không thể chuyển tiền cho chính mình.")];

  const referenceId = msgId ? `STKBANK-${msgId}` : `STKBANK-${randomUUID()}`;
  let result;
  try {
    result = await TienGame.transfer(from.ownerUserId, to.ownerUserId, parsed.value, {
      referenceId,
      description: `STK ${from.accountNumber} → ${to.accountNumber}`,
    });
  } catch (err) {
    if (err.code === "DUPLICATE_REFERENCE") return [text("Giao dịch này đã được xử lý trước đó.")];
    return [text(`Không thể chuyển tiền: ${err.message}`)];
  }

  // Giao dịch đã được ghi. Từ đây chỉ tạo bill; lỗi vẽ không được làm lại giao dịch.
  const bank = getBank(from.bankId);
  const fallback = [
    "Chuyển tiền thành công (GIAO DỊCH TIỀN GAME).",
    `Mã giao dịch: ${referenceId}`,
    `Số tiền: ${parsed.value.toLocaleString("vi-VN")} GOLD`,
    `Số dư sau giao dịch: ${result.senderBalance.toLocaleString("vi-VN")} GOLD`,
  ].join("\n");
  return [
    cardOutputOrText(
      () =>
        renderTransferBill({
          from: { name: from.accountName, accountNumber: from.accountNumber },
          to: { name: to.accountName, accountNumber: to.accountNumber },
          amount: parsed.value,
          referenceId,
          time: nowLabel(),
          senderBalanceAfter: result.senderBalance,
          bankName: bank?.name || "Ngân hàng ảo",
          brandColor: bank?.brandColor || config.defaultBrandColor,
        }),
      fallback,
      `Chuyển ${parsed.value.toLocaleString("vi-VN")} GOLD cho ${to.accountName}.`
    ),
  ];
}

// ---------- API công khai ----------

/**
 * Xử lý .vbank tao | .vbank edit | .vbank bank. Trả về danh sách output, không gửi trực tiếp.
 * ctx: { sub, args, senderId, mention, msgId }
 */
export async function handleStkCommand(ctx) {
  try {
    const config = loadConfig();
    if (config.enabled === false) return [text("Ngân hàng ảo đang tạm tắt.")];
    if (ctx.sub === "tao") return await startCreate(ctx);
    if (ctx.sub === "xem") return await handleView(ctx);
    if (ctx.sub === "huy") return await cancelSession(ctx);
    if (ctx.sub === "edit") return await startEdit(ctx);
    if (ctx.sub === "bank") return await transferMoney(ctx);
    if (ctx.sub === "lichsu") return await handleHistory(ctx);
    if (ctx.sub === "qr") return await handleQr(ctx);
    if (ctx.sub === "bankqr") return await startBankQr(ctx);
    return [helpOutput()];
  } catch (err) {
    console.error("[STK] Lỗi lệnh:", err?.message);
    return [text(`Không thể xử lý yêu cầu VBANK: ${err?.message || "lỗi không xác định"}`)];
  }
}

/**
 * Gửi danh sách output qua một "sender" do lệnh cung cấp:
 *   sender.text(msg) và sender.image(filePath, caption)
 */
export async function deliverOutputs(outputs, sender) {
  for (const output of outputs) {
    if (output.type === "text") {
      const buffer = cardBuffer(output);
      if (buffer) {
        const asImage = { type: "image", buffer, caption: "" };
        try {
          await sendImageOutput(asImage, sender, output.text);
          continue;
        } catch { /* gửi ảnh lỗi -> rơi xuống gửi chữ */ }
      }
      await sender.text(output.text);
      continue;
    }
    if (output.type === "image") {
      try {
        await sendImageOutput(output, sender, output.caption || "Đã xử lý xong.");
      } catch (err) {
        console.error("[STK] Lỗi gửi ảnh:", err?.message);
        await sender.text(output.caption || "Đã xử lý xong.");
      }
    }
  }
}

/** Ghi PNG tạm, gửi, rồi xoá. Ném lỗi nếu gửi thất bại để nơi gọi gửi chữ dự phòng. */
async function sendImageOutput(output, sender, _fallbackText) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const filePath = path.join(TEMP_DIR, `stk-${Date.now()}-${randomUUID().slice(0, 8)}.png`);
  fs.writeFileSync(filePath, output.buffer);
  try {
    await sender.image(filePath, output.caption);
  } finally {
    try { fs.unlinkSync(filePath); } catch { /* đã bị xóa */ }
  }
}



// ---------- v2: lịch sử, QR, chuyển bằng ảnh QR ----------

const PAGE_SIZE = 10;
const QR_TYPE = "TIENGAME_STK";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const TYPE_LABELS = {
  TRANSFER: ["Chuyển tiền", "Nhận tiền"],
  TRANSFER_QR: ["Chuyển tiền QR", "Nhận tiền QR"],
  DEPOSIT: ["Gửi tiết kiệm", "Gửi tiết kiệm"],
  INTEREST: ["Lãi tiết kiệm", "Lãi tiết kiệm"],
  ADMIN_CREDIT: ["Admin cộng tiền", "Admin cộng tiền"],
  GAME_WIN: ["Thắng trò chơi", "Thắng trò chơi"],
  GAME_LOSE: ["Thua trò chơi", "Thua trò chơi"],
  SERVICE_PAYMENT: ["Thanh toán dịch vụ", "Thanh toán dịch vụ"],
  SERVICE_REFUND: ["Hoàn tiền", "Hoàn tiền"],
};

function findById(accountId) {
  const id = String(accountId ?? "");
  return activeAccounts(loadAccounts()).find((item) => item.accountId === id) || null;
}

function nameOfOwner(userId) {
  return findByOwner(String(userId))?.accountName || "Người chơi";
}

function formatTime(ms) {
  return new Date(Number(ms) || Date.now()).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
}

// ----- lịch sử -----

function describeTx(tx) {
  const pair = TYPE_LABELS[tx.type] || [String(tx.type), String(tx.type)];
  const delta = Number(tx.afterBalance) - Number(tx.beforeBalance);
  const signed = Number.isFinite(delta) && delta !== 0 ? delta : Number(tx.amount || 0);
  return {
    label: signed < 0 ? pair[0] : pair[1],
    signed,
    counterparty: tx.counterpartyId ? nameOfOwner(tx.counterpartyId) : "",
    time: formatTime(tx.createdAt),
    ref: String(tx.referenceId || tx.id || ""),
    balanceAfter: Number(tx.afterBalance) || 0,
  };
}

async function handleHistory({ args, senderId }) {
  const account = findByOwner(senderId);
  if (!account) return [text("Bạn chưa có tài khoản VBANK. Dùng .vbank tao <tên tài khoản> để tạo.")];

  const pageArg = args[1] === undefined ? "1" : String(args[1]);
  if (!/^\d+$/.test(pageArg) || Number(pageArg) < 1) {
    return [text("Cú pháp: .vbank lichsu [số trang], ví dụ .vbank lichsu 2")];
  }

  const uid = String(senderId);
  const mine = getTransactions()
    .filter((tx) => String(tx.userId) === uid && tx.status === "success")
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const totalPages = Math.max(1, Math.ceil(mine.length / PAGE_SIZE));
  const page = Number(pageArg);
  if (page > totalPages) return [text(`Không có trang ${page}. Tổng số trang: ${totalPages}.`)];

  const items = mine.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(describeTx);
  const fallback = items.length
    ? items.map((i) => `${i.label}: ${i.signed > 0 ? "+" : ""}${money(i.signed)} (${i.time})`).join("\n")
    : "Chưa có giao dịch nào.";
  return [
    cardOutputOrText(
      () => renderHistoryCard({ accountName: account.accountName, page, totalPages, total: mine.length, items, bankName: getBank(account.bankId)?.name || "Ngân hàng ảo" }),
      fallback,
      `Lịch sử giao dịch — trang ${page}/${totalPages}`
    ),
  ];
}

// ----- QR -----

function buildQrPayload(account) {
  return JSON.stringify({
    type: QR_TYPE,
    version: 1,
    accountId: account.accountId,
    accountNumber: account.accountNumber,
    bankId: account.bankId,
  });
}

export function parseQrPayload(raw) {
  let data;
  try {
    data = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (!data || data.type !== QR_TYPE || data.version !== 1) return null;
  if (typeof data.accountId !== "string" || typeof data.accountNumber !== "string" || typeof data.bankId !== "string") {
    return null;
  }
  return data;
}

async function handleQr({ senderId }) {
  const account = findByOwner(senderId);
  if (!account) return [text("Bạn chưa có tài khoản VBANK. Dùng .vbank tao <tên tài khoản> để tạo.")];

  const payload = buildQrPayload(account);
  const bankName = getBank(account.bankId)?.name || "Ngân hàng ảo";
  const fallback = `QR chuyển tiền: ${account.accountName} • ${bankName} • ${maskAccountNumber(account.accountNumber)}`;
  try {
    const qrBuffer = await QRCode.toBuffer(payload, { errorCorrectionLevel: "M", margin: 4, width: 480 });
    const buffer = await renderQrCard({
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      bankName,
      brandColor: getBank(account.bankId)?.brandColor || loadConfig().defaultBrandColor,
      qrBuffer,
    });
    return [imageOutput(buffer, "Mã QR chuyển tiền VBANK của bạn.")];
  } catch (err) {
    console.error("[STK] Lỗi tạo QR:", err?.message);
    return [text(fallback)];
  }
}

// ----- bankqr: chuyển tiền bằng ảnh QR -----

export function extractImageUrl(messageData) {
  let parsed = messageData?.content;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  return parsed.href || parsed.url || parsed.hdUrl || null;
}

async function downloadImage(url) {
  if (!/^https:\/\//i.test(String(url))) throw new Error("Đường dẫn ảnh không hợp lệ.");
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    maxContentLength: MAX_IMAGE_BYTES,
    maxBodyLength: MAX_IMAGE_BYTES,
  });
  const contentType = String(res.headers?.["content-type"] || "");
  if (contentType && !contentType.startsWith("image/")) throw new Error("Tệp gửi lên không phải ảnh.");
  return Buffer.from(res.data);
}

// Giải mã QR và xác minh với dữ liệu trên server. Không tin tên hay số trong ảnh.
export async function resolveReceiverFromQrBuffer(buffer, senderId) {
  const decoded = await decodeQrFromImage(buffer);
  if (!decoded) return { error: "Không đọc được QR trong ảnh. Vui lòng gửi ảnh rõ hơn." };
  const parsed = parseQrPayload(decoded);
  if (!parsed) return { error: "QR này không thuộc hệ thống VBANK." };
  const receiver = findById(parsed.accountId);
  if (!receiver || receiver.accountNumber !== parsed.accountNumber || receiver.bankId !== parsed.bankId) {
    return { error: "QR này không còn hợp lệ (tài khoản đã thay đổi hoặc bị khóa)." };
  }
  if (receiver.ownerUserId === String(senderId)) return { error: "Không thể chuyển tiền cho chính mình." };
  return { receiver };
}

async function startBankQr({ args = [], senderId }) {
  if (isCancelInput(args[1])) return cancelSession({ senderId });
  const busy = busyNotice(senderId);
  if (busy) return busy;
  if (!findByOwner(senderId)) return [text("Bạn cần có tài khoản VBANK trước. Dùng .vbank tao <tên tài khoản>.")];
  sessions.set(String(senderId), {
    type: "bankqr",
    id: randomUUID(),
    step: "qr",
    data: {},
    expiresAt: Date.now() + loadConfig().conversationTtlMs,
  });
  return [text("📷 Vui lòng gửi ảnh QR tài khoản VBANK của người nhận để bắt đầu chuyển tiền. Bạn không cần reply tin nhắn.\n" + CANCEL_HINT)];
}

async function continueBankQr(session, senderId, input, imageUrl, imageBuffer) {
  if (session.step === "qr") {
    if (!imageUrl && !imageBuffer) return [text("Vui lòng gửi ảnh QR của người nhận (không cần reply).")];
    let buffer = imageBuffer;
    if (!buffer) {
      try {
        buffer = await downloadImage(imageUrl);
      } catch (err) {
        return [text(`Không tải được ảnh: ${err.message}`)];
      }
    }
    const resolved = await resolveReceiverFromQrBuffer(buffer, senderId);
    if (resolved.error) return [text(resolved.error)];
    session.data.receiverAccountId = resolved.receiver.accountId;
    session.step = "amount";
    const bankName = getBank(resolved.receiver.bankId)?.name || "Ngân hàng ảo";
    return [
      text(
        `✅ Đã nhận diện người nhận: ${resolved.receiver.accountName} • ${bankName} • ${maskAccountNumber(
          resolved.receiver.accountNumber
        )} • Trạng thái: đang hoạt động.\n💰 Bạn muốn chuyển bao nhiêu tiền game? (gõ huy để hủy)`,
        {
          kind: "ok", title: "ĐÃ NHẬN DIỆN NGƯỜI NHẬN", icon: "qr",
          lines: ["Bạn muốn chuyển bao nhiêu tiền game?", "Nhập số tiền, ví dụ 50000 hoặc 50k."],
          rows: [
            { l: "Người nhận", v: resolved.receiver.accountName, kind: "party" },
            { l: "Ngân hàng", v: bankName, kind: "bank" },
            { l: "Số tài khoản", v: groupAcc(maskAccountNumber(resolved.receiver.accountNumber)) },
            { l: "Trạng thái", v: "Đang hoạt động", kind: "status" },
          ],
          chips: [{ k: "huy", d: "hủy thao tác" }], bankName,
        }
      ),
    ];
  }

  if (session.step === "amount") {
    if (!input) return null;
    const parsed = parseAmount(input, Number(loadConfig().maxTransfer));
    if (parsed.error) return [text(parsed.error)];
    const balance = await TienGame.getBalance(senderId);
    if (parsed.value > balance) {
      return [text(`Số dư không đủ (hiện có ${money(balance)} GOLD). Nhập số tiền khác.`)];
    }
    session.data.amount = parsed.value;
    session.step = "confirm";
    const receiver = findById(session.data.receiverAccountId);
    return [
      text(
        `Xác nhận chuyển:\nNgười nhận: ${receiver?.accountName || "—"} (${maskAccountNumber(receiver?.accountNumber || "")})\n` +
          `Số tiền: ${money(parsed.value)} GOLD\nPhí: 0 GOLD\nSố dư dự kiến: ${money(balance - parsed.value)} GOLD\n` +
          "✅ Gõ xacnhan để chuyển hoặc huy để hủy.",
        {
          kind: "ask", title: "XÁC NHẬN CHUYỂN TIỀN", icon: "send", lines: [],
          rows: [
            { l: "Người nhận", v: receiver?.accountName || "—", kind: "party" },
            { l: "Số tài khoản", v: groupAcc(maskAccountNumber(receiver?.accountNumber || "")) },
            { l: "Số tiền", v: parsed.value, kind: "money" },
            { l: "Phí giao dịch", v: 0, kind: "money" },
            { l: "Số dư dự kiến", v: balance - parsed.value, kind: "money" },
          ],
          chips: [{ k: "xacnhan", d: "xác nhận chuyển" }, { k: "huy", d: "hủy giao dịch" }],
          bankName: getBank(receiver?.bankId)?.name || "",
        }
      ),
    ];
  }

  if (session.step === "confirm") {
    if (input.toLowerCase() !== "xacnhan") return [text("Gõ xacnhan để chuyển hoặc huy để hủy.")];

    // Xóa phiên trước khi chuyển: lần xác nhận lặp sẽ không tìm thấy phiên nên không chuyển lại.
    sessions.delete(String(senderId));
    const sender = findByOwner(senderId);
    const receiver = findById(session.data.receiverAccountId);
    if (!sender || !receiver) return [text("Không thể hoàn tất: tài khoản đã thay đổi. Giao dịch đã bị hủy.")];

    const amount = session.data.amount;
    let result;
    try {
      result = await TienGame.transfer(sender.ownerUserId, receiver.ownerUserId, amount, {
        referenceId: `STKQR-${session.id}`,
        type: "TRANSFER_QR",
        description: `QR ${sender.accountNumber} → ${receiver.accountNumber}`,
      });
    } catch (err) {
      return [text(`Không thể chuyển tiền: ${err.message}`)];
    }

    const referenceId = `STKQR-${session.id}`;
    const time = formatTime(Date.now());
    const senderBank = getBank(sender.bankId);
    const receiverBank = getBank(receiver.bankId);
    const senderBill = cardOutputOrText(
      () =>
        renderTransferBill({
          from: { name: sender.accountName, accountNumber: sender.accountNumber },
          to: { name: receiver.accountName, accountNumber: receiver.accountNumber },
          amount,
          referenceId,
          time,
          senderBalanceAfter: result.senderBalance,
          bankName: senderBank?.name || "Ngân hàng ảo",
          brandColor: senderBank?.brandColor || loadConfig().defaultBrandColor,
        }),
      `Đã chuyển ${money(amount)} GOLD cho ${receiver.accountName}. Số dư: ${money(result.senderBalance)} GOLD. Mã: ${referenceId}`,
      `Đã chuyển ${money(amount)} GOLD cho ${receiver.accountName}.`
    );
    const receiverBill = cardOutputOrText(
      () =>
        renderReceiveBill({
          receiverName: receiver.accountName,
          receiverAccountNumber: receiver.accountNumber,
          senderName: sender.accountName,
          amount,
          referenceId,
          time,
          balanceAfter: result.recipientBalance,
          bankName: receiverBank?.name || "Ngân hàng ảo",
          brandColor: receiverBank?.brandColor || loadConfig().defaultBrandColor,
        }),
      `Bạn nhận ${money(amount)} GOLD từ ${sender.accountName}. Số dư: ${money(result.recipientBalance)} GOLD.`,
      `Nhận ${money(amount)} GOLD từ ${sender.accountName}.`
    );

    return [
      senderBill,
      receiverBill,
      text("Giao dịch thành công. Bill người nhận được gửi trong cuộc trò chuyện này; người nhận có thể xem bằng .vbank lichsu.", { kind: "ok", title: "GIAO DỊCH THÀNH CÔNG", lines: ["Bill người nhận đã được gửi trong cuộc trò chuyện này.", "Người nhận có thể xem lại bằng .vbank lichsu."] }),
    ];
  }

  return null;
}

/**
 * Xử lý mọi tin nhắn của người dùng đang có phiên STK (tao, edit, bankqr).
 * Trả về null nếu không có phiên nào, để bot xử lý như bình thường.
 * imageUrl / imageBuffer: ảnh đính kèm (dùng cho bước gửi QR).
 */
export async function handleStkInput({ senderId, text: rawText = "", imageUrl = null, imageBuffer = null, messageData = null }) {
  const key = String(senderId);
  const session = sessions.get(key);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(key);
    return [text("⌛ Phiên VBANK đã hết hạn. Vui lòng bắt đầu lại.")];
  }

  const input = String(rawText || "").trim();
  if (isCancelInput(input)) {
    sessions.delete(key);
    return [text(`❌ Đã hủy thao tác "${SESSION_NAMES[session.type] || "VBANK"}". Bạn có thể bắt đầu lại bất cứ lúc nào.`)];
  }
  if (!input && !imageUrl && !imageBuffer && !isContactCard(messageData)) return null;

  session.expiresAt = Date.now() + loadConfig().conversationTtlMs;
  try {
    if (session.type === "create") return await continueCreate(session, key, input, messageData);
    if (session.type === "edit") return await continueEdit(session, key, input, messageData);
    if (session.type === "bankqr") return await continueBankQr(session, key, input, imageUrl, imageBuffer);
  } catch (err) {
    console.error("[STK] Lỗi hội thoại:", err?.message);
    sessions.delete(key);
    return [text(`Không thể hoàn tất: ${err?.message || "lỗi không xác định"}. Vui lòng bắt đầu lại.`)];
  }
  sessions.delete(key);
  return null;
}

/** Giữ tương thích với code cũ chỉ dùng văn bản. */
export async function handleStkSession(senderId, rawText) {
  return handleStkInput({ senderId, text: rawText });
}

export { HELP as STK_HELP };
