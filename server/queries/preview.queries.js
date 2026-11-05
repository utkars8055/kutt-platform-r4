const knex = require("../knex");

async function find(link_id) {
  return knex("link_previews").where({ link_id }).first();
}

async function upsert(link_id, values) {
  const existing = await find(link_id);
  const map = {
    preview_image_url: "image_url",
    preview_video_url: "video_url",
    preview_video_mime_type: "video_mime_type",
    preview_video_width: "video_width",
    preview_video_height: "video_height",
    preview_title: "title",
    preview_description: "description",
    preview_image_alt: "image_alt",
  };
  const fields = {};
  for (const [inputKey, column] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(values, inputKey)) {
      fields[column] = values[inputKey] || null;
    } else {
      fields[column] = existing?.[column] || null;
    }
  }
  fields.updated_at = knex.fn.now();
  const hasContent = Object.entries(fields).some(([key, value]) => key !== "updated_at" && value !== null);
  if (!existing && !hasContent) return null;
  if (existing) {
    await knex("link_previews").where({ link_id }).update(fields);
  } else {
    await knex("link_previews").insert({ link_id, ...fields, created_at: knex.fn.now() });
  }
  return find(link_id);
}

async function remove(link_id) {
  return knex("link_previews").where({ link_id }).delete();
}

module.exports = { find, upsert, remove };
