import { relations, sql } from "drizzle-orm";
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	url: text("url").notNull(),
	type: text("type", { enum: ["playlist", "channel", "user", "video"] }).notNull(),
	title: text("title"),
	archive_path: text("archive_path"),
	output_dir: text("output_dir"),
	created_at: text("created_at")
		.notNull()
		.default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const jobs = sqliteTable("jobs", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	source_id: integer("source_id")
		.notNull()
		.references(() => sources.id, { onDelete: "cascade" }),
	status: text("status", {
		enum: ["pending", "running", "completed", "failed"],
	})
		.notNull()
		.default("pending"),
	started_at: text("started_at"),
	finished_at: text("finished_at"),
	exit_code: integer("exit_code"),
	log_summary: text("log_summary"),
});

export const videos = sqliteTable(
	"videos",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		source_id: integer("source_id")
			.notNull()
			.references(() => sources.id, { onDelete: "cascade" }),
		video_id: text("video_id").notNull(),
		title: text("title"),
		uploader: text("uploader"),
		duration: integer("duration"),
		webpage_url: text("webpage_url"),
		thumbnail: text("thumbnail"),
		status: text("status", {
			enum: ["seen", "downloaded", "failed", "skipped"],
		})
			.notNull()
			.default("seen"),
		first_seen_at: text("first_seen_at")
			.notNull()
			.default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
		last_seen_at: text("last_seen_at")
			.notNull()
			.default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
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
