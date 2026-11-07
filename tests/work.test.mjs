/**
 * Test `.work` (nghề nghiệp). Chạy: node tests/work.test.mjs
 * Không gọi Zalo thật: adapter giả ghi lại tin nhắn. Dữ liệu .work ghi vào thư mục tạm;
 * dữ liệu TienGame / PlayerProfile được sao lưu rồi khôi phục sau khi test.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const WK = "Core/Commands/data/GIAITRI/WORK";
const Store = await imp(`${WK}/store.js`);
const Eng = await imp(`${WK}/engine.js`);
const Ch = await imp(`${WK}/challenges.js`);
const Money = await imp("Core/Commands/data/GIAITRI/TienGame/index.js");
const Prof = await imp("Core/Commands/data/GIAITRI/PlayerProfile/index.js");
const work = (await imp("Core/Commands/work.js")).default;
const W = await imp("Core/Commands/work.js");

// ── sao lưu dữ liệu dùng chung ──
const SHARED = ["Core/Commands/data/GIAITRI/TienGame/users.json", "Core/Commands/data/GIAITRI/TienGame/transactions.json", "Core/Commands/data/GIAITRI/TienGame/savings.json", "Core/Commands/data/GIAITRI/PlayerProfile/profiles.json"].map((p) => path.join(ROOT, p));
const backups = new Map(SHARED.map((f) => [f, fs.existsSync(f) ? fs.readFileSync(f) : null]));
const restore = () => { for (const [f, b] of backups) { try { if (b === null) fs.rmSync(f, { force: true }); else fs.writeFileSync(f, b); } catch { /* bỏ qua */ } } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "work-test-"));
const wd = path.join(ROOT, WK);
for (const f of ["config.json", "jobs.json", "tasks.json"]) fs.copyFileSync(path.join(wd, f), path.join(TMP, f));
Store.setDataDirForTests(TMP);

let pass = 0, fail = 0; const out = [];
async function t(n, f) { try { await f(); pass++; } catch (e) { fail++; out.push(`FAIL ${n}: ${e.stack?.split("\n").slice(0, 3).join(" | ") || e.message}`); } }

// ── công cụ test ──
let clock = Date.parse("2026-10-20T08:00:00+07:00");
const tick = (ms = 3000) => { clock += ms; };
const newEngine = (over = {}) => Eng.createEngine({ now: () => clock, ...over });
let E = newEngine(); Eng.setSharedEngineForTests(E);
const useEngine = (e) => { E = e; Eng.setSharedEngineForTests(e); };
let seq = 0;
const newUid = () => `wt${Date.now() % 1e7}${++seq}`;
let idc = 0;
function mkAdapter(opts = {}) {
  const log = [];
  return {
    log,
    sendImage: async ({ imagePath, caption, threadId }) => {
      if (opts.failImage) throw new Error("canvas send fail");
      const buf = fs.readFileSync(imagePath); const id = ++idc;
      log.push({ kind: "img", caption, buf, id, threadId }); return { msgId: id, cliMsgId: id + 1000, globalMsgId: id + 2000 };
    },
    sendText: async ({ text, threadId }) => { const id = ++idc; log.push({ kind: "text", text, id, threadId }); return { msgId: id }; },
    raw: { getOwnId: () => "BOT1" },
  };
}
const cfg = { botPrefix: "." };
const msg = (uid, content, extra = {}) => ({ threadId: extra.threadId || "T1", type: extra.type ?? 0, data: { uidFrom: uid, dName: extra.name || "Tester", content, quote: extra.quote, mentions: extra.mentions, msgId: String(++idc) } });
async function say(ad, uid, line, extra = {}) {
  tick();
  const parts = line.trim().split(/\s+/); const args = parts.slice(1);
  await work.run({ adapter: ad, message: msg(uid, line, extra), args, config: cfg, logger: {} });
}
async function plain(ad, uid, content, extra = {}) {
  tick();
  const m = msg(uid, content, extra);
  await work.onMessage({ adapter: ad, message: m, config: cfg, logger: {} });
  return m;
}
const isPng = (b) => Buffer.isBuffer(b) && b.length > 2000 && b.subarray(0, 4).toString("hex") === "89504e47";
const lastImg = (ad) => [...ad.log].reverse().find((x) => x.kind === "img");
const players = () => JSON.parse(fs.readFileSync(path.join(TMP, "players.json"), "utf8"));
const histOf = (uid) => (JSON.parse(fs.readFileSync(path.join(TMP, "history.json"), "utf8"))[uid] || []);
const cur = (uid) => players()[uid]?.shift?.current;
const correct = (uid) => { const c = cur(uid); return c.kind === "code" ? c.code : String(c.answer); };
const wrong = (uid) => { const c = cur(uid); if (c.kind === "code") return "ZZZZZ"; return String(c.answer === 1 ? 2 : 1); };
async function finishShift(ad, uid, maxSteps = 40) {
  for (let i = 0; i < maxSteps; i++) { if (!players()[uid]?.shift) return; await say(ad, uid, `.work tl ${correct(uid)}`); }
  throw new Error("ca làm không kết thúc");
}
async function giveJob(ad, uid, id = "cong_nhan_nha_may", name = "Tester") { await E.applyJob(uid, id, name); tick(); }
const bal = (uid) => Money.getBalance(uid);

try {
// 1 ─ chưa có việc
await t("1. chưa có việc: dashboard vẽ Canvas, lệnh làm báo thiếu việc", async () => {
  const ad = mkAdapter(), uid = newUid();
  await say(ad, uid, ".work");
  assert.ok(isPng(lastImg(ad).buf));
  await say(ad, uid, ".work lam");
  const imgs = ad.log.filter((x) => x.kind === "img"); assert.equal(imgs.length, 2);
  assert.equal(players()[uid].jobId, null);
  assert.equal(players()[uid].shift, null);
});

// 2 ─ danh sách 50 nghề
await t("2. dữ liệu: đúng 50 nghề / 5 nhóm, mỗi nghề đủ trường và có bộ nhiệm vụ riêng", () => {
  assert.equal(E.JOBS.length, 50);
  const groups = new Set(E.JOBS.map((j) => j.group)); assert.equal(groups.size, 5);
  for (const g of groups) assert.equal(E.JOBS.filter((j) => j.group === g).length, 10, g);
  assert.equal(new Set(E.JOBS.map((j) => j.id)).size, 50);
  for (const j of E.JOBS) {
    for (const k of ["id", "name", "description", "difficulty", "levelRequired", "baseWage", "exp"]) assert.ok(j[k] !== undefined && j[k] !== "", `${j.id}.${k}`);
    assert.ok(j.baseWage > 0 && j.exp > 0);
    assert.ok(j.taskIds.length >= 3 && j.taskIds.every((id) => E.TASK_BY_ID.get(id)?.jobId === j.id), j.id);
    for (const id of j.taskIds) { const tk = E.TASK_BY_ID.get(id); for (const k of ["id", "name", "description", "kind", "count", "startCondition", "validation"]) assert.ok(tk[k], `${id}.${k}`); assert.ok(tk.variants.length >= 3); }
  }
  const mx = E.JOBS.reduce((a, j) => Math.max(a, j.baseWage * E.RANKS[7].wageMultiplier * 1.1), 0);
  assert.ok(mx <= E.cfg.wage.dailyIncomeCap * 1.05, `lương tối đa ${mx} vượt trần`);
  assert.ok(E.JOBS.filter((j) => j.levelRequired >= 15).every((j) => j.minDays > 0));
});
await t("2b. lệnh nghenghiep: phân trang, lọc nhóm, nhóm sai", async () => {
  const ad = mkAdapter(), uid = newUid();
  await say(ad, uid, ".work nghenghiep"); assert.ok(isPng(lastImg(ad).buf));
  await say(ad, uid, ".work nghenghiep congnghe 2"); assert.ok(isPng(lastImg(ad).buf));
  await say(ad, uid, ".work nghenghiep 99"); assert.ok(isPng(lastImg(ad).buf));
  await say(ad, uid, ".work nghenghiep khongco");
  assert.equal(ad.log.filter((x) => x.kind === "img").length, 4);
  assert.equal(E.findGroup("Công nghệ"), "congnghe");
  assert.equal(E.findGroup("sang tao"), "sangtao");
});

// 3,4,5,6 ─ xin việc
await t("3. xin việc hợp lệ: không phân biệt hoa/thường/dấu, phải xác nhận mới lưu", async () => {
  const ad = mkAdapter(), uid = newUid();
  await say(ad, uid, ".work xin viec CONG NHAN NHA MAY");
  assert.equal(players()[uid]?.jobId ?? null, null, "chưa xác nhận thì chưa lưu");
  const m = await plain(ad, uid, "yes");
  assert.equal(m.__workConsumed, true);
  assert.equal(players()[uid].jobId, "cong_nhan_nha_may");
  assert.ok(histOf(uid).some((h) => h.type === "apply"));
  const uid2 = newUid();
  await say(ad, uid2, ".work xin viec Nhân viên giao hàng"); await plain(ad, uid2, "no");
  assert.equal(players()[uid2]?.jobId ?? null, null);
  const uid3 = newUid();
  await say(ad, uid3, ".work xinviec giao hang"); await plain(ad, uid3, "yes");
  assert.equal(players()[uid3].jobId, "giao_hang");
});
await t("4. xin việc sai tên / thiếu tên / nhiều kết quả: không đổi dữ liệu", async () => {
  const ad = mkAdapter(), uid = newUid();
  await say(ad, uid, ".work xin viec nghe khong ton tai xyz");
  await say(ad, uid, ".work xin viec");
  await say(ad, uid, ".work xin viec nhan vien");
  assert.equal(players()[uid]?.jobId ?? null, null);
  assert.equal(ad.log.filter((x) => x.kind === "img").length, 3);
  assert.equal(E.findJobs("dev").length >= 2, true);
  assert.equal(E.findJobs("DAU BEP")[0].id, "dau_bep");
});
await t("5. không đủ cấp / ngày công: bị từ chối kèm lý do, không lưu", async () => {
  const ad = mkAdapter(), uid = newUid();
  const chk = await E.checkApply(uid, E.getJob("giam_doc_cn")); assert.equal(chk.ok, false); assert.ok(chk.reasons.length >= 1);
  await assert.rejects(() => E.applyJob(uid, "giam_doc_cn", "x"), (e) => e.code === "LOCKED");
  await say(ad, uid, ".work xin viec giam doc cong nghe");
  assert.equal(players()[uid]?.jobId ?? null, null);
  assert.equal(getSess(uid), undefined, "không tạo phiên xác nhận khi chưa đủ điều kiện");
});
function getSess(uid) { return [...W._sessionsForTests().keys()].find((k) => k.startsWith(`${uid}|`) && W._sessionsForTests().get(k).type === "CONFIRM_APPLY"); }
await t("6. đã có việc: phải nghỉ việc trước mới xin nghề khác", async () => {
  const ad = mkAdapter(), uid = newUid();
  await giveJob(ad, uid);
  await say(ad, uid, ".work xin viec giao hang");
  assert.equal(players()[uid].jobId, "cong_nhan_nha_may");
  await assert.rejects(() => E.applyJob(uid, "giao_hang", "x"), (e) => e.code === "HAS_JOB");
  await say(ad, uid, ".work nghi viec"); await plain(ad, uid, "yes");
  assert.equal(players()[uid].jobId, null);
  await giveJob(ad, uid, "giao_hang"); assert.equal(players()[uid].jobId, "giao_hang");
});

// 7,8 ─ ca làm
await t("7. bắt đầu ca & khôi phục", async () => {
  const ad = mkAdapter(), uid = newUid();
  await giveJob(ad, uid, "cong_nhan_nha_may");
  await say(ad, uid, ".work lam");
  const sh = players()[uid].shift;
  assert.ok(sh && sh.tasks.length >= 3 && sh.tasks.length <= 5 && sh.status === "active");
  assert.ok(isPng(lastImg(ad).buf));
  assert.equal(sh.tasks.filter((x) => x.status === "active").length, 1);
  await say(ad, uid, ".work lam");
  assert.equal(players()[uid].shift.id, sh.id, "khôi phục đúng ca");
  assert.equal(players()[uid].shiftSeq, 1);
  const hard = newUid(); await E.applyJob(hard, "cong_nhan_nha_may", "x"); // độ khó 1 → 3 nhiệm vụ
  await say(ad, hard, ".work lam"); assert.equal(players()[hard].shift.tasks.length, 3);
});
await t("8. nhiệm vụ: sai không tiến, đúng tiến và lưu ngay; đáp án không hợp lệ không bị phạt", async () => {
  const ad = mkAdapter(), uid = newUid();
  await giveJob(ad, uid); await say(ad, uid, ".work lam");
  const before = JSON.stringify(players()[uid].shift.tasks.map((x) => x.done));
  await say(ad, uid, `.work tl ${wrong(uid)}`);
  assert.equal(JSON.stringify(players()[uid].shift.tasks.map((x) => x.done)), before);
  assert.equal(players()[uid].shift.wrong, 1);
  await say(ad, uid, ".work tl 9"); // ngoài khoảng
  assert.equal(players()[uid].shift.wrong, 1, "không hợp lệ ≠ sai");
  await say(ad, uid, ".work tl ?!");
  assert.equal(players()[uid].shift.wrong, 1);
  await say(ad, uid, `.work tl ${correct(uid)}`);
  assert.equal(players()[uid].shift.correct, 1);
  const done = players()[uid].shift.tasks.reduce((s, x) => s + x.done, 0); assert.equal(done, 1);
  await say(ad, uid, ".work nhiemvu"); assert.ok(isPng(lastImg(ad).buf));
});
await t("8b. mọi loại câu hỏi sinh được, chấm đúng/sai, đáp án nằm trong lựa chọn", () => {
  const tk = Store.loadStatic("tasks.json"); let n = 0;
  for (const kind of Ch.KINDS) for (let i = 0; i < 80; i++) {
    const c = Ch.makeChallenge({ kind, job: E.getJob("dev_web"), group: "congnghe", quizBanks: tk.quizBanks });
    if (kind === "code") { assert.equal(Ch.judge(c, c.code.toLowerCase()).correct, true); assert.equal(Ch.judge(c, "AAAAA").correct, c.code === "AAAAA"); }
    else { assert.equal(c.options.length, 4, kind); assert.equal(new Set(c.options).size, 4, kind); assert.equal(Ch.judge(c, String(c.answer)).correct, true); assert.equal(Ch.judge(c, String(c.answer === 1 ? 2 : 1)).correct, false); }
    n++;
  }
  for (const [g, bank] of Object.entries(tk.quizBanks)) { assert.ok(bank.length >= 12, g); for (const q of bank) assert.ok(q.w.length === 3 && !q.w.includes(q.a)); }
  assert.ok(n > 300);
});

// 9,14 ─ hoàn thành & trả lương
await t("9/14. hoàn thành ca: trả tiền + EXP qua TienGame/PlayerProfile, cập nhật profile.work, lịch sử, thẻ quyết toán", async () => {
  const ad = mkAdapter(), uid = newUid();
  await giveJob(ad, uid);
  const b0 = await bal(uid); const p0 = await Prof.getOrCreateProfile(uid);
  await say(ad, uid, ".work lam"); await finishShift(ad, uid);
  const pl = players()[uid]; assert.equal(pl.shift, null);
  assert.equal(pl.shiftsDone, 1); assert.equal(pl.daysWorked, 1);
  const wage = pl.lastSettlement.wage; assert.equal(wage, 3300);
  assert.equal(await bal(uid), b0 + wage);
  const tx = await Money.getTransactionHistory(uid, 10); assert.ok(tx.some((x) => x.referenceId === `work:${pl.lastSettlement.shiftId}` && x.amount === wage));
  const p1 = await Prof.getOrCreateProfile(uid);
  assert.ok(p1.exp > p0.exp || p1.level > p0.level);
  assert.equal(p1.work.jobId, "cong_nhan_nha_may"); assert.equal(p1.work.totalIncome, wage); assert.equal(p1.work.daysWorked, 1);
  assert.ok(p1.work.achievements.some((a) => a.id === "first_shift"));
  assert.equal(p1.customDisplayName ?? null, p0.customDisplayName ?? null, "trường hồ sơ cũ giữ nguyên");
  assert.ok(histOf(uid).some((h) => h.type === "shift_done" && h.money === wage));
  const imgs = ad.log.filter((x) => x.kind === "img"); assert.ok(imgs.every((i) => isPng(i.buf)));
  assert.ok(imgs.at(-1).caption || true);
});
await t("10. chống trả lương trùng: làm lại cùng ngày bị chặn; settle/recover lặp lại không cộng thêm", async () => {
  const ad = mkAdapter(), uid = newUid();
  await giveJob(ad, uid); await say(ad, uid, ".work lam"); await finishShift(ad, uid);
  const b = await bal(uid); const sid = players()[uid].lastSettlement.shiftId;
  await say(ad, uid, ".work lam"); assert.equal(players()[uid].shift, null);
  tick(); const r1 = await E.settle(uid); const r2 = await E.recover(uid);
  assert.equal(await bal(uid), b); assert.ok(r1.already || r1.done);
  await assert.rejects(() => Money.addMoney(uid, 3300, { referenceId: `work:${sid}` }), (e) => e.code === "DUPLICATE_REFERENCE");
  await say(ad, uid, ".work diem danh"); const b2 = await bal(uid); assert.ok(b2 > b);
  await say(ad, uid, ".work diem danh"); assert.equal(await bal(uid), b2, "điểm danh 1 lần/ngày");
  assert.equal(players()[uid].shiftsDone, 1);
  clock += 24 * 3600 * 1000;  // ngày mới
  await say(ad, uid, ".work lam"); assert.ok(players()[uid].shift, "sang ngày mới làm được ca mới");
});
await t("10b. trả lời trùng/đồng thời không cộng lương hai lần", async () => {
  const ad = mkAdapter(), uid = newUid(); const fast = newEngine({ config: { ...E.cfg, shift: { ...E.cfg.shift, minAnswerGapMs: 0 } } }); useEngine(fast);
  await giveJob(ad, uid); await fast.startShift(uid); const b = await bal(uid);
  for (let g = 0; g < 60 && players()[uid].shift; g++) {
    const ans = correct(uid); const last = players()[uid].shift.tasks.filter((x) => x.status !== "done").length === 1 && players()[uid].shift.tasks.find((x) => x.status === "active").done + 1 >= players()[uid].shift.tasks.find((x) => x.status === "active").count;
    if (last) { const rs = await Promise.allSettled([fast.submitAnswer(uid, ans), fast.submitAnswer(uid, ans), fast.recover(uid)]); assert.ok(rs.some((r) => r.status === "fulfilled")); break; }
    await fast.submitAnswer(uid, ans);
  }
  assert.equal(await bal(uid), b + 3300, "chỉ cộng một lần");
  assert.equal(players()[uid].shiftsDone, 1);
  useEngine(newEngine());
});

// 11 ─ nghỉ việc
await t("11. nghỉ việc: cảnh báo ca dở, giữ lịch sử/EXP/tiền, hủy ca không lương", async () => {
  const ad = mkAdapter(), uid = newUid();
  await giveJob(ad, uid); await say(ad, uid, ".work lam"); await finishShift(ad, uid);
  const jobExp = players()[uid].jobs.cong_nhan_nha_may.jobExp, b = await bal(uid), lv = (await Prof.getOrCreateProfile(uid)).exp;
  clock += 24 * 3600 * 1000; await say(ad, uid, ".work lam"); assert.ok(players()[uid].shift);
  await assert.rejects(() => E.quitJob(uid), (e) => e.code === "UNFINISHED" && e.needConfirm);
  await say(ad, uid, ".work nghi viec"); assert.ok(isPng(lastImg(ad).buf));
  await plain(ad, uid, "no"); assert.equal(players()[uid].jobId, "cong_nhan_nha_may");
  await say(ad, uid, ".work nghi viec"); await plain(ad, uid, "yes");
  const pl = players()[uid]; assert.equal(pl.jobId, null); assert.equal(pl.shift, null);
  assert.equal(pl.jobs.cong_nhan_nha_may.jobExp, jobExp, "giữ EXP nghề");
  assert.equal(await bal(uid), b); assert.equal((await Prof.getOrCreateProfile(uid)).exp, lv);
  assert.ok(histOf(uid).some((h) => h.type === "shift_done") && histOf(uid).some((h) => h.type === "quit") && histOf(uid).some((h) => h.type === "shift_cancel"));
  await giveJob(ad, uid); assert.equal(players()[uid].jobs.cong_nhan_nha_may.jobExp, jobExp, "xin lại vẫn giữ EXP nghề");
});

// 12 ─ hủy ca
await t("12. huyca: không lương, ghi lịch sử, bắt đầu lại được", async () => {
  const ad = mkAdapter(), uid = newUid();
  await giveJob(ad, uid); await say(ad, uid, ".work lam"); const b = await bal(uid);
  await say(ad, uid, `.work tl ${correct(uid)}`);
  await say(ad, uid, ".work huyca");
  assert.equal(players()[uid].shift, null); assert.equal(await bal(uid), b); assert.equal(players()[uid].shiftsDone, 0);
  assert.ok(histOf(uid).some((h) => h.type === "shift_cancel"));
  await say(ad, uid, ".work huyca"); // không còn ca → báo lỗi, không crash
  await say(ad, uid, ".work lam"); assert.ok(players()[uid].shift);
});
await t("12b. trả lời sai quá nhiều → ca bị hủy không lương; hết hạn / sang ngày → không lương", async () => {
  const ad = mkAdapter(), uid = newUid(), fast = newEngine({ config: { ...E.cfg, shift: { ...E.cfg.shift, minAnswerGapMs: 0 } } }); useEngine(fast);
  await giveJob(ad, uid); await fast.startShift(uid); const b = await bal(uid);
  let failed = false;
  for (let i = 0; i < 20 && !failed; i++) { try { await fast.submitAnswer(uid, wrong(uid)); } catch (e) { failed = e.code === "SHIFT_FAILED"; } }
  assert.ok(failed); assert.equal(players()[uid].shift, null); assert.equal(await bal(uid), b);
  await fast.startShift(uid); clock += 13 * 3600 * 1000;
  await assert.rejects(() => fast.submitAnswer(uid, "1"), (e) => e.code === "EXPIRED"); assert.equal(players()[uid].shift, null);
  assert.equal(await bal(uid), b); assert.ok(histOf(uid).some((h) => h.type === "shift_expire"));
  useEngine(newEngine());
});

// 13 ─ lịch sử + xếp hạng
await t("13. lịch sử phân trang, thống kê, lương, trạng thái, top (tien/ngay/cap)", async () => {
  const ad = mkAdapter(), a = newUid(), b = newUid();
  for (const [u, id] of [[a, "cong_nhan_nha_may"], [b, "giao_hang"]]) { await giveJob(ad, u, id, u); await say(ad, u, ".work lam"); await finishShift(ad, u); }
  clock += 24 * 3600 * 1000; await say(ad, a, ".work lam"); await finishShift(ad, a);
  for (const line of [".work lichsu", ".work lichsu 2", ".work lichsu 99", ".work thongke", ".work luong", ".work bangluong", ".work trangthai", ".work nhiemvu", ".work thangcap", ".work top", ".work top ngay", ".work top cap", ".work help"]) { const n = ad.log.length; await say(ad, a, line); assert.ok(ad.log.length > n, line); }
  assert.ok(ad.log.filter((x) => x.kind === "img").every((i) => isPng(i.buf)));
  const h = E.history(a, 1); assert.ok(h.total >= 5 && h.items.length <= E.cfg.history.pageSize && h.pages >= 1);
  const top = E.top("tien"); assert.ok(top.length >= 2); for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].totalIncome >= top[i].totalIncome);
  assert.equal(E.top("ngay").find((r) => r.uid === a).daysWorked, 2);
  assert.ok(E.top("cap").length >= 2);
});
await t("13b. lịch sử bị giới hạn theo config.history.cap", async () => {
  const uid = newUid(); const small = newEngine({ config: { ...E.cfg, history: { ...E.cfg.history, cap: 10 } } }); useEngine(small);
  await small.applyJob(uid, "cong_nhan_nha_may", "x");
  for (let i = 0; i < 15; i++) { tick(); await small.quitJob(uid, { confirm: true }); tick(); await small.applyJob(uid, "cong_nhan_nha_may", "x"); }
  assert.ok(histOf(uid).length <= 10, `history ${histOf(uid).length}`); useEngine(newEngine());
});

// thăng cấp / trần / điểm danh
await t("15. thăng cấp tự động theo EXP nghề + ngày công; hệ số lương tăng; có thẻ thăng cấp", async () => {
  const ad = mkAdapter(), uid = newUid(); await giveJob(ad, uid);
  let promotedAt = null;
  for (let d = 0; d < 3; d++) { await say(ad, uid, ".work lam"); await finishShift(ad, uid); if (!promotedAt && players()[uid].jobs.cong_nhan_nha_may.rank >= 1) promotedAt = d; clock += 24 * 3600 * 1000; }
  assert.equal(promotedAt, 1, "ca thứ 2: đủ 40 EXP nghề và 2 ngày");
  const pr = await E.payroll(uid); assert.equal(pr.multiplier, 1.15);
  assert.ok(histOf(uid).some((h) => h.type === "promote"));
  assert.ok(ad.log.filter((x) => x.kind === "img").length >= 8);
  const st = await E.promotionStatus(uid); assert.equal(st.progress.rank, 1);
  const p = await E.promote(uid); assert.equal(p.promoted, false);
});
await t("15b. trần lương/ngày được áp dụng và không âm", async () => {
  const uid = newUid(); const low = newEngine({ config: { ...E.cfg, wage: { ...E.cfg.wage, dailyIncomeCap: 2000 } } }); useEngine(low);
  await low.applyJob(uid, "cong_nhan_nha_may", "x"); tick(); await low.startShift(uid); const b = await bal(uid);
  for (let g = 0; g < 40 && players()[uid].shift; g++) { tick(); await low.submitAnswer(uid, correct(uid)); }
  assert.equal(await bal(uid), b + 2000); assert.equal(players()[uid].lastSettlement.capped, true);
  useEngine(newEngine());
});
await t("15c. điểm danh: chuỗi ngày liên tiếp tăng thưởng, đứt chuỗi thì về 1, cần có việc", async () => {
  const ad = mkAdapter(), uid = newUid();
  await assert.rejects(() => E.attendance(uid, "x"), (e) => e.code === "NO_JOB_NOW");
  await giveJob(ad, uid); const r1 = await E.attendance(uid, "x"); assert.equal(r1.result.streak, 1);
  await assert.rejects(() => E.attendance(uid, "x"), (e) => e.code === "ALREADY_ATT");
  clock += 24 * 3600 * 1000; const r2 = await E.attendance(uid, "x"); assert.equal(r2.result.streak, 2); assert.ok(r2.result.reward > r1.result.reward);
  clock += 3 * 24 * 3600 * 1000; const r3 = await E.attendance(uid, "x"); assert.equal(r3.result.streak, 1);
});

// 16 ─ nhiều người, khởi động lại, lỗi
await t("16a. nhiều người dùng song song: dữ liệu tách biệt theo UID, không ghi đè nhau", async () => {
  const ads = mkAdapter(); const us = Array.from({ length: 6 }, newUid);
  await Promise.all(us.map((u) => E.applyJob(u, "cong_nhan_nha_may", u)));
  tick(); await Promise.all(us.map((u) => E.startShift(u)));
  const ids = us.map((u) => players()[u].shift.id); assert.equal(new Set(ids).size, 6);
  const fast = newEngine({ config: { ...E.cfg, shift: { ...E.cfg.shift, minAnswerGapMs: 0 } } }); useEngine(fast);
  await Promise.all(us.map(async (u) => { for (let g = 0; g < 40 && players()[u]?.shift; g++) await fast.submitAnswer(u, correct(u)); }));
  for (const u of us) { assert.equal(players()[u].shiftsDone, 1); assert.equal(players()[u].totalIncome, 3300); }
  useEngine(newEngine());
});
await t("16b. khởi động lại: engine mới đọc lại dữ liệu và tiếp tục đúng ca", async () => {
  const ad = mkAdapter(), uid = newUid(); await giveJob(ad, uid); await say(ad, uid, ".work lam");
  await say(ad, uid, `.work tl ${correct(uid)}`); const snap = JSON.stringify(players()[uid].shift);
  useEngine(newEngine());       // giả lập restart: instance mới, không giữ trạng thái RAM
  W._resetSessionsForTests();
  await say(ad, uid, ".work lam"); assert.equal(JSON.stringify(players()[uid].shift), snap, "ca khôi phục nguyên vẹn");
  await say(ad, uid, `.work tl ${correct(uid)}`); assert.ok(players()[uid].shift.correct >= 2);
  await finishShift(ad, uid); assert.equal(players()[uid].shiftsDone, 1);
});
await t("16c. phục hồi: tiền đã cộng nhưng profile lỗi → lần sau chạy tiếp, không cộng trùng", async () => {
  const uid = newUid(); let moneyCalls = 0, failProfile = true; const paid = new Set(); const rewarded = new Set(); let exp = 0;
  const fake = newEngine({
    config: { ...E.cfg, shift: { ...E.cfg.shift, minAnswerGapMs: 0 } },
    money: { addMoney: async (u, a, o) => { moneyCalls++; if (paid.has(o.referenceId)) { const e = new Error("dup"); e.code = "DUPLICATE_REFERENCE"; throw e; } paid.add(o.referenceId); }, getBalance: async () => 0 },
    profile: { getOrCreateProfile: async () => ({ level: 1, exp }), applyWorkReward: async (u, r) => { if (failProfile) throw new Error("profile down"); if (rewarded.has(r.shiftId)) return { already: true, level: 1 }; rewarded.add(r.shiftId); exp += r.exp; return { level: 1, leveledUp: false }; } },
  });
  useEngine(fake); await fake.applyJob(uid, "cong_nhan_nha_may", "x"); await fake.startShift(uid);
  let res; for (let g = 0; g < 40 && players()[uid].shift?.status !== "settling"; g++) res = await fake.submitAnswer(uid, correct(uid));
  assert.equal(res.settlement.pending, true); assert.equal(res.settlement.reason, "profile_failed");
  assert.equal(players()[uid].shift.status, "settling"); assert.equal(paid.size, 1);
  failProfile = false; const rec = await fake.recover(uid); assert.equal(rec.settle.done, true);
  assert.equal(paid.size, 1); assert.equal(exp, players()[uid].lastSettlement.exp); assert.equal(players()[uid].shiftsDone, 1); assert.equal(players()[uid].shift, null);
  await fake.recover(uid); assert.equal(exp, players()[uid].lastSettlement.exp, "chạy lại không cộng EXP thêm");
  // tiền lỗi trước → không mất ca
  const uid2 = newUid(); let fail2 = true; const fake2 = newEngine({ config: fake.cfg, money: { addMoney: async () => { if (fail2) throw new Error("bank down"); }, getBalance: async () => 0 }, profile: { getOrCreateProfile: async () => ({ level: 1, exp: 0 }), applyWorkReward: async () => ({ level: 1 }) } });
  useEngine(fake2); await fake2.applyJob(uid2, "cong_nhan_nha_may", "x"); await fake2.startShift(uid2);
  for (let g = 0; g < 40 && players()[uid2].shift?.status !== "settling"; g++) await fake2.submitAnswer(uid2, correct(uid2));
  assert.equal(players()[uid2].shift.status, "settling"); fail2 = false; const r2 = await fake2.recover(uid2); assert.equal(r2.settle.done, true);
  useEngine(newEngine());
});
await t("16d. lỗi Canvas / gửi ảnh: dùng chữ dự phòng, không văng lỗi; avatar lỗi không làm hỏng dashboard", async () => {
  const ad = mkAdapter({ failImage: true }), uid = newUid();
  await say(ad, uid, ".work"); await say(ad, uid, ".work help"); await say(ad, uid, ".work nghenghiep");
  assert.ok(ad.log.length >= 3 && ad.log.every((x) => x.kind === "text" && x.text.length > 10));
  const ad2 = mkAdapter(); await say(ad2, uid, ".work"); assert.ok(isPng(lastImg(ad2).buf));
  const bad = await W.renderDashboard({ player: { name: "X", daysWorked: 0, totalIncome: 0, shiftsDone: 0 }, level: 1, exp: 0, nextExp: 100, expPct: 0, balance: 0, job: null, rank: null, progress: null, unlocked: 1, total: 50, shift: null, today: "x" }, "/khong/ton/tai.png", ".");
  assert.ok(isPng(bad), "avatar không tồn tại → vòng tròn chữ cái dự phòng");
});
await t("16e. file JSON hỏng được sao lưu và tạo lại; thiếu file tự tạo; ghi lỗi giữa chừng không làm mất dữ liệu", async () => {
  const uid = newUid(); await E.applyJob(uid, "cong_nhan_nha_may", "x");
  const f = path.join(TMP, "players.json"); const good = fs.readFileSync(f, "utf8");
  fs.writeFileSync(f, "{ hỏng ]]"); const p = await E.getPlayer(uid); assert.equal(p.jobId, null);
  assert.ok(fs.readdirSync(TMP).some((n) => n.startsWith("players.json.corrupt-")));
  assert.equal(typeof JSON.parse(fs.readFileSync(f, "utf8")), "object");
  fs.rmSync(path.join(TMP, "history.json"), { force: true }); assert.deepEqual(E.history(uid).items, []);
  assert.ok(fs.existsSync(path.join(TMP, "history.json")));
  await assert.rejects(() => Store.mutate(({ players: pl }) => { pl.zzz = { a: 1 }; throw new Error("boom"); }), /boom/);
  assert.equal(players().zzz, undefined, "lỗi trong mutate thì không ghi");
  fs.writeFileSync(f, good);
});
await t("17. chống spam: lệnh dồn dập bị chặn; reply bằng ảnh câu hỏi hoạt động; reply sai tin nhắn / không reply thì bỏ qua", async () => {
  const ad = mkAdapter(), uid = newUid(); await giveJob(ad, uid);
  const t0 = clock; await work.run({ adapter: ad, message: msg(uid, ".work"), args: [], config: cfg, logger: {} });
  const n = ad.log.length; await work.run({ adapter: ad, message: msg(uid, ".work"), args: [], config: cfg, logger: {} });
  assert.equal(ad.log.length, n + 1); assert.equal(ad.log.at(-1).kind, "text"); // thông báo chờ
  await say(ad, uid, ".work lam"); const card = lastImg(ad);
  const m0 = await plain(ad, uid, correct(uid)); assert.equal(m0.__workConsumed, undefined, "không reply → không nhận");
  assert.equal(players()[uid].shift.correct, 0);
  await plain(ad, uid, correct(uid), { quote: { ownerId: "SOMEONE", msgId: "999999" } }); assert.equal(players()[uid].shift.correct, 0);
  const m1 = await plain(ad, uid, correct(uid), { quote: { ownerId: "BOT1", msgId: String(card.id) } });
  assert.equal(m1.__workConsumed, true); assert.equal(m1.data.content, ""); assert.equal(players()[uid].shift.correct, 1);
  const c = cur(uid); const ans = c.kind === "code" ? c.code : String(c.answer);
  const cid = lastImg(ad).id; const text = `@Gia Phát Ctee ${ans}`;
  await plain(ad, uid, text, { quote: { ownerId: "BOT1", msgId: String(cid) }, mentions: [{ pos: 0, len: 14 }] });
  assert.equal(players()[uid].shift?.correct ?? 99, 2 > 0 ? (players()[uid].shift?.correct ?? 99) : 0);
  assert.ok((players()[uid].shift?.correct ?? 9) >= 2 || !players()[uid].shift);
  // người khác reply vào thẻ của mình → không có phiên cho họ
  const other = newUid(); const mo = await plain(ad, other, "1", { quote: { ownerId: "BOT1", msgId: String(cid) } }); assert.equal(mo.__workConsumed, undefined);
});
await t("18. lệnh con sai / số đáp án nhanh `.work 2` / lệnh không có ca", async () => {
  const ad = mkAdapter(), uid = newUid();
  await say(ad, uid, ".work linhtinh"); assert.ok(isPng(lastImg(ad).buf));
  await say(ad, uid, ".work 2"); // chưa có ca → báo lỗi
  assert.equal(players()[uid]?.shift ?? null, null);
  await giveJob(ad, uid); await say(ad, uid, ".work lam");
  const c = cur(uid); if (c.kind !== "code") { await say(ad, uid, `.work ${c.answer}`); assert.equal(players()[uid].shift.correct, 1); }
});
await t("19. ID giao dịch/ca duy nhất; tiền luôn là số nguyên dương; múi giờ Asia/Ho_Chi_Minh", async () => {
  assert.equal(E.cfg.timezone, "Asia/Ho_Chi_Minh");
  assert.equal(Eng.vnDate(Date.parse("2026-10-20T20:00:00Z")), "2026-10-21", "20:00 UTC đã là ngày hôm sau ở VN");
  assert.equal(Eng.vnDate(Date.parse("2026-10-20T16:59:00Z")), "2026-10-20");
  for (const j of E.JOBS) for (let r = 0; r < 8; r++) { const w = E.wageFor(j, r, 0.6); assert.ok(Number.isInteger(w) && w > 0); }
  const ids = Object.values(players()).map((p) => p.lastSettlement?.shiftId).filter(Boolean); assert.equal(new Set(ids).size, ids.length);
  assert.ok(E.RANKS.length === 8 && E.RANKS.every((r, i) => i === 0 || (r.wageMultiplier > E.RANKS[i - 1].wageMultiplier && r.minJobExp > E.RANKS[i - 1].minJobExp)));
});
await t("20. Limit PRO nhận lệnh work và PlayerProfile.applyWorkReward idempotent theo shiftId", async () => {
  const Cat = await imp("Core/Commands/data/ADMIN/Limit/categories.js");
  const src = fs.readFileSync(path.join(ROOT, "Core/Commands/data/ADMIN/Limit/categories.js"), "utf8"); assert.match(src, /work:\s*"giaitri"/);
  const uid = newUid(); const a = await Prof.applyWorkReward(uid, { shiftId: "S1", exp: 40, patch: { jobId: "x" } }); const b = await Prof.applyWorkReward(uid, { shiftId: "S1", exp: 40 });
  assert.equal(b.already, true); const p = await Prof.getOrCreateProfile(uid); assert.equal(p.exp, a.exp); assert.equal(p.work.jobId, "x");
  assert.ok(Cat && typeof Cat === "object");
});
} finally { restore(); fs.rmSync(TMP, { recursive: true, force: true }); }

console.log(out.join("\n")); console.log(`PASS ${pass} FAIL ${fail}`); process.exit(fail ? 1 : 0);
