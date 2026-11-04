const { Router } = require("express");
const auth = require("../handlers/auth.handler");
const asyncHandler = require("../utils/asyncHandler");
const platformSettings = require("../services/platform-settings");
const query = require("../queries");
const utils = require("../utils");
const helpers = require("../handlers/helpers.handler");

const router = Router();

router.get("/ads", asyncHandler(auth.jwt), asyncHandler(auth.admin), asyncHandler(async (req, res) => {
  const settings = await platformSettings.getSettings(true);
  return res.json(settings);
}));

router.put("/ads", asyncHandler(auth.jwt), asyncHandler(auth.admin), asyncHandler(async (req, res) => {
  try {
    const settings = await platformSettings.saveAdminSettings(req.body || {});
    return res.json({ message: "Advertising and redirect settings saved.", settings });
  } catch (error) {
    throw new utils.CustomError(error.message || "Could not save settings.", 400);
  }
}));

// Only diagnostic events are accepted. Impressions and completed views are deliberately not supported.
router.post("/ad-events", helpers.rateLimit({ window: 60, limit: 30 }), asyncHandler(async (req, res) => {
  const { format, event_type: eventType, link_uuid: linkUuid } = req.body || {};
  const allowedFormats = platformSettings.FORMATS;
  const allowedEvents = ["page_loaded", "script_load_error", "popup_blocked"];
  if (!allowedFormats.includes(format) || !allowedEvents.includes(eventType)) {
    throw new utils.CustomError("Unsupported advertising diagnostic event.", 400);
  }
  let validLinkId = null;
  if (linkUuid !== undefined && linkUuid !== null) {
    if (typeof linkUuid !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(linkUuid)) {
      throw new utils.CustomError("Link reference is invalid.", 400);
    }
    const link = await query.link.find({ uuid: linkUuid });
    if (link) validLinkId = link.id;
  }
  await query.event.addAdEvent({ format, event_type: eventType, link_id: validLinkId });
  return res.status(202).json({ accepted: true });
}));

module.exports = router;
