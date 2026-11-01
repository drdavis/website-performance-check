// src/lib/dataforseo.js
const BASE = "https://api.dataforseo.com/v3";

// ---- Pure parsers ----
export function parseRankOverview(json) {
  const item = json?.tasks?.[0]?.result?.[0]?.items?.[0];
  const o = item?.metrics?.organic;
  if (!o) return null;
  return {
    etv: Number(o.etv) || 0,
    count: Number(o.count) || 0,
    pos_1: Number(o.pos_1) || 0,
    pos_2_3: Number(o.pos_2_3) || 0,
    pos_4_10: Number(o.pos_4_10) || 0,
    pos_11_20: Number(o.pos_11_20) || 0,
    pos_21_30: Number(o.pos_21_30) || 0,
    pos_31_40: Number(o.pos_31_40) || 0,
    pos_41_50: Number(o.pos_41_50) || 0,
    pos_51_100: Number(o.pos_51_100) || 0
  };
}

// Midpoint rank of each SERP position bucket, used to estimate the average position.
const POS_MIDPOINTS = {
  pos_1: 1, pos_2_3: 2.5, pos_4_10: 7, pos_11_20: 15.5,
  pos_21_30: 25.5, pos_31_40: 35.5, pos_41_50: 45.5, pos_51_100: 75.5
};

// Estimated average organic position, weighted by how many keywords sit in each bucket.
// Returns null when there are no bucketed keywords. Rounded to one decimal.
export function estimateAvgPosition(metrics) {
  if (!metrics) return null;
  let weighted = 0;
  let total = 0;
  for (const key in POS_MIDPOINTS) {
    const c = Number(metrics[key]) || 0;
    weighted += c * POS_MIDPOINTS[key];
    total += c;
  }
  if (total === 0) return null;
  return Math.round((weighted / total) * 10) / 10;
}

export function parseBacklinksSummary(json) {
  const r = json?.tasks?.[0]?.result?.[0];
  if (!r) return null;
  return {
    total: Number(r.backlinks) || 0,
    referringDomains: Number(r.referring_domains) || 0,
    referringMainDomains: Number(r.referring_main_domains) || 0,
    rank: Number(r.rank) || 0
  };
}

export function parseHistory(json, limit = 12) {
  const items = json?.tasks?.[0]?.result?.[0]?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      year: Number(it.year) || 0,
      month: Number(it.month) || 0,
      traffic: Number(it?.metrics?.organic?.etv) || 0,
      keywords: Number(it?.metrics?.organic?.count) || 0
    }))
    .filter((r) => r.year && r.month)
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-limit)
    .map((r) => ({
      label: `${r.year}-${String(r.month).padStart(2, "0")}`,
      traffic: r.traffic,
      keywords: r.keywords
    }));
}

// ---- Network wrappers (run in the service worker; btoa/fetch are globals there) ----
function authHeader(login, password) {
  return "Basic " + btoa(`${login}:${password}`);
}

async function post(path, body, { login, password }) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method: "POST",
      headers: { Authorization: authHeader(login, password), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
  } catch (err) {
    if (err.name === "TimeoutError") throw new Error("DataForSEO request timed out");
    throw err;
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error("DataForSEO HTTP " + res.status + (json?.status_message ? ": " + json.status_message : ""));
  }
  const task = json?.tasks?.[0];
  if (task && task.status_code !== 20000) {
    throw new Error(task.status_message || "DataForSEO error");
  }
  return json;
}

export async function domainRankOverview(domain, o) {
  const json = await post(
    "/dataforseo_labs/google/domain_rank_overview/live",
    [{ target: domain, location_code: o.locationCode, language_code: o.languageCode }],
    o
  );
  return parseRankOverview(json);
}

export async function historicalRankOverview(domain, o) {
  const json = await post(
    "/dataforseo_labs/google/historical_rank_overview/live",
    [{ target: domain, location_code: o.locationCode, language_code: o.languageCode }],
    o
  );
  return parseHistory(json);
}

// Backlinks summary uses the DataForSEO Backlinks API (a separate product from Labs).
// Target is the bare domain; location/language do not apply.
export async function backlinksSummary(domain, o) {
  const json = await post("/backlinks/summary/live", [{ target: domain }], o);
  return parseBacklinksSummary(json);
}
