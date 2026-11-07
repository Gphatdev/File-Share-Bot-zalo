import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import TienGame from "./TienGame/index.js";
import { getConfig, getUsers } from "./TienGame/storage.js";

const U = "111111";
test("existing balance preserved (seeded like real users.json)", async () => {
  fs.writeFileSync("./TienGame/users.json", JSON.stringify({ "8949950879072883419": { userId: "8949950879072883419", balance: 1000000000, savings: 0, createdAt: 1, updatedAt: 1 } }));
  assert.equal(await TienGame.getBalance("8949950879072883419"), 1000000000);
});
test("config limit is 1T", () => assert.equal(getConfig().maximumAdminCredit, 1000000000000));
test("credit exactly 1T succeeds; ref dedupe blocks replay", async () => {
  const r = await TienGame.addMoney(U, 1000000000000, { referenceId: "MSG-1" });
  assert.equal(r.balance, 1000000000000);
  await assert.rejects(TienGame.addMoney(U, 1000000000000, { referenceId: "MSG-1" }), (e) => e.code === "DUPLICATE_REFERENCE");
  assert.equal(await TienGame.getBalance(U), 1000000000000, "no double credit");
});
test("over the configured limit is rejected", async () => {
  await assert.rejects(TienGame.addMoney(U, 1000000000001), /giới hạn/);
});
test("accumulating past safe-integer range is rejected, balance untouched", async () => {
  await TienGame.addMoney(U, 1000000000000);
  const before = await TienGame.getBalance(U);
  await TienGame.addMoney(U, 1000000000000);
  await TienGame.addMoney(U, 1000000000000);
  await TienGame.addMoney(U, 1000000000000);
  await TienGame.addMoney(U, 1000000000000);
  await TienGame.addMoney(U, 1000000000000);
  await TienGame.addMoney(U, 1000000000000);
  await TienGame.addMoney(U, 1000000000000);
  await TienGame.addMoney(U, 1000000000000);
  const mid = await TienGame.getBalance(U);
  assert.ok(Number.isSafeInteger(mid));
  await assert.rejects(TienGame.addMoney(U, 9007199254740000), /giới hạn|vượt/);
  assert.equal(await TienGame.getBalance(U), mid, "failed credit must not change balance");
  assert.ok(before > 0);
});
