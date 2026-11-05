const crypto = require("node:crypto");
const sharp = require("sharp");

const query = require("../queries");
const { resolvePreviewVideoUrl, fetchPublicImageBuffer } = require("../utils/preview-image");
const utils = require("../utils");

const CustomError = utils.CustomError;

function parseVideoDimensions(body) {
  const widthRaw = body?.preview_video_width;
  const heightRaw = body?.preview_video_height;
  const widthValue = widthRaw === undefined || widthRaw === null ? "" : String(widthRaw).trim();
  const heightValue = heightRaw === undefined || heightRaw === null ? "" : String(heightRaw).trim();

  if (!widthValue && !heightValue) return { width: null, height: null };
  if (!widthValue || !heightValue) {
    throw new CustomError("Enter both video dimensions, or leave both blank.", 400);
  }

  const width = Number(widthValue);
  const height = Number(heightValue);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || width > 7680 || height < 1 || height > 4320) {
    throw new CustomError("Video dimensions must be whole numbers between 1×1 and 7680×4320.", 400);
  }
  return { width, height };
}

// Validates a preview video before the link is saved. Dimensions are optional,
// but when supplied they must be a valid pair and the video must be present.
async function resolvePreviewVideo(req, res, next) {
  const input = req.body?.preview_video_url;
  const widthRaw = req.body?.preview_video_width;
  const heightRaw = req.body?.preview_video_height;
  const dimensionsWereSent = widthRaw !== undefined || heightRaw !== undefined;

  if (input === undefined || input === null) {
    if (!dimensionsWereSent) return next();
    const message = "Add a video URL before setting video dimensions.";
    res.locals.errors = { ...(res.locals.errors || {}), preview_video_url: message };
    throw new CustomError(message, 400);
  }

  if (String(input).trim() === "") {
    if (String(widthRaw || "").trim() || String(heightRaw || "").trim()) {
      const message = "Add a video URL before setting video dimensions.";
      res.locals.errors = { ...(res.locals.errors || {}), preview_video_url: message };
      throw new CustomError(message, 400);
    }
    req.body.preview_video_url = null;
    req.body.preview_video_mime_type = null;
    req.body.preview_video_width = null;
    req.body.preview_video_height = null;
    return next();
  }

  try {
    const verified = await resolvePreviewVideoUrl(String(input).trim());
    const dimensions = parseVideoDimensions(req.body);
    req.body.preview_video_url = verified.url;
    req.body.preview_video_mime_type = verified.mimeType;
    req.body.preview_video_width = dimensions.width;
    req.body.preview_video_height = dimensions.height;
    return next();
  } catch (error) {
    const message = error.userFacing || error instanceof CustomError
      ? error.message
      : "The preview video could not be checked.";
    res.locals.errors = { ...(res.locals.errors || {}), preview_video_url: message };
    throw new CustomError(message, error.statusCode || 400);
  }
}

// The image is looked up from the saved link row, never from a request URL.
// SSRF checks, DNS pinning and redirect revalidation run again at fetch time.
async function servePreviewImage(req, res) {
  const link = await query.link.find({ uuid: req.params.id });
  if (!link || link.banned || link.password) return res.sendStatus(404);

  const [preview, linkSettings] = await Promise.all([
    query.preview.find(link.id),
    query.linkSettings.find(link.id),
  ]);
  if (!preview?.image_url || linkSettings?.preview_enabled === false || linkSettings?.preview_enabled === 0 || linkSettings?.preview_enabled === "0") {
    return res.sendStatus(404);
  }

  try {
    const source = await fetchPublicImageBuffer(preview.image_url);
    const output = await sharp(source.buffer, {
      failOn: "error",
      limitInputPixels: 40_000_000,
      animated: false,
    })
      .rotate()
      .resize(1200, 630, {
        fit: "cover",
        position: sharp.strategy.attention,
      })
      .jpeg({ quality: 84, progressive: true, mozjpeg: true })
      .toBuffer();

    const etag = `"${crypto.createHash("sha256").update(output).digest("base64url")}"`;
    res.set({
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      "Content-Type": "image/jpeg",
      "Content-Length": String(output.length),
      "Content-Disposition": "inline; filename=\"social-preview.jpg\"",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
      ETag: etag,
    });
    if (req.fresh) return res.status(304).end();
    return res.status(200).send(output);
  } catch (error) {
    console.error("Could not render social preview image:", error.message);
    return res.status(502).send("Preview image temporarily unavailable.");
  }
}

module.exports = { resolvePreviewVideo, servePreviewImage };
