import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { formatRelativeShort } from "#/lib/formatters";

type AppSettingsShape = {
	auto_sync_enabled: boolean;
	auto_sync_interval_hours: number;
	last_global_sync_started_at: string | null;
};

type AppSettingsCardProps = {
	settings: AppSettingsShape | null | undefined;
	onUpdate: (patch: {
		auto_sync_enabled: boolean;
		auto_sync_interval_hours: number;
	}) => Promise<void>;
	onSyncAllNow: () => Promise<void>;
	disabled?: boolean;
};

export function AppSettingsCard({
	settings,
	onUpdate,
	onSyncAllNow,
	disabled = false,
}: AppSettingsCardProps) {
	const enabled = settings?.auto_sync_enabled === true;
	const hours = settings?.auto_sync_interval_hours ?? 1;
	const [localHours, setLocalHours] = useState(String(hours));

	useEffect(() => {
		setLocalHours(String(settings?.auto_sync_interval_hours ?? 1));
	}, [settings?.auto_sync_interval_hours]);
	const [pendingSettings, setPendingSettings] = useState(false);
	const [pendingSync, setPendingSync] = useState(false);

	const handleToggle = async (next: boolean) => {
		setPendingSettings(true);
		try {
			const parsed = Number.parseInt(localHours, 10);
			const interval = Number.isFinite(parsed) ? parsed : hours;
			await onUpdate({
				auto_sync_enabled: next,
				auto_sync_interval_hours: interval,
			});
		} finally {
			setPendingSettings(false);
		}
	};

	const handleSaveInterval = async () => {
		setPendingSettings(true);
		try {
			const parsed = Number.parseInt(localHours, 10);
			const interval = Number.isFinite(parsed) ? parsed : 1;
			await onUpdate({
				auto_sync_enabled: enabled,
				auto_sync_interval_hours: Math.max(1, interval),
			});
		} finally {
			setPendingSettings(false);
		}
	};

	const handleSyncAll = async () => {
		setPendingSync(true);
		try {
			await onSyncAllNow();
		} finally {
			setPendingSync(false);
		}
	};

	const isBusy = disabled || pendingSettings || pendingSync;
	const parsedInterval = Number.parseInt(localHours, 10);
	const summaryInterval = Number.isFinite(parsedInterval)
		? Math.max(1, parsedInterval)
		: hours;
	const scheduleSummary = enabled
		? `Auto sync runs every ${summaryInterval} hour${summaryInterval === 1 ? "" : "s"} after the last global sync (startup, manual, or automatic).`
		: "Auto sync is off. Use Sync all now or wait for the next app startup sync.";

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sync settings</CardTitle>
				<CardDescription>
					Auto sync runs in whole hours only (minimum 1). Manual sync resets the
					timer for the next automatic run. Last global sync:{" "}
					{formatRelativeShort(settings?.last_global_sync_started_at)}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<p className="text-muted-foreground text-xs/relaxed">
					{scheduleSummary}
				</p>
				<div className="flex items-center justify-between gap-4">
					<div className="flex flex-col gap-1">
						<Label htmlFor="auto-sync">Auto sync</Label>
						<p className="text-muted-foreground text-xs/relaxed">
							When enabled, all sources sync on the configured interval after
							the last global sync.
						</p>
					</div>
					<Switch
						id="auto-sync"
						checked={enabled}
						onCheckedChange={(v) => void handleToggle(v)}
						disabled={isBusy}
					/>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
					<div className="flex flex-1 flex-col gap-2">
						<Label htmlFor="interval-hours">Interval (hours)</Label>
						<Input
							id="interval-hours"
							type="number"
							min={1}
							step={1}
							value={localHours}
							onChange={(e) => setLocalHours(e.target.value)}
							disabled={isBusy}
						/>
					</div>
					<Button
						type="button"
						variant="secondary"
						onClick={() => void handleSaveInterval()}
						disabled={isBusy}
					>
						Save interval
					</Button>
				</div>
				<Button
					type="button"
					onClick={() => void handleSyncAll()}
					disabled={isBusy}
				>
					{pendingSync ? "Starting…" : "Sync all now"}
				</Button>
			</CardContent>
		</Card>
	);
}
