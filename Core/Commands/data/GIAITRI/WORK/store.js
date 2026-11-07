/**
 * WORK/store.js — lưu trữ JSON an toàn cho .work
 *  - Ghi nguyên tử (tmp + rename), tự tạo / tự sửa file hỏng (file hỏng được đổi tên *.corrupt-<time> rồi tạo lại).
 *  - Mọi thao tác ghi đi qua 1 hàng đợi (mutex) → không ghi đè lẫn nhau khi nhiều người dùng cùng lúc.
 *  - Dữ liệu người chơi khóa theo UID (string).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WORK_DIR = __dirname;

let dir = WORK_DIR;
export function setDataDirForTests(d) { dir = d || WORK_DIR; }
export const fileOf = (name) => path.join(dir, name);

function readRaw(file, fallback) {
  try {
    if (!fs.existsSync(file)) return { value: fallback(), created: true };
    const txt = fs.readFileSync(file, "utf8");
    if (!txt.trim()) return { value: fallback(), created: true };
    const v = JSON.parse(txt);
    if (v === null || typeof v !== "object") throw new Error("không phải object");
    return { value: v };
  } catch (err) {
    try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* ignore */ }
    console.warn(`[work] ${path.basename(file)} bị hỏng (${err?.message}) → đã sao lưu và tạo lại.`);
    return { value: fallback(), repaired: true };
  }
}

export function readJson(name, fallback = () => ({})) {
  const file = fileOf(name);
  const r = readRaw(file, fallback);
  if (r.created || r.repaired) writeJson(name, r.value);
  return r.value;
}

export function writeJson(name, data) {
  const file = fileOf(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), "utf8");
  fs.renameSync(tmp, file);
}

// ── mutex toàn cục cho các thao tác đọc-sửa-ghi ──
let chain = Promise.resolve();
export function withLock(task) {
  const run = chain.then(task, task);
  chain = run.then(() => {}, () => {});
  return run;
}

/**
 * Đọc-sửa-ghi players.json (+ history.json) nguyên tử.
 * fn({players, addHistory}) → kết quả; nếu fn ném lỗi thì KHÔNG ghi gì.
 */
export function mutate(fn, historyCap = 100) {
  return withLock(async () => {
    const players = readJson("players.json");
    const entries = [];
    const out = await fn({ players, addHistory: (uid, entry) => entries.push([String(uid), entry]) });
    writeJson("players.json", players);
    if (entries.length) {
      const all = readJson("history.json");
      for (const [uid, entry] of entries) {
        const list = Array.isArray(all[uid]) ? all[uid] : [];
        list.push(entry);
        all[uid] = list.slice(-Math.max(10, historyCap));
      }
      writeJson("history.json", all);
    }
    return out;
  });
}
export function readPlayers() { return readJson("players.json"); }
export function readHistory(uid) {
  const all = readJson("history.json");
  return Array.isArray(all[uid]) ? all[uid] : [];
}

export function loadStatic(name) {
  return JSON.parse(fs.readFileSync(fileOf(name), "utf8"));
}
