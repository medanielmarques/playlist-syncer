import type { InferSelectModel } from "drizzle-orm";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";
import { RadioGroup, RadioGroupItem } from "#/components/ui/radio-group";
import type { sources } from "#/db/schema";
import type { RemoveSourceMode } from "#/lib/server/source-service";

type SourceRow = InferSelectModel<typeof sources>;

type RemoveSourceDialogProps = {
	source: SourceRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (sourceId: number, mode: RemoveSourceMode) => Promise<void>;
};

export function RemoveSourceDialog({
	source,
	open,
	onOpenChange,
	onConfirm,
}: RemoveSourceDialogProps) {
	const [mode, setMode] = useState<RemoveSourceMode>("app-only");
	const [pending, setPending] = useState(false);

	const handleOpenChange = (next: boolean) => {
		if (!next) {
			setMode("app-only");
		}
		onOpenChange(next);
	};

	const handleConfirm = async () => {
		if (!source) {
			return;
		}
		setPending(true);
		try {
			await onConfirm(source.id, mode);
			handleOpenChange(false);
		} finally {
			setPending(false);
		}
	};

	const sourceLabel = source?.title ?? source?.normalized_url ?? "this source";

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md" showCloseButton={!pending}>
				<DialogHeader>
					<DialogTitle>Remove source</DialogTitle>
					<DialogDescription>
						You are about to remove <strong>{sourceLabel}</strong> from the app.
						Choose whether to keep downloaded files and the archive on disk.
					</DialogDescription>
				</DialogHeader>
				<RadioGroup
					className="flex flex-col gap-3"
					value={mode}
					onValueChange={(v) => setMode(v as RemoveSourceMode)}
					disabled={pending}
				>
					<div className="flex items-start gap-3">
						<RadioGroupItem value="app-only" id="remove-app-only" />
						<div className="flex flex-col gap-1">
							<Label htmlFor="remove-app-only" className="font-medium">
								Remove from app only
							</Label>
							<p className="text-muted-foreground text-xs/relaxed">
								Deletes database records (sources, jobs, videos). Leaves the
								folder under ~/playlist-syncer and the archive file unchanged.
							</p>
						</div>
					</div>
					<div className="flex items-start gap-3">
						<RadioGroupItem value="app-and-files" id="remove-app-and-files" />
						<div className="flex flex-col gap-1">
							<Label htmlFor="remove-app-and-files" className="font-medium">
								Remove from app and delete files
							</Label>
							<p className="text-muted-foreground text-xs/relaxed">
								Deletes database records and removes the source download folder
								and its download-archive file. This cannot be undone.
							</p>
						</div>
					</div>
				</RadioGroup>
				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						type="button"
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={pending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={() => void handleConfirm()}
						disabled={pending || !source}
					>
						{pending ? "Removing…" : "Confirm removal"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
