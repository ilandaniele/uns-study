ALTER TABLE "user_profiles" ADD COLUMN "alias" text;--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_alias_lower_unique" ON "user_profiles" USING btree (lower("alias"));