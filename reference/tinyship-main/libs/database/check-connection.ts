import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { getDialect } from './shared/dialect';

/**
 * 检查数据库连接
 */
async function checkConnection() {
  const dialect = getDialect();

  if (dialect === 'sqlite') {
    try {
      console.log("正在连接 SQLite...");
      const { sqliteInstance } = await import('./drivers/sqlite');
      const result = sqliteInstance.prepare("SELECT 1 AS ok").get() as any;
      if (result?.ok === 1) {
        console.log("✅ SQLite 连接成功");
        console.log("   文件路径:", (await import('./drivers/sqlite')).getSqlitePath());
        return true;
      }
      console.error("❌ SQLite 查询返回异常结果");
      return false;
    } catch (error) {
      console.error("❌ SQLite 连接失败:", error);
      return false;
    }
  }

  // PostgreSQL
  try {
    console.log("正在连接数据库...");
    const { pool } = await import('./client');
    await pool!.query("SELECT 1");
    console.log("✅ 数据库连接成功");
    await pool!.end();
    return true;
  } catch (error) {
    console.error("❌ 数据库连接失败:", error);
    return false;
  }
}

// 如果直接运行此文件，执行连接检查
if (require.main === module) {
  checkConnection()
    .then(connected => {
      if (!connected) {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error("发生错误:", error);
      process.exit(1);
    });
}

export { checkConnection };
