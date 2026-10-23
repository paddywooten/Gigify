// Test bootstrap: point the app at a dedicated SQLite test database and reset
// its schema before the suite runs. Runs before each test file (single fork).

import { execSync } from "node:child_process";
import path from "node:path";

const testDbPath = path.resolve(__dirname, "..", "prisma", "test.db");

process.env.DATABASE_URL = `file:${testDbPath}`;
process.env.PAYMENT_PROVIDER = "mock";

execSync("npx prisma db push --force-reset --skip-generate", {
  stdio: "pipe",
  env: { ...process.env },
});
