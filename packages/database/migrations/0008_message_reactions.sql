CREATE TABLE `message_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`chat_message_id` text,
	`direct_message_id` text,
	`group_message_id` text,
	`emoji` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`direct_message_id`) REFERENCES `direct_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_message_id`) REFERENCES `group_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_reaction_one_message" CHECK(("message_reactions"."chat_message_id" is not null) + ("message_reactions"."direct_message_id" is not null) + ("message_reactions"."group_message_id" is not null) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reaction_chat_user` ON `message_reactions` (`chat_message_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reaction_direct_user` ON `message_reactions` (`direct_message_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reaction_group_user` ON `message_reactions` (`group_message_id`,`user_id`);