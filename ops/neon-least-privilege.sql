-- Least-privilege runtime role for the API (run by hand in the Neon SQL editor, as the owner role).
-- The API then connects as `sala_app`; migrations keep using the owner connection string.
-- Not applied automatically: review, pick a password in the Neon console, then:
--   1. run this file;
--   2. set the API's MIGRATION_DATABASE_URL Fly secret to the current (owner) DATABASE_URL value;
--   3. set the API's DATABASE_URL Fly secret to the `sala_app` connection string.
-- Boot-time migrations, seed and app_secrets use MIGRATION_DATABASE_URL (apps/api/src/main.ts);
-- every request after that runs as `sala_app`.

CREATE ROLE sala_app LOGIN;  -- set the password from the Neon console (Roles > sala_app > Reset password)

GRANT CONNECT ON DATABASE neondb TO sala_app;
GRANT USAGE ON SCHEMA public TO sala_app;

-- Data access only: no DDL, no TRUNCATE, no ownership.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sala_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sala_app;

-- Tables and sequences created by future migrations (run by the owner) get the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sala_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sala_app;

-- Optional: keep the runtime role off the migration journal.
-- REVOKE INSERT, UPDATE, DELETE ON drizzle.__drizzle_migrations FROM sala_app;
