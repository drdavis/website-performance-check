// test/chart.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartPoints, trafficChartSvg, trafficAreaChartSvg, formatMonth, compactNumber } from "../src/lib/chart.js";

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

test("formatMonth maps YYYY-MM to month name", () => {
  assert.equal(formatMonth("2025-05"), "May");
  assert.equal(formatMonth("2025-12"), "Dec");
  assert.equal(formatMonth(""), "");
});

test("compactNumber formats thousands and millions", () => {
  assert.equal(compactNumber(166), "166");
  assert.equal(compactNumber(1200), "1.2k");
  assert.equal(compactNumber(45000), "45k");
  assert.equal(compactNumber(3400000), "3.4M");
  assert.equal(compactNumber(-2000), "-2k");
});

test("trafficAreaChartSvg emits area, line, and month labels", () => {
  const svg = trafficAreaChartSvg(hist);
  assert.ok(svg.includes("<svg"));
  assert.ok(svg.includes("<polygon"));
  assert.ok(svg.includes("<polyline"));
  assert.ok(svg.includes("May")); // x-axis label from "2025-05"
  assert.equal(svg.includes("NaN"), false);
});

test("trafficAreaChartSvg returns empty for <2 points", () => {
  assert.equal(trafficAreaChartSvg([{ label: "2025-07", traffic: 5 }]), "");
  assert.equal(trafficAreaChartSvg([]), "");
});

test("trafficAreaChartSvg flat/zero series does not divide by zero", () => {
  const svg = trafficAreaChartSvg([
    { label: "2025-01", traffic: 0 },
    { label: "2025-02", traffic: 0 }
  ]);
  assert.ok(svg.includes("<svg"));
  assert.equal(svg.includes("NaN"), false);
});
