import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "#/db/index";
import { appSettings, jobs, sources, videos } from "#/db/schema";
import {
	ARCHIVES_ROOT,
	DATA_ROOT,
	INTERNAL_ROOT,
	YT_DLP_PATH,
} from "#/lib/server/app-paths";
import {
	extractPlaylistVideoSnapshots,
	inspectSourceWithMetadata,
	SourceInspectionError,
} from "#/lib/server/source-inspector";

export type SyncJobTrigger = "startup" | "manual" | "auto";

const MAX_LOG_CHARS = 2_000_000;
const DOWNLOAD_TIMEOUT_MS = 86_400_000;

const runningBySource = new Map<number, Promise<SyncSourceOutcome>>();

function appendLog(current: string | null, chunk: string): string {
	const next = `${current ?? ""}${chunk}`;
	if (next.length <= MAX_LOG_CHARS) {
		return next;
	}
	const tail = next.slice(-MAX_LOG_CHARS);
	return `${tail}\n[...log truncated...]\n`;
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath, fsConstants.F_OK);
		return true;
	} catch {
		return false;
	}
}

async function readArchiveLineSet(archivePath: string): Promise<Set<string>> {
	const exists = await pathExists(archivePath);
	if (!exists) {
		return new Set();
	}
	const text = await fs.readFile(archivePath, "utf8");
	const lines = text
		.split(/\n/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	return new Set(lines);
}

/**
 * yt-dlp archive lines are typically `extractor video_id` (e.g. `youtube dQw4w9WgXcQ`).
 */
function videoIdFromArchiveLine(line: string): string | null {
	const trimmed = line.trim();
	if (trimmed.length === 0) {
		return null;
	}
	const space = trimmed.indexOf(" ");
	if (space === -1) {
		return trimmed;
	}
	const rest = trimmed.slice(space + 1).trim();
	return rest.length > 0 ? rest : null;
}

function videoIdsFromArchiveLines(lines: Iterable<string>): Set<string> {
	const ids = new Set<string>();
	for (const line of lines) {
		const id = videoIdFromArchiveLine(line);
		if (id) {
			ids.add(id);
		}
	}
	return ids;
}

function diffNewLines(before: Set<string>, after: Set<string>): string[] {
	const added: string[] = [];
	for (const line of after) {
		if (!before.has(line)) {
			added.push(line);
		}
	}
	return added;
}

async function ensureAppFoldersForSync(
	outputDir: string,
	archivePath: string,
): Promise<void> {
	await fs.mkdir(DATA_ROOT, { recursive: true });
	await fs.mkdir(INTERNAL_ROOT, { recursive: true });
	await fs.mkdir(ARCHIVES_ROOT, { recursive: true });
	await fs.mkdir(path.dirname(archivePath), { recursive: true });
	await fs.mkdir(outputDir, { recursive: true });
}

function isoNow(): string {
	return new Date().toISOString();
}

function countYtDlpErrorishLines(log: string): number {
	const lines = log.split("\n");
	let n = 0;
	for (const line of lines) {
		if (/^\s*ERROR[:\s]/i.test(line) || /:\s*ERROR\s*:/i.test(line)) {
			n += 1;
		}
	}
	return n;
}

type YtDlpDownloadResult = {
	exitCode: number | null;
	log: string;
};

function runYtDlpDownload(args: string[]): Promise<YtDlpDownloadResult> {
	return new Promise((resolve, reject) => {
		const proc = spawn(YT_DLP_PATH, args, {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let log = "";
		let settled = false;
		let timer: ReturnType<typeof setTimeout>;

		const settle = (fn: () => void) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			fn();
		};

		timer = setTimeout(() => {
			proc.kill("SIGTERM");
			settle(() => {
				log = appendLog(
					log,
					`\n[sync] yt-dlp download timed out after ${DOWNLOAD_TIMEOUT_MS}ms\n`,
				);
				resolve({ exitCode: null, log });
			});
		}, DOWNLOAD_TIMEOUT_MS);

		proc.stdout?.on("data", (chunk: Buffer) => {
			log = appendLog(log, chunk.toString());
		});
		proc.stderr?.on("data", (chunk: Buffer) => {
			log = appendLog(log, chunk.toString());
		});

		proc.on("error", (err) => {
			settle(() => {
				reject(err);
			});
		});

		proc.on("close", (code) => {
			settle(() => {
				resolve({ exitCode: code, log });
			});
		});
	});
}

export type SyncSourceOutcome = {
	sourceId: number;
	jobId: number;
	status: "completed" | "failed" | "skipped";
	errorMessage?: string;
};

async function persistSnapshotVideos(
	sourceId: number,
	snapshot: ReturnType<typeof extractPlaylistVideoSnapshots>,
	now: string,
): Promise<void> {
	for (const snap of snapshot) {
		await db
			.insert(videos)
			.values({
				source_id: sourceId,
				video_id: snap.video_id,
				channel_id: snap.channel_id,
				playlist_index: snap.playlist_index,
				title: snap.title,
				uploader: snap.uploader,
				duration: snap.duration,
				webpage_url: snap.webpage_url,
				thumbnail: snap.thumbnail,
				is_unavailable: snap.is_unavailable,
				unavailable_kind: snap.unavailable_kind,
				unavailable_reason: snap.unavailable_reason,
				removed_from_source: false,
				last_seen_at: now,
			})
			.onConflictDoUpdate({
				target: [videos.source_id, videos.video_id],
				set: {
					channel_id: sql`excluded.channel_id`,
					playlist_index: sql`excluded.playlist_index`,
					title: sql`excluded.title`,
					uploader: sql`excluded.uploader`,
					duration: sql`excluded.duration`,
					webpage_url: sql`excluded.webpage_url`,
					thumbnail: sql`excluded.thumbnail`,
					is_unavailable: sql`excluded.is_unavailable`,
					unavailable_kind: sql`excluded.unavailable_kind`,
					unavailable_reason: sql`excluded.unavailable_reason`,
					removed_from_source: sql`excluded.removed_from_source`,
					last_seen_at: sql`excluded.last_seen_at`,
				},
			});
	}
}

async function markRemovedVideos(
	sourceId: number,
	currentVideoIds: string[],
	now: string,
): Promise<void> {
	const hasIds = currentVideoIds.length > 0;
	if (!hasIds) {
		return;
	}
	await db
		.update(videos)
		.set({ removed_from_source: true, last_seen_at: now })
		.where(
			and(
				eq(videos.source_id, sourceId),
				notInArray(videos.video_id, currentVideoIds),
			),
		);
}

async function applyArchiveDownloadResults(
	sourceId: number,
	jobId: number,
	newLines: string[],
): Promise<void> {
	const ids = new Set<string>();
	for (const line of newLines) {
		const id = videoIdFromArchiveLine(line);
		if (id) {
			ids.add(id);
		}
	}
	if (ids.size === 0) {
		return;
	}
	const idList = [...ids];
	await db
		.update(videos)
		.set({
			download_status: "downloaded",
			download_error: null,
			last_job_id: jobId,
		})
		.where(
			and(eq(videos.source_id, sourceId), inArray(videos.video_id, idList)),
		);
}

async function finishJobRow(
	jobId: number,
	patch: {
		status: "completed" | "failed";
		finishedAt: string;
		exitCode: number | null;
		logText: string;
		errorMessage: string | null;
		totalEntries: number | null;
		downloadedCount: number | null;
		alreadyDownloadedCount: number | null;
		failedCount: number | null;
		unavailableCount: number | null;
	},
): Promise<void> {
	await db
		.update(jobs)
		.set({
			status: patch.status,
			finished_at: patch.finishedAt,
			exit_code: patch.exitCode,
			log_text: patch.logText,
			error_message: patch.errorMessage,
			total_entries: patch.totalEntries,
			downloaded_count: patch.downloadedCount,
			already_downloaded_count: patch.alreadyDownloadedCount,
			failed_count: patch.failedCount,
			unavailable_count: patch.unavailableCount,
		})
		.where(eq(jobs.id, jobId));
}

async function finishSourceSyncRow(
	sourceId: number,
	patch: {
		lastSyncFinishedAt: string;
		lastSyncStatus: "completed" | "failed";
		lastSyncError: string | null;
		updatedAt: string;
	},
): Promise<void> {
	await db
		.update(sources)
		.set({
			last_sync_finished_at: patch.lastSyncFinishedAt,
			last_sync_status: patch.lastSyncStatus,
			last_sync_error: patch.lastSyncError,
			updated_at: patch.updatedAt,
		})
		.where(eq(sources.id, sourceId));
}

async function runSyncSourceOnce(
	sourceId: number,
	trigger: SyncJobTrigger,
): Promise<SyncSourceOutcome> {
	const sourceRow = await db.query.sources.findFirst({
		where: eq(sources.id, sourceId),
	});
	if (!sourceRow) {
		throw new Error(`Source ${sourceId} not found`);
	}

	await ensureAppFoldersForSync(sourceRow.output_dir, sourceRow.archive_path);
	const archiveBeforeLines = await readArchiveLineSet(sourceRow.archive_path);
	const archiveBeforeVideoIds = videoIdsFromArchiveLines(archiveBeforeLines);

	const startedAt = isoNow();
	const [jobRow] = await db
		.insert(jobs)
		.values({
			source_id: sourceId,
			trigger,
			status: "running",
			started_at: startedAt,
			log_text: "",
		})
		.returning({ id: jobs.id });

	if (!jobRow) {
		throw new Error("Failed to create job row");
	}

	const jobId = jobRow.id;

	await db
		.update(sources)
		.set({
			last_sync_started_at: startedAt,
			last_sync_status: "running",
			last_sync_error: null,
			updated_at: startedAt,
		})
		.where(eq(sources.id, sourceId));

	let logText = "";
	const fail = async (message: string) => {
		const finishedAt = isoNow();
		logText = appendLog(logText, `\n[sync] ${message}\n`);
		await finishJobRow(jobId, {
			status: "failed",
			finishedAt,
			exitCode: null,
			logText,
			errorMessage: message,
			totalEntries: null,
			downloadedCount: null,
			alreadyDownloadedCount: null,
			failedCount: null,
			unavailableCount: null,
		});
		await finishSourceSyncRow(sourceId, {
			lastSyncFinishedAt: finishedAt,
			lastSyncStatus: "failed",
			lastSyncError: message,
			updatedAt: finishedAt,
		});
		return {
			sourceId,
			jobId,
			status: "failed" as const,
			errorMessage: message,
		};
	};

	let inspectedRoot: Record<string, unknown>;
	try {
		const { inspected, root } = await inspectSourceWithMetadata(
			sourceRow.normalized_url,
		);
		inspectedRoot = root;
		const metaNow = isoNow();
		await db
			.update(sources)
			.set({
				title: inspected.title,
				updated_at: metaNow,
			})
			.where(eq(sources.id, sourceId));
	} catch (e) {
		const message =
			e instanceof SourceInspectionError
				? e.message
				: e instanceof Error
					? e.message
					: "Metadata inspection failed";
		return await fail(message);
	}

	const snapshot = extractPlaylistVideoSnapshots(inspectedRoot);
	const now = isoNow();
	await persistSnapshotVideos(sourceId, snapshot, now);

	const currentIds = snapshot.map((s) => s.video_id);
	await markRemovedVideos(sourceId, currentIds, now);

	const unavailableCount = snapshot.filter((s) => s.is_unavailable).length;
	const downloadableSnapshot = snapshot.filter((s) => !s.is_unavailable);
	const alreadyDownloadedCount = downloadableSnapshot.filter((s) =>
		archiveBeforeVideoIds.has(s.video_id),
	).length;

	const outputTemplate = path.join(sourceRow.output_dir, "%(title)s.%(ext)s");
	const ytArgs = [
		"--download-archive",
		sourceRow.archive_path,
		"--continue",
		"--no-overwrites",
		"--ignore-errors",
		"--newline",
		"-o",
		outputTemplate,
		sourceRow.normalized_url,
	];

	let exitCode: number | null = null;
	try {
		const dl = await runYtDlpDownload(ytArgs);
		logText = appendLog(logText, dl.log);
		exitCode = dl.exitCode;
	} catch (e) {
		const message =
			e instanceof Error ? e.message : "Failed to run yt-dlp download";
		return await fail(message);
	}

	const archiveAfterLines = await readArchiveLineSet(sourceRow.archive_path);
	const newLines = diffNewLines(archiveBeforeLines, archiveAfterLines);
	await applyArchiveDownloadResults(sourceId, jobId, newLines);

	const downloadedCount = newLines.length;
	const archiveAfterVideoIds = videoIdsFromArchiveLines(archiveAfterLines);
	const failedAfterSync = downloadableSnapshot.filter(
		(s) => !archiveAfterVideoIds.has(s.video_id),
	).length;
	const errorish = countYtDlpErrorishLines(logText);
	const jobFailed = exitCode !== 0 && exitCode !== null;
	const failedCount = jobFailed
		? Math.max(errorish, failedAfterSync, 1)
		: errorish;

	const finishedAt = isoNow();
	const summaryError = jobFailed ? `yt-dlp exited with code ${exitCode}` : null;

	await finishJobRow(jobId, {
		status: jobFailed ? "failed" : "completed",
		finishedAt,
		exitCode,
		logText,
		errorMessage: summaryError,
		totalEntries: snapshot.length,
		downloadedCount,
		alreadyDownloadedCount,
		failedCount,
		unavailableCount,
	});

	await finishSourceSyncRow(sourceId, {
		lastSyncFinishedAt: finishedAt,
		lastSyncStatus: jobFailed ? "failed" : "completed",
		lastSyncError: summaryError,
		updatedAt: finishedAt,
	});

	return {
		sourceId,
		jobId,
		status: jobFailed ? "failed" : "completed",
		errorMessage: summaryError ?? undefined,
	};
}

/**
 * Runs a full sync for one source: job row, archive snapshot, metadata refresh,
 * video upserts, yt-dlp download, archive diff, and metrics.
 * Concurrent calls for the same source await the in-flight run instead of starting another job.
 */
export function syncSource(
	sourceId: number,
	trigger: SyncJobTrigger,
): Promise<SyncSourceOutcome> {
	let run = runningBySource.get(sourceId);
	if (!run) {
		run = Promise.resolve()
			.then(() => runSyncSourceOnce(sourceId, trigger))
			.finally(() => {
				if (runningBySource.get(sourceId) === run) {
					runningBySource.delete(sourceId);
				}
			});
		runningBySource.set(sourceId, run);
	}
	return run;
}

export type SyncAllOutcome = {
	results: PromiseSettledResult<SyncSourceOutcome>[];
};

async function recordGlobalSyncStarted(): Promise<void> {
	const now = isoNow();
	await db
		.update(appSettings)
		.set({
			last_global_sync_started_at: now,
			updated_at: now,
		})
		.where(eq(appSettings.id, 1));
}

/**
 * Loads all sources and syncs them in parallel; failures do not block other sources.
 * Updates `last_global_sync_started_at` so auto sync measures intervals from the last
 * global run (startup, manual, or auto).
 */
export async function syncAllSources(
	trigger: SyncJobTrigger,
): Promise<SyncAllOutcome> {
	await recordGlobalSyncStarted();
	const allSources = await db.query.sources.findMany({ columns: { id: true } });
	const results = await Promise.allSettled(
		allSources.map((s) => syncSource(s.id, trigger)),
	);
	return { results };
}

export type DashboardJobSummary = {
	id: number;
	source_id: number;
	source_title: string | null;
	trigger: "startup" | "manual" | "auto";
	status: "pending" | "running" | "completed" | "failed";
	started_at: string | null;
	finished_at: string | null;
	error_message: string | null;
};

export async function listRecentJobsForDashboard(
	limit: number,
): Promise<DashboardJobSummary[]> {
	return await db
		.select({
			id: jobs.id,
			source_id: jobs.source_id,
			source_title: sources.title,
			trigger: jobs.trigger,
			status: jobs.status,
			started_at: jobs.started_at,
			finished_at: jobs.finished_at,
			error_message: jobs.error_message,
		})
		.from(jobs)
		.innerJoin(sources, eq(jobs.source_id, sources.id))
		.orderBy(desc(jobs.started_at))
		.limit(limit);
}

export async function getJobLogById(jobId: number) {
	return await db.query.jobs.findFirst({
		where: eq(jobs.id, jobId),
		columns: {
			id: true,
			source_id: true,
			trigger: true,
			status: true,
			started_at: true,
			finished_at: true,
			exit_code: true,
			log_text: true,
			error_message: true,
		},
	});
}
