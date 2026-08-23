import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./libs/database/schema/sqlite/*",
  out: "./libs/database/drizzle-sqlite",
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SQLITE_DB_PATH || './data/local.sqlite',
  },
});
