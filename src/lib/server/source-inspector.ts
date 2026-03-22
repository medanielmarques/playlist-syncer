import { spawn } from "node:child_process";
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

/**
 * Runs a metadata-only yt-dlp pass and returns normalized playlist/channel fields.
 * Rejects single-video URLs and non-playlist/channel extract results.
 */
export async function inspectSourceUrl(
	originalUrl: string,
): Promise<InspectedSource> {
	const trimmed = originalUrl.trim();
	if (trimmed.length === 0) {
		throw new SourceInspectionError("URL is empty");
	}

	const root = await runYtDlpDumpJson(trimmed);
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

	const playlistIntent = hasYoutubeListQueryParam(trimmed);
	const title =
		readString(root, "title") ??
		readString(root, "playlist_title") ??
		"Untitled source";

	const webpageUrl = readString(root, "webpage_url") ?? trimmed;
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
