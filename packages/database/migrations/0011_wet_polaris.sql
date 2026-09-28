CREATE TABLE "retired_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias" text NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_privacy_settings" ADD COLUMN "show_in_ranking" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "retired_aliases_alias_lower_unique" ON "retired_aliases" USING btree (lower("alias"));