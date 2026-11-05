const { test } = require("node:test");
const assert = require("node:assert/strict");
const { _internals } = require("../server/utils/preview-image");

const { sniffVideoType, sniffImageType, isPublicIp, parseSafeUrl } = _internals;

const mp4 = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(40)]);
const isomMp4 = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(40)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60)]);
const avif = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x1c]), Buffer.from("ftypavif"), Buffer.alloc(40)]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0x01]);
const html = Buffer.from("<!doctype html><html>");

test("recognises MP4 and WebM by signature", () => {
  assert.equal(sniffVideoType(mp4), "video/mp4");
  assert.equal(sniffVideoType(isomMp4), "video/mp4");
  assert.equal(sniffVideoType(webm), "video/webm");
});

test("rejects images, web pages and QuickTime as video", () => {
  assert.equal(sniffVideoType(avif), null);
  assert.equal(sniffVideoType(jpeg), null);
  assert.equal(sniffVideoType(html), null);
  assert.equal(sniffVideoType(Buffer.from("ftypqt  ").length ? Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  "), Buffer.alloc(20)]) : Buffer.alloc(0)), null);
});

test("recognises JPEG as an image and not as video", () => {
  assert.equal(sniffImageType(jpeg), "image/jpeg");
  assert.equal(sniffVideoType(jpeg), null);
});

test("empty or tiny buffers are not treated as media", () => {
  assert.equal(sniffVideoType(Buffer.alloc(0)), null);
  assert.equal(sniffImageType(Buffer.from([0xff])), null);
});

test("private and loopback addresses are not public", () => {
  assert.equal(isPublicIp("127.0.0.1"), false);
  assert.equal(isPublicIp("10.1.2.3"), false);
  assert.equal(isPublicIp("192.168.0.5"), false);
  assert.equal(isPublicIp("169.254.169.254"), false);
  assert.equal(isPublicIp("::1"), false);
  assert.equal(isPublicIp("64:ff9b::c0a8:1"), false);
  assert.equal(isPublicIp("8.8.8.8"), true);
});

test("media URLs must be HTTPS on the standard port with no credentials", () => {
  assert.throws(() => parseSafeUrl("http://example.com/a.mp4"), /HTTPS/);
  assert.throws(() => parseSafeUrl("https://user:pw@example.com/a.mp4"), /HTTPS/);
  assert.throws(() => parseSafeUrl("https://example.com:8443/a.mp4"), /HTTPS/);
  assert.throws(() => parseSafeUrl("https://localhost/a.mp4"), /publicly accessible/);
  assert.equal(parseSafeUrl("https://example.com/a.mp4").hostname, "example.com");
});
