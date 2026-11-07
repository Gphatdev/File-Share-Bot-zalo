/**
 * Bảng ánh xạ đường dẫn CŨ → MỚI của thư mục dữ liệu (HNNP STUDIO).
 * Đường dẫn tính từ thư mục gốc project. Dùng chung cho: tools/migrate_data_structure.mjs (di chuyển dữ liệu thật)
 * và tools/check_data_paths.mjs (kiểm tra mã nguồn). Nhóm đồng bộ với hệ thống LIMIT (xem LIMIT_PRO_README.md).
 *
 *  GIAITRI  trò chơi + kinh tế game (tiền, shop, balo, hồ sơ, vbank)   ↔ limit: GIẢI TRÍ
 *  ADMIN    quản trị, LIMIT                                            ↔ limit: ADMIN
 *  TINHDIEM tính điểm, lượt dùng, Free Fire, key                        ↔ limit: TÍNH ĐIỂM
 *  HETHONG  thuê bot (rent), cấu hình vận hành                           ↔ limit: HỆ THỐNG
 *  GROUP    quản lý nhóm (boxinfo…)                                      ↔ limit: QUẢN LÝ NHÓM
 *  KINHTE   QR/ngân hàng thật (qrin, qrnew, bank2, stk)                  ↔ limit: KINH TẾ
 *  MEDIA    font/hình ảnh dùng chung                                     ↔ limit: ĐA PHƯƠNG TIỆN
 *  ANTI, AI, OTHER: tạo khi có dữ liệu (hiện chưa có dữ liệu nào thuộc các nhóm này)
 */
const C = "Core/Commands";
const D = `${C}/data`;

/** [nguồn, đích] — thứ tự quan trọng: mục dài/cụ thể phải đứng trước mục chung (hàm map sẽ tự chọn tiền tố dài nhất). */
export const MOVES = [
  // ── GIAITRI ──
  [`${D}/TienGame`, `${D}/GIAITRI/TienGame`],
  [`${D}/BauCua`, `${D}/GIAITRI/BauCua`],
  [`${D}/TaiXiu1v1`, `${D}/GIAITRI/TaiXiu1v1`],
  [`${D}/BaiCao`, `${D}/GIAITRI/BaiCao`],
  [`${D}/XiDach`, `${D}/GIAITRI/XiDach`],
  [`${D}/Ott`, `${D}/GIAITRI/Ott`],
  [`${D}/Pokemon`, `${D}/GIAITRI/Pokemon`],
  [`${D}/CauCa`, `${D}/GIAITRI/CauCa`],
  [`${D}/Inventory`, `${D}/GIAITRI/Inventory`],
  [`${D}/PlayerProfile`, `${D}/GIAITRI/PlayerProfile`],
  [`${D}/Cultivation`, `${D}/GIAITRI/Cultivation`],
  [`${D}/STK`, `${D}/GIAITRI/STK`],
  [`${D}/shop_data.json`, `${D}/GIAITRI/Shop/shop_data.json`],
  [`${C}/GameAssets/baucua`, `${D}/GIAITRI/BauCua/assets`],
  [`${C}/GameAssets/taixiu`, `${D}/GIAITRI/TaiXiu/assets`],
  [`${C}/cache/taixiu`, `${D}/GIAITRI/TaiXiu/dice`],
  // ── TINHDIEM ──
  [`${D}/Luotdung`, `${D}/TINHDIEM/Luotdung`],
  [`${D}/FREEFIRE`, `${D}/TINHDIEM/FREEFIRE`],
  [`${D}/keys.json`, `${D}/TINHDIEM/keys.json`],
  [`${D}/autotd_box_config.json`, `${D}/TINHDIEM/autotd_box_config.json`],
  [`${D}/autotd_enabled_boxes.json`, `${D}/TINHDIEM/autotd_enabled_boxes.json`],
  [`${C}/datateam`, `${D}/TINHDIEM/datateam`],
  // ── ADMIN ──
  [`${D}/Admin`, `${D}/ADMIN`],
  [`${D}/Limit`, `${D}/ADMIN/Limit`],
  [`${D}/limit.json`, `${D}/ADMIN/limit.json`],
  [`${C}/cache/limit.json`, `${D}/ADMIN/limit.json`], // file giới hạn box kiểu cũ (NKNP) — mã cũ ghi nhầm "commands" chữ thường
  // ── HETHONG / GROUP / KINHTE / MEDIA ──
  [`${D}/Rent`, `${D}/HETHONG/Rent`],
  [`${D}/BoxInfo`, `${D}/GROUP/BoxInfo`],
  [`${D}/QRauto`, `${D}/KINHTE/QRauto`],
  [`${D}/QRAPIAssets`, `${D}/KINHTE/QRAPIAssets`],   // bản trùng với Core/Commands/QRAPIAssets → hợp nhất
  [`${C}/QRAPIAssets`, `${D}/KINHTE/QRAPIAssets`],
  [`${C}/cache/stk_config.json`, `${D}/KINHTE/stk_config.json`],
  [`${D}/fonts`, `${D}/MEDIA/fonts`],
];

/** Thư mục nhóm (tạo khi có dữ liệu). */
export const GROUP_DIRS = ["GIAITRI", "ADMIN", "TINHDIEM", "HETHONG", "GROUP", "KINHTE", "MEDIA"];

const sorted = [...MOVES].sort((a, b) => b[0].length - a[0].length);

/** Ánh xạ 1 đường dẫn tương đối (posix, từ gốc project) sang vị trí mới; không thuộc bảng → giữ nguyên. */
export function mapRel(rel) {
  const p = String(rel).replace(/\\/g, "/").replace(/\/+$/, "");
  for (const [from, to] of sorted) {
    if (p === from) return to;
    if (p.startsWith(from + "/")) return to + p.slice(from.length);
  }
  return p;
}
