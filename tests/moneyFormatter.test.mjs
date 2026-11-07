import { test } from "node:test";
import assert from "node:assert/strict";
import { formatFull, formatCompact, drawMoney, MAX_ADMIN_CREDIT } from "./TienGame/moneyFormatter.js";

test("formatCompact matches spec table", () => {
  const cases = [[1000,"1K"],[10000,"10K"],[100000,"100K"],[1000000,"1M"],[1500000,"1.5M"],[10000000,"10M"],[100000000,"100M"],[1000000000,"1B"],[1500000000,"1.5B"],[10000000000,"10B"],[100000000000,"100B"],[1000000000000,"1T"]];
  for (const [v,e] of cases) assert.equal(formatCompact(v), e, String(v));
});
test("truncation never rounds up", () => {
  assert.equal(formatCompact(1999999999), "1.99B");
  assert.equal(formatCompact(999999999999), "999.99B");
  assert.equal(formatCompact(1234567), "1.23M");
});
test("full format uses dot grouping", () => {
  assert.equal(formatFull(1000000000000), "1.000.000.000.000");
  assert.equal(formatFull(0), "0");
});
test("boundary values from spec", () => {
  for (const v of [0,1,999,1000,1000000,1000000000,100000000000,1000000000000]) assert.ok(formatFull(v));
  assert.equal(MAX_ADMIN_CREDIT, 1000000000000);
});
test("BigInt-safe beyond Number precision", () => {
  assert.equal(formatFull("9007199254740993"), "9.007.199.254.740.993");
  assert.equal(formatCompact("9007199254740993"), "9007.19T");
});
test("drawMoney picks full, then compact, then shrinks; never throws", () => {
  const ctx = { font: "bold 54px 'X', sans-serif", fillText() {}, measureText(t) { const m = this.font.match(/(\d+)px/); return { width: t.length * Number(m[1]) * 0.55 }; } };
  const a = drawMoney(ctx, 5, 0, 0, 1000);
  assert.equal(a.mode, "full");
  const b = drawMoney(ctx, 1000000000000, 0, 0, 200);
  assert.equal(b.mode !== "full", true);
  assert.equal(b.text.endsWith(" GOLD"), true);
  const c = drawMoney(ctx, 1000000000000, 0, 0, 40, { minSize: 18 });
  assert.equal(c.fitted, false);
});
