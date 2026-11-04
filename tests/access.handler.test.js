const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Stub the settings service and utils so this test does not need env or a database.
let currentSettings = {};
const serviceFile = path.join(__dirname, "../server/services/platform-settings.js");
const utilsFile = path.join(__dirname, "../server/utils/index.js");

class CustomError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

require.cache[serviceFile] = {
  id: serviceFile,
  filename: serviceFile,
  loaded: true,
  exports: { getSettings: async () => currentSettings },
};
require.cache[utilsFile] = {
  id: utilsFile,
  filename: utilsFile,
  loaded: true,
  exports: { CustomError },
};

const access = require("../server/handlers/access.handler");

const admin = { user: { admin: true } };
const regular = { user: { admin: false } };
const anonymous = {};

test("link creation is allowed for everyone when allowUserLinks is true", async () => {
  currentSettings = { allowUserLinks: true };
  let called = 0;
  await access.linkCreation(anonymous, {}, () => { called++; });
  await access.linkCreation(regular, {}, () => { called++; });
  assert.equal(called, 2);
});

test("link creation is allowed for everyone when the setting is missing (default on)", async () => {
  currentSettings = {};
  let called = 0;
  await access.linkCreation(anonymous, {}, () => { called++; });
  assert.equal(called, 1);
});

test("anonymous link creation is blocked with 403 when allowUserLinks is false", async () => {
  currentSettings = { allowUserLinks: false };
  await assert.rejects(
    access.linkCreation(anonymous, {}, () => {}),
    err => err.status === 403 && /administrators/.test(err.message)
  );
});

test("regular user link creation is blocked with 403 when allowUserLinks is false", async () => {
  currentSettings = { allowUserLinks: false };
  await assert.rejects(
    access.linkCreation(regular, {}, () => {}),
    err => err.status === 403
  );
});

test("admin can still create links when allowUserLinks is false", async () => {
  currentSettings = { allowUserLinks: false };
  let called = 0;
  await access.linkCreation(admin, {}, () => { called++; });
  assert.equal(called, 1);
});

test("signup is allowed when allowPublicSignup is true or unset", async () => {
  currentSettings = { allowPublicSignup: true };
  let called = 0;
  await access.signup(anonymous, {}, () => { called++; });
  currentSettings = {};
  await access.signup(anonymous, {}, () => { called++; });
  assert.equal(called, 2);
});

test("signup is blocked with 403 when allowPublicSignup is false", async () => {
  currentSettings = { allowPublicSignup: false };
  await assert.rejects(
    access.signup(anonymous, {}, () => {}),
    err => err.status === 403 && /account creation/.test(err.message)
  );
});

test("admin is not blocked by allowPublicSignup on the signup gate", async () => {
  currentSettings = { allowPublicSignup: false };
  let called = 0;
  await access.signup(admin, {}, () => { called++; });
  assert.equal(called, 1);
});
