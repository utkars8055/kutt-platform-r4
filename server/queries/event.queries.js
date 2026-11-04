const knex = require("../knex");
const utils = require("../utils");

async function addClick(event) {
  return knex("link_click_events").insert({
    link_id: event.link_id,
    visitor_type: event.visitor_type,
    country: event.country || null,
    device: event.device || null,
    browser: event.browser || null,
    os: event.os || null,
    referrer: event.referrer || null,
    utm_source: event.utm_source || null,
    utm_medium: event.utm_medium || null,
    utm_campaign: event.utm_campaign || null,
    utm_term: event.utm_term || null,
    utm_content: event.utm_content || null,
    created_at: knex.fn.now(),
  });
}

async function addAdEvent(event) {
  return knex("ad_events").insert({
    link_id: event.link_id || null,
    format: event.format,
    event_type: event.event_type,
    created_at: knex.fn.now(),
  });
}

async function cleanupOldEvents(clickRetentionDays = 180, adRetentionDays = 30, batchSize = 10000) {
  const cleanTable = async (table, retentionDays) => {
    const days = Number(retentionDays);
    if (!Number.isFinite(days) || days <= 0) return 0;
    const cutoff = utils.dateToUTC(new Date(Date.now() - Math.floor(days) * 86400000));
    const safeBatchSize = Number.isFinite(Number(batchSize))
      ? Math.max(1, Math.min(10000, Math.floor(Number(batchSize))))
      : 10000;
    const oldRows = await knex(table)
      .where("created_at", "<", cutoff)
      .select("id")
      .orderBy("id", "asc")
      .limit(safeBatchSize);
    if (!oldRows.length) return 0;
    return knex(table).whereIn("id", oldRows.map(row => row.id)).delete();
  };

  const [clickEvents, adEvents] = await Promise.all([
    cleanTable("link_click_events", clickRetentionDays),
    cleanTable("ad_events", adRetentionDays),
  ]);
  return { clickEvents, adEvents };
}

async function getClickHistory(link_id, limit = 50, offset = 0) {
  const [rows, countRows] = await Promise.all([
    knex("link_click_events").where({ link_id }).orderBy("created_at", "desc").limit(limit).offset(offset),
    knex("link_click_events").where({ link_id }).count({ count: "id" }),
  ]);
  return { data: rows, total: Number(countRows[0]?.count || 0) };
}

module.exports = { addAdEvent, addClick, cleanupOldEvents, getClickHistory };
