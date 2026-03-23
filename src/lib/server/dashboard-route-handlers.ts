import "@tanstack/react-start/server-only";
import { eq } from "drizzle-orm";
import { db } from "#/db/index";
import { appSettings } from "#/db/schema";
import { runAppBootstrap } from "#/lib/server/bootstrap";
import { ensureSchedulerStarted } from "#/lib/server/scheduler";
import {
	addSourceFromUrl,
	listSourcesForDashboard,
	listVideosForSource,
	type RemoveSourceMode,
	removeSource,
	updateAppSettings,
} from "#/lib/server/source-service";
import {
	getJobLogById,
	listRecentJobsForDashboard,
	syncAllSources,
} from "#/lib/server/sync-service";

const RECENT_JOBS_LIMIT = 40;

export async function loadDashboard() {
	await runAppBootstrap();
	ensureSchedulerStarted();

	const settings = await db.query.appSettings.findFirst({
		where: eq(appSettings.id, 1),
	});
	const sourceList = await listSourcesForDashboard();
	const recentJobs = await listRecentJobsForDashboard(RECENT_JOBS_LIMIT);

	return { settings, sources: sourceList, recentJobs };
}

export async function addSourceForDashboard(url: string) {
	await runAppBootstrap();
	ensureSchedulerStarted();
	return await addSourceFromUrl(url);
}

export async function syncAllNowForDashboard() {
	await runAppBootstrap();
	ensureSchedulerStarted();
	void syncAllSources("manual").catch((err) => {
		console.error("[dashboard] manual sync all failed", err);
	});
	return { ok: true as const };
}

export async function updateAppSettingsForDashboard(data: {
	auto_sync_enabled: boolean;
	auto_sync_interval_hours: number;
}) {
	await runAppBootstrap();
	await updateAppSettings(data);
	return { ok: true as const };
}

export async function listVideosForDashboard(sourceId: number) {
	await runAppBootstrap();
	return await listVideosForSource(sourceId);
}

export async function getJobLogForDashboard(jobId: number) {
	await runAppBootstrap();
	const job = await getJobLogById(jobId);
	if (!job) {
		throw new Error(`Job ${jobId} not found`);
	}
	return job;
}

export async function removeSourceForDashboard(
	sourceId: number,
	mode: RemoveSourceMode,
) {
	await runAppBootstrap();
	await removeSource(sourceId, mode);
	return { ok: true as const };
}
