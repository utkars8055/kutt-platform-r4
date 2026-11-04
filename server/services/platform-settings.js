const knex = require("../knex");
const utils = require("../utils");
const env = require("../env");

const FORMATS = ["direct_link", "onclick", "vignette", "in_page_push", "banner", "custom_html"];
const DEFAULT_MAX_COUNTDOWN = Math.min(30, Math.max(0, Math.floor(env.REDIRECT_COUNTDOWN_MAX_SECONDS)));
const DEFAULTS = {
  countdownSeconds: Math.min(DEFAULT_MAX_COUNTDOWN, Math.max(0, Math.floor(env.REDIRECT_COUNTDOWN_SECONDS))),
  countdownMaxSeconds: DEFAULT_MAX_COUNTDOWN,
  serviceSafetyMessage: "Always check the destination before proceeding.",
};

let cached = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5000;

async function getSettings(force = false) {
  if (!force && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  const rows = await knex("platform_settings").select("setting_key", "setting_value");
  const result = { ...DEFAULTS };
  for (const row of rows) {
    try { result[row.setting_key] = JSON.parse(row.setting_value); }
    catch { result[row.setting_key] = row.setting_value; }
  }
  const placements = await knex("ad_placements").select("format", "enabled", "placement", "zone_id", "code", "destination_url", "label");
  result.adPlacements = Object.fromEntries(placements.map(item => [item.format, item]));
  cached = result;
  cachedAt = Date.now();
  return result;
}

async function saveSetting(key, value, trx) {
  const db = trx || knex;
  const existing = await db("platform_settings").where({ setting_key: key }).first();
  const record = { setting_value: JSON.stringify(value), updated_at: db.fn.now() };
  if (existing) await db("platform_settings").where({ setting_key: key }).update(record);
  else await db("platform_settings").insert({ setting_key: key, ...record });
}

async function saveAdminSettings(input) {
  if (input.serviceSafetyMessage !== undefined && typeof input.serviceSafetyMessage !== "string") {
    throw new Error("The safety message must be plain text.");
  }
  if (!Number.isInteger(input.countdownSeconds) || input.countdownSeconds < 0 || input.countdownSeconds > 30) {
    throw new Error("Countdown must be a whole number between 0 and 30 seconds.");
  }
  if (input.countdownMaxSeconds !== undefined && (!Number.isInteger(input.countdownMaxSeconds) || input.countdownMaxSeconds < input.countdownSeconds || input.countdownMaxSeconds > 30)) {
    throw new Error("Countdown maximum must be between the selected countdown and 30 seconds.");
  }
  const placements = input.adPlacements || {};
  if (!placements || typeof placements !== "object" || Array.isArray(placements)) throw new Error("Advertising placements must be an object.");
  const seenZoneIds = new Set();
  const seenCodes = new Set();
  for (const format of Object.keys(placements)) {
    if (!FORMATS.includes(format)) throw new Error(`Unsupported advertising format: ${format}`);
    const item = placements[format];
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Invalid settings for ${format}.`);
    if (item.enabled !== undefined && typeof item.enabled !== "boolean") throw new Error(`${format} enabled must be boolean.`);
    if (item.zone_id !== undefined && (typeof item.zone_id !== "string" || item.zone_id.length > 255)) throw new Error(`${format} zone ID is invalid.`);
    if (item.label !== undefined && (typeof item.label !== "string" || item.label.length > 120)) throw new Error(`${format} label is invalid.`);
    if (item.destination_url !== undefined && typeof item.destination_url !== "string") throw new Error(`${format} destination is invalid.`);
    if (item.code !== undefined && (typeof item.code !== "string" || item.code.length > 20000)) throw new Error(`${format} code is too long.`);
    if (item.destination_url && !utils.isValidHttpUrl(item.destination_url)) throw new Error(`${format} destination must be a valid HTTP or HTTPS URL.`);
    if (item.placement && !["head", "top", "middle", "bottom"].includes(item.placement)) throw new Error(`Invalid placement for ${format}.`);
    if (item.enabled && ["vignette", "onclick", "in_page_push", "banner"].includes(format) && !String(item.code || "").trim()) throw new Error(`${format} is enabled but no advertising tag was provided.`);
    if (item.enabled && format === "direct_link" && !item.destination_url) throw new Error("Direct Link is enabled but no sponsored destination was provided.");
    if (item.enabled && format === "custom_html" && !String(item.code || "").trim()) throw new Error("Custom HTML is enabled but no code was provided.");
    if (item.enabled && item.zone_id) {
      const zoneId = String(item.zone_id).trim();
      if (seenZoneIds.has(zoneId)) throw new Error(`Advertising zone ${zoneId} is configured more than once.`);
      seenZoneIds.add(zoneId);
    }
    if (item.enabled && item.code) {
      const code = String(item.code).trim();
      if (seenCodes.has(code)) throw new Error(`The same advertising tag is configured more than once (${format}).`);
      seenCodes.add(code);
    }
  }

  await knex.transaction(async trx => {
    await saveSetting("countdownSeconds", input.countdownSeconds, trx);
    await saveSetting("countdownMaxSeconds", input.countdownMaxSeconds ?? 30, trx);
    await saveSetting("serviceSafetyMessage", String(input.serviceSafetyMessage || DEFAULTS.serviceSafetyMessage).slice(0, 300), trx);
    for (const format of FORMATS) {
      const item = placements[format] || {};
      const row = {
        format,
        enabled: item.enabled === true,
        placement: item.placement || (format === "vignette" ? "head" : "middle"),
        zone_id: item.zone_id ? String(item.zone_id).trim().slice(0, 255) : null,
        code: item.code || null,
        destination_url: item.destination_url ? String(item.destination_url).trim() : null,
        label: item.label ? String(item.label).trim().slice(0, 120) : null,
        updated_at: trx.fn.now(),
      };
      const existing = await trx("ad_placements").where({ format }).first();
      if (existing) await trx("ad_placements").where({ format }).update(row);
      else await trx("ad_placements").insert({ ...row, created_at: trx.fn.now() });
    }
  });
  cached = null;
  return getSettings(true);
}

function getFormats() { return [...FORMATS]; }

module.exports = { DEFAULTS, FORMATS, getFormats, getSettings, saveAdminSettings };
