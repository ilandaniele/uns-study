CREATE TYPE "public"."table_name_proposal_status" AS ENUM('ACTIVE', 'REMOVED');--> statement-breakpoint
CREATE TABLE "table_name_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"name" text NOT NULL,
	"proposer_user_id" text NOT NULL,
	"status" "table_name_proposal_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_name_votes" (
	"proposal_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_name_votes_proposal_id_user_id_pk" PRIMARY KEY("proposal_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "room_tables" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "table_name_proposals" ADD CONSTRAINT "table_name_proposals_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_name_proposals" ADD CONSTRAINT "table_name_proposals_table_id_room_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."room_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_name_proposals" ADD CONSTRAINT "table_name_proposals_proposer_user_id_user_id_fk" FOREIGN KEY ("proposer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_name_votes" ADD CONSTRAINT "table_name_votes_proposal_id_table_name_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."table_name_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_name_votes" ADD CONSTRAINT "table_name_votes_table_id_room_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."room_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_name_votes" ADD CONSTRAINT "table_name_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_table_name_proposals_active" ON "table_name_proposals" USING btree ("table_id",lower("name")) WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "idx_table_name_proposals_table" ON "table_name_proposals" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "idx_table_name_proposals_proposer" ON "table_name_proposals" USING btree ("proposer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_table_name_votes_table_user" ON "table_name_votes" USING btree ("table_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_table_name_votes_proposal" ON "table_name_votes" USING btree ("proposal_id");