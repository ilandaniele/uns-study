ALTER TABLE "user_privacy_settings" ADD COLUMN "show_alias_animal_on_map" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "alias_animal" text;