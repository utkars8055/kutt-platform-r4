/**
 * Store optional source video dimensions for video preview metadata in social cards.
 * Existing preview rows remain valid; dimensions are nullable and no records are rewritten.
 */
async function up(knex) {
  if (!(await knex.schema.hasTable("link_previews"))) return;
  if (!(await knex.schema.hasColumn("link_previews", "video_width"))) {
    await knex.schema.table("link_previews", table => table.integer("video_width").nullable());
  }
  if (!(await knex.schema.hasColumn("link_previews", "video_height"))) {
    await knex.schema.table("link_previews", table => table.integer("video_height").nullable());
  }
}

async function down(knex) {
  if (!(await knex.schema.hasTable("link_previews"))) return;
  if (await knex.schema.hasColumn("link_previews", "video_height")) {
    await knex.schema.table("link_previews", table => table.dropColumn("video_height"));
  }
  if (await knex.schema.hasColumn("link_previews", "video_width")) {
    await knex.schema.table("link_previews", table => table.dropColumn("video_width"));
  }
}

module.exports = { up, down };
