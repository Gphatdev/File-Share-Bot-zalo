/**
 * .setting — ACCOUNT CONTROL SYSTEM (HNNP STUDIO)
 * Điều khiển tài khoản Zalo mà bot đang đăng nhập: nhatki | baiviet | video | logo | ten | huy | help.
 * Toàn bộ giao diện là ảnh Canvas (data/ADMIN/Setting/settingCanvas.js). Nhận ảnh/video/caption KHÔNG cần reply:
 * hook onMessage đọc tin tiếp theo của đúng người đã mở phiên (data/ADMIN/Setting/settingSession.js).
 * Chỉ OWNER / BOT ADMIN. Xem settingActions.js để biết API nào có thật, API nào chưa có (không giả lập thành công).
 */
import fs from "node:fs";
import path from "node:path";
import { resolveRole } from "../../Utils/Permission.js";
import { renderMain, renderState } from "./data/ADMIN/Setting/settingCanvas.js";
import * as S from "./data/ADMIN/Setting/settingSession.js";
import * as A from "./data/ADMIN/Setting/settingActions.js";

const SUB_ALIAS = {
  "": "main", help: "main", h: "main", huongdan: "main", menu: "main",
  nhatki: "nhatki", nhatky: "nhatki", diary: "nhatki",
  baiviet: "baiviet", bai: "baiviet", post: "baiviet",
  video: "video", vid: "video",
  logo: "logo", avatar: "logo", doilogo: "logo",
  ten: "ten", name: "ten", doiten: "ten",
  huy: "huy", cancel: "huy", stop: "huy",
};

const FLOW = {
  nhatki: { feature: "nhatki", provider: "diary", label: "ĐĂNG NHẬT KÍ", steps: ["video"] },
  baiviet: { feature: "baiviet", provider: "post", label: "ĐĂNG BÀI VIẾT", steps: ["image", "caption"] },
  video: { feature: "video", provider: "video", label: "ĐĂNG VIDEO ZALO", steps: ["video", "caption"] },
  logo: { feature: "logo", label: "ĐỔI LOGO", steps: ["image"] },
  ten: { feature: "ten", label: "ĐỔI TÊN ACC ZALO", steps: ["text"] },
};

// ───────────── gửi ảnh / chữ ─────────────
const ctxRef = { adapter: null, config: null, logger: null }; // dùng cho thông báo hết hạn (không có tin nhắn nào kích hoạt)
const prefixOf = (config) => String(config?.botPrefix || ".");

async function sendCanvas(adapter, threadId, threadType, buffer, caption = "") {
  S.cleanTempDir; // (giữ import dùng chung)
  fs.mkdirSync(S.TEMP_DIR, { recursive: true });
  const file = path.join(S.TEMP_DIR, `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
  try {
    fs.writeFileSync(file, buffer);
    await adapter.sendImage({ threadId, threadType, imagePath: file, caption });
    return true;
  } catch (err) {
    ctxRef.logger?.warn?.("[setting] Gửi Canvas thất bại:", { message: err?.message });
    return false;
  } finally { try { fs.unlinkSync(file); } catch { /* đã xoá */ } }
}
async function sendText(adapter, threadId, threadType, text) {
  try { await adapter.sendText({ threadId, threadType, text }); } catch (err) { ctxRef.logger?.warn?.("[setting] Gửi chữ thất bại:", { message: err?.message }); }
}
/** Gửi thẻ trạng thái; render/gửi ảnh lỗi thì gửi chữ dự phòng (không bao giờ nói thành công nếu chưa xác nhận). */
async function card(c, spec) {
  let buf = null;
  try { buf = await renderState({ prefix: prefixOf(c.config), ...spec }); } catch (err) { c.logger?.warn?.("[setting] Lỗi vẽ Canvas:", { message: err?.message }); }
  const ok = buf ? await sendCanvas(c.adapter, c.threadId, c.threadType, buf) : false;
  if (!ok) await sendText(c.adapter, c.threadId, c.threadType, [spec.title, spec.subtitle, ...(spec.lines || []), ...(spec.rows || []).map((r) => `${r.l}: ${r.v}`)].filter(Boolean).join("\n"));
  return ok;
}

// ───────────── quyền ─────────────
const deniedAt = new Map();
async function isAllowed(uid, config, adapter) {
  try { return (await resolveRole(String(uid), { config, adapter })) >= 2; } catch { return false; }
}
async function deny(c) {
  const last = deniedAt.get(c.uid) || 0;
  if (Date.now() - last < 30_000) return;
  deniedAt.set(c.uid, Date.now());
  await card(c, { kind: "denied", subtitle: "Chỉ OWNER hoặc ADMIN của bot mới được dùng hệ thống điều khiển tài khoản.", lines: [`UID của bạn: ${c.uid}`] });
}

// ───────────── thẻ theo bước ─────────────
function waitSpec(session, c, extra = {}) {
  const f = FLOW[session.type];
  const idx = f.steps.indexOf(session.step) + 1;
  const total = f.steps.length;
  const p = prefixOf(c.config);
  const base = { kind: "wait", step: { index: idx, total, label: f.label }, expireSec: S.remainingSec(session) };
  const huy = { k: `${p}setting huy`, d: "hủy thao tác" };
  const T = {
    video: session.type === "nhatki"
      ? { icon: "diary", title: "GỬI VIDEO NHẬT KÍ", subtitle: "Gửi video muốn đăng trực tiếp vào cuộc trò chuyện này. Không cần reply.", lines: ["• Chỉ nhận video của chính bạn", `• Tối đa ${A.LIMITS.videoMaxBytes / 1048576} MB, ${A.LIMITS.videoMaxSec / 60} phút`], chips: [huy] }
      : { icon: "video", title: "GỬI VIDEO CẦN ĐĂNG", subtitle: "Gửi video muốn đăng lên Zalo trực tiếp vào cuộc trò chuyện này. Không cần reply.", lines: [`• Tối đa ${A.LIMITS.videoMaxBytes / 1048576} MB, ${A.LIMITS.videoMaxSec / 60} phút`, "• Sau đó bạn sẽ nhập caption"], chips: [huy] },
    image: session.type === "logo"
      ? { icon: "logo", title: "GỬI ẢNH ĐẠI DIỆN MỚI", subtitle: "Gửi ảnh logo mới trực tiếp vào cuộc trò chuyện này. Không cần reply.", lines: ["• Ảnh sẽ được cắt vuông, ưu tiên ảnh rõ nét", `• Tối thiểu ${A.LIMITS.imageMinSide}px, tối đa ${A.LIMITS.imageMaxBytes / 1048576} MB`], chips: [huy] }
      : { icon: "post", title: "GỬI ẢNH BÀI VIẾT", subtitle: "Gửi một hình ảnh muốn đăng trực tiếp vào cuộc trò chuyện này. Không cần reply.", lines: ["• Chỉ nhận ảnh của chính bạn", "• Sau đó bạn sẽ nhập caption"], chips: [huy] },
    caption: { icon: "text", title: "NHẬP CAPTION", subtitle: "Gửi nội dung caption bằng tin nhắn văn bản thông thường (hỗ trợ tiếng Việt có dấu và emoji).", lines: [`• Tối đa ${A.LIMITS.captionMax} ký tự`], chips: [{ k: "boqua", d: "đăng không caption" }, huy] },
    text: { icon: "name", title: "NHẬP TÊN MỚI", subtitle: "Gửi tên muốn đặt cho tài khoản Zalo bằng tin nhắn văn bản. Không cần reply.", lines: [`• Từ ${A.LIMITS.nameMin} đến ${A.LIMITS.nameMax} ký tự, có ít nhất một chữ cái`, "• Zalo có thể giới hạn số lần đổi tên"], chips: [huy] },
  }[session.step];
  return { ...base, ...T, ...extra };
}

async function begin(c, key) {
  const f = FLOW[key];
  const api = c.adapter.raw || c.adapter;
  // chức năng chưa có API → báo ngay, không bắt người dùng gửi dữ liệu vô ích
  const cap = A.capabilities(api);
  if (!cap[f.feature]) {
    return card(c, {
      kind: "unsupported", icon: f.feature === "nhatki" ? "diary" : f.feature === "baiviet" ? "post" : f.feature === "video" ? "video" : f.feature === "logo" ? "logo" : "name",
      title: `${f.label}: CHƯA CÓ API`, subtitle: A.MISSING_API_TEXT[f.feature],
      lines: ["Giao diện và luồng nhận dữ liệu đã sẵn sàng, nhưng bot không giả lập kết quả.", "Khi có API, nối bằng registerSettingProvider (xem README_SETTING.md)."],
    });
  }
  const old = S.getSession(c.uid);
  if (old?.status === S.STATUS.PROCESSING) return card(c, { kind: "busy", subtitle: "Thao tác trước vẫn đang được xử lý. Vui lòng chờ kết quả rồi thử lại." });
  const switched = !!old && old.type !== key;
  const s = S.startSession({ uid: c.uid, threadId: c.threadId, threadType: c.threadType, type: key, step: f.steps[0] });
  return card(c, waitSpec(s, c, switched ? { notice: true, title: `ĐÃ CHUYỂN SANG: ${f.label}` } : {}));
}

async function cancel(c) {
  const cur = S.getSession(c.uid);
  // đang gọi API: không huỷ ngang (tránh trạng thái nửa vời / đăng trùng khi thử lại)
  if (cur?.status === S.STATUS.PROCESSING) return card(c, { kind: "busy", subtitle: "Thao tác đang được gửi tới Zalo nên chưa thể hủy lúc này. Vui lòng chờ kết quả." });
  const s = S.endSession(c.uid);
  if (!s) return card(c, { kind: "cancelled", title: "KHÔNG CÓ PHIÊN NÀO", subtitle: "Bạn chưa mở thao tác .setting nào để hủy." });
  return card(c, { kind: "cancelled", subtitle: `Đã hủy thao tác "${FLOW[s.type]?.label || s.type}". Dữ liệu tạm đã được xoá.` });
}

// ───────────── xử lý dữ liệu của phiên ─────────────
async function fail(c, session, title, text, extra = {}) {
  S.endSession(session.uid);
  return card(c, { kind: "fail", title, subtitle: text, ...extra });
}

async function handleSessionData(c, session, message) {
  const data = message.data;
  const api = c.adapter.raw || c.adapter;
  const f = FLOW[session.type];
  const media = A.extractMedia(data);
  const textContent = typeof data.content === "string" ? data.content : null;
  const wantMedia = session.step === "image" ? "image" : session.step === "video" ? "video" : null;

  // ---- bước nhận ảnh / video ----
  if (wantMedia) {
    if (media.kind !== wantMedia) {
      const what = wantMedia === "image" ? "ảnh" : "video";
      return card(c, waitSpec(session, c, { subtitle: `Bạn đang ở bước chờ ${what}. Dữ liệu vừa gửi không đúng loại — hãy gửi ${what} (hoặc hủy bằng ${prefixOf(c.config)}setting huy).` }));
    }
    S.markProcessing(session);
    try {
      if (wantMedia === "video") {
        const v = A.validateVideoInfo(media);
        if (!v.ok) { S.advance(session, session.step); session.status = S.STATUS.WAITING; return card(c, waitSpec(session, c, { kind: "wait", subtitle: v.text + " Hãy gửi video khác." })); }
        await card(c, { kind: "processing", title: "ĐANG TẢI VIDEO", subtitle: "Bot đang tải video bạn vừa gửi…" });
        const dest = S.addFile(session, S.tempPath(session.uid, "mp4"));
        await A.downloadToFile(media.url, dest, { maxBytes: A.LIMITS.videoMaxBytes });
        session.data.video = { path: dest, durationSec: media.durationSec, size: fs.statSync(dest).size };
        if (session.type === "nhatki") return await finish(c, session);
        S.advance(session, "caption"); session.status = S.STATUS.WAITING;
        return card(c, waitSpec(session, c, { subtitle: "Đã nhận video. " + waitSpec(session, c).subtitle }));
      }
      // ảnh
      await card(c, { kind: "processing", title: "ĐANG XỬ LÝ ẢNH", subtitle: "Bot đang tải và kiểm tra ảnh bạn vừa gửi…" });
      const raw = S.addFile(session, S.tempPath(session.uid, "img"));
      await A.downloadToFile(media.url, raw, { maxBytes: A.LIMITS.imageMaxBytes });
      const out = S.addFile(session, S.tempPath(session.uid, "jpg"));
      const img = await A.prepareImage(raw, out, { purpose: session.type === "logo" ? "logo" : "post" });
      session.data.image = img;
      if (session.type === "logo") return await finish(c, session);
      S.advance(session, "caption"); session.status = S.STATUS.WAITING;
      let preview = null; try { preview = fs.readFileSync(out).length < 900_000 ? fs.readFileSync(out) : null; } catch { /* không có preview */ }
      return card(c, waitSpec(session, c, { preview, subtitle: "Đã nhận ảnh. " + waitSpec(session, c).subtitle }));
    } catch (err) {
      if (err?.code === "TOO_BIG") return fail(c, session, "TỆP QUÁ NẶNG", "Tệp vượt dung lượng cho phép. Hãy chọn tệp nhẹ hơn và mở lại thao tác.");
      if (["BAD_IMAGE", "SMALL_IMAGE", "NO_SHARP", "BAD_URL"].includes(err?.code)) return fail(c, session, "DỮ LIỆU KHÔNG HỢP LỆ", err.message);
      const fe = A.friendlyError(err);
      c.logger?.warn?.("[setting] Lỗi nhận media:", { message: err?.message });
      return fail(c, session, "KHÔNG TẢI ĐƯỢC TỆP", fe.code === "TIMEOUT" || fe.code === "NETWORK" ? fe.text : "Bot không tải được tệp bạn gửi. Hãy thử gửi lại sau khi mở lại thao tác.");
    }
    finally {
      // Phiên đã bị kết thúc (hết hạn/hủy) trong lúc đang tải → dọn file tạm vừa ghi, tránh sót.
      if (S.getSession(session.uid) !== session) {
        for (const f of session.data.files || []) { try { fs.unlinkSync(f); } catch { /* đã xóa */ } }
      }
    }
  }

  // ---- bước nhận văn bản (caption / tên) ----
  if (textContent == null) {
    return card(c, waitSpec(session, c, { subtitle: "Bước này cần tin nhắn VĂN BẢN. Hãy gửi chữ (hoặc hủy bằng " + prefixOf(c.config) + "setting huy)." }));
  }
  const word = textContent.trim();
  if (/^(huy|hủy|cancel)$/i.test(word)) return cancel(c);

  if (session.step === "caption") {
    let caption = "";
    if (!/^(boqua|bỏ qua|skip)$/i.test(word)) {
      const v = A.validateCaption(word);
      if (!v.ok) return card(c, waitSpec(session, c, { subtitle: v.text + " Hãy gửi caption ngắn hơn." }));
      caption = v.caption;
    }
    session.data.caption = caption;
    S.markProcessing(session);
    return finish(c, session);
  }

  if (session.step === "text") { // đổi tên
    const v = A.validateName(word);
    if (!v.ok) return card(c, waitSpec(session, c, { subtitle: v.text + " Hãy gửi tên khác." }));
    session.data.name = v.name;
    S.markProcessing(session);
    return finish(c, session);
  }
  void f; void api;
}

/** Bước cuối: gọi API thật / provider và báo kết quả đúng sự thật. */
async function finish(c, session) {
  const api = c.adapter.raw || c.adapter;
  S.markProcessing(session);
  const f = FLOW[session.type];
  await card(c, { kind: "processing", title: `ĐANG ${f.label}`, subtitle: "Đang gửi yêu cầu tới Zalo, vui lòng chờ…" });
  let res;
  try {
    if (session.type === "logo") res = await A.changeAvatar(api, session.data.image.path);
    else if (session.type === "ten") res = await A.changeName(api, session.data.name);
    else if (session.type === "nhatki") res = await A.publish("diary", { filePath: session.data.video.path, mime: "video/mp4", durationSec: session.data.video.durationSec, size: session.data.video.size }, { lockKey: session.uid });
    else if (session.type === "baiviet") res = await A.publish("post", { filePath: session.data.image.path, mime: "image/jpeg", caption: session.data.caption, width: session.data.image.width, height: session.data.image.height }, { lockKey: session.uid });
    else if (session.type === "video") res = await A.publish("video", { filePath: session.data.video.path, mime: "video/mp4", caption: session.data.caption, durationSec: session.data.video.durationSec, size: session.data.video.size }, { lockKey: session.uid });
  } catch (err) { res = { ok: false, code: "API_ERROR", text: A.friendlyError(err).text }; }
  S.endSession(session.uid);   // luôn dọn file tạm + giải phóng phiên trước khi báo kết quả

  if (res?.ok) {
    const rows = [];
    if (session.type === "ten") { rows.push({ l: "Tên cũ", v: res.oldName || "—" }, { l: "Tên mới", v: res.shown || res.name }); }
    if (session.type === "logo") rows.push({ l: "Ảnh đại diện", v: "Đã cập nhật" });
    if (session.type === "baiviet" || session.type === "video") rows.push({ l: "Caption", v: session.data.caption ? (session.data.caption.length > 40 ? session.data.caption.slice(0, 40) + "…" : session.data.caption) : "(không có)" });
    if (res.id) rows.push({ l: "Mã bài đăng", v: String(res.id) });
    return card(c, {
      kind: "success", title: `${f.label}: THÀNH CÔNG`, rows,
      subtitle: session.type === "ten" && res.verified === false ? "Zalo đã nhận yêu cầu nhưng chưa xác minh lại được tên mới — hãy kiểm tra lại tài khoản." : "Zalo đã xác nhận thao tác thành công.",
    });
  }
  if (res?.code === "UNSUPPORTED") return card(c, { kind: "unsupported", title: `${f.label}: CHƯA CÓ API`, subtitle: res.text });
  if (res?.code === "UNCERTAIN") return card(c, { kind: "unsupported", icon: "clock", title: "CHƯA XÁC NHẬN ĐƯỢC KẾT QUẢ", subtitle: res.text });
  return card(c, { kind: "fail", title: `${f.label}: THẤT BẠI`, subtitle: res?.text || "Không rõ nguyên nhân.", lines: res?.code ? [`Mã lỗi: ${res.code}`] : [] });
}

// ───────────── bảng điều khiển ─────────────
async function showMain(c) {
  const api = c.adapter.raw || c.adapter;
  let profile = {}, connected = null;
  try { profile = await A.getProfile(api); connected = true; } catch (err) { connected = false; c.logger?.warn?.("[setting] Không lấy được hồ sơ tài khoản:", { message: err?.message }); try { profile = { uid: String(api.getOwnId?.() || "") }; } catch { /* không có uid */ } }
  const cur = S.getSession(c.uid);
  let buf = null;
  try { buf = await renderMain({ profile, connected, support: A.capabilities(api), prefix: prefixOf(c.config), activeFeature: cur?.type || null }); } catch (err) { c.logger?.warn?.("[setting] Lỗi vẽ bảng điều khiển:", { message: err?.message }); }
  const ok = buf ? await sendCanvas(c.adapter, c.threadId, c.threadType, buf) : false;
  if (!ok) await sendText(c.adapter, c.threadId, c.threadType, `ACCOUNT CONTROL\n${prefixOf(c.config)}setting nhatki | baiviet | video | logo | ten | huy`);
  // đang có phiên: nhắc nhẹ, KHÔNG đổi/huỷ phiên
  if (cur) await card(c, waitSpec(cur, c, { title: `ĐANG CÓ PHIÊN: ${FLOW[cur.type].label}` }));
}

// ───────────── export lệnh ─────────────
S.setExpireHandler(async (s) => {
  const { adapter, config, logger } = ctxRef;
  if (!adapter) return;
  const c = { adapter, config, logger, threadId: s.threadId, threadType: s.threadType, uid: s.uid };
  await card(c, { kind: "expired", subtitle: `Thao tác "${FLOW[s.type]?.label || s.type}" đã hết thời gian chờ. Dữ liệu tạm đã được xoá.`, lines: [`Gõ ${prefixOf(config)}setting ${s.type} để bắt đầu lại.`] });
});

const busyAt = new Map();

export default {
  name: "setting",
  description: "ACCOUNT CONTROL: đăng nhật kí/bài viết/video, đổi logo, đổi tên tài khoản Zalo của bot (Canvas, chỉ OWNER/ADMIN)",
  version: "1.0.0",
  author: "HNNP STUDIO",
  group: "system",
  role: 0,              // tự kiểm tra OWNER/ADMIN bên trong để trả thẻ "Không đủ quyền" bằng Canvas
  cooldown: 2,
  aliases: [],
  noPrefix: false,

  async run({ adapter, message, args = [], config, logger }) {
    ctxRef.adapter = adapter; ctxRef.config = config; ctxRef.logger = logger;
    const uid = String(message?.data?.uidFrom || "");
    const c = { adapter, config, logger, uid, threadId: String(message.threadId), threadType: message.type === 1 ? "group" : "user" };
    if (!uid) return;
    if (!(await isAllowed(uid, config, adapter))) return deny(c);
    const sub = SUB_ALIAS[String(args[0] ?? "").toLowerCase()];
    if (sub === undefined) return card(c, { kind: "fail", title: "LỆNH KHÔNG HỢP LỆ", subtitle: `Dùng ${prefixOf(config)}setting help để xem bảng điều khiển.` });
    if (sub === "main") return showMain(c);
    if (sub === "huy") return cancel(c);
    return begin(c, sub);
  },

  /** Nhận ảnh/video/caption/tên của phiên (không cần reply). */
  async onMessage({ adapter, message, config, logger }) {
    try {
      if (!message || message.isSelf) return;
      const uid = String(message?.data?.uidFrom || "");
      if (!uid) return;
      const session = S.getSession(uid);
      if (!session) return;
      if (String(message.threadId) !== session.threadId) return;            // không lấy dữ liệu từ cuộc trò chuyện khác
      const content = message.data?.content;
      if (typeof content === "string" && content.trim().startsWith(prefixOf(config))) return; // là lệnh → để router xử lý
      ctxRef.adapter = adapter; ctxRef.config = config; ctxRef.logger = logger;
      const c = { adapter, config, logger, uid, threadId: session.threadId, threadType: session.threadType };
      if (S.seenMessage(message.data?.msgId)) return;                         // sự kiện trùng
      // quyền được kiểm tra lại ở MỖI bước nhận dữ liệu
      if (!(await isAllowed(uid, config, adapter))) { S.endSession(uid); message.__settingConsumed = true; return deny(c); }
      message.__settingConsumed = true;
      if (typeof content === "string") message.data.content = "";            // caption/tên không bị lệnh noPrefix khác chiếm
      if (session.status === S.STATUS.PROCESSING) {                           // đang gọi API: không nhận thêm, không đăng trùng
        const last = busyAt.get(uid) || 0;
        if (Date.now() - last > 8000) { busyAt.set(uid, Date.now()); await card(c, { kind: "busy", subtitle: "Thao tác của bạn đang được xử lý. Vui lòng chờ kết quả." }); }
        return;
      }
      await handleSessionData(c, session, { ...message, data: { ...message.data, content } });
    } catch (err) {
      logger?.error?.("[setting] Lỗi hook onMessage:", { message: err?.message });
    }
  },
};
