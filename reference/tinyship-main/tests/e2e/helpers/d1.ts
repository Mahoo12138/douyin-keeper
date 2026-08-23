import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const rootDir = resolve(__dirname, '../../..');
const tanstackDir = resolve(rootDir, 'apps/tanstack-app');
const wranglerPath = resolve(rootDir, 'node_modules/.bin/wrangler');

export function getE2eDialect(): string {
  return process.env.E2E_DB_DIALECT || process.env.DB_DIALECT || 'pg';
}

export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function executeLocalD1(sql: string): Promise<void> {
  await execFileAsync(
    wranglerPath,
    ['d1', 'execute', 'tinyship-db', '--local', '--command', sql],
    { cwd: tanstackDir },
  );
}
