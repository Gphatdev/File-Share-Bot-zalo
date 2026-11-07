/**
 * WORK/engine.js — lõi nghiệp vụ của `.work` (không vẽ Canvas, không gửi tin).
 * Tích hợp hệ thống có sẵn: TienGame (tiền), PlayerProfile (EXP / cấp / hồ sơ). KHÔNG có ví tiền hay EXP riêng.
 *
 * Quy trình trả lương (idempotent, phục hồi được):
 *   1) đánh dấu ca "settling" + lưu sẵn kết quả tính (lương, EXP, thăng cấp)   [players.json]
 *   2) cộng tiền qua TienGame.addMoney với referenceId=`work:<shiftId>`          (trùng → bỏ qua)
 *   3) cộng EXP + ghi profile.work qua PlayerProfile.applyWorkReward(shiftId)    (trùng → bỏ qua)
 *   4) chốt số liệu người chơi + lịch sử, xóa ca                                  [players.json]
 * Nếu tiến trình chết giữa chừng, lần gọi sau (recover) chạy tiếp đúng bước còn thiếu.
 */
import * as store from "./store.js";
import { makeChallenge, judge, options as chOptions } from "./challenges.js";

export class WorkError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}

export const stripVN = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
export const normName = (s) => stripVN(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function vnDate(ms, tz = "Asia/Ho_Chi_Minh") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
function prevDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) - 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
const int = (v, d = 0) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : d; };
const clone = (o) => JSON.parse(JSON.stringify(o));

async function defaultMoney() {
  const m = await import("../TienGame/index.js");
  return { addMoney: m.addMoney, getBalance: m.getBalance };
}
async function defaultProfile() {
  const m = await import("../PlayerProfile/index.js");
  return { applyWorkReward: m.applyWorkReward, getOrCreateProfile: m.getOrCreateProfile };
}

export function createEngine(deps = {}) {
  const now = deps.now || (() => Date.now());
  const rand = deps.rand || Math.random;
  const S = deps.store || store;
  const cfg = deps.config || S.loadStatic("config.json");
  const jobsFile = deps.jobs || S.loadStatic("jobs.json");
  const tasksFile = deps.tasks || S.loadStatic("tasks.json");
  const JOBS = jobsFile.jobs;
  const GROUPS = jobsFile.groups;
  const JOB_BY_ID = new Map(JOBS.map((j) => [j.id, j]));
  const TASK_BY_ID = new Map(tasksFile.tasks.map((t) => [t.id, t]));
  const RANKS = cfg.ranks;
  let moneyApi = deps.money || null;
  let profileApi = deps.profile || null;
  const money = async () => (moneyApi ||= await defaultMoney());
  const prof = async () => (profileApi ||= await defaultProfile());
  const tz = cfg.timezone || "Asia/Ho_Chi_Minh";
  const today = () => vnDate(now(), tz);
  const inflight = new Set();
  const lastCmd = new Map();

  // ───────────── chống spam lệnh ─────────────
  function throttle(uid) {
    const gap = int(cfg.cooldowns?.commandMs, 1000);
    const t = now();
    const last = lastCmd.get(uid) || 0;
    if (t - last < gap) throw new WorkError("COOLDOWN", `Bạn thao tác quá nhanh, thử lại sau ${Math.ceil((gap - (t - last)) / 1000)}s.`, { waitMs: gap - (t - last) });
    lastCmd.set(uid, t);
    if (lastCmd.size > 2000) for (const [k, v] of lastCmd) if (t - v > 60000) lastCmd.delete(k);
  }

  // ───────────── tra cứu ─────────────
  const getJob = (id) => JOB_BY_ID.get(id) || null;
  const listJobs = ({ group = null } = {}) => JOBS.filter((j) => !group || j.group === group);
  const groupIds = () => Object.keys(GROUPS);
  function findGroup(q) {
    const n = normName(q);
    if (!n) return null;
    const alias = { laodong: ["lao dong", "pho thong", "laodong", "lao dong pho thong"], dichvu: ["dich vu", "kinh doanh", "dichvu"], congnghe: ["cong nghe", "congnghe", "it", "tech"], sangtao: ["sang tao", "truyen thong", "sangtao"], chuyenmon: ["chuyen mon", "quan ly", "chuyenmon"] };
    for (const [id, names] of Object.entries(alias)) if (names.some((x) => n === x || n.includes(x))) return id;
    for (const [id, g] of Object.entries(GROUPS)) if (normName(g.name).includes(n)) return id;
    return null;
  }
  /** Tìm nghề theo tên (không phân biệt hoa/thường/dấu), id hoặc số thứ tự. */
  function findJobs(query) {
    const n = normName(query);
    if (!n) return [];
    if (/^\d+$/.test(n)) { const j = JOBS[Number(n) - 1]; return j ? [j] : []; }
    const exact = JOBS.filter((j) => normName(j.name) === n || j.id === n.replace(/ /g, "_"));
    if (exact.length) return exact;
    const sub = JOBS.filter((j) => normName(j.name).includes(n));
    if (sub.length) return sub;
    const words = n.split(" ");
    return JOBS.filter((j) => { const jn = normName(j.name); return words.every((w) => jn.includes(w)); });
  }

  // ───────────── người chơi ─────────────
  function newPlayer(uid, name) {
    return { uid, name: name || "Người chơi", createdAt: now(), updatedAt: now(), jobId: null, jobs: {}, daysWorked: 0, totalIncome: 0, shiftsDone: 0, perfectShifts: 0, shiftSeq: 0, wageByDate: {}, lastShiftDate: null, attendance: { lastDate: null, streak: 0, total: 0 }, attPending: null, shift: null, lastSettlement: null, achievements: [] };
  }
  function normPlayer(p, uid) {
    const base = newPlayer(uid);
    const o = { ...base, ...(p && typeof p === "object" ? p : {}) };
    o.uid = uid;
    for (const k of ["daysWorked", "totalIncome", "shiftsDone", "perfectShifts", "shiftSeq"]) o[k] = Math.max(0, int(o[k]));
    if (!o.jobs || typeof o.jobs !== "object") o.jobs = {};
    if (!o.wageByDate || typeof o.wageByDate !== "object") o.wageByDate = {};
    if (!o.attendance || typeof o.attendance !== "object") o.attendance = clone(base.attendance);
    if (!Array.isArray(o.achievements)) o.achievements = [];
    if (o.jobId && !JOB_BY_ID.has(o.jobId)) o.jobId = null;
    return o;
  }
  const jobState = (p, jobId) => ({ rank: 0, jobExp: 0, days: 0, income: 0, shifts: 0, ...(p.jobs?.[jobId] || {}) });
  function pruneDates(p) {
    const keys = Object.keys(p.wageByDate).sort();
    while (keys.length > 4) delete p.wageByDate[keys.shift()];
  }

  async function levelOf(uid) {
    try { return int((await (await prof()).getOrCreateProfile(uid)).level, 1) || 1; } catch { return 1; }
  }
  async function balanceOf(uid) {
    try { return int(await (await money()).getBalance(uid)); } catch { return 0; }
  }

  function rankInfo(i) { return RANKS[Math.max(0, Math.min(RANKS.length - 1, i))]; }
  function nextRankProgress(p, job) {
    const js = jobState(p, job.id);
    const next = RANKS[js.rank + 1] || null;
    if (!next) return { rank: js.rank, current: rankInfo(js.rank), next: null, jobExp: js.jobExp, days: js.days, done: true };
    return { rank: js.rank, current: rankInfo(js.rank), next, jobExp: js.jobExp, days: js.days, needExp: next.minJobExp, needDays: next.minDays, ok: js.jobExp >= next.minJobExp && js.days >= next.minDays, done: false };
  }

  function eligibility(job, level, p) {
    const reasons = [];
    if (level < job.levelRequired) reasons.push(`Cần cấp ${job.levelRequired} (bạn cấp ${level})`);
    if (p.daysWorked < job.minDays) reasons.push(`Cần ${job.minDays} ngày công (bạn có ${p.daysWorked})`);
    return { ok: reasons.length === 0, reasons };
  }
  function jobStatus(job, level, p) {
    if (p.jobId === job.id) return { code: "current", label: "Đang làm", ok: true, reasons: [] };
    const e = eligibility(job, level, p);
    if (!e.ok) return { code: "locked", label: "Chưa mở khóa", ok: false, reasons: e.reasons };
    return { code: "open", label: "Có thể xin việc", ok: true, reasons: [] };
  }

  function wageFor(job, rankIdx, factor = 1) {
    const mult = rankInfo(rankIdx).wageMultiplier;
    return Math.max(cfg.wage.minPayout || 1, Math.round(job.baseWage * mult * factor));
  }

  // ───────────── đọc ─────────────
  async function getPlayer(uid, name) {
    uid = String(uid);
    const all = S.readPlayers();
    const p = normPlayer(all[uid], uid);
    if (name && !p.name) p.name = name;
    return p;
  }
  async function ensurePlayer(uid, name) {
    uid = String(uid);
    return S.mutate(({ players }) => {
      const p = normPlayer(players[uid], uid);
      if (name) p.name = String(name).slice(0, 40);
      players[uid] = p;
      return clone(p);
    }, cfg.history.cap);
  }

  // ───────────── xin việc / nghỉ việc ─────────────
  async function checkApply(uid, job) {
    const p = await getPlayer(uid);
    const level = await levelOf(uid);
    if (p.jobId === job.id) return { ok: false, code: "SAME_JOB", reasons: ["Bạn đang làm nghề này rồi"], level, player: p };
    if (p.jobId) return { ok: false, code: "HAS_JOB", reasons: [`Bạn đang làm ${getJob(p.jobId).name}. Hãy nghỉ việc trước`], level, player: p };
    const e = eligibility(job, level, p);
    return { ok: e.ok, code: e.ok ? "OK" : "LOCKED", reasons: e.reasons, level, player: p };
  }
  async function applyJob(uid, jobId, name) {
    uid = String(uid);
    const job = getJob(jobId);
    if (!job) throw new WorkError("NO_JOB", "Không tìm thấy nghề này.");
    const level = await levelOf(uid);
    return S.mutate(({ players, addHistory }) => {
      const p = normPlayer(players[uid], uid);
      if (name) p.name = String(name).slice(0, 40);
      if (p.jobId === jobId) throw new WorkError("SAME_JOB", "Bạn đang làm nghề này rồi.");
      if (p.jobId) throw new WorkError("HAS_JOB", `Bạn đang làm ${getJob(p.jobId).name}. Hãy dùng nghỉ việc trước khi xin nghề mới.`);
      const e = eligibility(job, level, p);
      if (!e.ok) throw new WorkError("LOCKED", `Chưa đủ điều kiện: ${e.reasons.join("; ")}.`, { reasons: e.reasons });
      p.jobId = jobId;
      p.jobs[jobId] = { ...jobState(p, jobId), appliedAt: now() };
      p.updatedAt = now();
      players[uid] = p;
      addHistory(uid, { id: `A-${uid}-${now()}`, ts: now(), type: "apply", jobId, jobName: job.name, money: 0, exp: 0, detail: `Xin việc: ${job.name}` });
      return { player: clone(p), job };
    }, cfg.history.cap);
  }
  async function quitJob(uid, { confirm = false } = {}) {
    uid = String(uid);
    await recover(uid);
    return S.mutate(({ players, addHistory }) => {
      const p = normPlayer(players[uid], uid);
      if (!p.jobId) throw new WorkError("NO_JOB_NOW", "Bạn chưa có việc làm.");
      const job = getJob(p.jobId);
      const sh = p.shift;
      if (sh && sh.status === "settling") throw new WorkError("SETTLING", "Ca làm đang được tính lương, thử lại sau giây lát.");
      const unfinished = !!sh;
      if (unfinished && !confirm) throw new WorkError("UNFINISHED", "Bạn còn ca làm chưa hoàn thành. Nghỉ việc bây giờ sẽ hủy ca và KHÔNG nhận lương ca này.", { needConfirm: true, job });
      if (sh) addHistory(uid, { id: `C-${sh.id}`, ts: now(), type: "shift_cancel", jobId: sh.jobId, jobName: job.name, money: 0, exp: 0, detail: "Hủy ca do nghỉ việc" });
      p.shift = null;
      p.jobId = null;
      p.updatedAt = now();
      players[uid] = p;
      addHistory(uid, { id: `Q-${uid}-${now()}`, ts: now(), type: "quit", jobId: job.id, jobName: job.name, money: 0, exp: 0, detail: `Nghỉ việc: ${job.name}` });
      return { player: clone(p), job, cancelledShift: unfinished };
    }, cfg.history.cap);
  }

  // ───────────── ca làm ─────────────
  function pickTasks(job) {
    const n = int(cfg.shift.tasksByDifficulty?.[String(job.difficulty)], 3);
    const all = job.taskIds.map((id) => TASK_BY_ID.get(id)).filter(Boolean);
    const chosen = all.map((t) => ({ t, r: rand() })).sort((a, b) => a.r - b.r).slice(0, Math.max(3, Math.min(5, n))).map((x) => x.t);
    chosen.sort((a, b) => a.order - b.order);
    return chosen;
  }
  function genChallenge(job, task, shift) {
    const used = shift.tasks.flatMap((t) => t.usedQuiz || []);
    const ch = makeChallenge({ kind: task.kind, job, group: job.group, quizBanks: tasksFile.quizBanks, rand, usedQuiz: used });
    return { ...ch, issuedAt: now(), wrong: 0 };
  }
  function activateTask(shift, idx, job) {
    const st = shift.tasks[idx];
    const tpl = TASK_BY_ID.get(st.taskId);
    st.status = "active";
    st.startedAt = st.startedAt || now();
    shift.taskIdx = idx;
    shift.current = genChallenge(job, tpl, shift);
    st.desc = st.desc || tpl.variants[Math.floor(rand() * tpl.variants.length)];
  }

  function shiftExpired(sh) {
    if (!sh) return false;
    const limit = int(cfg.shift.expireHours, 12) * 3600000;
    return sh.date !== today() || now() - sh.startedAt > limit;
  }

  /** Bắt đầu hoặc khôi phục ca hôm nay. */
  async function startShift(uid, name) {
    uid = String(uid);
    await recover(uid);
    return S.mutate(({ players, addHistory }) => {
      const p = normPlayer(players[uid], uid);
      if (name) p.name = String(name).slice(0, 40);
      if (!p.jobId) throw new WorkError("NO_JOB_NOW", "Bạn chưa có việc làm. Hãy xin việc trước.");
      const job = getJob(p.jobId);
      let restored = false;
      if (p.shift && p.shift.status === "settling") throw new WorkError("SETTLING", "Ca làm trước đang được tính lương, thử lại sau giây lát.");
      if (p.shift && shiftExpired(p.shift)) {
        addHistory(uid, { id: `E-${p.shift.id}`, ts: now(), type: "shift_expire", jobId: p.shift.jobId, jobName: getJob(p.shift.jobId)?.name || "", money: 0, exp: 0, detail: "Ca làm hết hạn, không nhận lương" });
        p.shift = null;
      }
      if (p.shift) { restored = true; players[uid] = p; return { player: clone(p), shift: clone(p.shift), job, restored }; }
      const date = today();
      const maxPer = int(cfg.shift.maxPerDay, 1);
      if (p.lastShiftDate === date && int(p.shiftsToday?.[date]) >= maxPer) throw new WorkError("DAILY_DONE", "Hôm nay bạn đã hoàn thành ca làm rồi. Quay lại vào ngày mai nhé.");
      const earned = int(p.wageByDate[date]);
      if (earned >= cfg.wage.dailyIncomeCap) throw new WorkError("CAP_REACHED", "Bạn đã đạt trần thu nhập từ lương hôm nay.");
      p.shiftSeq += 1;
      const shift = { id: `W${date.replace(/-/g, "")}-${uid}-${p.shiftSeq}`, jobId: job.id, date, status: "active", startedAt: now(), tasks: [], taskIdx: 0, current: null, correct: 0, wrong: 0, lastAnswerAt: 0 };
      shift.tasks = pickTasks(job).map((t) => ({ taskId: t.id, name: t.name, kind: t.kind, count: t.count, done: 0, status: "pending", startedAt: null, finishedAt: null, usedQuiz: [] }));
      activateTask(shift, 0, job);
      p.shift = shift;
      p.updatedAt = now();
      players[uid] = p;
      addHistory(uid, { id: `B-${shift.id}`, ts: now(), type: "shift_start", jobId: job.id, jobName: job.name, money: 0, exp: 0, detail: `Bắt đầu ca (${shift.tasks.length} nhiệm vụ)` });
      return { player: clone(p), shift: clone(shift), job, restored: false };
    }, cfg.history.cap);
  }

  function publicChallenge(ch) {
    if (!ch) return null;
    const { answer, code, ...rest } = ch;
    return { ...rest, code: ch.kind === "code" ? code : undefined };
  }

  /** Trạng thái ca hiện tại (không lộ đáp án). */
  async function shiftView(uid) {
    uid = String(uid);
    const p = await getPlayer(uid);
    if (!p.jobId || !p.shift) return { player: p, shift: null, job: p.jobId ? getJob(p.jobId) : null };
    const sh = p.shift;
    return { player: p, job: getJob(sh.jobId), shift: sh, task: sh.tasks[sh.taskIdx], challenge: publicChallenge(sh.current), expired: shiftExpired(sh) };
  }

  /** Nộp đáp án cho bước hiện tại. */
  async function submitAnswer(uid, input) {
    uid = String(uid);
    const res = await S.mutate(({ players, addHistory }) => {
      const p = normPlayer(players[uid], uid);
      const sh = p.shift;
      if (!p.jobId || !sh) throw new WorkError("NO_SHIFT", "Bạn chưa bắt đầu ca làm. Dùng lệnh làm để bắt đầu.");
      if (sh.status === "settling") throw new WorkError("SETTLING", "Ca làm đang được tính lương.");
      if (shiftExpired(sh)) {
        addHistory(uid, { id: `E-${sh.id}`, ts: now(), type: "shift_expire", jobId: sh.jobId, jobName: getJob(sh.jobId)?.name || "", money: 0, exp: 0, detail: "Ca làm hết hạn, không nhận lương" });
        p.shift = null; p.updatedAt = now(); players[uid] = p;
        return { expired: true };
      }
      const job = getJob(sh.jobId);
      const gap = int(cfg.shift.minAnswerGapMs, 1200);
      const t = now();
      if (sh.lastAnswerAt && t - sh.lastAnswerAt < gap) throw new WorkError("TOO_FAST", `Trả lời quá nhanh, chờ ${Math.ceil((gap - (t - sh.lastAnswerAt)) / 1000)}s rồi thử lại.`, { waitMs: gap - (t - sh.lastAnswerAt) });
      const ch = sh.current;
      const verdict = judge(ch, input);
      if (!verdict.valid) {
        const need = ch.kind === "code" ? "mã xác nhận" : `số đáp án (1-${chOptions(ch).length})`;
        throw new WorkError("INVALID_INPUT", `Đáp án không hợp lệ. Hãy gửi ${need}.`);
      }
      sh.lastAnswerAt = t;
      const task = sh.tasks[sh.taskIdx];
      const out = { correct: verdict.correct, taskDone: false, shiftDone: false, rerolled: false, failed: false, answerText: null };
      if (verdict.correct) {
        sh.correct += 1;
        task.done += 1;
        if (ch.kind === "quiz" && ch.quizIndex != null) task.usedQuiz.push(ch.quizIndex);
        if (task.done >= task.count) {
          task.status = "done"; task.finishedAt = t; out.taskDone = true; out.taskName = task.name;
          if (sh.taskIdx + 1 < sh.tasks.length) activateTask(sh, sh.taskIdx + 1, job);
          else { sh.current = null; out.shiftDone = true; }
        } else {
          sh.current = genChallenge(job, TASK_BY_ID.get(task.taskId), sh);
        }
      } else {
        sh.wrong += 1;
        ch.wrong = (ch.wrong || 0) + 1;
        out.answerText = ch.kind === "code" ? null : null;
        if (sh.wrong > int(cfg.shift.maxWrongPerShift, 8)) {
          out.failed = true;
          addHistory(uid, { id: `F-${sh.id}`, ts: t, type: "shift_fail", jobId: sh.jobId, jobName: job.name, money: 0, exp: 0, detail: "Sai quá nhiều, ca làm bị hủy không có lương" });
          p.shift = null;
          p.updatedAt = t; players[uid] = p;
          return { ...out, state: null };
        }
        if (ch.wrong >= int(cfg.shift.maxWrongPerStep, 2)) {
          sh.current = genChallenge(job, TASK_BY_ID.get(task.taskId), sh);
          out.rerolled = true;
        }
      }
      if (out.shiftDone) sh.status = "complete"; // chờ tính lương
      p.updatedAt = t;
      players[uid] = p;
      return { ...out, state: { job, shift: clone(sh) } };
    }, cfg.history.cap);
    if (res.expired) throw new WorkError("EXPIRED", "Ca làm của bạn đã hết hạn và không được tính lương. Hãy bắt đầu ca mới.");
    if (res.failed) throw new WorkError("SHIFT_FAILED", "Bạn trả lời sai quá nhiều lần. Ca làm bị hủy và không có lương.", { failed: true });
    if (res.shiftDone) res.settlement = await settle(uid);
    else {
      const v = await shiftView(uid);
      res.view = v;
    }
    return res;
  }

  // ───────────── tính lương ─────────────
  function computeSettlement(p, sh, job, dateStr) {
    const total = sh.correct + sh.wrong;
    const accuracy = total ? sh.correct / total : 1;
    const floor = Number(cfg.shift.accuracyFloor ?? 0.6);
    const factor = floor + (1 - floor) * accuracy;
    const perfect = sh.wrong === 0 || accuracy >= Number(cfg.shift.perfectAccuracy ?? 0.95);
    const js = jobState(p, job.id);
    let wage = wageFor(job, js.rank, factor);
    if (perfect) wage = Math.round(wage * (1 + Number(cfg.shift.perfectBonusPct || 0)));
    const earned = int(p.wageByDate[dateStr]);
    const remaining = Math.max(0, int(cfg.wage.dailyIncomeCap) - earned);
    const capped = wage > remaining;
    wage = Math.max(0, Math.min(wage, remaining, int(cfg.wage.maxSinglePayout, wage)));
    const exp = Math.max(1, Math.round(job.exp * (0.7 + 0.3 * accuracy)));
    const jobExpGain = Math.max(1, Math.round(job.jobExp * (0.7 + 0.3 * accuracy)));
    // thăng cấp
    let rank = js.rank;
    const newJobExp = js.jobExp + jobExpGain;
    const newDays = js.days + 1;
    while (rank < RANKS.length - 1 && newJobExp >= RANKS[rank + 1].minJobExp && newDays >= RANKS[rank + 1].minDays) rank += 1;
    const newTotalIncome = p.totalIncome + wage;
    const newShifts = p.shiftsDone + 1;
    const newPerfect = p.perfectShifts + (perfect ? 1 : 0);
    const newTotalDays = p.daysWorked + 1;
    const ach = [];
    const have = new Set(p.achievements);
    for (const [id, a] of Object.entries(cfg.achievements || {})) {
      if (have.has(id)) continue;
      const ok = (a.shifts && newShifts >= a.shifts) || (a.rank && rank + 1 >= a.rank) || (a.income && newTotalIncome >= a.income) || (a.perfect && newPerfect >= a.perfect);
      if (ok) ach.push({ id, name: a.name });
    }
    return { accuracy, perfect, wage, capped, exp, jobExpGain, rankBefore: js.rank, rankAfter: rank, promoted: rank > js.rank, newJobExp, newDays, newTotalIncome, newShifts, newPerfect, newTotalDays, achievements: ach, ref: `work:${sh.id}`, moneyDone: false, profileDone: false, date: dateStr, correct: sh.correct, wrong: sh.wrong };
  }

  async function settle(uid) {
    uid = String(uid);
    if (inflight.has(uid)) return { pending: true, reason: "busy" };
    inflight.add(uid);
    try {
      // bước 1: đánh dấu settling + lưu kết quả tính sẵn
      let info = await S.mutate(({ players }) => {
        const p = normPlayer(players[uid], uid);
        const sh = p.shift;
        if (!sh) return null;
        if (sh.status === "active") return { notReady: true };
        const job = getJob(sh.jobId);
        if (sh.status === "complete") {
          sh.settle = computeSettlement(p, sh, job, sh.date);
          sh.status = "settling";
          p.updatedAt = now();
          players[uid] = p;
        }
        return { shift: clone(sh), job };
      }, cfg.history.cap);
      if (!info) return { done: true, already: true };
      if (info.notReady) return { pending: true, reason: "not_complete" };
      const { shift, job } = info;
      const st = shift.settle;
      // bước 2: tiền
      if (!st.moneyDone) {
        if (st.wage > 0) {
          try {
            await (await money()).addMoney(uid, st.wage, { type: "WORK_SALARY", description: `Lương ca làm: ${job.name}`, referenceId: st.ref });
          } catch (err) {
            if (err?.code !== "DUPLICATE_REFERENCE") return { pending: true, reason: "money_failed", error: err?.message || String(err) };
          }
        }
        await S.mutate(({ players }) => { const p = normPlayer(players[uid], uid); if (p.shift?.id === shift.id) { p.shift.settle.moneyDone = true; players[uid] = p; } }, cfg.history.cap);
        st.moneyDone = true;
      }
      // bước 3: EXP + profile.work (idempotent theo shiftId)
      let reward = null;
      if (!st.profileDone) {
        try {
          reward = await (await prof()).applyWorkReward(uid, {
            shiftId: shift.id, exp: st.exp,
            patch: { jobId: job.id, jobName: job.name, rank: st.rankAfter, rankName: rankInfo(st.rankAfter).name, jobExp: st.newJobExp, daysWorked: st.newTotalDays, totalIncome: st.newTotalIncome, lastShiftAt: now() },
            achievements: st.achievements,
          });
        } catch (err) {
          return { pending: true, reason: "profile_failed", error: err?.message || String(err) };
        }
        await S.mutate(({ players }) => { const p = normPlayer(players[uid], uid); if (p.shift?.id === shift.id) { p.shift.settle.profileDone = true; p.shift.settle.level = reward.level; p.shift.settle.leveledUp = !!reward.leveledUp; players[uid] = p; } }, cfg.history.cap);
        st.profileDone = true; st.level = reward.level; st.leveledUp = !!reward.leveledUp;
      }
      // bước 4: chốt
      const final = await S.mutate(({ players, addHistory }) => {
        const p = normPlayer(players[uid], uid);
        const sh = p.shift;
        if (!sh || sh.id !== shift.id) return p.lastSettlement && p.lastSettlement.shiftId === shift.id ? p.lastSettlement : null;
        const s = sh.settle;
        const js = jobState(p, job.id);
        js.rank = s.rankAfter; js.jobExp = s.newJobExp; js.days = s.newDays; js.income += s.wage; js.shifts += 1;
        p.jobs[job.id] = js;
        p.daysWorked = s.newTotalDays; p.totalIncome = s.newTotalIncome; p.shiftsDone = s.newShifts; p.perfectShifts = s.newPerfect;
        p.wageByDate[s.date] = int(p.wageByDate[s.date]) + s.wage;
        p.shiftsToday = { [s.date]: int(p.shiftsToday?.[s.date]) + 1 };
        p.lastShiftDate = s.date;
        for (const a of s.achievements) if (!p.achievements.includes(a.id)) p.achievements.push(a.id);
        pruneDates(p);
        const result = { shiftId: sh.id, ts: now(), jobId: job.id, jobName: job.name, wage: s.wage, capped: s.capped, exp: s.exp, jobExp: s.jobExpGain, accuracy: s.accuracy, perfect: s.perfect, correct: s.correct, wrong: s.wrong, rankBefore: s.rankBefore, rankAfter: s.rankAfter, promoted: s.promoted, level: s.level ?? null, leveledUp: !!s.leveledUp, achievements: s.achievements, tasks: sh.tasks.map((t) => ({ name: t.name, count: t.count })), startedAt: sh.startedAt, finishedAt: now(), ref: s.ref };
        p.lastSettlement = result;
        p.shift = null;
        p.updatedAt = now();
        players[uid] = p;
        addHistory(uid, { id: `D-${sh.id}`, ts: now(), type: "shift_done", jobId: job.id, jobName: job.name, money: s.wage, exp: s.exp, detail: `Hoàn thành ca (${Math.round(s.accuracy * 100)}% chính xác)${s.promoted ? ` · Thăng cấp ${rankInfo(s.rankAfter).name}` : ""}` });
        if (s.promoted) addHistory(uid, { id: `P-${sh.id}`, ts: now(), type: "promote", jobId: job.id, jobName: job.name, money: 0, exp: 0, detail: `Thăng cấp: ${rankInfo(s.rankBefore).name} → ${rankInfo(s.rankAfter).name}` });
        return result;
      }, cfg.history.cap);
      return { done: true, result: final, balance: await balanceOf(uid) };
    } finally { inflight.delete(uid); }
  }

  /** Chạy tiếp các giao dịch dở dang (ca đang settling / điểm danh dở). */
  async function recover(uid) {
    uid = String(uid);
    const p = await getPlayer(uid);
    const out = {};
    if (p.shift && (p.shift.status === "settling" || p.shift.status === "complete")) out.settle = await settle(uid);
    if (p.attPending) out.attendance = await finishAttendance(uid);
    return out;
  }

  async function cancelShift(uid) {
    uid = String(uid);
    return S.mutate(({ players, addHistory }) => {
      const p = normPlayer(players[uid], uid);
      const sh = p.shift;
      if (!sh) throw new WorkError("NO_SHIFT", "Bạn không có ca làm nào đang chạy.");
      if (sh.status !== "active") throw new WorkError("SETTLING", "Ca làm đang được tính lương, không thể hủy.");
      const job = getJob(sh.jobId);
      addHistory(uid, { id: `C-${sh.id}`, ts: now(), type: "shift_cancel", jobId: sh.jobId, jobName: job?.name || "", money: 0, exp: 0, detail: "Hủy ca, không nhận lương" });
      p.shift = null; p.updatedAt = now(); players[uid] = p;
      return { job, progress: sh.tasks.filter((t) => t.status === "done").length, total: sh.tasks.length };
    }, cfg.history.cap);
  }

  // ───────────── điểm danh ─────────────
  async function attendance(uid, name) {
    uid = String(uid);
    await recover(uid);
    await S.mutate(({ players }) => {
      const p = normPlayer(players[uid], uid);
      if (name) p.name = String(name).slice(0, 40);
      if (!p.jobId && cfg.attendance.requireJob) throw new WorkError("NO_JOB_NOW", "Bạn cần có việc làm để điểm danh.");
      const date = today();
      if (p.attendance.lastDate === date) throw new WorkError("ALREADY_ATT", "Hôm nay bạn đã điểm danh rồi.", { streak: p.attendance.streak });
      const streak = p.attendance.lastDate === prevDate(date) ? p.attendance.streak + 1 : 1;
      const steps = Math.min(streak - 1, int(cfg.attendance.streakMaxSteps, 10));
      const reward = int(cfg.attendance.baseReward) + steps * int(cfg.attendance.streakStep);
      p.attendance = { lastDate: date, streak, total: p.attendance.total + 1 };
      p.attPending = { date, streak, reward, exp: int(cfg.attendance.exp), jobExp: int(cfg.attendance.jobExp), moneyDone: false, profileDone: false, jobId: p.jobId };
      p.updatedAt = now(); players[uid] = p;
    }, cfg.history.cap);
    return finishAttendance(uid);
  }
  async function finishAttendance(uid) {
    uid = String(uid);
    const key = `att:${uid}`;
    if (inflight.has(key)) return { pending: true };
    inflight.add(key);
    try {
      const p = await getPlayer(uid);
      const a = p.attPending;
      if (!a) return { done: true, already: true };
      const ref = `work:att:${uid}:${a.date}`;
      if (!a.moneyDone) {
        if (a.reward > 0) {
          try { await (await money()).addMoney(uid, a.reward, { type: "WORK_ATTENDANCE", description: "Thưởng điểm danh nghề nghiệp", referenceId: ref }); }
          catch (err) { if (err?.code !== "DUPLICATE_REFERENCE") return { pending: true, error: err?.message || String(err) }; }
        }
        await S.mutate(({ players }) => { const q = normPlayer(players[uid], uid); if (q.attPending) { q.attPending.moneyDone = true; players[uid] = q; } }, cfg.history.cap);
      }
      let reward = null;
      if (!a.profileDone) {
        try { reward = await (await prof()).applyWorkReward(uid, { shiftId: `att-${a.date}`, exp: a.exp }); }
        catch (err) { return { pending: true, error: err?.message || String(err) }; }
      }
      const out = await S.mutate(({ players, addHistory }) => {
        const q = normPlayer(players[uid], uid);
        const pend = q.attPending;
        if (!pend) return null;
        if (pend.jobId && q.jobs[pend.jobId]) q.jobs[pend.jobId].jobExp = int(q.jobs[pend.jobId].jobExp) + pend.jobExp;
        q.totalIncome += pend.reward;
        const res = { date: pend.date, streak: pend.streak, reward: pend.reward, exp: pend.exp, jobExp: pend.jobExp, level: reward?.level ?? null };
        q.attPending = null; q.updatedAt = now(); players[uid] = q;
        addHistory(uid, { id: `T-${uid}-${pend.date}`, ts: now(), type: "attendance", jobId: pend.jobId || null, jobName: pend.jobId ? getJob(pend.jobId)?.name : "", money: pend.reward, exp: pend.exp, detail: `Điểm danh (chuỗi ${pend.streak} ngày)` });
        return res;
      }, cfg.history.cap);
      return { done: true, result: out, balance: await balanceOf(uid) };
    } finally { inflight.delete(key); }
  }

  // ───────────── thăng cấp thủ công / tiến độ ─────────────
  async function promotionStatus(uid) {
    const p = await getPlayer(uid);
    if (!p.jobId) throw new WorkError("NO_JOB_NOW", "Bạn chưa có việc làm.");
    const job = getJob(p.jobId);
    return { player: p, job, progress: nextRankProgress(p, job) };
  }
  /** Nếu đủ điều kiện mà chưa lên cấp (vd. đổi config) thì thăng cấp; trả thông tin tiến độ. */
  async function promote(uid) {
    uid = String(uid);
    await recover(uid);
    return S.mutate(({ players, addHistory }) => {
      const p = normPlayer(players[uid], uid);
      if (!p.jobId) throw new WorkError("NO_JOB_NOW", "Bạn chưa có việc làm.");
      const job = getJob(p.jobId);
      const js = jobState(p, job.id);
      const before = js.rank;
      while (js.rank < RANKS.length - 1 && js.jobExp >= RANKS[js.rank + 1].minJobExp && js.days >= RANKS[js.rank + 1].minDays) js.rank += 1;
      p.jobs[job.id] = js;
      if (js.rank > before) {
        addHistory(uid, { id: `P-${uid}-${now()}`, ts: now(), type: "promote", jobId: job.id, jobName: job.name, money: 0, exp: 0, detail: `Thăng cấp: ${rankInfo(before).name} → ${rankInfo(js.rank).name}` });
        p.updatedAt = now();
      }
      players[uid] = p;
      return { promoted: js.rank > before, before, after: js.rank, player: clone(p), job, progress: nextRankProgress(p, job) };
    }, cfg.history.cap);
  }

  // ───────────── thống kê / bảng xếp hạng / lịch sử ─────────────
  function history(uid, page = 1) {
    const list = S.readHistory(String(uid)).slice().reverse();
    const size = int(cfg.history.pageSize, 6);
    const pages = Math.max(1, Math.ceil(list.length / size));
    const pg = Math.min(Math.max(1, page), pages);
    return { items: list.slice((pg - 1) * size, pg * size), page: pg, pages, total: list.length };
  }
  function top(kind = "tien") {
    const all = S.readPlayers();
    const rows = Object.values(all).map((x) => normPlayer(x, x.uid)).filter((x) => x.shiftsDone > 0 || x.daysWorked > 0 || x.totalIncome > 0);
    const bestRank = (p) => Math.max(-1, ...Object.values(p.jobs).map((j) => int(j.rank)));
    const totalJobExp = (p) => Object.values(p.jobs).reduce((s, j) => s + int(j.jobExp), 0);
    const value = { tien: (p) => p.totalIncome, ngay: (p) => p.daysWorked, cap: (p) => bestRank(p) * 1e7 + totalJobExp(p) }[kind] || ((p) => p.totalIncome);
    rows.sort((a, b) => value(b) - value(a) || b.totalIncome - a.totalIncome);
    return rows.slice(0, int(cfg.top.size, 10)).map((p, i) => ({ pos: i + 1, uid: p.uid, name: p.name, value: value(p), totalIncome: p.totalIncome, daysWorked: p.daysWorked, rankIdx: bestRank(p), rankName: bestRank(p) >= 0 ? rankInfo(bestRank(p)).name : "-", jobName: p.jobId ? getJob(p.jobId)?.name : null }));
  }
  async function stats(uid) {
    const p = await getPlayer(uid);
    const byJob = Object.entries(p.jobs).map(([id, j]) => ({ job: getJob(id), ...j })).filter((x) => x.job).sort((a, b) => b.income - a.income);
    const level = await levelOf(uid);
    return { player: p, byJob, level, avgWage: p.shiftsDone ? Math.round(p.totalIncome / p.shiftsDone) : 0, perfectRate: p.shiftsDone ? p.perfectShifts / p.shiftsDone : 0, todayWage: int(p.wageByDate[today()]) };
  }
  async function payroll(uid) {
    const p = await getPlayer(uid);
    if (!p.jobId) throw new WorkError("NO_JOB_NOW", "Bạn chưa có việc làm.");
    const job = getJob(p.jobId);
    const js = jobState(p, job.id);
    const r = rankInfo(js.rank);
    const date = today();
    const earned = int(p.wageByDate[date]);
    const full = wageFor(job, js.rank, 1);
    const perfect = Math.round(full * (1 + Number(cfg.shift.perfectBonusPct || 0)));
    const min = wageFor(job, js.rank, Number(cfg.shift.accuracyFloor ?? 0.6));
    return { player: p, job, rank: r, base: job.baseWage, multiplier: r.wageMultiplier, min, full, perfect, exp: job.exp, jobExp: job.jobExp, earnedToday: earned, capLeft: Math.max(0, cfg.wage.dailyIncomeCap - earned), cap: cfg.wage.dailyIncomeCap, doneToday: p.lastShiftDate === date && int(p.shiftsToday?.[date]) >= 1, nextRank: RANKS[js.rank + 1] || null };
  }
  async function dashboard(uid, name) {
    const p = await ensurePlayer(uid, name);
    const level = await levelOf(uid);
    let profile = null;
    try { profile = await (await prof()).getOrCreateProfile(uid); } catch { /* bỏ qua */ }
    const job = p.jobId ? getJob(p.jobId) : null;
    const unlocked = JOBS.filter((j) => eligibility(j, level, p).ok).length;
    return { player: p, level, exp: profile?.exp ?? 0, balance: await balanceOf(uid), job, jobState: job ? jobState(p, job.id) : null, rank: job ? rankInfo(jobState(p, job.id).rank) : null, progress: job ? nextRankProgress(p, job) : null, unlocked, total: JOBS.length, shift: p.shift, today: today() };
  }

  return {
    cfg, JOBS, GROUPS, RANKS, TASK_BY_ID, today, getJob, listJobs, groupIds, findGroup, findJobs, getPlayer, ensurePlayer, levelOf, balanceOf,
    jobStatus, eligibility, rankInfo, jobState, nextRankProgress, wageFor,
    checkApply, applyJob, quitJob, startShift, shiftView, submitAnswer, settle, recover, cancelShift,
    attendance, finishAttendance, promotionStatus, promote, history, top, stats, payroll, dashboard, throttle,
  };
}

let shared = null;
export function getEngine() { return (shared ||= createEngine()); }
export function resetSharedEngineForTests() { shared = null; }
export function setSharedEngineForTests(e) { shared = e; }
