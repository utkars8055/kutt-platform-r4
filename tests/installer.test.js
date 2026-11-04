const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const installer = readFileSync(join(root, "install.sh"), "utf8");
const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");

test("one-command installer has valid Bash syntax", () => {
  const result = spawnSync("bash", ["-n", join(root, "install.sh")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("native installer performs locked install, migrations and foreground start", () => {
  assert.match(installer, /npm ci --omit=dev/);
  assert.match(installer, /npm run migrate/);
  assert.match(installer, /exec node server\/server\.js --production/);
  assert.match(installer, /2026\.11\.04-r4-one-command-installer/);
});

test("installer exposes the single-command Docker mode", () => {
  assert.match(installer, /--docker/);
  assert.match(installer, /docker compose up -d --build/);
  assert.match(compose, /env_file:\s*- \.env/);
  assert.match(compose, /db_data_sqlite/);
  assert.match(compose, /custom:/);
  assert.match(compose, /healthcheck:/);
});
