import fs from "node:fs/promises";

import { and, eq } from "drizzle-orm";

import { db } from "#/db/index";
import { appSettings, sources, videos } from "#/db/schema";
import {
	buildArchivePath,
	buildSourceOutputDir,
	sanitizeFolderName,
} from "#/lib/server/app-paths";
import {
	type InspectedSource,
	inspectSourceUrl,
	SourceInspectionError,
} from "#/lib/server/source-inspector";

export class SourceAlreadyExistsError extends Error {
	constructor(
		public readonly sourceType: "playlist" | "channel",
		public readonly externalId: string,
	) {
		super(
			`This ${sourceType} is already registered (id: ${externalId}). Try a different URL or remove the existing source first.`,
		);
		this.name = "SourceAlreadyExistsError";
	}
}

async function isDuplicateSource(
	sourceType: "playlist" | "channel",
	externalId: string,
): Promise<boolean> {
	const row = await db.query.sources.findFirst({
		where: and(
			eq(sources.source_type, sourceType),
			eq(sources.external_id, externalId),
		),
		columns: { id: true },
	});
	return Boolean(row);
}

async function allocateFolderName(baseTitle: string): Promise<string> {
	const base = sanitizeFolderName(baseTitle);
	const existing = await db.select({ name: sources.folder_name }).from(sources);
	const used = new Set(existing.map((r) => r.name));

	let candidate = base;
	let suffix = 2;
	while (used.has(candidate)) {
		candidate = `${base}-${suffix}`;
		suffix += 1;
	}
	return candidate;
}

export type AddSourceResult = {
	id: number;
	sourceType: "playlist" | "channel";
	externalId: string;
	folderName: string;
	outputDir: string;
	archivePath: string;
};

/**
 * Inspects the URL with yt-dlp, rejects duplicates on `(source_type, external_id)`, and inserts the row.
 */
export async function addSourceFromUrl(
	originalUrl: string,
): Promise<AddSourceResult> {
	let inspected: InspectedSource;
	try {
		inspected = await inspectSourceUrl(originalUrl);
	} catch (e) {
		if (e instanceof SourceInspectionError) {
			throw e;
		}
		throw new SourceInspectionError("Unexpected error while inspecting URL", e);
	}

	const duplicate = await isDuplicateSource(
		inspected.sourceType,
		inspected.externalId,
	);
	if (duplicate) {
		throw new SourceAlreadyExistsError(
			inspected.sourceType,
			inspected.externalId,
		);
	}

	const folderName = await allocateFolderName(inspected.title);
	const outputDir = buildSourceOutputDir(folderName);
	const archivePath = buildArchivePath(
		inspected.sourceType,
		inspected.externalId,
	);

	let inserted: { id: number } | undefined;
	try {
		[inserted] = await db
			.insert(sources)
			.values({
				source_type: inspected.sourceType,
				original_url: originalUrl.trim(),
				normalized_url: inspected.normalizedUrl,
				external_id: inspected.externalId,
				title: inspected.title,
				folder_name: folderName,
				output_dir: outputDir,
				archive_path: archivePath,
			})
			.returning({ id: sources.id });
	} catch (e) {
		const code =
			e !== null && typeof e === "object" && "code" in e
				? (e as { code?: string }).code
				: undefined;
		if (code === "SQLITE_CONSTRAINT_UNIQUE") {
			throw new SourceAlreadyExistsError(
				inspected.sourceType,
				inspected.externalId,
			);
		}
		throw e;
	}

	if (!inserted) {
		throw new SourceInspectionError("Failed to insert source row");
	}

	return {
		id: inserted.id,
		sourceType: inspected.sourceType,
		externalId: inspected.externalId,
		folderName,
		outputDir,
		archivePath,
	};
}

export async function listSourcesForDashboard() {
	return await db.query.sources.findMany({
		orderBy: (s, { desc }) => [desc(s.created_at)],
	});
}

export type RemoveSourceMode = "app-only" | "app-and-files";

/**
 * Removes the source from the database (cascading jobs and videos). With
 * `app-and-files`, also deletes the download folder and archive file on disk.
 */
export async function removeSource(
	sourceId: number,
	mode: RemoveSourceMode,
): Promise<void> {
	const row = await db.query.sources.findFirst({
		where: eq(sources.id, sourceId),
	});
	if (!row) {
		throw new Error(`Source ${sourceId} not found`);
	}

	const shouldDeleteFiles = mode === "app-and-files";
	if (shouldDeleteFiles) {
		try {
			await fs.rm(row.output_dir, { recursive: true, force: true });
		} catch {
			// Folder may already be missing; continue with DB removal.
		}
		try {
			await fs.unlink(row.archive_path);
		} catch {
			// Archive may already be missing.
		}
	}

	await db.delete(sources).where(eq(sources.id, sourceId));
}

export async function listVideosForSource(sourceId: number) {
	return await db.query.videos.findMany({
		where: eq(videos.source_id, sourceId),
		orderBy: (v, { asc }) => [asc(v.playlist_index), asc(v.id)],
	});
}

export async function updateAppSettings(patch: {
	auto_sync_enabled: boolean;
	auto_sync_interval_hours: number;
}): Promise<void> {
	const intervalHours = Math.max(1, Math.floor(patch.auto_sync_interval_hours));
	const now = new Date().toISOString();
	await db
		.update(appSettings)
		.set({
			auto_sync_enabled: patch.auto_sync_enabled,
			auto_sync_interval_hours: intervalHours,
			updated_at: now,
		})
		.where(eq(appSettings.id, 1));
}
