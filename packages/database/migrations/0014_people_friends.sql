CREATE TABLE `friendships` (
	`id` text PRIMARY KEY NOT NULL,
	`lower_user_id` text NOT NULL,
	`upper_user_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`status` text NOT NULL,
	`lower_alias_only` integer DEFAULT false NOT NULL,
	`upper_alias_only` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`lower_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`upper_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "friendships_ordered_pair" CHECK("friendships"."lower_user_id" < "friendships"."upper_user_id"),
	CONSTRAINT "friendships_sender_member" CHECK("friendships"."requested_by" IN ("friendships"."lower_user_id", "friendships"."upper_user_id")),
	CONSTRAINT "friendships_status" CHECK("friendships"."status" IN ('PENDING', 'ACCEPTED', 'CLOSED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friendships_pair_unique` ON `friendships` (`lower_user_id`,`upper_user_id`);--> statement-breakpoint
CREATE INDEX `friendships_lower_status` ON `friendships` (`lower_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `friendships_upper_status` ON `friendships` (`upper_user_id`,`status`);--> statement-breakpoint
ALTER TABLE `user_privacy_settings` ADD `show_in_people_search` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user_privacy_settings` ADD `allow_friend_requests` integer DEFAULT true NOT NULL;