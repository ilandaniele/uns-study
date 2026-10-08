CREATE TABLE "presence_grants" (
	"user_id" text NOT NULL,
	"room_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "presence_grants_user_id_room_id_pk" PRIMARY KEY("user_id","room_id")
);
--> statement-breakpoint
ALTER TABLE "presence_grants" ADD CONSTRAINT "presence_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_grants" ADD CONSTRAINT "presence_grants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;