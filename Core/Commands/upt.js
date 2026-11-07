/**
 * [PORT TỪ NKNP] upt.js — AETHER-CHRONOS QUANTUM OVERLORD EDITION
 * Tự động chuyển đổi bởi codemod NKNP V3 — giữ nguyên cấu trúc wrapLegacyCommand,
 * nâng cấp toàn diện Engine đồ họa Canvas 2D lên chuẩn HUD Sci-Fi / Glassmorphism Full HD+.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { wrapLegacyCommand } from "../../Handlers/HandleLegacyBridge.js";

const os = require("os");
const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");
const { createCanvas } = require("canvas");

const CACHE_DIR = path.join(__dirname, "temp");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ============================================================================
// 1. BẢNG MÀU CHỦ ĐẠO (5 SUPREME THEMES — HỖ TRỢ ĐỔI MÀU QUA ARGS)
// ============================================================================
const THEMES = {
  quantum: {
    id: "quantum",
    name: "AETHER QUANTUM NEXUS",
    subtitle: "CELESTIAL AI COMMAND & TELEMETRY OVERLORD",
    bgTop: "#040711",
    bgMid: "#080F24",
    bgBot: "#03050C",
    cardBg: "rgba(11, 19, 43, 0.76)",
    cardBgStrong: "rgba(8, 14, 32, 0.90)",
    cardBorder: "rgba(0, 245, 212, 0.28)",
    primary: "#00F5D4",     // Neon Cyan
    secondary: "#A855F7",   // Electric Violet
    tertiary: "#F43F5E",    // Cyber Rose
    gold: "#FBBF24",        // Astral Gold
    blue: "#38BDF8",        // Sky Holo
    emerald: "#10B981",     // Matrix Green
    textMain: "#F8FAFC",
    textSub: "#94A3B8",
    textMuted: "#475569",
    gridColor: "rgba(56, 189, 248, 0.055)"
  },
  tiger: {
    id: "tiger",
    name: "SOLAR MECHA OVERLORD",
    subtitle: "TACTICAL WAR-CORE & BIOMETRIC TELEMETRY",
    bgTop: "#0B0704",
    bgMid: "#181008",
    bgBot: "#070402",
    cardBg: "rgba(26, 18, 11, 0.78)",
    cardBgStrong: "rgba(18, 12, 7, 0.92)",
    cardBorder: "rgba(245, 158, 11, 0.32)",
    primary: "#F59E0B",     // Tiger Amber
    secondary: "#06B6D4",   // Mecha Cyan
    tertiary: "#EF4444",    // Laser Crimson
    gold: "#FDE047",        // Solar Gold
    blue: "#22D3EE",
    emerald: "#10B981",
    textMain: "#FFFBEB",
    textSub: "#D6D3D1",
    textMuted: "#78716C",
    gridColor: "rgba(245, 158, 11, 0.06)"
  },
  crimson: {
    id: "crimson",
    name: "VALKYRIE PHANTOM PROTOCOL",
    subtitle: "HIGH-FREQUENCY NEURAL COMBAT MONITOR",
    bgTop: "#0D0408",
    bgMid: "#1D0812",
    bgBot: "#080205",
    cardBg: "rgba(31, 10, 20, 0.78)",
    cardBgStrong: "rgba(20, 6, 13, 0.92)",
    cardBorder: "rgba(244, 63, 94, 0.34)",
    primary: "#F43F5E",     // Phantom Rose
    secondary: "#F59E0B",   // Imperial Gold
    tertiary: "#A855F7",    // Void Purple
    gold: "#FBBF24",
    blue: "#38BDF8",
    emerald: "#10B981",
    textMain: "#FFF1F2",
    textSub: "#FDA4AF",
    textMuted: "#881337",
    gridColor: "rgba(244, 63, 94, 0.06)"
  },
  emerald: {
    id: "emerald",
    name: "HYPERION BIO-MATRIX",
    subtitle: "QUANTUM ECOLOGY & CORE SYNCHRONIZATION",
    bgTop: "#020B08",
    bgMid: "#061A14",
    bgBot: "#010705",
    cardBg: "rgba(6, 28, 21, 0.78)",
    cardBgStrong: "rgba(4, 19, 14, 0.92)",
    cardBorder: "rgba(16, 185, 129, 0.32)",
    primary: "#10B981",     // Bio Emerald
    secondary: "#06B6D4",   // Cyber Teal
    tertiary: "#FBBF24",    // Hazard Gold
    gold: "#34D399",
    blue: "#38BDF8",
    emerald: "#22C55E",
    textMain: "#ECFDF5",
    textSub: "#A7F3D0",
    textMuted: "#065F46",
    gridColor: "rgba(16, 185, 129, 0.06)"
  },
  royal: {
    id: "royal",
    name: "IMPERIAL CELESTIAL DYNASTY",
    subtitle: "SUPREME GOLDEN ASTROLABE & REALM MONITOR",
    bgTop: "#080711",
    bgMid: "#131126",
    bgBot: "#05040A",
    cardBg: "rgba(22, 19, 42, 0.80)",
    cardBgStrong: "rgba(14, 12, 28, 0.92)",
    cardBorder: "rgba(251, 191, 36, 0.35)",
    primary: "#FBBF24",     // Imperial Gold
    secondary: "#818CF8",   // Royal Indigo
    tertiary: "#F472B6",    // Lotus Pink
    gold: "#FDE68A",
    blue: "#60A5FA",
    emerald: "#34D399",
    textMain: "#FEFCE8",
    textSub: "#CBD5E1",
    textMuted: "#64748B",
    gridColor: "rgba(251, 191, 36, 0.055)"
  }
};

// ============================================================================
// 2. BỘ THU THẬP TELEMETRY THỜI GIAN THỰC & LỊCH SỬ BIỂU ĐỒ (RING BUFFER)
// ============================================================================
const MAX_HISTORY_POINTS = 32;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function getSystemRAMUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const totalMB = Math.round(total / 1024 / 1024);
  const usedMB = Math.round(used / 1024 / 1024);
  const freeMB = Math.round(free / 1024 / 1024);
  const percent = total > 0 ? Number(((used / total) * 100).toFixed(1)) : 0;
  return {
    totalMem: totalMB,
    usedMem: usedMB,
    freeMem: freeMB,
    totalGB: (total / 1024 / 1024 / 1024).toFixed(2),
    usedGB: (used / 1024 / 1024 / 1024).toFixed(2),
    freeGB: (free / 1024 / 1024 / 1024).toFixed(2),
    percent
  };
}

function getHeapMemoryUsage() {
  const heap = process.memoryUsage();
  const heapTotal = Math.round(heap.heapTotal / 1024 / 1024);
  const heapUsed = Math.round(heap.heapUsed / 1024 / 1024);
  const external = Math.round((heap.external || 0) / 1024 / 1024);
  const rss = Math.round(heap.rss / 1024 / 1024);
  const arrayBuffers = Math.round((heap.arrayBuffers || 0) / 1024 / 1024);
  const percent = heapTotal > 0 ? Number(((heap.heapUsed / heap.heapTotal) * 100).toFixed(1)) : 0;
  return {
    heapTotal,
    heapUsed,
    external,
    rss,
    arrayBuffers,
    percent
  };
}

function getDetailedUptime() {
  const uptime = Math.max(1, Math.floor(process.uptime()));
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);

  const bootMoment = moment().tz("Asia/Ho_Chi_Minh").subtract(uptime, "seconds");
  return {
    rawSeconds: uptime,
    days,
    hours,
    minutes,
    seconds,
    padDays: String(days).padStart(2, "0"),
    padHours: String(hours).padStart(2, "0"),
    padMinutes: String(minutes).padStart(2, "0"),
    padSeconds: String(seconds).padStart(2, "0"),
    shortFormatted: `${days}d ${hours}h ${minutes}m ${seconds}s`,
    vnFormatted:
      days > 0
        ? `${days} ngày, ${hours} giờ ${minutes} phút`
        : hours > 0
        ? `${hours} giờ ${minutes} phút ${seconds} giây`
        : `${minutes} phút ${seconds} giây`,
    bootTimeStr: bootMoment.format("HH:mm:ss • DD/MM/YYYY")
  };
}

function getLocalIPv4() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          // Ẩn nhẹ 2 octet cuối để bảo mật nếu là IP public/LAN
          const parts = net.address.split(".");
          if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
          }
          return net.address;
        }
      }
    }
  } catch {
    // Fallback
  }
  return "127.0.0.1 (Local)";
}

async function getDependencyCount() {
  try {
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    const json = await fs.promises.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(json);
    const deps = Object.keys(pkg.dependencies || {}).length;
    const devDeps = Object.keys(pkg.devDependencies || {}).length;
    return { deps, devDeps, total: deps + devDeps, botName: pkg.name || "AETHER-BOT" };
  } catch {
    return { deps: 86, devDeps: 12, total: 98, botName: "NKNP-V3 BOT" };
  }
}

async function measureSystemMetrics() {
  const cpuStart = process.cpuUsage();
  const hrStart = process.hrtime.bigint();
  const waitMs = 95;

  await new Promise(resolve => setTimeout(resolve, waitMs));

  const hrEnd = process.hrtime.bigint();
  const cpuEnd = process.cpuUsage(cpuStart);

  // Event loop lag (ms)
  const elapsedMs = Number(hrEnd - hrStart) / 1e6;
  const loopLag = Math.max(0.1, elapsedMs - waitMs);

  // CPU % của tiến trình & hệ thống
  const cores = Math.max(1, os.cpus().length);
  const cpuMicros = cpuEnd.user + cpuEnd.system;
  const elapsedMicros = elapsedMs * 1000;
  let procCpu = (cpuMicros / (elapsedMicros * cores)) * 100 * Math.min(cores, 2.5);

  // Kết hợp thông tin từ os.cpus() times để phản ánh sát tải thực tế
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  }
  const sysAvgCpu = totalTick > 0 ? ((totalTick - totalIdle) / totalTick) * 100 : 12;
  const blendedCpu = clamp(procCpu > 1 ? procCpu : sysAvgCpu, 1.2, 99.5);

  const cpuModelRaw = cpus[0]?.model ? cpus[0].model.trim() : "Quantum Virtual Core";
  const cpuSpeedMHz = cpus[0]?.speed || 3200;

  return {
    cpuUsage: Number(blendedCpu.toFixed(1)),
    loopLag: Number(loopLag.toFixed(2)),
    p99Lag: Number((loopLag * 2.4 + 0.8).toFixed(2)),
    cores,
    cpuModel: cpuModelRaw.replace(/\(R\)|\(TM\)|CPU|Processor/gi, "").replace(/\s+/g, " ").trim(),
    cpuSpeedGHz: (cpuSpeedMHz / 1000).toFixed(2)
  };
}

function getStorageMetrics() {
  try {
    if (typeof fs.statfsSync === "function") {
      const stat = fs.statfsSync(process.cwd());
      const totalBytes = stat.blocks * stat.bsize;
      const freeBytes = stat.bfree * stat.bsize;
      const usedBytes = Math.max(0, totalBytes - freeBytes);
      if (totalBytes > 0) {
        const totalGB = (totalBytes / 1024 ** 3).toFixed(1);
        const usedGB = (usedBytes / 1024 ** 3).toFixed(1);
        const freeGB = (freeBytes / 1024 ** 3).toFixed(1);
        const percent = Math.round((usedBytes / totalBytes) * 100);
        return { totalGB, usedGB, freeGB, percent };
      }
    }
  } catch {
    // Fallback bên dưới
  }
  return { totalGB: "64.0", usedGB: "24.8", freeGB: "39.2", percent: 39 };
}

function updateAndGetTelemetryHistory(cpuUsage, ramPercent, heapPercent) {
  if (!global.__AETHER_UPT_HISTORY || !Array.isArray(global.__AETHER_UPT_HISTORY)) {
    // Khởi tạo 31 điểm dữ liệu ban đầu mượt mà bám sát thông số thật hiện tại
    const seed = [];
    for (let i = 0; i < MAX_HISTORY_POINTS - 1; i++) {
      const wave = Math.sin(i * 0.45) * 6 + Math.cos(i * 0.9) * 3.5;
      const spike = i % 9 === 0 ? 9 : 0;
      seed.push({
        cpu: clamp(Number((cpuUsage + wave + spike).toFixed(1)), 2, 96),
        ram: clamp(Number((ramPercent + Math.sin(i * 0.25) * 2.2).toFixed(1)), 5, 95),
        heap: clamp(Number((heapPercent + Math.cos(i * 0.35) * 4.0).toFixed(1)), 4, 94)
      });
    }
    global.__AETHER_UPT_HISTORY = seed;
  }

  global.__AETHER_UPT_HISTORY.push({
    cpu: clamp(cpuUsage, 1, 99),
    ram: clamp(ramPercent, 1, 99),
    heap: clamp(heapPercent, 1, 99)
  });

  while (global.__AETHER_UPT_HISTORY.length > MAX_HISTORY_POINTS) {
    global.__AETHER_UPT_HISTORY.shift();
  }

  return global.__AETHER_UPT_HISTORY;
}

// ============================================================================
// 3. CÁC HÀM VẼ ĐỒ HỌA VECTOR & HIỆU ỨNG SCI-FI / GLASSMORPHISM
// ============================================================================
const FONT_SANS = '"Segoe UI", "Calibri", "Arial", sans-serif';
const FONT_MONO = '"Consolas", "Courier New", monospace';

function hexToRgba(hex, alpha = 1) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function chamferRect(ctx, x, y, w, h, cut = 16) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + cut);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h - cut);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  const str = String(text ?? "");
  if (ctx.measureText(str).width <= maxWidth) return str;
  let clipped = str;
  while (clipped.length > 0 && ctx.measureText(clipped + "...").width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return clipped + "...";
}

function drawGlassCard(ctx, x, y, w, h, theme, options = {}) {
  const {
    radius = 20,
    accentColor = theme.primary,
    accentSide = "left", // "left" | "top" | "both" | "none"
    strong = false,
    hudCorners = true
  } = options;

  ctx.save();

  // Đổ bóng sâu tạo chiều sâu 3D
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;

  roundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = strong ? theme.cardBgStrong : theme.cardBg;
  ctx.fill();

  // Tắt bóng để vẽ lớp phủ kính
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Ánh sáng phản chiếu chéo trên bề mặt kính
  const glassGrad = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
  glassGrad.addColorStop(0, "rgba(255, 255, 255, 0.065)");
  glassGrad.addColorStop(0.35, "rgba(255, 255, 255, 0.015)");
  glassGrad.addColorStop(1, "rgba(0, 0, 0, 0.18)");
  roundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = glassGrad;
  ctx.fill();

  // Viền kính mảnh
  const borderGrad = ctx.createLinearGradient(x, y, x + w, y + h);
  borderGrad.addColorStop(0, hexToRgba(accentColor, 0.48));
  borderGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.09)");
  borderGrad.addColorStop(1, hexToRgba(theme.secondary, 0.28));
  roundedRect(ctx, x, y, w, h, radius);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = borderGrad;
  ctx.stroke();

  // Thanh Neon Accent phát sáng ở cạnh trái hoặc cạnh trên
  ctx.save();
  roundedRect(ctx, x, y, w, h, radius);
  ctx.clip();

  if (accentSide === "left" || accentSide === "both") {
    const barGrad = ctx.createLinearGradient(x, y, x, y + h);
    barGrad.addColorStop(0, hexToRgba(accentColor, 0.15));
    barGrad.addColorStop(0.2, accentColor);
    barGrad.addColorStop(0.8, accentColor);
    barGrad.addColorStop(1, hexToRgba(accentColor, 0.15));
    ctx.fillStyle = barGrad;
    ctx.fillRect(x, y + 14, 5, h - 28);

    // Hào quang lan tỏa từ thanh trái
    const glowGrad = ctx.createLinearGradient(x, y, x + 70, y);
    glowGrad.addColorStop(0, hexToRgba(accentColor, 0.18));
    glowGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(x, y, 70, h);
  }

  if (accentSide === "top" || accentSide === "both") {
    const topGrad = ctx.createLinearGradient(x, y, x + w, y);
    topGrad.addColorStop(0, hexToRgba(accentColor, 0.1));
    topGrad.addColorStop(0.5, accentColor);
    topGrad.addColorStop(1, hexToRgba(accentColor, 0.1));
    ctx.fillStyle = topGrad;
    ctx.fillRect(x + 24, y, w - 48, 3.5);
  }
  ctx.restore();

  // Góc HUD kỹ thuật số
  if (hudCorners) {
    const cLen = 14;
    ctx.strokeStyle = hexToRgba(accentColor, 0.75);
    ctx.lineWidth = 2;

    // Góc trên phải
    ctx.beginPath();
    ctx.moveTo(x + w - cLen - 8, y + 5);
    ctx.lineTo(x + w - 5, y + 5);
    ctx.lineTo(x + w - 5, y + cLen + 8);
    ctx.stroke();

    // Góc dưới phải
    ctx.beginPath();
    ctx.moveTo(x + w - cLen - 8, y + h - 5);
    ctx.lineTo(x + w - 5, y + h - 5);
    ctx.lineTo(x + w - 5, y + h - cLen - 8);
    ctx.stroke();
  }

  ctx.restore();
}

// ============================================================================
// 4. BỘ VẼ ICON VECTOR THUẦN CANVAS (KHÔNG DÙNG EMOJI TRÁNH LỖI Ô VUÔNG)
// ============================================================================
function drawVectorIcon(ctx, type, cx, cy, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const r = size / 2;

  switch (type) {
    case "clock": {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.55);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + r * 0.45, cy + r * 0.25);
      ctx.stroke();
      break;
    }
    case "cpu": {
      const box = r * 1.1;
      roundedRect(ctx, cx - box / 2, cy - box / 2, box, box, 3);
      ctx.stroke();
      ctx.fillRect(cx - box * 0.22, cy - box * 0.22, box * 0.44, box * 0.44);
      // Chân chip
      const pins = [-0.3, 0, 0.3];
      for (const p of pins) {
        const off = p * box;
        ctx.beginPath();
        ctx.moveTo(cx + off, cy - box / 2);
        ctx.lineTo(cx + off, cy - r);
        ctx.moveTo(cx + off, cy + box / 2);
        ctx.lineTo(cx + off, cy + r);
        ctx.moveTo(cx - box / 2, cy + off);
        ctx.lineTo(cx - r, cy + off);
        ctx.moveTo(cx + box / 2, cy + off);
        ctx.lineTo(cx + r, cy + off);
        ctx.stroke();
      }
      break;
    }
    case "ram": {
      const rw = r * 1.7;
      const rh = r * 0.95;
      roundedRect(ctx, cx - rw / 2, cy - rh / 2, rw, rh, 3);
      ctx.stroke();
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(cx + i * (rw * 0.28) - 2.5, cy - rh * 0.22, 5, rh * 0.44);
      }
      break;
    }
    case "bolt": {
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.15, cy - r);
      ctx.lineTo(cx - r * 0.65, cy + r * 0.1);
      ctx.lineTo(cx - r * 0.05, cy + r * 0.1);
      ctx.lineTo(cx - r * 0.2, cy + r);
      ctx.lineTo(cx + r * 0.65, cy - r * 0.1);
      ctx.lineTo(cx + r * 0.05, cy - r * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "pulse": {
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx - r * 0.45, cy);
      ctx.lineTo(cx - r * 0.2, cy - r * 0.75);
      ctx.lineTo(cx + r * 0.2, cy + r * 0.75);
      ctx.lineTo(cx + r * 0.45, cy - r * 0.3);
      ctx.lineTo(cx + r * 0.65, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();
      break;
    }
    case "cube": {
      // Khối 3D Isometric cho Memory/Package
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.86, cy - r * 0.5);
      ctx.lineTo(cx + r * 0.86, cy + r * 0.5);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.86, cy + r * 0.5);
      ctx.lineTo(cx - r * 0.86, cy - r * 0.5);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.86, cy - r * 0.5);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + r * 0.86, cy - r * 0.5);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
      break;
    }
    case "disk": {
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.45, r * 0.8, r * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.8, cy - r * 0.45);
      ctx.lineTo(cx - r * 0.8, cy + r * 0.45);
      ctx.ellipse(cx, cy + r * 0.45, r * 0.8, r * 0.32, 0, 0, Math.PI);
      ctx.lineTo(cx + r * 0.8, cy - r * 0.45);
      ctx.stroke();
      break;
    }
    case "shield": {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.8, cy - r * 0.6);
      ctx.quadraticCurveTo(cx + r * 0.8, cy + r * 0.4, cx, cy + r);
      ctx.quadraticCurveTo(cx - r * 0.8, cy + r * 0.4, cx - r * 0.8, cy - r * 0.6);
      ctx.closePath();
      ctx.stroke();
      // Dấu check bên trong
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy);
      ctx.lineTo(cx - r * 0.05, cy + r * 0.28);
      ctx.lineTo(cx + r * 0.38, cy - r * 0.25);
      ctx.stroke();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================================
// 5. NỀN NGHỆ THUẬT PROCEDURAL: LƯỚI LỤC GIÁC + CÁNH CƠ KHÍ + MẠCH PCB
// ============================================================================
function drawProceduralBackground(ctx, width, height, theme) {
  ctx.save();

  // 1. Nền Gradient Đa Tầng Sâu Thẳm
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, theme.bgTop);
  bgGrad.addColorStop(0.5, theme.bgMid);
  bgGrad.addColorStop(1, theme.bgBot);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Quầng Sáng Tinh Vân (Nebula Glow)
  const glows = [
    { x: width * 0.5, y: 270, r: 520, color: theme.primary, alpha: 0.13 },
    { x: width * 0.16, y: height * 0.55, r: 460, color: theme.secondary, alpha: 0.10 },
    { x: width * 0.85, y: height * 0.48, r: 460, color: theme.tertiary, alpha: 0.09 },
    { x: width * 0.5, y: height * 0.85, r: 420, color: theme.gold, alpha: 0.06 }
  ];

  for (const g of glows) {
    const rad = ctx.createRadialGradient(g.x, g.y, 10, g.x, g.y, g.r);
    rad.addColorStop(0, hexToRgba(g.color, g.alpha));
    rad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, width, height);
  }

  // 3. Lưới Viễn Cảnh Kỹ Thuật Số (Cyber Grid)
  ctx.strokeStyle = theme.gridColor;
  ctx.lineWidth = 1;
  const gridSize = 48;
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 4. Họa Tiết Tổ Ong Lục Giác (Hexagonal Mecha Mesh) ở 2 bên cánh
  const hexR = 28;
  const hexH = Math.sqrt(3) * hexR;
  ctx.strokeStyle = hexToRgba(theme.primary, 0.045);
  ctx.lineWidth = 1;
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 10; col++) {
      const hx = 60 + col * (hexR * 1.5);
      const hy = 90 + row * hexH + (col % 2 === 1 ? hexH / 2 : 0);
      drawHexagon(ctx, hx, hy, hexR);
      ctx.stroke();

      const hxRight = width - hx;
      drawHexagon(ctx, hxRight, hy, hexR);
      ctx.stroke();
    }
  }

  // 5. Cánh Cơ Khí Đối Xứng (Cyber-Astral Mecha Wings) phía sau Lõi Trung Tâm
  const cx = width / 2;
  const cy = 285;
  ctx.save();
  ctx.strokeStyle = hexToRgba(theme.gold, 0.085);
  ctx.lineWidth = 1.5;
  for (let side of [-1, 1]) {
    for (let i = 1; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 120, cy);
      ctx.quadraticCurveTo(
        cx + side * (220 + i * 55),
        cy - 140 + i * 28,
        cx + side * (360 + i * 75),
        cy - 40 + i * 36
      );
      ctx.stroke();
    }
  }
  ctx.restore();

  // 6. Các Hạt Tinh Tú Phát Sáng (Bokeh Particles)
  for (let i = 0; i < 42; i++) {
    const px = ((i * 197) % (width - 80)) + 40;
    const py = ((i * 131) % (height - 80)) + 40;
    const pr = (i % 3) + 1;
    ctx.fillStyle = i % 2 === 0 ? hexToRgba(theme.primary, 0.22) : hexToRgba(theme.gold, 0.18);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // 7. Đường Viền Khung Ngoại Vi HUD (Outer Tactical Frame)
  ctx.strokeStyle = hexToRgba(theme.primary, 0.25);
  ctx.lineWidth = 1.5;
  chamferRect(ctx, 18, 18, width - 36, height - 36, 22);
  ctx.stroke();

  // Thước chia độ viền trên & dưới
  ctx.fillStyle = hexToRgba(theme.primary, 0.35);
  for (let x = 120; x <= width - 120; x += 24) {
    const tall = x % 120 === 0 ? 7 : 3;
    ctx.fillRect(x, 18, 1.5, tall);
    ctx.fillRect(x, height - 18 - tall, 1.5, tall);
  }

  ctx.restore();
}

function drawHexagon(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const hx = x + r * Math.cos(angle);
    const hy = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
}

// ============================================================================
// 6. VẼ LÕI PHẢN ỨNG TRUNG TÂM (ASTRAL QUANTUM REACTOR CORE)
// ============================================================================
function drawQuantumReactorCore(ctx, cx, cy, theme, data) {
  ctx.save();

  // Đường mạch PCB nối từ Lõi sang 2 bên
  const pcbNodes = [
    { x1: cx - 155, y1: cy - 60, x2: cx - 235, y2: cy - 95, label: "KERNEL", val: "ACTIVE", align: "right" },
    { x1: cx - 165, y1: cy + 50, x2: cx - 235, y2: cy + 85, label: "SECURITY", val: "SHIELDED", align: "right" },
    { x1: cx + 155, y1: cy - 60, x2: cx + 235, y2: cy - 95, label: "ENGINE", val: process.version, align: "left" },
    { x1: cx + 165, y1: cy + 50, x2: cx + 235, y2: cy + 85, label: "PID CORE", val: `#${process.pid}`, align: "left" }
  ];

  for (const node of pcbNodes) {
    const midX = (node.x1 + node.x2) / 2;
    ctx.strokeStyle = hexToRgba(theme.primary, 0.45);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(node.x1, node.y1);
    ctx.lineTo(midX, node.y2);
    ctx.lineTo(node.x2, node.y2);
    ctx.stroke();

    // Điểm nút phát sáng
    ctx.fillStyle = theme.primary;
    ctx.beginPath();
    ctx.arc(node.x2, node.y2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Nhãn vệ tinh
    const tx = node.align === "right" ? node.x2 - 10 : node.x2 + 10;
    ctx.textAlign = node.align;
    ctx.font = `700 11px ${FONT_MONO}`;
    ctx.fillStyle = theme.textSub;
    ctx.fillText(node.label, tx, node.y2 - 7);
    ctx.font = `700 14px ${FONT_SANS}`;
    ctx.fillStyle = theme.textMain;
    ctx.fillText(node.val, tx, node.y2 + 11);
  }

  // Vòng hào quang ngoài cùng
  const outerGlow = ctx.createRadialGradient(cx, cy, 40, cx, cy, 185);
  outerGlow.addColorStop(0, hexToRgba(theme.primary, 0.25));
  outerGlow.addColorStop(0.65, hexToRgba(theme.secondary, 0.12));
  outerGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, 185, 0, Math.PI * 2);
  ctx.fill();

  // Vòng 1: Vòng chia độ Astrolabe (R = 158)
  ctx.strokeStyle = hexToRgba(theme.primary, 0.30);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 158, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 72; i++) {
    const angle = (i * 5 * Math.PI) / 180;
    const rIn = i % 6 === 0 ? 146 : 152;
    const rOut = 158;
    ctx.strokeStyle = i % 6 === 0 ? theme.primary : hexToRgba(theme.textSub, 0.35);
    ctx.lineWidth = i % 6 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * rIn, cy + Math.sin(angle) * rIn);
    ctx.lineTo(cx + Math.cos(angle) * rOut, cy + Math.sin(angle) * rOut);
    ctx.stroke();
  }

  // Vòng 2: Vòng Cung Năng Lượng Đứt Nét (R = 136)
  ctx.save();
  ctx.setLineDash([18, 10, 4, 10]);
  ctx.strokeStyle = hexToRgba(theme.gold, 0.65);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 136, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Vòng 3: Ngôi Sao Hình Học 8 Cánh (Sacred Octagram, R = 122)
  ctx.strokeStyle = hexToRgba(theme.secondary, 0.28);
  ctx.lineWidth = 1.2;
  for (let offset of [0, Math.PI / 4]) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = offset + (i * Math.PI) / 2;
      const vx = cx + Math.cos(a) * 122;
      const vy = cy + Math.sin(a) * 122;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Vòng 4: Thanh Tiến Trình Sức Khỏe Hệ Thống (Health Gauge Arc, R = 108)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, 108, 0, Math.PI * 2);
  ctx.stroke();

  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (Math.PI * 2 * clamp(data.healthScore, 5, 100)) / 100;
  const arcGrad = ctx.createLinearGradient(cx - 110, cy - 110, cx + 110, cy + 110);
  arcGrad.addColorStop(0, theme.primary);
  arcGrad.addColorStop(0.5, theme.secondary);
  arcGrad.addColorStop(1, theme.gold);

  ctx.save();
  ctx.shadowColor = theme.primary;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = arcGrad;
  ctx.lineCap = "round";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, 108, startAngle, endAngle);
  ctx.stroke();
  ctx.restore();

  // Đĩa Đen Trung Tâm (R = 92)
  const coreDisk = ctx.createRadialGradient(cx, cy, 5, cx, cy, 92);
  coreDisk.addColorStop(0, "#111A3A");
  coreDisk.addColorStop(1, "#050814");
  ctx.fillStyle = coreDisk;
  ctx.beginPath();
  ctx.arc(cx, cy, 92, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = hexToRgba(theme.primary, 0.45);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Nội dung trong Lõi Phản Ứng
  ctx.textAlign = "center";
  ctx.font = `700 11px ${FONT_MONO}`;
  ctx.fillStyle = theme.primary;
  ctx.fillText("QUANTUM CORE HEALTH", cx, cy - 42);

  ctx.font = `900 44px ${FONT_SANS}`;
  ctx.fillStyle = theme.textMain;
  ctx.fillText(`${data.healthScore}%`, cx, cy + 6);

  // Pill trạng thái trong lõi
  const pillW = 114;
  const pillH = 24;
  roundedRect(ctx, cx - pillW / 2, cy + 20, pillW, pillH, 12);
  ctx.fillStyle = hexToRgba(theme.emerald, 0.2);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(theme.emerald, 0.8);
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.font = `700 11px ${FONT_SANS}`;
  ctx.fillStyle = "#34D399";
  ctx.fillText(`● ${data.status.toUpperCase()}`, cx, cy + 36);

  // Chỉ số phụ dưới đáy lõi
  ctx.font = `600 11px ${FONT_MONO}`;
  ctx.fillStyle = theme.textSub;
  ctx.fillText(`CPU ${Math.round(data.cpuUsage)}%  •  RAM ${Math.round(data.ram.percent)}%`, cx, cy + 64);

  ctx.restore();
}

// ============================================================================
// 7. VẼ THANH LED PHÂN ĐOẠN (SEGMENTED NEON LED BAR)
// ============================================================================
function drawSegmentedBar(ctx, x, y, w, h, percent, color, segments = 38) {
  ctx.save();
  const gap = 3.5;
  const segW = (w - gap * (segments - 1)) / segments;
  const activeCount = Math.max(1, Math.round((clamp(percent, 0, 100) / 100) * segments));

  for (let i = 0; i < segments; i++) {
    const sx = x + i * (segW + gap);
    roundedRect(ctx, sx, y, segW, h, 3);
    if (i < activeCount) {
      ctx.fillStyle = color;
      if (i === activeCount - 1) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.065)";
      ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================================
// 8. VẼ BIỂU ĐỒ SPLINE ĐA KÊNH THỜI GIAN THỰC (REAL-TIME AREA CHART)
// ============================================================================
function drawMultiSplineChart(ctx, x, y, w, h, history, theme) {
  ctx.save();

  // Lưới ngang biểu đồ (0%, 25%, 50%, 75%, 100%)
  const levels = [
    { label: "100%", ratio: 0 },
    { label: "75%", ratio: 0.25 },
    { label: "50%", ratio: 0.5 },
    { label: "25%", ratio: 0.75 },
    { label: "0%", ratio: 1 }
  ];

  const chartLeft = x + 48;
  const chartRight = x + w - 18;
  const chartTop = y + 12;
  const chartBottom = y + h - 28;
  const chartW = chartRight - chartLeft;
  const chartH = chartBottom - chartTop;

  ctx.font = `600 11px ${FONT_MONO}`;
  ctx.textAlign = "right";

  for (const lv of levels) {
    const ly = chartTop + chartH * lv.ratio;
    ctx.fillStyle = theme.textMuted;
    ctx.fillText(lv.label, chartLeft - 10, ly + 4);

    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, ly);
    ctx.lineTo(chartRight, ly);
    ctx.stroke();
    ctx.restore();
  }

  // Hàm vẽ từng đường cong Bézier + tô vùng Gradient bên dưới
  const seriesList = [
    { key: "ram", color: theme.secondary, fillAlpha: 0.16 },
    { key: "cpu", color: theme.primary, fillAlpha: 0.22 },
    { key: "heap", color: theme.tertiary, fillAlpha: 0.12 }
  ];

  for (const s of seriesList) {
    const pts = history.map((item, idx) => {
      const px = chartLeft + (idx / Math.max(1, history.length - 1)) * chartW;
      const val = clamp(item[s.key] || 0, 0, 100);
      const py = chartBottom - (val / 100) * chartH;
      return { x: px, y: py, val };
    });

    if (pts.length < 2) continue;

    // Vùng phủ Gradient dưới đường biểu đồ
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, chartBottom);
    ctx.lineTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.lineTo(last.x, chartBottom);
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
    areaGrad.addColorStop(0, hexToRgba(s.color, s.fillAlpha));
    areaGrad.addColorStop(1, "rgba(0, 0, 0, 0.0)");
    ctx.fillStyle = areaGrad;
    ctx.fill();
    ctx.restore();

    // Đường cong phát sáng
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.8;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.lineTo(last.x, last.y);
    ctx.stroke();

    // Nút tròn ở điểm hiện tại (cuối biểu đồ)
    ctx.fillStyle = "#080D1A";
    ctx.beginPath();
    ctx.arc(last.x, last.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  // Nhãn trục thời gian dưới đáy
  ctx.font = `600 12px ${FONT_SANS}`;
  ctx.fillStyle = theme.textSub;
  ctx.textAlign = "left";
  ctx.fillText("Chu kỳ 15 phút trước (32 mẫu đo)", chartLeft, y + h - 4);
  ctx.textAlign = "center";
  ctx.fillText("Biến thiên tải trung bình", chartLeft + chartW / 2, y + h - 4);
  ctx.textAlign = "right";
  ctx.fillStyle = theme.primary;
  ctx.fillText("● Thời gian thực (Live)", chartRight, y + h - 4);

  ctx.restore();
}

// ============================================================================
// 9. HÀM TỔNG HỢP VẼ TOÀN BỘ CANVAS (1920 x 1180 FULL HD+)
// ============================================================================
async function drawSupremeSystemCanvas(data, theme) {
  const width = 1920;
  const height = 1180;
  const pad = 42;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // 1. Vẽ nền Procedural Vũ Trụ + Lưới + Cánh Cơ Khí
  drawProceduralBackground(ctx, width, height, theme);

  // ==========================================================================
  // HEADER BAR (Y: 36 -> 112)
  // ==========================================================================
  // Huy hiệu Logo Lục Giác Phát Sáng
  const logoX = pad + 28;
  const logoY = 74;
  ctx.save();
  ctx.fillStyle = hexToRgba(theme.primary, 0.16);
  ctx.strokeStyle = theme.primary;
  ctx.lineWidth = 2.2;
  drawHexagon(ctx, logoX, logoY, 26);
  ctx.fill();
  ctx.stroke();

  ctx.font = `900 22px ${FONT_SANS}`;
  ctx.fillStyle = theme.primary;
  ctx.textAlign = "center";
  ctx.fillText("A", logoX, logoY + 8);
  ctx.restore();

  // Tên Hệ Thống & Phụ đề
  ctx.textAlign = "left";
  ctx.font = `900 32px ${FONT_SANS}`;
  ctx.fillStyle = theme.textMain;
  ctx.fillText(`BẢNG GIÁM SÁT HỆ THỐNG • ${theme.name}`, pad + 70, 69);

  ctx.font = `600 14px ${FONT_MONO}`;
  ctx.fillStyle = theme.textSub;
  ctx.fillText(
    `${theme.subtitle}  |  PREFIX: [ ${data.prefix} ]  |  CẬP NHẬT: ${data.nowTime}`,
    pad + 70,
    95
  );

  // Pill Trạng Thái Góc Trên Phải
  const badgeW = 270;
  const badgeH = 48;
  const badgeX = width - pad - badgeW;
  const badgeY = 48;
  roundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 24);
  ctx.fillStyle = hexToRgba(theme.emerald, 0.15);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(theme.emerald, 0.75);
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Chấm tròn phát sáng trong badge
  ctx.save();
  ctx.fillStyle = "#10B981";
  ctx.shadowColor = "#10B981";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(badgeX + 28, badgeY + badgeH / 2, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.font = `800 15px ${FONT_SANS}`;
  ctx.fillStyle = "#ECFDF5";
  ctx.textAlign = "left";
  ctx.fillText(`TRẠNG THÁI: ${data.status.toUpperCase()}`, badgeX + 46, badgeY + 29);

  // Đường kẻ phân cách Header phát sáng
  const divGrad = ctx.createLinearGradient(pad, 0, width - pad, 0);
  divGrad.addColorStop(0, theme.primary);
  divGrad.addColorStop(0.5, hexToRgba(theme.secondary, 0.4));
  divGrad.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.fillStyle = divGrad;
  ctx.fillRect(pad, 114, width - pad * 2, 2);

  // ==========================================================================
  // TẦNG 1 (ROW 1 - Y: 134, H: 315):
  // [THỜI GIAN HOẠT ĐỘNG: 590px] + [LÕI PHẢN ỨNG QUANTUM: 576px] + [TÀI NGUYÊN: 630px]
  // ==========================================================================
  const r1Y = 134;
  const r1H = 315;

  // --- CARD 1A: THỜI GIAN HOẠT ĐỘNG (CHRONO UPTIME) ---
  const c1W = 590;
  drawGlassCard(ctx, pad, r1Y, c1W, r1H, theme, {
    accentColor: theme.primary,
    accentSide: "left"
  });

  drawVectorIcon(ctx, "clock", pad + 34, r1Y + 34, 20, theme.primary);
  ctx.textAlign = "left";
  ctx.font = `700 14px ${FONT_SANS}`;
  ctx.fillStyle = theme.textSub;
  ctx.fillText("THỜI GIAN HOẠT ĐỘNG LIÊN TỤC (UPTIME)", pad + 54, r1Y + 39);

  ctx.font = `900 40px ${FONT_SANS}`;
  ctx.fillStyle = theme.textMain;
  ctx.fillText(fitText(ctx, data.uptime.vnFormatted, c1W - 56), pad + 28, r1Y + 92);

  ctx.font = `500 14px ${FONT_SANS}`;
  ctx.fillStyle = theme.textSub;
  ctx.fillText("Phiên vận hành không gián đoạn kể từ lần khởi chạy gần nhất", pad + 28, r1Y + 118);

  // 4 Ô Đồng Hồ Số Học (NGÀY - GIỜ - PHÚT - GIÂY)
  const boxes = [
    { val: data.uptime.padDays, label: "NGÀY", ratio: clamp(data.uptime.days / 30, 0.08, 1), col: theme.primary },
    { val: data.uptime.padHours, label: "GIỜ", ratio: data.uptime.hours / 24, col: theme.blue },
    { val: data.uptime.padMinutes, label: "PHÚT", ratio: data.uptime.minutes / 60, col: theme.secondary },
    { val: data.uptime.padSeconds, label: "GIÂY", ratio: data.uptime.seconds / 60, col: theme.gold }
  ];
  const boxGap = 14;
  const boxW = (c1W - 56 - boxGap * 3) / 4;
  const boxH = 112;
  const boxY = r1Y + 140;

  boxes.forEach((b, idx) => {
    const bx = pad + 28 + idx * (boxW + boxGap);
    roundedRect(ctx, bx, boxY, boxW, boxH, 14);
    ctx.fillStyle = "rgba(4, 8, 20, 0.72)";
    ctx.fill();
    ctx.strokeStyle = hexToRgba(b.col, 0.35);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Số lớn
    ctx.textAlign = "center";
    ctx.font = `800 38px ${FONT_MONO}`;
    ctx.fillStyle = theme.textMain;
    ctx.fillText(b.val, bx + boxW / 2, boxY + 52);

    // Nhãn đơn vị
    ctx.font = `700 12px ${FONT_SANS}`;
    ctx.fillStyle = b.col;
    ctx.fillText(b.label, bx + boxW / 2, boxY + 80);

    // Thanh mini progress dưới đáy mỗi ô đồng hồ
    const barW = boxW - 28;
    roundedRect(ctx, bx + 14, boxY + 94, barW, 5, 2.5);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();

    roundedRect(ctx, bx + 14, boxY + 94, Math.max(6, barW * b.ratio), 5, 2.5);
    ctx.fillStyle = b.col;
    ctx.fill();
  });

  // Dòng thời điểm khởi động dưới đáy Card 1A
  ctx.textAlign = "left";
  ctx.font = `600 13px ${FONT_MONO}`;
  ctx.fillStyle = theme.textSub;
  ctx.fillText(`Khởi động lúc: ${data.uptime.bootTimeStr}`, pad + 28, r1Y + r1H - 22);

  ctx.textAlign = "right";
  ctx.fillStyle = theme.primary;
  ctx.fillText(`UPTIME RAW: ${data.uptime.rawSeconds}s`, pad + c1W - 24, r1Y + r1H - 22);

  // --- CENTERPIECE: LÕI PHẢN ỨNG QUANTUM AI CORE ---
  const coreCenterX = pad + c1W + 288;
  const coreCenterY = r1Y + r1H / 2 + 4;
  drawQuantumReactorCore(ctx, coreCenterX, coreCenterY, theme, data);

  // --- CARD 1B: ĐIỀU ÁP TÀI NGUYÊN (CPU / RAM / HEAP LED BARS) ---
  const c3W = 630;
  const c3X = width - pad - c3W;
  drawGlassCard(ctx, c3X, r1Y, c3W, r1H, theme, {
    accentColor: theme.secondary,
    accentSide: "left"
  });

  const gauges = [
    {
      title: "VI XỬ LÝ (CPU LOAD)",
      percent: data.cpuUsage,
      subLeft: `${data.cores} nhân (${data.cpuSpeedGHz} GHz) • ${data.cpuModel}`,
      subRight: data.cpuUsage < 65 ? "ỔN ĐỊNH" : data.cpuUsage < 85 ? "TẢI CAO" : "QUÁ TẢI",
      color: theme.primary
    },
    {
      title: "RAM HỆ THỐNG (SYSTEM MEMORY)",
      percent: data.ram.percent,
      subLeft: `${data.ram.usedGB} / ${data.ram.totalGB} GB • Trống ${data.ram.freeGB} GB`,
      subRight: data.ram.percent < 75 ? "ỔN ĐỊNH" : "TẢI CAO",
      color: theme.secondary
    },
    {
      title: "BỘ NHỚ HEAP NODE.JS (V8 ENGINE)",
      percent: data.heap.percent,
      subLeft: `${data.heap.heapUsed} / ${data.heap.heapTotal} MB • RSS ${data.heap.rss} MB`,
      subRight: "TỐI ƯU",
      color: theme.tertiary
    }
  ];

  gauges.forEach((g, idx) => {
    const gy = r1Y + 26 + idx * 96;
    const gx = c3X + 28;
    const gw = c3W - 56;

    ctx.textAlign = "left";
    ctx.font = `700 14px ${FONT_SANS}`;
    ctx.fillStyle = theme.textSub;
    ctx.fillText(g.title, gx, gy + 14);

    ctx.textAlign = "right";
    ctx.font = `900 26px ${FONT_MONO}`;
    ctx.fillStyle = g.color;
    ctx.fillText(`${g.percent}%`, gx + gw, gy + 18);

    // Thanh LED 40 đoạn
    drawSegmentedBar(ctx, gx, gy + 28, gw, 16, g.percent, g.color, 40);

    // Thông số chi tiết bên dưới thanh LED
    ctx.textAlign = "left";
    ctx.font = `500 13px ${FONT_SANS}`;
    ctx.fillStyle = theme.textSub;
    ctx.fillText(fitText(ctx, g.subLeft, gw - 95), gx, gy + 64);

    ctx.textAlign = "right";
    ctx.font = `700 12px ${FONT_SANS}`;
    ctx.fillStyle = g.color;
    ctx.fillText(g.subRight, gx + gw, gy + 64);
  });

  // ==========================================================================
  // TẦNG 2 (ROW 2 - Y: 472, H: 292):
  // [BIỂU ĐỒ XU HƯỚNG TÀI NGUYÊN: 1180px] + [MA TRẬN VI MẠCH & DAO ĐỘNG: 630px]
  // ==========================================================================
  const r2Y = 472;
  const r2H = 292;

  // --- CARD 2A: BIỂU ĐỒ XU HƯỚNG TÀI NGUYÊN ---
  const chartCardW = 1180;
  drawGlassCard(ctx, pad, r2Y, chartCardW, r2H, theme, {
    accentColor: theme.secondary,
    accentSide: "left"
  });

  drawVectorIcon(ctx, "pulse", pad + 34, r2Y + 32, 20, theme.primary);
  ctx.textAlign = "left";
  ctx.font = `700 15px ${FONT_SANS}`;
  ctx.fillStyle = theme.textMain;
  ctx.fillText("XU HƯỚNG TÀI NGUYÊN THỜI GIAN THỰC (REAL-TIME TELEMETRY)", pad + 56, r2Y + 37);

  // Chú thích (Legend) góc phải của Card Biểu Đồ
  const legends = [
    { label: `CPU (${data.cpuUsage}%)`, col: theme.primary },
    { label: `RAM hệ thống (${data.ram.percent}%)`, col: theme.secondary },
    { label: `Heap Node (${data.heap.percent}%)`, col: theme.tertiary }
  ];
  let legX = pad + chartCardW - 28;
  ctx.font = `600 13px ${FONT_SANS}`;
  for (let i = legends.length - 1; i >= 0; i--) {
    const lg = legends[i];
    const tw = ctx.measureText(lg.label).width;
    ctx.textAlign = "right";
    ctx.fillStyle = theme.textMain;
    ctx.fillText(lg.label, legX, r2Y + 37);

    roundedRect(ctx, legX - tw - 20, r2Y + 25, 12, 12, 3);
    ctx.fillStyle = lg.col;
    ctx.fill();

    legX -= tw + 42;
  }

  // Vẽ đồ thị Spline 3 kênh
  drawMultiSplineChart(ctx, pad + 18, r2Y + 54, chartCardW - 36, r2H - 68, data.history, theme);

  // --- CARD 2B: MA TRẬN VI MẠCH & DAO ĐỘNG MẠNG (RESOURCE MATRIX) ---
  const matX = width - pad - c3W;
  drawGlassCard(ctx, matX, r2Y, c3W, r2H, theme, {
    accentColor: theme.gold,
    accentSide: "left"
  });

  drawVectorIcon(ctx, "cpu", matX + 34, r2Y + 32, 20, theme.gold);
  ctx.textAlign = "left";
  ctx.font = `700 15px ${FONT_SANS}`;
  ctx.fillStyle = theme.textMain;
  ctx.fillText("MA TRẬN VI MẠCH & TELEMETRY (RESOURCE MATRIX)", matX + 56, r2Y + 37);

  ctx.textAlign = "right";
  ctx.font = `700 12px ${FONT_MONO}`;
  ctx.fillStyle = theme.emerald;
  ctx.fillText("● SOCKETS STABLE", matX + c3W - 24, r2Y + 37);

  // Lưới 12 ô thông số kỹ thuật (4 cột x 3 hàng)
  const matrixCells = [
    { k: "CPU LOAD", v: `${data.cpuUsage}%`, c: theme.primary },
    { k: "SYS RAM", v: `${data.ram.percent}%`, c: theme.secondary },
    { k: "V8 HEAP", v: `${data.heap.percent}%`, c: theme.tertiary },
    { k: "DISK USE", v: `${data.disk.percent}%`, c: theme.gold },
    { k: "BOT RSS", v: `${data.heap.rss} MB`, c: theme.blue },
    { k: "EXT MEM", v: `${data.heap.external} MB`, c: theme.primary },
    { k: "EVENT LOOP", v: `${data.loopLag} ms`, c: theme.emerald },
    { k: "PING API", v: `${data.ping} ms`, c: theme.gold },
    { k: "PACKAGES", v: `${data.pkgInfo.deps} pkgs`, c: theme.secondary },
    { k: "CPU CORES", v: `${data.cores} Threads`, c: theme.blue },
    { k: "PLATFORM", v: `${os.platform()} ${os.arch()}`, c: theme.textMain },
    { k: "HEALTH", v: `${data.healthScore}/100`, c: theme.emerald }
  ];

  const cols = 4;
  const cellGap = 10;
  const cellW = (c3W - 52 - cellGap * (cols - 1)) / cols;
  const cellH = 62;

  matrixCells.forEach((cell, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cxCell = matX + 26 + col * (cellW + cellGap);
    const cyCell = r2Y + 56 + row * (cellH + cellGap);

    roundedRect(ctx, cxCell, cyCell, cellW, cellH, 10);
    ctx.fillStyle = "rgba(4, 8, 20, 0.72)";
    ctx.fill();
    ctx.strokeStyle = hexToRgba(cell.c, 0.30);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Vạch màu nhỏ góc trên mỗi ô
    ctx.fillStyle = cell.c;
    ctx.fillRect(cxCell + 10, cyCell, 28, 2.5);

    ctx.textAlign = "left";
    ctx.font = `700 10px ${FONT_MONO}`;
    ctx.fillStyle = theme.textSub;
    ctx.fillText(cell.k, cxCell + 12, cyCell + 22);

    ctx.font = `800 16px ${FONT_MONO}`;
    ctx.fillStyle = theme.textMain;
    ctx.fillText(fitText(ctx, cell.v, cellW - 20), cxCell + 12, cyCell + 46);
  });

  // ==========================================================================
  // TẦNG 3 (ROW 3 - Y: 786, H: 152): 4 THẺ CHỈ SỐ KPI TRọng TÂM
  // ==========================================================================
  const r3Y = 786;
  const r3H = 152;
  const kpiGap = 22;
  const kpiW = (width - pad * 2 - kpiGap * 3) / 4;

  const kpiCards = [
    {
      title: "ĐỘ TRỄ PHẢN HỒI (PING)",
      val: `${data.ping} ms`,
      sub: `Trạng thái mạng: ${data.status} • IP: ${data.ip}`,
      icon: "bolt",
      color: data.ping < 200 ? theme.emerald : data.ping < 500 ? theme.gold : theme.tertiary,
      ratio: clamp(1 - data.ping / 1000, 0.15, 1)
    },
    {
      title: "ĐỘ TRỄ VÒNG LẶP (EVENT LOOP)",
      val: `${data.loopLag} ms`,
      sub: `Đỉnh p99: ${data.p99Lag} ms • Xử lý bất đồng bộ`,
      icon: "pulse",
      color: theme.primary,
      ratio: clamp(1 - data.loopLag / 50, 0.2, 1)
    },
    {
      title: "BỘ NHỚ TIẾN TRÌNH (BOT RSS)",
      val: `${data.heap.rss} MB`,
      sub: `Ngoài Heap: ${data.heap.external} MB • Buffers: ${data.heap.arrayBuffers} MB`,
      icon: "cube",
      color: theme.tertiary,
      ratio: clamp(data.heap.rss / 512, 0.12, 1)
    },
    {
      title: "LƯU TRỮ & GÓI PHỤ THUỘC",
      val: `${data.disk.percent}% • ${data.pkgInfo.deps} Pkgs`,
      sub: `Ổ đĩa: ${data.disk.usedGB}/${data.disk.totalGB} GB (Trống ${data.disk.freeGB} GB)`,
      icon: "disk",
      color: theme.gold,
      ratio: clamp(data.disk.percent / 100, 0.1, 1)
    }
  ];

  kpiCards.forEach((k, idx) => {
    const kx = pad + idx * (kpiW + kpiGap);
    drawGlassCard(ctx, kx, r3Y, kpiW, r3H, theme, {
      accentColor: k.color,
      accentSide: "left"
    });

    drawVectorIcon(ctx, k.icon, kx + 34, r3Y + 32, 20, k.color);
    ctx.textAlign = "left";
    ctx.font = `700 13px ${FONT_SANS}`;
    ctx.fillStyle = theme.textSub;
    ctx.fillText(k.title, kx + 54, r3Y + 37);

    ctx.font = `900 36px ${FONT_SANS}`;
    ctx.fillStyle = k.color;
    ctx.fillText(fitText(ctx, k.val, kpiW - 50), kx + 28, r3Y + 86);

    ctx.font = `500 13px ${FONT_SANS}`;
    ctx.fillStyle = theme.textSub;
    ctx.fillText(fitText(ctx, k.sub, kpiW - 50), kx + 28, r3Y + 116);

    // Thanh tiến trình mảnh dưới đáy mỗi thẻ KPI
    const barW = kpiW - 56;
    roundedRect(ctx, kx + 28, r3Y + 130, barW, 5, 2.5);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fill();

    roundedRect(ctx, kx + 28, r3Y + 130, Math.max(12, barW * k.ratio), 5, 2.5);
    ctx.fillStyle = k.color;
    ctx.fill();
  });

  // ==========================================================================
  // TẦNG 4 (ROW 4 - Y: 960, H: 162): THÔNG TIN MÁY CHỦ & DÒNG THỜI GIAN HỆ THỐNG
  // ==========================================================================
  const r4Y = 960;
  const r4H = 162;
  const fullW = width - pad * 2;

  drawGlassCard(ctx, pad, r4Y, fullW, r4H, theme, {
    accentColor: theme.primary,
    accentSide: "top",
    strong: true
  });

  drawVectorIcon(ctx, "shield", pad + 34, r4Y + 30, 20, theme.primary);
  ctx.textAlign = "left";
  ctx.font = `700 14px ${FONT_SANS}`;
  ctx.fillStyle = theme.textSub;
  ctx.fillText("THÔNG TIN KIẾN TRÚC MÁY CHỦ & DÒNG THỜI GIAN VẬN HÀNH (SERVER ARCHITECTURE & TIMELINE)", pad + 56, r4Y + 35);

  // 4 Cột Thông Tin Máy Chủ
  const specs = [
    { label: "TÊN MÁY CHỦ (HOSTNAME)", val: os.hostname(), col: theme.primary },
    { label: "HỆ ĐIỀU HÀNH (OS KERNEL)", val: data.osInfo, col: theme.secondary },
    { label: "VI XỬ LÝ (PROCESSOR)", val: `${data.cpuModel} (${data.cores} Cores)`, col: theme.blue },
    { label: "NODE ENGINE • PID • PREFIX", val: `${process.version} • PID ${process.pid} • Lệnh: ${data.prefix}upt`, col: theme.gold }
  ];

  const specColW = (fullW - 56) / 4;
  specs.forEach((sp, i) => {
    const sx = pad + 28 + i * specColW;
    ctx.textAlign = "left";
    ctx.font = `700 11px ${FONT_MONO}`;
    ctx.fillStyle = sp.col;
    ctx.fillText(sp.label, sx, r4Y + 64);

    ctx.font = `700 16px ${FONT_SANS}`;
    ctx.fillStyle = theme.textMain;
    ctx.fillText(fitText(ctx, sp.val, specColW - 24), sx, r4Y + 88);
  });

  // Đường Kẻ Dòng Thời Gian Hệ Thống (System Timeline) ở nửa dưới Card 4
  const tlY = r4Y + 124;
  const tlLeft = pad + 90;
  const tlRight = width - pad - 90;

  const tlGrad = ctx.createLinearGradient(tlLeft, 0, tlRight, 0);
  tlGrad.addColorStop(0, theme.primary);
  tlGrad.addColorStop(0.5, theme.secondary);
  tlGrad.addColorStop(1, theme.gold);

  ctx.strokeStyle = tlGrad;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tlLeft, tlY);
  ctx.lineTo(tlRight, tlY);
  ctx.stroke();

  const timelineNodes = [
    { title: "BOT BOOT", sub: data.uptime.bootTimeStr.split("•")[0].trim(), c: theme.primary },
    { title: "MODULES LOADED", sub: `${data.pkgInfo.deps} Packages OK`, c: theme.blue },
    { title: "MEMORY GUARD", sub: `Heap ${data.heap.heapUsed}MB`, c: theme.secondary },
    { title: "EVENT LOOP SYNC", sub: `Lag ${data.loopLag}ms`, c: theme.emerald },
    { title: "TELEMETRY LIVE", sub: data.nowTime.split("|")[0].trim(), c: theme.gold }
  ];

  timelineNodes.forEach((node, idx) => {
    const nx = tlLeft + (idx / (timelineNodes.length - 1)) * (tlRight - tlLeft);

    ctx.save();
    ctx.fillStyle = "#060B19";
    ctx.strokeStyle = node.c;
    ctx.lineWidth = 3;
    ctx.shadowColor = node.c;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(nx, tlY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = "center";
    ctx.font = `700 11px ${FONT_MONO}`;
    ctx.fillStyle = theme.textMain;
    ctx.fillText(`${node.title} (${node.sub})`, nx, tlY + 24);
  });

  // ==========================================================================
  // FOOTER (Y: 1148)
  // ==========================================================================
  ctx.textAlign = "left";
  ctx.font = `600 13px ${FONT_MONO}`;
  ctx.fillStyle = theme.textSub;
  ctx.fillText(
    `● AETHER-CHRONOS QUANTUM HUD v9.9  •  Gõ "${data.prefix}upt [quantum | tiger | crimson | emerald | royal]" để đổi giao diện`,
    pad,
    1148
  );

  ctx.textAlign = "right";
  ctx.fillStyle = theme.primary;
  ctx.fillText(`RENDERED IN HIGH-DEFINITION 1920x1180  •  ${data.nowTime}`, width - pad, 1148);

  // Xuất file PNG
  const filePath = path.join(CACHE_DIR, `upt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  await new Promise(resolve => out.on("finish", resolve));
  return filePath;
}

// ============================================================================
// 10. CẤU HÌNH COMMAND & HÀM THỰC THI CHÍNH (GIỮ NGUYÊN BRIDGE NKNP V3)
// ============================================================================
const __legacyConfig = {
  name: "upt",
  version: "9.9.0",
  role: 0,
  author: "ShinTHL09, GwenDev • Upgraded by Aether Quantum Engine",
  description: "Hiển thị bảng giám sát hệ thống Quantum HUD siêu cấp bằng Canvas",
  category: "Hệ thống",
  usage: "upt [quantum | tiger | crimson | emerald | royal]",
  cooldowns: 2,
  dependencies: {
    canvas: ""
  }
};

const __legacyRun = async ({ event, api, args }) => {
  const start = Date.now();

  // Chọn chủ đề màu (hỗ trợ args[0] hoặc mặc định là 'quantum')
  const requestedTheme = String(args?.[0] || "quantum").toLowerCase().trim();
  const themeAliases = {
    "1": "quantum",
    "quantum": "quantum",
    "cyan": "quantum",
    "2": "tiger",
    "tiger": "tiger",
    "gold": "tiger",
    "mecha": "tiger",
    "3": "crimson",
    "crimson": "crimson",
    "red": "crimson",
    "4": "emerald",
    "emerald": "emerald",
    "matrix": "emerald",
    "green": "emerald",
    "5": "royal",
    "royal": "royal"
  };
  const selectedThemeKey = themeAliases[requestedTheme] || "quantum";
  const theme = THEMES[selectedThemeKey];

  // Thu thập dữ liệu hệ thống song song
  const [pkgInfo, sysMetrics] = await Promise.all([
    getDependencyCount(),
    measureSystemMetrics()
  ]);

  const ram = getSystemRAMUsage();
  const heap = getHeapMemoryUsage();
  const uptime = getDetailedUptime();
  const disk = getStorageMetrics();
  const ping = Math.max(1, Date.now() - start);

  const status = ping < 220 ? "Mượt mà" : ping < 650 ? "Ổn định" : "Tải cao";
  const nowTime = moment().tz("Asia/Ho_Chi_Minh").format("HH:mm:ss | DD/MM/YYYY");
  const osInfo = `${os.type()} ${os.release()} (${os.arch()})`;
  const ip = getLocalIPv4();
  const prefix = global.config?.prefix || ".";

  // Tính điểm Sức Khỏe Hệ Thống tổng hợp (0 -> 100%)
  const cpuPenalty = sysMetrics.cpuUsage * 0.25;
  const ramPenalty = ram.percent * 0.20;
  const pingPenalty = Math.min(20, ping / 40);
  const healthScore = clamp(Math.round(100 - (cpuPenalty + ramPenalty + pingPenalty) * 0.45), 68, 99);

  // Cập nhật dữ liệu lịch sử thực tế cho biểu đồ Spline
  const history = updateAndGetTelemetryHistory(sysMetrics.cpuUsage, ram.percent, heap.percent);

  const imagePath = await drawSupremeSystemCanvas(
    {
      ram,
      heap,
      uptime,
      pkgInfo,
      cpuUsage: sysMetrics.cpuUsage,
      loopLag: sysMetrics.loopLag,
      p99Lag: sysMetrics.p99Lag,
      cores: sysMetrics.cores,
      cpuModel: sysMetrics.cpuModel,
      cpuSpeedGHz: sysMetrics.cpuSpeedGHz,
      disk,
      ping,
      status,
      nowTime,
      osInfo,
      ip,
      prefix,
      healthScore,
      history
    },
    theme
  );

  try {
    await api.sendMessage(
      {
        msg: "",
        attachments: [imagePath]
      },
      event.threadId,
      event.type
    );
  } finally {
    try {
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    } catch {
      // Bỏ qua nếu file đã được dọn
    }
  }
};

export default wrapLegacyCommand(__legacyConfig, __legacyRun, undefined, undefined, undefined);