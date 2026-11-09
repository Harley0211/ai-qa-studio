import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Builds a fresh SQLite database from schema.prisma before the suite runs.
// Requires `prisma generate` to have run (done by `npm install` / `npm run setup`).
export default function setup() {
  const dbFile = path.join(serverRoot, 'prisma', 'test.db');
  for (const f of [dbFile, `${dbFile}-journal`]) rmSync(f, { force: true });
  execSync('npx prisma db push --skip-generate', {
    cwd: serverRoot,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  });
}
