// test/chart.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartPoints, trafficChartSvg } from "../src/lib/chart.js";

const hist = [
  { label: "2025-05", traffic: 100 },
  { label: "2025-06", traffic: 300 },
  { label: "2025-07", traffic: 200 }
];

test("chartPoints returns one point per data row", () => {
  const pts = chartPoints(hist, { width: 260, height: 80, padX: 6, padY: 8 });
  assert.equal(pts.length, 3);
  for (const p of pts) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test("fewer than 2 points → empty array / empty svg", () => {
  assert.deepEqual(chartPoints([{ label: "2025-07", traffic: 5 }]), []);
  assert.equal(trafficChartSvg([{ label: "2025-07", traffic: 5 }]), "");
  assert.equal(trafficChartSvg([]), "");
});

test("trafficChartSvg emits an <svg> with a <polyline>", () => {
  const svg = trafficChartSvg(hist);
  assert.ok(svg.includes("<svg"));
  assert.ok(svg.includes("<polyline"));
});

test("flat series does not produce NaN", () => {
  const svg = trafficChartSvg([
    { label: "a", traffic: 100 },
    { label: "b", traffic: 100 }
  ]);
  assert.ok(svg.includes("<svg"));
  assert.equal(svg.includes("NaN"), false);
});
