import type { InferSelectModel } from "drizzle-orm";
import { Button } from "#/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import type { sources } from "#/db/schema";
import { formatIsoDateTime, formatSyncStatus } from "#/lib/formatters";

type SourceRow = InferSelectModel<typeof sources>;

type SourcesTableProps = {
	sources: SourceRow[];
	selectedSourceId: number | null;
	onSelectSource: (id: number) => void;
	onRemoveClick: (source: SourceRow) => void;
};

export function SourcesTable({
	sources: sourceList,
	selectedSourceId,
	onSelectSource,
	onRemoveClick,
}: SourcesTableProps) {
	const hasRows = sourceList.length > 0;

	return (
		<div className="flex flex-col gap-2">
			<h2 className="text-sm font-medium">Sources</h2>
			{hasRows ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Title</TableHead>
							<TableHead>Type</TableHead>
							<TableHead className="max-w-[200px] truncate">URL</TableHead>
							<TableHead>Last sync</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="text-end">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sourceList.map((s) => {
							const isSelected = selectedSourceId === s.id;
							return (
								<TableRow
									key={s.id}
									className={isSelected ? "bg-muted/50" : undefined}
								>
									<TableCell className="font-medium">
										{s.title ?? "—"}
									</TableCell>
									<TableCell>{s.source_type}</TableCell>
									<TableCell
										className="max-w-[200px] truncate text-muted-foreground"
										title={s.normalized_url}
									>
										{s.normalized_url}
									</TableCell>
									<TableCell className="text-muted-foreground whitespace-nowrap">
										{formatIsoDateTime(s.last_sync_finished_at)}
									</TableCell>
									<TableCell>
										{formatSyncStatus(s.last_sync_status ?? undefined)}
									</TableCell>
									<TableCell className="text-end">
										<div className="flex justify-end gap-2">
											<Button
												type="button"
												size="sm"
												variant={isSelected ? "secondary" : "outline"}
												onClick={() => onSelectSource(s.id)}
											>
												Videos
											</Button>
											<Button
												type="button"
												size="sm"
												variant="destructive"
												onClick={() => onRemoveClick(s)}
											>
												Remove
											</Button>
										</div>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			) : (
				<p className="text-muted-foreground text-xs/relaxed">
					No sources yet. Add a playlist or channel above.
				</p>
			)}
		</div>
	);
}
