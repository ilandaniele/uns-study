CREATE TABLE `check_in_monitors` (
	`check_in_id` text PRIMARY KEY NOT NULL,
	`counting_from` integer,
	`verified_until` integer NOT NULL,
	`last_sample_at` integer NOT NULL,
	`outside_since` integer,
	`device_id` text,
	FOREIGN KEY (`check_in_id`) REFERENCES `check_ins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_check_in_monitors_outside` ON `check_in_monitors` (`outside_since`);--> statement-breakpoint
CREATE TABLE `check_in_study_spans` (
	`id` text PRIMARY KEY NOT NULL,
	`check_in_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	FOREIGN KEY (`check_in_id`) REFERENCES `check_ins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_check_in_study_spans_checkin` ON `check_in_study_spans` (`check_in_id`);--> statement-breakpoint
ALTER TABLE `room_qr_codes` ADD `seat_id` text REFERENCES seats(id);
--> statement-breakpoint
-- Start monitoring existing live stays from deployment, retaining earlier earned time.
INSERT INTO check_in_monitors(check_in_id, counting_from, verified_until, last_sample_at)
SELECT id, started_at, CAST(strftime('%s','now') AS INTEGER)*1000+300000, CAST(strftime('%s','now') AS INTEGER)*1000
FROM check_ins WHERE status='ACTIVE' AND expires_at>CAST(strftime('%s','now') AS INTEGER)*1000;
