const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const interstitial = readFileSync(join(root, "server/views/interstitial.hbs"), "utf8");
const socialPreview = readFileSync(join(root, "server/views/social_preview.hbs"), "utf8");
const advertising = readFileSync(join(root, "server/views/advertising.hbs"), "utf8");

test("human waiting page starts disabled and only navigates on explicit click", () => {
  assert.match(interstitial, /id="get-link"[^>]*disabled/);
  assert.match(interstitial, /window\.setInterval/);
  assert.match(interstitial, /button\.addEventListener\("click"/);
  assert.match(interstitial, /window\.location\.assign\(destination\)/);
  assert.doesNotMatch(interstitial, /window\.location\.assign\(destination\)\s*;?\s*\}\s*else/);
  assert.match(interstitial, /href="\{\{destination\}\}"/); // non-JavaScript fallback
});

test("waiting page does not depend on ad events to complete the countdown", () => {
  assert.match(interstitial, /remaining = Math\.max\(0, remaining - 1\)/);
  assert.match(interstitial, /if \(remaining === 0\)/);
  assert.doesNotMatch(interstitial, /event_type:\s*["']impression["']/i);
  assert.doesNotMatch(interstitial, /ad[_-]?watched|ad[_-]?completed/i);
});

test("third-party ad tags are inert until after the countdown has been initialized", () => {
  assert.match(interstitial, /<template class="ad-tag-template"/);
  const timerSetup = interstitial.indexOf("window.setInterval");
  const adActivation = interstitial.indexOf("const tagTemplates = Array.from");
  assert.ok(timerSetup >= 0 && adActivation > timerSetup);
  assert.match(interstitial, /script\.async = false/);
  assert.match(interstitial, /script_load_error/);
});

test("crawler template emits server-side Open Graph and X metadata", () => {
  for (const token of [
    'property="og:title"',
    'property="og:description"',
    'property="og:image"',
    'property="og:video"',
    'name="twitter:card"',
    'name="twitter:title"',
    'name="twitter:description"',
  ]) assert.ok(socialPreview.includes(token), token);
  assert.doesNotMatch(socialPreview, /<script\b/i);
});

test("administrator can configure independent Direct Link placement", () => {
  const directCard = advertising.split('data-format="direct_link"')[1]?.split('</article>')[0] || "";
  assert.match(directCard, /class="placement"/);
  assert.match(directCard, /class="destination-url"/);
  assert.match(directCard, /never the Get Link destination/i);
});
