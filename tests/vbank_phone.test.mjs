/** Test nhận diện SĐT + boqua + danh thiếp cho VBANK. Chạy: node tests/vbank_phone.test.mjs (nên chạy trên BẢN SAO: ghi accounts.json) */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const P = await imp("Core/Commands/data/GIAITRI/STK/phone.js");
let pass = 0, fail = 0; const res = [];
const t = async (n, f) => { try { await f(); pass++; } catch (e) { fail++; res.push(`FAIL ${n}: ${e.message}`); } };

await t("Chữ số ASCII + mọi kiểu ngăn cách / tiền tố", () => {
  for (const v of ["0912345678", "0912 345 678", "0912.345.678", "0912-345-678", "(0912) 345 678", "+84912345678", "+84 912 345 678", "84912345678", "0084912345678", "+84 (0) 912 345 678", "912345678", "  0912345678  "])
    assert.equal(P.normalizePhone(v), "0912345678", v);
});
await t("Chữ số Unicode: full-width, Arabic-Indic, Devanagari, toán học, keycap", () => {
  for (const v of ["０９１２３４５６７８", "٠٩١٢٣٤٥٦٧٨", "०९१२३४५६७८", "𝟎𝟗𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖", "0️⃣9️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣", "۰۹۱۲۳۴۵۶۷۸"])
    assert.equal(P.normalizePhone(v), "0912345678", v);
});
await t("Số đọc bằng chữ (Việt/Anh)", () => {
  assert.equal(P.normalizePhone("không chín một hai ba bốn năm sáu bảy tám"), "0912345678");
  assert.equal(P.normalizePhone("khong chin mot hai ba bon nam sau bay tam"), "0912345678");
  assert.equal(P.normalizePhone("zero nine one two three four five six seven eight"), "0912345678");
  assert.equal(P.normalizePhone("0 chín 1 2 3 bốn 5 sáu 7 8"), "0912345678");
});
await t("Không hợp lệ → null (không đoán bừa)", () => {
  for (const v of ["", "abc", "Ơ", "12345", "0212345678", "09123456789", "1234567890123456", "xin chào bạn", "ba ba ba", null, undefined])
    assert.equal(P.normalizePhone(v), null, String(v));
});
await t("Tìm số trong câu / danh thiếp", () => {
  assert.equal(P.findPhoneInText("sđt của tôi là 0936 673 667 nhé"), "0936673667");
  const card = { msgType: "chat.recommended", content: { title: "Vũ Văn Viết", description: "0936673667", href: "https://zalo.me/x", action: "recommened.user", params: JSON.stringify({ userId: "123456789012345678", isFriend: 0 }) } };
  assert.equal(P.phoneFromMessageData(card), "0936673667");
  assert.equal(P.phoneFromMessageData({ content: { title: "A", params: JSON.stringify({ userId: "1", phone: "+84 936 673 667" }) } }), "0936673667");
  assert.equal(P.phoneFromMessageData({ content: JSON.stringify({ title: "A", description: "٠٩٣٦٦٧٣٦٦٧" }) }), "0936673667");
  assert.equal(P.phoneFromMessageData({ msgType: "chat.recommended", content: { title: "Ẩn số", params: JSON.stringify({ userId: "123456789012345678" }) } }), null);
  assert.ok(P.isContactCard({ msgType: "chat.recommended", content: {} }));
  assert.ok(P.isContactCard({ content: { action: "recommened.user" } }));
  assert.ok(!P.isContactCard({ msgType: "webchat", content: "hi" }));
});
await t("isSkipInput", () => {
  for (const v of ["boqua", "BOQUA", "bỏ qua", "Bo Qua", "bo_qua", "skip", "boqua!"]) assert.ok(P.isSkipInput(v), v);
  for (const v of ["", "huy", "0912345678", "qua", "boqua123"]) assert.ok(!P.isSkipInput(v), v);
});

// Luồng tạo tài khoản VBANK qua handleStkInput
const STK = await imp("Core/Commands/data/GIAITRI/STK/index.js");
const txt = (outs) => (outs || []).map((o) => o.text || o.caption || "").join("\n");
const U = () => "u" + Math.random().toString(16).slice(2);
async function toPhoneStep(uid, name = "Test") {
  await STK.handleStkCommand({ sub: "tao", args: ["tao", name], senderId: uid });
  await STK.handleStkInput({ senderId: uid, text: "ngaunhien" });
  const o = await STK.handleStkInput({ senderId: uid, text: "1" });
  assert.match(txt(o), /số điện thoại/i);
}
await t("VBANK: gõ số kiểu lạ → nhận, sang bước logo", async () => {
  for (const v of ["０９１２３４５６７８", "+84 912 345 678", "không chín một hai ba bốn năm sáu bảy tám"]) {
    const uid = U(); await toPhoneStep(uid);
    const o = await STK.handleStkInput({ senderId: uid, text: v });
    assert.match(txt(o), /Đã nhận số điện thoại 0912345678/, v);
    await STK.handleStkInput({ senderId: uid, text: "huy" });
  }
});
await t("VBANK: gửi DANH THIẾP (không có text) → nhận số", async () => {
  const uid = U(); await toPhoneStep(uid);
  const card = { msgType: "chat.recommended", content: { title: "Vũ Văn Viết", description: "0936673667", href: "https://zalo.me/x", action: "recommened.user" } };
  const o = await STK.handleStkInput({ senderId: uid, text: "", imageUrl: card.content.href, messageData: card });
  assert.match(txt(o), /Đã nhận số điện thoại 0936673667/);
  await STK.handleStkInput({ senderId: uid, text: "huy" });
});
await t("VBANK: danh thiếp ẩn số → báo rõ, vẫn ở bước SĐT", async () => {
  const uid = U(); await toPhoneStep(uid);
  const card = { msgType: "chat.recommended", content: { title: "X", action: "recommened.user" } };
  const o = await STK.handleStkInput({ senderId: uid, text: "", messageData: card });
  assert.match(txt(o), /không có số điện thoại/);
  assert.match(txt(o), /boqua/);
  const o2 = await STK.handleStkInput({ senderId: uid, text: "boqua" });
  assert.match(txt(o2), /bỏ qua số điện thoại/i);
  await STK.handleStkInput({ senderId: uid, text: "huy" });
});
await t("VBANK: boqua ở bước SĐT → sang logo → hoàn tất, không có SĐT", async () => {
  const uid = U(); await toPhoneStep(uid, "BoQua " + uid.slice(1, 5));
  const o = await STK.handleStkInput({ senderId: uid, text: "bỏ qua" });
  assert.match(txt(o), /bỏ qua số điện thoại/i); assert.match(txt(o), /Logo/);
  const done = await STK.handleStkInput({ senderId: uid, text: "boqua" });
  assert.ok(done && done.length, "phải tạo xong tài khoản");
  const acc = JSON.parse((await import("node:fs")).readFileSync(path.join(ROOT, "Core/Commands/data/GIAITRI/STK/accounts.json"), "utf8")).find((a) => a.ownerUserId === uid);
  assert.ok(acc && (acc.phoneNumber === null || acc.phoneNumber === undefined));
});
await t("VBANK: SĐT sai vẫn báo lỗi + gợi ý boqua", async () => {
  const uid = U(); await toPhoneStep(uid);
  const o = await STK.handleStkInput({ senderId: uid, text: "Ơ" });
  assert.match(txt(o), /không hợp lệ/); assert.match(txt(o), /boqua/);
  await STK.handleStkInput({ senderId: uid, text: "huy" });
});

console.log(res.join("\n") || "");
console.log(`PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
