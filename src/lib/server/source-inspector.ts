import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { URL } from "node:url";

import { YT_DLP_PATH } from "#/lib/server/app-paths";

export type InspectedSourceType = "playlist" | "channel";

export type InspectedSource = {
	sourceType: InspectedSourceType;
	externalId: string;
	normalizedUrl: string;
	title: string;
	channelId: string | null;
	rawMetadata: Record<string, unknown>;
};

export class SourceInspectionError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "SourceInspectionError";
	}
}

const INSPECTION_TIMEOUT_MS = 180_000;

function hasYoutubeListQueryParam(urlString: string): boolean {
	try {
		const parsed = new URL(urlString);
		const list = parsed.searchParams.get("list");
		return Boolean(list && list.trim().length > 0);
	} catch {
		return false;
	}
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

function readString(
	record: Record<string, unknown>,
	key: string,
): string | null {
	const v = record[key];
	return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function runYtDlpDumpJson(url: string): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const args = [
			"--flat-playlist",
			"--dump-single-json",
			"--skip-download",
			"--no-warnings",
			"--ignore-no-formats-error",
			url,
		];

		const proc = spawn(YT_DLP_PATH, args, {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

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
				reject(
					new SourceInspectionError(
						`yt-dlp inspection timed out after ${INSPECTION_TIMEOUT_MS}ms`,
					),
				);
			});
		}, INSPECTION_TIMEOUT_MS);

		proc.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		proc.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		proc.on("error", (err) => {
			settle(() => {
				reject(
					new SourceInspectionError(
						"Failed to start yt-dlp. Is the binary present?",
						err,
					),
				);
			});
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
				settle(() => {
					reject(
						new SourceInspectionError(
							`yt-dlp metadata inspection failed: ${detail.slice(0, 2000)}`,
						),
					);
				});
				return;
			}

			try {
				const parsed: unknown = JSON.parse(stdout);
				const root = asRecord(parsed);
				if (!root) {
					settle(() => {
						reject(
							new SourceInspectionError("yt-dlp returned invalid JSON root"),
						);
					});
					return;
				}
				settle(() => {
					resolve(root);
				});
			} catch (e) {
				settle(() => {
					reject(
						new SourceInspectionError("Failed to parse yt-dlp JSON output", e),
					);
				});
			}
		});
	});
}

function normalizeInspectedSource(
	trimmedUrl: string,
	root: Record<string, unknown>,
): InspectedSource {
	const metaType = readString(root, "_type");

	if (metaType === "video") {
		throw new SourceInspectionError(
			"That URL points to a single video. Add a playlist or channel URL instead.",
		);
	}

	if (metaType !== "playlist" && metaType !== "channel") {
		throw new SourceInspectionError(
			`Unsupported source type from yt-dlp: ${metaType ?? "unknown"}. Only playlists and channels are supported.`,
		);
	}

	const playlistIntent = hasYoutubeListQueryParam(trimmedUrl);
	const title =
		readString(root, "title") ??
		readString(root, "playlist_title") ??
		"Untitled source";

	const webpageUrl = readString(root, "webpage_url") ?? trimmedUrl;
	const channelId =
		readString(root, "channel_id") ?? readString(root, "uploader_id");

	const rootId = readString(root, "id");
	if (!rootId) {
		throw new SourceInspectionError(
			"yt-dlp did not return a stable id for this URL",
		);
	}

	let sourceType: InspectedSourceType;
	let externalId: string;

	if (playlistIntent) {
		sourceType = "playlist";
		externalId = rootId;
	} else {
		sourceType = "channel";
		externalId = channelId ?? rootId;
	}

	return {
		sourceType,
		externalId,
		normalizedUrl: webpageUrl,
		title,
		channelId: channelId ?? (sourceType === "channel" ? externalId : null),
		rawMetadata: root,
	};
}

/**
 * Metadata-only yt-dlp pass returning both normalized source fields and the raw root JSON
 * (includes `entries` for playlist/channel sync).
 */
export async function inspectSourceWithMetadata(
	originalUrl: string,
): Promise<{ inspected: InspectedSource; root: Record<string, unknown> }> {
	const trimmed = originalUrl.trim();
	if (trimmed.length === 0) {
		throw new SourceInspectionError("URL is empty");
	}

	const root = await runYtDlpDumpJson(trimmed);
	const inspected = normalizeInspectedSource(trimmed, root);
	return { inspected, root };
}

export type PlaylistVideoSnapshot = {
	video_id: string;
	title: string | null;
	channel_id: string | null;
	playlist_index: number | null;
	webpage_url: string | null;
	uploader: string | null;
	duration: number | null;
	thumbnail: string | null;
	is_unavailable: boolean;
	unavailable_kind: string | null;
	unavailable_reason: string | null;
};

function readNumber(
	record: Record<string, unknown>,
	key: string,
): number | null {
	const v = record[key];
	if (typeof v === "number" && Number.isFinite(v)) {
		return v;
	}
	return null;
}

function readThumbnail(record: Record<string, unknown>): string | null {
	const thumb = record.thumbnail;
	if (typeof thumb === "string" && thumb.trim().length > 0) {
		return thumb;
	}
	const thumbs = record.thumbnails;
	if (Array.isArray(thumbs) && thumbs.length > 0) {
		const first = thumbs[0];
		const rec = asRecord(first);
		if (rec) {
			return readString(rec, "url");
		}
	}
	return null;
}

function deriveUnavailable(
	record: Record<string, unknown>,
	title: string | null,
): {
	is_unavailable: boolean;
	unavailable_kind: string | null;
	unavailable_reason: string | null;
} {
	const availability = readString(record, "availability");
	const id = readString(record, "id");
	const reason = readString(record, "reason") ?? readString(record, "error");

	if (!id || id.startsWith("NA")) {
		return {
			is_unavailable: true,
			unavailable_kind: "unknown",
			unavailable_reason: reason ?? "Missing video id in playlist metadata",
		};
	}

	if (availability === "private") {
		return {
			is_unavailable: true,
			unavailable_kind: "private",
			unavailable_reason: reason ?? "Video is private",
		};
	}
	if (availability === "unavailable") {
		return {
			is_unavailable: true,
			unavailable_kind: "unavailable",
			unavailable_reason: reason ?? "Video is unavailable",
		};
	}
	if (
		availability === "premium_only" ||
		availability === "subscriber_only" ||
		availability === "needs_auth"
	) {
		return {
			is_unavailable: true,
			unavailable_kind: availability,
			unavailable_reason: reason ?? `Availability: ${availability}`,
		};
	}

	const t = title ?? "";
	if (/\[private video\]/i.test(t)) {
		return {
			is_unavailable: true,
			unavailable_kind: "private",
			unavailable_reason: "Marked as private in title metadata",
		};
	}
	if (/\[deleted video\]/i.test(t)) {
		return {
			is_unavailable: true,
			unavailable_kind: "deleted",
			unavailable_reason: "Marked as deleted in title metadata",
		};
	}

	return {
		is_unavailable: false,
		unavailable_kind: null,
		unavailable_reason: null,
	};
}

function stableUnavailableVideoId(entry: Record<string, unknown>): string {
	const url =
		readString(entry, "url") ?? readString(entry, "webpage_url") ?? "";
	const title = readString(entry, "title") ?? "";
	const digest = createHash("sha256")
		.update(`${url}\0${title}`)
		.digest("hex")
		.slice(0, 24);
	return `unavail_${digest}`;
}

/**
 * Flattens yt-dlp playlist/channel JSON `entries` into per-video rows for DB upserts.
 */
export function extractPlaylistVideoSnapshots(
	root: Record<string, unknown>,
): PlaylistVideoSnapshot[] {
	const out: PlaylistVideoSnapshot[] = [];

	const visit = (node: Record<string, unknown>) => {
		const entries = node.entries;
		if (!Array.isArray(entries)) {
			return;
		}
		for (const raw of entries) {
			const entry = asRecord(raw);
			if (!entry) {
				continue;
			}
			const childType = readString(entry, "_type");
			const nestedEntries = entry.entries;
			const hasNestedEntries =
				Array.isArray(nestedEntries) && nestedEntries.length > 0;

			if (hasNestedEntries && childType === "playlist") {
				visit(entry);
				continue;
			}

			const videoId = readString(entry, "id");
			const title = readString(entry, "title");
			const webpageUrl =
				readString(entry, "webpage_url") ?? readString(entry, "url");
			const channelId =
				readString(entry, "channel_id") ?? readString(entry, "uploader_id");
			const uploader = readString(entry, "uploader");
			const duration = readNumber(entry, "duration");
			const thumbnail = readThumbnail(entry);
			const playlistIndex = readNumber(entry, "playlist_index");

			const unavail = deriveUnavailable(entry, title);

			if (!videoId && !unavail.is_unavailable) {
				continue;
			}

			const effectiveId = videoId ?? stableUnavailableVideoId(entry);

			out.push({
				video_id: effectiveId,
				title,
				channel_id: channelId,
				playlist_index: playlistIndex,
				webpage_url: webpageUrl,
				uploader,
				duration,
				thumbnail,
				is_unavailable: unavail.is_unavailable,
				unavailable_kind: unavail.unavailable_kind,
				unavailable_reason: unavail.unavailable_reason,
			});
		}
	};

	visit(root);

	let idx = 0;
	for (const row of out) {
		if (row.playlist_index == null) {
			row.playlist_index = idx;
		}
		idx += 1;
	}

	return out;
}

/**
 * Runs a metadata-only yt-dlp pass and returns normalized playlist/channel fields.
 * Rejects single-video URLs and non-playlist/channel extract results.
 */
export async function inspectSourceUrl(
	originalUrl: string,
): Promise<InspectedSource> {
	const { inspected } = await inspectSourceWithMetadata(originalUrl);
	return inspected;
}
