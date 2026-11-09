import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.js'],
    env: { NODE_ENV: 'test', DATABASE_URL: 'file:./test.db' },
    fileParallelism: false, // all files share one SQLite test database
    hookTimeout: 60_000,
    testTimeout: 15_000,
  },
});
