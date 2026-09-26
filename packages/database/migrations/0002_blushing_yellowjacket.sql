ALTER TABLE "user_reports" DROP CONSTRAINT "user_reports_reporter_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_reports" DROP CONSTRAINT "user_reports_reported_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_reports" ALTER COLUMN "reporter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_reports" ALTER COLUMN "reported_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_user_id_user_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;