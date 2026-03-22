import { and, eq } from "drizzle-orm";

import { db } from "#/db/index";
import { sources } from "#/db/schema";
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
