CREATE INDEX "idx_account_user_id" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_account_provider_account" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "idx_user_created_at" ON "user" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_check_ins_active_expires" ON "check_ins" USING btree ("expires_at") WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "idx_check_ins_user_created" ON "check_ins" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_study_status_room_active" ON "study_status" USING btree ("room_id") WHERE active;--> statement-breakpoint
CREATE INDEX "idx_rate_limit_hits_window_start" ON "rate_limit_hits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "idx_moderation_actions_created" ON "moderation_actions" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_user_report_attachments_report" ON "user_report_attachments" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "idx_user_report_attachments_status_created" ON "user_report_attachments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_reports_created" ON "user_reports" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_direct_conversations_user_a_last" ON "direct_conversations" USING btree ("user_a","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_direct_conversations_user_b_last" ON "direct_conversations" USING btree ("user_b","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_seat_disputes_seat_resolved" ON "seat_disputes" USING btree ("seat_id","resolved_at");--> statement-breakpoint
CREATE INDEX "idx_notification_preferences_seat_freed" ON "notification_preferences" USING btree ("user_id") WHERE seat_freed;--> statement-breakpoint
CREATE INDEX "idx_notification_preferences_admin_present" ON "notification_preferences" USING btree ("user_id") WHERE admin_present;