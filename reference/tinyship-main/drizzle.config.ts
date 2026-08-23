import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// 加载环境变量
dotenv.config();

// 获取数据库连接字符串
const connectionString = process.env.DATABASE_URL;
console.log('connectionString', connectionString);
if (!connectionString) {
  throw new Error("DATABASE_URL 环境变量未设置");
}

export default defineConfig({
  schema: "./libs/database/schema/pg/*",
  out: "./libs/database/drizzle",
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
})