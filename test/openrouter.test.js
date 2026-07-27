// test/openrouter.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, parseVerdict } from "../src/lib/openrouter.js";

const metrics = { etv: 5000, count: 500, pos_1: 10, pos_2_3: 40, pos_4_10: 150 };

test("buildPrompt includes domain and key numbers", () => {
  const p = buildPrompt("nike.com", metrics, 47);
  assert.ok(p.includes("nike.com"));
  assert.ok(p.includes("47"));
  assert.ok(p.includes("500"));   // ranked keywords
  assert.ok(p.includes("50"));    // top-3 = pos_1 + pos_2_3 = 50
});

test("parseVerdict reads clean JSON", () => {
  const v = parseVerdict('{"verdict":"Solid authority.","opportunities":["Add content","Fix titles"]}');
  assert.equal(v.verdict, "Solid authority.");
  assert.deepEqual(v.opportunities, ["Add content", "Fix titles"]);
});

test("parseVerdict extracts JSON embedded in prose", () => {
  const v = parseVerdict('Here you go:\n{"verdict":"Growing.","opportunities":["Blog more"]}\nThanks!');
  assert.equal(v.verdict, "Growing.");
  assert.deepEqual(v.opportunities, ["Blog more"]);
});

test("parseVerdict falls back to first line on garbage", () => {
  const v = parseVerdict("This site looks strong overall.\nSome more text.");
  assert.equal(v.verdict, "This site looks strong overall.");
  assert.deepEqual(v.opportunities, []);
});

test("parseVerdict handles empty input", () => {
  const v = parseVerdict("");
  assert.equal(v.verdict, "");
  assert.deepEqual(v.opportunities, []);
});
