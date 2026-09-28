ALTER TABLE "check_ins" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "verification_confidence" real;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "verifier_model" text;--> statement-breakpoint
ALTER TABLE "check_ins" ADD COLUMN "verification_photo_sha256" text;--> statement-breakpoint
CREATE INDEX "idx_check_ins_verification_photo_sha256" ON "check_ins" USING btree ("verification_photo_sha256");