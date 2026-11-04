/** Additive schema for social previews, redirect settings and detailed events. */
async function up(knex) {
  if (!(await knex.schema.hasTable("link_previews"))) {
    await knex.schema.createTable("link_previews", table => {
      table.increments("id").primary();
      table.integer("link_id").unsigned().notNullable().unique()
        .references("id").inTable("links").onDelete("CASCADE");
      table.string("image_url", 2040);
      table.string("video_url", 2040);
      table.string("video_mime_type", 128);
      table.string("title", 300);
      table.text("description");
      table.string("image_alt", 500);
      table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("link_settings"))) {
    await knex.schema.createTable("link_settings", table => {
      table.increments("id").primary();
      table.integer("link_id").unsigned().notNullable().unique()
        .references("id").inTable("links").onDelete("CASCADE");
      table.integer("countdown_override").nullable();
      table.integer("click_limit").nullable();
      table.integer("click_count").notNullable().defaultTo(0);
      table.boolean("preview_enabled").notNullable().defaultTo(true);
      table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("platform_settings"))) {
    await knex.schema.createTable("platform_settings", table => {
      table.string("setting_key", 100).primary();
      table.text("setting_value").notNullable();
      table.dateTime("updated_at").notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("ad_placements"))) {
    await knex.schema.createTable("ad_placements", table => {
      table.increments("id").primary();
      table.string("format", 40).notNullable().unique();
      table.boolean("enabled").notNullable().defaultTo(false);
      table.string("placement", 40).notNullable().defaultTo("middle");
      table.string("zone_id", 255);
      table.text("code");
      table.text("destination_url");
      table.string("label", 120);
      table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable("link_click_events"))) {
    await knex.schema.createTable("link_click_events", table => {
      table.bigIncrements("id").primary();
      table.integer("link_id").unsigned().notNullable()
        .references("id").inTable("links").onDelete("CASCADE");
      table.string("visitor_type", 20).notNullable().defaultTo("human");
      table.string("country", 2);
      table.string("device", 30);
      table.string("browser", 80);
      table.string("os", 80);
      table.string("referrer", 255);
      table.string("utm_source", 255);
      table.string("utm_medium", 255);
      table.string("utm_campaign", 255);
      table.string("utm_term", 255);
      table.string("utm_content", 255);
      table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("link_click_events", table => {
      table.index(["link_id", "created_at"], "link_click_events_link_time_idx");
      table.index(["visitor_type", "created_at"], "link_click_events_type_time_idx");
    });
  }

  if (!(await knex.schema.hasTable("ad_events"))) {
    await knex.schema.createTable("ad_events", table => {
      table.bigIncrements("id").primary();
      table.integer("link_id").unsigned().nullable()
        .references("id").inTable("links").onDelete("SET NULL");
      table.string("format", 40).notNullable();
      // Diagnostic-only events. Do not record impressions or completed views from timers.
      table.string("event_type", 40).notNullable();
      table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
      table.index(["event_type", "created_at"], "ad_events_type_time_idx");
    });
  }
}

async function down(knex) {
  for (const table of ["ad_events", "link_click_events", "ad_placements", "platform_settings", "link_settings", "link_previews"]) {
    if (await knex.schema.hasTable(table)) await knex.schema.dropTable(table);
  }
}

module.exports = { up, down };
