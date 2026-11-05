const { differenceInSeconds } = require("date-fns");
const promisify = require("node:util").promisify;
const bcrypt = require("bcryptjs");
const { isbot } = require("isbot");
const JWT = require("jsonwebtoken");
const useragent = require("express-useragent").default;
const geoip = require("geoip-lite");
const URL = require("node:url");
const dns = require("node:dns");

const validators = require("./validators.handler");
const map = require("../utils/map.json");
const transporter = require("../mail");
const query = require("../queries");
const queue = require("../queues");
const utils = require("../utils");
const env = require("../env");
const platformSettings = require("../services/platform-settings");
const { isSocialCrawler } = require("../utils/crawler");
const { normalizeCountdownSeconds } = require("../utils/redirect-config");
const { resolvePreviewImageUrl } = require("../utils/preview-image");
const WHATWGURL = URL.URL;

const CustomError = utils.CustomError;
const dnsLookup = promisify(dns.lookup);

async function resolvePreviewImageInput(req, res, existingLinkId) {
  if (!req.body?.preview_image_url) return;
  if (existingLinkId) {
    const existingPreview = await query.preview.find(existingLinkId);
    let looksLikeDirectImage = false;
    try {
      looksLikeDirectImage = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i.test(new URL(req.body.preview_image_url).pathname);
    } catch {
      // Invalid URLs are handled by the resolver below.
    }
    if (existingPreview?.image_url === req.body.preview_image_url && looksLikeDirectImage) return;
  }
  try {
    req.body.preview_image_url = await resolvePreviewImageUrl(req.body.preview_image_url);
  } catch (error) {
    const message = error.message || "The preview image could not be resolved.";
    res.locals.errors = { ...(res.locals.errors || {}), preview_image_url: message };
    throw new CustomError(message, 400);
  }
}


async function get(req, res) {
  const { limit, skip } = req.context;
  const search = req.query.search;
  const userId = req.user.id;

  const match = {
    user_id: userId
  };

  const [data, total] = await Promise.all([
    query.link.get(match, { limit, search, skip }),
    query.link.total(match, { search })
  ]);

  if (req.isHTML) {
    res.render("partials/links/table", {
      total,
      limit,
      skip,
      links: data.map(utils.sanitize.link_html),
    })
    return;
  }

  return res.send({
    total,
    limit,
    skip,
    data: data.map(utils.sanitize.link),
  });
};

async function getAdmin(req, res) {
  const { limit, skip } = req.context;
  const search = req.query.search;
  const user = req.query.user;
  let domain = req.query.domain;
  const banned = utils.parseBooleanQuery(req.query.banned);
  const anonymous = utils.parseBooleanQuery(req.query.anonymous);
  const has_domain = utils.parseBooleanQuery(req.query.has_domain);
  
  const match = {
    ...(banned !== undefined && { banned }),
    ...(anonymous !== undefined && { user_id: [anonymous ? "is" : "is not", null] }),
    ...(has_domain !== undefined && { domain_id: [has_domain ? "is not" : "is", null] }),
  };
  
  // if domain is equal to the defualt domain,
  // it means admins is looking for links with the defualt domain (no custom user domain)
  if (domain === env.DEFAULT_DOMAIN) {
    domain = undefined;
    match.domain_id = null;
  }
  
  const [data, total] = await Promise.all([
    query.link.getAdmin(match, { limit, search, user, domain, skip }),
    query.link.totalAdmin(match, { search, user, domain })
  ]);

  const links = data.map(utils.sanitize.link_admin);

  if (req.isHTML) {
    res.render("partials/admin/links/table", {
      total,
      total_formatted: total.toLocaleString("en-US"),
      limit,
      skip,
      links,
    })
    return;
  }

  return res.send({
    total,
    limit,
    skip,
    data: links,
  });
};

async function create(req, res) {
  const { reuse, password, customurl, description, target, fetched_domain, expire_in } = req.body;
  const domain_id = fetched_domain ? fetched_domain.id : null;
  
  const targetDomain = utils.removeWww(URL.parse(target).hostname);
  
  const tasks = await Promise.all([
    reuse &&
      query.link.find({
        target,
        user_id: req.user.id,
        domain_id
      }),
    customurl &&
      query.link.find({
        address: customurl,
        domain_id
      }),
    !customurl && utils.generateId(query, domain_id),
    validators.bannedDomain(targetDomain),
    validators.bannedHost(targetDomain)
  ]);
  
  // if "reuse" is true, try to return
  // the existent URL without creating one
  if (tasks[0]) {
    return res.json(utils.sanitize.link(tasks[0]));
  }
  
  // Check if custom link already exists
  if (tasks[1]) {
    const error = "Custom URL is already in use.";
    res.locals.errors = { customurl: error };
    throw new CustomError(error);
  }

  await resolvePreviewImageInput(req, res);

  // Create new link
  const address = customurl || tasks[2];
  const link = await query.link.create({
    password,
    address,
    domain_id,
    description,
    target,
    expire_in,
    user_id: req.user && req.user.id
  });

  link.domain = fetched_domain?.address;
  await query.preview.upsert(link.id, req.body);
  if (req.body.click_limit || Object.prototype.hasOwnProperty.call(req.body, "preview_enabled")) {
    await query.linkSettings.upsert(link.id, {
      click_limit: req.body.click_limit,
      ...(Object.prototype.hasOwnProperty.call(req.body, "preview_enabled") && { preview_enabled: req.body.preview_enabled }),
    });
  }
  
  if (req.isHTML) {
    res.setHeader("HX-Trigger", "reloadMainTable");
    const shortURL = utils.getShortURL(link.address, link.domain);
    return res.render("partials/shortener", {
      link: shortURL.link, 
      url: shortURL.url,
    });
  }
  
  return res
    .status(201)
    .send(utils.sanitize.link({ ...link }));
}

async function edit(req, res) {
  const link = await query.link.find({
    uuid: req.params.id,
    ...(!req.user.admin && { user_id: req.user.id })
  });

  if (!link) {
    throw new CustomError("Link was not found.");
  }

  await resolvePreviewImageInput(req, res, link.id);

  let isChanged = false;
  [
    [req.body.address, "address"], 
    [req.body.target, "target"], 
    [req.body.description, "description"], 
    [req.body.expire_in, "expire_in"], 
    [req.body.password, "password"]
  ].forEach(([value, name]) => {
    if (!value) {
      if (name === "password" && link.password) 
        req.body.password = null;
      else {
        delete req.body[name];
        return;
      }
    }
    if (value === link[name] && name !== "password") {
      delete req.body[name];
      return;
    }
    if (name === "expire_in" && link.expire_in)
      if (Math.abs(differenceInSeconds(utils.parseDatetime(value), utils.parseDatetime(link.expire_in))) < 60)
          return;
    if (name === "password")
      if (value && value.replace(/•/ig, "").length === 0) {
        delete req.body.password;
        return;
      }
    isChanged = true;
  });

  const previewFields = ["preview_image_url", "preview_video_url", "preview_video_mime_type", "preview_title", "preview_description", "preview_image_alt"];
  const previewChanged = previewFields.some(key => Object.prototype.hasOwnProperty.call(req.body, key));
  const settingsChanged = Object.prototype.hasOwnProperty.call(req.body, "click_limit") || Object.prototype.hasOwnProperty.call(req.body, "preview_enabled");
  if (!isChanged && !previewChanged && !settingsChanged) {
    throw new CustomError("Should at least update one field.");
  }

  const { address, target, description, expire_in, password } = req.body;
  
  const targetDomain = target && utils.removeWww(URL.parse(target).hostname);
  const domain_id = link.domain_id || null;

  const tasks = await Promise.all([
    address &&
      query.link.find({
        address,
        domain_id
      }),
    target && validators.bannedDomain(targetDomain),
    target && validators.bannedHost(targetDomain)
  ]);

  // Check if custom link already exists
  if (tasks[0]) {
    const error = "Custom URL is already in use.";
    res.locals.errors = { address: error };
    throw new CustomError("Custom URL is already in use.");
  }

  // Update link
  const [updatedLink] = isChanged
    ? await query.link.update(
        { id: link.id },
        {
          ...(address && { address }),
          ...(description && { description }),
          ...(target && { target }),
          ...(expire_in && { expire_in }),
          ...((password || password === null) && { password })
        }
      )
    : [link];

  if (previewChanged) await query.preview.upsert(link.id, req.body);
  if (settingsChanged) await query.linkSettings.upsert(link.id, {
    ...(Object.prototype.hasOwnProperty.call(req.body, "click_limit") && { click_limit: req.body.click_limit }),
    ...(Object.prototype.hasOwnProperty.call(req.body, "preview_enabled") && { preview_enabled: req.body.preview_enabled }),
  });

  if (req.isHTML) {
    const preview = await query.preview.find(link.id);
    const linkSettings = await query.linkSettings.find(link.id);
    res.render("partials/links/edit", {
      swap_oob: true,
      success: "Link has been updated.",
      ...(preview && { preview_image_url: preview.image_url, preview_video_url: preview.video_url, preview_video_mime_type: preview.video_mime_type, preview_title: preview.title, preview_description: preview.description, preview_image_alt: preview.image_alt }),
      click_limit: linkSettings?.click_limit,
      preview_enabled: linkSettings?.preview_enabled !== false && linkSettings?.preview_enabled !== 0 && linkSettings?.preview_enabled !== "0",
      ...utils.sanitize.link_html({ ...updatedLink }),
    });
    return;
  }

  const preview = await query.preview.find(link.id);
  const linkSettings = await query.linkSettings.find(link.id);
  return res.status(200).send({ ...utils.sanitize.link({ ...updatedLink }), preview: preview || null, click_limit: linkSettings?.click_limit ?? null, preview_enabled: linkSettings?.preview_enabled !== false && linkSettings?.preview_enabled !== 0 && linkSettings?.preview_enabled !== "0" });
};

async function editAdmin(req, res) {
  const link = await query.link.find({
    uuid: req.params.id,
    ...(!req.user.admin && { user_id: req.user.id })
  });

  if (!link) {
    throw new CustomError("Link was not found.");
  }

  await resolvePreviewImageInput(req, res, link.id);

  let isChanged = false;
  [
    [req.body.address, "address"], 
    [req.body.target, "target"], 
    [req.body.description, "description"], 
    [req.body.expire_in, "expire_in"], 
    [req.body.password, "password"]
  ].forEach(([value, name]) => {
    if (!value) {
      if (name === "password" && link.password) 
        req.body.password = null;
      else {
        delete req.body[name];
        return;
      }
    }
    if (value === link[name] && name !== "password") {
      delete req.body[name];
      return;
    }
    if (name === "expire_in" && link.expire_in)
      if (Math.abs(differenceInSeconds(utils.parseDatetime(value), utils.parseDatetime(link.expire_in))) < 60)
          return;
    if (name === "password")
      if (value && value.replace(/•/ig, "").length === 0) {
        delete req.body.password;
        return;
      }
    isChanged = true;
  });

  const previewFields = ["preview_image_url", "preview_video_url", "preview_video_mime_type", "preview_title", "preview_description", "preview_image_alt"];
  const previewChanged = previewFields.some(key => Object.prototype.hasOwnProperty.call(req.body, key));
  const settingsChanged = Object.prototype.hasOwnProperty.call(req.body, "click_limit") || Object.prototype.hasOwnProperty.call(req.body, "preview_enabled");
  if (!isChanged && !previewChanged && !settingsChanged) {
    throw new CustomError("Should at least update one field.");
  }

  const { address, target, description, expire_in, password } = req.body;
  
  const targetDomain = target && utils.removeWww(URL.parse(target).hostname);
  const domain_id = link.domain_id || null;

  const tasks = await Promise.all([
    address &&
      query.link.find({
        address,
        domain_id
      }),
    target && validators.bannedDomain(targetDomain),
    target && validators.bannedHost(targetDomain)
  ]);

  // Check if custom link already exists
  if (tasks[0]) {
    const error = "Custom URL is already in use.";
    res.locals.errors = { address: error };
    throw new CustomError("Custom URL is already in use.");
  }

  // Update link
  const [updatedLink] = isChanged
    ? await query.link.update(
        { id: link.id },
        {
          ...(address && { address }),
          ...(description && { description }),
          ...(target && { target }),
          ...(expire_in && { expire_in }),
          ...((password || password === null) && { password })
        }
      )
    : [link];

  if (previewChanged) await query.preview.upsert(link.id, req.body);
  if (settingsChanged) await query.linkSettings.upsert(link.id, {
    ...(Object.prototype.hasOwnProperty.call(req.body, "click_limit") && { click_limit: req.body.click_limit }),
    ...(Object.prototype.hasOwnProperty.call(req.body, "preview_enabled") && { preview_enabled: req.body.preview_enabled }),
  });

  if (req.isHTML) {
    const preview = await query.preview.find(link.id);
    const linkSettings = await query.linkSettings.find(link.id);
    res.render("partials/admin/links/edit", {
      swap_oob: true,
      success: "Link has been updated.",
      ...(preview && { preview_image_url: preview.image_url, preview_video_url: preview.video_url, preview_video_mime_type: preview.video_mime_type, preview_title: preview.title, preview_description: preview.description, preview_image_alt: preview.image_alt }),
      click_limit: linkSettings?.click_limit,
      preview_enabled: linkSettings?.preview_enabled !== false && linkSettings?.preview_enabled !== 0 && linkSettings?.preview_enabled !== "0",
      ...utils.sanitize.link_admin({ ...updatedLink }),
    });
    return;
  }

  const preview = await query.preview.find(link.id);
  const linkSettings = await query.linkSettings.find(link.id);
  return res.status(200).send({ ...utils.sanitize.link({ ...updatedLink }), preview: preview || null, click_limit: linkSettings?.click_limit ?? null, preview_enabled: linkSettings?.preview_enabled !== false && linkSettings?.preview_enabled !== 0 && linkSettings?.preview_enabled !== "0" });
};

async function remove(req, res) {
  const { error, isRemoved, link } = await query.link.remove({
    uuid: req.params.id,
    ...(!req.user.admin && { user_id: req.user.id })
  });

  if (!isRemoved) {
    const messsage = error || "Could not delete the link.";
    throw new CustomError(messsage);
  }

  if (req.isHTML) {
    res.setHeader("HX-Reswap", "outerHTML");
    res.setHeader("HX-Trigger", "reloadMainTable");
    res.render("partials/links/dialog/delete_success", {
      link: utils.getShortURL(link.address, link.domain).link,
    });
    return;
  }

  return res
    .status(200)
    .send({ message: "Link has been deleted successfully." });
};

async function report(req, res) {
  const { link } = req.body;

  await transporter.sendReportEmail(link);

  if (req.isHTML) {
    res.render("partials/report/form", {
      message: "Report was received. We'll take actions shortly."
    });
    return;
  }
  
  return res
    .status(200)
    .send({ message: "Thanks for the report, we'll take actions shortly." });
};

async function ban(req, res) {
  const { id } = req.params;

  const update = {
    banned_by_id: req.user.id,
    banned: true
  };

  // 1. check if link exists
  const link = await query.link.find({ uuid: id });

  if (!link) {
    throw new CustomError("No link has been found.", 400);
  }

  if (link.banned) {
    throw new CustomError("Link has been banned already.", 400);
  }

  const tasks = [];

  // 2. ban link
  tasks.push(query.link.update({ uuid: id }, update));

  const domain = utils.removeWww(URL.parse(link.target).hostname);

  // 3. ban target's domain
  if (req.body.domain) {
    tasks.push(query.domain.add({ ...update, address: domain }));
  }

  // 4. ban target's host
  if (req.body.host) {
    const dnsRes = await dnsLookup(domain).catch(() => {
      throw new CustomError("Couldn't fetch DNS info.");
    });
    const host = dnsRes?.address;
    tasks.push(query.host.add({ ...update, address: host }));
  }

  // 5. ban link owner
  if (req.body.user && link.user_id) {
    tasks.push(query.user.update({ id: link.user_id }, update));
  }

  // 6. ban all of owner's links
  if (req.body.userLinks && link.user_id) {
    tasks.push(query.link.update({ user_id: link.user_id }, update));
  }

  // 7. wait for all tasks to finish
  await Promise.all(tasks).catch((err) => {
    throw new CustomError("Couldn't ban entries.");
  });

  // 8. send response
  if (req.isHTML) {
    res.setHeader("HX-Reswap", "outerHTML");
    res.setHeader("HX-Trigger", "reloadMainTable");
    res.render("partials/links/dialog/ban_success", {
      link: utils.getShortURL(link.address, link.domain).link,
    });
    return;
  }

  return res.status(200).send({ message: "Banned link successfully." });
};

function linkAccessCookieName(uuid) {
  return `link_access_${uuid}`;
}

function hasPasswordAccess(req, link) {
  try {
    const token = req.cookies?.[linkAccessCookieName(link.uuid)];
    if (!token) return false;
    const decoded = JWT.verify(token, env.JWT_SECRET);
    return decoded.linkAccess === link.uuid;
  } catch {
    return false;
  }
}

function grantPasswordAccess(res, link) {
  const token = JWT.sign({ linkAccess: link.uuid }, env.JWT_SECRET, { expiresIn: "10m" });
  res.cookie(linkAccessCookieName(link.uuid), token, {
    maxAge: 10 * 60 * 1000,
    httpOnly: true,
    secure: env.isProd,
    sameSite: "Lax",
    path: "/",
  });
}

function buildAdRenderData(settings) {
  const placements = Object.values(settings.adPlacements || {}).filter(item => item.enabled);
  const scripts = placements.filter(item => item.format !== "custom_html" && item.format !== "direct_link" && item.code);
  const headAdCodes = scripts.filter(item => item.placement === "head").map(item => ({ format: item.format, code: item.code }));
  const directLinks = placements.filter(item => item.format === "direct_link" && item.destination_url);
  const customAds = placements.filter(item => item.format === "custom_html" && item.code).map(item => ({ srcdoc: item.code, placement: item.placement || "middle" }));
  const group = items => ({
    top: items.filter(item => item.placement === "top"),
    middle: items.filter(item => item.placement === "middle" || !item.placement || item.placement === "head"),
    bottom: items.filter(item => item.placement === "bottom"),
  });
  const bodyAdCodes = group(scripts.filter(item => item.placement !== "head").map(item => ({ ...item, code: item.code })));
  const groupedDirectLinks = group(directLinks);
  const groupedCustomAds = group(customAds);
  const renderedFormats = [...new Set(placements.filter(item =>
    (item.format === "direct_link" && item.destination_url) ||
    (item.format === "custom_html" && item.code) ||
    (item.format !== "direct_link" && item.format !== "custom_html" && item.code)
  ).map(item => item.format))];
  return {
    headAdCodes,
    topAdCodes: bodyAdCodes.top.map(item => ({ format: item.format, code: item.code })),
    middleAdCodes: bodyAdCodes.middle.map(item => ({ format: item.format, code: item.code })),
    bottomAdCodes: bodyAdCodes.bottom.map(item => ({ format: item.format, code: item.code })),
    topDirectLinks: groupedDirectLinks.top,
    middleDirectLinks: groupedDirectLinks.middle,
    bottomDirectLinks: groupedDirectLinks.bottom,
    topCustomAds: groupedCustomAds.top,
    middleCustomAds: groupedCustomAds.middle,
    bottomCustomAds: groupedCustomAds.bottom,
    renderedFormats,
  };
}

function recordClickEvent(req, link, visitorType) {
  const ua = req.headers["user-agent"] || "";
  const parsed = useragent.parse(ua);
  let referrer = null;
  try { referrer = req.get("Referer") ? new WHATWGURL(req.get("Referer")).hostname.slice(0, 255) : null; } catch { /* ignore malformed referrer */ }
  const country = (req.get("cf-ipcountry") || geoip.lookup(req.ip)?.country || "").slice(0, 2).toUpperCase();
  const device = parsed.isMobile ? "mobile" : parsed.isTablet ? "tablet" : parsed.isDesktop ? "desktop" : "other";
  query.event.addClick({
    link_id: link.id,
    visitor_type: visitorType,
    country,
    device,
    browser: (parsed.browser || "other").slice(0, 80),
    os: (parsed.os || "other").slice(0, 80),
    referrer,
    utm_source: typeof req.query.utm_source === "string" ? req.query.utm_source.slice(0, 255) : null,
    utm_medium: typeof req.query.utm_medium === "string" ? req.query.utm_medium.slice(0, 255) : null,
    utm_campaign: typeof req.query.utm_campaign === "string" ? req.query.utm_campaign.slice(0, 255) : null,
    utm_term: typeof req.query.utm_term === "string" ? req.query.utm_term.slice(0, 255) : null,
    utm_content: typeof req.query.utm_content === "string" ? req.query.utm_content.slice(0, 255) : null,
  }).catch(error => console.error("Could not save detailed link event:", error.message));
}

async function redirect(req, res, next) {
  const isPreservedUrl = utils.preservedURLs.some(item => item === req.path.replace("/", ""));
  if (isPreservedUrl) return next();

  const host = utils.removeWww(req.headers.host);
  const domain = host !== env.DEFAULT_DOMAIN ? await query.domain.find({ address: host }) : null;
  const address = req.params.id.replace("+", "");
  const link = await query.link.find({ address, domain_id: domain ? domain.id : null });

  if (!link) return res.redirect(domain?.homepage || "/404");
  if (link.banned) return res.redirect("/banned");
  // Old databases may contain schemes accepted by Kutt's previous permissive validator.
  // Never execute or redirect to a non-HTTP(S) stored target after upgrading.
  if (!utils.isValidHttpUrl(link.target)) {
    if (!req.isHTML) return res.status(410).json({ error: "This link has an invalid or unsupported destination." });
    return res.status(410).render("link_invalid", { title: "Link unavailable" });
  }

  const userAgent = req.headers["user-agent"] || "";
  const isCrawler = isSocialCrawler(userAgent);
  const isBot = isbot(userAgent) || isCrawler;
  const isRequestingInfo = /.*\+$/gi.test(req.params.id);

  if (isBot && !isRequestingInfo && req.method !== "HEAD") recordClickEvent(req, link, "crawler");

  if (isRequestingInfo && !link.password) {
    if (req.isHTML) {
      res.render("url_info", {
        title: "Short link information",
        target: link.target,
        link: utils.getShortURL(link.address, link.domain).link,
      });
      return;
    }
    return res.send({ target: link.target });
  }

  // Password-protected links never disclose previews to crawlers.
  if (link.password) {
    let authorized = hasPasswordAccess(req, link);
    if (!authorized && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      const firstSpace = authHeader.indexOf(" ");
      if (firstSpace !== -1 && authHeader.slice(0, firstSpace) === "Basic") {
        try {
          const decoded = Buffer.from(authHeader.slice(firstSpace + 1), "base64").toString("utf8");
          const colon = decoded.indexOf(":");
          if (colon !== -1 && await bcrypt.compare(decoded.slice(colon + 1), link.password)) {
            grantPasswordAccess(res, link);
            authorized = true;
          }
        } catch { /* return the normal password page */ }
      }
    }
    if (!authorized) {
      res.render("protected", { title: "Protected short link", id: link.uuid });
      return;
    }
  }

  // Social platforms receive a server-rendered card. The response is never
  // shared-cached: Vercel must not reuse crawler HTML for a browser request.
  if (isCrawler && !link.password) {
    const [preview, linkSettings] = await Promise.all([
      query.preview.find(link.id),
      query.linkSettings.find(link.id),
    ]);
    const previewEnabled = linkSettings?.preview_enabled !== false
      && linkSettings?.preview_enabled !== 0
      && linkSettings?.preview_enabled !== "0";
    const shortUrl = utils.getShortURL(link.address, link.domain).url;
    const fallbackImageUrl = new URL("/images/card.png", shortUrl).toString();
    const imageUrl = previewEnabled && preview?.image_url
      ? new URL(`/media/preview/${encodeURIComponent(link.uuid)}`, shortUrl).toString()
      : fallbackImageUrl;

    let videoUrl = null;
    if (previewEnabled && preview?.video_url) {
      try {
        const parsedVideo = new URL(preview.video_url);
        if (parsedVideo.protocol === "https:"
          && !parsedVideo.username
          && !parsedVideo.password
          && (!parsedVideo.port || parsedVideo.port === "443")
          && ["video/mp4", "video/webm"].includes(preview.video_mime_type)) {
          videoUrl = parsedVideo.toString();
        }
      } catch {
        // Ignore legacy invalid preview URLs. The original destination is unchanged.
      }
    }

    const videoWidth = Number.isInteger(Number(preview?.video_width))
      && Number(preview?.video_width) >= 1
      && Number(preview?.video_width) <= 7680
      ? Number(preview.video_width)
      : null;
    const videoHeight = Number.isInteger(Number(preview?.video_height))
      && Number(preview?.video_height) >= 1
      && Number(preview?.video_height) <= 4320
      ? Number(preview.video_height)
      : null;
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Vary", "User-Agent");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.status(200).render("social_preview", {
      layout: false,
      preview: {
        title: previewEnabled
          ? (preview?.title || link.description || env.SITE_NAME)
          : (link.description || env.SITE_NAME),
        description: previewEnabled
          ? (preview?.description || link.description || "A link shared with " + env.SITE_NAME + ".")
          : ("A link shared with " + env.SITE_NAME + "."),
        image_secure_url: imageUrl,
        image_alt: previewEnabled && preview?.image_alt ? preview.image_alt : env.SITE_NAME + " link preview",
        image_width: previewEnabled && preview?.image_url ? 1200 : 500,
        image_height: previewEnabled && preview?.image_url ? 630 : 300,
        video_secure_url: videoUrl,
        video_mime_type: videoUrl ? preview.video_mime_type : null,
        video_width: videoUrl ? videoWidth : null,
        video_height: videoUrl ? videoHeight : null,
      },
      playerWidth: videoWidth || 1280,
      playerHeight: videoHeight || 720,
      twitterStreamUrl: videoUrl && preview?.video_mime_type === "video/mp4" ? videoUrl : null,
      shortUrl,
      site_name: env.SITE_NAME,
    });
    return;
  }

  // Keep crawler traffic separate from humans and never expose it to monetization.
  if (isBot) {
    return res.redirect(link.target);
  }

  // HEAD mirrors the human page's successful status without counting a visit,
  // consuming a click limit, or producing analytics side effects.
  if (req.method === "HEAD") {
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Referrer-Policy", "no-referrer");
    return res.status(200).end();
  }

  const clickAllowance = await query.linkSettings.registerHumanClick(link.id);
  if (!clickAllowance.allowed) {
    if (!req.isHTML) return res.status(410).json({ error: "The owner-set click limit has been reached." });
    res.status(410);
    return res.render("link_limit", { title: "Link limit reached", destinationHost: new WHATWGURL(link.target).hostname });
  }

  if (link.user_id) {
    queue.visit.add({
      userAgent,
      ip: req.ip,
      country: req.get("cf-ipcountry"),
      referrer: req.get("Referer"),
      link,
    }).catch(error => console.error("Could not queue visit:", error.message));
  }
  recordClickEvent(req, link, "human");

  // Non-browser/API clients retain Kutt's original redirect semantics.
  if (!req.isHTML) return res.redirect(link.target);

  const settings = await platformSettings.getSettings();
  const countdown = normalizeCountdownSeconds(settings.countdownSeconds ?? env.REDIRECT_COUNTDOWN_SECONDS, env.REDIRECT_COUNTDOWN_SECONDS, settings.countdownMaxSeconds ?? env.REDIRECT_COUNTDOWN_MAX_SECONDS);
  let destinationHost = link.target;
  try { destinationHost = new WHATWGURL(link.target).hostname; } catch { /* validated on creation */ }
  const shortUrl = utils.getShortURL(link.address, link.domain).url;
  const adRenderData = buildAdRenderData(settings);
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Referrer-Policy", "no-referrer");
  return res.render("interstitial", {
    // This view is a complete HTML document and must not be wrapped in layout.hbs.
    layout: false,
    site_name: env.SITE_NAME,
    destination: link.target,
    destinationHost,
    countdown,
    safetyMessage: settings.serviceSafetyMessage || "Always check the destination before proceeding.",
    shortUrl,
    linkId: link.uuid,
    adFormats: adRenderData.renderedFormats.join(","),
    ...adRenderData,
  });
}

async function redirectProtected(req, res) {
  const uuid = req.params.id;
  const link = await query.link.find({ uuid });
  if (!link || !link.password) throw new CustomError("Couldn't find the link.", 400);
  if (!utils.isValidHttpUrl(link.target)) throw new CustomError("This link has an invalid or unsupported destination.", 410);

  const matches = await bcrypt.compare(req.body.password, link.password);
  if (!matches) throw new CustomError("Password is not correct.", 401);

  grantPasswordAccess(res, link);
  if (req.isHTML) {
    const shortUrl = utils.getShortURL(link.address, link.domain).url;
    res.setHeader("HX-Redirect", shortUrl);
    res.render("partials/protected/form", { id: link.uuid, message: "Password accepted. Preparing your link..." });
    return;
  }
  return res.status(200).send({ target: link.target });
}

async function redirectPreview(req, res) {
  const settings = await platformSettings.getSettings(true);
  let destinationHost = "example.com";
  const adRenderData = buildAdRenderData(settings);
  return res.render("interstitial", {
    layout: false,
    site_name: env.SITE_NAME,
    destination: "https://example.com/your-destination",
    destinationHost,
    countdown: normalizeCountdownSeconds(settings.countdownSeconds ?? env.REDIRECT_COUNTDOWN_SECONDS, env.REDIRECT_COUNTDOWN_SECONDS, settings.countdownMaxSeconds ?? env.REDIRECT_COUNTDOWN_MAX_SECONDS),
    safetyMessage: settings.serviceSafetyMessage || "Always check the destination before proceeding.",
    demo: true,
    adFormats: adRenderData.renderedFormats.join(","),
    ...adRenderData,
  });
}

async function redirectCustomDomainHomepage(req, res, next) {
  const host = utils.removeWww(req.headers.host);
  if (host === env.DEFAULT_DOMAIN) {
    next();
    return;
  }

  const path = req.path;
  const pathName = path.replace("/", "").split("/")[0];
  if (
    path === "/" ||
    utils.preservedURLs.includes(pathName)
  ) {
    const domain = await query.domain.find({ address: host });
    if (domain?.homepage) {
      res.redirect(302, domain.homepage);
      return;
    }
  }

  next();
};

async function stats(req, res) {
  const { user } = req;
  const uuid = req.params.id;

  const link = await query.link.find({
    ...(!user.admin && { user_id: user.id }),
    uuid
  });

  if (!link) {
    if (req.isHTML) {
      res.setHeader("HX-Redirect", "/404");
      res.status(200).send("");
      return;
    }
    throw new CustomError("Link could not be found.");
  }

  const stats = await query.visit.find({ link_id: link.id }, link.visit_count);

  if (!stats) {
    throw new CustomError("Could not get the short link stats. Try again later.");
  }

  if (req.isHTML) {
    res.render("partials/stats", {
      link: utils.sanitize.link_html(link),
      stats,
      map,
    });
    return;
  }

  return res.status(200).send({
    ...stats,
    ...utils.sanitize.link(link)
  });
};

module.exports = {
  ban,
  create,
  edit,
  editAdmin,
  get,
  getAdmin,
  remove,
  report,
  stats,
  redirect,
  redirectPreview,
  redirectProtected,
  redirectCustomDomainHomepage,
}