const knex = require("knex");

const env = require("./env");

const isSQLite = env.DB_CLIENT === "sqlite3" || env.DB_CLIENT === "better-sqlite3";
const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING;
const isPostgres = env.DB_CLIENT === "pg" || env.DB_CLIENT === "pg-native";
const isMySQL = env.DB_CLIENT === "mysql" || env.DB_CLIENT === "mysql2";

const db = knex({
  client: env.DB_CLIENT,
  connection: {
    ...(databaseUrl && !isSQLite ? { connectionString: databaseUrl } : {}),
    ...(isSQLite && { filename: env.DB_FILENAME }),
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: databaseUrl && !isSQLite ? { rejectUnauthorized: false } : env.DB_SSL,
  },
  pool: {
    min: env.DB_POOL_MIN,
    max: process.env.VERCEL ? Math.min(env.DB_POOL_MAX, 3) : env.DB_POOL_MAX
  },
  useNullAsDefault: true,
});

db.isPostgres = isPostgres;
db.isSQLite = isSQLite;
db.isMySQL = isMySQL;

db.compatibleILIKE = isPostgres ? "andWhereILike" : "andWhereLike";

module.exports = db;
