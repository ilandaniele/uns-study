import { test } from "node:test";
import assert from "node:assert/strict";
import { isSourceEvidencePath, isUncertainAsset } from "./source-policy.mjs";

test("includes code, migrations, licenses and known licensed/declared static art", () => {
  for (const file of ["apps/api/src/worker.ts", "apps/web/src/app/terminos/page.tsx", "packages/database/migrations/0010_section_usage.sql", "LICENSE", "docs/legal/DNDA.md", "apps/web/public/avatars/animals/gato.svg", "apps/web/public/garden/brotes-gpt-v1.webp", "apps/web/src/fonts/Archivo-OFL.txt"]) assert.equal(isSourceEvidencePath(file), true, file);
});
test("never selects environment files, even examples or files under an allowed directory", () => {
  for (const file of [".env", "apps/api/.dev.vars", "apps/web/src/.env.production.local", "packages/contracts/src/.dev.vars.staging", "apps/api/src/.env.example"]) assert.equal(isSourceEvidencePath(file), false, file);
});
test("does not export databases, credentials, logs, private dossiers or application data", () => {
  for (const file of ["apps/api/src/state.sqlite", "packages/contracts/node_modules/pkg/index.ts", "docs/legal/private/titular.md", "apps/api/src/private.key", "apps/web/src/client.pem", "apps/api/src/access.log", "apps/api/src/users.csv", "backups/production.sqlite", "apps/web/public/avatars/users/person.png"]) assert.equal(isSourceEvidencePath(file), false, file);
});
test("rejects traversal, Windows absolute paths, hidden storage and list-file injection", () => {
  for (const file of ["apps/api/src/../../.env", "C:/Users/owner/.env", "/etc/passwd", "apps\\api\\src\\worker.ts", "apps/web/src/a.ts\n.env", "apps/api/src/.wrangler/state.json", "apps/api/src/.aws/credentials"]) assert.equal(isSourceEvidencePath(file), false, file);
});
test("only individually declared AI assets enter the source evidence", () => {
  for (const file of ["apps/web/public/room/principal-dia.webp", "apps/web/public/room/principal-noche.webp", "apps/web/public/icons/logo-mark.webp", "apps/web/public/icons/logo-mark-dark.webp", "reference-images/Plano.png"]) { assert.equal(isUncertainAsset(file), false); assert.equal(isSourceEvidencePath(file), true); }
});
test("the excluded memorial photo and unconfirmed resources stay outside the submission", () => {
  for (const file of ["apps/web/public/room/ceniza-recuerdo.webp", "apps/web/public/room/ceniza-v6.webp", "apps/web/public/icons/icon-512.png", "reference-images/room-reference-01.png", "apps/web/public/room/principal-dia-v2.webp"]) { assert.equal(isUncertainAsset(file), true); assert.equal(isSourceEvidencePath(file), false); }
});
