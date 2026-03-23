import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { InferSelectModel } from "drizzle-orm";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AddSourceForm } from "#/components/add-source-form";
import { AppSettingsCard } from "#/components/app-settings-card";
import { JobLogPanel } from "#/components/job-log-panel";
import { RemoveSourceDialog } from "#/components/remove-source-dialog";
import { SourceVideosTable } from "#/components/source-videos-table";
import { SourcesTable } from "#/components/sources-table";
import type { sources, videos } from "#/db/schema";
import {
	addSourceInputSchema,
	jobIdInputSchema,
	removeSourceInputSchema,
	sourceIdInputSchema,
	updateAppSettingsInputSchema,
} from "#/lib/schemas";
import type { RemoveSourceMode } from "#/lib/server/source-service";

const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
	const { loadDashboard } = await import(
		"#/lib/server/dashboard-route-handlers"
	);
	return loadDashboard();
});

const addSource = createServerFn({ method: "POST" })
	.inputValidator((data) => addSourceInputSchema.parse(data))
	.handler(async ({ data }) => {
		const { addSourceForDashboard } = await import(
			"#/lib/server/dashboard-route-handlers"
		);
		return addSourceForDashboard(data.url);
	});

const syncAllNow = createServerFn({ method: "POST" }).handler(async () => {
	const { syncAllNowForDashboard } = await import(
		"#/lib/server/dashboard-route-handlers"
	);
	return syncAllNowForDashboard();
});

const updateAppSettingsFn = createServerFn({ method: "POST" })
	.inputValidator((data) => updateAppSettingsInputSchema.parse(data))
	.handler(async ({ data }) => {
		const { updateAppSettingsForDashboard } = await import(
			"#/lib/server/dashboard-route-handlers"
		);
		return updateAppSettingsForDashboard(data);
	});

const getSourceVideos = createServerFn({ method: "POST" })
	.inputValidator((data) => sourceIdInputSchema.parse(data))
	.handler(async ({ data }) => {
		const { listVideosForDashboard } = await import(
			"#/lib/server/dashboard-route-handlers"
		);
		return listVideosForDashboard(data.sourceId);
	});

const getJobLog = createServerFn({ method: "POST" })
	.inputValidator((data) => jobIdInputSchema.parse(data))
	.handler(async ({ data }) => {
		const { getJobLogForDashboard } = await import(
			"#/lib/server/dashboard-route-handlers"
		);
		return getJobLogForDashboard(data.jobId);
	});

const removeSourceFn = createServerFn({ method: "POST" })
	.inputValidator((data) => removeSourceInputSchema.parse(data))
	.handler(async ({ data }) => {
		const { removeSourceForDashboard } = await import(
			"#/lib/server/dashboard-route-handlers"
		);
		return removeSourceForDashboard(data.sourceId, data.mode);
	});

export const Route = createFileRoute("/")({
	loader: async () => await getDashboard(),
	component: DashboardPage,
});

type SourceRow = InferSelectModel<typeof sources>;
type VideoRow = InferSelectModel<typeof videos>;

function DashboardPage() {
	const router = useRouter();
	const data = Route.useLoaderData();
	const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
	const [videosState, setVideosState] = useState<VideoRow[] | null>(null);
	const [videosLoading, setVideosLoading] = useState(false);
	const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
	const [jobLogText, setJobLogText] = useState<string | null>(null);
	const [jobLogLoading, setJobLogLoading] = useState(false);
	const [removeTarget, setRemoveTarget] = useState<SourceRow | null>(null);
	const [removeOpen, setRemoveOpen] = useState(false);

	const selectedSource = useMemo(() => {
		if (selectedSourceId === null) {
			return undefined;
		}
		return data.sources.find((s) => s.id === selectedSourceId);
	}, [data.sources, selectedSourceId]);

	const selectedSourceRunning = selectedSource?.last_sync_status === "running";

	const selectedJobMeta = useMemo(() => {
		if (selectedJobId === null) {
			return undefined;
		}
		return data.recentJobs.find((j) => j.id === selectedJobId);
	}, [data.recentJobs, selectedJobId]);

	const hasActivity = useMemo(() => {
		const jobRunning = data.recentJobs.some((j) => j.status === "running");
		const sourceRunning = data.sources.some(
			(s) => s.last_sync_status === "running",
		);
		return jobRunning || sourceRunning;
	}, [data.recentJobs, data.sources]);

	useEffect(() => {
		const intervalMs = hasActivity ? 1000 : 30_000;
		const id = window.setInterval(() => {
			void router.invalidate();
		}, intervalMs);
		return () => window.clearInterval(id);
	}, [hasActivity, router]);

	useEffect(() => {
		if (selectedSourceId === null) {
			setVideosState(null);
			return;
		}
		let cancelled = false;

		const loadVideos = (withSpinner: boolean) => {
			if (withSpinner) {
				setVideosLoading(true);
			}
			void getSourceVideos({ data: { sourceId: selectedSourceId } })
				.then((rows) => {
					if (!cancelled) {
						setVideosState(rows);
					}
				})
				.catch(() => {
					if (!cancelled) {
						setVideosState([]);
					}
				})
				.finally(() => {
					if (!cancelled && withSpinner) {
						setVideosLoading(false);
					}
				});
		};

		loadVideos(true);

		const pollVideos = selectedSourceRunning
			? window.setInterval(() => loadVideos(false), 1000)
			: null;

		return () => {
			cancelled = true;
			if (pollVideos !== null) {
				window.clearInterval(pollVideos);
			}
		};
	}, [selectedSourceId, selectedSourceRunning]);

	useEffect(() => {
		if (selectedJobId === null) {
			setJobLogText(null);
			return;
		}
		let cancelled = false;

		const loadLog = (withSpinner: boolean) => {
			if (withSpinner) {
				setJobLogLoading(true);
			}
			void getJobLog({ data: { jobId: selectedJobId } })
				.then((job) => {
					if (!cancelled) {
						setJobLogText(job.log_text ?? "");
					}
				})
				.catch(() => {
					if (!cancelled) {
						setJobLogText(null);
					}
				})
				.finally(() => {
					if (!cancelled && withSpinner) {
						setJobLogLoading(false);
					}
				});
		};

		loadLog(true);

		const jobRunning = selectedJobMeta?.status === "running";
		const pollLog = jobRunning
			? window.setInterval(() => loadLog(false), 1000)
			: null;

		return () => {
			cancelled = true;
			if (pollLog !== null) {
				window.clearInterval(pollLog);
			}
		};
	}, [selectedJobId, selectedJobMeta?.status]);

	const handleAddSource = useCallback(
		async (url: string) => {
			await addSource({ data: { url } });
			await router.invalidate();
		},
		[router],
	);

	const handleUpdateSettings = useCallback(
		async (patch: {
			auto_sync_enabled: boolean;
			auto_sync_interval_hours: number;
		}) => {
			await updateAppSettingsFn({ data: patch });
			await router.invalidate();
		},
		[router],
	);

	const handleSyncAllNow = useCallback(async () => {
		await syncAllNow();
		await router.invalidate();
	}, [router]);

	const handleRemoveConfirm = useCallback(
		async (sourceId: number, mode: RemoveSourceMode) => {
			await removeSourceFn({ data: { sourceId, mode } });
			if (selectedSourceId === sourceId) {
				setSelectedSourceId(null);
				setVideosState(null);
			}
			await router.invalidate();
		},
		[router, selectedSourceId],
	);

	const handleSelectJob = useCallback((jobId: number) => {
		setSelectedJobId(jobId);
	}, []);

	return (
		<div className="bg-background text-foreground min-h-screen">
			<div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
				<header className="flex flex-col gap-1">
					<h1 className="text-lg font-semibold tracking-tight">
						Playlist Syncer
					</h1>
					<p className="text-muted-foreground text-xs/relaxed">
						Local dashboard for YouTube playlists and channels. Downloads go to{" "}
						<code className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">
							~/playlist-syncer
						</code>
						.
					</p>
				</header>

				<div className="grid gap-6 lg:grid-cols-2">
					<AddSourceForm onAdd={handleAddSource} />
					<AppSettingsCard
						settings={data.settings ?? undefined}
						onUpdate={handleUpdateSettings}
						onSyncAllNow={handleSyncAllNow}
					/>
				</div>

				<SourcesTable
					sources={data.sources}
					selectedSourceId={selectedSourceId}
					onSelectSource={setSelectedSourceId}
					onRemoveClick={(s) => {
						setRemoveTarget(s);
						setRemoveOpen(true);
					}}
				/>

				<SourceVideosTable
					sourceTitle={selectedSource?.title ?? null}
					videos={videosState}
					loading={videosLoading}
				/>

				<JobLogPanel
					recentJobs={data.recentJobs}
					selectedJobId={selectedJobId}
					onSelectJob={handleSelectJob}
					logText={jobLogText}
					logLoading={jobLogLoading}
				/>

				<RemoveSourceDialog
					source={removeTarget}
					open={removeOpen}
					onOpenChange={setRemoveOpen}
					onConfirm={handleRemoveConfirm}
				/>
			</div>
		</div>
	);
}
