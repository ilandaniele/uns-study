CREATE INDEX "idx_session_user_id" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_check_ins_room_created" ON "check_ins" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_seat_observations_room_expires" ON "seat_observations" USING btree ("room_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_seat_observations_room_created" ON "seat_observations" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_announcements_room_starts" ON "announcements" USING btree ("room_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_user_blocks_blocked" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "idx_seat_disputes_room_status" ON "seat_disputes" USING btree ("room_id","status");