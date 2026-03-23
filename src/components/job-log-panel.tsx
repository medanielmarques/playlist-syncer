import { useEffect, useMemo, useRef } from "react";
import { Button } from "#/components/ui/button";
import { ScrollArea } from "#/components/ui/scroll-area";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { formatJobStatus, formatRelativeShort } from "#/lib/formatters";
import type { DashboardJobSummary } from "#/lib/server/sync-service";

type JobLogPanelProps = {
	recentJobs: DashboardJobSummary[];
	selectedJobId: number | null;
	onSelectJob: (jobId: number) => void;
	logText: string | null;
	logLoading: boolean;
};

export function JobLogPanel({
	recentJobs,
	selectedJobId,
	onSelectJob,
	logText,
	logLoading,
}: JobLogPanelProps) {
	const hasJobs = recentJobs.length > 0;
	const logPreview = useMemo(() => logText ?? "", [logText]);
	const logEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (logText === null) {
			return;
		}
		logEndRef.current?.scrollIntoView({ block: "end" });
	}, [logText]);

	return (
		<div className="grid gap-4 lg:grid-cols-2">
			<div className="flex min-h-0 flex-col gap-2">
				<h2 className="text-sm font-medium">Recent jobs</h2>
				{hasJobs ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Source</TableHead>
								<TableHead>Trigger</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="max-w-[140px]">Error</TableHead>
								<TableHead>Started</TableHead>
								<TableHead className="text-end">Log</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{recentJobs.map((j) => {
								const isSelected = selectedJobId === j.id;
								return (
									<TableRow
										key={j.id}
										className={isSelected ? "bg-muted/50" : undefined}
									>
										<TableCell className="max-w-[140px] truncate font-medium">
											{j.source_title ?? `Source #${j.source_id}`}
										</TableCell>
										<TableCell>{j.trigger}</TableCell>
										<TableCell>{formatJobStatus(j.status)}</TableCell>
										<TableCell
											className="text-muted-foreground max-w-[140px] truncate text-xs"
											title={j.error_message ?? undefined}
										>
											{j.status === "failed" && j.error_message
												? j.error_message
												: "—"}
										</TableCell>
										<TableCell className="text-muted-foreground whitespace-nowrap">
											{formatRelativeShort(j.started_at)}
										</TableCell>
										<TableCell className="text-end">
											<Button
												type="button"
												size="sm"
												variant={isSelected ? "secondary" : "outline"}
												onClick={() => onSelectJob(j.id)}
											>
												View
											</Button>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				) : (
					<p className="text-muted-foreground text-xs/relaxed">
						No jobs yet. Sync a source to see history here.
					</p>
				)}
			</div>
			<div className="flex min-h-0 flex-col gap-2">
				<h2 className="text-sm font-medium">Job log</h2>
				{logLoading ? (
					<p className="text-muted-foreground text-xs/relaxed">Loading…</p>
				) : null}
				{!logLoading && selectedJobId === null ? (
					<p className="text-muted-foreground text-xs/relaxed">
						Select a job to load its full log output.
					</p>
				) : null}
				{!logLoading && selectedJobId !== null && logText === null ? (
					<p className="text-muted-foreground text-xs/relaxed">
						Log not found for this job.
					</p>
				) : null}
				{!logLoading && logText !== null ? (
					<ScrollArea className="h-[min(420px,50vh)] wrap-break-word rounded-none border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
						{logPreview.length > 0 ? logPreview : "(empty log)"}
						<div ref={logEndRef} aria-hidden />
					</ScrollArea>
				) : null}
			</div>
		</div>
	);
}
