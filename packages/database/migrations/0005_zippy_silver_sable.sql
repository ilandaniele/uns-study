CREATE TYPE "public"."dispute_kind" AS ENUM('CLAIM', 'ABSENT', 'SAVED');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('OPEN', 'RESOLVED_ABSENT', 'RESOLVED_PRESENT', 'TIED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."dispute_vote" AS ENUM('ABSENT', 'PRESENT');--> statement-breakpoint
CREATE TABLE "seat_dispute_votes" (
	"dispute_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"vote" "dispute_vote" NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seat_dispute_votes_dispute_id_user_id_pk" PRIMARY KEY("dispute_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "seat_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"check_in_id" uuid,
	"incumbent_user_id" text,
	"opener_user_id" text NOT NULL,
	"kind" "dispute_kind" NOT NULL,
	"status" "dispute_status" DEFAULT 'OPEN' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"location_accuracy_m" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seat_dispute_votes" ADD CONSTRAINT "seat_dispute_votes_dispute_id_seat_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."seat_disputes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_dispute_votes" ADD CONSTRAINT "seat_dispute_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_disputes" ADD CONSTRAINT "seat_disputes_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_disputes" ADD CONSTRAINT "seat_disputes_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_disputes" ADD CONSTRAINT "seat_disputes_check_in_id_check_ins_id_fk" FOREIGN KEY ("check_in_id") REFERENCES "public"."check_ins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_disputes" ADD CONSTRAINT "seat_disputes_incumbent_user_id_user_id_fk" FOREIGN KEY ("incumbent_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_disputes" ADD CONSTRAINT "seat_disputes_opener_user_id_user_id_fk" FOREIGN KEY ("opener_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dispute_open_seat" ON "seat_disputes" USING btree ("seat_id") WHERE status = 'OPEN';--> statement-breakpoint
CREATE INDEX "idx_seat_disputes_closes_at" ON "seat_disputes" USING btree ("closes_at") WHERE status = 'OPEN';--> statement-breakpoint
CREATE INDEX "idx_seat_disputes_room" ON "seat_disputes" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "idx_seat_disputes_check_in" ON "seat_disputes" USING btree ("check_in_id");