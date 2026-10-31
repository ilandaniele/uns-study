CREATE TABLE `collaboration_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`local_date` text NOT NULL,
	`places` integer NOT NULL,
	`seeds` integer NOT NULL,
	`earned_at` integer NOT NULL,
	`pro_expires_at` integer NOT NULL,
	`seen_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_collaboration_rewards_user_day` ON `collaboration_rewards` (`user_id`,`local_date`);--> statement-breakpoint
CREATE INDEX `idx_collaboration_rewards_user_earned` ON `collaboration_rewards` (`user_id`,`earned_at`);