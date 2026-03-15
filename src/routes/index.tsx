import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/")({ component: App });

const YT_DLP_PATH = path.join(process.cwd(), "resources", "bin", "yt-dlp");
const OUTPUT_TEMPLATE = path.join(
	os.homedir(),
	"Downloads",
	"%(title)s.%(ext)s",
);

const syncPlaylist = createServerFn({
	method: "POST",
})
	.inputValidator((data: { playlistId: string }) => data)
	.handler(async ({ data }) => {
		return new Promise<{ success: true }>((resolve, reject) => {
			const proc = spawn(YT_DLP_PATH, ["-o", OUTPUT_TEMPLATE, data.playlistId]);

			let stderr = "";
			proc.stderr?.on("data", (chunk) => {
				stderr += chunk.toString();
			});

			proc.on("close", (code) => {
				if (code === 0) {
					resolve({ success: true });
				} else {
					reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
				}
			});

			proc.on("error", (err) => {
				reject(err);
				console.error(err);
			});
		});
	});

function App() {
	const [value, setValue] = useState("");

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setValue(e.target.value);
	};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		await syncPlaylist({ data: { playlistId: value } });
	};

	return (
		<main>
			<form onSubmit={handleSubmit}>
				<input
					className="border border-green-300 rounded-md p-2"
					type="text"
					value={value}
					onChange={handleChange}
				/>

				<Button type="submit">Sync</Button>
			</form>
		</main>
	);
}
