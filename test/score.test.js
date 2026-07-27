// test/score.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeScore } from "../src/lib/score.js";

test("all-zero metrics → 0, low", () => {
  const r = computeScore({ etv: 0, count: 0, pos_1: 0, pos_2_3: 0, pos_4_10: 0 });
  assert.equal(r.score, 0);
  assert.equal(r.band, "low");
});

test("huge authoritative site → high band, near 100", () => {
  const r = computeScore({
    etv: 1_000_000, count: 100_000,
    pos_1: 50_000, pos_2_3: 30_000, pos_4_10: 20_000
  });
  assert.equal(r.band, "high");
  assert.ok(r.score >= 85, `expected >=85, got ${r.score}`);
});

test("mid-size site → medium band", () => {
  const r = computeScore({
    etv: 5_000, count: 500, pos_1: 10, pos_2_3: 40, pos_4_10: 150
  });
  assert.equal(r.band, "medium");
  assert.ok(r.score >= 40 && r.score < 70, `expected 40-69, got ${r.score}`);
});

test("missing/undefined fields do not throw or NaN", () => {
  const r = computeScore({});
  assert.equal(Number.isFinite(r.score), true);
  assert.equal(r.score, 0);
});

test("count 0 with stray pos values → no divide-by-zero", () => {
  const r = computeScore({ etv: 100, count: 0, pos_1: 5 });
  assert.equal(Number.isFinite(r.score), true);
});
