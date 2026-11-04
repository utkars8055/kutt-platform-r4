const test = require("node:test");
const assert = require("node:assert/strict");

const { _internals } = require("../server/utils/preview-image");
const { isPublicIp, extractImageFromHtml, parseSafeUrl } = _internals;

test("blocks private, loopback, and link-local IPv4 destinations", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254"]) {
    assert.equal(isPublicIp(ip), false, ip);
  }
});

test("accepts public IPv4 and global-unicast IPv6 addresses", () => {
  assert.equal(isPublicIp("1.1.1.1"), true);
  assert.equal(isPublicIp("2606:4700:4700::1111"), true);
});

test("extracts Open Graph and Twitter image metadata, including relative URLs", () => {
  const html = '<meta property="og:title" content="A title"><meta property="og:image" content="/images/card.jpg?x=1&amp;y=2">';
  assert.equal(
    extractImageFromHtml(html, "https://images.example.com/share/123"),
    "https://images.example.com/images/card.jpg?x=1&y=2"
  );
  assert.equal(
    extractImageFromHtml('<meta name="twitter:image" content="https://cdn.example.com/card.webp">', "https://example.com"),
    "https://cdn.example.com/card.webp"
  );
});

test("rejects non-HTTPS and credential-bearing URLs", () => {
  assert.throws(() => parseSafeUrl("http://example.com/image.jpg"), /HTTPS/);
  assert.throws(() => parseSafeUrl("https://user:pass@example.com/image.jpg"), /HTTPS/);
});
