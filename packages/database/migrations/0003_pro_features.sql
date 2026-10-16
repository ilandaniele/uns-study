CREATE TABLE `favorite_seats` (
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`seat_ids` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `room_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `group_focus_timers` (
	`group_id` text PRIMARY KEY NOT NULL,
	`started_by` text NOT NULL,
	`minutes` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `group_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`started_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `group_seat_share_optouts` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `group_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `room_occupancy_forecast` (
	`room_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `seat_watches` (
	`user_id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`seat_ids` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_seat_watches_room_expires` ON `seat_watches` (`room_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `streak_freezes` (
	`user_id` text NOT NULL,
	`local_date` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `local_date`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `study_goals` (
	`user_id` text PRIMARY KEY NOT NULL,
	`weekly_goal_minutes` integer NOT NULL,
	`reminder_enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_exams` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subject` text NOT NULL,
	`exam_date` text NOT NULL,
	`target_hours` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_exams_user` ON `user_exams` (`user_id`);