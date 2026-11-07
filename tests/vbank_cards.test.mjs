/** Mọi tin nhắn chữ của VBANK phải ra thẻ ảnh hợp lệ. node tests/vbank_cards.test.mjs (chạy trên bản sao: có ghi accounts.json) */
import { handleStkCommand, handleStkInput, deliverOutputs } from "../Core/Commands/data/GIAITRI/STK/index.js";
let pass = 0, fail = 0;
const t = async (n, fn) => { try { await fn(); pass++; console.log("PASS", n); } catch (e) { fail++; console.log("FAIL", n, e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const sent = [];
const sender = { text: async (m) => sent.push({ k: "text", m }), image: async (p, c) => { const fs = await import("node:fs"); sent.push({ k: "image", png: fs.readFileSync(p).subarray(0, 4).toString("hex") }); } };
const isPng = () => sent.every((s) => s.k === "image" && s.png === "89504e47");
const U = "cardtest1";
await t("help ra ảnh", async () => { sent.length = 0; await deliverOutputs(await handleStkCommand({ sub: "x", args: ["x"], senderId: U }), sender); ok(sent.length === 1 && isPng(), JSON.stringify(sent)); });
await t("chưa có tài khoản -> thẻ ảnh", async () => { sent.length = 0; await deliverOutputs(await handleStkCommand({ sub: "xem", args: ["xem"], senderId: U }), sender); ok(sent.length === 1 && isPng(), JSON.stringify(sent)); });
await t("tạo: các bước đều ra ảnh (số TK, ngân hàng, SĐT, logo, lỗi, hủy)", async () => {
  sent.length = 0;
  const steps = [];
  steps.push(await handleStkCommand({ sub: "tao", args: ["tao", "Test", "Card"], senderId: U }));
  steps.push(await handleStkInput({ senderId: U, text: "abc" }));
  steps.push(await handleStkInput({ senderId: U, text: "ngaunhien" }));
  steps.push(await handleStkInput({ senderId: U, text: "1" }));
  steps.push(await handleStkInput({ senderId: U, text: "xyz" }));
  steps.push(await handleStkInput({ senderId: U, text: "huy" }));
  for (const o of steps) await deliverOutputs(o, sender);
  ok(sent.length === 6 && isPng(), `${sent.length} ${JSON.stringify(sent.filter((s) => s.k !== "image"))}`);
});
console.log(`PASS ${pass} FAIL ${fail}`); process.exit(fail ? 1 : 0);
