import { resolveSenderRole } from "../../Handlers/HandleCommandRouter.js";
import jsQR from "jsqr";
import { createCanvas, loadImage } from "canvas";
import { renderAntiImage } from "../../Utils/HelpImageRenderer.js";
import { legacyReplyStore } from "../../Handlers/HandleLegacyBridge.js";

const SPAM_WINDOW_MS = 5_000;
const SPAM_THRESHOLD = 5;
const SPAM_WARN_LIMIT = 2;
const CLEANUP_INTERVAL_MS = 60_000;
const VIOLATION_RESET_MS = 24 * 60 * 60 * 1000;

const URL_REGEX = /\b((?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<>()]*)?)/g;
const ANTI_FEATURES = [
  { key: "spam", title: "AntiSpam", description: "Chặn gửi tin quá dồn dập." },
  { key: "link", title: "AntiLink", description: "Chỉ cho phép link trong allowlist." },
  { key: "tagall", title: "AntiTagAll", description: "Chặn nội dung tag toàn nhóm." },
  { key: "qr", title: "AntiQR", description: "Quét QR trong ảnh và chặn QR lạ." },
  { key: "repeat", title: "Tin nhắn lặp", description: "Phát hiện gửi lại cùng nội dung." },
  { key: "caps", title: "Chống viết hoa", description: "Chặn tin viết hoa bất thường." },
  { key: "long", title: "Giới hạn độ dài", description: "Chặn tin văn bản quá dài." },
  { key: "links", title: "Giới hạn số link", description: "Chặn nhiều link trong một tin." },
  { key: "shortlink", title: "Link rút gọn", description: "Chặn các dịch vụ rút gọn link." },
  { key: "iplink", title: "Link địa chỉ IP", description: "Chặn URL trỏ thẳng tới IP." },
  { key: "invite", title: "Link mời nhóm", description: "Chặn link mời nhóm Zalo." },
  { key: "social", title: "Link mạng xã hội", description: "Chặn link MXH theo chính sách nhóm." },
  { key: "mention", title: "Spam nhắc tên", description: "Giới hạn số người được nhắc." },
  { key: "emoji", title: "Spam emoji", description: "Chặn tin có quá nhiều emoji." },
  { key: "elongation", title: "Spam ký tự", description: "Chặn ký tự lặp kéo dài." },
  { key: "invis", title: "Ký tự ẩn", description: "Lọc ký tự điều khiển/ẩn đáng ngờ." },
  { key: "scam", title: "Cảnh báo lừa đảo", description: "Chặn cụm từ lừa đảo phổ biến." },
  { key: "phone", title: "Số điện thoại", description: "Chặn chia sẻ số điện thoại." },
  { key: "profanity", title: "Từ ngữ độc hại", description: "Lọc từ ngữ xúc phạm phổ biến." },
  { key: "keyword", title: "Từ cấm (Tucam)", description: "Danh sách từ/cụm từ do admin quản lý." },
  { key: "sticker", title: "Spam sticker", description: "Giới hạn sticker gửi liên tục." },
  { key: "photo", title: "Spam ảnh", description: "Giới hạn ảnh gửi liên tục." },
  { key: "video", title: "Spam video", description: "Giới hạn video gửi liên tục." },
  { key: "file", title: "Spam tệp", description: "Giới hạn tệp gửi liên tục." },
  { key: "voice", title: "Spam ghi âm", description: "Giới hạn tin nhắn thoại." },
  { key: "gif", title: "Spam GIF", description: "Giới hạn GIF gửi liên tục." },
  { key: "location", title: "Spam vị trí", description: "Chặn chia sẻ vị trí liên tục." },
  { key: "contact", title: "Spam danh thiếp", description: "Chặn chia sẻ danh thiếp liên tục." },
  { key: "ban", title: "Chặn tái gia nhập", description: "Tự kick UID đã bị cấm quay lại." },
  { key: "commands", title: "Spam lệnh bot", description: "Giới hạn gửi lệnh liên tục." },
  { key: "doodle", title: "Spam hình vẽ", description: "Giới hạn hình vẽ gửi liên tục." },
  { key: "reply", title: "Spam trả lời", description: "Giới hạn tin nhắn reply liên tục." },
  { key: "idnlink", title: "Link ký tự giả", description: "Chặn domain Unicode dễ giả mạo." },
  { key: "joinreq", title: "Báo yêu cầu vào nhóm", description: "Thông báo khi có yêu cầu tham gia." },
  { key: "adminlog", title: "Theo dõi quản trị", description: "Thông báo khi quyền/cài đặt nhóm đổi." },
];

function parseBulkFeatureActions(input) {
  const tokens = (Array.isArray(input) ? input.join(" ") : String(input || ""))
    .split(/[\s,;]+/)
    .map((token) => normalizeText(token.trim()))
    .filter(Boolean);
  if (!tokens.length || (tokens[0] !== "all" && !/^\d+$/.test(tokens[0]))) return null;
  if (/^\d+$/.test(tokens[0]) && tokens.length === 1) return null;

  const toEnabled = (action) => {
    if (["bat", "on", "enable"].includes(action)) return true;
    if (["tat", "off", "disable"].includes(action)) return false;
    return null;
  };

  if (tokens[0] === "all") {
    const enabled = tokens.length === 2 ? toEnabled(tokens[1]) : null;
    if (enabled === null) return { error: "Cú pháp: all bật | all tắt" };
    return { actions: ANTI_FEATURES.map((feature) => ({ feature, enabled })) };
  }

  if (tokens.length % 2 !== 0) {
    return { error: "Mỗi mục cần đủ cặp số + bật/tắt. Ví dụ: 1 bật 2 tắt" };
  }

  const actions = [];
  const seen = new Set();
  for (let index = 0; index < tokens.length; index += 2) {
    const number = Number(tokens[index]);
    const enabled = toEnabled(tokens[index + 1]);
    if (!Number.isInteger(number) || number < 1 || number > ANTI_FEATURES.length || enabled === null) {
      return { error: `Số mục từ 1-${ANTI_FEATURES.length}; trạng thái dùng bật hoặc tắt.` };
    }
    if (seen.has(number)) return { error: `Mục ${number} bị lặp trong cùng yêu cầu.` };
    seen.add(number);
    actions.push({ feature: ANTI_FEATURES[number - 1], enabled });
  }
  return { actions };
}

function collectMessageIds(value, depth = 0, ids = new Set()) {
  if (!value || typeof value !== "object" || depth > 5) return ids;
  if (Array.isArray(value)) {
    for (const item of value) collectMessageIds(item, depth + 1, ids);
    return ids;
  }
  for (const key of ["msgId", "cliMsgId", "globalMsgId", "realMsgId"]) {
    if (value[key] != null && value[key] !== "") ids.add(String(value[key]));
  }
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") collectMessageIds(nested, depth + 1, ids);
  }
  return ids;
}

function registerAntiReply(sent, { author, prefix, adapter, config, db }) {
  const messageIds = [...collectMessageIds(sent)];
  if (!messageIds.length) return;
  const replyData = {
    name: "anti",
    author,
    allowOtherUsers: true,
    prefix,
    messageId: messageIds[0],
    messageIds,
    adapter,
    config,
    db,
  };
  for (const messageId of messageIds) legacyReplyStore.set(messageId, replyData);
}

async function sendAntiDashboard({ adapter, threadId, threadType, prefix, author, config, db, caption }) {
  const imagePath = await renderAntiImage({
    botName: config.botName,
    prefix,
    settings: getGroupSettings(db, threadId),
    features: ANTI_FEATURES,
  });
  if (typeof adapter.raw?.sendMessage !== "function") {
    throw new Error("Anti dashboard image sender is unavailable.");
  }
  const sent = await adapter.raw.sendMessage(
    { msg: caption, attachments: imagePath },
    threadId,
    threadType,
  );
  registerAntiReply(sent, { author, prefix, adapter, config, db });
}

function applyBulkFeatureActions(db, threadId, actions) {
  for (const { feature, enabled } of actions) {
    setSetting(db, threadId, `anti:${feature.key}:enabled`, enabled ? "1" : "0");
  }
}

const spamWindows = new Map();
const ruleWindows = new Map();
const repeatedMessages = new Map();
let cleanupStarted = false;

function ensureCleanupTimer() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of spamWindows.entries()) {
      const kept = timestamps.filter((ts) => now - ts < SPAM_WINDOW_MS);
      if (kept.length === 0) spamWindows.delete(key);
      else spamWindows.set(key, kept);
    }
    for (const [key, timestamps] of ruleWindows.entries()) {
      const kept = timestamps.filter((ts) => now - ts < 15_000);
      if (kept.length === 0) ruleWindows.delete(key);
      else ruleWindows.set(key, kept);
    }
    for (const [key, value] of repeatedMessages.entries()) {
      if (now - value.lastAt > 15_000) repeatedMessages.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
}

function recordAndCheckSpam(threadId, senderId) {
  ensureCleanupTimer();
  const key = `${threadId}:${senderId}`;
  const now = Date.now();
  const timestamps = (spamWindows.get(key) || []).filter((ts) => now - ts < SPAM_WINDOW_MS);
  timestamps.push(now);
  spamWindows.set(key, timestamps);
  return timestamps.length >= SPAM_THRESHOLD;
}

function resetSpamViolation(threadId, senderId) {
  spamWindows.delete(`${threadId}:${senderId}`);
}

function extractDomains(text) {
  const matches = text.match(URL_REGEX) || [];
  const domains = [];
  for (const raw of matches) {
    try {
      const withScheme = raw.startsWith("http") ? raw : `http://${raw}`;
      const url = new URL(withScheme);
      domains.push(url.hostname.toLowerCase().replace(/^www\./, ""));
    } catch {
      // ignore
    }
  }
  return domains;
}

function isDomainAllowed(domain, globalAllowlist, groupAllowlist) {
  const globalList = Array.isArray(globalAllowlist) ? globalAllowlist : [];
  const groupList = Array.isArray(groupAllowlist) ? groupAllowlist : [];
  return (
    globalList.includes(domain) ||
    groupList.includes(domain) ||
    globalList.some((d) => domain.endsWith(`.${d}`)) ||
    groupList.some((d) => domain.endsWith(`.${d}`))
  );
}

const TAGALL_TEXT_REGEX = /@all\b|@moi\s*nguoi|@mọi\s*người/i;

function hasTagAllText(message) {
  const raw =
    (typeof message?.data?.content === "string" && message.data.content) ||
    (typeof message?.data?.content?.title === "string" && message.data.content.title) ||
    (typeof message?.data?.content?.text === "string" && message.data.content.text) ||
    "";
  if (TAGALL_TEXT_REGEX.test(raw)) return true;
  return (Array.isArray(message?.data?.mentions) ? message.data.mentions : []).some((mention) => {
    const uid = String(mention?.uid ?? mention?.userId ?? mention?.id ?? "").toLowerCase();
    const name = String(mention?.name ?? mention?.displayName ?? "").toLocaleLowerCase("vi-VN");
    return ["-1", "0", "all", "everyone"].includes(uid) || name.includes("mọi người");
  });
}

/**
 * Nhận diện tin nhắn có phải ảnh không, dựa theo cấu trúc thật của zca-mt
 * (đã xác nhận qua module AntiQR gốc của @GwenDev).
 */
function isImageMessage(data) {
  if (!data) return false;
  if (data.msgType === "chat.photo") return true;
  if (data.msgType === "chat.recommended" && data.content?.action === "photo.send") return true;
  if (
    data.msgType === "chat.photo.multi" ||
    (Array.isArray(data.content?.items) && data.content.items.length)
  ) {
    return true;
  }
  return false;
}

/**
 * Trích danh sách URL ảnh trong tin nhắn (chịu được cả tin nhắn nhiều ảnh).
 * Cấu trúc field (content.href/hdUrl/thumbUrl, content.items[]) đã được
 * xác nhận thật từ log, không còn đoán mò như trước.
 */
function extractImageUrls(message) {
  const data = message?.data;
  if (!data) return [];
  const urls = [];
  const single =
    data.content?.href ||
    data.content?.hdUrl ||
    data.content?.thumbUrl ||
    (typeof data.content === "string" ? data.content : null);
  if (single) urls.push(single);

  if (Array.isArray(data.content?.items)) {
    for (const item of data.content.items) {
      const u = item?.href || item?.hdUrl || item?.thumbUrl;
      if (u) urls.push(u);
    }
  }
  return urls.filter(Boolean);
}

/**
 * Tải ảnh về và decode QR bằng jsqr. Trả về nội dung QR (chuỗi) nếu có,
 * hoặc null nếu ảnh không chứa QR / lỗi khi tải.
 */
async function decodeQrFromUrl(url, logger) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const declaredSize = Number(res.headers.get("content-length") || 0);
      if (declaredSize > 10 * 1024 * 1024) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 10 * 1024 * 1024) return null;
    const img = await loadImage(buf);
    // Ảnh Zalo có thể rất lớn. Giữ cạnh tối đa 2000px giúp jsQR chạy ổn định
    // mà vẫn đủ chi tiết cho QR nhỏ trong ảnh.
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    return decoded?.data || null;
  } catch (err) {
    logger?.warn?.("[anti] Lỗi khi tải/giải mã ảnh QR:", { message: err?.message });
    return null;
  }
}

function getSetting(db, threadId, key, defaultValue) {
  const rows = db.query("SELECT value FROM settings WHERE thread_id = ? AND key = ?", [
    threadId,
    key,
  ]);
  return rows.length > 0 ? rows[0].value : defaultValue;
}

function setSetting(db, threadId, key, value) {
  db.query(
    `INSERT INTO settings (thread_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(thread_id, key) DO UPDATE SET value = excluded.value`,
    [threadId, key, value],
  );
}

function getGroupSettings(db, threadId) {
  const enabledRows = db.query(
    "SELECT key, value FROM settings WHERE thread_id = ? AND key LIKE 'anti:%:enabled'",
    [threadId],
  );
  const enabledValues = new Map(enabledRows.map(({ key, value }) => [key, value]));
  const features = Object.fromEntries(ANTI_FEATURES.map(({ key }) => [
    key,
    (enabledValues.get(`anti:${key}:enabled`) ?? (key === "ban" ? "1" : "0")) === "1",
  ]));
  return {
    ...Object.fromEntries(Object.entries(features).map(([key, enabled]) => [`${key}Enabled`, enabled])),
    features,
    linkAllowlist: getSetting(db, threadId, "anti:link:allowlist", "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    blockedKeywords: getSetting(db, threadId, "anti:keyword:list", "")
      .split("|")
      .map((word) => word.trim())
      .filter(Boolean),
  };
}

function isBanned(db, threadId, uid) {
  return getSetting(db, threadId, `anti:ban:${uid}`, "") === "1";
}

function banUser(db, threadId, uid) {
  setSetting(db, threadId, `anti:ban:${uid}`, "1");
}

function unbanUser(db, threadId, uid) {
  db.query("DELETE FROM settings WHERE thread_id = ? AND key = ?", [threadId, `anti:ban:${uid}`]);
}

function recordRuleRate(threadId, senderId, rule, windowMs, threshold) {
  ensureCleanupTimer();
  const key = `${threadId}:${senderId}:${rule}`;
  const now = Date.now();
  const timestamps = (ruleWindows.get(key) || []).filter((ts) => now - ts < windowMs);
  timestamps.push(now);
  ruleWindows.set(key, timestamps);
  return timestamps.length >= threshold;
}

function extractMessageText(message) {
  const content = message?.data?.content;
  if (typeof content === "string") return content;
  return String(content?.title ?? content?.text ?? content?.description ?? "");
}

function normalizeText(text) {
  return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLocaleLowerCase("vi-VN");
}

function getRepeatedMessageViolation(threadId, senderId, text) {
  const normalized = normalizeText(text).replace(/\s+/g, " ").trim();
  if (normalized.length < 8) return false;
  const key = `${threadId}:${senderId}:${normalized}`;
  const now = Date.now();
  const previous = repeatedMessages.get(key);
  const count = previous && now - previous.lastAt <= 10_000 ? previous.count + 1 : 1;
  repeatedMessages.set(key, { count, lastAt: now });
  return count >= 2;
}

function getMessageViolation({ message, text, settings, config }) {
  const data = message.data ?? {};
  const lower = normalizeText(text);
  const domains = extractDomains(text);
  const linkCount = domains.length;
  const upperLetters = (text.match(/\p{Lu}/gu) || []).length;
  const letters = (text.match(/\p{L}/gu) || []).length;
  const emojiCount = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
  const mentions = Array.isArray(data.mentions) ? data.mentions.length : 0;
  const msgType = String(data.msgType || "");
  const recommendedAction = String(data.content?.action || "").toLowerCase();
  const has = (key) => settings.features[key] === true;

  if (has("repeat") && text && getRepeatedMessageViolation(message.threadId, data.uidFrom, text)) {
    return ["repeat", "Phát hiện gửi lại cùng một nội dung liên tục."];
  }
  if (has("caps") && letters >= 12 && upperLetters / letters >= 0.75) {
    return ["caps", "Tin nhắn viết hoa quá nhiều."];
  }
  if (has("long") && text.length > 2000) {
    return ["long", "Tin nhắn vượt quá 2.000 ký tự."];
  }
  if (has("links") && linkCount > 3) {
    return ["links", "Một tin nhắn chứa quá nhiều đường dẫn."];
  }
  if (has("shortlink") && domains.some((domain) =>
    ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "shorturl.at"].some(
      (blocked) => domain === blocked || domain.endsWith(`.${blocked}`),
    )
  )) {
    return ["shortlink", "Đường dẫn rút gọn không được phép trong nhóm."];
  }
  if (has("idnlink") && domains.some((domain) => domain.split(".").some((label) => label.startsWith("xn--")))) {
    return ["idnlink", "Đường dẫn dùng ký tự Unicode dễ giả mạo tên miền."];
  }
  if (has("iplink") && /(?:https?:\/\/)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/|\b)/i.test(text)) {
    return ["iplink", "Đường dẫn dùng địa chỉ IP trực tiếp không được phép."];
  }
  if (has("invite") && /(?:zalo\.me\/g\/|zaloapp\.com\/qr\/p\/)/i.test(text)) {
    return ["invite", "Phát hiện link mời nhóm Zalo."];
  }
  if (has("social") && domains.some((domain) =>
    ["facebook.com", "fb.com", "fb.me", "tiktok.com", "t.me", "telegram.me", "instagram.com"].some(
      (blocked) => domain === blocked || domain.endsWith(`.${blocked}`),
    )
  )) {
    return ["social", "Link mạng xã hội ngoài không được phép."];
  }
  if (has("mention") && mentions > 5) {
    return ["mention", "Một tin nhắn nhắc tên quá nhiều thành viên."];
  }
  if (has("reply") && data.quote &&
      recordRuleRate(message.threadId, data.uidFrom, "reply", 10_000, 6)) {
    return ["reply", "Phát hiện trả lời tin nhắn liên tục."];
  }
  if (has("emoji") && emojiCount > 15) {
    return ["emoji", "Tin nhắn chứa quá nhiều emoji."];
  }
  if (has("elongation") && /([\p{L}\p{N}])\1{8,}/iu.test(text)) {
    return ["elongation", "Phát hiện ký tự lặp kéo dài."];
  }
  if (has("invis") && /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/u.test(text)) {
    return ["invis", "Tin nhắn chứa ký tự ẩn/điều khiển không được phép."];
  }
  if (has("scam") && /\b(?:chuyen tien nhan qua|bao trung thuong|xac minh tai khoan|nap phi nhan qua|nhan tien ngay)\b/u.test(lower)) {
    return ["scam", "Tin nhắn có dấu hiệu dụ chuyển tiền hoặc lừa đảo."];
  }
  if (has("phone") && /(?:\+?84|0)(?:3|5|7|8|9)\d{8}\b/u.test(text.replace(/[ .-]/g, ""))) {
    return ["phone", "Không chia sẻ số điện thoại trong nhóm này."];
  }
  if (has("profanity") && /\b(?:dit|du|deo|lon|cac|loz|dm|dcm|vcl)\b/u.test(lower)) {
    return ["profanity", "Tin nhắn có từ ngữ thô tục."];
  }
  if (has("keyword") && settings.blockedKeywords.some((word) => lower.includes(normalizeText(word)))) {
    return ["keyword", "Tin nhắn chứa từ khóa bị quản trị viên cấm."];
  }

  const mediaRules = [
    { key: "sticker", type: "chat.sticker", title: "gửi sticker", threshold: 5 },
    { key: "doodle", type: "chat.doodle", title: "gửi hình vẽ", threshold: 5 },
    { key: "photo", types: ["chat.photo", "chat.photo.multi"], title: "gửi ảnh", threshold: 5 },
    { key: "video", type: "chat.video.msg", title: "gửi video", threshold: 3 },
    { key: "file", type: "share.file", title: "gửi tệp", threshold: 4 },
    { key: "voice", type: "chat.voice", title: "gửi ghi âm", threshold: 4 },
    { key: "gif", type: "chat.gif", title: "gửi GIF", threshold: 5 },
    { key: "location", type: "chat.location.new", title: "chia sẻ vị trí", threshold: 3 },
  ];
  for (const rule of mediaRules) {
    const isPhotoRecommendation = rule.key === "photo" &&
      msgType === "chat.recommended" && recommendedAction === "photo.send";
    if (has(rule.key) && ((rule.types || [rule.type]).includes(msgType) || isPhotoRecommendation) &&
        recordRuleRate(message.threadId, data.uidFrom, rule.key, 10_000, rule.threshold)) {
      return [rule.key, `Phát hiện ${rule.title} liên tục.`];
    }
  }
  const isContactCard = msgType === "chat.recommended" &&
    (/contact|user[._-]?card|share\.contact|recommen/i.test(recommendedAction) &&
      !/link|photo/i.test(recommendedAction));
  if (has("contact") && isContactCard) {
    if (recordRuleRate(message.threadId, data.uidFrom, "contact", 10_000, 3)) {
      return ["contact", "Phát hiện chia sẻ danh thiếp liên tục."];
    }
  }
  const prefix = String(config?.botPrefix || ".");
  if (has("commands") && text.trim().startsWith(prefix) &&
      recordRuleRate(message.threadId, data.uidFrom, "commands", 10_000, 6)) {
    return ["commands", "Phát hiện gửi lệnh bot liên tục."];
  }
  return null;
}

async function warnSender({ adapter, message }, text) {
  await adapter.sendText({ threadId: message.threadId, threadType: "group", text });
}

function antiCaption(prefix) {
  return `🛡️ ANTI SECURITY CENTER\nPrefix: ${prefix}\nReply số 01-${String(ANTI_FEATURES.length).padStart(2, "0")} để xem hướng dẫn; reply "all bật" / "all tắt" hoặc "1 bật 2 tắt" để đổi trạng thái trực tiếp.\nTính năng mới mặc định TẮT. Vi phạm: xóa tin + cảnh báo, tái phạm lần 2 sẽ kick.`;
}

function antiFeatureText(choice, prefix) {
  if (choice === String(ANTI_FEATURES.length + 1)) return `📊 Trạng thái Anti\nDùng ${prefix}anti status để xem cấu hình bảo vệ hiện tại.`;
  const index = Number(choice);
  const feature = ANTI_FEATURES[index - 1];
  if (!feature) return null;
  const extra = feature.key === "link"
    ? `\nAllow domain: ${prefix}anti link allow <domain>\nGỡ domain: ${prefix}anti link remove <domain>`
    : feature.key === "keyword"
      ? `\nThêm từ: ${prefix}anti tucam add <từ/cụm từ>\nGỡ từ: ${prefix}anti tucam remove <từ/cụm từ>\nDanh sách: ${prefix}anti tucam list`
      : feature.key === "ban"
        ? `\nThêm UID: ${prefix}anti ban add <uid>\nGỡ UID: ${prefix}anti ban unban <uid>`
        : "";
  return `🛡️ ${feature.title}\n${feature.description}\nBật: reply "${index} bật"\nTắt: reply "${index} tắt"${extra}`;
}

async function handleAntiReply({ api, event, Reply }) {
  const choice = String(event?.data?.content || "").trim();
  const parsedActions = parseBulkFeatureActions(choice);
  if (parsedActions) {
    if (parsedActions.error) {
      await api.sendMessage(parsedActions.error, event.threadId, event.type);
      return;
    }
    const role = await resolveSenderRole(
      { adapter: Reply.adapter, isOwner: (uid) => String(uid) === String(Reply.config?.ownerZaloId) },
      event,
      event.data.uidFrom,
    );
    if (role < 1) {
      await api.sendMessage("🔐 Chỉ quản trị viên hoặc owner mới có thể bật/tắt tính năng Anti.", event.threadId, event.type);
      return;
    }
    applyBulkFeatureActions(Reply.db, event.threadId, parsedActions.actions);
    const enabled = parsedActions.actions[0].enabled;
    const summary = parsedActions.actions.length === ANTI_FEATURES.length
      ? `Đã ${enabled ? "BẬT" : "TẮT"} toàn bộ ${ANTI_FEATURES.length} tính năng Anti.`
      : `Đã cập nhật ${parsedActions.actions.length} tính năng:\n` +
        parsedActions.actions.map(({ feature, enabled: isEnabled }) =>
          `${isEnabled ? "✅ Bật" : "⏸ Tắt"} ${feature.title}`,
        ).join("\n");
    try {
      await sendAntiDashboard({
        adapter: Reply.adapter,
        threadId: event.threadId,
        threadType: event.type,
        prefix: Reply.prefix,
        author: event.data.uidFrom,
        config: Reply.config,
        db: Reply.db,
        caption: `🛡️ ${summary}`,
      });
    } catch (error) {
      await api.sendMessage(
        `🛡️ ${summary}\n⚠️ Không gửi được ảnh trạng thái Anti: ${error?.message || "lỗi không xác định"}`,
        event.threadId,
        event.type,
      );
    }
    return;
  }
  const text = antiFeatureText(choice, Reply.prefix);
  if (!text) {
    if (/^\d+$/.test(choice)) {
      await api.sendMessage(`Chọn số từ 1-${ANTI_FEATURES.length + 1}; sau đó reply "số bật" hoặc "số tắt" để đổi trạng thái.`, event.threadId, event.type);
    }
    return;
  }
  await api.sendMessage(text, event.threadId, event.type);
}

async function tryDeleteMessage({ adapter, logger }, message) {
  try {
    await adapter.deleteMessage(message);
    return true;
  } catch (err) {
    if (err?.code !== "FEATURE_UNAVAILABLE") {
      logger?.warn?.("[anti] Không thể xóa tin nhắn:", { message: err?.message });
    }
    return false;
  }
}

async function tryKickSender({ adapter, logger }, senderId, threadId) {
  try {
    await adapter.removeUsersFromGroup([senderId], threadId);
    return true;
  } catch (err) {
    if (err?.code !== "FEATURE_UNAVAILABLE") {
      logger?.warn?.("[anti] Không thể kick thành viên:", { message: err?.message });
    }
    return false;
  }
}

async function punishSpamViolation(ctx, senderId, threadId) {
  const violationCount = incrementStrike(ctx.db, threadId, senderId, "spam");

  if (violationCount < SPAM_WARN_LIMIT) {
    await warnSender(
      ctx,
      `⚠️ Bạn đang gửi tin nhắn quá nhanh. Đây là lần cảnh báo 1/${SPAM_WARN_LIMIT}; ` +
        `tái phạm sẽ bị kick khỏi nhóm.`,
    );
    return;
  }

  const kicked = await tryKickSender(ctx, senderId, threadId);
  resetSpamViolation(threadId, senderId);

  if (kicked) {
    clearStrike(ctx.db, threadId, senderId, "spam");
    await warnSender(ctx, `🚫 Đã kick thành viên vì tiếp tục spam sau ${SPAM_WARN_LIMIT} lần cảnh báo.`);
  } else {
    await warnSender(
      ctx,
      `⚠️ Thành viên tiếp tục spam sau ${SPAM_WARN_LIMIT} lần cảnh báo, ` +
        `nhưng bot không đủ quyền để tự kick. Vui lòng nhờ quản trị viên xử lý.`,
    );
  }
}

function incrementStrike(db, threadId, senderId, rule) {
  const key = `anti:strike:${senderId}:${rule}`;
  const [countText, timeText] = getSetting(db, threadId, key, "0:0").split(":");
  const previousCount = Date.now() - Number(timeText) <= VIOLATION_RESET_MS ? Number(countText) : 0;
  const count = previousCount + 1;
  setSetting(db, threadId, key, `${count}:${Date.now()}`);
  return count;
}

function clearStrike(db, threadId, senderId, rule) {
  db.query("DELETE FROM settings WHERE thread_id = ? AND key = ?", [
    threadId,
    `anti:strike:${senderId}:${rule}`,
  ]);
}

async function punishSevereViolation(ctx, senderId, threadId, reasonText, rule = "other") {
  const { logger } = ctx;
  const deleted = await tryDeleteMessage(ctx, ctx.message);
  const strikes = incrementStrike(ctx.db, threadId, senderId, rule);
  if (strikes < 2) {
    await warnSender(
      ctx,
      `⚠️ ${reasonText} Đã xóa tin nhắn vi phạm. Đây là cảnh báo 1/2; ` +
        `tái phạm cùng lỗi sẽ bị kick.`,
    );
    if (!deleted) logger?.warn?.("[anti] Không xóa được tin nhắn vi phạm (đã cảnh báo).");
    return;
  }

  const kicked = await tryKickSender(ctx, senderId, threadId);
  if (kicked) {
    clearStrike(ctx.db, threadId, senderId, rule);
    await warnSender(ctx, `🚫 ${reasonText} Thành viên tái phạm lần 2, đã bị kick khỏi nhóm.`);
  } else {
    await warnSender(ctx, `⚠️ ${reasonText} Thành viên tái phạm lần 2 nhưng bot không kick được. Kiểm tra quyền quản trị của bot.`);
  }
  if (!deleted) logger?.warn?.("[anti] Không xóa được tin nhắn vi phạm (đã kick/cảnh báo).");
}

export default {
  name: "anti",
  description: "Trung tâm quản lý 30 tính năng anti mới và các chức năng bảo vệ hiện có",
  version: "6.0.0",
  author: "HNNP V3",
  group: "moderation",
  role: 0,
  cooldown: 2,
  aliases: [],
  noPrefix: false,

  async run({ adapter, message, args, config, db }) {
    const threadId = message.threadId;
    const isGroup = message.type === 1;

    if (!isGroup) {
      await adapter.sendText({
        threadId,
        threadType: "user",
        text: "🛡️ Lệnh !anti chỉ có thể sử dụng trong nhóm.",
      });
      return;
    }

    const sub = (args[0] || "").toLowerCase();

    if (!sub) {
      try {
        const imagePath = await renderAntiImage({
          botName: config.botName,
          prefix: config.botPrefix,
          settings: getGroupSettings(db, threadId),
          features: ANTI_FEATURES,
        });
        const sent = await adapter.raw.sendMessage(
          { msg: antiCaption(config.botPrefix), attachments: imagePath },
          threadId,
          message.type,
        );
        registerAntiReply(sent, {
          author: message.data.uidFrom,
          prefix: config.botPrefix,
          adapter,
          config,
          db,
        });
      } catch {
        const features = getGroupSettings(db, threadId).features;
        const sent = await adapter.sendText({
          threadId,
          threadType: "group",
          text: `${antiCaption(config.botPrefix)}\n\n` +
            ANTI_FEATURES.map((feature, index) =>
              `${String(index + 1).padStart(2, "0")}. ${feature.title} [${features[feature.key] ? "ON" : "OFF"}] — reply "${index + 1} bật/tắt"`,
            ).join("\n") +
            `\n${ANTI_FEATURES.length + 1}. Trạng thái — ${config.botPrefix}anti status`,
        });
        registerAntiReply(sent, {
          author: message.data.uidFrom,
          prefix: config.botPrefix,
          adapter,
          config,
          db,
        });
      }
      return;
    }

    if (sub === "status") {
      const s = getGroupSettings(db, threadId);
      const featureLines = ANTI_FEATURES.map((feature, index) =>
        `${String(index + 1).padStart(2, "0")}. ${feature.title}: ${s.features[feature.key] ? "BẬT" : "TẮT"}`,
      );
      await adapter.sendText({
        threadId,
        threadType: "group",
        text:
          `🛡️ ANTI SECURITY CENTER — ${featureLines.filter((line) => line.endsWith("BẬT")).length}/${ANTI_FEATURES.length} đang bật\n` +
          `Phạt: xóa + cảnh báo; tái phạm lần 2 sẽ kick.\n` +
          `${featureLines.join("\n")}\n` +
          `• Allowlist domain nhóm: ${s.linkAllowlist.join(", ") || "(trống)"}\n` +
          `• Allowlist domain toàn cục: ${(config.antiLinkAllowlist || []).join(", ") || "(trống)"}\n` +
          `• Từ khóa cấm: ${s.blockedKeywords.join(", ") || "(trống)"}`,
      });
      return;
    }

    const senderRole = await resolveSenderRole(
      { adapter, isOwner: (uid) => uid === config.ownerZaloId },
      message,
      message.data.uidFrom,
    );

    if (senderRole < 1) {
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: "🔐 Bạn cần là quản trị viên nhóm đã xác minh hoặc owner để thay đổi cấu hình bảo vệ.",
      });
      return;
    }

    if (args[0] === "all" || /^\d+$/.test(args[0] || "")) {
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: `Hãy reply trực tiếp vào ảnh Anti bằng "all bật", "all tắt" hoặc "1 bật 2 tắt". Không cần dùng ${config.botPrefix}anti <số> on.`,
      });
      return;
    }

    const feature = ANTI_FEATURES.find((item) => item.key === (sub === "tucam" ? "keyword" : sub));
    if (feature && !["spam", "link", "tagall", "qr"].includes(feature.key)) {
      const action = (args[1] || "").toLowerCase();
      if (feature.key === "keyword" && ["add", "remove", "list"].includes(action)) {
        const words = getGroupSettings(db, threadId).blockedKeywords;
        const value = args.slice(2).join(" ").trim();
        if (action === "list") {
          await adapter.sendText({
            threadId,
            threadType: "group",
            text: `📝 Từ khóa cấm: ${words.join(", ") || "(trống)"}`,
          });
          return;
        }
        if (!value || value.length > 80 || value.includes("|")) {
          await adapter.sendText({
            threadId,
            threadType: "group",
            text: `Cú pháp: ${config.botPrefix}anti tucam ${action} <từ/cụm từ tối đa 80 ký tự, không dùng |>.`,
          });
          return;
        }
        const nextWords = action === "add"
          ? [...words.filter((word) => normalizeText(word) !== normalizeText(value)), value]
          : words.filter((word) => normalizeText(word) !== normalizeText(value));
        setSetting(db, threadId, "anti:keyword:list", nextWords.join("|"));
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: action === "add"
            ? `✅ Đã thêm từ khóa "${value}". Hãy bật bằng reply "${ANTI_FEATURES.findIndex((item) => item.key === "keyword") + 1} bật" vào ảnh Anti.`
            : `✅ Đã gỡ từ khóa "${value}" (nếu có).`,
        });
        return;
      }
      if (feature.key === "ban" && ["add", "unban"].includes(action)) {
        const uid = String(args[2] || "").trim();
        if (!uid) {
          await adapter.sendText({
            threadId,
            threadType: "group",
            text: `Cú pháp: ${config.botPrefix}anti ban add|unban <uid>`,
          });
          return;
        }
        if (action === "add") banUser(db, threadId, uid);
        else unbanUser(db, threadId, uid);
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: action === "add"
            ? `✅ Đã đưa UID ${uid} vào danh sách chặn tái gia nhập.`
            : `✅ Đã gỡ cấm UID ${uid} khỏi nhóm này.`,
        });
        return;
      }
      if (action === "on" || action === "off") {
        setSetting(db, threadId, `anti:${feature.key}:enabled`, action === "on" ? "1" : "0");
        const enabledNotice = ["joinreq", "adminlog"].includes(feature.key)
          ? "Bot chỉ gửi thông báo, không tự duyệt yêu cầu hoặc đổi quyền thành viên."
          : feature.key === "ban"
            ? ""
            : "Vi phạm sẽ bị xóa + cảnh báo; tái phạm lần 2 sẽ bị kick.";
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: `✅ Đã ${action === "on" ? "BẬT" : "TẮT"} ${feature.title}. ` +
            (action === "on" ? enabledNotice : ""),
        });
        return;
      }
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: feature.key === "keyword"
          ? `Cú pháp: ${config.botPrefix}anti tucam on|off|add|remove|list`
          : feature.key === "ban"
            ? `Cú pháp: ${config.botPrefix}anti ban on|off|add|unban <uid>`
            : `Cú pháp: ${config.botPrefix}anti ${feature.key} on|off`,
      });
      return;
    }

    switch (sub) {
      case "spam": {
        const action = (args[1] || "").toLowerCase();
        if (action === "on" || action === "off") {
          setSetting(db, threadId, "anti:spam:enabled", action === "on" ? "1" : "0");
          await adapter.sendText({
            threadId,
            threadType: "group",
            text:
              `✅ Đã ${action === "on" ? "BẬT" : "TẮT"} AntiSpam cho nhóm.` +
              (action === "on"
                    ? ` Ngưỡng: ${SPAM_THRESHOLD} tin/${SPAM_WINDOW_MS / 1000}s; cảnh báo lần đầu, tái phạm lần 2 sẽ kick.`
                    : ""),
          });
        } else {
          await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti spam on|off\nVí dụ: !anti spam on" });
        }
        break;
      }

      case "link": {
        const action = (args[1] || "").toLowerCase();
        if (action === "on" || action === "off") {
          setSetting(db, threadId, "anti:link:enabled", action === "on" ? "1" : "0");
          await adapter.sendText({
            threadId,
            threadType: "group",
            text:
              `✅ Đã ${action === "on" ? "BẬT" : "TẮT"} AntiLink cho nhóm.` +
              (action === "on"
                ? " Vi phạm lần đầu bị xóa + cảnh báo; tái phạm lần 2 sẽ kick."
                : ""),
          });
        } else if (action === "allow") {
          const domain = (args[2] || "").toLowerCase().trim();
          if (!domain) {
            await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti link allow <domain>\nVí dụ: !anti link allow example.com" });
            return;
          }
          const current = getGroupSettings(db, threadId).linkAllowlist;
          if (!current.includes(domain)) current.push(domain);
          setSetting(db, threadId, "anti:link:allowlist", current.join(","));
          await adapter.sendText({ threadId, threadType: "group", text: `Đã thêm "${domain}" vào allowlist của nhóm.` });
        } else if (action === "remove") {
          const domain = (args[2] || "").toLowerCase().trim();
          const current = getGroupSettings(db, threadId).linkAllowlist.filter((d) => d !== domain);
          setSetting(db, threadId, "anti:link:allowlist", current.join(","));
          await adapter.sendText({ threadId, threadType: "group", text: `Đã xóa "${domain}" khỏi allowlist của nhóm (nếu có).` });
        } else if (action === "unban") {
          const uid = (args[2] || "").trim();
          if (!uid) {
            await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti link unban <uid>" });
            return;
          }
          unbanUser(db, threadId, uid);
          await adapter.sendText({ threadId, threadType: "group", text: `Đã gỡ cấm cho UID ${uid} khỏi nhóm này.` });
        } else {
          await adapter.sendText({
            threadId,
            threadType: "group",
            text: "Cú pháp: !anti link on|off | allow <domain> | remove <domain> | unban <uid>",
          });
        }
        break;
      }

      case "tagall": {
        const action = (args[1] || "").toLowerCase();
        if (action === "on" || action === "off") {
          setSetting(db, threadId, "anti:tagall:enabled", action === "on" ? "1" : "0");
          await adapter.sendText({
            threadId,
            threadType: "group",
            text:
              `Đã ${action === "on" ? "BẬT" : "TẮT"} AntiTagAll cho nhóm này.` +
              (action === "on"
                ? ` Lần đầu xóa + cảnh báo; tái phạm lần 2 sẽ kick.`
                : ""),
          });
        } else if (action === "unban") {
          const uid = (args[2] || "").trim();
          if (!uid) {
            await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti tagall unban <uid>" });
            return;
          }
          unbanUser(db, threadId, uid);
          await adapter.sendText({ threadId, threadType: "group", text: `Đã gỡ cấm cho UID ${uid} khỏi nhóm này.` });
        } else {
          await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti tagall on|off | unban <uid>" });
        }
        break;
      }

      case "qr": {
        const action = (args[1] || "").toLowerCase();
        if (action === "on" || action === "off") {
          setSetting(db, threadId, "anti:qr:enabled", action === "on" ? "1" : "0");
          await adapter.sendText({
            threadId,
            threadType: "group",
            text:
              `Đã ${action === "on" ? "BẬT" : "TẮT"} AntiQR cho nhóm này.` +
              (action === "on"
                ? " Mọi ảnh có QR (kể cả VietQR/QR thanh toán) sẽ bị xử lý. " +
                  "Chỉ QR URL có toàn bộ domain trong allowlist AntiLink mới được miễn."
                : ""),
          });
        } else if (action === "unban") {
          const uid = (args[2] || "").trim();
          if (!uid) {
            await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti qr unban <uid>" });
            return;
          }
          unbanUser(db, threadId, uid);
          await adapter.sendText({ threadId, threadType: "group", text: `Đã gỡ cấm cho UID ${uid} khỏi nhóm này.` });
        } else {
          await adapter.sendText({ threadId, threadType: "group", text: "Cú pháp: !anti qr on|off | unban <uid>" });
        }
        break;
      }

      default:
        await adapter.sendText({
          threadId,
          threadType: "group",
          text:
            "Lệnh con không hợp lệ. Dùng: status, spam on|off, " +
            "link on|off, link allow, link remove, link unban, " +
            "tagall on|off, tagall unban, qr on|off, qr unban.",
        });
    }
  },

  __legacyOnReply: handleAntiReply,

  async onMessage({ adapter, message, config, db, logger }) {
    if (message.type !== 1) return;
    if (message.isSelf) return;

    const text = extractMessageText(message);
    const threadId = message.threadId;
    const senderId = message.data.uidFrom;
    const settings = getGroupSettings(db, threadId);

    if (!ANTI_FEATURES.some(({ key }) => key !== "ban" && settings.features[key])) {
      return;
    }

    const senderRole = await resolveSenderRole(
      { adapter, isOwner: (uid) => uid === config.ownerZaloId },
      message,
      senderId,
    );
    if (senderRole >= 1) return; // admin/phó nhóm/owner miễn trừ toàn bộ Anti

    const ctx = { adapter, message, logger, db };

    // --- AntiTagAll: hễ tin nhắn chứa @all / @mọi người là phạt ngay ---
    if (settings.tagallEnabled) {
      if (hasTagAllText(message)) {
        await punishSevereViolation(
          ctx,
          senderId,
          threadId,
          `Phát hiện tag toàn bộ nhóm (@all).`,
          "tagall",
        );
        return;
      }
    }

    // --- AntiQR: chặn mọi QR, chỉ miễn QR URL có toàn bộ domain trong allowlist ---
    if (settings.qrEnabled && isImageMessage(message.data)) {
      const imageUrls = extractImageUrls(message);

      for (const imageUrl of imageUrls) {
        const qrContent = await decodeQrFromUrl(imageUrl, logger);
        if (!qrContent) continue; // ảnh thường (không phải QR) thì bỏ qua

        const domains = extractDomains(qrContent);
        // VietQR/QR thanh toán thường là chuỗi EMV, không chứa URL. Bản cũ
        // yêu cầu domains.length > 0 nên loại QR này luôn lọt qua.
        const isAllowlistedUrlQr =
          domains.length > 0 &&
          domains.every((d) =>
            isDomainAllowed(d, config.antiLinkAllowlist, settings.linkAllowlist),
          );

        if (!isAllowlistedUrlQr) {
          await punishSevereViolation(
            ctx,
            senderId,
            threadId,
            domains.length > 0
              ? "Phát hiện mã QR chứa link không được phép."
              : "Phát hiện mã QR (bao gồm QR thanh toán/VietQR).",
            "qr",
          );
          return;
        }
      }
    }

    const violation = getMessageViolation({ message, text, settings, config });
    if (violation) {
      await punishSevereViolation(ctx, senderId, threadId, violation[1], violation[0]);
      return;
    }

    // --- AntiSpam ---
    if (settings.spamEnabled) {
      const isSpamming = recordAndCheckSpam(threadId, senderId);
      if (isSpamming) {
        await punishSpamViolation(ctx, senderId, threadId);
        return;
      }
    }

    // --- AntiLink ---
    if (settings.linkEnabled) {
      const domains = extractDomains(text);
      const hasDisallowedLink = domains.some(
        (d) => !isDomainAllowed(d, config.antiLinkAllowlist || [], settings.linkAllowlist),
      );
      if (hasDisallowedLink) {
        await punishSevereViolation(ctx, senderId, threadId, "Phát hiện link không được phép.", "link");
      }
    }
  },

  async onGroupEvent({ adapter, event, db, logger }) {
    const eventTypes = [
      event?.type,
      event?.eventType,
      event?.act,
      event?.data?.type,
      event?.data?.action,
    ].map((type) => String(type ?? "").toLowerCase().replace(/[\s-]+/g, "_"));
    const threadId = event?.threadId ?? event?.data?.groupId ?? event?.data?.group_id;
    if (!threadId) return;

    if (eventTypes.includes("join_request") &&
        getSetting(db, threadId, "anti:joinreq:enabled", "0") === "1") {
      const requested = event?.data?.uids ?? event?.data?.userIds;
      const count = (Array.isArray(requested) && requested.length) ||
        Number(event?.data?.totalPending) || 1;
      await adapter.sendText({
        threadId,
        threadType: "group",
        text: `📥 Nhóm đang có ${count} yêu cầu tham gia mới. Quản trị viên hãy xem xét trong phần quản lý thành viên.`,
      });
    }

    if (getSetting(db, threadId, "anti:adminlog:enabled", "0") === "1") {
      const changeLabels = {
        add_admin: "cấp quyền quản trị",
        remove_admin: "gỡ quyền quản trị",
        update_setting: "thay đổi cài đặt nhóm",
      };
      const changeType = eventTypes.find((type) => changeLabels[type]);
      if (changeType) {
        const actor = event?.data?.sourceId || event?.data?.creatorId;
        await adapter.sendText({
          threadId,
          threadType: "group",
          text: `🛡️ Nhật ký bảo vệ: ${actor ? `UID ${actor} ` : "Có quản trị viên "}đã ${changeLabels[changeType]}.`,
        });
      }
    }

    if (!eventTypes.includes("join") ||
        getSetting(db, threadId, "anti:ban:enabled", "1") !== "1") return;
    const members = event?.data?.updateMembers ?? event?.data?.members ?? event?.data?.uids ??
      event?.data?.userIds ?? event?.data?.uid;
    const uids = (Array.isArray(members) ? members : members ? [members] : [])
      .map((member) => String(member?.id ?? member?.uid ?? member?.userId ?? member ?? "").trim())
      .filter(Boolean);

    for (const uid of uids) {
      if (isBanned(db, threadId, uid)) {
        try {
          await adapter.removeUsersFromGroup([uid], threadId);
          logger?.info?.("[anti] Đã tự động kick lại UID bị cấm vĩnh viễn:", { uid, threadId });
        } catch (err) {
          if (err?.code !== "FEATURE_UNAVAILABLE") {
            logger?.warn?.("[anti] Không thể tự động kick lại UID bị cấm:", {
              uid,
              message: err?.message,
            });
          }
        }
      }
    }
  },
};
