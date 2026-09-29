CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"seat_freed" boolean DEFAULT false NOT NULL,
	"admin_present" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_throttles" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"last_notified_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notification_throttles_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_throttles" ADD CONSTRAINT "notification_throttles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_push_subscriptions_endpoint" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_user" ON "push_subscriptions" USING btree ("user_id");