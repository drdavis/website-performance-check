// src/lib/score.js
// Weights are collected here so the score is easy to retune.
export const WEIGHTS = {
  trafficPts: 40, trafficLogMax: 6,   // log10(1e6) = 6
  keywordPts: 30, keywordLogMax: 5,   // log10(1e5) = 5
  rankPts: 30, rankPos1: 1.0, rankPos23: 0.7, rankPos410: 0.4
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function computeScore(metrics) {
  const m = metrics || {};
  const etv = Math.max(0, Number(m.etv) || 0);
  const count = Math.max(0, Number(m.count) || 0);
  const p1 = Number(m.pos_1) || 0;
  const p23 = Number(m.pos_2_3) || 0;
  const p410 = Number(m.pos_4_10) || 0;

  const traffic = WEIGHTS.trafficPts * clamp01(Math.log10(etv + 1) / WEIGHTS.trafficLogMax);
  const keywords = WEIGHTS.keywordPts * clamp01(Math.log10(count + 1) / WEIGHTS.keywordLogMax);
  const weighted = p1 * WEIGHTS.rankPos1 + p23 * WEIGHTS.rankPos23 + p410 * WEIGHTS.rankPos410;
  const rank = WEIGHTS.rankPts * (weighted / Math.max(count, 1));

  const raw = traffic + keywords + rank;
  const score = Math.round(Math.max(0, Math.min(100, raw)));
  const band = score < 40 ? "low" : score < 70 ? "medium" : "high";
  return { score, band };
}
