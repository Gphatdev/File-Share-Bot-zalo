/**
 * Utils/ConsoleUI.js
 *
 * Giao diện console của HNNP STUDIO:
 *  - renderBanner(): logo chữ khối (figlet) tô gradient chéo neon + khung tagline.
 *  - renderBox():    khung thông tin bo tròn, viền gradient.
 *  - renderReady():  khung "đã sẵn sàng" màu xanh lá.
 *  - createChatConsole(): in từng tin nhắn nhận được ra console, mỗi nhóm một
 *    màu riêng, mỗi người gửi một màu riêng.
 *
 * Toàn bộ hàm render là hàm thuần (trả về mảng dòng) nên test được dễ dàng.
 * Nội dung tin nhắn luôn được làm sạch (bỏ ký tự điều khiển / ESC) trước khi
 * in để người lạ không thể chèn mã màu hay điều khiển terminal.
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";

const rgb = (c) => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;

// ── Bảng màu ────────────────────────────────────────────────────────────────
const NEON = [
  [34, 211, 238], // cyan
  [99, 102, 241], // indigo
  [168, 85, 247], // violet
  [236, 72, 153], // pink
];
const GREEN_STOPS = [
  [52, 211, 153],
  [74, 222, 128],
  [163, 230, 53],
];
const GRAY = [120, 130, 150];
const SOFT_WHITE = [226, 232, 240];

// 10 màu tươi, sắc độ khác hẳn nhau — dùng cho nhóm / người gửi.
const CHAT_PALETTE = [
  [255, 99, 99], // đỏ
  [251, 146, 60], // cam
  [250, 204, 21], // vàng
  [163, 230, 53], // chanh
  [74, 222, 128], // xanh lá
  [45, 212, 191], // ngọc
  [56, 189, 248], // xanh trời
  [129, 140, 248], // chàm
  [192, 132, 252], // tím
  [244, 114, 182], // hồng
];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function gradientAt(stops, t) {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

// ── Tiện ích chuỗi ──────────────────────────────────────────────────────────
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s) {
  return String(s).replace(ANSI_RE, "");
}

/** Độ rộng hiển thị (đếm theo ký tự; đủ chính xác cho tiếng Việt + ký tự khung). */
export function visibleLength(s) {
  return [...stripAnsi(s)].length;
}

function padRight(s, width) {
  return s + " ".repeat(Math.max(0, width - visibleLength(s)));
}

function truncate(s, max) {
  const chars = [...s];
  if (chars.length <= max) return s;
  return chars.slice(0, Math.max(0, max - 1)).join("") + "…";
}

/**
 * Làm sạch text do người dùng gửi: xuống dòng -> " ↵ ", bỏ ký tự điều khiển
 * (gồm ESC \x1b), ký tự ẩn / đảo chiều, gộp khoảng trắng.
 */
export function cleanText(input) {
  let s = String(input ?? "").normalize("NFC");
  // bỏ nguyên chuỗi điều khiển ANSI (ESC [ ... ) để không còn sót "[31m"
  // eslint-disable-next-line no-control-regex
  s = s.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "");
  s = s.replace(/\r\n|\r|\n/g, " ↵ ");
  s = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
  s = s.replace(/[​-‏‪-‮⁦-⁩﻿]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

function make(useColor) {
  const paint = (color, text, ...styles) =>
    useColor ? `${styles.join("")}${rgb(color)}${text}${RESET}` : text;
  const style = (code, text) => (useColor ? `${code}${text}${RESET}` : text);
  const gradientText = (text, stops, from = 0, to = 1, ...styles) => {
    if (!useColor) return text;
    const chars = [...text];
    let out = styles.join("");
    chars.forEach((ch, i) => {
      if (ch === " ") {
        out += ch;
        return;
      }
      const t = from + (to - from) * (chars.length <= 1 ? 0 : i / (chars.length - 1));
      out += rgb(gradientAt(stops, t)) + ch;
    });
    return out + RESET;
  };
  return { paint, style, gradientText };
}

export async function animateConsoleLines(
  lines,
  {
    enabled = Boolean(process.stdout.isTTY) && !("NO_COLOR" in process.env),
    write = (line) => process.stdout.write(`${line}\n`),
    delayMs = 24,
  } = {},
) {
  if (!enabled) {
    for (const line of lines) write(line);
    return;
  }

  for (const line of lines) {
    write(line);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// ── Banner ──────────────────────────────────────────────────────────────────
/**
 * @param {object} o
 * @param {string|null} o.logo      chuỗi figlet nhiều dòng (null -> banner gọn)
 * @param {string} o.title
 * @param {string} o.subtitle
 * @param {string} [o.version]
 * @param {string} [o.time]
 * @param {boolean} [o.useColor]
 * @param {number} [o.columns]      độ rộng terminal
 * @returns {string[]}
 */
export function renderBanner({
  logo = null,
  title = "HNNP STUDIO",
  subtitle = "ZALO BOT",
  version = "",
  time = "",
  useColor = true,
  columns = 100,
} = {}) {
  const { paint, gradientText } = make(useColor);
  const lines = [""];

  const logoLines = logo ? logo.replace(/\s+$/g, "").split("\n") : [];
  const logoWidth = Math.max(0, ...logoLines.map((l) => l.length));

  if (logoLines.length && logoWidth <= columns - 2) {
    const rows = logoLines.length;
    logoLines.forEach((line, row) => {
      let out = "  ";
      [...line].forEach((ch, col) => {
        if (ch === " ") {
          out += ch;
          return;
        }
        // gradient chéo: ngang là chính, dọc làm lệch nhẹ
        const t = (col / Math.max(1, logoWidth)) * 0.75 + (row / Math.max(1, rows)) * 0.25;
        out += useColor ? rgb(gradientAt(NEON, t)) + ch : ch;
      });
      lines.push(useColor ? out + RESET : out);
    });
  } else {
    const spaced = [...title.toUpperCase()].join(" ");
    lines.push("  " + gradientText(spaced, NEON, 0, 1, BOLD));
  }

  const left = `◆ ${title.toUpperCase()} BOT`;
  const info = [subtitle, version ? `v${version}` : "", time].filter(Boolean).join("  ·  ");
  const inner = Math.max(visibleLength(left), visibleLength(info)) + 4;
  const border = (t, ch) => paint(gradientAt(NEON, t), ch);
  const hline = (l, r) => {
    let out = "  " + border(0, l);
    for (let i = 0; i < inner; i++) out += border((i + 1) / (inner + 1), "─");
    return out + border(1, r);
  };
  const row = (content, color, ...styles) =>
    "  " + border(0, "│") + "  " + paint(color, padRight(content, inner - 2), ...styles) + border(1, "│");

  lines.push("");
  lines.push(hline("╭", "╮"));
  lines.push(row(left, NEON[0], BOLD));
  lines.push(row(info, GRAY));
  lines.push(hline("╰", "╯"));
  lines.push("");
  return lines;
}

// ── Khung thông tin ─────────────────────────────────────────────────────────
function colorValue(value, paint) {
  const v = String(value);
  if (/^(cho phép|bật|on|có)$/i.test(v)) return paint([74, 222, 128], `● ${v}`, BOLD);
  if (/^(chặn|tắt|off|không)$/i.test(v)) return paint([248, 113, 113], `● ${v}`, BOLD);
  if (/^\(chưa/i.test(v)) return paint(GRAY, v, ITALIC);
  return paint(SOFT_WHITE, v);
}

/**
 * Khung bo tròn có tiêu đề + các hàng "nhãn ▸ giá trị".
 * @param {{title?: string, rows: Array<[string,string]>, stops?: number[][], useColor?: boolean}} o
 * @returns {string[]}
 */
export function renderBox({ title = "", rows = [], stops = NEON, useColor = true } = {}) {
  const { paint, gradientText } = make(useColor);
  const labelWidth = Math.max(6, ...rows.map(([k]) => visibleLength(k)));
  const bodies = rows.map(([k, v]) => ({
    k: padRight(k, labelWidth),
    v: String(v),
  }));
  const bodyWidth = Math.max(
    visibleLength(title),
    ...bodies.map((b) => labelWidth + 5 + visibleLength(b.v)),
    24,
  );
  const inner = bodyWidth + 4; // 2 khoảng trắng mỗi bên

  const edge = (t, ch) => paint(gradientAt(stops, t), ch);
  const hline = (l, mid, r) => {
    let out = "  " + edge(0, l);
    for (let i = 0; i < inner; i++) out += edge((i + 1) / (inner + 1), mid);
    return out + edge(1, r);
  };
  const wrap = (content) => "  " + edge(0, "│") + "  " + content + "  " + edge(1, "│");

  const lines = [hline("╭", "─", "╮")];
  if (title) {
    const total = bodyWidth - visibleLength(title);
    const lp = Math.floor(total / 2);
    lines.push(
      wrap(" ".repeat(lp) + gradientText(title, stops, 0, 1, BOLD) + " ".repeat(total - lp)),
    );
    lines.push(hline("├", "─", "┤"));
  }
  for (const b of bodies) {
    const valueVisible = visibleLength(colorValue(b.v, (_c, t) => t));
    const content =
      paint(stops[0], b.k, BOLD) +
      paint(GRAY, " ▸ ") +
      colorValue(b.v, paint) +
      " ".repeat(Math.max(0, bodyWidth - labelWidth - 3 - valueVisible));
    lines.push(wrap(content));
  }
  lines.push(hline("╰", "─", "╯"));
  lines.push("");
  return lines;
}

/** Khung "đã sẵn sàng" màu xanh lá. */
export function renderReady({ name = "HNNP STUDIO", lines: extra = [], useColor = true } = {}) {
  const { paint, gradientText } = make(useColor);
  const head = `${name} đã sẵn sàng!`;
  const all = [head, ...extra];
  const bodyWidth = Math.max(...all.map((l) => visibleLength(l) + 4), 34);
  const inner = bodyWidth + 2;
  const edge = (t, ch) => paint(gradientAt(GREEN_STOPS, t), ch);
  const hline = (l, r) => {
    let out = "  " + edge(0, l);
    for (let i = 0; i < inner; i++) out += edge((i + 1) / (inner + 1), "━");
    return out + edge(1, r);
  };
  const wrap = (content) => "  " + edge(0, "┃") + " " + content + " " + edge(1, "┃");

  const out = [hline("┏", "┓")];
  out.push(
    wrap(
      paint(GREEN_STOPS[1], "●", BOLD) +
        "  " +
        gradientText(head, GREEN_STOPS, 0, 1, BOLD) +
        " ".repeat(Math.max(0, bodyWidth - 3 - visibleLength(head))),
    ),
  );
  for (const l of extra) {
    out.push(
      wrap(
        "   " + paint(GRAY, padRight(l, bodyWidth - 3)),
      ),
    );
  }
  out.push(hline("┗", "┛"));
  out.push("");
  return out;
}

// ── Log tin nhắn ────────────────────────────────────────────────────────────
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Gán màu ổn định theo id; id mới tránh trùng màu đã dùng (nếu còn màu trống). */
export function createColorAssigner(palette = CHAT_PALETTE) {
  const byId = new Map();
  const used = new Set();
  return function colorFor(id) {
    const key = String(id);
    if (byId.has(key)) return byId.get(key);
    let idx = hashString(key) % palette.length;
    if (used.size < palette.length) {
      // bước nhảy 3 (nguyên tố cùng nhau với 10) để màu kế tiếp khác sắc rõ rệt
      while (used.has(idx)) idx = (idx + 3) % palette.length;
    }
    used.add(idx);
    byId.set(key, palette[idx]);
    return palette[idx];
  };
}

const TYPE_TAGS = [
  [/photo|image/i, "Ảnh"],
  [/sticker/i, "Sticker"],
  [/gif/i, "GIF"],
  [/voice|audio/i, "Voice"],
  [/video/i, "Video"],
  [/file/i, "File"],
  [/location/i, "Vị trí"],
  [/recommended|link/i, "Link"],
  [/card|contact/i, "Danh thiếp"],
  [/poll/i, "Bình chọn"],
  [/todo|note/i, "Ghi chú"],
];

/** Rút gọn nội dung tin nhắn thành { tag, text }. */
export function describeContent(data) {
  const content = data?.content;
  if (typeof content === "string") return { tag: null, text: cleanText(content) };

  const msgType = String(data?.msgType ?? "");
  let tag = "Tin nhắn khác";
  for (const [re, label] of TYPE_TAGS) {
    if (re.test(msgType)) {
      tag = label;
      break;
    }
  }
  let text = "";
  if (content && typeof content === "object") {
    const candidate = content.title || content.description || content.href || content.name || "";
    if (typeof candidate === "string") text = cleanText(candidate);
  }
  return { tag, text };
}

/**
 * Dựng 1 dòng log tin nhắn.
 * @returns {string}
 */
export function renderChatLine({
  time,
  isGroup,
  groupName,
  senderName,
  tag,
  text,
  isReply = false,
  isCommand = false,
  groupColor,
  senderColor,
  useColor = true,
  columns = 120,
  groupWidth = 18,
}) {
  const { paint } = make(useColor);
  const label = isGroup ? groupName : "✉ INBOX";
  const gcolor = groupColor ?? CHAT_PALETTE[0];
  const scolor = senderColor ?? CHAT_PALETTE[1];

  const head =
    paint(GRAY, time, DIM) +
    "  " +
    paint(gcolor, "▌", BOLD) +
    paint(gcolor, padRight(truncate(label, groupWidth), groupWidth), BOLD) +
    " " +
    paint(scolor, senderName, BOLD) +
    paint(GRAY, " ›", DIM) +
    " ";

  const budget = Math.max(20, columns - visibleLength(head) - 1);
  let body = "";
  let used = 0;
  if (isReply) {
    body += paint(GRAY, "↪ ", DIM);
    used += 2;
  }
  if (tag) {
    const t = `[${tag}]`;
    body += paint([244, 114, 182], t, BOLD) + (text ? " " : "");
    used += t.length + (text ? 1 : 0);
  }
  if (text) {
    const shown = truncate(text, Math.max(8, budget - used));
    if (isCommand) {
      const sp = shown.indexOf(" ");
      const cmd = sp === -1 ? shown : shown.slice(0, sp);
      const rest = sp === -1 ? "" : shown.slice(sp);
      body += paint([250, 204, 21], cmd, BOLD) + paint(SOFT_WHITE, rest);
    } else {
      body += paint(SOFT_WHITE, shown);
    }
  } else if (!tag) {
    body += paint(GRAY, "(tin nhắn trống)", ITALIC);
  }
  return head + body;
}

function defaultTime(date = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Bộ in tin nhắn ra console.
 * @param {object} o
 * @param {() => any} [o.getAdapter]  trả adapter có getGroupInfo(threadId)
 * @param {() => string} [o.getPrefix]
 * @param {boolean} [o.enabled]
 * @param {boolean} [o.useColor]
 * @param {(line:string)=>void} [o.write]
 * @param {() => number} [o.getColumns]
 * @param {() => Date} [o.now]
 */
export function createChatConsole({
  getAdapter = () => null,
  getPrefix = () => "",
  enabled = true,
  useColor = Boolean(process.stdout.isTTY) && !("NO_COLOR" in process.env),
  write = (line) => console.log(line),
  getColumns = () => process.stdout.columns || 120,
  now = () => new Date(),
  nameTimeoutMs = 1500,
  nameTtlMs = 30 * 60 * 1000,
  failTtlMs = 5 * 60 * 1000,
} = {}) {
  const groupColors = createColorAssigner();
  const userColors = createColorAssigner(
    // lệch palette để màu người gửi khác màu nhóm khi nằm cạnh nhau
    [...CHAT_PALETTE.slice(4), ...CHAT_PALETTE.slice(0, 4)],
  );
  const nameCache = new Map(); // threadId -> { name, expires }
  const pending = new Map(); // threadId -> Promise<string|null>
  let queue = Promise.resolve();

  async function resolveGroupName(threadId) {
    const cached = nameCache.get(threadId);
    if (cached && cached.expires > Date.now()) return cached.name;
    const adapter = getAdapter();
    if (!adapter || typeof adapter.getGroupInfo !== "function") return null;

    if (!pending.has(threadId)) {
      const p = (async () => {
        try {
          const info = await adapter.getGroupInfo(threadId);
          const name = cleanText(info?.name || "");
          if (name) {
            nameCache.set(threadId, { name, expires: Date.now() + nameTtlMs });
            return name;
          }
        } catch {
          /* bỏ qua, dùng tên dự phòng */
        }
        nameCache.set(threadId, { name: null, expires: Date.now() + failTtlMs });
        return null;
      })().finally(() => pending.delete(threadId));
      pending.set(threadId, p);
    }
    const timeout = new Promise((resolve) => {
      setTimeout(() => resolve(null), nameTimeoutMs);
    });
    return Promise.race([pending.get(threadId), timeout]);
  }

  async function print(message) {
    const data = message?.data ?? {};
    const threadId = String(message?.threadId ?? data.idTo ?? "");
    const uid = String(data.uidFrom ?? "");
    const isGroup = message?.type === 1;

    let groupName = "";
    if (isGroup) {
      groupName =
        (await resolveGroupName(threadId)) || `Nhóm …${threadId.slice(-5) || "?"}`;
    }
    const senderName = cleanText(data.dName || "") || `UID …${uid.slice(-5) || "?"}`;
    const { tag, text } = describeContent(data);
    const prefix = getPrefix();
    const isCommand = Boolean(prefix) && !tag && text.startsWith(prefix);

    write(
      renderChatLine({
        time: defaultTime(now()),
        isGroup,
        groupName,
        senderName,
        tag,
        text,
        isReply: Boolean(data.quote),
        isCommand,
        groupColor: groupColors(isGroup ? threadId : `inbox:${uid}`),
        senderColor: userColors(uid || senderName),
        useColor,
        columns: getColumns(),
      }),
    );
  }

  return {
    /** Gọi không cần await; các dòng luôn in đúng thứ tự nhận. Không bao giờ throw. */
    log(message) {
      if (!enabled || !message || message.isSelf) return;
      queue = queue.then(() => print(message)).catch(() => {});
      return queue;
    },
    /** Dùng cho test: đợi hàng đợi in xong. */
    flush: () => queue,
  };
}
