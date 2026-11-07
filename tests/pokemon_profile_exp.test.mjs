/** Test: thắng/thua solo Pokémon + nhận nhiệm vụ → EXP & thống kê vào HỒ SƠ (.hoso). CHẠY TRÊN BẢN SAO (ghi users.json/profiles.json): PK_TEST_COPY=1 node tests/pokemon_profile_exp.test.mjs */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
if (!process.env.PK_TEST_COPY) { console.error("Chạy trên BẢN SAO: PK_TEST_COPY=1"); process.exit(2); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const St = await imp("Core/Commands/data/GIAITRI/Pokemon/storage.js");
const PP = await imp("Core/Commands/data/GIAITRI/PlayerProfile/index.js");
let pass = 0, fail = 0; const res = [];
const t = async (n, f) => { try { await f(); pass++; } catch (e) { fail++; res.push(`FAIL ${n}: ${e.message}`); } };
const uid = "88" + Date.now(), uid2 = "99" + Date.now();
const prof = async (u) => (await PP.getOrCreateProfile(u));

await t("Người thắng solo nhận EXP vào hồ sơ (+500), người thua +150", async () => {
  const b1 = await prof(uid), b2 = await prof(uid2);
  const total = (p) => { let e = p.exp; for (let l = 1; l < p.level; l++) e += PP.expRequiredForLevel(l); return e; };
  await St.applySoloOutcome(uid, { result: "win", exp: 500, petExp: 0, petUid: null, moneyValue: 1000, matchId: "m1" });
  await St.applySoloOutcome(uid2, { result: "lose", exp: 150, petExp: 0, petUid: null, moneyValue: 200, matchId: "m1" });
  const a1 = await prof(uid), a2 = await prof(uid2);
  assert.equal(total(a1) - total(b1), 500);
  assert.equal(total(a2) - total(b2), 150);
  assert.ok(a1.statistics.wins === (b1.statistics.wins || 0) + 1);
  assert.ok(a2.statistics.losses === (b2.statistics.losses || 0) + 1);
  assert.ok(a1.level > b1.level, "500 EXP phải lên cấp hồ sơ");
});
await t("Cùng matchId áp dụng lần 2 KHÔNG cộng thêm EXP hồ sơ", async () => {
  const total = (p) => { let e = p.exp; for (let l = 1; l < p.level; l++) e += PP.expRequiredForLevel(l); return e; };
  const b = total(await prof(uid));
  const r = await St.applySoloOutcome(uid, { result: "win", exp: 500, petExp: 0, petUid: null, moneyValue: 1000, matchId: "m1" });
  assert.equal(r.applied, false);
  assert.equal(total(await prof(uid)), b);
});
console.log(res.join("\n") || ""); console.log(`PASS ${pass} FAIL ${fail}`); process.exit(fail ? 1 : 0);
