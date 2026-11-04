const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidHttpUrl } = require("../server/utils/http-url");

test("accepts normal HTTP and HTTPS destinations", () => {
  assert.equal(isValidHttpUrl("https://example.com/path?q=1#top"), true);
  assert.equal(isValidHttpUrl("http://example.com"), true);
});

test("rejects non-web URL schemes", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "ftp://example.com/file",
    "mailto:test@example.com",
    "tel:+15551234567",
  ]) assert.equal(isValidHttpUrl(value), false, value);
});

test("rejects malformed URLs, credentials and localhost", () => {
  for (const value of [
    "https://",
    "not a URL",
    "https://user:password@example.com/",
    "http://localhost:3000/",
    "http://service.localhost/",
    "",
    null,
    42,
  ]) assert.equal(isValidHttpUrl(value), false, String(value));
});

test("rejects URLs over the accepted length limit", () => {
  assert.equal(isValidHttpUrl("https://example.com/" + "a".repeat(2050)), false);
});
