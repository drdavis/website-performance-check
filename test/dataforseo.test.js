// test/dataforseo.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRankOverview,
  parseHistory,
  estimateAvgPosition,
  parseBacklinksSummary
} from "../src/lib/dataforseo.js";

const rankJson = {
  tasks: [{
    status_code: 20000,
    result: [{
      items: [{
        metrics: {
          organic: { etv: 1234.5, count: 5000, pos_1: 100, pos_2_3: 200, pos_4_10: 300 }
        }
      }]
    }]
  }]
};

const historyJson = {
  tasks: [{
    status_code: 20000,
    result: [{
      items: [
        { year: 2025, month: 7, metrics: { organic: { etv: 1200, count: 160 } } },
        { year: 2025, month: 5, metrics: { organic: { etv: 900, count: 120 } } },
        { year: 2025, month: 6, metrics: { organic: { etv: 1000, count: 140 } } }
      ]
    }]
  }]
};

test("parseRankOverview pulls organic metrics (incl. deeper position buckets)", () => {
  const m = parseRankOverview(rankJson);
  assert.deepEqual(m, {
    etv: 1234.5, count: 5000,
    pos_1: 100, pos_2_3: 200, pos_4_10: 300,
    pos_11_20: 0, pos_21_30: 0, pos_31_40: 0, pos_41_50: 0, pos_51_100: 0
  });
});

test("parseRankOverview returns null when no items", () => {
  assert.equal(parseRankOverview({ tasks: [{ result: [{ items: [] }] }] }), null);
  assert.equal(parseRankOverview({}), null);
});

test("estimateAvgPosition weights buckets by midpoint", () => {
  // 100*1 + 200*2.5 + 300*7 = 2700 over 600 keywords = 4.5
  assert.equal(estimateAvgPosition(parseRankOverview(rankJson)), 4.5);
});

test("estimateAvgPosition returns null with no bucketed keywords", () => {
  assert.equal(estimateAvgPosition({ pos_1: 0, pos_2_3: 0, pos_4_10: 0 }), null);
  assert.equal(estimateAvgPosition(null), null);
});

test("parseBacklinksSummary pulls totals", () => {
  const json = { tasks: [{ status_code: 20000, result: [{
    backlinks: 2040, referring_domains: 310, referring_main_domains: 290, rank: 180
  }] }] };
  assert.deepEqual(parseBacklinksSummary(json), {
    total: 2040, referringDomains: 310, referringMainDomains: 290, rank: 180
  });
});

test("parseBacklinksSummary returns null when no result", () => {
  assert.equal(parseBacklinksSummary({ tasks: [{ result: [] }] }), null);
  assert.equal(parseBacklinksSummary({}), null);
});

test("parseHistory sorts oldest→newest, labels YYYY-MM, and keeps keyword count", () => {
  const h = parseHistory(historyJson);
  assert.deepEqual(h, [
    { label: "2025-05", traffic: 900, keywords: 120 },
    { label: "2025-06", traffic: 1000, keywords: 140 },
    { label: "2025-07", traffic: 1200, keywords: 160 }
  ]);
});

test("parseHistory defaults missing keyword count to 0", () => {
  const h = parseHistory({
    tasks: [{ result: [{ items: [
      { year: 2025, month: 1, metrics: { organic: { etv: 10 } } },
      { year: 2025, month: 2, metrics: { organic: { etv: 20 } } }
    ] }] }]
  });
  assert.equal(h[0].keywords, 0);
  assert.equal(h[1].keywords, 0);
});

test("parseHistory caps to last N months", () => {
  const items = [];
  for (let mth = 1; mth <= 18; mth++) {
    items.push({ year: 2025, month: mth, metrics: { organic: { etv: mth } } });
  }
  const h = parseHistory({ tasks: [{ result: [{ items }] }] }, 12);
  assert.equal(h.length, 12);
  assert.equal(h[0].label, "2025-07"); // months 7..18 kept (with month>12 just an id here)
});

test("parseHistory returns [] for missing data", () => {
  assert.deepEqual(parseHistory({}), []);
});
