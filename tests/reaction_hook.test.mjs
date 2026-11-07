/** Test: thả tim vào tin nhắn phòng (onReaction) phải tham gia được phòng. Chạy: node tests/reaction_hook.test.mjs */
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
const { registerCommand, unregisterCommand } = await imp("Handlers/HandleCommandLoader.js");
const ott = (await imp("Core/Commands/ott.js")).default;
const Rooms = await imp("Core/Commands/data/GIAITRI/Ott/rooms.js");

const logger = { info() {}, warn() {}, error() {}, debug() {} };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "react-test-"));
let pass = 0, fail = 0; const res = [];
async function t(n, f) { try { await f(); pass++; } catch (e) { fail++; res.push(`FAIL ${n}: ${e.message}`); } }

const HOST = "11", P2 = "22", P3 = "33", THREAD = "G1";
async function env(sentIds = { msgId: "5001", cliMsgId: "6001" }) {
  Rooms.deleteRoom?.(THREAD);
  const db = await createDatabase(path.join(TMP, `d${Math.random()}.db`), logger, 5);
  const texts = [];
  const adapter = {
    sendText: async ({ text }) => { texts.push(text); return { message: { ...sentIds } }; },
    sendImage: async () => ({}), getUserInfo: async () => ({}), getGroupAdmins: async () => ({ adminIds: [] }),
  };
  const bot = createBotInstance({ config: { botPrefix: ".", ownerZaloId: "999", legacyAdminBot: [], legacySupportBot: [] }, db, adapter, logger });
  const r = registerCommand(bot, ott, "ott.js"); assert.ok(r.ok, JSON.stringify(r));
  const router = createCommandRouter(bot);
  const say = (uid, text) => router.handleMessage({ threadId: THREAD, type: 1, isSelf: false, data: { uidFrom: uid, dName: "U" + uid, content: text } });
  // đúng dạng sự kiện reaction của zca-mt: id tin bị thả tim nằm trong data.content.rMsg
  const react = (uid, { g = "5001", c = "6001", icon = "/-heart" } = {}) => router.runBackgroundReactionHooks({ threadId: THREAD, isSelf: false, isGroup: true, data: { actionId: "x", msgId: "9999", cliMsgId: "8888", uidFrom: uid, dName: "U" + uid, content: { rMsg: [{ gMsgID: g, cMsgID: c }], rIcon: icon, rType: 5 } } });
  return { bot, router, say, react, texts };
}

await t("Loader giữ onReaction và đăng ký hook nền", async () => {
  const e = await env();
  assert.ok(e.bot.backgroundHooks.some((c) => c.name === "ott" && typeof c.onReaction === "function"));
  const e2 = await env();
  unregisterCommand(e2.bot, "ott");
  assert.ok(!e2.bot.backgroundHooks.some((c) => c.name === "ott"));
});
await t("Thả tim đúng tin phòng → người 2 vào phòng", async () => {
  const e = await env(); await e.say(HOST, ".ott tp");
  assert.equal(Rooms.getRoom(THREAD).players.length, 1);
  await e.react(P2);
  assert.deepEqual(Rooms.getRoom(THREAD).players.map((p) => p.uid), [HOST, P2]);
  assert.ok(e.texts.some((x) => /ĐÃ ĐỦ NGƯỜI CHƠI/.test(x)));
});
await t("Khớp theo cMsgID khi chỉ trùng id client", async () => {
  const e = await env(); await e.say(HOST, ".ott tp");
  await e.react(P2, { g: "zzz", c: "6001" });
  assert.equal(Rooms.getRoom(THREAD).players.length, 2);
});
await t("Thả tim vào tin KHÁC → bỏ qua", async () => {
  const e = await env(); await e.say(HOST, ".ott tp");
  await e.react(P2, { g: "1", c: "2" });
  assert.equal(Rooms.getRoom(THREAD).players.length, 1);
});
await t("Icon không phải tim → bỏ qua", async () => {
  const e = await env(); await e.say(HOST, ".ott tp");
  await e.react(P2, { icon: "/-strong" });
  assert.equal(Rooms.getRoom(THREAD).players.length, 1);
});
await t("Phòng đầy: người thứ 3 không vào; thả tim 2 lần không nhân đôi", async () => {
  const e = await env(); await e.say(HOST, ".ott tp");
  await e.react(P2); await e.react(P2); await e.react(P3);
  assert.equal(Rooms.getRoom(THREAD).players.length, 2);
});
await t("Không lấy được id tin phòng → vẫn tham gia theo nhóm (degraded)", async () => {
  const e = await env({}); await e.say(HOST, ".ott tp");
  await e.react(P2);
  assert.equal(Rooms.getRoom(THREAD).players.length, 2);
});
await t("Reaction của chính bot (isSelf) và không có phòng → không lỗi", async () => {
  const e = await env();
  await e.router.runBackgroundReactionHooks({ threadId: THREAD, isSelf: true, data: {} });
  await e.react(P2);
  await e.router.runBackgroundReactionHooks(undefined);
  await e.router.runBackgroundReactionHooks({});
});
await t("Hook onReaction lỗi không làm hỏng hook khác", async () => {
  const e = await env(); let ok = 0;
  registerCommand(e.bot, { name: "bad", group: "x", async run() {}, async onReaction() { throw new Error("boom"); } }, "bad.js");
  registerCommand(e.bot, { name: "good", group: "x", async run() {}, async onReaction() { ok++; } }, "good.js");
  await e.react(P2);
  assert.equal(ok, 1);
});
await t("extractReactionMeta: đọc đúng rIcon/rMsg, không nhầm id sự kiện", () => {
  const m = Rooms.extractReactionMeta({ threadId: "G", data: { msgId: "evt", uidFrom: "5", content: { rMsg: [{ gMsgID: "a", cMsgID: "b" }], rIcon: "/-heart" } } });
  assert.deepEqual([m.msgId, m.cliMsgId, m.icon, m.uid], ["a", "b", "/-heart", "5"]);
  assert.ok(!m.msgIds.includes("evt"));
  assert.ok(Rooms.isHeartIcon(m.icon));
});

console.log(res.join("\n") || "");
console.log(`PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
