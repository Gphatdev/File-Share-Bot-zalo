/**
 * Di chuyển DỮ LIỆU THẬT sang cấu trúc thư mục theo nhóm chức năng (khớp phân loại LIMIT).
 *
 *   node tools/migrate_data_structure.mjs                 # dry-run: chỉ in kế hoạch, KHÔNG đụng file
 *   node tools/migrate_data_structure.mjs --apply         # sao lưu -> sao chép -> xác minh hash -> mới xoá bản cũ
 *   node tools/migrate_data_structure.mjs --rollback <thư-mục-backup>   # khôi phục đúng như trước khi chạy
 *   Tuỳ chọn: --root <thư mục dự án>  --backup-dir <nơi lưu backup>
 *
 * Bot cũng TỰ GỌI runMigration({apply:true}) lúc khởi động (zalo.js) nên không cần nhớ chạy tay.
 *
 * An toàn: không bao giờ ghi đè dữ liệu khác nhau. File cùng tên nhưng nội dung khác:
 *   - .js/.mjs/.cjs  -> giữ bản mới (từ bản vá), bản cũ nằm trong backup
 *   - file dữ liệu   -> giữ bản ở đích, bản cũ lưu cạnh đó thành "<tên>.conflict-old<.đuôi>" và BÁO CÁO
 *   - 0 byte vs có nội dung -> bản có nội dung thắng
 * Không đổi UID / group ID / key / cấu trúc JSON (chỉ đổi vị trí file).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MOVES } from "./data_structure.map.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const isCode = (f) => /\.(m?js|cjs)$/i.test(f);
const listFiles = (p, acc = []) => {
  const st = fs.lstatSync(p);
  if (st.isDirectory()) for (const e of fs.readdirSync(p)) listFiles(path.join(p, e), acc);
  else acc.push(p);
  return acc;
};

/** Rollback từ thư mục backup. */
export function rollbackMigration({ root, backupDir, log = console.log }) {
  const ROOT = path.resolve(root);
  const bdir = path.resolve(backupDir);
  const mf = JSON.parse(fs.readFileSync(path.join(bdir, "manifest.json"), "utf8"));
  let restored = 0, removed = 0, kept = 0;
  for (const f of mf.backedUp) {
    const from = path.join(bdir, "files", f.rel), to = path.join(ROOT, f.rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to); restored++;
  }
  for (const c of mf.created) {
    const p = path.join(ROOT, c.rel);
    if (!fs.existsSync(p)) continue;
    if (sha(p) === c.sha) { fs.unlinkSync(p); removed++; } else { kept++; log("GIỮ (đã bị sửa sau khi migrate): " + c.rel); }
  }
  for (const c of mf.conflictFiles || []) { const p = path.join(ROOT, c); if (fs.existsSync(p)) fs.unlinkSync(p); }
  log(`Rollback xong: khôi phục ${restored} file, gỡ ${removed} file ở đích, giữ nguyên ${kept}.`);
  return { restored, removed, kept };
}

/**
 * Lập kế hoạch (apply=false) hoặc thực hiện (apply=true).
 * Trả về { plan, errors, conflicts, backupDir, changed }.
 */
export function runMigration({ root = path.join(HERE, ".."), apply = false, backupDir, log = console.log, verbose = true } = {}) {
  const ROOT = path.resolve(root);
  const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const BACKUP = path.resolve(backupDir || path.join(ROOT, "backup_data_structure", stamp));

  const plan = [];
  const caseFix = [];
  for (const [from, to] of MOVES) {
    const a = path.join(ROOT, from), b = path.join(ROOT, to);
    if (!fs.existsSync(a)) continue;
    if (fs.existsSync(b) && fs.realpathSync.native(a) === fs.realpathSync.native(b) && a !== b) caseFix.push([a, b]);
    for (const f of listFiles(a)) {
      const dst = path.join(b, path.relative(a, f));
      if (fs.existsSync(dst) && fs.realpathSync.native(f) === fs.realpathSync.native(dst)) continue;   // cùng 1 file (FS không phân biệt hoa-thường)
      let action, note = "";
      if (!fs.existsSync(dst)) action = "MOVE";
      else {
        const s1 = fs.statSync(f).size, s2 = fs.statSync(dst).size;
        if (s1 === s2 && sha(f) === sha(dst)) action = "DUP";
        else if (s1 === 0) action = "DROP_EMPTY_SRC";
        else if (s2 === 0) action = "REPLACE_EMPTY_DST";
        else if (isCode(f) || /\/Pokemon\/db\/[^/]+$/.test(rel(f))) { action = "KEEP_DST_CODE"; note = "giữ bản mới từ bản vá (mã / dữ liệu tĩnh)"; }
        else { action = "CONFLICT"; note = "giữ bản ở đích, bản cũ lưu thành .conflict-old"; }
      }
      plan.push({ src: f, dst, action, note });
    }
  }
  // thư mục RỖNG ở nguồn cũng phải được tạo ở đích (mã dùng chúng, vd FREEFIRE/logokey, Lineup)
  const dirsToMake = [];
  for (const [from, to] of MOVES) {
    const a = path.join(ROOT, from); if (!fs.existsSync(a) || !fs.statSync(a).isDirectory()) continue;
    (function w(d) { dirsToMake.push(path.join(path.join(ROOT, to), path.relative(a, d))); for (const e of fs.readdirSync(d)) { const p = path.join(d, e); if (fs.statSync(p).isDirectory()) w(p); } })(a);
  }
  const count = (k) => plan.filter((p) => p.action === k).length;
  const result = { plan, errors: [], conflicts: [], backupDir: null, changed: false, applied: false };

  if (verbose) {
    log(`Thư mục dự án: ${ROOT}`);
    log(`Kế hoạch: ${plan.length} file — MOVE ${count("MOVE")}, DUP ${count("DUP")}, REPLACE_EMPTY_DST ${count("REPLACE_EMPTY_DST")}, DROP_EMPTY_SRC ${count("DROP_EMPTY_SRC")}, KEEP_DST_CODE ${count("KEEP_DST_CODE")}, CONFLICT ${count("CONFLICT")}`);
    for (const p of plan) log(`  [${p.action}] ${rel(p.src)} → ${rel(p.dst)}${p.note ? "  (" + p.note + ")" : ""}`);
  }
  if (!apply) return result;
  if (!plan.length && !caseFix.length && !dirsToMake.length) return result;

  /* BACKUP (trước mọi thay đổi) */
  const manifest = { root: ROOT, time: stamp, backedUp: [], created: [], conflictFiles: [] };
  const involved = new Set();
  for (const p of plan) { involved.add(p.src); if (fs.existsSync(p.dst)) involved.add(p.dst); }
  for (const f of involved) {
    const to = path.join(BACKUP, "files", rel(f));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(f, to);
    if (sha(f) !== sha(to)) { result.errors.push("BACKUP SAI HASH: " + rel(f)); log("BACKUP SAI HASH: " + rel(f) + " → dừng, chưa đụng dữ liệu."); return result; }
    manifest.backedUp.push({ rel: rel(f), sha: sha(f) });
  }
  fs.mkdirSync(BACKUP, { recursive: true });
  fs.writeFileSync(path.join(BACKUP, "manifest.json"), JSON.stringify(manifest, null, 2));
  result.backupDir = BACKUP;
  if (verbose) log(`\nĐã sao lưu ${manifest.backedUp.length} file vào: ${BACKUP}`);

  /* APPLY */
  for (const [a, b] of caseFix) { const tmp = a + ".__case_tmp"; fs.renameSync(a, tmp); fs.renameSync(tmp, b); }
  for (const d of dirsToMake) fs.mkdirSync(d, { recursive: true });
  for (const p of plan) {
    try {
      const srcSha = sha(p.src);
      if (p.action === "MOVE" || p.action === "REPLACE_EMPTY_DST") {
        fs.mkdirSync(path.dirname(p.dst), { recursive: true });
        fs.copyFileSync(p.src, p.dst);
        if (sha(p.dst) !== srcSha) throw new Error("hash đích không khớp");
        if (/\.json$/i.test(p.dst) && fs.statSync(p.dst).size > 0) JSON.parse(fs.readFileSync(p.dst, "utf8"));
        manifest.created.push({ rel: rel(p.dst), sha: srcSha });
        fs.unlinkSync(p.src);                       // chỉ xoá sau khi đã xác minh
      } else if (p.action === "CONFLICT") {
        const ext = path.extname(p.dst), side = p.dst.slice(0, p.dst.length - ext.length) + ".conflict-old" + ext;
        fs.copyFileSync(p.src, side);
        if (sha(side) !== srcSha) throw new Error("hash conflict-old không khớp");
        manifest.conflictFiles.push(rel(side)); manifest.created.push({ rel: rel(side), sha: srcSha });
        fs.unlinkSync(p.src);
      } else { fs.unlinkSync(p.src); }              // DUP / DROP_EMPTY_SRC / KEEP_DST_CODE (đã có trong backup)
    } catch (e) { result.errors.push(`${rel(p.src)}: ${e.message}`); }
  }
  const rmEmpty = (d) => { if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) return; for (const e of fs.readdirSync(d)) rmEmpty(path.join(d, e)); if (!fs.readdirSync(d).length) fs.rmdirSync(d); };
  for (const [from] of MOVES) rmEmpty(path.join(ROOT, from));
  for (const d of ["Core/Commands/cache", "Core/Commands/GameAssets"]) rmEmpty(path.join(ROOT, d));
  fs.writeFileSync(path.join(BACKUP, "manifest.json"), JSON.stringify(manifest, null, 2));
  result.conflicts = manifest.conflictFiles; result.changed = true; result.applied = true;
  if (verbose) {
    log(result.errors.length ? `\n✗ ${result.errors.length} lỗi (file lỗi còn nguyên ở vị trí cũ):\n  ${result.errors.join("\n  ")}` : "\n✓ Di chuyển & xác minh hash thành công.");
    if (result.conflicts.length) log("⚠ File xung đột cần bạn tự đối chiếu:\n  " + result.conflicts.join("\n  "));
    log(`Rollback: node tools/migrate_data_structure.mjs --rollback "${BACKUP}"`);
  }
  return result;
}

/* ───────────── CLI ───────────── */
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const root = path.resolve(opt("--root") || path.join(HERE, ".."));
  if (opt("--rollback")) { rollbackMigration({ root, backupDir: opt("--rollback") }); process.exit(0); }
  const r = runMigration({ root, apply: args.includes("--apply"), backupDir: opt("--backup-dir") });
  if (!args.includes("--apply")) console.log("\n(Dry-run) Chưa thay đổi gì. Thêm --apply để thực hiện.");
  process.exit(r.errors.length ? 1 : 0);
}
