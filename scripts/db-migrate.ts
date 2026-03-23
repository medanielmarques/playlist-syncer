/**
 * Applies SQL migrations under ./drizzle using better-sqlite3.
 *
 * Run via `bun run db:migrate` (or `pnpm exec tsx …`): the `tsx` CLI uses Node.
 * Do not execute this file with the Bun runtime alone — Bun does not load
 * `better-sqlite3`.
 *
 * Paths are resolved from the repo root (parent of /scripts), not process.cwd(),
 * so migrations work from any working directory.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const dbPath = path.join(repoRoot, "sqlite.db");
const migrationsFolder = path.join(repoRoot, "drizzle");

const sqlite = new Database(dbPath);
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite);

migrate(db, { migrationsFolder });
sqlite.close();

console.log("Migrations applied.");
