-- Least-privilege runtime role for the API on the Fly Postgres app `sala-de-estudio-db`, database `sala`.
-- The API connects as `sala_app`; migrations run as the owner role `sala_owner` (ops/migrate-fly-db.ps1).
-- Not applied automatically. Run it by hand as the postgres superuser, for example with
--   fly postgres connect -a sala-de-estudio-db -d sala
-- then set the password with ALTER ROLE sala_app PASSWORD '...' (never commit it) and store the
-- `sala_app` connection string as the API's DATABASE_URL Fly secret (ops/set-secret-from-clipboard.ps1).

CREATE ROLE sala_app LOGIN;

GRANT CONNECT ON DATABASE sala TO sala_app;
GRANT USAGE ON SCHEMA public TO sala_app;

-- Data access only: no DDL, no TRUNCATE, no ownership.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sala_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sala_app;

-- Tables and sequences created by future migrations (run by the owner) get the same grants.
ALTER DEFAULT PRIVILEGES FOR ROLE sala_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sala_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sala_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sala_app;

-- Optional: keep the runtime role off the migration journal.
-- REVOKE INSERT, UPDATE, DELETE ON drizzle.__drizzle_migrations FROM sala_app;
