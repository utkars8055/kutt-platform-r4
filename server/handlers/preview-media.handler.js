const { resolvePreviewVideoUrl } = require("../utils/preview-image");
const utils = require("../utils");

const CustomError = utils.CustomError;

// Validates a preview video before the link is saved. Clearing the field (empty value) is always allowed.
async function resolvePreviewVideo(req, res, next) {
  const input = req.body?.preview_video_url;
  if (input === undefined || input === null || String(input).trim() === "") {
    return next();
  }

  try {
    const verified = await resolvePreviewVideoUrl(String(input).trim());
    req.body.preview_video_url = verified.url;
    req.body.preview_video_mime_type = verified.mimeType;
    return next();
  } catch (error) {
    const message = error.userFacing ? error.message : "The preview video could not be checked.";
    res.locals.errors = { ...(res.locals.errors || {}), preview_video_url: message };
    throw new CustomError(message, 400);
  }
}

module.exports = { resolvePreviewVideo };
