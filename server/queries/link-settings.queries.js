const knex = require("../knex");
const cache = new Map();
const CACHE_TTL = 5000;

async function find(link_id, force = false) {
  const cached = cache.get(link_id);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL) return cached.value;
  const value = await knex("link_settings").where({ link_id }).first();
  cache.set(link_id, { value: value || null, at: Date.now() });
  return value;
}

async function upsert(link_id, values = {}) {
  const record = {
    ...(Object.prototype.hasOwnProperty.call(values, "click_limit") && { click_limit: values.click_limit ? Number(values.click_limit) : null }),
    ...(Object.prototype.hasOwnProperty.call(values, "countdown_override") && { countdown_override: values.countdown_override === "" ? null : Number(values.countdown_override) }),
    ...(Object.prototype.hasOwnProperty.call(values, "preview_enabled") && { preview_enabled: values.preview_enabled !== false && values.preview_enabled !== "false" }),
    updated_at: knex.fn.now(),
  };
  const existing = await find(link_id, true);
  if (existing) await knex("link_settings").where({ link_id }).update(record);
  else await knex("link_settings").insert({ link_id, click_count: 0, preview_enabled: true, ...record, created_at: knex.fn.now() });
  cache.delete(link_id);
  return find(link_id, true);
}

async function registerHumanClick(link_id) {
  // Read the current limit directly from the database, not the process-local
  // settings cache. This matters when multiple application instances are used.
  const before = await knex("link_settings").where({ link_id }).first();
  if (!before || before.click_limit === null || before.click_limit === undefined) {
    return { allowed: true, count: before?.click_count ?? null, limit: null };
  }

  // Enforce the limit in a single conditional UPDATE so simultaneous requests
  // cannot all pass after the final allowed click.
  const update = await knex("link_settings")
    .where({ link_id })
    .andWhereRaw("click_count < click_limit")
    .update({ click_count: knex.raw("click_count + 1"), updated_at: knex.fn.now() });
  const affected = Array.isArray(update)
    ? (typeof update[0] === "number" ? update[0] : update.length)
    : Number(update);

  const current = await knex("link_settings").where({ link_id }).first();
  if (current) cache.set(link_id, { value: current, at: Date.now() });
  else cache.delete(link_id);

  if (!affected) {
    // The row may have been concurrently changed to unlimited/deleted.
    if (!current || current.click_limit === null || current.click_limit === undefined) {
      return { allowed: true, count: current?.click_count ?? null, limit: null };
    }
    return { allowed: false, count: current.click_count, limit: current.click_limit };
  }

  return { allowed: true, count: current?.click_count ?? null, limit: current?.click_limit ?? null };
}

module.exports = { find, registerHumanClick, upsert };
