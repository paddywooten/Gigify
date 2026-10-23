// Prisma client singleton (reused across hot reloads in dev).
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// Ephemeral-host bootstrap (Firebase App Hosting): the SQLite file starts empty
// on every deploy/restart, so when DB_BOOTSTRAP=1 we push the schema and load
// the demo-data snapshot (prisma/seed.sql) synchronously at import time, before
// any query can race it. Runs once per process; failures are logged, not fatal.
// Local dev and tests never set DB_BOOTSTRAP, so behavior there is unchanged.
if (process.env.DB_BOOTSTRAP === "1") {
  try {
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], {
      stdio: "pipe",
      timeout: 180_000,
    });
    execFileSync(
      "npx",
      [
        "prisma",
        "db",
        "execute",
        "--file",
        "prisma/seed.sql",
        "--schema",
        "prisma/schema.prisma",
      ],
      { stdio: "pipe", timeout: 60_000 },
    );
  } catch (err) {
    console.error(
      "[db] bootstrap failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
