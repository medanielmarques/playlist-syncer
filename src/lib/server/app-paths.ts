import { homedir } from "node:os";
import path from "node:path";

/** Bundled yt-dlp binary path (project root at process.cwd()). */
export const YT_DLP_PATH = path.join(
	process.cwd(),
	"resources",
	"bin",
	"yt-dlp",
);

/** User-visible download root: `~/playlist-syncer`. */
export const DATA_ROOT = path.join(homedir(), "playlist-syncer");

/** App metadata under the download root. */
export const INTERNAL_ROOT = path.join(DATA_ROOT, ".internal");

/** Per-source `--download-archive` files. */
export const ARCHIVES_ROOT = path.join(INTERNAL_ROOT, "archives");

const TRIM_DOT_UNDERSCORE = /^[\s._]+|[\s._]+$/g;
const COLLAPSE_UNDERSCORES = /_+/g;

function replaceIllegalFolderChars(segment: string): string {
	let out = "";
	for (const char of segment) {
		const code = char.codePointAt(0) ?? 0;
		const isControl = code < 32;
		const isReserved = char === "/" || char === "\\" || char === ":";
		out += isControl || isReserved ? "_" : char;
	}
	return out;
}

/**
 * Produces a single directory segment under `DATA_ROOT` from a YouTube title.
 * Does not guarantee uniqueness; callers should append a numeric suffix on collision.
 */
export function sanitizeFolderName(title: string): string {
	const trimmed = title.trim();
	const withoutIllegal = replaceIllegalFolderChars(trimmed);
	const collapsed = withoutIllegal
		.replace(TRIM_DOT_UNDERSCORE, "")
		.replace(COLLAPSE_UNDERSCORES, "_");
	const limited = collapsed.slice(0, 200);
	const result = limited.length > 0 ? limited : "unnamed-source";
	const noTrailingDots = result.replace(/\.+$/, "");
	return noTrailingDots.length > 0 ? noTrailingDots : "unnamed-source";
}

const ARCHIVE_SEGMENT_FORBIDDEN = /[^a-zA-Z0-9._-]+/g;

/**
 * Stable, filesystem-safe fragment for archive filenames (external IDs can contain odd characters).
 */
export function sanitizeArchiveSegment(segment: string): string {
	const trimmed = segment.trim();
	if (trimmed.length === 0) {
		return "unknown";
	}
	const safe = trimmed.replace(ARCHIVE_SEGMENT_FORBIDDEN, "_");
	const collapsed = safe.replace(/_+/g, "_").replace(/^_|_$/g, "");
	const limited = collapsed.slice(0, 180);
	return limited.length > 0 ? limited : "unknown";
}

/**
 * Archive basename only (no directory). Stable per `source_type` + `external_id`.
 */
export function buildArchiveFileName(
	sourceType: "playlist" | "channel",
	externalId: string,
): string {
	const safeId = sanitizeArchiveSegment(externalId);
	return `${sourceType}__${safeId}.txt`;
}

/** Absolute path to the folder where media for this source is stored. */
export function buildSourceOutputDir(folderName: string): string {
	return path.join(DATA_ROOT, folderName);
}

/** Absolute path to the archive file for a source. */
export function buildArchivePath(
	sourceType: "playlist" | "channel",
	externalId: string,
): string {
	return path.join(ARCHIVES_ROOT, buildArchiveFileName(sourceType, externalId));
}
