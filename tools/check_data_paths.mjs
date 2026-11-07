/** Kiểm tra đường dẫn sau tái cấu trúc: import tồn tại, đường dẫn tĩnh trỏ tới nơi có thật, không còn tham chiếu cũ.
 *  Dùng: node tools/check_data_paths.mjs   (exit 1 nếu có lỗi) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOVES } from "./data_structure.map.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const posix = (p) => p.split(path.sep).join("/");
const errors = [], warns = [];
// Lỗi CÓ SẴN từ trước khi tái cấu trúc (xác minh trên bản gốc), không do việc di chuyển gây ra -> chỉ cảnh báo.
const PRE_EXISTING = [/tests\/moneyFormatter\.test\.mjs/, /tests\/tiengame\.integration\.test\.mjs/, /HandleLegacyReload\.cjs/, /LegacyUtils\.cjs/, /key\.js: path\.join\(__dirname, data\/logo/, /qrin\.js: path\.join\(__dirname, \/layout/];
const addErr = errors.push.bind(errors);
const SKIP = new Set(["node_modules", ".git", "ff_profile_supreme_v4", "backup_data_structure"]);
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(js|mjs|cjs)$/.test(e.name)) files.push(p);
  }
})(ROOT);

const resolvesTo = (base) => [base, base + ".js", base + ".mjs", base + ".json", path.join(base, "index.js")].some((p) => fs.existsSync(p) && fs.statSync(p).isFile());
const IMP = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"'\n]*)\1/g;
const URLR = /new URL\(\s*(["'])(\.{1,2}\/[^"'\n]*)\1\s*,\s*import\.meta\.url\s*\)/g;
const LIT = String.raw`(?:"[^"\n]*"|'[^'\n]*')`;
const JOIN = new RegExp(String.raw`\bpath\.(?:join|resolve)\(\s*__dirname((?:\s*,\s*${LIT})+)\s*\)`, "g");

for (const f of files) {
  const src = fs.readFileSync(f, "utf8"); const dir = path.dirname(f); const r = posix(path.relative(ROOT, f));
  for (const m of src.matchAll(IMP)) if (!resolvesTo(path.resolve(dir, m[2]))) errors.push(`${r}: import không tồn tại: ${m[2]}`);
  for (const m of src.matchAll(URLR)) { const t = path.resolve(dir, m[2]); if (!fs.existsSync(t) && !fs.existsSync(path.dirname(t))) errors.push(`${r}: URL không tồn tại: ${m[2]}`); }
  for (const m of src.matchAll(JOIN)) {
    const parts = [...m[1].matchAll(new RegExp(LIT, "g"))].map((x) => x[0].slice(1, -1));
    const t = path.resolve(dir, ...parts);
    if (!fs.existsSync(t) && !fs.existsSync(path.dirname(t))) errors.push(`${r}: path.join(__dirname, ${parts.join("/")}) → thư mục cha không tồn tại`);
  }
  // tham chiếu thư mục cũ
  for (const [from] of MOVES) {
    const tail = from.replace(/^Core\/Commands\//, "");
    if (/^(cache|GameAssets|datateam|QRAPIAssets)/.test(tail) || tail.startsWith("data/")) {
      const re = new RegExp(String.raw`(?<![\w./-])${tail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\w-])`);
      if (re.test(src) && !/tools\/(data_structure|migrate|check)/.test(r)) warns.push(`${r}: còn chuỗi đường dẫn cũ "${tail}"`);
    }
  }
  if (!/tools\/check_data_paths/.test(r) && /commands\/cache\/limit\.json/.test(src)) errors.push(`${r}: còn đường dẫn legacy commands/cache/limit.json`);
}
// thư mục đích phải tồn tại
for (const [, to] of MOVES) if (!fs.existsSync(path.join(ROOT, to)) && !/datateam|cache\/limit\.json|ADMIN\/limit\.json|autotd/.test(to)) warns.push(`đích chưa có dữ liệu: ${to}`);

console.log(`Đã quét ${files.length} file mã nguồn.`);
warns.forEach((w) => console.log("CẢNH BÁO:", w));
const real = errors.filter((e) => !PRE_EXISTING.some((re) => re.test(e)));
errors.filter((e) => PRE_EXISTING.some((re) => re.test(e))).forEach((e) => console.log("CÓ SẴN TỪ TRƯỚC (không do tái cấu trúc):", e));
errors.length = 0; errors.push(...real);
errors.forEach((e) => console.log("LỖI:", e));
console.log(errors.length ? `✗ ${errors.length} lỗi` : "✓ Không có lỗi đường dẫn");
process.exit(errors.length ? 1 : 0);
