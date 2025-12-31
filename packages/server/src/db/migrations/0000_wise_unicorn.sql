CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`piece_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`measure_start` integer NOT NULL,
	`measure_end` integer NOT NULL,
	`hand` text NOT NULL,
	`tempo` integer NOT NULL,
	`note_accuracy` real NOT NULL,
	`timing_accuracy` real NOT NULL,
	`combined_score` real NOT NULL,
	FOREIGN KEY (`piece_id`) REFERENCES `pieces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pieces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`composer` text,
	`file_path` text NOT NULL,
	`total_measures` integer NOT NULL,
	`difficulty` text,
	`notes_json` text NOT NULL,
	`added_at` text NOT NULL
);
