import { formatDistanceToNow } from "date-fns";

export function formatIsoDateTime(value: string | null | undefined): string {
	if (!value) {
		return "—";
	}
	const ms = Date.parse(value);
	if (!Number.isFinite(ms)) {
		return value;
	}
	return new Date(ms).toLocaleString();
}

export function formatRelativeShort(value: string | null | undefined): string {
	if (!value) {
		return "—";
	}
	const ms = Date.parse(value);
	if (!Number.isFinite(ms)) {
		return "—";
	}
	return formatDistanceToNow(new Date(ms), { addSuffix: true });
}

export function formatSyncStatus(
	status: "running" | "completed" | "failed" | null | undefined,
): string {
	if (!status) {
		return "—";
	}
	return status;
}

export function formatJobStatus(
	status: "pending" | "running" | "completed" | "failed",
): string {
	return status;
}

type DownloadStatus = "not_downloaded" | "downloaded" | "failed" | "skipped";

export function formatDownloadStatusDisplay(
	status: DownloadStatus,
	downloadError: string | null | undefined,
): string {
	const hasError =
		typeof downloadError === "string" && downloadError.trim().length > 0;
	if (status === "failed" && hasError) {
		return `${status}: ${downloadError.trim()}`;
	}
	return status;
}
