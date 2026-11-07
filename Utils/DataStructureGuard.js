/**
 * Chạy lúc khởi động, TRƯỚC khi nạp lệnh:
 *  1) Tự di chuyển dữ liệu từ vị trí cũ sang cấu trúc theo nhóm (GIAITRI/ADMIN/TINHDIEM/...), có sao lưu + xác minh hash.
 *  2) Quét import tương đối trong Core/Handlers/App/Utils: file nào còn trỏ đường dẫn cũ (bản vá giải nén thiếu/chưa đè)
 *     sẽ được báo rõ tên file để bạn đè lại, thay vì chỉ thấy "Cannot find module".
 */
import fs from "node:fs";
import path from "node:path";
import { runMigration } from "../tools/migrate_data_structure.mjs";

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"'\n]*)\1/g;
const resolves = (base) => [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.json`, path.join(base, "index.js")].some((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });

function scanStaleImports(root) {
  const bad = [];
  for (const top of ["Core", "Handlers", "App", "Utils"]) {
    const start = path.join(root, top);
    if (!fs.existsSync(start)) continue;
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (["node_modules", ".git", "temp", "tools"].includes(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(m?js|cjs)$/.test(e.name)) continue;
        let src; try { src = fs.readFileSync(p, "utf8").split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n"); } catch { continue; }
        for (const m of src.matchAll(IMPORT_RE)) {
          if (!resolves(path.resolve(path.dirname(p), m[2]))) bad.push(`${path.relative(root, p).split(path.sep).join("/")} → ${m[2]}`);
        }
      }
    })(start);
  }
  return bad;
}

export function ensureDataStructure(root, logger = console) {
  const info = (m) => (logger.info ? logger.info(m) : console.log(m));
  const warn = (m) => (logger.warn ? logger.warn(m) : console.warn(m));
  try {
    const r = runMigration({ root, apply: true, verbose: false });
    if (r.changed) info(`[DATA ] ✓ Đã sắp xếp lại dữ liệu theo nhóm (${r.plan.length} file). Backup: ${r.backupDir}`);
    if (r.errors.length) warn(`[DATA ] ${r.errors.length} file không di chuyển được: ${r.errors.slice(0, 5).join(" | ")}`);
    if (r.conflicts.length) warn(`[DATA ] File xung đột (bản cũ lưu *.conflict-old.*): ${r.conflicts.join(", ")}`);
  } catch (err) {
    warn(`[DATA ] Không thể tự di chuyển dữ liệu: ${err?.message}. Chạy tay: node tools/migrate_data_structure.mjs --apply`);
  }
  try {
    const stale = scanStaleImports(root);
    if (stale.length) warn(`[DATA ] ${stale.length} import trỏ vào file không tồn tại — thường do giải nén bản vá chưa ĐÈ HẾT file cũ. Hãy đè lại các file này từ ZIP:\n  ${stale.slice(0, 20).join("\n  ")}`);
  } catch { /* chỉ là chẩn đoán */ }
}
