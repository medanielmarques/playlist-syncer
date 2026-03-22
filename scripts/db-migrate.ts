/**
 * Applies SQL migrations under ./drizzle using Bun's built-in SQLite.
 * Use instead of `drizzle-kit migrate`, which expects better-sqlite3 (Node native).
 *
 * Paths are resolved from the repo root (parent of /scripts), not process.cwd(),
 * so `bun run db:migrate` works from any directory.
 */
import path from "node:path";

import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const repoRoot = path.resolve(import.meta.dir, "..");
const dbPath = path.join(repoRoot, "sqlite.db");
const migrationsFolder = path.join(repoRoot, "drizzle");

const db = drizzle(dbPath);
db.$client.exec("PRAGMA foreign_keys = ON");

migrate(db, { migrationsFolder });

console.log("Migrations applied.");
