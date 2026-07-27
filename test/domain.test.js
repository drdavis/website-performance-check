// test/domain.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { urlToDomain } from "../src/lib/domain.js";

test("strips www and path", () => {
  assert.equal(urlToDomain("https://www.nike.com/shoes"), "nike.com");
});
test("plain domain", () => {
  assert.equal(urlToDomain("https://nike.com"), "nike.com");
});
test("keeps non-www subdomain", () => {
  assert.equal(urlToDomain("https://blog.example.com/p?x=1"), "blog.example.com");
});
test("lowercases host", () => {
  assert.equal(urlToDomain("http://Example.COM/x"), "example.com");
});
test("rejects chrome:// pages", () => {
  assert.equal(urlToDomain("chrome://extensions"), null);
});
test("rejects about:blank", () => {
  assert.equal(urlToDomain("about:blank"), null);
});
test("rejects empty/garbage", () => {
  assert.equal(urlToDomain(""), null);
  assert.equal(urlToDomain("not a url"), null);
});
