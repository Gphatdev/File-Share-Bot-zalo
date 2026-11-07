/**
 * LIMIT PRO — 10 tổ hợp chức năng + ánh xạ lệnh thực tế.
 * Phân loại theo CHỨC NĂNG (bảng COMMAND_CATEGORY, khóa = tên lệnh chính trong registry).
 * Lệnh mới/chưa có trong bảng: thử suy từ metadata `group` (METADATA_FALLBACK); không suy được → "chưa phân loại"
 * (KHÔNG bị khóa theo nhóm, nhưng vẫn BLOCK riêng được).
 */

export const CATEGORIES = [
  { id: "giaitri",  label: "GIẢI TRÍ",      desc: "Trò chơi & hoạt động giải trí (Pokémon, Câu cá, Oản tù tì, Tài xỉu, Bầu cua…)", color: "#ff4fd8" },
  { id: "admin",    label: "ADMIN",         desc: "Quản trị bot, phân quyền, điều khiển",                                   color: "#ff5a5a" },
  { id: "tinhdiem", label: "TÍNH ĐIỂM",     desc: "Tính điểm, chấm điểm, scrim và tiện ích điểm số",                        color: "#ffc533" },
  { id: "anti",     label: "ANTI",          desc: "Chống spam, chống phá nhóm, kiểm soát tin nhắn & thành viên",            color: "#ff8a3d" },
  { id: "kinhte",   label: "KINH TẾ",       desc: "Tiền game, ngân hàng, cửa hàng, giao dịch, tài sản",                      color: "#3ddc84" },
  { id: "ai",       label: "AI",            desc: "Trò chuyện AI, hỏi đáp, trí tuệ nhân tạo",                                color: "#a78bfa" },
  { id: "dapt",     label: "ĐA PHƯƠNG TIỆN", desc: "Âm nhạc, video, hình ảnh, tải & xử lý nội dung",                         color: "#38bdf8" },
  { id: "qlnhom",   label: "QUẢN LÝ NHÓM",  desc: "Thành viên, thông tin nhóm, quản lý hội thoại nhóm",                      color: "#2dd4bf" },
  { id: "hethong",  label: "HỆ THỐNG",      desc: "RENT, kích hoạt key, thời hạn thuê, cấu hình, trạng thái, vận hành bot",  color: "#60a5fa" },
  { id: "tienich",  label: "TIỆN ÍCH",      desc: "Các chức năng hữu ích khác",                                              color: "#e2e8f0" },
];

const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/** tên lệnh chính (registry) → id nhóm */
const COMMAND_CATEGORY = {
  // GIẢI TRÍ
  pokemon: "giaitri", cauca: "giaitri", work: "giaitri", nongtrai: "giaitri", ott: "giaitri", taixiu: "giaitri", tx: "giaitri", bcua: "giaitri",
  baicao: "giaitri", xd: "giaitri", tutien: "giaitri", hoso: "giaitri", ghepdoi: "giaitri", hon: "giaitri", tile: "giaitri",
  // ADMIN
  admin: "admin", limit: "admin", command: "admin", adc: "admin", capnhom: "admin", setting: "admin",
  // TÍNH ĐIỂM
  td: "tinhdiem", tdlg: "tinhdiem", key: "tinhdiem", lineup: "tinhdiem", boxscrim: "tinhdiem", profile: "tinhdiem", hs: "tinhdiem", luotdung: "tinhdiem",
  // ANTI
  anti: "anti", badword: "anti", canhcao: "anti",
  // KINH TẾ
  money: "kinhte", pay: "kinhte", daily: "kinhte", setmoney: "kinhte", napthe: "kinhte", vbank: "kinhte", shop: "kinhte",
  balo: "kinhte", bank2: "kinhte", qr: "kinhte", qrnew: "kinhte", stk: "kinhte",
  // AI
  gpt: "ai", ai: "ai",
  // ĐA PHƯƠNG TIỆN
  girl: "dapt", girltt: "dapt", vdgirl: "dapt", autodown: "dapt", scl: "dapt",
  // QUẢN LÝ NHÓM
  adduser: "qlnhom", kick: "qlnhom", kickall: "qlnhom", out: "qlnhom", qtvonly: "qlnhom", boxinfo: "qlnhom",
  groupinfo: "qlnhom", eventlog: "qlnhom", goodbye: "qlnhom", tt: "qlnhom", autosend: "qlnhom",
  // HỆ THỐNG
  rent: "hethong", load: "hethong", restart: "hethong", rst: "hethong", reloadconfig: "hethong", setprefix: "hethong",
  help: "hethong", menu: "hethong", ping: "hethong", upt: "hethong", id: "hethong",
  // TIỆN ÍCH
  cdm: "tienich", fbin4: "tienich", itik: "tienich", sendcard: "tienich", qrheart: "tienich", checkff: "tienich",
};

/** metadata `group` (đã chuẩn hóa) → id nhóm; chỉ dùng cho lệnh CHƯA có trong COMMAND_CATEGORY */
const METADATA_FALLBACK = {
  "giai tri": "giaitri", game: "giaitri", admin: "admin", "tinh diem": "tinhdiem", anti: "anti",
  "kinh te": "kinhte", "kiem tien": "kinhte", ai: "ai", "da phuong tien": "dapt", media: "dapt",
  nhom: "qlnhom", group: "qlnhom", "he thong": "hethong", system: "hethong",
  "tien ich": "tienich", utility: "tienich",
  // "moderation", "general", "khac"... mơ hồ → để chưa phân loại
};

/** tên nhóm người dùng có thể gõ → id (gồm tên cũ của LIMIT v1: system, game, moderation…) */
const NAME_ALIASES = {
  giaitri: ["giaitri", "giai tri", "giải trí", "game", "games", "entertainment"],
  admin: ["admin", "quantri", "quản trị"],
  tinhdiem: ["tinhdiem", "tinh diem", "tính điểm", "diem", "scrim"],
  anti: ["anti", "moderation", "kiemsoat"],
  kinhte: ["kinhte", "kinh te", "kinh tế", "economy", "eco"],
  ai: ["ai"],
  dapt: ["dapt", "damphuongtien", "da phuong tien", "đa phương tiện", "media", "dpt"],
  qlnhom: ["qlnhom", "quanlynhom", "quản lý nhóm", "quan ly nhom", "nhom", "group"],
  hethong: ["hethong", "he thong", "hệ thống", "system", "sys", "rent"],
  tienich: ["tienich", "tien ich", "tiện ích", "utility", "util"],
};

export const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();

const ALIAS_INDEX = (() => {
  const m = new Map();
  for (const [id, list] of Object.entries(NAME_ALIASES)) for (const a of list) m.set(norm(a).replace(/ /g, ""), id);
  return m;
})();

/** "pokemon"/"giải trí"/"system" → id nhóm hoặc null */
export function resolveCategory(input) {
  const k = norm(input).replace(/ /g, "");
  if (!k) return null;
  return ALIAS_INDEX.get(k) || null;
}

export function getCategory(id) { return BY_ID[id] || null; }

/** Trả id nhóm của 1 command registry-object, hoặc null (chưa phân loại) */
export function classifyCommand(cmd) {
  const name = norm(cmd?.name);
  if (!name) return null;
  if (Object.prototype.hasOwnProperty.call(COMMAND_CATEGORY, name)) return COMMAND_CATEGORY[name];
  const g = norm(cmd?.group);
  if (g && Object.prototype.hasOwnProperty.call(METADATA_FALLBACK, g)) return METADATA_FALLBACK[g];
  return null;
}

/**
 * Dựng danh mục từ registry thật (Map name → command).
 * @returns {{ byCategory: Record<string,string[]>, unclassified: string[], total: number }}
 */
export function buildCatalog(commands) {
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.id, []]));
  const unclassified = [];
  const names = commands instanceof Map ? [...commands.keys()] : [];
  for (const name of names.sort()) {
    const cat = classifyCommand(commands.get(name));
    if (cat) byCategory[cat].push(name); else unclassified.push(name);
  }
  return { byCategory, unclassified, total: names.length };
}

/** Tên người dùng gõ (tên chính hoặc alias) → tên lệnh chính; null nếu không có trong registry */
export function resolveCommandName(input, commands, aliases) {
  const key = String(input ?? "").trim().toLowerCase();
  if (!key || !(commands instanceof Map)) return null;
  if (commands.has(key)) return key;
  const owner = aliases instanceof Map ? aliases.get(key) : null;
  return owner && commands.has(owner) ? owner : null;
}

export const PROTECTED_COMMANDS = new Set(["limit"]);
