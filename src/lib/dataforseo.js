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
    pos_4_10: Number(o.pos_4_10) || 0
  };
}

export function parseHistory(json, limit = 12) {
  const items = json?.tasks?.[0]?.result?.[0]?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => ({
      year: Number(it.year) || 0,
      month: Number(it.month) || 0,
      traffic: Number(it?.metrics?.organic?.etv) || 0
    }))
    .filter((r) => r.year && r.month)
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-limit)
    .map((r) => ({ label: `${r.year}-${String(r.month).padStart(2, "0")}`, traffic: r.traffic }));
}

// ---- Network wrappers (run in the service worker; btoa/fetch are globals there) ----
function authHeader(login, password) {
  return "Basic " + btoa(`${login}:${password}`);
}

async function post(path, body, { login, password }) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { Authorization: authHeader(login, password), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}`);
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
