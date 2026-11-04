const platformSettings = require("../services/platform-settings");
const utils = require("../utils");

const CustomError = utils.CustomError;

/**
 * Blocks a request when an admin has switched off a creation setting.
 * Admins always pass. Anonymous visitors and regular users are blocked
 * only when the named setting is explicitly false.
 *
 * Settings default to true, so this changes nothing until an admin turns a
 * setting off.
 */
function settingGate(settingKey, message) {
  return async function gate(req, res, next) {
    if (req.user?.admin) return next();
    const settings = await platformSettings.getSettings();
    if (settings[settingKey] === false) {
      throw new CustomError(message, 403);
    }
    next();
  };
}

// Signup. Checked after the env-level DISALLOW_REGISTRATION guard.
const signup = settingGate(
  "allowPublicSignup",
  "New account creation is currently disabled."
);

// Link creation, for anonymous and logged-in regular users.
const linkCreation = settingGate(
  "allowUserLinks",
  "Link creation is currently limited to administrators."
);

module.exports = { signup, linkCreation, settingGate };
