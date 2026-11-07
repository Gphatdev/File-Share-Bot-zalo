import fs from "fs";
import os from "os";
import path from "path";
import axios from "axios";
import { createCanvas, loadImage } from "canvas";

// ============================================================================
// 1. CẤU HÌNH CHỦ ĐỀ MODULE (PHONG CÁCH SCI-FI MECHA HUD ĐỘC QUYỀN)
// ============================================================================
const MODULE_THEMES = {
  admin: { title: "QUẢN TRỊ VIÊN", code: "ADM-01", color: "#00f5d4", secondary: "#00bbf9", glow: "rgba(0, 245, 212, 0.16)" },
  chongpha: { title: "LÁ CHẮN PHÒNG VỆ", code: "SEC-02", color: "#ff4d6d", secondary: "#ff758f", glow: "rgba(255, 77, 109, 0.16)" },
  giaitri: { title: "GIẢI TRÍ & MINIGAME", code: "GAM-03", color: "#fee440", secondary: "#f15bb5", glow: "rgba(254, 228, 64, 0.16)" },
  game: { title: "GIẢI TRÍ & MINIGAME", code: "GAM-03", color: "#fee440", secondary: "#f15bb5", glow: "rgba(254, 228, 64, 0.16)" },
  congcu: { title: "CÔNG CỤ XỬ LÝ", code: "TLS-04", color: "#00bbf9", secondary: "#3a86ff", glow: "rgba(0, 187, 249, 0.16)" },
  tool: { title: "CÔNG CỤ XỬ LÝ", code: "TLS-04", color: "#00bbf9", secondary: "#3a86ff", glow: "rgba(0, 187, 249, 0.16)" },
  hanhdong: { title: "TƯƠNG TÁC CẢM XÚC", code: "ACT-05", color: "#ff9e00", secondary: "#ff007f", glow: "rgba(255, 158, 0, 0.16)" },
  action: { title: "TƯƠNG TÁC CẢM XÚC", code: "ACT-05", color: "#ff9e00", secondary: "#ff007f", glow: "rgba(255, 158, 0, 0.16)" },
  hethong: { title: "LÕI HỆ THỐNG", code: "SYS-06", color: "#7209b7", secondary: "#4cc9f0", glow: "rgba(76, 201, 240, 0.16)" },
  system: { title: "LÕI HỆ THỐNG", code: "SYS-06", color: "#4cc9f0", secondary: "#7209b7", glow: "rgba(76, 201, 240, 0.16)" },
  tienich: { title: "TIỆN ÍCH MỞ RỘNG", code: "UTL-07", color: "#b5179e", secondary: "#f72585", glow: "rgba(247, 37, 133, 0.16)" },
  utility: { title: "TIỆN ÍCH MỞ RỘNG", code: "UTL-07", color: "#f72585", secondary: "#b5179e", glow: "rgba(247, 37, 133, 0.16)" },
  love: { title: "KẾT NỐI TÌNH YÊU", code: "LUV-08", color: "#ff5d8f", secondary: "#ff8fa3", glow: "rgba(255, 93, 143, 0.16)" },
  tinhdiem: { title: "TÍNH ĐIỂM & BXH", code: "RNK-09", color: "#a855f7", secondary: "#ec4899", glow: "rgba(168, 85, 247, 0.16)" },
  video: { title: "ĐA PHƯƠNG TIỆN", code: "MED-10", color: "#10b981", secondary: "#06b6d4", glow: "rgba(16, 185, 129, 0.16)" },
  general: { title: "PHÂN KHU CHUNG", code: "GEN-00", color: "#38bdf8", secondary: "#818cf8", glow: "rgba(56, 189, 248, 0.16)" },
};

function getModuleTheme(groupKey, index = 0) {
  const normalized = String(groupKey || "general")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  if (MODULE_THEMES[normalized]) return MODULE_THEMES[normalized];

  const palette = [
    { color: "#00f5d4", secondary: "#00bbf9", glow: "rgba(0, 245, 212, 0.16)" },
    { color: "#f72585", secondary: "#7209b7", glow: "rgba(247, 37, 133, 0.16)" },
    { color: "#fee440", secondary: "#ff9e00", glow: "rgba(254, 228, 64, 0.16)" },
    { color: "#4cc9f0", secondary: "#4361ee", glow: "rgba(76, 201, 240, 0.16)" },
  ];
  const pick = palette[index % palette.length];
  const title = String(groupKey || "CHUNG").toUpperCase();
  const prefixCode = title.replace(/[^A-Z0-9]/g, "").slice(0, 3).padEnd(3, "X");

  return {
    title,
    code: `${prefixCode}-${String(index + 1).padStart(2, "0")}`,
    ...pick,
  };
}

function getRoleStyle(role) {
  if (role >= 2) return { color: "#ff2a5f", label: "ADMIN BOT", tag: "R2" };
  if (role === 1) return { color: "#ffbe0b", label: "QUẢN TRỊ VIÊN", tag: "R1" };
  return { color: "#00f5d4", label: "THÀNH VIÊN", tag: "R0" };
}

// ============================================================================
// 2. HỆ THỐNG LẤY CHUẨN AVATAR ZALO THẬT & LOGO BOT ZALO (CHỐNG NHẦM ẢNH BÌA)
// ============================================================================
function cleanZaloName(rawName) {
  if (!rawName) return "";
  const cleaned = String(rawName)
    .replace(/[\u{1D400}-\u{1D7FF}\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\uFFFD]/gu, "")
    .trim();
  return cleaned || String(rawName).trim();
}

function parseZaloProfileObject(rawObj, targetId = null) {
  if (!rawObj || typeof rawObj !== "object") return { avatar: null, name: null };

  let avatar = null;
  let name = null;

  // Danh sách các nhánh chuẩn của zca-jsKhi gọi getUserInfo / fetchAccountInfo
  const profileBuckets = [
    rawObj?.changed_profiles,
    rawObj?.unchanged_profiles,
    rawObj?.profiles,
    rawObj?.data?.changed_profiles,
    rawObj?.data?.unchanged_profiles,
    rawObj?.data?.profiles,
    rawObj?.data,
    rawObj?.profile,
    rawObj,
  ].filter((b) => b && typeof b === "object");

  const inspectSingleProfile = (p) => {
    if (!p || typeof p !== "object") return;
    // Ưu tiên tuyệt đối trường avatar chính gốc (tránh lấy nhầm bgavatar hoặc cover)
    const avaCandidate =
      p.avatar ||
      p.avatarUrl ||
      p.ava ||
      p.thumb ||
      p.thumbUrl ||
      p.picture ||
      p.photo;

    if (!avatar && typeof avaCandidate === "string" && /^https?:\/\//i.test(avaCandidate)) {
      avatar = avaCandidate.trim();
    }

    const nameCandidate =
      p.displayName ||
      p.zaloName ||
      p.dName ||
      p.name ||
      p.username ||
      p.fullName;

    if (!name && typeof nameCandidate === "string" && nameCandidate.trim() && !/^\d+$/.test(nameCandidate.trim())) {
      name = nameCandidate.trim();
    }
  };

  for (const bucket of profileBuckets) {
    if (targetId) {
      const cleanId = String(targetId).split("_")[0];
      if (bucket[targetId]) inspectSingleProfile(bucket[targetId]);
      if (bucket[cleanId]) inspectSingleProfile(bucket[cleanId]);
      if (bucket[`${cleanId}_0`]) inspectSingleProfile(bucket[`${cleanId}_0`]);
    }
    inspectSingleProfile(bucket);
    for (const val of Object.values(bucket)) {
      if (val && typeof val === "object") inspectSingleProfile(val);
    }
  }

  // Nếu vẫn chưa tìm thấy, quét sâu các khoá có tên chính xác là "avatar"
  if (!avatar) {
    const deepFindAvatar = (obj, depth = 0) => {
      if (!obj || typeof obj !== "object" || depth > 5 || avatar) return;
      for (const [k, v] of Object.entries(obj)) {
        const key = k.toLowerCase();
        if (
          typeof v === "string" &&
          /^https?:\/\//i.test(v) &&
          (key === "avatar" || key === "avatarurl" || key === "thumb" || v.includes("-ava-"))
        ) {
          avatar = v.trim();
          return;
        }
        if (typeof v === "object") deepFindAvatar(v, depth + 1);
      }
    };
    deepFindAvatar(rawObj);
  }

  return { avatar, name };
}

async function queryUserInfoFromAdapter(adapter, uid) {
  if (!uid) return { avatar: null, name: null };
  const cleanUid = String(uid).split("_")[0];

  const instances = [
    adapter,
    adapter?.api,
    adapter?.client,
    adapter?.zalo,
    adapter?.bot,
    global?.api,
    global?.zaloApi,
  ].filter(Boolean);

  const methodNames = ["getUserInfo", "fetchUserInfo", "getUserProfile", "getProfile"];

  for (const inst of instances) {
    for (const method of methodNames) {
      if (typeof inst[method] !== "function") continue;
      for (const arg of [cleanUid, [cleanUid], String(uid)]) {
        try {
          const res = await inst[method](arg);
          const parsed = parseZaloProfileObject(res, cleanUid);
          if (parsed.avatar || parsed.name) return parsed;
        } catch {
          // Tiếp tục thử cấu hình tham số tiếp theo
        }
      }
    }
  }

  return { avatar: null, name: null };
}

async function resolveZaloIdentities(adapter, message, config) {
  // 1. Xác định UID người dùng gọi lệnh
  const senderId =
    message?.data?.uidFrom ||
    message?.senderId ||
    message?.uidFrom ||
    message?.authorId ||
    message?.userId ||
    message?.sender?.id ||
    "";

  let userName =
    message?.data?.dName ||
    message?.senderName ||
    message?.pushName ||
    message?.authorName ||
    null;

  let userAvatarUrl =
    message?.data?.avatar ||
    message?.senderAvatar ||
    message?.avatar ||
    null;

  if (senderId && (!userAvatarUrl || !userName)) {
    const fromApi = await queryUserInfoFromAdapter(adapter, senderId);
    if (!userAvatarUrl && fromApi.avatar) userAvatarUrl = fromApi.avatar;
    if (!userName && fromApi.name) userName = fromApi.name;
  }

  // 2. Xác định đúng Logo / Avatar của Bot Zalo (Không lấy chồng chéo với User)
  let botAvatarUrl =
    config?.botAvatar ||
    config?.logo ||
    config?.avatarUrl ||
    adapter?.botAvatar ||
    null;

  let botId =
    config?.botId ||
    adapter?.botId ||
    adapter?.ownId ||
    adapter?.uid ||
    null;

  const instances = [adapter, adapter?.api, adapter?.client, adapter?.zalo, global?.api].filter(Boolean);

  if (!botAvatarUrl) {
    for (const inst of instances) {
      try {
        if (!botId) {
          if (typeof inst.getOwnId === "function") botId = await inst.getOwnId();
          else if (typeof inst.getCurrentUserId === "function") botId = await inst.getCurrentUserId();
          else if (inst.ownId || inst.uid) botId = inst.ownId || inst.uid;
        }

        if (typeof inst.fetchAccountInfo === "function") {
          const accInfo = await inst.fetchAccountInfo();
          const parsedAcc = parseZaloProfileObject(accInfo, botId);
          if (parsedAcc.avatar) {
            botAvatarUrl = parsedAcc.avatar;
            break;
          }
        }
      } catch {
        // Bỏ qua nếu hàm không khả dụng
      }
    }
  }

  if (!botAvatarUrl && botId) {
    const botProfile = await queryUserInfoFromAdapter(adapter, botId);
    if (botProfile.avatar) botAvatarUrl = botProfile.avatar;
  }

  return {
    senderId: String(senderId || "N/A").slice(-8),
    userName: cleanZaloName(userName || "Thành Viên Zalo"),
    userAvatarUrl: userAvatarUrl || null,
    botAvatarUrl: botAvatarUrl || null, // Giữ nguyên null nếu không có để vẽ Vector Logo Zalo chuẩn
  };
}

async function downloadZaloImage(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 7000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Referer: "https://chat.zalo.me/",
        Origin: "https://chat.zalo.me",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    return await loadImage(Buffer.from(response.data));
  } catch {
    return null;
  }
}

// ============================================================================
// 3. THƯ VIỆN ĐỒ HỌA VECTOR SCI-FI HUD & LOGO ZALO CHÍNH HÃNG
// ============================================================================
function drawRoundRect(ctx, x, y, w, h, r, fill = null, stroke = null, lineWidth = 1.5) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

// Vẽ khung vát góc kiểu Mecha / Cyberpunk HUD (Khác biệt hoàn toàn với khung bo tròn cũ)
function drawChamferCard(ctx, x, y, w, h, cutTopLeft = 18, cutBottomRight = 22, fill = null, stroke = null, lineWidth = 1.5) {
  ctx.beginPath();
  ctx.moveTo(x + cutTopLeft, y);
  ctx.lineTo(x + w - 10, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + 10);
  ctx.lineTo(x + w, y + h - cutBottomRight);
  ctx.lineTo(x + w - cutBottomRight, y + h);
  ctx.lineTo(x + 10, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - 10);
  ctx.lineTo(x, y + cutTopLeft);
  ctx.closePath();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

// Vẽ góc ngắm công nghệ (Corner HUD Brackets)
function drawHudCornerBrackets(ctx, x, y, w, h, color, size = 14, thickness = 2.5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;

  // Góc trên phải
  ctx.beginPath();
  ctx.moveTo(x + w - size, y - 1);
  ctx.lineTo(x + w + 1, y - 1);
  ctx.lineTo(x + w + 1, y + size);
  ctx.stroke();

  // Góc dưới trái
  ctx.beginPath();
  ctx.moveTo(x - 1, y + h - size);
  ctx.lineTo(x - 1, y + h + 1);
  ctx.lineTo(x + size, y + h + 1);
  ctx.stroke();
  ctx.restore();
}

// Vẽ Vector Logo Zalo Chính Hãng sắc nét (Dùng cho huy hiệu Zalo & Logo Bot)
function drawOfficialZaloVectorLogo(ctx, x, y, size) {
  ctx.save();
  const r = size * 0.26;

  // Nền xanh Zalo chuẩn (#0068FF -> #0091FF)
  const zGrad = ctx.createLinearGradient(x, y, x + size, y + size);
  zGrad.addColorStop(0, "#005be0");
  zGrad.addColorStop(0.5, "#0068ff");
  zGrad.addColorStop(1, "#00a2ff");
  drawRoundRect(ctx, x, y, size, size, r, zGrad, "#60a5fa", 1.5);

  // Bong bóng thoại trắng bên trong
  const cx = x + size * 0.5;
  const cy = y + size * 0.48;
  const rx = size * 0.37;
  const ry = size * 0.31;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Đuôi bong bóng thoại góc dưới trái
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.55, cy + ry * 0.55);
  ctx.lineTo(x + size * 0.14, y + size * 0.84);
  ctx.lineTo(cx - rx * 0.05, cy + ry * 0.82);
  ctx.closePath();
  ctx.fill();

  // Chữ "Zalo" chuẩn nhận diện thương hiệu
  ctx.fillStyle = "#0068ff";
  ctx.font = `900 ${Math.floor(size * 0.26)}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Zalo", cx, cy + 1);
  ctx.restore();
}

// Vẽ nền Vũ Trụ + Lưới Tổ Ong Lục Giác + Tia Laser HUD
function drawHyperionBackground(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#04060e");
  bg.addColorStop(0.4, "#080d1a");
  bg.addColorStop(0.8, "#0a1124");
  bg.addColorStop(1, "#050814");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Quầng sáng Nebula đa tầng
  const nebula1 = ctx.createRadialGradient(260, 260, 20, 260, 260, 620);
  nebula1.addColorStop(0, "rgba(0, 245, 212, 0.13)");
  nebula1.addColorStop(0.5, "rgba(0, 187, 249, 0.05)");
  nebula1.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = nebula1;
  ctx.fillRect(0, 0, width, height);

  const nebula2 = ctx.createRadialGradient(width - 280, 220, 20, width - 280, 220, 580);
  nebula2.addColorStop(0, "rgba(247, 37, 133, 0.11)");
  nebula2.addColorStop(0.5, "rgba(114, 9, 183, 0.05)");
  nebula2.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = nebula2;
  ctx.fillRect(0, 0, width, height);

  const nebula3 = ctx.createRadialGradient(width * 0.6, height - 200, 20, width * 0.6, height - 200, 600);
  nebula3.addColorStop(0, "rgba(0, 187, 249, 0.10)");
  nebula3.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = nebula3;
  ctx.fillRect(0, 0, width, height);

  // Vẽ họa tiết Lục Giác Tổ Ong (Hexagon Matrix) chìm
  ctx.save();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.028)";
  ctx.lineWidth = 1;
  const hexR = 28;
  const hexH = Math.sqrt(3) * hexR;
  for (let row = 0; row < height / hexH + 2; row++) {
    for (let col = 0; col < width / (hexR * 1.5) + 2; col++) {
      const cx = col * hexR * 1.5;
      const cy = row * hexH + (col % 2 === 1 ? hexH / 2 : 0);
      ctx.beginPath();
      for (let s = 0; s < 6; s++) {
        const angle = (Math.PI / 3) * s;
        const hx = cx + hexR * Math.cos(angle);
        const hy = cy + hexR * Math.sin(angle);
        if (s === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();

  // Khung viền HUD ngoài cùng của toàn bộ bức ảnh
  ctx.save();
  ctx.strokeStyle = "rgba(0, 245, 212, 0.22)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(14, 14, width - 28, height - 28);
  drawHudCornerBrackets(ctx, 14, 14, width - 28, height - 28, "#00f5d4", 24, 3);
  ctx.restore();
}

// Vẽ Avatar Người Dùng với Vòng Quỹ Đạo Cyber (Orbital Holo-Ring)
function drawOrbitalAvatar(ctx, img, cx, cy, radius, fallbackName) {
  ctx.save();

  // Vòng quỹ đạo nét đứt ngoài cùng
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 16, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0, 245, 212, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2 cung tròn phát sáng đối xứng
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 10, -Math.PI * 0.35, Math.PI * 0.35);
  ctx.strokeStyle = "#00f5d4";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius + 10, Math.PI * 0.65, Math.PI * 1.35);
  ctx.strokeStyle = "#f72585";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Vòng tròn viền Gradient sát Avatar
  const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  ringGrad.addColorStop(0, "#00f5d4");
  ringGrad.addColorStop(0.5, "#00bbf9");
  ringGrad.addColorStop(1, "#f72585");
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.fillStyle = ringGrad;
  ctx.fill();

  // Cắt tròn và vẽ ảnh Avatar Zalo thật
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (img) {
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    const fbGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    fbGrad.addColorStop(0, "#0f172a");
    fbGrad.addColorStop(1, "#1e3a8a");
    ctx.fillStyle = fbGrad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    ctx.fillStyle = "#00f5d4";
    ctx.font = `900 ${Math.floor(radius * 0.85)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(fallbackName || "U").charAt(0).toUpperCase(), cx, cy);
  }
  ctx.restore();

  // Gắn huy hiệu Logo Zalo Chính Hãng nhỏ ở góc dưới phải của Avatar
  const badgeSize = 32;
  drawOfficialZaloVectorLogo(ctx, cx + radius * 0.55 - 4, cy + radius * 0.55 - 4, badgeSize);

  ctx.restore();
}

// ============================================================================
// 4. THÔNG SỐ HỆ THỐNG THỜI GIAN THỰC (REAL-TIME HARDWARE TELEMETRY)
// ============================================================================
function getSystemTelemetry() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramPercent = Math.min(99, Math.max(5, Math.round((usedMem / totalMem) * 100)));
  const usedGb = (usedMem / 1024 ** 3).toFixed(1);
  const totalGb = (totalMem / 1024 ** 3).toFixed(1);

  const upSec = Math.floor(process.uptime());
  const hrs = Math.floor(upSec / 3600);
  const mins = Math.floor((upSec % 3600) / 60);
  const secs = upSec % 60;
  const uptimeStr = `${String(hrs).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;

  const cpuCores = os.cpus()?.length || 4;
  const heapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const pad = (n) => String(n).padStart(2, "0");
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const days = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const hour = now.getHours();
  let greeting = "CHÀO BUỔI TỐI";
  if (hour >= 5 && hour < 11) greeting = "CHÀO BUỔI SÁNG";
  else if (hour >= 11 && hour < 14) greeting = "CHÀO BUỔI TRƯA";
  else if (hour >= 14 && hour < 18) greeting = "CHÀO BUỔI CHIỀU";

  return {
    ramPercent,
    ramText: `${usedGb}GB / ${totalGb}GB`,
    uptimeStr,
    cpuCores,
    heapMb,
    timeStr,
    dateStr,
    dayName: days[now.getDay()],
    greeting,
  };
}

function truncateText(ctx, text, maxWidth) {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 0 && ctx.measureText(clipped + "...").width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return clipped + "...";
}

// ============================================================================
// 5. BỘ VẼ CHÍNH: HYPERION HUD OS (SIDEBAR TRÁI + MA TRẬN LỆNH PHẢI)
// ============================================================================
async function renderHyperionHelpDashboard({
  botName = "HNNP STUDIO",
  prefix = ".",
  commands,
  userName = "Thành Viên",
  senderId = "000000",
  userAvatarUrl = null,
  botAvatarUrl = null,
  adminCount = 3,
  threadType = "group",
  showDescriptions = false,
}) {
  const width = 1660;
  const pad = 34;
  const sidebarW = 390;
  const mainGap = 26;
  const mainX = pad + sidebarW + mainGap;
  const mainW = width - mainX - pad; // 1176px

  const numCols = showDescriptions ? 2 : 3;
  const colGap = 20;
  const colWidth = Math.floor((mainW - colGap * (numCols - 1)) / numCols);

  // Gom nhóm lệnh
  const grouped = new Map();
  for (const cmd of commands.values()) {
    const gKey = cmd.group || "general";
    if (!grouped.has(gKey)) grouped.set(gKey, []);
    grouped.get(gKey).push(cmd);
  }

  const groupList = [];
  let idx = 0;
  for (const [groupKey, cmdList] of grouped.entries()) {
    cmdList.sort((a, b) => a.name.localeCompare(b.name));
    groupList.push({
      groupKey,
      theme: getModuleTheme(groupKey, idx++),
      commands: cmdList,
    });
  }

  // Đo đạc kích thước các nút lệnh (Keycaps)
  const tempCanvas = createCanvas(10, 10);
  const mCtx = tempCanvas.getContext("2d");
  const cardPadX = 18;
  const cardHeaderH = 68;
  const cardBottomPad = 18;

  for (const group of groupList) {
    group.layoutItems = [];

    if (showDescriptions) {
      // Chế độ .help all (Hiển thị kèm mô tả từng lệnh)
      const rowH = 44;
      const rowGap = 8;
      let curY = cardHeaderH;

      for (const cmd of group.commands) {
        const roleStyle = getRoleStyle(cmd.role ?? 0);
        group.layoutItems.push({
          label: `${prefix}${cmd.name}`,
          desc: cmd.description || "Chưa có mô tả",
          x: cardPadX,
          y: curY,
          w: colWidth - cardPadX * 2,
          h: rowH,
          roleStyle,
          isDetailedRow: true,
        });
        curY += rowH + rowGap;
      }
      group.cardHeight = curY - rowGap + cardBottomPad;
    } else {
      // Chế độ Tactical Keycap Grid
      mCtx.font = 'bold 14.5px "Segoe UI", Arial, sans-serif';
      const chipH = 36;
      const chipGapX = 8;
      const chipGapY = 9;
      let curX = cardPadX;
      let curY = cardHeaderH;
      const maxRowW = colWidth - cardPadX;

      for (const cmd of group.commands) {
        const label = `${prefix}${cmd.name}`;
        const roleStyle = getRoleStyle(cmd.role ?? 0);
        const textW = mCtx.measureText(label).width;
        const badgeExtra = (cmd.role ?? 0) > 0 ? 28 : 0;
        const chipW = Math.min(colWidth - cardPadX * 2, Math.ceil(textW + 30 + badgeExtra));

        if (curX + chipW > maxRowW && curX > cardPadX) {
          curX = cardPadX;
          curY += chipH + chipGapY;
        }

        group.layoutItems.push({
          label,
          x: curX,
          y: curY,
          w: chipW,
          h: chipH,
          roleStyle,
          hasRoleBadge: (cmd.role ?? 0) > 0,
        });

        curX += chipW + chipGapX;
      }
      group.cardHeight = curY + chipH + cardBottomPad;
    }
  }

  // Phân bổ các Module vào cột thấp nhất
  const colHeights = Array(numCols).fill(0);
  const cardGapY = 20;

  for (const group of groupList) {
    let minCol = 0;
    for (let c = 1; c < numCols; c++) {
      if (colHeights[c] < colHeights[minCol]) minCol = c;
    }
    group.x = mainX + minCol * (colWidth + colGap);
    group.y = colHeights[minCol];
    colHeights[minCol] += group.cardHeight + cardGapY;
  }

  const topHudY = pad;
  const topHudH = 104;
  const cardsStartY = topHudY + topHudH + 22;
  const maxRightH = Math.max(...colHeights, 620);
  const footerH = 56;
  const minSidebarTotalH = 920;
  const contentBottomY = Math.max(cardsStartY + maxRightH, pad + minSidebarTotalH);
  const footerY = contentBottomY + 12;
  const totalHeight = footerY + footerH + pad;

  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext("2d");

  // 1. VẼ NỀN HYPERION MATRIX
  drawHyperionBackground(ctx, width, totalHeight);

  const telemetry = getSystemTelemetry();
  const [userImg, botImg] = await Promise.all([
    downloadZaloImage(userAvatarUrl),
    downloadZaloImage(botAvatarUrl),
  ]);

  // ==========================================================================
  // 2. VẼ CỘT ĐIỀU KHIỂN BÊN TRÁI (LEFT COMMAND SIDEBAR DOCK - ĐỘC QUYỀN)
  // ==========================================================================
  const sideX = pad;
  const sideY = pad;
  const sideH = contentBottomY - pad - 8;

  drawChamferCard(
    ctx,
    sideX,
    sideY,
    sidebarW,
    sideH,
    24,
    24,
    "rgba(10, 17, 34, 0.90)",
    "rgba(0, 245, 212, 0.35)",
    1.8
  );
  drawHudCornerBrackets(ctx, sideX, sideY, sidebarW, sideH, "#00f5d4", 18, 2.5);

  // Header nhỏ trên đỉnh Sidebar
  drawRoundRect(ctx, sideX + 20, sideY + 18, sidebarW - 40, 30, 8, "rgba(0, 245, 212, 0.1)", "rgba(0, 245, 212, 0.3)", 1);
  ctx.fillStyle = "#00f5d4";
  ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`◈ ZALO USER IDENTITY // ${telemetry.greeting}`, sideX + sidebarW / 2, sideY + 33);

  // Vòng Avatar Zalo thật của Người Dùng
  const avaCenterX = sideX + sidebarW / 2;
  const avaCenterY = sideY + 132;
  drawOrbitalAvatar(ctx, userImg, avaCenterX, avaCenterY, 58, userName);

  // Tên Zalo thật của Người Dùng
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
  ctx.fillText(truncateText(ctx, userName, sidebarW - 44), avaCenterX, sideY + 236);

  // Tag UID & Chế độ phòng chat
  const modeLabel = threadType === "group" ? "NHÓM CHAT ZALO" : "TRÒ CHUYỆN RIÊNG";
  const subBadgeText = `ID: #${senderId}  •  ${modeLabel}`;
  ctx.font = 'bold 12.5px "Segoe UI", Arial, sans-serif';
  const subW = Math.min(sidebarW - 48, ctx.measureText(subBadgeText).width + 28);
  drawRoundRect(ctx, avaCenterX - subW / 2, sideY + 250, subW, 26, 13, "rgba(0, 187, 249, 0.14)", "rgba(0, 187, 249, 0.4)", 1);
  ctx.fillStyle = "#38bdf8";
  ctx.textBaseline = "middle";
  ctx.fillText(subBadgeText, avaCenterX, sideY + 263);

  // --- KHỐI THƯƠNG HIỆU BOT ZALO & PREFIX REACTOR ---
  const botCardY = sideY + 296;
  const botCardH = 148;
  drawChamferCard(
    ctx,
    sideX + 20,
    botCardY,
    sidebarW - 40,
    botCardH,
    14,
    14,
    "rgba(16, 26, 50, 0.92)",
    "rgba(247, 37, 133, 0.4)",
    1.4
  );

  // Hiển thị Avatar Bot thật (nếu lấy được) hoặc Vector Logo Zalo Chính Hãng sắc nét
  const botLogoX = sideX + 38;
  const botLogoY = botCardY + 20;
  const botLogoSize = 62;

  if (botImg) {
    ctx.save();
    drawRoundRect(ctx, botLogoX, botLogoY, botLogoSize, botLogoSize, 16, null, "#f72585", 2);
    ctx.clip();
    ctx.drawImage(botImg, botLogoX, botLogoY, botLogoSize, botLogoSize);
    ctx.restore();
    // Đính kèm huy hiệu Zalo Vector góc dưới phải của Logo Bot
    drawOfficialZaloVectorLogo(ctx, botLogoX + 42, botLogoY + 42, 24);
  } else {
    drawOfficialZaloVectorLogo(ctx, botLogoX, botLogoY, botLogoSize);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f72585";
  ctx.font = 'bold 11.5px "Segoe UI", Arial, sans-serif';
  ctx.fillText("OFFICIAL ZALO BOT CORE", botLogoX + 76, botCardY + 34);

  ctx.fillStyle = "#ffffff";
  ctx.font = 'bold 21px "Segoe UI", Arial, sans-serif';
  ctx.fillText(truncateText(ctx, String(botName).toUpperCase(), sidebarW - 145), botLogoX + 76, botCardY + 60);

  ctx.fillStyle = "#94a3b8";
  ctx.font = 'bold 12.5px "Segoe UI", Arial, sans-serif';
  ctx.fillText("👑 DEV: GIAPHAT DEV • VER 5.0", botLogoX + 76, botCardY + 80);

  // Thanh Prefix Reactor nổi bật
  const pBoxY = botCardY + 98;
  const pGrad = ctx.createLinearGradient(sideX + 36, pBoxY, sideX + sidebarW - 36, pBoxY);
  pGrad.addColorStop(0, "rgba(247, 37, 133, 0.22)");
  pGrad.addColorStop(1, "rgba(0, 187, 249, 0.22)");
  drawRoundRect(ctx, sideX + 36, pBoxY, sidebarW - 72, 34, 9, pGrad, "rgba(255, 255, 255, 0.18)", 1);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`⚡ DẤU LỆNH (PREFIX):  [  ${prefix}  ]`, avaCenterX, pBoxY + 17);

  // --- KHỐI ĐO LƯỜNG PHẦN CỨNG THỜI GIAN THỰC (LIVE TELEMETRY) ---
  const teleY = botCardY + botCardH + 20;
  const teleH = 190;
  drawRoundRect(
    ctx,
    sideX + 20,
    teleY,
    sidebarW - 40,
    teleH,
    16,
    "rgba(14, 23, 43, 0.9)",
    "rgba(56, 189, 248, 0.25)",
    1.2
  );

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#00bbf9";
  ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
  ctx.fillText("📡 THÔNG SỐ MÁY CHỦ THỜI GIAN THỰC", sideX + 36, teleY + 28);

  const gauges = [
    {
      label: "BỘ NHỚ RAM HỆ THỐNG",
      valText: `${telemetry.ramPercent}% (${telemetry.ramText})`,
      ratio: telemetry.ramPercent / 100,
      c1: "#00f5d4",
      c2: "#00bbf9",
    },
    {
      label: "THỜI GIAN HOẠT ĐỘNG (UPTIME)",
      valText: telemetry.uptimeStr,
      ratio: 0.88,
      c1: "#f72585",
      c2: "#ff9e00",
    },
    {
      label: `XỬ LÝ NODEJS (${telemetry.cpuCores} CORES)`,
      valText: `Heap: ${telemetry.heapMb} MB • Online`,
      ratio: Math.min(0.95, Math.max(0.25, telemetry.heapMb / 512)),
      c1: "#a855f7",
      c2: "#38bdf8",
    },
  ];

  let gy = teleY + 52;
  for (const g of gauges) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#cbd5e1";
    ctx.font = 'bold 11.5px "Segoe UI", Arial, sans-serif';
    ctx.fillText(g.label, sideX + 36, gy);

    ctx.textAlign = "right";
    ctx.fillStyle = g.c1;
    ctx.fillText(g.valText, sideX + sidebarW - 36, gy);

    // Thanh tiến trình (Progress Bar)
    const barW = sidebarW - 72;
    drawRoundRect(ctx, sideX + 36, gy + 7, barW, 9, 4.5, "rgba(255, 255, 255, 0.08)", null);

    const fillW = Math.max(14, Math.floor(barW * g.ratio));
    const barGrad = ctx.createLinearGradient(sideX + 36, gy + 7, sideX + 36 + fillW, gy + 7);
    barGrad.addColorStop(0, g.c1);
    barGrad.addColorStop(1, g.c2);
    drawRoundRect(ctx, sideX + 36, gy + 7, fillW, 9, 4.5, barGrad, null);

    gy += 46;
  }

  // --- KHỐI PHÂN QUYỀN TRUY CẬP (ACCESS CLEARANCE MATRIX) ---
  const roleBoxY = teleY + teleH + 20;
  const roleBoxH = sideY + sideH - roleBoxY - 20;
  drawRoundRect(
    ctx,
    sideX + 20,
    roleBoxY,
    sidebarW - 40,
    roleBoxH,
    16,
    "rgba(14, 23, 43, 0.9)",
    "rgba(255, 255, 255, 0.1)",
    1
  );

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fee440";
  ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
  ctx.fillText("🔐 CẤP ĐỘ PHÂN QUYỀN LỆNH (ROLE)", sideX + 36, roleBoxY + 28);

  const rolesInfo = [
    { tag: "R0", name: "Mọi Thành Viên", desc: "Sử dụng tự do trong nhóm", color: "#00f5d4" },
    { tag: "R1", name: "Quản Trị Viên Nhóm", desc: "Dành cho QTV Box & Admin", color: "#ffbe0b" },
    { tag: "R2", name: "Admin Điều Hành Bot", desc: `Giới hạn ${adminCount} Admin hệ thống`, color: "#ff2a5f" },
  ];

  let ry = roleBoxY + 42;
  for (const rItem of rolesInfo) {
    drawRoundRect(
      ctx,
      sideX + 34,
      ry,
      sidebarW - 68,
      46,
      10,
      "rgba(23, 35, 62, 0.85)",
      "rgba(255, 255, 255, 0.06)",
      1
    );

    drawRoundRect(ctx, sideX + 44, ry + 9, 38, 28, 7, rItem.color, null);
    ctx.fillStyle = "#04060e";
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(rItem.tag, sideX + 63, ry + 23);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.fillText(rItem.name, sideX + 94, ry + 21);

    ctx.fillStyle = "#94a3b8";
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    ctx.fillText(rItem.desc, sideX + 94, ry + 38);

    ry += 54;
  }

  // ==========================================================================
  // 3. VẼ THANH HUD HEADER & 4 THẺ KPI GÓC PHẢI TRÊN
  // ==========================================================================
  drawChamferCard(
    ctx,
    mainX,
    topHudY,
    mainW,
    topHudH,
    20,
    20,
    "rgba(10, 17, 34, 0.90)",
    "rgba(0, 187, 249, 0.35)",
    1.6
  );

  // Tiêu đề trung tâm bên trái của Main Header
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#00f5d4";
  ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
  ctx.fillText("⚡ HYPERION COMMAND OS // GIAO DIỆN ĐỘC QUYỀN", mainX + 26, topHudY + 34);

  ctx.fillStyle = "#ffffff";
  ctx.font = '900 30px "Segoe UI", Arial, sans-serif';
  ctx.fillText("BẢNG ĐIỀU KHIỂN LỆNH", mainX + 26, topHudY + 70);

  ctx.fillStyle = "#94a3b8";
  ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`🕒 ${telemetry.timeStr}  •  ${telemetry.dayName}, ${telemetry.dateStr}`, mainX + 26, topHudY + 91);

  // 4 Hộp KPI Thống Kê vát góc bên phải Header
  const kpiList = [
    { val: String(commands.size), label: "TỔNG LỆNH", color: "#00f5d4" },
    { val: String(groupList.length), label: "PHÂN KHU", color: "#00bbf9" },
    { val: String(adminCount), label: "ADMIN BOT", color: "#ff2a5f" },
    { val: String(prefix), label: "PREFIX", color: "#fee440" },
  ];

  const kpiW = 148;
  const kpiH = 72;
  const kpiGap = 14;
  const kpiStartX = mainX + mainW - 22 - (kpiW * kpiList.length + kpiGap * (kpiList.length - 1));

  kpiList.forEach((kpi, i) => {
    const kx = kpiStartX + i * (kpiW + kpiGap);
    const ky = topHudY + 16;

    drawChamferCard(
      ctx,
      kx,
      ky,
      kpiW,
      kpiH,
      12,
      12,
      "rgba(18, 29, 54, 0.95)",
      kpi.color,
      1.3
    );

    // Thanh sáng nhỏ bên trái ô KPI
    drawRoundRect(ctx, kx + 10, ky + 14, 4, kpiH - 28, 2, kpi.color, null);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 26px "Segoe UI", Arial, sans-serif';
    ctx.fillText(kpi.val, kx + 24, ky + 40);

    ctx.fillStyle = kpi.color;
    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    ctx.fillText(kpi.label, kx + 24, ky + 59);
  });

  // ==========================================================================
  // 4. VẼ MA TRẬN CÁC MODULE LỆNH (CHAMFERED MECHA CARDS)
  // ==========================================================================
  const totalCmdCount = Math.max(1, commands.size);

  for (const group of groupList) {
    const gx = group.x;
    const gy = cardsStartY + group.y;
    const gw = colWidth;
    const gh = group.cardHeight;
    const { theme } = group;

    // Khung vát góc Sci-Fi cho từng nhóm
    drawChamferCard(
      ctx,
      gx,
      gy,
      gw,
      gh,
      18,
      20,
      "rgba(11, 19, 37, 0.92)",
      "rgba(255, 255, 255, 0.1)",
      1.2
    );

    // Dải sáng Header của thẻ
    const hGrad = ctx.createLinearGradient(gx, gy, gx + gw, gy);
    hGrad.addColorStop(0, theme.glow);
    hGrad.addColorStop(1, "rgba(11, 19, 37, 0.1)");
    drawChamferCard(ctx, gx + 2, gy + 2, gw - 4, 52, 16, 4, hGrad, null);

    // Cặp ngoặc góc ngắm HUD màu Neon theo từng nhóm
    drawHudCornerBrackets(ctx, gx, gy, gw, gh, theme.color, 14, 2);

    // Huy hiệu Mã Phân Khu (VD: ADM-01, GAM-03)
    const tagX = gx + 18;
    const tagY = gy + 14;
    const tagGrad = ctx.createLinearGradient(tagX, tagY, tagX + 64, tagY + 28);
    tagGrad.addColorStop(0, theme.color);
    tagGrad.addColorStop(1, theme.secondary);
    drawRoundRect(ctx, tagX, tagY, 64, 26, 6, tagGrad, null);

    ctx.fillStyle = "#04060e";
    ctx.font = '900 11.5px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(theme.code, tagX + 32, tagY + 13);

    // Tên nhóm lệnh
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 16.5px "Segoe UI", Arial, sans-serif';
    ctx.fillText(truncateText(ctx, theme.title, gw - 180), tagX + 74, tagY + 13.5);

    // Huy hiệu số lệnh + % tỷ trọng góc phải
    const pct = Math.round((group.commands.length / totalCmdCount) * 100);
    const statLabel = `${group.commands.length} lệnh • ${pct}%`;
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    const sW = ctx.measureText(statLabel).width + 20;
    const sX = gx + gw - 16 - sW;
    drawRoundRect(ctx, sX, tagY + 1, sW, 24, 12, "rgba(4, 6, 14, 0.75)", theme.color, 1);

    ctx.fillStyle = theme.color;
    ctx.textAlign = "center";
    ctx.fillText(statLabel, sX + sW / 2, tagY + 13.5);

    // Đường kẻ mảnh phân cách Header và danh sách lệnh
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx + 18, gy + 52);
    ctx.lineTo(gx + gw - 18, gy + 52);
    ctx.stroke();

    // Vẽ từng nút lệnh (Keycaps hoặc Detailed Row)
    for (const item of group.layoutItems) {
      const ix = gx + item.x;
      const iy = gy + item.y;

      if (item.isDetailedRow) {
        drawRoundRect(
          ctx,
          ix,
          iy,
          item.w,
          item.h,
          9,
          "rgba(20, 32, 58, 0.92)",
          "rgba(255, 255, 255, 0.08)",
          1
        );
        drawRoundRect(ctx, ix + 6, iy + 8, 4, item.h - 16, 2, item.roleStyle.color, null);

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#00f5d4";
        ctx.font = 'bold 14.5px "Segoe UI", Arial, sans-serif';
        ctx.fillText(item.label, ix + 18, iy + item.h / 2);

        const cmdW = ctx.measureText(item.label).width;
        ctx.fillStyle = "#cbd5e1";
        ctx.font = '13px "Segoe UI", Arial, sans-serif';
        ctx.fillText(
          truncateText(ctx, `— ${item.desc}`, item.w - cmdW - 36),
          ix + 26 + cmdW,
          iy + item.h / 2
        );
      } else {
        // Bóng đổ 3D phía dưới Keycap
        drawRoundRect(ctx, ix, iy + 2, item.w, item.h, 8, "rgba(0, 0, 0, 0.45)", null);

        // Thân Keycap
        drawRoundRect(
          ctx,
          ix,
          iy,
          item.w,
          item.h,
          8,
          "rgba(22, 34, 62, 0.96)",
          "rgba(148, 163, 184, 0.16)",
          1
        );

        // Thanh năng lượng phân quyền bên trái Keycap
        drawRoundRect(ctx, ix + 6, iy + 8, 3.5, item.h - 16, 1.5, item.roleStyle.color, null);

        // Tên lệnh
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#f8fafc";
        ctx.font = 'bold 14.5px "Segoe UI", Arial, sans-serif';
        ctx.fillText(item.label, ix + 16, iy + item.h / 2 + 0.5);

        // Nếu lệnh yêu cầu quyền QTV (R1) hoặc Admin (R2) thì hiện tag nhỏ trên nút
        if (item.hasRoleBadge) {
          const bW = 22;
          const bH = 16;
          const bX = ix + item.w - bW - 7;
          const bY = iy + (item.h - bH) / 2;
          drawRoundRect(ctx, bX, bY, bW, bH, 4, item.roleStyle.color, null);

          ctx.fillStyle = "#04060e";
          ctx.font = '900 10px "Segoe UI", Arial, sans-serif';
          ctx.textAlign = "center";
          ctx.fillText(item.roleStyle.tag, bX + bW / 2, bY + bH / 2 + 0.5);
        }
      }
    }
  }

  // ==========================================================================
  // 5. THANH FOOTER HƯỚNG DẪN TƯƠNG TÁC TOÀN HỆ THỐNG
  // ==========================================================================
  drawChamferCard(
    ctx,
    pad,
    footerY,
    width - pad * 2,
    footerH,
    14,
    14,
    "rgba(10, 17, 34, 0.92)",
    "rgba(0, 245, 212, 0.3)",
    1.4
  );

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e2e8f0";
  ctx.font = 'bold 14.5px "Segoe UI", Arial, sans-serif';
  ctx.fillText(
    `💡 CÚ PHÁP ĐIỀU KHIỂN:   ${prefix}help <tên lệnh> (Bản vẽ chi tiết lệnh)   •   ${prefix}help <tên nhóm> (Lọc phân khu)   •   ${prefix}help all (Hiển thị kèm mô tả)`,
    width / 2,
    footerY + footerH / 2
  );

  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const outputPath = path.join(tempDir, `help_hyperion_${Date.now()}.png`);
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  return outputPath;
}

// ============================================================================
// 6. BẢN VẼ HOLOGRAM CHI TIẾT LỆNH (.help <tên lệnh>)
// ============================================================================
async function renderHyperionCommandBlueprint({
  botName = "HNNP STUDIO",
  prefix = ".",
  command,
  userName = "Thành Viên",
  userAvatarUrl = null,
  botAvatarUrl = null,
}) {
  const width = 1020;
  const height = 520;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawHyperionBackground(ctx, width, height);

  const theme = getModuleTheme(command.group, 0);
  const roleStyle = getRoleStyle(command.role ?? 0);

  drawChamferCard(ctx, 32, 32, width - 64, height - 64, 24, 24, "rgba(10, 17, 34, 0.92)", theme.color, 2);
  drawHudCornerBrackets(ctx, 32, 32, width - 64, height - 64, "#00f5d4", 20, 3);

  const [userImg, botImg] = await Promise.all([
    downloadZaloImage(userAvatarUrl),
    downloadZaloImage(botAvatarUrl),
  ]);

  // Vẽ Avatar người tra cứu bên phải
  drawOrbitalAvatar(ctx, userImg || botImg, width - 135, 125, 48, userName);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = theme.color;
  ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`⚡ HOLOGRAM BLUEPRINT // PHÂN KHU [${theme.code}] ${theme.title}`, 68, 78);

  ctx.fillStyle = "#ffffff";
  ctx.font = '900 46px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`${prefix}${command.name}`, 68, 134);

  // Badge Quyền Hạn
  drawRoundRect(ctx, 68, 150, 210, 30, 8, roleStyle.color, null);
  ctx.fillStyle = "#04060e";
  ctx.font = '900 13px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`QUYỀN HẠN: ${roleStyle.label} (${roleStyle.tag})`, 173, 165);

  const aliases = command.aliases?.length
    ? command.aliases.map((a) => `${prefix}${a}`).join(", ")
    : "Không có tên gọi tắt";

  const rows = [
    { key: "MÔ TẢ CHỨC NĂNG", val: command.description || "Chưa có mô tả chi tiết cho lệnh này" },
    { key: "CÚ PHÁP SỬ DỤNG", val: `${prefix}${command.name} ${command.usage || ""}`.trim() },
    { key: "LỆNH VIẾT TẮT (ALIASES)", val: aliases },
    { key: "THỜI GIAN HỒI (COOLDOWN)", val: `${command.cooldown ?? 3} giây / lần gọi` },
    { key: "NGƯỜI YÊU CẦU TRA CỨU", val: `${userName}  •  Hệ thống ${botName}` },
  ];

  let ry = 202;
  for (const r of rows) {
    drawChamferCard(
      ctx,
      68,
      ry,
      width - 136,
      46,
      10,
      10,
      "rgba(20, 32, 58, 0.88)",
      "rgba(255, 255, 255, 0.08)",
      1
    );
    drawRoundRect(ctx, 76, ry + 10, 4, 26, 2, theme.color, null);

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#38bdf8";
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.fillText(r.key, 92, ry + 23);

    ctx.fillStyle = "#f8fafc";
    ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
    ctx.fillText(truncateText(ctx, String(r.val), width - 430), 310, ry + 23);

    ry += 54;
  }

  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const outputPath = path.join(tempDir, `help_blueprint_${Date.now()}.png`);
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
  return outputPath;
}

// ============================================================================
// 7. LOGIC ĐIỀU PHỐI LỆNH HELP CHÍNH
// ============================================================================
function findCommand(commands, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  return (
    commands.get(normalizedQuery) ||
    [...commands.values()].find((command) =>
      command.aliases?.some((alias) => alias.toLowerCase() === normalizedQuery)
    )
  );
}

function filterCommandsByGroup(commands, groupQuery) {
  const q = String(groupQuery || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const filtered = new Map();
  for (const [k, cmd] of commands.entries()) {
    const rawGroup = String(cmd.group || "general");
    const normGroup = rawGroup
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const themeTitle = getModuleTheme(rawGroup)
      .title.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (normGroup === q || normGroup.includes(q) || themeTitle.includes(q)) {
      filtered.set(k, cmd);
    }
  }
  return filtered;
}

async function sendTextFallback(adapter, threadId, threadType, text) {
  await adapter.sendText({ threadId, threadType, text });
}

function buildHelpCaption(prefix, userName) {
  return (
    `🤖 HỆ THỐNG HELP HNNP STUDIO\n` +
    `👤 Người gọi lệnh: ${userName}\n` +
    `📌 Prefix: ${prefix}\n` +
    `👑 Author: GIAPHAT DEV\n` +
    `💗 Cảm Ơn Bạn Đã Sử Dụng Dịch Vụ`
  );
}

export default {
  name: "help",
  description: "Hiển thị bảng điều khiển lệnh Hyperion HUD OS độc quyền",
  version: "5.0.0",
  author: "GIAPHAT DEV",
  group: "system",
  role: 0,
  cooldown: 3,
  aliases: ["h", "menu"],
  noPrefix: false,

  async run({ adapter, message, args, commands, config }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const prefix = config?.botPrefix || ".";
    const botName = config?.botName || "HNNP STUDIO";
    const adminCount = Array.isArray(config?.adminIds || config?.admins)
      ? (config.adminIds || config.admins).length
      : 3;

    const query = args.join(" ").trim();
    const isAllMode = query.toLowerCase() === "all";

    // Lấy chuẩn xác Avatar + Tên Zalo thật của người gọi & Logo Bot Zalo
    const { senderId, userName, userAvatarUrl, botAvatarUrl } = await resolveZaloIdentities(
      adapter,
      message,
      config
    );

    if (query && !isAllMode) {
      // 1. Kiểm tra nếu người dùng tra cứu chi tiết 1 lệnh (.help <tên lệnh>)
      const command = findCommand(commands, args[0]);
      if (command) {
        let imagePath = null;
        try {
          imagePath = await renderHyperionCommandBlueprint({
            botName,
            prefix,
            command,
            userName,
            userAvatarUrl,
            botAvatarUrl,
          });
          await adapter.sendImage({
            threadId,
            threadType,
            imagePath,
            message: { text: buildHelpCaption(prefix, userName) },
          });
        } catch {
          await sendTextFallback(
            adapter,
            threadId,
            threadType,
            `📖 ${prefix}${command.name}\n${command.description || "Chưa có mô tả"}\n` +
              `🔐 Quyền yêu cầu: ${command.role}\n⏱️ Thời gian chờ: ${command.cooldown}s`
          );
        } finally {
          if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        }
        return;
      }

      // 2. Kiểm tra nếu người dùng lọc theo nhóm (.help <tên nhóm>)
      const groupCommands = filterCommandsByGroup(commands, query);
      if (groupCommands.size > 0) {
        let imagePath = null;
        try {
          imagePath = await renderHyperionHelpDashboard({
            botName,
            prefix,
            commands: groupCommands,
            userName,
            senderId,
            userAvatarUrl,
            botAvatarUrl,
            adminCount,
            threadType,
            showDescriptions: false,
          });
          await adapter.sendImage({
            threadId,
            threadType,
            imagePath,
            message: { text: buildHelpCaption(prefix, userName) },
          });
        } catch {
          await sendTextFallback(
            adapter,
            threadId,
            threadType,
            `❌ Không thể kết xuất bảng lệnh cho nhóm "${query}".`
          );
        } finally {
          if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        }
        return;
      }

      await sendTextFallback(
        adapter,
        threadId,
        threadType,
        `🔎 Không tìm thấy lệnh hoặc phân khu "${query}". Gõ ${prefix}help để mở bảng điều khiển.`
      );
      return;
    }

    // 3. Hiển thị toàn bộ hệ thống Hyperion HUD OS (.help hoặc .help all)
    let imagePath = null;
    try {
      imagePath = await renderHyperionHelpDashboard({
        botName,
        prefix,
        commands,
        userName,
        senderId,
        userAvatarUrl,
        botAvatarUrl,
        adminCount,
        threadType,
        showDescriptions: isAllMode,
      });
      await adapter.sendImage({
        threadId,
        threadType,
        imagePath,
        message: { text: buildHelpCaption(prefix, userName) },
      });
    } catch (error) {
      console.error("Lỗi vẽ ảnh Help Hyperion:", error);
      const grouped = new Map();
      for (const command of commands.values()) {
        const groupName = command.group || "general";
        if (!grouped.has(groupName)) grouped.set(groupName, []);
        grouped.get(groupName).push(command.name);
      }

      const lines = [`📋 Danh sách command của ${botName}\n⌨️ Prefix: ${prefix}`];
      for (const [groupName, names] of [...grouped.entries()].sort()) {
        lines.push(`\n• ${groupName}: ${names.sort().join(", ")}`);
      }
      lines.push(`\n💡 Dùng ${prefix}help <tên lệnh> để xem chi tiết.`);
      await sendTextFallback(adapter, threadId, threadType, lines.join(""));
    } finally {
      if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }
  },
};