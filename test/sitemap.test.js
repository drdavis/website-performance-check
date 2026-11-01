// test/sitemap.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRobotsSitemaps, summarizeSitemapXml, looksLikeSitemap } from "../src/lib/sitemap.js";

test("parseRobotsSitemaps extracts Sitemap directives (case-insensitive)", () => {
  const robots = [
    "User-agent: *",
    "Disallow: /admin",
    "Sitemap: https://example.com/sitemap.xml",
    "sitemap:   https://example.com/news-sitemap.xml  "
  ].join("\n");
  assert.deepEqual(parseRobotsSitemaps(robots), [
    "https://example.com/sitemap.xml",
    "https://example.com/news-sitemap.xml"
  ]);
});

test("parseRobotsSitemaps returns [] when none / empty", () => {
  assert.deepEqual(parseRobotsSitemaps("User-agent: *\nDisallow:"), []);
  assert.deepEqual(parseRobotsSitemaps(""), []);
});

test("summarizeSitemapXml counts URLs in a urlset", () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://example.com/a</loc></url>
    <url><loc>https://example.com/b</loc></url>
    <url><loc>https://example.com/c</loc></url>
  </urlset>`;
  assert.deepEqual(summarizeSitemapXml(xml), { type: "urlset", count: 3 });
});

test("summarizeSitemapXml counts child sitemaps in an index", () => {
  const xml = `<sitemapindex>
    <sitemap><loc>https://example.com/s1.xml</loc></sitemap>
    <sitemap><loc>https://example.com/s2.xml</loc></sitemap>
  </sitemapindex>`;
  assert.deepEqual(summarizeSitemapXml(xml), { type: "index", count: 2 });
});

test("looksLikeSitemap only matches sitemap documents", () => {
  assert.equal(looksLikeSitemap("<urlset><url><loc>x</loc></url></urlset>"), true);
  assert.equal(looksLikeSitemap("<sitemapindex></sitemapindex>"), true);
  assert.equal(looksLikeSitemap("<!doctype html><html>not a sitemap</html>"), false);
  assert.equal(looksLikeSitemap(""), false);
});
