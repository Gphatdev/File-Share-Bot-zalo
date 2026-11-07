/** Kiểm tra cấu trúc data theo nhóm: node tests/data_structure.test.mjs */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MOVES, GROUP_DIRS } from "../tools/data_structure.map.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const D = path.join(ROOT, "Core/Commands/data");
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("PASS", name); } catch (e) { fail++; console.log("FAIL", name, "-", e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

t("bộ kiểm tra đường dẫn không có lỗi", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/check_data_paths.mjs")], { encoding: "utf8" });
  ok(r.status === 0, r.stdout.split("\n").filter((l) => l.startsWith("LỖI")).join("; "));
});
t("không còn thư mục dữ liệu cũ phẳng", () => {
  const old = ["TienGame", "BauCua", "Pokemon", "CauCa", "Ott", "STK", "Rent", "BoxInfo", "Limit", "Admin", "Luotdung", "FREEFIRE", "fonts"];
  const bad = old.filter((n) => fs.existsSync(path.join(D, n)) && fs.readdirSync(D).includes(n));
  ok(!bad.length, "còn: " + bad.join(","));
});
t("thư mục nhóm tồn tại", () => { for (const g of ["GIAITRI", "ADMIN", "TINHDIEM", "HETHONG", "GROUP", "MEDIA"]) ok(fs.existsSync(path.join(D, g)), g); });
t("ghi/đọc thử trong từng thư mục nhóm", () => {
  for (const g of GROUP_DIRS) { const dir = path.join(D, g); if (!fs.existsSync(dir)) continue;
    const f = path.join(dir, `.rw_${process.pid}.tmp`); fs.writeFileSync(f, "ok"); ok(fs.readFileSync(f, "utf8") === "ok", g); fs.unlinkSync(f); }
});
t("mọi file .json trong nhóm đều parse được", () => {
  const bad = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); } else if (/\.json$/.test(e.name) && fs.statSync(p).size > 0) { try { JSON.parse(fs.readFileSync(p, "utf8")); } catch { bad.push(path.relative(ROOT, p)); } } } })(D);
  ok(!bad.length, bad.join(", "));
});
t("MOVES: đích có dữ liệu (trừ file tạo lúc chạy)", () => {
  const optional = /datateam|limit\.json|autotd|stk_config|keys\.json|assets$|dice$/;
  const miss = MOVES.map((m) => m[1]).filter((to) => !optional.test(to) && !fs.existsSync(path.join(ROOT, to)));
  ok(!miss.length, miss.join(", "));
});
t("migrate dry-run chạy được và không đổi file", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/migrate_data_structure.mjs")], { encoding: "utf8" });
  ok(r.status === 0, r.stderr);
});
console.log(`PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
