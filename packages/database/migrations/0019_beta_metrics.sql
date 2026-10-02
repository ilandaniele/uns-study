CREATE TABLE "room_daily_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"day" date NOT NULL,
	"fresh_seat_coverage" real DEFAULT 0 NOT NULL,
	"check_ins" integer DEFAULT 0 NOT NULL,
	"observations" integer DEFAULT 0 NOT NULL,
	"active_users" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room_qr_codes" ADD COLUMN "scan_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_qr_codes" ADD COLUMN "last_scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "room_daily_stats" ADD CONSTRAINT "room_daily_stats_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_room_daily_stats_room_day" ON "room_daily_stats" USING btree ("room_id","day");