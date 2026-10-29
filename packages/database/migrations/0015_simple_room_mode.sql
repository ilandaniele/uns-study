CREATE TABLE `room_seat_calibrations` (
	`room_id` text PRIMARY KEY NOT NULL,
	`calibration` text NOT NULL,
	`layout_hash` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_room_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'COMMON' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
