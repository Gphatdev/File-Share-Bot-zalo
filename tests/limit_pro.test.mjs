/**
 * Test LIMIT PRO — chạy: node tests/limit_pro.test.mjs
 * Dùng router/loader/BotInstance/Database THẬT + adapter giả. Lệnh mẫu là command giả có tên thật của project
 * (để không phụ thuộc thư viện nặng); riêng phần "phân loại" quét static toàn bộ file trong Core/Commands.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { createDatabase } = await imp("App/Database.js");
const { createBotInstance } = await imp("App/BotInstance.js");
const { createCommandRouter } = await imp("Handlers/HandleCommandRouter.js");
const { registerCommand } = await imp("Handlers/HandleCommandLoader.js");
const limit = (await imp("Core/Commands/limit.js")).default;
const Cat = await imp("Core/Commands/data/ADMIN/Limit/categories.js");
const Store = await imp("Core/Commands/data/ADMIN/Limit/store.js");
const Canvas = await imp("Core/Commands/data/ADMIN/Limit/canvas.js");

let pass = 0, fail = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); pass++; } catch (e) { fail++; results.push(`FAIL ${name}: ${e.message}`); }
}
const logger = { info() {}, warn() {}, error() {}, debug() {} };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "limit-test-"));

const OWNER = "100", ADMIN = "200", MEMBER = "300", MEMBER2 = "301";
function makeAdapter(opts = {}) {
  const a = { texts: [], images: [], deleted: [] };
  a.sendText = async ({ threadId, text }) => { a.texts.push({ threadId, text }); };
  a.sendImage = async ({ threadId, imagePath, caption }) => {
    if (opts.failImage) throw new Error("image fail");
    a.images.push({ threadId, caption, buf: fs.readFileSync(imagePath) });
  };
  a.deleteMessage = async (m) => {
    if (opts.deleteError) { const e = new Error("no"); e.code = opts.deleteError; throw e; }
    a.deleted.push(m.data.content);
  };
  a.getGroupAdmins = async () => ({ creatorId: "999", adminIds: [ADMIN] });
  return a;
}
const NAMES = {
  pokemon: ["pkm", "poke"], cauca: ["câu", "fishing"], ping: ["p"], rent: ["thuebot"], game: [], gameinfo: [], gpt: [], td: [], girl: ["gai"], mystery: [],
};
async function makeEnv(adapterOpts = {}, dbPath = path.join(TMP, `db-${Math.random().toString(16).slice(2)}.db`)) {
  const db = await createDatabase(dbPath, logger, 5);
  const adapter = makeAdapter(adapterOpts);
  const bot = createBotInstance({ config: { botPrefix: ".", ownerZaloId: OWNER, legacyAdminBot: [], legacySupportBot: [] }, db, adapter, logger });
  const ran = [];
  for (const [name, aliases] of Object.entries(NAMES)) {
    const r = registerCommand(bot, { name, aliases, group: name === "mystery" ? "general" : "x", role: 0, cooldown: 0, async run({ message }) { ran.push(`${name}:${message.threadId}`); } }, `${name}.js`);
    assert.ok(r.ok, JSON.stringify(r));
  }
  assert.ok(registerCommand(bot, limit, "limit.js").ok);
  bot.commands.get("limit").cooldown = 0; // test gõ nhiều lệnh liên tiếp; cooldown thật (2s) do router xử lý riêng
  global.__NKNP_BOT__ = bot; // zalo.js gán biến này ở môi trường thật
  const router = createCommandRouter(bot);
  const say = async (uid, text, threadId = "T1") => router.handleMessage({ threadId, type: 1, isSelf: false, data: { uidFrom: uid, content: text } });
  return { db, adapter, bot, router, ran, say, dbPath };
}

// ───────── 1. Phân nhóm ─────────
await t("10 tổ hợp đúng tên/thứ tự", () => {
  assert.equal(Cat.CATEGORIES.length, 10);
  assert.deepEqual(Cat.CATEGORIES.map((c) => c.label), ["GIẢI TRÍ", "ADMIN", "TÍNH ĐIỂM", "ANTI", "KINH TẾ", "AI", "ĐA PHƯƠNG TIỆN", "QUẢN LÝ NHÓM", "HỆ THỐNG", "TIỆN ÍCH"]);
});
await t("Pokémon/Câu cá = GIẢI TRÍ, RENT = HỆ THỐNG, không có nhóm riêng", () => {
  assert.equal(Cat.classifyCommand({ name: "pokemon", group: "game" }), "giaitri");
  assert.equal(Cat.classifyCommand({ name: "cauca", group: "game" }), "giaitri");
  assert.equal(Cat.classifyCommand({ name: "rent", group: "moderation" }), "hethong");
  for (const c of Cat.CATEGORIES) assert.ok(!/pok|câu|cau ca|rent/i.test(c.label));
});
await t("Lệnh chưa xác định → null (không bị khóa theo nhóm)", () => {
  assert.equal(Cat.classifyCommand({ name: "zzz_new", group: "general" }), null);
  assert.equal(Cat.classifyCommand({ name: "zzz_new", group: "moderation" }), null);
  assert.equal(Cat.classifyCommand({ name: "zzz_new", group: "game" }), "giaitri"); // fallback metadata
});
const cmdDir = path.join(ROOT, "Core", "Commands");
const staticNames = [];
for (const f of fs.readdirSync(cmdDir).filter((x) => x.endsWith(".js"))) {
  const src = fs.readFileSync(path.join(cmdDir, f), "utf8");
  const start = Math.max(0, Math.min(...["const __legacyConfig = {", "export default {", "const command = {"].map((k) => { const i = src.indexOf(k); return i < 0 ? Infinity : i; }).filter(isFinite).concat([Infinity])) );
  const m = src.slice(Number.isFinite(start) ? start : 0, (Number.isFinite(start) ? start : 0) + 600).match(/\bname\s*:\s*["'`]([^"'`]+)["'`]/);
  if (m) staticNames.push({ file: f, name: m[1].trim().toLowerCase() });
}
await t("Quét thư mục lệnh thật: mọi lệnh đã phân loại, không có khóa giả", () => {
  assert.ok(staticNames.length >= 60, `chỉ tìm thấy ${staticNames.length} lệnh`);
  const unclassified = staticNames.filter((c) => !Cat.classifyCommand({ name: c.name, group: "general" })).map((c) => c.file + ":" + c.name);
  assert.deepEqual(unclassified, [], "lệnh chưa phân loại: " + unclassified.join(", "));
});
await t("Bảng ánh xạ không chứa lệnh không tồn tại", () => {
  const real = new Set(staticNames.map((c) => c.name));
  const src = fs.readFileSync(path.join(ROOT, "Core/Commands/data/ADMIN/Limit/categories.js"), "utf8");
  const body = src.slice(src.indexOf("const COMMAND_CATEGORY"), src.indexOf("const METADATA_FALLBACK"));
  const keys = [...body.matchAll(/\b([a-z0-9_]+):\s*"[a-z]+"/g)].map((m) => m[1]);
  const fake = keys.filter((k) => !real.has(k));
  assert.deepEqual(fake, [], "khóa không có lệnh thật: " + fake.join(", "));
});
await t("resolveCategory nhận tên cũ (system/game/moderation) và tên có dấu", () => {
  assert.equal(Cat.resolveCategory("system"), "hethong");
  assert.equal(Cat.resolveCategory("game"), "giaitri");
  assert.equal(Cat.resolveCategory("Giải Trí"), "giaitri");
  assert.equal(Cat.resolveCategory("moderation"), "anti");
  assert.equal(Cat.resolveCategory("đa phương tiện"), "dapt");
  assert.equal(Cat.resolveCategory("khongco"), null);
});

// ───────── 2. Khóa nhóm & BLOCK qua router thật ─────────
await t("LIMIT tắt: không chặn gì dù đã cấu hình", async () => {
  const e = await makeEnv();
  await e.say(OWNER, ".limit add giaitri"); await e.say(OWNER, ".limit block ping");
  assert.equal(Store.loadState(e.db, "T1").enabled, true); // khóa/BLOCK tự BẬT LIMIT
  await e.say(OWNER, ".limit off");
  await e.say(MEMBER, ".pokemon"); await e.say(MEMBER, ".ping");
  assert.deepEqual(e.ran, ["pokemon:T1", "ping:T1"]);
});
await t("Khóa nhóm GIẢI TRÍ chặn pokemon/cauca + alias; nhóm khác vẫn chạy", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit add giaitri"); await e.say(ADMIN, ".limit on");
  await e.say(MEMBER, ".pokemon"); await e.say(MEMBER, ".pkm"); await e.say(MEMBER, ".fishing"); await e.say(MEMBER, ".ping"); await e.say(MEMBER, ".gpt");
  assert.deepEqual(e.ran, ["ping:T1", "gpt:T1"]);
  assert.ok(e.adapter.deleted.length >= 3);
  assert.ok(e.adapter.images.some((x) => /GIẢI TRÍ/.test(x.caption)));
});
await t("Admin dùng lệnh bị khóa: vẫn chạy + nhận thẻ miễn trừ (1 lần/5 phút); member vẫn bị chặn", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit add giaitri"); e.adapter.images.length = 0;
  await e.say(ADMIN, ".pokemon"); await e.say(ADMIN, ".cauca");
  assert.deepEqual(e.ran, ["pokemon:T1", "cauca:T1"]);
  assert.equal(e.adapter.images.filter((x) => /miễn trừ/.test(x.caption)).length, 1);
  await e.say(MEMBER, ".pokemon");
  assert.deepEqual(e.ran, ["pokemon:T1", "cauca:T1"]);
});
await t("Router CHƯA vá (không có commandGuards): hook onMessage của limit vẫn chặn được", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit add giaitri"); await e.say(ADMIN, ".limit block ping");
  e.bot.commandGuards.length = 0; // giả lập router cũ: không ai gọi guard
  e.adapter.images.length = 0;
  await e.say("777", ".pokemon"); await e.say("777", ".pkm"); await e.say("778", ".ping"); await e.say("777", ".gpt");
  assert.deepEqual(e.ran, ["gpt:T1"]);
  assert.ok(e.adapter.deleted.length >= 3);
  assert.ok(e.adapter.images.some((x) => /hạn chế/.test(x.caption)));
  await e.say(ADMIN, ".pokemon"); // admin vẫn dùng được
  assert.deepEqual(e.ran, ["gpt:T1", "pokemon:T1"]);
});
await t("Hook: tin thường / lệnh lạ / chat riêng / LIMIT tắt không bị đụng tới", async () => {
  const e = await makeEnv(); e.bot.commandGuards.length = 0;
  await e.say(ADMIN, ".limit add giaitri"); await e.say(ADMIN, ".limit off");
  await e.say(MEMBER, ".pokemon"); // LIMIT TẮT
  await e.say(MEMBER, "pokemon"); await e.say(MEMBER, ".khongcolenh"); await e.say(MEMBER, ".");
  assert.deepEqual(e.ran, ["pokemon:T1"]);
  const m = { threadId: "T1", type: 0, isSelf: false, data: { uidFrom: MEMBER, content: ".pokemon" } };
  await e.router.handleMessage(m);
  assert.equal(m.data.content, ".pokemon");
});
await t("Owner & admin nhóm được miễn trừ", async () => {
  const e = await makeEnv();
  await e.say(OWNER, ".limit add giaitri"); await e.say(OWNER, ".limit on");
  await e.say(OWNER, ".pokemon"); await e.say(ADMIN, ".cauca");
  assert.deepEqual(e.ran, ["pokemon:T1", "cauca:T1"]);
});
await t("profile thuộc TÍNH ĐIỂM, checkff thuộc TIỆN ÍCH", async () => {
  const e = await makeEnv(); await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit add tinhdiem");
  assert.equal(Cat.classifyCommand({ name: "profile", group: "Game" }), "tinhdiem");
  assert.equal(Cat.classifyCommand({ name: "checkff", group: "Game" }), "tienich");
});
await t("BLOCK 1 lệnh chỉ chặn lệnh đó, không đổi khóa nhóm", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit block cauca");
  await e.say(MEMBER, ".cauca"); await e.say(MEMBER, ".pokemon");
  assert.deepEqual(e.ran, ["pokemon:T1"]);
  assert.deepEqual(Store.loadState(e.db, "T1").groups, []);
});
await t("BLOCK qua alias → lưu tên chính, alias khác cũng bị chặn", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit block pkm");
  assert.deepEqual(Store.loadState(e.db, "T1").blocked, ["pokemon"]);
  await e.say(MEMBER, ".poke"); await e.say(MEMBER, ".pokemon");
  assert.deepEqual(e.ran, []);
});
await t("Không chặn nhầm tên gần giống (game vs gameinfo)", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit block game");
  await e.say(MEMBER, ".gameinfo"); await e.say(MEMBER, ".game");
  assert.deepEqual(e.ran, ["gameinfo:T1"]);
});
await t("UNBLOCK không mở khóa nhóm; mở khóa nhóm không xóa BLOCK", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit add giaitri"); await e.say(ADMIN, ".limit block pokemon");
  await e.say(ADMIN, ".limit unblock pokemon");
  await e.say(MEMBER, ".pokemon");
  assert.deepEqual(e.ran, [], "nhóm vẫn khóa sau unblock");
  await e.say(ADMIN, ".limit block pokemon"); await e.say(ADMIN, ".limit del giaitri");
  assert.deepEqual(Store.loadState(e.db, "T1").blocked, ["pokemon"]);
  await e.say(MEMBER, ".pokemon"); await e.say(MEMBER, ".cauca");
  assert.deepEqual(e.ran, ["cauca:T1"], "pokemon vẫn BLOCK riêng, cauca chạy");
});
await t("Lệnh vừa BLOCK vừa thuộc nhóm khóa: chặn đến khi cả hai gỡ", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit add giaitri"); await e.say(ADMIN, ".limit block pokemon");
  await e.say(ADMIN, ".limit del giaitri"); await e.say(MEMBER, ".pokemon");
  assert.deepEqual(e.ran, []);
  await e.say(ADMIN, ".limit unblock pokemon"); await e.say(MEMBER, ".pokemon");
  assert.deepEqual(e.ran, ["pokemon:T1"]);
});
await t("Tên lệnh không tồn tại / lệnh limit: không đổi cấu hình", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit block khongtontai"); await e.say(ADMIN, ".limit block limit"); await e.say(ADMIN, ".limit block lockcmd"); await e.say(ADMIN, ".limit add nhomla");
  assert.deepEqual(Store.loadState(e.db, "T1").blocked, []);
  assert.deepEqual(Store.loadState(e.db, "T1").groups, []);
  assert.ok(e.adapter.images.length >= 4); assert.equal(e.adapter.texts.length, 0);
});
await t("UNBLOCK lệnh chưa BLOCK → thông báo, không lỗi", async () => {
  const e = await makeEnv(); await e.say(ADMIN, ".limit unblock pokemon");
  assert.ok(e.adapter.images.some((x) => /không nằm trong danh sách/.test(x.caption)));
});
await t("Thành viên thường không đổi được cấu hình (mọi alias)", async () => {
  const e = await makeEnv();
  for (const c of [".limit on", ".limit add giaitri", ".limit block ping", ".lockcmd add giaitri", ".limit lock giaitri", ".limit khoa ai", ".limit clear", ".limit clearblock", ".limit off", ".limit del giaitri", ".limit unblock ping"]) await e.say(MEMBER, c);
  assert.deepEqual(Store.loadState(e.db, "T1"), { enabled: false, groups: [], blocked: [] });
});
await t("limit luôn chạy được khi hệ thống bật & nhóm bị khóa (kể cả admin)", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit add admin"); await e.say(ADMIN, ".limit add hethong");
  await e.adapter.images.splice(0); await e.say(MEMBER, ".limit"); await e.say(ADMIN, ".limit add anti");
  assert.equal(e.adapter.images.length, 2);
  assert.ok(Store.loadState(e.db, "T1").groups.includes("anti"));
});
await t("Các nhóm chat độc lập", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit on", "A"); await e.say(ADMIN, ".limit add giaitri", "A");
  await e.say(MEMBER, ".pokemon", "A"); await e.say(MEMBER, ".pokemon", "B");
  assert.deepEqual(e.ran, ["pokemon:B"]);
  assert.equal(Store.loadState(e.db, "B").enabled, false);
});
await t("Lệnh chưa phân loại không bị khóa theo nhóm nhưng BLOCK riêng được", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit on");
  for (const c of Cat.CATEGORIES) await e.say(ADMIN, `.limit add ${c.id}`);
  await e.say(MEMBER, ".mystery"); assert.deepEqual(e.ran, ["mystery:T1"]);
  await e.say(ADMIN, ".limit block mystery"); await e.say(MEMBER, ".mystery"); assert.deepEqual(e.ran, ["mystery:T1"]);
});
await t("Xóa tin nhắn lỗi (FEATURE_UNAVAILABLE / lỗi khác) không crash, lệnh vẫn bị chặn", async () => {
  for (const code of ["FEATURE_UNAVAILABLE", "BOOM"]) {
    const e = await makeEnv({ deleteError: code });
    await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit block ping");
    await e.say(MEMBER, ".ping");
    assert.deepEqual(e.ran, []);
    assert.ok(e.adapter.images.some((x) => /BLOCK/.test(x.caption)));
  }
});
await t("Cảnh báo không spam khi gõ liên tục", async () => {
  const e = await makeEnv(); await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit block ping");
  e.adapter.images.length = 0;
  for (let i = 0; i < 5; i++) await e.say(MEMBER2, ".ping");
  assert.equal(e.adapter.images.filter((x) => /hạn chế/.test(x.caption)).length, 1);
  assert.deepEqual(e.ran, []);
});
await t("Tin nhắn thường / ngoài nhóm không bị ảnh hưởng", async () => {
  const e = await makeEnv(); await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit block ping");
  await e.say(MEMBER, "ping"); await e.say(MEMBER, "xin chào");
  assert.deepEqual(e.ran, []);
  await e.router.handleMessage({ threadId: "U1", type: 0, isSelf: false, data: { uidFrom: MEMBER, content: ".ping" } });
  assert.deepEqual(e.ran, ["ping:U1"]);
});
await t("Guard lỗi → fail-open, lệnh vẫn chạy", async () => {
  const e = await makeEnv();
  registerCommand(e.bot, { name: "badguard", run() {}, commandGuard() { throw new Error("x"); } }, "badguard.js");
  await e.say(MEMBER, ".ping"); assert.deepEqual(e.ran, ["ping:T1"]);
});
await t("Reload (replace) limit không nhân đôi guard", async () => {
  const e = await makeEnv();
  const before = e.bot.commandGuards.length;
  registerCommand(e.bot, limit, "limit.js", { replace: true });
  assert.equal(e.bot.commandGuards.length, before);
});

// ───────── 3. Lưu trữ ─────────
await t("Dữ liệu còn sau restart (mở lại file DB)", async () => {
  const e = await makeEnv();
  await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit add kinhte"); await e.say(ADMIN, ".limit block cauca");
  e.db.flush();
  const db2 = await createDatabase(e.dbPath, logger, 5);
  assert.deepEqual(Store.loadState(db2, "T1"), { enabled: true, groups: ["kinhte"], blocked: ["cauca"] });
});
await t("Migration từ LIMIT v1 giữ dữ liệu cũ, chạy 1 lần", async () => {
  const e = await makeEnv();
  e.db.query("INSERT INTO settings (thread_id,key,value) VALUES ('M','anti:limit:enabled','1'),('M','anti:limit:groups','system,game, moderation ,lạ')");
  const st = Store.loadState(e.db, "M");
  assert.equal(st.enabled, true);
  assert.deepEqual(st.groups.sort(), ["anti", "giaitri", "hethong"]);
  const legacy = e.db.query("SELECT value FROM settings WHERE thread_id='M' AND key='anti:limit:groups'")[0].value;
  assert.equal(legacy, "system,game, moderation ,lạ");
  Store.unlockGroup(e.db, "M", "anti");
  assert.ok(!Store.loadState(e.db, "M").groups.includes("anti"), "không migrate lại");
});
await t("Dữ liệu trống/sai định dạng không làm crash", async () => {
  const e = await makeEnv();
  for (const bad of ["", "not json", "{}", "[1,2,{}]", "null", '["nope","giaitri","giaitri"]']) {
    e.db.query("INSERT INTO settings (thread_id,key,value) VALUES ('X','limit:pro:groups',?) ON CONFLICT(thread_id,key) DO UPDATE SET value=excluded.value", [bad]);
    e.db.query("INSERT INTO settings (thread_id,key,value) VALUES ('X','limit:pro:blocked',?) ON CONFLICT(thread_id,key) DO UPDATE SET value=excluded.value", [bad]);
    const st = Store.loadState(e.db, "X");
    assert.ok(Array.isArray(st.groups) && Array.isArray(st.blocked));
  }
  assert.deepEqual(Store.loadState(e.db, "X").groups, ["giaitri"]);
});
await t("Không tạo bản ghi trùng", () => {
  const db = { rows: new Map(), query(sql, p = []) { const up = sql.trim().toUpperCase(); if (up.startsWith("SELECT")) { const k = `${p[0]}|${p[1]}`; return this.rows.has(k) ? [{ value: this.rows.get(k) }] : []; } this.rows.set(`${p[0]}|${p[1]}`, p[2]); return { changes: 1 }; } };
  Store.lockGroup(db, "Z", "ai"); const r = Store.lockGroup(db, "Z", "ai");
  assert.equal(r.ok, false); assert.deepEqual(Store.loadState(db, "Z").groups, ["ai"]);
  Store.blockCommand(db, "Z", "x"); assert.equal(Store.blockCommand(db, "Z", "x").ok, false);
});

// ───────── 4. Canvas ─────────
const isPng = (b) => Buffer.isBuffer(b) && b.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
const dims = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];
const cats = Cat.CATEGORIES.map((c) => ({ id: c.id, label: c.label, color: c.color, count: 7 }));
await t("Canvas bảng điều khiển hợp lệ", () => {
  const b = Canvas.renderPanel({ enabled: true, groups: ["giaitri"], blocked: ["ping"], categories: cats, totalCommands: 83, unclassified: 2, prefix: ".", threadName: "Box thử" });
  assert.ok(isPng(b)); assert.equal(dims(b)[0], 1080);
});
await t("Canvas nhóm: phân trang & nhóm rỗng", () => {
  const many = Array.from({ length: 60 }, (_, i) => `cmd${i}`);
  const c = cats[0];
  const p1 = Canvas.renderGroupDetail({ cat: c, commands: many, blocked: ["cmd1"], locked: true, enabled: true, page: 1, prefix: "." });
  const p3 = Canvas.renderGroupDetail({ cat: c, commands: many, blocked: [], locked: false, enabled: false, page: 3, prefix: "." });
  const p9 = Canvas.renderGroupDetail({ cat: c, commands: many, blocked: [], locked: false, enabled: false, page: 99, prefix: "." });
  const empty = Canvas.renderGroupDetail({ cat: c, commands: [], blocked: [], locked: false, enabled: true, page: 1, prefix: "." });
  for (const b of [p1, p3, p9, empty]) assert.ok(isPng(b));
});
await t("Canvas BLOCK: trống, 1 mục, nhiều trang", () => {
  const item = (i) => ({ name: `cmd${i}`, catLabel: "GIẢI TRÍ", catColor: "#ff4fd8", groupLocked: i % 2 === 0 });
  for (const n of [0, 1, 30]) assert.ok(isPng(Canvas.renderBlockList({ items: Array.from({ length: n }, (_, i) => item(i)), enabled: n % 2 === 0, page: 2, prefix: "." })));
});
await t("Lệnh hiển thị Canvas qua router (panel/list/blocklist) + dữ liệu thật", async () => {
  const e = await makeEnv(); await e.say(ADMIN, ".limit on"); await e.say(ADMIN, ".limit block ping");
  await e.say(MEMBER, ".limit"); await e.say(MEMBER, ".limit list giaitri"); await e.say(MEMBER, ".limit blocklist"); await e.say(MEMBER, ".limit list 5 2"); await e.say(MEMBER, ".limit status");
  assert.equal(e.adapter.images.length, 7); // 2 thẻ admin + 5 ảnh xem
  assert.ok(e.adapter.images.every((i) => isPng(i.buf)));
  assert.equal(e.adapter.texts.length, 0);
});
await t("FULL ẢNH: mọi lệnh con (thành công/lỗi/từ chối) đều trả ảnh PNG, không có chữ", async () => {
  const e = await makeEnv();
  const cmds = [".limit on", ".limit add giaitri", ".limit add giaitri", ".limit add 99", ".limit add", ".limit del giaitri", ".limit del giaitri", ".limit block ping", ".limit block ping", ".limit block khongco", ".limit block limit", ".limit block", ".limit unblock ping", ".limit unblock ping", ".limit clear", ".limit clearblock", ".limit off", ".limit help", ".limit bậy", ".limit status", ".limit list chuaphanloai", ".limit list zzz", ".limit blocklist"];
  for (const c of cmds) await e.say(ADMIN, c);
  for (const c of [".limit on", ".limit add anti", ".limit block ping"]) await e.say(MEMBER, c);
  assert.equal(e.adapter.texts.length, 0);
  assert.equal(e.adapter.images.length, cmds.length + 3);
  assert.ok(e.adapter.images.every((i) => isPng(i.buf) && i.buf.length > 5000));
});
await t("Canvas notice/status/help hợp lệ với dữ liệu lớn", () => {
  const chips = Array.from({ length: 60 }, (_, i) => ({ text: `lenh${i}`, color: "#22d3ee" }));
  for (const kind of ["ok", "lock", "unlock", "block", "warn", "deny", "info", "khong-ton-tai"]) assert.ok(isPng(Canvas.renderNotice({ kind, title: "x".repeat(60), lines: ["dòng dài ".repeat(30)], chips, hint: "h", enabled: true, groups: 0, blocked: 0, prefix: "." })));
  assert.ok(isPng(Canvas.renderHelp({ prefix: ".", enabled: false, note: "n" })));
  const cats = Array.from({ length: 10 }, (_, i) => ({ label: `G${i}`, color: "#fff", count: i, locked: i % 2 === 0 }));
  assert.ok(isPng(Canvas.renderStatus({ enabled: true, locked: [], blocked: Array.from({ length: 80 }, (_, i) => `c${i}`), totalCommands: 5, unclassified: 0, prefix: ".", categories: cats })));
  assert.ok(isPng(Canvas.renderStatus({ enabled: true, locked: [], blocked: [], totalCommands: 0, unclassified: 0, prefix: ".", categories: cats })));
});
await t("Gửi ảnh lỗi → fallback văn bản, không crash", async () => {
  const e = await makeEnv({ failImage: true }); await e.say(MEMBER, ".limit"); await e.say(MEMBER, ".limit list giaitri"); await e.say(MEMBER, ".limit blocklist");
  assert.ok(e.adapter.texts.length >= 3);
});
await t("Thư mục tạm không để lại file ảnh", async () => {
  const dir = path.join(ROOT, "Core/Commands/data/ADMIN/Limit/temp");
  const left = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  assert.deepEqual(left, []);
});

fs.rmSync(TMP, { recursive: true, force: true });
for (const r of results) console.log(r);
console.log(`PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
