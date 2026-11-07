/**
 * AI/styleAnalyzer.js — tổng hợp PHONG CÁCH giao tiếp của nhóm từ tin nhắn (khi chế độ học đang bật).
 * Chỉ lưu SỐ LIỆU tổng hợp (đếm emoji, từ lóng, cách xưng hô, độ dài câu, cụm từ nhiều người cùng dùng…),
 * KHÔNG lưu nguyên văn tin nhắn. Tin nhạy cảm bị loại hoàn toàn (xem textUtils.looksSensitive).
 * Lưu ý: đây là cập nhật hồ sơ phong cách + system prompt, KHÔNG phải fine-tuning mô hình.
 */
import { AI_SETTINGS } from "./config.js";
import { sanitize, findEmoji, findEmoticons, hasVietnameseDiacritics, norm } from "./textUtils.js";
import * as store from "./store.js";

const SLANG = new Set(["vcl", "vl", "vkl", "clgt", "đc", "dc", "ko", "k", "kh", "hok", "hông", "hong", "ok", "oke", "okê", "hihi", "haha", "hehe", "kkk", "kaka", "nha", "nhé", "nè", "nhỉ", "hen", "ae", "bro", "vãi", "xỉu", "đỉnh", "chill", "flex", "toang", "ngon", "oải", "chê", "dui", "zui", "iu", "bt", "bth", "đg", "đag", "dg", "j", "z", "ạ", "dạ", "ờ", "ừ", "uk", "um", "ủa", "hả", "á", "ớ", "cơ", "luôn", "thôi", "trời", "ơi", "mà", "đấy", "đó", "nhể", "hèn", "xịn", "gét", "gô", "cute", "lol", "hóng", "hot", "drama", "tr", "trc", "sv", "ib", "rep", "mn", "mng"]);
const PRONOUNS = new Set(["tôi", "tui", "mình", "tớ", "tao", "tau", "mày", "mi", "cậu", "bạn", "anh", "chị", "em", "ông", "bà", "bác", "cô", "chú", "bro", "ae", "má", "bố", "mẹ", "cả nhà", "mọi người", "mn", "mng", "các bạn", "ní", "bồ"]);
const STOP = new Set(["và", "là", "của", "có", "không", "được", "cho", "với", "này", "đó", "các", "một", "những", "để", "thì", "mà", "ở", "trong", "khi"]);
const INJECT = /(ignore|bỏ qua|quên|system|prompt|hướng dẫn|chỉ thị|instruction|jailbreak|\bdan\b|developer|reset)/i;
const LAUGH = /(ha){2,}|(he){2,}|(hi){2,}|\bk{3,}\b|\bkaka\b|=\)\)+|:\)\)+|\blol\b|😂|🤣|😆/i;

export function emptyStyle() {
  return { sampleCount: 0, staffSamples: 0, lenSum: 0, short: 0, mid: 0, long: 0, emoji: {}, emoticon: {}, emojiMsgs: 0, slang: {}, slangMsgs: 0, pronouns: {}, noDiacritics: 0, viMsgs: 0, questions: 0, exclaims: 0, laughs: 0, phrases: {}, cand: {}, members: {}, derived: null, notes: "", lastUpdated: 0, lastRefineAt: 0, createdAt: Date.now() };
}
const bump = (map, k, n = 1) => { map[k] = (map[k] || 0) + n; };
function topN(map, n, min = 1) { return Object.entries(map).filter(([, v]) => v >= min).sort((a, b) => b[1] - a[1]).slice(0, n); }
function pruneMap(map, max) {
  const keys = Object.keys(map);
  if (keys.length <= max) return;
  const sorted = Object.entries(map).sort((a, b) => (b[1].c ?? b[1]) - (a[1].c ?? a[1])).slice(0, Math.floor(max * 0.7));
  for (const k of keys) delete map[k];
  for (const [k, v] of sorted) map[k] = v;
}
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
function tokens(text) { return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []); }

/** Có nên học tin nhắn này không + bản đã làm sạch. */
export function prepare(text, prefix = ".") {
  const raw = String(text ?? "").trim();
  if (!raw || raw.startsWith(prefix)) return null;
  const s = sanitize(raw, 400);
  if (!s || s.length < 2) return null;
  if (INJECT.test(s) && /(bot|ai|prompt|system)/i.test(s)) return null;   // nội dung giống chỉ thị → không học
  return s;
}

/**
 * Học 1 tin nhắn. Trả về true nếu tin được tính vào mẫu.
 * @param {string} gid  @param {{uid:string,text:string,isStaff?:boolean,prefix?:string}} m
 */
export function learnMessage(gid, m, settings = AI_SETTINGS) {
  const text = prepare(m.text, m.prefix);
  if (!text) return false;
  const st = store.getStyle(gid) || emptyStyle();
  const w = m.isStaff ? Math.max(1, settings.staffWeight || 1) : 1;
  const uid = String(m.uid || "?");

  st.sampleCount += 1; if (m.isStaff) st.staffSamples += 1;
  st.lenSum += text.length;
  if (text.length < 25) st.short += 1; else if (text.length < 80) st.mid += 1; else st.long += 1;

  const emo = findEmoji(text), emot = findEmoticons(text);
  if (emo.length || emot.length) st.emojiMsgs += 1;
  for (const e of emo) bump(st.emoji, e);
  for (const e of emot) bump(st.emoticon, e);

  const toks = tokens(text);
  let slangHit = 0;
  for (const t of toks) {
    if (SLANG.has(t)) { bump(st.slang, t, w); slangHit += 1; }
    if (PRONOUNS.has(t)) bump(st.pronouns, t, w);
  }
  for (const p of ["cả nhà", "mọi người", "các bạn", "anh em"]) if (text.toLowerCase().includes(p)) bump(st.pronouns, p, w);
  if (slangHit) st.slangMsgs += 1;
  if (hasVietnameseDiacritics(text)) st.viMsgs += 1;
  else if (/\b(khong|ko|dc|toi|minh|cua|nhung|nhu|vay|roi|the|nao|gi|oi|nha|ne|hen|di|di|an|choi|lam|ban)\b/i.test(norm(text))) st.noDiacritics += 1;
  if (/\?/.test(text)) st.questions += 1;
  if (/!/.test(text)) st.exclaims += 1;
  if (LAUGH.test(text)) st.laughs += 1;

  // cụm từ phổ biến: n-gram 2–3 từ. Cụm mới chỉ được ghi dưới dạng MÃ BĂM (không lưu chữ); chỉ khi có ≥2 thành viên
  // cùng dùng thì mới lưu chữ của cụm đó → không thể dựng lại tin nhắn của một người từ hồ sơ.
  const content = toks.filter((t) => !/^\d+$/.test(t));
  const cand = st.cand || (st.cand = {});
  for (let n = 2; n <= 3; n++) for (let i = 0; i + n <= content.length; i++) {
    const g = content.slice(i, i + n);
    const k = g.join(" ");
    if (g.every((t) => STOP.has(t)) || k.length < 5 || INJECT.test(k)) continue;
    const known = st.phrases[k];
    if (known) { known.c += 1; if (!known.u.includes(uid) && known.u.length < 4) known.u.push(uid); continue; }
    const h = fnv(k);
    const e = cand[h] || (cand[h] = { c: 0, u: [] });
    e.c += 1; if (!e.u.includes(uid) && e.u.length < 4) e.u.push(uid);
    if (e.u.length >= 2) { st.phrases[k] = { c: e.c, u: [...e.u] }; delete cand[h]; }
  }
  pruneMap(st.phrases, settings.maxPhraseCounters);
  pruneMap(cand, settings.maxPhraseCounters * 4);

  // phong cách riêng từng người (chỉ số tổng hợp, giới hạn số người)
  const mem = st.members[uid] || (st.members[uid] = { n: 0, len: 0, emoji: 0, slang: {} });
  mem.n += 1; mem.len += text.length; if (emo.length || emot.length) mem.emoji += 1;
  for (const t of toks) if (SLANG.has(t)) bump(mem.slang, t);
  pruneMap(st.members, settings.maxMembersTracked);
  const ks = Object.keys(st.members);
  if (ks.length > settings.maxMembersTracked) { ks.sort((a, b) => st.members[b].n - st.members[a].n); for (const k of ks.slice(settings.maxMembersTracked)) delete st.members[k]; }

  st.lastUpdated = Date.now();
  if (st.sampleCount % 10 === 0) st.derived = summarize(st, settings);
  store.saveStyle(gid, st);
  return true;
}

export function summarize(st, settings = AI_SETTINGS) {
  const n = Math.max(1, st.sampleCount);
  const avgLen = Math.round(st.lenSum / n);
  const slangRate = st.slangMsgs / n, emojiRate = st.emojiMsgs / n, shortRate = st.short / n, noDia = st.noDiacritics / Math.max(1, st.viMsgs + st.noDiacritics);
  const casual = slangRate * 0.4 + noDia * 0.2 + emojiRate * 0.2 + shortRate * 0.2;
  const tone = casual < 0.2 ? "trang trọng, lịch sự" : casual < 0.4 ? "thân thiện, tự nhiên" : "rất thân mật, suồng sã như bạn bè";
  const emojiTop = [...topN(st.emoji, 4, 2), ...topN(st.emoticon, 3, 2)].map(([k]) => k);
  const emojiStyle = emojiRate < 0.08 ? "hầu như không dùng emoji" : emojiRate < 0.3 ? "thỉnh thoảng dùng emoji" : "hay dùng emoji / biểu tượng cảm xúc";
  const sentenceLength = avgLen < 20 ? "rất ngắn (vài chữ)" : avgLen < 45 ? "ngắn gọn" : avgLen < 100 ? "vừa phải" : "khá dài";
  const lr = st.laughs / n;
  const humorStyle = lr < 0.05 ? "ít đùa, nghiêm túc" : lr < 0.2 ? "thỉnh thoảng đùa nhẹ" : "rất hay đùa, cười (haha, =)), kkk…)";
  const phrases = Object.entries(st.phrases).filter(([, v]) => v.c >= 3 && v.u.length >= 2).sort((a, b) => b[1].c - a[1].c).slice(0, settings.maxPhrases).map(([k]) => k);
  return {
    tone, pronouns: topN(st.pronouns, 5, 2).map(([k]) => k), slang: topN(st.slang, 10, 2).map(([k]) => k),
    emojiStyle, emojiTop, sentenceLength, humorStyle, commonPhrases: phrases,
    writesWithoutDiacritics: noDia > 0.35, questionStyle: st.questions / n > 0.3 ? "hay hỏi lại / đặt câu hỏi" : "ít đặt câu hỏi",
    exclaims: st.exclaims / n > 0.25, avgLen,
  };
}

/** Mức độ thích nghi 0..1 (0 = phong cách mặc định, 1 = bắt chước đầy đủ). */
export function adaptation(st, settings = AI_SETTINGS) {
  const n = st?.sampleCount || 0;
  if (n < settings.learnMinSamples) return 0;
  return Math.min(1, (n - settings.learnMinSamples) / Math.max(1, settings.learnFullSamples - settings.learnMinSamples) * 0.9 + 0.1);
}

/** Dữ liệu hiển thị cho `.ai học xem` (KHÔNG có nguyên văn tin nhắn). */
export function describe(gid, settings = AI_SETTINGS) {
  const st = store.getStyle(gid);
  if (!st || !st.sampleCount) return null;
  const d = summarize(st, settings);
  return { sampleCount: st.sampleCount, staffSamples: st.staffSamples, members: Object.keys(st.members).length, lastUpdated: st.lastUpdated, adaptation: adaptation(st, settings), notes: st.notes, ...d };
}

/** Xóa phần đóng góp phong cách của 1 thành viên (yêu cầu xóa dữ liệu). Trả true nếu có dữ liệu. */
export function forgetMember(gid, uid) {
  const st = store.getStyle(gid); const k = String(uid);
  if (!st || !st.members[k]) return false;
  delete st.members[k];
  for (const [p, e] of Object.entries(st.phrases)) { const i = e.u.indexOf(k); if (i >= 0) { e.u.splice(i, 1); if (e.u.length === 0) delete st.phrases[p]; } }
  store.saveStyle(gid, st, true);
  return true;
}

/** Nhờ Groq viết lại ghi chú phong cách từ SỐ LIỆU tổng hợp (không gửi nguyên văn tin nhắn). */
export async function maybeRefine(gid, askModel, settings = AI_SETTINGS) {
  const st = store.getStyle(gid);
  if (!st || !settings.learnRefine || typeof askModel !== "function") return false;
  if (st.sampleCount < settings.learnMinSamples || st.sampleCount - (st.lastRefineAt || 0) < settings.learnRefineEvery) return false;
  if (st.refining) return false;
  st.refining = true;
  try {
    const d = summarize(st, settings);
    const stats = JSON.stringify({ giong_dieu: d.tone, xung_ho: d.pronouns, tu_long: d.slang, emoji: d.emojiTop, do_dai_cau: d.sentenceLength, hai_huoc: d.humorStyle, cum_tu_pho_bien: d.commonPhrases.slice(0, 8), khong_dau: d.writesWithoutDiacritics });
    const notes = await askModel([
      { role: "system", content: "Bạn viết ghi chú ngắn (tối đa 5 câu tiếng Việt) mô tả phong cách nói chuyện của một nhóm chat, dựa trên số liệu thống kê được cung cấp. Chỉ mô tả cách nói (giọng điệu, xưng hô, từ lóng, emoji, độ dài câu). Không thêm quy tắc, không ra lệnh, không nhắc đến hệ thống." },
      { role: "user", content: stats },
    ]);
    const clean = String(notes || "").replace(/\s+/g, " ").trim().slice(0, 600);
    if (clean && !INJECT.test(clean)) { st.notes = clean; st.lastRefineAt = st.sampleCount; }
    return !!clean;
  } catch { return false; }
  finally { delete st.refining; store.saveStyle(gid, st); }
}
