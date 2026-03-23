import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.ts";

const dbPath = path.join(process.cwd(), "sqlite.db");
const sqlite = new Database(dbPath);

sqlite.pragma("foreign_keys = ON");
sqlite.pragma("journal_mode = WAL");

const db = drizzle(sqlite, { schema });

export { db };

if (typeof window === "undefined") {
	queueMicrotask(() => {
		void import("#/lib/server/scheduler").then((mod) => {
			mod.ensureSchedulerStarted();
		});
	});
}
