-- Moves the main room's geofence center to the owner-confirmed location. Radius is unchanged.
-- The seed never overwrites coordinates on an existing room, so production needs this data migration.
-- The API's in-memory geofence cache is rebuilt on the restart that follows every deploy.
UPDATE "rooms" SET "latitude" = -38.7018942, "longitude" = -62.2702852, "updated_at" = now() WHERE "slug" = 'principal';
