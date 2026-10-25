CREATE TABLE `user_gardens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`spent_seeds` integer DEFAULT 0 NOT NULL,
	`bonus_seeds` integer DEFAULT 0 NOT NULL,
	`plants` text DEFAULT '[]' NOT NULL,
	`collection` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
