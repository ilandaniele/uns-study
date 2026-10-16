CREATE TABLE `quiet_room_watches` (
	`user_id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`threshold_pct` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_quiet_room_watches_room_expires` ON `quiet_room_watches` (`room_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `user_cosmetics` (
	`user_id` text PRIMARY KEY NOT NULL,
	`frame` text NOT NULL,
	`name_color` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
