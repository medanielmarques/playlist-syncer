import { z } from "zod";

export const addSourceInputSchema = z.object({
	url: z.string().min(1),
});

export const removeSourceInputSchema = z.object({
	sourceId: z.number().int().positive(),
	mode: z.enum(["app-only", "app-and-files"]),
});

export const updateAppSettingsInputSchema = z.object({
	auto_sync_enabled: z.boolean(),
	auto_sync_interval_hours: z.coerce.number().int().min(1),
});

export const sourceIdInputSchema = z.object({
	sourceId: z.number().int().positive(),
});

export const jobIdInputSchema = z.object({
	jobId: z.number().int().positive(),
});
