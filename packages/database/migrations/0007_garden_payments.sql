CREATE TABLE `garden_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`seeds` integer NOT NULL,
	`price_ars` integer NOT NULL,
	`preference_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_garden_orders_user_created` ON `garden_orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `garden_payments` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`credited_seeds` integer NOT NULL,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `garden_orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_garden_payments_order` ON `garden_payments` (`order_id`);