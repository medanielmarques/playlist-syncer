import fs from "node:fs/promises";

import { eq } from "drizzle-orm";

import { db } from "#/db/index";
import { appSettings, jobs, sources } from "#/db/schema";
import {
	ARCHIVES_ROOT,
	DATA_ROOT,
	INTERNAL_ROOT,
} from "#/lib/server/app-paths";

const STALE_SYNC_MESSAGE =
	"Sync interrupted because the application stopped before the job finished.";

declare global {
	// Persisted across HMR in dev; ensures bootstrap side effects run once per process.
	var __playlistSyncerBootstrapPromise: Promise<void> | undefined;
}

/**
 * Ensures download folders exist, seeds default `app_settings` when missing, and
 * marks in-flight sync state from a prior process as failed.
 */
export function runAppBootstrap(): Promise<void> {
	if (globalThis.__playlistSyncerBootstrapPromise) {
		return globalThis.__playlistSyncerBootstrapPromise;
	}

	globalThis.__playlistSyncerBootstrapPromise = (async () => {
		await fs.mkdir(DATA_ROOT, { recursive: true });
		await fs.mkdir(INTERNAL_ROOT, { recursive: true });
		await fs.mkdir(ARCHIVES_ROOT, { recursive: true });

		const now = new Date().toISOString();

		await db
			.update(jobs)
			.set({
				status: "failed",
				finished_at: now,
				error_message: STALE_SYNC_MESSAGE,
			})
			.where(eq(jobs.status, "running"));

		await db
			.update(sources)
			.set({
				last_sync_status: "failed",
				last_sync_error: STALE_SYNC_MESSAGE,
				last_sync_finished_at: now,
				updated_at: now,
			})
			.where(eq(sources.last_sync_status, "running"));

		const existingSettings = await db.query.appSettings.findFirst();
		if (!existingSettings) {
			await db.insert(appSettings).values({
				id: 1,
				auto_sync_enabled: false,
				auto_sync_interval_hours: 1,
			});
		}
	})();

	return globalThis.__playlistSyncerBootstrapPromise;
}
