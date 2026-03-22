import { relations, sql } from "drizzle-orm";
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

const isoNow = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const appSettings = sqliteTable("app_settings", {
	id: integer("id").primaryKey(),
	auto_sync_enabled: integer("auto_sync_enabled", { mode: "boolean" })
		.notNull()
		.default(false),
	auto_sync_interval_hours: integer("auto_sync_interval_hours")
		.notNull()
		.default(1),
	last_global_sync_started_at: text("last_global_sync_started_at"),
	created_at: text("created_at").notNull().default(isoNow),
	updated_at: text("updated_at").notNull().default(isoNow),
});

export const sources = sqliteTable(
	"sources",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		source_type: text("source_type", {
			enum: ["playlist", "channel"],
		}).notNull(),
		original_url: text("original_url").notNull(),
		normalized_url: text("normalized_url").notNull(),
		external_id: text("external_id").notNull(),
		title: text("title"),
		folder_name: text("folder_name").notNull(),
		output_dir: text("output_dir").notNull(),
		archive_path: text("archive_path").notNull(),
		last_sync_started_at: text("last_sync_started_at"),
		last_sync_finished_at: text("last_sync_finished_at"),
		last_sync_status: text("last_sync_status", {
			enum: ["running", "completed", "failed"],
		}),
		last_sync_error: text("last_sync_error"),
		created_at: text("created_at").notNull().default(isoNow),
		updated_at: text("updated_at").notNull().default(isoNow),
	},
	(t) => [
		uniqueIndex("uq_sources_type_external").on(t.source_type, t.external_id),
	],
);

export const jobs = sqliteTable("jobs", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	source_id: integer("source_id")
		.notNull()
		.references(() => sources.id, { onDelete: "cascade" }),
	trigger: text("trigger", { enum: ["startup", "manual", "auto"] }).notNull(),
	status: text("status", {
		enum: ["pending", "running", "completed", "failed"],
	})
		.notNull()
		.default("pending"),
	started_at: text("started_at"),
	finished_at: text("finished_at"),
	exit_code: integer("exit_code"),
	log_text: text("log_text"),
	error_message: text("error_message"),
	total_entries: integer("total_entries"),
	downloaded_count: integer("downloaded_count"),
	already_downloaded_count: integer("already_downloaded_count"),
	failed_count: integer("failed_count"),
	unavailable_count: integer("unavailable_count"),
});

export const videos = sqliteTable(
	"videos",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		source_id: integer("source_id")
			.notNull()
			.references(() => sources.id, { onDelete: "cascade" }),
		video_id: text("video_id").notNull(),
		channel_id: text("channel_id"),
		playlist_index: integer("playlist_index"),
		title: text("title"),
		uploader: text("uploader"),
		duration: integer("duration"),
		webpage_url: text("webpage_url"),
		thumbnail: text("thumbnail"),
		is_unavailable: integer("is_unavailable", { mode: "boolean" })
			.notNull()
			.default(false),
		unavailable_kind: text("unavailable_kind"),
		unavailable_reason: text("unavailable_reason"),
		download_status: text("download_status", {
			enum: ["not_downloaded", "downloaded", "failed", "skipped"],
		})
			.notNull()
			.default("not_downloaded"),
		download_error: text("download_error"),
		local_file_path: text("local_file_path"),
		removed_from_source: integer("removed_from_source", { mode: "boolean" })
			.notNull()
			.default(false),
		first_seen_at: text("first_seen_at").notNull().default(isoNow),
		last_seen_at: text("last_seen_at").notNull().default(isoNow),
		last_job_id: integer("last_job_id").references(() => jobs.id, {
			onDelete: "set null",
		}),
	},
	(t) => [uniqueIndex("uq_videos_source_video").on(t.source_id, t.video_id)],
);

export const sourcesRelations = relations(sources, ({ many }) => ({
	jobs: many(jobs),
	videos: many(videos),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
	source: one(sources, { fields: [jobs.source_id], references: [sources.id] }),
	videos: many(videos),
}));

export const videosRelations = relations(videos, ({ one }) => ({
	source: one(sources, {
		fields: [videos.source_id],
		references: [sources.id],
	}),
	lastJob: one(jobs, {
		fields: [videos.last_job_id],
		references: [jobs.id],
	}),
}));
