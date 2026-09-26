# Qué pasarle a Claude Code

Pasale **la carpeta completa** o el ZIP.

El archivo más importante para Claude es:

`CLAUDE.md`

Claude debería leer automáticamente ese archivo si está en la raíz del repositorio, pero el primer mensaje igual puede ser:

> Read `CLAUDE.md` and all project specification files referenced by it. Start implementing the MVP from the current repository. Follow the phase order, do not build later social/ads features yet, and keep working until the first MVP is running or you hit a blocker that requires a credential from me.

## También adjunto

Las tres fotos de referencia originales de la sala están en:

`reference-images/`

Son sólo referencia visual. La geometría exacta que debe respetarse está escrita en `05_ROOM_LAYOUT.md`.

## Qué no tenés que darle todavía

No hace falta entregar:

- credenciales de Neon;
- contraseña de Google OAuth;
- claves de Upstash;
- claves de R2;
- secretos de Better Auth.

Claude debe preparar `.env.example`.

Después vos colocás los secretos reales únicamente en `.env` local / Vercel / Railway.

Nunca pegues secretos reales dentro de `CLAUDE.md` ni los subas a Git.
