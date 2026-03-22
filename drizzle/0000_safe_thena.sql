CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`auto_sync_enabled` integer DEFAULT false NOT NULL,
	`auto_sync_interval_hours` integer DEFAULT 1 NOT NULL,
	`last_global_sync_started_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`original_url` text NOT NULL,
	`normalized_url` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text,
	`folder_name` text NOT NULL,
	`output_dir` text NOT NULL,
	`archive_path` text NOT NULL,
	`last_sync_started_at` text,
	`last_sync_finished_at` text,
	`last_sync_status` text,
	`last_sync_error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sources_type_external` ON `sources` (`source_type`,`external_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` text,
	`finished_at` text,
	`exit_code` integer,
	`log_text` text,
	`error_message` text,
	`total_entries` integer,
	`downloaded_count` integer,
	`already_downloaded_count` integer,
	`failed_count` integer,
	`unavailable_count` integer,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`video_id` text NOT NULL,
	`channel_id` text,
	`playlist_index` integer,
	`title` text,
	`uploader` text,
	`duration` integer,
	`webpage_url` text,
	`thumbnail` text,
	`is_unavailable` integer DEFAULT false NOT NULL,
	`unavailable_kind` text,
	`unavailable_reason` text,
	`download_status` text DEFAULT 'not_downloaded' NOT NULL,
	`download_error` text,
	`local_file_path` text,
	`removed_from_source` integer DEFAULT false NOT NULL,
	`first_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_job_id` integer,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_videos_source_video` ON `videos` (`source_id`,`video_id`);
