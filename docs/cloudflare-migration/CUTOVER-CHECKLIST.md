# Checklist de cutover a Cloudflare

Cuenta Cloudflare: `8355b74d76c27ea18e007625360d9cc0`. Zona: `saladeestudio.com.ar`.
Fly sigue en prod hasta el paso 6. No borrar Fly hasta 7 días estables.

## 1. Plan Workers (decidido: Free por ahora, 2026-10-14)
- Riesgos conocidos del Free: 10 ms de CPU por request (login con contraseña usa scrypt, SSR de Next),
  worker de 3 MB comprimido (la web puede no entrar), 100k requests/día sumando web + API,
  DO 100k filas escritas/día.
- Señales para pasar a Paid (USD 5/mes): deploy de web falla por tamaño, error 1102 en logs, o 429/límite diario.

## 2. R2 (browser)
- [x] R2 > crear bucket `uns-study-report-evidence` (si no existe).
- [x] CORS del bucket: `PUT` y `GET` desde `https://saladeestudio.com.ar` (ya estaba, header `content-type`).
- [x] R2 > Manage API tokens > token Object Read & Write sobre ese bucket. Guardar Access Key ID y Secret en el gestor de contraseñas.

## 3. API token para GitHub Actions (browser)
- [x] My Profile > API Tokens > Create Token > template "Edit Cloudflare Workers".
  - Agregar: Zone `saladeestudio.com.ar` > Workers Routes: Edit.
  - Agregar: Account > Account Settings: Read.
- [x] GitHub repo > Settings > Secrets and variables > Actions > Secrets:
  - `CLOUDFLARE_API_TOKEN` = token recién creado.
  - `CLOUDFLARE_ACCOUNT_ID` = `8355b74d76c27ea18e007625360d9cc0`.
- [x] Misma pantalla, pestaña Variables (valores públicos, los mismos que usa Fly hoy):
  `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
  `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT_RAIL`,
  `NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY_FEED`, `NEXT_PUBLIC_GAM_REWARDED_UNIT`, `NEXT_PUBLIC_GAM_INTERSTITIAL_UNIT`.

## 4. DNS (browser)
- [ ] DNS > Records: apex `saladeestudio.com.ar` y `www` en Proxied (nube naranja), los 4 registros (A y AAAA de cada uno).
  Las routes del Worker solo corren sobre registros proxied. Hacerlo en la ventana de cutover (paso 6).
  Hoy (2026-10-14) los 4 están en DNS only apuntando a Fly (66.241.124.65 / 2a09:8280:1::1a6:3a1:0).
- No tocar `send`, `rsend`, `_dmarc`, `resend._domainkey`: son de Resend y quedan DNS only.
- SSL/TLS: modo Full (verificado 2026-10-14). Sirve para Fly como origen y para Workers.

## 5. Secrets del Worker `uns-api` (terminal, vos)
Primero, una vez: `pnpm --filter @sala/api exec wrangler login`.

Mismos valores que hoy. En Fly son secrets de la app (variables de entorno, que le ganan a la tabla
`app_secrets`), así que el script los lee del machine con `fly ssh` y los pasa a `wrangler secret put` sin imprimirlos:
```powershell
powershell -ExecutionPolicy Bypass -File ops\copy-app-secrets.ps1
```
Copia `BETTER_AUTH_SECRET`, `IP_HASH_SALT`, `VAPID_PRIVATE_KEY` (hecho 2026-10-14). `VAPID_PUBLIC_KEY` ya está en `vars`.

Resto, uno por uno: copiar valor al portapapeles y correr
```powershell
powershell -ExecutionPolicy Bypass -File ops\set-worker-secret.ps1 -Name <NOMBRE>
```
- [x] `GOOGLE_CLIENT_SECRET` (Google Cloud > Credentials)
- [x] `TURNSTILE_SECRET_KEY` (Cloudflare > Turnstile)
- [x] `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (paso 2)
- [x] `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` (Mercado Pago > Tus integraciones)
- [x] `RESEND_API_KEY` (Resend > API Keys)
- [x] `GEMINI_API_KEY` y/o `ANTHROPIC_API_KEY` (la misma que usa el verificador hoy)
- [x] `OPS_IMPORT_TOKEN`: valor random nuevo, p. ej. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | Set-Clipboard`

Vars no secretas: listas. `VAPID_PUBLIC_KEY` y `R2_ACCOUNT_ID` están en `apps/api/wrangler.jsonc`; `ADMIN_EMAILS` es secret;
`SUBSCRIPTION_PRICE_ARS`, `VERIFIER_MODEL` y `SEAT_VERIFIER_MODE` no estaban en Fly, así que usan los defaults del código.

## 6. Ventana de cutover (~30 min, ideal cerca de 04:00 ART)
1. [ ] API en mantenimiento: `pnpm --filter @sala/api exec wrangler deploy --var MAINTENANCE_MODE:1` (desde `cf/migration`).
2. [ ] Cortar escrituras en Fly: `fly scale count 0` en la app API.
3. [ ] Export: `powershell -ExecutionPolicy Bypass -File ops\export-fly-pg.ps1 -OutDir C:\uns-export` (con `SOURCE_DATABASE_URL`).
4. [ ] Import: `$env:OPS_IMPORT_TOKEN="<token>"; node ops/import-to-do.mjs --base https://saladeestudio.com.ar --dir C:\uns-export` (tiene que salir 0).
5. [ ] API sin mantenimiento: `pnpm --filter @sala/api exec wrangler deploy`.
6. [ ] Web: `pnpm --filter @sala/web exec opennextjs-cloudflare build` y después `pnpm --filter @sala/web exec opennextjs-cloudflare deploy`.
7. [ ] Smoke: `node apps/api/scripts/smoke.mjs https://saladeestudio.com.ar`. Login a mano, check-in, realtime en dos pestañas.
   `https://saladeestudio.com.ar/api/v1/auth-providers` tiene que dar `"passwordReset":true` (si da false, `RESEND_API_KEY` está vacío).
8. [ ] Merge `cf/migration` a `main`: desde acá deploya GitHub Actions.

## 7. Callbacks de terceros (mismo dominio, solo verificar)
- [x] Google OAuth redirect: `https://saladeestudio.com.ar/api/auth/callback/google` (verificado 2026-10-14)
- [x] Mercado Pago webhook: cambiado 2026-10-14 de `uns-study-api.fly.dev` a `https://saladeestudio.com.ar/api/v1/webhooks/mercadopago`
  (hoy la web de Fly lo reenvía a la API de Fly; tras el DNS llega al Worker). Simulación llegó y pasó la firma.
- [x] Resend: dominio verificado (2026-10-14).

## 8. Rollback (7 días) y baja de Fly
- Rollback: borrar las routes de los Workers y escalar Fly de nuevo. Lo escrito en Cloudflare se pierde salvo backup con `ops/backup-do.ps1`.
- Tras 7 días estables: backup final (`ops/backup-do.ps1`), borrar apps Fly + Postgres + certificados, borrar secret `FLY_API_TOKEN` en GitHub, cancelar Upstash.
