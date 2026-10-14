/* eslint-disable */
// Bindings of wrangler.jsonc. Regenerate with `pnpm cf-typegen` (then drop the runtime types and the
// NEXT_PUBLIC_* / ProcessEnv block it adds from .env files; those are typed by Next, not by the Worker).
interface __BaseEnv_CloudflareEnv {
	ASSETS: Fetcher;
}
declare namespace Cloudflare {
	interface Env extends __BaseEnv_CloudflareEnv {}
}
interface CloudflareEnv extends __BaseEnv_CloudflareEnv {}
