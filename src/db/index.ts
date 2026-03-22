import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "./schema.ts";

const db = drizzle("./sqlite.db", { schema });

db.$client.exec("PRAGMA foreign_keys = ON");
db.$client.exec("PRAGMA journal_mode = WAL");

export { db };
