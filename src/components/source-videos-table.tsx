import type { InferSelectModel } from "drizzle-orm";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import type { videos } from "#/db/schema";
import { formatIsoDateTime } from "#/lib/formatters";

type VideoRow = InferSelectModel<typeof videos>;

type SourceVideosTableProps = {
	sourceTitle: string | null;
	videos: VideoRow[] | null;
	loading: boolean;
};

export function SourceVideosTable({
	sourceTitle,
	videos: rows,
	loading,
}: SourceVideosTableProps) {
	const showTable = rows !== null && rows.length > 0;
	const showEmpty = rows !== null && rows.length === 0;

	return (
		<div className="flex flex-col gap-2">
			<h2 className="text-sm font-medium">
				Videos
				{sourceTitle ? (
					<span className="text-muted-foreground font-normal">
						{" "}
						· {sourceTitle}
					</span>
				) : null}
			</h2>
			{loading ? (
				<p className="text-muted-foreground text-xs/relaxed">Loading…</p>
			) : null}
			{showEmpty ? (
				<p className="text-muted-foreground text-xs/relaxed">
					No videos recorded for this source yet. Run a sync to populate the
					list.
				</p>
			) : null}
			{showTable ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Title</TableHead>
							<TableHead>Video ID</TableHead>
							<TableHead>Unavailable</TableHead>
							<TableHead>Reason</TableHead>
							<TableHead>Download</TableHead>
							<TableHead>Last seen</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((v) => {
							const unavailableLabel = v.is_unavailable ? "Yes" : "No";
							const reason =
								v.unavailable_reason ??
								v.unavailable_kind ??
								(v.removed_from_source ? "Removed from source" : "—");
							return (
								<TableRow key={v.id}>
									<TableCell className="max-w-[220px] truncate font-medium">
										{v.title ?? "—"}
									</TableCell>
									<TableCell className="font-mono text-xs">
										{v.video_id}
									</TableCell>
									<TableCell>{unavailableLabel}</TableCell>
									<TableCell
										className="max-w-[180px] truncate text-muted-foreground"
										title={reason}
									>
										{reason}
									</TableCell>
									<TableCell>{v.download_status}</TableCell>
									<TableCell className="text-muted-foreground whitespace-nowrap">
										{formatIsoDateTime(v.last_seen_at)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			) : null}
			{!loading && rows === null ? (
				<p className="text-muted-foreground text-xs/relaxed">
					Select a source and choose Videos to load its entries.
				</p>
			) : null}
		</div>
	);
}
