CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_account_user_id` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_account_provider_account` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `idx_session_user_id` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE INDEX `idx_user_created_at` ON `user` (`created_at`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `room_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`type` text NOT NULL,
	`nickname` text,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`width` real NOT NULL,
	`height` real NOT NULL,
	`rotation` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_room_tables_room_code` ON `room_tables` (`room_id`,`code`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`geofence_radius_m` integer NOT NULL,
	`timezone` text NOT NULL,
	`daily_reset_time` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_reset_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_slug_unique` ON `rooms` (`slug`);--> statement-breakpoint
CREATE TABLE `seat_current_state` (
	`seat_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'UNKNOWN' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`source_summary` text,
	`last_updated_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`seat_id`) REFERENCES `seats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_seat_current_state_status` ON `seat_current_state` (`status`);--> statement-breakpoint
CREATE TABLE `seats` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`table_id` text NOT NULL,
	`code` text NOT NULL,
	`seat_number` integer NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`rotation` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`table_id`) REFERENCES `room_tables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_seats_room_code` ON `seats` (`room_id`,`code`);--> statement-breakpoint
CREATE INDEX `idx_seats_room_id` ON `seats` (`room_id`);--> statement-breakpoint
CREATE TABLE `check_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`seat_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`show_identity` integer DEFAULT false NOT NULL,
	`presence_verified` integer DEFAULT false NOT NULL,
	`location_accuracy_m` real,
	`started_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ended_at` integer,
	`verified_at` integer,
	`verification_confidence` real,
	`verifier_model` text,
	`verification_photo_sha256` text,
	`expiry_reminder_sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seat_id`) REFERENCES `seats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_checkin_active_user` ON `check_ins` (`user_id`) WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX `uq_checkin_active_seat` ON `check_ins` (`seat_id`) WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX `idx_check_ins_user_status` ON `check_ins` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_check_ins_seat_status` ON `check_ins` (`seat_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_check_ins_room_status` ON `check_ins` (`room_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_check_ins_expires_at` ON `check_ins` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_check_ins_room_created` ON `check_ins` (`room_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_check_ins_active_expires` ON `check_ins` (`expires_at`) WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX `idx_check_ins_user_created` ON `check_ins` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_check_ins_verification_photo_sha256` ON `check_ins` (`verification_photo_sha256`) WHERE verification_photo_sha256 is not null;--> statement-breakpoint
CREATE TABLE `seat_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`seat_id` text NOT NULL,
	`observed_status` text NOT NULL,
	`presence_verified` integer DEFAULT false NOT NULL,
	`qr_verified` integer DEFAULT false NOT NULL,
	`admin_override` integer DEFAULT false NOT NULL,
	`confidence_weight` real DEFAULT 1 NOT NULL,
	`observed_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seat_id`) REFERENCES `seats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_seat_observations_seat_expires` ON `seat_observations` (`seat_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_seat_observations_user_created` ON `seat_observations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_seat_observations_room_expires` ON `seat_observations` (`room_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_seat_observations_room_created` ON `seat_observations` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `seat_state_events` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`seat_id` text NOT NULL,
	`user_id` text,
	`event_type` text NOT NULL,
	`old_status` text,
	`new_status` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seat_id`) REFERENCES `seats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_seat_state_events_room_created` ON `seat_state_events` (`room_id`,"created_at" desc);--> statement-breakpoint
CREATE TABLE `presence_grants` (
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`granted_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `room_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `study_status` (
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`subject` text,
	`message` text,
	`looking_for_group` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `room_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_study_status_room_active` ON `study_status` (`room_id`) WHERE active = 1;--> statement-breakpoint
CREATE TABLE `user_room_presence` (
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`presence_verified` integer DEFAULT false NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`user_id`, `room_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`event_type` text NOT NULL,
	`ip_hash` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_security_events_user_created` ON `security_events` (`user_id`,"created_at" desc);--> statement-breakpoint
CREATE TABLE `rate_limit_hits` (
	`key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`key`, `window_start`)
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limit_hits_window_start` ON `rate_limit_hits` (`window_start`);--> statement-breakpoint
CREATE TABLE `retired_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`alias` text NOT NULL,
	`alias_lower` text NOT NULL,
	`retired_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `retired_aliases_alias_lower_unique` ON `retired_aliases` (`alias_lower`);--> statement-breakpoint
CREATE TABLE `user_privacy_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`show_full_name` integer DEFAULT false NOT NULL,
	`show_nickname` integer DEFAULT false NOT NULL,
	`show_career` integer DEFAULT false NOT NULL,
	`show_current_subject` integer DEFAULT false NOT NULL,
	`show_instagram` integer DEFAULT false NOT NULL,
	`show_student_number` integer DEFAULT false NOT NULL,
	`show_avatar` integer DEFAULT false NOT NULL,
	`show_in_room` integer DEFAULT false NOT NULL,
	`show_seat` integer DEFAULT false NOT NULL,
	`allow_direct_messages` integer DEFAULT true NOT NULL,
	`show_in_ranking` integer DEFAULT true NOT NULL,
	`show_alias_animal_on_map` integer DEFAULT true NOT NULL,
	`show_admin_badge` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`first_name` text,
	`last_name` text,
	`nickname` text,
	`avatar_url` text,
	`career` text,
	`current_subject` text,
	`bio` text,
	`instagram` text,
	`student_number` text,
	`identity_mode` text DEFAULT 'HIDDEN' NOT NULL,
	`custom_name` text,
	`alias` text,
	`alias_lower` text,
	`alias_animal` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_alias_lower_unique` ON `user_profiles` (`alias_lower`);--> statement-breakpoint
CREATE TABLE `user_reputation` (
	`user_id` text PRIMARY KEY NOT NULL,
	`observation_score` real DEFAULT 0 NOT NULL,
	`attendance_score` real DEFAULT 0 NOT NULL,
	`spam_score` real DEFAULT 0 NOT NULL,
	`confirmed_observations` integer DEFAULT 0 NOT NULL,
	`rejected_observations` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `role`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_announcements_room_starts` ON `announcements` (`room_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `moderation_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`target_user_id` text,
	`report_id` text,
	`action` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`report_id`) REFERENCES `user_reports`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_moderation_actions_created` ON `moderation_actions` ("created_at" desc);--> statement-breakpoint
CREATE TABLE `user_blocks` (
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`blocker_id`, `blocked_id`),
	FOREIGN KEY (`blocker_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_user_blocks_not_self" CHECK("user_blocks"."blocker_id" <> "user_blocks"."blocked_id")
);
--> statement-breakpoint
CREATE INDEX `idx_user_blocks_blocked` ON `user_blocks` (`blocked_id`);--> statement-breakpoint
CREATE TABLE `user_report_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `user_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_report_attachments_object_key_unique` ON `user_report_attachments` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_user_report_attachments_report` ON `user_report_attachments` (`report_id`);--> statement-breakpoint
CREATE INDEX `idx_user_report_attachments_status_created` ON `user_report_attachments` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text,
	`reported_user_id` text,
	`room_id` text,
	`reason` text NOT NULL,
	`description` text,
	`context` text NOT NULL,
	`context_message_id` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	FOREIGN KEY (`reporter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reported_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_user_reports_status_created` ON `user_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_user_reports_reporter_created` ON `user_reports` (`reporter_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_user_reports_created` ON `user_reports` ("created_at" desc);--> statement-breakpoint
CREATE TABLE `user_restrictions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`reason` text NOT NULL,
	`until` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`lifted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_user_restrictions_user` ON `user_restrictions` (`user_id`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chat_room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_room_created` ON `chat_messages` (`chat_room_id`,"created_at" desc);--> statement-breakpoint
CREATE TABLE `chat_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_chat_rooms_room_slug` ON `chat_rooms` (`room_id`,`slug`);--> statement-breakpoint
CREATE TABLE `direct_conversation_reads` (
	`conversation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_read_at` integer NOT NULL,
	PRIMARY KEY(`conversation_id`, `user_id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `direct_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `direct_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_a` text NOT NULL,
	`user_b` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_message_at` integer NOT NULL,
	FOREIGN KEY (`user_a`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_b`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_direct_conversations_ordered" CHECK("direct_conversations"."user_a" < "direct_conversations"."user_b")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_direct_conversations_pair` ON `direct_conversations` (`user_a`,`user_b`);--> statement-breakpoint
CREATE INDEX `idx_direct_conversations_user_a_last` ON `direct_conversations` (`user_a`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `idx_direct_conversations_user_b_last` ON `direct_conversations` (`user_b`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `direct_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`content` text NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `direct_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_direct_messages_conversation_created` ON `direct_messages` (`conversation_id`,"created_at" desc);--> statement-breakpoint
CREATE TABLE `room_daily_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`day` text NOT NULL,
	`fresh_seat_coverage` real DEFAULT 0 NOT NULL,
	`check_ins` integer DEFAULT 0 NOT NULL,
	`observations` integer DEFAULT 0 NOT NULL,
	`active_users` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_room_daily_stats_room_day` ON `room_daily_stats` (`room_id`,`day`);--> statement-breakpoint
CREATE TABLE `room_daily_visitors` (
	`room_id` text NOT NULL,
	`local_date` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`room_id`, `local_date`, `visitor_hash`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `room_qr_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`table_id` text,
	`token` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`scan_count` integer DEFAULT 0 NOT NULL,
	`last_scanned_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_qr_codes_token_unique` ON `room_qr_codes` (`token`);--> statement-breakpoint
CREATE TABLE `study_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`check_in_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`verified_minutes` integer NOT NULL,
	`local_date` text NOT NULL,
	`source` text DEFAULT 'CHECK_IN' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_sessions_check_in_id_unique` ON `study_sessions` (`check_in_id`);--> statement-breakpoint
CREATE INDEX `idx_study_sessions_user_local_date` ON `study_sessions` (`user_id`,`local_date`);--> statement-breakpoint
CREATE INDEX `idx_study_sessions_room_local_date` ON `study_sessions` (`room_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `seat_dispute_votes` (
	`dispute_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vote` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`dispute_id`, `user_id`),
	FOREIGN KEY (`dispute_id`) REFERENCES `seat_disputes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `seat_disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`seat_id` text NOT NULL,
	`check_in_id` text,
	`incumbent_user_id` text,
	`opener_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`opened_at` integer NOT NULL,
	`closes_at` integer NOT NULL,
	`resolved_at` integer,
	`location_accuracy_m` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seat_id`) REFERENCES `seats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`check_in_id`) REFERENCES `check_ins`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`incumbent_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`opener_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_dispute_open_seat` ON `seat_disputes` (`seat_id`) WHERE status = 'OPEN';--> statement-breakpoint
CREATE INDEX `idx_seat_disputes_closes_at` ON `seat_disputes` (`closes_at`) WHERE status = 'OPEN';--> statement-breakpoint
CREATE INDEX `idx_seat_disputes_room` ON `seat_disputes` (`room_id`);--> statement-breakpoint
CREATE INDEX `idx_seat_disputes_room_status` ON `seat_disputes` (`room_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_seat_disputes_check_in` ON `seat_disputes` (`check_in_id`);--> statement-breakpoint
CREATE INDEX `idx_seat_disputes_seat_resolved` ON `seat_disputes` (`seat_id`,`resolved_at`);--> statement-breakpoint
CREATE TABLE `user_avatars` (
	`user_id` text PRIMARY KEY NOT NULL,
	`mime_type` text NOT NULL,
	`bytes` blob NOT NULL,
	`sha256` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `table_name_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`table_id` text NOT NULL,
	`name` text NOT NULL,
	`name_lower` text NOT NULL,
	`proposer_user_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`table_id`) REFERENCES `room_tables`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposer_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_table_name_proposals_active` ON `table_name_proposals` (`table_id`,`name_lower`) WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX `idx_table_name_proposals_table` ON `table_name_proposals` (`table_id`);--> statement-breakpoint
CREATE INDEX `idx_table_name_proposals_proposer` ON `table_name_proposals` (`proposer_user_id`);--> statement-breakpoint
CREATE TABLE `table_name_votes` (
	`proposal_id` text NOT NULL,
	`table_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`proposal_id`, `user_id`),
	FOREIGN KEY (`proposal_id`) REFERENCES `table_name_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`table_id`) REFERENCES `room_tables`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_table_name_votes_table_user` ON `table_name_votes` (`table_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_table_name_votes_proposal` ON `table_name_votes` (`proposal_id`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`seat_freed` integer DEFAULT false NOT NULL,
	`admin_present` integer DEFAULT false NOT NULL,
	`checkin_expiry` integer DEFAULT true NOT NULL,
	`marketing_emails` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notification_preferences_seat_freed` ON `notification_preferences` (`user_id`) WHERE seat_freed = 1;--> statement-breakpoint
CREATE INDEX `idx_notification_preferences_admin_present` ON `notification_preferences` (`user_id`) WHERE admin_present = 1;--> statement-breakpoint
CREATE TABLE `notification_throttles` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`last_notified_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `type`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`last_success_at` integer,
	`failure_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_push_subscriptions_endpoint` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_user` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_subscriptions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'mercadopago' NOT NULL,
	`provider_subscription_id` text NOT NULL,
	`status` text NOT NULL,
	`current_period_end` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_user_subscriptions_provider_id` ON `user_subscriptions` (`provider_subscription_id`);--> statement-breakpoint
CREATE TABLE `email_campaign_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`claimed_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sent_at` integer,
	`error` text,
	`provider_message_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `email_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_email_deliveries_campaign_user` ON `email_campaign_deliveries` (`campaign_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_email_deliveries_status` ON `email_campaign_deliveries` (`status`,`campaign_id`);--> statement-breakpoint
CREATE TABLE `email_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`body_text` text NOT NULL,
	`audience` text DEFAULT 'all' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`recipient_count` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `group_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_message_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`joined_at` integer NOT NULL,
	`last_read_at` integer,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `group_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_group_members_role" CHECK("group_members"."role" in ('OWNER','MEMBER'))
);
--> statement-breakpoint
CREATE INDEX `idx_group_members_user` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `group_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`content` text NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `group_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_group_messages_group_created` ON `group_messages` (`group_id`,"created_at" desc);--> statement-breakpoint
CREATE TABLE `scheduled_jobs` (
	`key` text PRIMARY KEY NOT NULL,
	`due_at` integer NOT NULL,
	`interval_ms` integer,
	`payload` text
);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_jobs_due_at` ON `scheduled_jobs` (`due_at`);