CREATE TABLE "socket_io_attachments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"payload" "bytea"
);
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sala_app') THEN
		GRANT SELECT, INSERT, DELETE ON TABLE "socket_io_attachments" TO sala_app;
		GRANT USAGE, SELECT ON SEQUENCE "socket_io_attachments_id_seq" TO sala_app;
	END IF;
END $$;
