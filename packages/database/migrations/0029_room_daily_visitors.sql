CREATE TABLE "room_daily_visitors" (
	"room_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"visitor_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_daily_visitors_room_id_local_date_visitor_hash_pk" PRIMARY KEY("room_id","local_date","visitor_hash")
);
--> statement-breakpoint
ALTER TABLE "room_daily_visitors" ADD CONSTRAINT "room_daily_visitors_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;