import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: the app has no ISR/`revalidate` routes. If a build ever reports one, add
// `incrementalCache: staticAssetsIncrementalCache` (from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache").
export default defineCloudflareConfig({});
