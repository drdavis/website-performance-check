// src/lib/sitemap.js
// Lightweight sitemap presence check. Pure parsers (unit-tested) plus a
// best-effort fetch that runs in the service worker.

// Extract Sitemap: URLs declared in a robots.txt body.
export function parseRobotsSitemaps(robotsText) {
  if (!robotsText) return [];
  const out = [];
  for (const line of String(robotsText).split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap:\s*(\S+)/i);
    if (m) out.push(m[1].trim());
  }
  return out;
}

// Classify a sitemap XML body and count its entries. For a <urlset> this is the
// URL count; for a <sitemapindex> it is the number of child sitemaps.
export function summarizeSitemapXml(xmlText) {
  const text = String(xmlText || "");
  const isIndex = /<sitemapindex[\s>]/i.test(text);
  const isUrlset = /<urlset[\s>]/i.test(text);
  const count = (text.match(/<loc\b/gi) || []).length;
  return { type: isIndex ? "index" : isUrlset ? "urlset" : "unknown", count };
}

// True only for bodies that actually look like a sitemap document.
export function looksLikeSitemap(xmlText) {
  return /<(urlset|sitemapindex)[\s>]/i.test(String(xmlText || ""));
}

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "follow" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.text();
}

// Checks robots.txt for Sitemap: directives, then common sitemap locations.
// Returns { found, url, type, urlCount, inRobots } (never throws).
export async function checkSitemap(domain) {
  const base = "https://" + domain;
  let inRobots = false;
  const candidates = [];

  try {
    const robots = await fetchText(base + "/robots.txt");
    const declared = parseRobotsSitemaps(robots);
    if (declared.length) {
      inRobots = true;
      candidates.push(...declared);
    }
  } catch {
    // no robots.txt or it was unreachable; fall back to conventional paths
  }

  candidates.push(base + "/sitemap.xml", base + "/sitemap_index.xml");

  const seen = new Set();
  for (const url of candidates) {
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const xml = await fetchText(url);
      if (looksLikeSitemap(xml)) {
        const { type, count } = summarizeSitemapXml(xml);
        return { found: true, url, type, urlCount: count, inRobots };
      }
    } catch {
      // try the next candidate
    }
  }

  return { found: false, url: null, type: null, urlCount: 0, inRobots };
}
