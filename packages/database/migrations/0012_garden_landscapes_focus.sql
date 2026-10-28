CREATE TABLE `user_focus` (
	`user_id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`state` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user_gardens` ADD `plot_count` integer DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_gardens` ADD `landscape_seed` integer DEFAULT 0 NOT NULL;