const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCountdownSeconds } = require("../server/utils/redirect-config");
const { isSocialCrawler } = require("../server/utils/crawler");

test("countdown keeps the 12-second default and zero disables waiting", () => {
  assert.equal(normalizeCountdownSeconds(undefined, 12), 12);
  assert.equal(normalizeCountdownSeconds(12), 12);
  assert.equal(normalizeCountdownSeconds(0), 0);
});

test("countdown is safely bounded to 0–30 whole seconds", () => {
  assert.equal(normalizeCountdownSeconds(-5), 0);
  assert.equal(normalizeCountdownSeconds(50), 30);
  assert.equal(normalizeCountdownSeconds(8.9), 8);
  assert.equal(normalizeCountdownSeconds(20, 12, 15), 15);
  assert.equal(normalizeCountdownSeconds(12, 12, 0), 0);
  assert.equal(normalizeCountdownSeconds("invalid", 12), 12);
});

test("recognises supported social preview crawlers", () => {
  for (const agent of ["TelegramBot (like TwitterBot)", "WhatsApp/2.24", "facebookexternalhit/1.1", "Twitterbot/1.0", "Slackbot-LinkExpanding 1.0", "Discordbot/2.0"]) {
    assert.equal(isSocialCrawler(agent), true, agent);
  }
  assert.equal(isSocialCrawler("Mozilla/5.0 Chrome/130.0"), false);
});
