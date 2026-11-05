const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const handler = read("server/handlers/links.handler.js");
const media = read("server/handlers/preview-media.handler.js");
const queries = read("server/queries/preview.queries.js");
const migration = read("server/migrations/202611050001_video_dimensions.js");
const card = read("server/views/social_preview.hbs");
const interstitial = read("server/views/interstitial.hbs");
const renderRoutes = read("server/routes/renders.routes.js");
const renderHandler = read("server/handlers/renders.handler.js");

test("crawler HTML is not shared-cached with human browsers", () => {
  assert.ok(handler.includes('"Cache-Control", "private, no-store, max-age=0"'));
  assert.ok(handler.includes('"Vary", "User-Agent"'));
});

test("social card canonical and OG URL remain the shortened URL", () => {
  assert.ok(card.includes('<link rel="canonical" href="{{shortUrl}}" />'));
  assert.ok(card.includes('<meta property="og:url" content="{{shortUrl}}" />'));
  assert.ok(handler.includes("const shortUrl = utils.getShortURL(link.address, link.domain).url;"));
});

test("image and video metadata are available to social crawlers", () => {
  for (const token of [
    'property="og:image:secure_url"',
    'property="og:image:width"',
    'property="og:image:height"',
    'property="og:video:secure_url"',
    'property="og:video:type"',
    'property="og:video:width"',
    'property="og:video:height"',
    'name="twitter:card" content="summary_large_image"',
    'name="twitter:image"',
  ]) assert.ok(card.includes(token), token);
  assert.ok(!card.includes("twitter:player"));
  assert.ok(!card.includes("watchUrl"));
});

test("human interstitial has no image/video preview or player page", () => {
  assert.ok(!interstitial.includes("previewVideoUrl"));
  assert.ok(!interstitial.includes("<video"));
  assert.ok(!handler.includes("previewVideoUrl"));
  assert.ok(!handler.includes("previewPosterUrl"));
  assert.ok(!handler.includes("watchUrl"));
  assert.ok(!renderRoutes.includes("/watch/:id"));
  assert.ok(!renderHandler.includes("videoPlayer"));
});

test("image preview endpoint fetches only the preview saved for the link", () => {
  assert.ok(media.includes("query.preview.find"));
  assert.ok(media.includes("fetchPublicImageBuffer(preview.image_url)"));
  assert.ok(!media.includes("req.query.url"));
  assert.ok(!media.includes("req.body.url"));
});

test("video dimensions are persisted and mapped to preview fields", () => {
  assert.ok(migration.includes("video_width"));
  assert.ok(migration.includes("video_height"));
  assert.ok(queries.includes("preview_video_width"));
  assert.ok(queries.includes("preview_video_height"));
});

test("image proxy keeps bounded image processing and safe response headers", () => {
  assert.ok(media.includes("sharp"));
  assert.ok(media.includes("1200"));
  assert.ok(media.includes("630"));
  assert.ok(media.includes("X-Content-Type-Options"));
});
