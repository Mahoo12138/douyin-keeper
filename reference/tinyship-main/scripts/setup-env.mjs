import { existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Script is in scripts/ directory, so root is one level up
const rootDir = join(__dirname, '..');
const envPath = join(rootDir, '.env');
const envExamplePath = join(rootDir, 'env.example');

// Only create .env if it doesn't exist and env.example exists
// This is safe for CI because:
// 1. CI doesn't have .env file (it's in .gitignore)
// 2. env.example contains placeholder values which are sufficient for nuxt prepare
// 3. nuxt prepare only needs type generation, not actual database connection
if (!existsSync(envPath) && existsSync(envExamplePath)) {
  copyFileSync(envExamplePath, envPath);
  console.log('✓ Created .env file from env.example');
}

