// The AdSense publisher id is baked in at build time, so the response is static.
export const dynamic = "force-static";

export function GET(): Response {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  if (!client) return new Response("Not found", { status: 404 });
  const publisherId = client.replace(/^ca-/, "");
  return new Response(`google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
