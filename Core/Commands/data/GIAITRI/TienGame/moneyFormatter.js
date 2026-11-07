// Bộ định dạng số tiền dùng chung cho toàn bộ module TienGame (tin nhắn + Canvas).
// Mọi phép tính làm tròn dùng BigInt, không dùng số thực dấu phẩy động.
// Quy ước: K = nghìn, M = triệu, B = tỷ (10^9), T = nghìn tỷ (10^12).
// Giá trị hiển thị rút gọn luôn CẮT XUỐNG (không làm tròn lên) để không gây hiểu nhầm.

export const MAX_ADMIN_CREDIT = 1_000_000_000_000; // 1.000 tỷ mỗi giao dịch nạp

const SCALE = [
  { suffix: "T", unit: 1_000_000_000_000n },
  { suffix: "B", unit: 1_000_000_000n },
  { suffix: "M", unit: 1_000_000n },
  { suffix: "K", unit: 1_000n },
];

export function toBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Số tiền không hữu hạn.");
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^-?\d+$/.test(text)) throw new TypeError("Số tiền không hợp lệ.");
    return BigInt(text);
  }
  throw new TypeError("Số tiền không hợp lệ.");
}

// Định dạng đầy đủ kiểu Việt Nam: 1.234.567.890.123
export function formatFull(value) {
  const n = toBigInt(value);
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  return sign + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Định dạng rút gọn: 1.5M, 1.99B, 1T. Cắt xuống, bỏ số 0 thừa ở cuối.
export function formatCompact(value, { decimals = 2 } = {}) {
  const n = toBigInt(value);
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  if (abs < 1_000n) return sign + abs.toString();

  const scale = 10n ** BigInt(decimals);
  for (const { suffix, unit } of SCALE) {
    if (abs >= unit) {
      const scaled = (abs * scale) / unit; // floor = cắt xuống
      const intPart = scaled / scale;
      const frac = (scaled % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
      return `${sign}${intPart}${frac ? `.${frac}` : ""}${suffix}`;
    }
  }
  return sign + abs.toString();
}

// Chọn cách hiển thị: ưu tiên đầy đủ nếu vừa, nếu không dùng rút gọn.
// `fits(text)` do người gọi cung cấp (ví dụ đo bằng ctx.measureText).
export function pickDisplay(value, fits) {
  const full = formatFull(value);
  if (fits(full)) return full;
  return formatCompact(value);
}

// Vẽ số tiền vừa trong maxWidth:
//   1) đầy đủ ở cỡ chữ gốc  2) rút gọn ở cỡ chữ gốc  3) rút gọn, thu cỡ chữ đến minSize.
// ctx phải đã có ctx.font dạng "... <size>px ...". Không bao giờ cắt chữ.
export function drawMoney(ctx, value, x, y, maxWidth, { suffix = " GOLD", prefix = "", minSize = 18 } = {}) {
  const font = ctx.font;
  const match = font.match(/(\d+(?:\.\d+)?)px/);
  const startSize = match ? Number(match[1]) : 32;
  const fontAt = (size) => font.replace(/\d+(?:\.\d+)?px/, `${size}px`);
  const widthAt = (text, size) => {
    ctx.font = fontAt(size);
    return ctx.measureText(text).width;
  };

  const full = `${prefix}${formatFull(value)}${suffix}`;
  const compact = `${prefix}${formatCompact(value)}${suffix}`;

  let chosen = null;
  if (widthAt(full, startSize) <= maxWidth) {
    chosen = { text: full, size: startSize, mode: "full" };
  } else if (widthAt(compact, startSize) <= maxWidth) {
    chosen = { text: compact, size: startSize, mode: "compact" };
  } else {
    for (let size = startSize - 2; size >= minSize; size -= 2) {
      if (widthAt(compact, size) <= maxWidth) {
        chosen = { text: compact, size, mode: "compact-shrunk" };
        break;
      }
    }
  }
  const fitted = Boolean(chosen);
  if (!chosen) chosen = { text: compact, size: minSize, mode: "overflow" };

  ctx.font = fontAt(chosen.size);
  ctx.fillText(chosen.text, x, y);
  return { ...chosen, fitted };
}
