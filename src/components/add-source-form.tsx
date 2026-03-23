import { type FormEvent, useState } from "react";
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

type AddSourceFormProps = {
	onAdd: (url: string) => Promise<void>;
	disabled?: boolean;
};

export function AddSourceForm({ onAdd, disabled = false }: AddSourceFormProps) {
	const [url, setUrl] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const trimmed = url.trim();
		if (!trimmed) {
			return;
		}
		setError(null);
		setPending(true);
		try {
			await onAdd(trimmed);
			setUrl("");
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to add source";
			setError(message);
		} finally {
			setPending(false);
		}
	};

	const isBusy = pending || disabled;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Add source</CardTitle>
				<CardDescription>
					Paste a YouTube playlist or channel URL. The app will inspect it with
					yt-dlp before saving.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="flex flex-col gap-3" onSubmit={handleSubmit}>
					<div className="flex flex-col gap-2">
						<Label htmlFor="source-url">URL</Label>
						<Input
							id="source-url"
							name="url"
							placeholder="https://www.youtube.com/playlist?list=…"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							disabled={isBusy}
							autoComplete="off"
						/>
					</div>
					{error ? (
						<p className="text-destructive text-xs/relaxed" role="alert">
							{error}
						</p>
					) : null}
					<Button type="submit" disabled={isBusy}>
						{pending ? "Adding…" : "Add source"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
