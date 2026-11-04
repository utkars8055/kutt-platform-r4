// this configuration is for migrations only
// and since jwt secret is not required, it's set to a placehodler string to bypass env validation
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "securekey";
}

const env = require("./server/env");

const isSQLite = env.DB_CLIENT === "sqlite3" || env.DB_CLIENT === "better-sqlite3";
const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;

module.exports = {
  client: env.DB_CLIENT,
  connection: {
    ...(databaseUrl && !isSQLite ? { connectionString: databaseUrl } : {}),
    ...(isSQLite && { filename: env.DB_FILENAME }),
    host: env.DB_HOST,
    database: env.DB_NAME,
    user: env.DB_USER,
    port: env.DB_PORT,
    password: env.DB_PASSWORD,
    ssl: databaseUrl && !isSQLite ? { rejectUnauthorized: false } : env.DB_SSL,
  },
  pool: { min: 0, max: 2 },
  useNullAsDefault: true,
  migrations: {
    tableName: "knex_migrations",
    directory: "server/migrations",
    disableMigrationsListValidation: true,
  }
};
