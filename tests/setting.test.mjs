/**
 * Test `.setting` (ACCOUNT CONTROL). Chạy: node tests/setting.test.mjs
 * Dùng API giả (không gọi Zalo thật). Ảnh/video giả được phục vụ qua fetch giả.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const setting = (await imp("Core/Commands/setting.js")).default;
const Canvas = await imp("Core/Commands/data/ADMIN/Setting/settingCanvas.js");
const S = await imp("Core/Commands/data/ADMIN/Setting/settingSession.js");
const A = await imp("Core/Commands/data/ADMIN/Setting/settingActions.js");
const sharp = (await import(pathToFileURL(path.join(ROOT, "node_modules/sharp/lib/index.js")).href).catch(() => import("sharp"))).default;

const logger = { info() {}, warn() {}, error() {}, debug() {} };
const OWNER = "100", ADMIN = "101", USER = "200", OTHER_ADMIN = "102";
const config = { botPrefix: ".", ownerZaloId: OWNER, legacyAdminBot: [ADMIN, OTHER_ADMIN], legacySupportBot: [] };
let pass = 0, fail = 0; const out = [];
async function t(n, f) { A.clearSettingProviders(); S.resetForTests(); A.clearProfileCache(); try { await f(); pass++; } catch (e) { fail++; out.push(`FAIL ${n}: ${e.message}`); } }
const isPng = (b) => Buffer.isBuffer(b) && b.subarray(0, 4).toString("hex") === "89504e47";

// ---- ảnh/video giả ----
const PNG = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#3366ff" } }).png().toBuffer();
const TINY = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#000" } }).png().toBuffer();
const MEDIA = { "https://cdn.test/a.jpg": PNG, "https://cdn.test/tiny.jpg": TINY, "https://cdn.test/v.mp4": Buffer.alloc(5000, 1), "https://cdn.test/big.mp4": Buffer.alloc(10, 1), "https://cdn.test/notimg.jpg": Buffer.from("khong phai anh") };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const body = MEDIA[String(url)];
  if (!body) return new Response("nf", { status: 404 });
  return new Response(body, { status: 200, headers: { "content-length": String(body.length) } });
};

// ---- môi trường ----
let MSG_SEQ = 0; // msgId duy nhất toàn bộ test (như thật)
function env({ api = {}, cfg = config } = {}) {
  const sent = [];
  const adapter = {
    raw: api,
    sendImage: async ({ imagePath, threadId }) => { sent.push({ k: "img", threadId, ok: isPng(fs.readFileSync(imagePath)) }); return {}; },
    sendText: async ({ text, threadId }) => { sent.push({ k: "txt", threadId, text }); return {}; },
    getGroupAdmins: async () => null,
  };
  const msg = (uid, content, extra = {}) => ({ threadId: "T1", type: 0, isSelf: false, data: { uidFrom: uid, msgId: `m${++MSG_SEQ}`, content, ...(extra.data || {}) }, ...extra.top });
  const cmd = (uid, ...args) => setting.run({ adapter, message: msg(uid, `.setting ${args.join(" ")}`), args, config: cfg, logger });
  const hook = async (m) => { await setting.onMessage({ adapter, message: m, config: cfg, logger }); return m; };
  const photo = (uid, url = "https://cdn.test/a.jpg", extra = {}) => msg(uid, { href: url, thumb: url, params: "{}" }, { data: { msgType: "chat.photo" }, ...extra });
  const video = (uid, url = "https://cdn.test/v.mp4", params = { duration: 8000, fileSize: 5000 }) => msg(uid, { href: url, thumb: url, params: JSON.stringify(params) }, { data: { msgType: "chat.video.msg" } });
  const text = (uid, s, extra = {}) => msg(uid, s, extra);
  return { adapter, sent, cmd, hook, photo, video, text, msg };
}
const profileApi = (over = {}) => ({
  getOwnId: () => "999",
  fetchAccountInfo: async () => ({ profile: { userId: "999", displayName: over.name ?? "Bot Cũ", avatar: "", gender: 0, dob: 0, sdob: "05/06/2000" } }),
  ...over.api,
});
const imgs = (e) => e.sent.filter((s) => s.k === "img");
const lastSent = (e) => e.sent[e.sent.length - 1];

// ═══════════ 1. Canvas ═══════════
await t("Canvas: bảng chính render PNG (đủ/ thiếu dữ liệu)", async () => {
  for (const d of [{}, { profile: { name: "Gia Phát", uid: "123" }, connected: true, support: { nhatki: false, baiviet: false, video: false, logo: true, ten: true } }, { connected: false, activeFeature: "logo" }]) {
    const b = await Canvas.renderMain(d); assert.ok(isPng(b)); assert.ok(b.length < 4_000_000, "ảnh quá lớn " + b.length);
  }
});
await t("Canvas: đủ 9 trạng thái + preview + chip", async () => {
  for (const kind of Canvas.STATE_KINDS) { const b = await Canvas.renderState({ kind, subtitle: "Nội dung thử rất dài ".repeat(8), lines: ["• dòng 1", "dòng 2"], rows: [{ l: "A", v: "B" }], chips: [{ k: ".setting huy", d: "hủy" }], expireSec: 95, step: { index: 1, total: 2, label: "TEST" } }); assert.ok(isPng(b), kind); }
  assert.ok(isPng(await Canvas.renderState({ kind: "wait", preview: PNG })));
  assert.equal(Canvas.STATE_KINDS.length, 9);
});

// ═══════════ 2. Quyền ═══════════
await t("Người thường: bị từ chối, KHÔNG tạo phiên, hook bỏ qua", async () => {
  const e = env({ api: profileApi() });
  await e.cmd(USER, "logo");
  assert.equal(S.activeCount(), 0); assert.equal(imgs(e).length, 1); assert.ok(imgs(e)[0].ok);
  await e.hook(e.photo(USER)); assert.equal(imgs(e).length, 1);
});
await t("Owner và Admin được dùng", async () => {
  const e = env({ api: profileApi({ api: { changeAccountAvatar: async () => "" } }) });
  await e.cmd(OWNER, "logo"); await e.cmd(ADMIN, "logo");
  assert.equal(S.activeCount(), 2);
});
await t("Mất quyền giữa chừng: phiên bị huỷ ở bước nhận dữ liệu", async () => {
  const cfg = { ...config, legacyAdminBot: [ADMIN] };
  const e = env({ api: profileApi({ api: { changeAccountAvatar: async () => "" } }), cfg });
  await e.cmd(ADMIN, "logo"); assert.equal(S.activeCount(), 1);
  cfg.legacyAdminBot = [];
  await e.hook(e.photo(ADMIN)); assert.equal(S.activeCount(), 0);
});

// ═══════════ 3. Bảng chính / help ═══════════
await t(".setting và .setting help gửi bảng chính, không đụng phiên đang chạy", async () => {
  const e = env({ api: profileApi({ api: { changeAccountAvatar: async () => "" } }) });
  await e.cmd(OWNER, "logo"); const s0 = S.getSession(OWNER); const step0 = s0.step;
  await e.cmd(OWNER); await e.cmd(OWNER, "help");
  assert.equal(S.getSession(OWNER), s0); assert.equal(S.getSession(OWNER).step, step0);
});

// ═══════════ 4. Đổi logo (API thật giả lập) ═══════════
await t("logo: gửi ảnh không reply → gọi changeAccountAvatar bằng file JPEG, dọn file tạm", async () => {
  let called = null;
  const e = env({ api: profileApi({ api: { changeAccountAvatar: async (p) => { called = p; assert.ok(fs.existsSync(p)); const m = await sharp(p).metadata(); assert.equal(m.format, "jpeg"); assert.equal(m.width, m.height); return ""; } } }) });
  await e.cmd(OWNER, "logo");
  const m = await e.hook(e.photo(OWNER));
  assert.ok(called); assert.ok(m.__settingConsumed);
  assert.equal(S.activeCount(), 0); assert.ok(!fs.existsSync(called), "file tạm phải bị xoá");
  assert.ok(imgs(e).length >= 3 && imgs(e).every((i) => i.ok));
});
await t("logo: ảnh sai (không phải ảnh / quá nhỏ) → báo lỗi, không gọi API", async () => {
  let n = 0; const e = env({ api: profileApi({ api: { changeAccountAvatar: async () => { n++; return ""; } } }) });
  await e.cmd(OWNER, "logo"); await e.hook(e.photo(OWNER, "https://cdn.test/notimg.jpg")); assert.equal(n, 0); assert.equal(S.activeCount(), 0);
  await e.cmd(OWNER, "logo"); await e.hook(e.photo(OWNER, "https://cdn.test/tiny.jpg")); assert.equal(n, 0); assert.equal(S.activeCount(), 0);
});
await t("logo: gửi sai loại (chữ / video) → nhắc gửi lại, giữ phiên", async () => {
  const e = env({ api: profileApi({ api: { changeAccountAvatar: async () => "" } }) });
  await e.cmd(OWNER, "logo"); await e.hook(e.text(OWNER, "hello")); await e.hook(e.video(OWNER));
  assert.equal(S.activeCount(), 1); assert.equal(S.getSession(OWNER).step, "image");
});
await t("logo: API Zalo ném lỗi → báo thất bại (không báo thành công)", async () => {
  const e = env({ api: profileApi({ api: { changeAccountAvatar: async () => { throw new Error("Zalo ECONNRESET"); } } }) });
  await e.cmd(OWNER, "logo"); await e.hook(e.photo(OWNER));
  assert.equal(S.activeCount(), 0); assert.ok(imgs(e).length >= 3);
  const r = await A.changeAvatar({ changeAccountAvatar: async () => { throw new Error("login expired 401"); } }, "x"); assert.equal(r.ok, false); assert.equal(r.code, "AUTH");
});
await t("logo: thư viện không có API → báo chưa hỗ trợ, không tạo phiên", async () => {
  const e = env({ api: profileApi() }); await e.cmd(OWNER, "logo"); assert.equal(S.activeCount(), 0);
});

// ═══════════ 5. Đổi tên ═══════════
await t("ten: gọi updateProfile với dob/gender hiện tại, xác minh lại tên", async () => {
  let payload = null, name = "Bot Cũ";
  const api = { getOwnId: () => "999", fetchAccountInfo: async () => ({ profile: { userId: "999", displayName: name, gender: 1, dob: 0, sdob: "05/06/2000" } }), updateProfile: async (p) => { payload = p; name = p.profile.name; return ""; } };
  const e = env({ api }); await e.cmd(OWNER, "ten"); await e.hook(e.text(OWNER, "  Gia   Phát  VIP "));
  assert.deepEqual(payload, { profile: { name: "Gia Phát VIP", dob: "2000-06-05", gender: 1 } });
  assert.equal(S.activeCount(), 0);
});
await t("ten: tên rỗng/dài/chỉ số/trùng bị từ chối, không gọi API", async () => {
  let n = 0; const api = { ...profileApi(), updateProfile: async () => { n++; return ""; } };
  for (const bad of ["   ", "a", "x".repeat(41), "12345 !!!"]) { const e = env({ api }); await e.cmd(OWNER, "ten"); await e.hook(e.text(OWNER, bad)); assert.equal(n, 0, bad); assert.equal(S.getSession(OWNER)?.step, "text", "giữ phiên để nhập lại: " + bad); }
  const e = env({ api }); await e.cmd(OWNER, "ten"); await e.hook(e.text(OWNER, "Bot Cũ")); assert.equal(n, 0); assert.equal(S.activeCount(), 0);
});
await t("ten: Zalo từ chối (giới hạn đổi tên) → báo thất bại kèm nguyên nhân", async () => {
  const api = { ...profileApi(), updateProfile: async () => { throw new Error("Bạn chỉ được đổi tên 1 lần trong 45 ngày"); } };
  const r = await A.changeName(api, "Tên Mới"); assert.equal(r.ok, false); assert.ok(/45 ngày/.test(r.text));
});
await t("ten: thiếu ngày sinh → không đổi (tránh ghi đè sai)", async () => {
  const api = { fetchAccountInfo: async () => ({ profile: { displayName: "A B", gender: 0, dob: 0, sdob: "" } }), updateProfile: async () => "" };
  const r = await A.changeName(api, "Tên Mới"); assert.equal(r.ok, false); assert.equal(r.code, "NO_PROFILE");
});

// ═══════════ 6. Đăng bài: provider cắm ngoài ═══════════
await t("nhatki/baiviet/video: chưa có provider → báo chưa hỗ trợ, không giả lập thành công", async () => {
  for (const k of ["nhatki", "baiviet", "video"]) { const e = env({ api: profileApi() }); await e.cmd(OWNER, k); assert.equal(S.activeCount(), 0, k); }
  const r = await A.publish("post", {}); assert.equal(r.ok, false); assert.equal(r.code, "UNSUPPORTED");
});
await t("nhatki: video → provider diary nhận file + metadata, dọn file", async () => {
  let got = null; A.registerSettingProvider("diary", async (a) => { got = a; assert.ok(fs.existsSync(a.filePath)); return { ok: true, id: "D1" }; });
  const e = env({ api: profileApi() }); await e.cmd(OWNER, "nhatki"); await e.hook(e.video(OWNER));
  assert.ok(got); assert.equal(got.durationSec, 8); assert.ok(!fs.existsSync(got.filePath)); assert.equal(S.activeCount(), 0);
});
await t("baiviet: ảnh rồi caption (emoji/tiếng Việt) → provider post; không nhầm caption khác người", async () => {
  let got = null; A.registerSettingProvider("post", async (a) => { got = a; return { ok: true }; });
  const e = env({ api: profileApi() }); await e.cmd(OWNER, "baiviet"); await e.hook(e.photo(OWNER));
  assert.equal(S.getSession(OWNER).step, "caption");
  await e.hook(e.text(ADMIN, "caption của người khác")); assert.equal(got, null);       // không phiên → bỏ qua
  await e.hook(e.text(OWNER, "Xin chào Việt Nam 🇻🇳 ✨"));
  assert.equal(got.caption, "Xin chào Việt Nam 🇻🇳 ✨"); assert.equal(got.mime, "image/jpeg"); assert.equal(S.activeCount(), 0);
});
await t("baiviet: boqua = đăng không caption; caption quá dài bị từ chối", async () => {
  let got = null; A.registerSettingProvider("post", async (a) => { got = a; return { ok: true }; });
  const e = env({ api: profileApi() }); await e.cmd(OWNER, "baiviet"); await e.hook(e.photo(OWNER)); await e.hook(e.text(OWNER, "x".repeat(2500))); assert.equal(got, null); assert.equal(S.getSession(OWNER).step, "caption");
  await e.hook(e.text(OWNER, "boqua")); assert.equal(got.caption, "");
});
await t("video: video + caption → provider video; video quá nặng/dài bị từ chối", async () => {
  let got = null; A.registerSettingProvider("video", async (a) => { got = a; return { ok: true }; });
  const e = env({ api: profileApi() }); await e.cmd(OWNER, "video");
  await e.hook(e.video(OWNER, "https://cdn.test/v.mp4", { duration: 20 * 60 * 1000, fileSize: 5000 })); assert.equal(S.getSession(OWNER).step, "video");
  await e.hook(e.video(OWNER, "https://cdn.test/v.mp4", { duration: 8000, fileSize: 500 * 1048576 })); assert.equal(S.getSession(OWNER).step, "video");
  await e.hook(e.video(OWNER)); assert.equal(S.getSession(OWNER).step, "caption");
  await e.hook(e.text(OWNER, "Video đẹp")); assert.equal(got.caption, "Video đẹp");
});
await t("provider báo thất bại / ném lỗi / timeout → không báo thành công, timeout không đăng lại", async () => {
  A.registerSettingProvider("post", async () => ({ ok: false, text: "Zalo từ chối" }));
  let r = await A.publish("post", {}); assert.equal(r.ok, false);
  A.registerSettingProvider("post", async () => { throw new Error("socket hang up"); }); r = await A.publish("post", {}); assert.equal(r.ok, false);
  A.LIMITS.providerTimeoutMs.post = 30; let calls = 0; A.registerSettingProvider("post", () => { calls++; return new Promise(() => {}); });
  r = await A.publish("post", {}); assert.equal(r.code, "UNCERTAIN"); assert.equal(calls, 1);
  A.LIMITS.providerTimeoutMs.post = 60_000;
});
await t("không đăng trùng: gọi publish song song cùng khoá bị chặn", async () => {
  let calls = 0; A.registerSettingProvider("post", async () => { calls++; await new Promise((r) => setTimeout(r, 40)); return { ok: true }; });
  const [a, b] = await Promise.all([A.publish("post", {}, { lockKey: "acc" }), A.publish("post", {}, { lockKey: "acc" })]);
  assert.equal(calls, 1); assert.ok([a, b].some((x) => x.code === "BUSY"));
});

// ═══════════ 7. Phiên: đồng thời, huỷ, hết hạn, chuyển phiên ═══════════
await t("hai admin cùng thao tác: phiên độc lập, không ghi đè", async () => {
  const got = []; A.registerSettingProvider("post", async (a) => { got.push(a.caption); return { ok: true }; });
  const e = env({ api: profileApi({ api: { changeAccountAvatar: async () => "" } }) });
  await e.cmd(OWNER, "baiviet"); await e.cmd(ADMIN, "baiviet"); assert.equal(S.activeCount(), 2);
  await e.hook(e.photo(OWNER)); await e.hook(e.photo(ADMIN));
  await Promise.all([e.hook(e.text(ADMIN, "của admin")), e.hook(e.text(OWNER, "của owner"))]);
  assert.deepEqual(got.sort(), ["của admin", "của owner"]); assert.equal(S.activeCount(), 0);
});
await t("phiên chỉ nhận trong đúng cuộc trò chuyện", async () => {
  const e = env({ api: profileApi({ api: { changeAccountAvatar: async () => "" } }) });
  await e.cmd(OWNER, "logo");
  const m = e.photo(OWNER, "https://cdn.test/a.jpg", { top: { threadId: "T-KHAC" } }); await e.hook(m);
  assert.equal(S.activeCount(), 1); assert.ok(!m.__settingConsumed);
});
await t(".setting huy huỷ phiên + xoá file tạm; từ 'huy' khi chờ caption cũng huỷ", async () => {
  A.registerSettingProvider("post", async () => ({ ok: true }));
  const e = env({ api: profileApi() }); await e.cmd(OWNER, "baiviet"); await e.hook(e.photo(OWNER));
  const files = [...S.getSession(OWNER).data.files]; assert.ok(files.length >= 1 && files.every((f) => fs.existsSync(f)));
  await e.cmd(OWNER, "huy"); assert.equal(S.activeCount(), 0); assert.ok(files.every((f) => !fs.existsSync(f)));
  await e.cmd(OWNER, "baiviet"); await e.hook(e.photo(OWNER)); await e.hook(e.text(OWNER, "huy")); assert.equal(S.activeCount(), 0);
  await e.cmd(OWNER, "huy"); // không có phiên: không lỗi
});
await t("hết hạn: tự huỷ, xoá file tạm, bot báo bằng Canvas", async () => {
  A.registerSettingProvider("post", async () => ({ ok: true }));
  S.setTtlForTests(500); const e = env({ api: profileApi() });
  await e.cmd(OWNER, "baiviet"); await e.hook(e.photo(OWNER));
  const files = [...S.getSession(OWNER).data.files]; const before = imgs(e).length;
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(S.activeCount(), 0); assert.ok(files.every((f) => !fs.existsSync(f))); assert.ok(imgs(e).length > before, "phải có thẻ hết hạn");
  await e.hook(e.text(OWNER, "caption muộn")); // sau hết hạn: bị bỏ qua
});
await t("gọi chức năng khác khi đang thao tác: chuyển phiên rõ ràng; đang xử lý thì từ chối", async () => {
  A.registerSettingProvider("post", async () => ({ ok: true }));
  const e = env({ api: profileApi({ api: { changeAccountAvatar: async () => "" } }) });
  await e.cmd(OWNER, "baiviet"); await e.cmd(OWNER, "logo"); assert.equal(S.getSession(OWNER).type, "logo");
  const s = S.getSession(OWNER); S.markProcessing(s); await e.cmd(OWNER, "baiviet"); assert.equal(S.getSession(OWNER).type, "logo", "không bị thay khi đang xử lý");
});
await t("đang xử lý: tin nhắn thêm bị nuốt, không gọi API lần 2", async () => {
  let n = 0; const e = env({ api: profileApi({ api: { changeAccountAvatar: async () => { n++; await new Promise((r) => setTimeout(r, 80)); return ""; } } }) });
  await e.cmd(OWNER, "logo");
  const p1 = e.hook(e.photo(OWNER)); await new Promise((r) => setTimeout(r, 15)); const p2 = e.hook(e.photo(OWNER)); const p3 = e.hook(e.photo(OWNER));
  await Promise.all([p1, p2, p3]); assert.equal(n, 1);
});
await t("sự kiện trùng msgId chỉ xử lý một lần", async () => {
  let n = 0; const e = env({ api: profileApi({ api: { changeAccountAvatar: async () => { n++; return ""; } } }) });
  await e.cmd(OWNER, "logo"); const m = e.photo(OWNER); await e.hook(m); await e.cmd(OWNER, "logo"); await e.hook({ ...m }); assert.equal(n, 1);
});

// ═══════════ 8. Hook và lệnh ═══════════
await t("tin nhắn bắt đầu bằng prefix là lệnh: hook không nuốt, không dùng làm caption", async () => {
  A.registerSettingProvider("post", async () => ({ ok: true }));
  const e = env({ api: profileApi() }); await e.cmd(OWNER, "baiviet"); await e.hook(e.photo(OWNER));
  const m = e.text(OWNER, ".help"); await e.hook(m); assert.equal(m.data.content, ".help"); assert.equal(S.getSession(OWNER).step, "caption");
});
await t("caption/tên được nuốt (content rỗng) để lệnh noPrefix khác không chiếm", async () => {
  const api = { ...profileApi(), updateProfile: async () => "" };
  const e = env({ api }); await e.cmd(OWNER, "ten"); const m = e.text(OWNER, "Tên Mới"); await e.hook(m); assert.equal(m.data.content, "");
});
await t("lệnh sai cú pháp / isSelf / không uid không làm hỏng", async () => {
  const e = env({ api: profileApi() }); await e.cmd(OWNER, "linhtinh");
  await setting.onMessage({ adapter: e.adapter, message: { isSelf: true, threadId: "T1", data: {} }, config, logger });
  await setting.onMessage({ adapter: e.adapter, message: null, config, logger });
});
await t("adapter.sendImage lỗi → gửi chữ dự phòng (không im lặng, không crash)", async () => {
  const e = env({ api: profileApi() }); e.adapter.sendImage = async () => { throw new Error("boom"); };
  await e.cmd(OWNER, "huy"); assert.ok(e.sent.some((s) => s.k === "txt"));
});
await t("metadata lệnh + phân loại LIMIT = admin", async () => {
  assert.equal(setting.name, "setting"); assert.equal(typeof setting.onMessage, "function"); assert.equal(typeof setting.run, "function");
  const Cat = await imp("Core/Commands/data/ADMIN/Limit/categories.js");
  const c = Cat.categoryOf ? Cat.categoryOf("setting", { group: "system" }) : null;
  if (c) assert.equal(c.id ?? c, "admin");
});

// ═══════════ 9. Tiện ích ═══════════
await t("extractMedia nhận đúng ảnh/video (content object hoặc chuỗi JSON), ms→giây", async () => {
  assert.equal(A.extractMedia({ msgType: "chat.photo", content: { href: "https://x.test/a.jpg" } }).kind, "image");
  const v = A.extractMedia({ msgType: "chat.video.msg", content: JSON.stringify({ href: "https://x.test/v.mp4", params: JSON.stringify({ duration: 12000, fileSize: 99 }) }) });
  assert.deepEqual([v.kind, v.durationSec, v.size], ["video", 12, 99]);
  assert.equal(A.extractMedia({ msgType: "webchat", content: "chữ" }).kind, null); assert.equal(A.extractMedia(null).kind, null);
});
await t("assertSafeUrl chặn http/localhost/IP nội bộ", async () => {
  for (const u of ["http://a.test/x", "https://localhost/x", "https://127.0.0.1/x", "https://192.168.1.2/x", "https://10.0.0.1/x", "not a url"]) assert.throws(() => A.assertSafeUrl(u), u);
  A.assertSafeUrl("https://f-zl.zdn.vn/x.jpg");
});
await t("toIsoDob: sdob dd/mm/yyyy và timestamp", async () => {
  assert.equal(A.toIsoDob({ sdob: "05/06/2000" }), "2000-06-05"); assert.equal(A.toIsoDob({ sdob: "", dob: 0 }), null);
  assert.equal(A.toIsoDob({ sdob: "", dob: Date.UTC(1999, 0, 2, 0, 0, 0) / 1000 }), "1999-01-02");
});
await t("downloadToFile: quá dung lượng / HTTP lỗi / dọn file dở dang", async () => {
  const f = path.join(os.tmpdir(), `dl-${Date.now()}`);
  await assert.rejects(() => A.downloadToFile("https://cdn.test/v.mp4", f, { maxBytes: 100 }), /vượt dung lượng/); assert.ok(!fs.existsSync(f));
  await assert.rejects(() => A.downloadToFile("https://cdn.test/none", f, { maxBytes: 1e6 }), /404/);
});
await t("file tạm: sau toàn bộ test thư mục temp không còn file mồ côi", async () => {
  S.resetForTests(); await new Promise((r) => setTimeout(r, 50));
  const left = fs.readdirSync(S.TEMP_DIR).filter((x) => x.startsWith("set-") || x.startsWith("out-")); assert.deepEqual(left, []);
});

globalThis.fetch = realFetch;
console.log(out.join("\n") || "");
console.log(`PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
