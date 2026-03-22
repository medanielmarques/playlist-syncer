import { eq } from "drizzle-orm";

import { db } from "#/db/index";
import { appSettings } from "#/db/schema";
import { runAppBootstrap } from "#/lib/server/bootstrap";
import { syncAllSources } from "#/lib/server/sync-service";

const AUTO_SYNC_POLL_MS = 60_000;

declare global {
	var __playlistSyncerSchedulerStarted: boolean | undefined;
}

function logSchedulerError(context: string, error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[playlist-syncer scheduler] ${context}: ${message}`);
}

async function maybeRunAutoSync(): Promise<void> {
	await runAppBootstrap();

	const settings = await db.query.appSettings.findFirst({
		where: eq(appSettings.id, 1),
	});

	const autoSyncEnabled = settings?.auto_sync_enabled === true;
	if (!autoSyncEnabled) {
		return;
	}

	const intervalHours = Math.max(1, settings.auto_sync_interval_hours ?? 1);
	const lastStarted = settings.last_global_sync_started_at;
	if (!lastStarted) {
		await syncAllSources("auto");
		return;
	}

	const lastMs = Date.parse(lastStarted);
	const lastMsValid = Number.isFinite(lastMs);
	if (!lastMsValid) {
		await syncAllSources("auto");
		return;
	}

	const elapsedMs = Date.now() - lastMs;
	const intervalMs = intervalHours * 3_600_000;
	if (elapsedMs >= intervalMs) {
		await syncAllSources("auto");
	}
}

/**
 * Runs bootstrap once, kicks off a parallel `startup` sync for all sources, then
 * polls every minute for auto sync when enabled. Stored on `globalThis` so dev HMR
 * does not register duplicate timers.
 */
export function ensureSchedulerStarted(): void {
	const alreadyStarted = globalThis.__playlistSyncerSchedulerStarted === true;
	if (alreadyStarted) {
		return;
	}
	globalThis.__playlistSyncerSchedulerStarted = true;

	void (async () => {
		try {
			await runAppBootstrap();
		} catch (error) {
			logSchedulerError("bootstrap failed", error);
			globalThis.__playlistSyncerSchedulerStarted = false;
			return;
		}

		void syncAllSources("startup").catch((error) => {
			logSchedulerError("startup sync failed", error);
		});

		setInterval(() => {
			void maybeRunAutoSync().catch((error) => {
				logSchedulerError("auto sync tick failed", error);
			});
		}, AUTO_SYNC_POLL_MS);
	})();
}
