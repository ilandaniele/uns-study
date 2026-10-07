// Target environments. Values come from env only; nothing here is a real deployed host.
// Production is deliberately NOT listed: these tests are for local stacks (and a private staging
// you provide yourself via STAGING_BASE_URL / STAGING_ORIGIN, which also needs ALLOW_REMOTE=1).
export const environments = {
  local: {
    // apps/api/src/env.ts:40 -> PORT defaults to 4000; apps/api/src/main.ts mounts /api/v1 + /api/auth.
    baseUrl: 'http://localhost:4000',
    // apps/api/src/env.ts:41 -> WEB_ORIGIN defaults to http://localhost:3000 (CSRF + Better Auth trustedOrigins).
    origin: 'http://localhost:3000',
  },
  staging: {
    baseUrl: __ENV.STAGING_BASE_URL || '',
    origin: __ENV.STAGING_ORIGIN || '',
  },
};

export const TARGET_ENV = __ENV.TARGET_ENV || 'local';
