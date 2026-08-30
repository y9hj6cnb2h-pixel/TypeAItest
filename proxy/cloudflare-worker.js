/**
 * A minimal CORS proxy for Sonari, meant to run on Cloudflare Workers' free tier.
 *
 * Why this exists: api.typeai.live does not send an Access-Control-Allow-Origin
 * header, so a browser refuses to hand the response to the page. The SDK's request
 * leaves and may well be answered — the browser just blocks the reply. A proxy sits
 * outside the browser, so the same-origin rules don't apply to it; it forwards the
 * call and re-serves the answer with the header the browser wants.
 *
 * It is deliberately NOT an open proxy: only the TypeAI API is reachable through it,
 * so a leaked URL can't be used to relay arbitrary traffic.
 *
 * Deploy:
 *   1. https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. Paste this file over the default code, Deploy.
 *   3. Copy the worker URL (https://<name>.<you>.workers.dev) and paste it into
 *      Sonari under Settings → Connectivity, keeping the trailing slash.
 *
 * Optionally set ALLOWED_ORIGINS below to your own site so only it can use the proxy.
 */

const UPSTREAM_HOST = "api.typeai.live";

// Empty array = allow any origin. Add your site to lock it down, e.g.
// ["https://y9hj6cnb2h-pixel.github.io"]
const ALLOWED_ORIGINS = [];

function corsHeaders(origin) {
  const allowed =
    ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)
      ? origin || "*"
      : null;
  if (!allowed) return null;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Accepts both `/<full url>` and `/?url=<encoded url>`. */
function resolveTarget(url) {
  const viaQuery = url.searchParams.get("url");
  let raw = viaQuery ?? url.pathname.slice(1) + url.search;
  if (!raw) return null;
  // Some intermediaries collapse the "//" after the scheme; put it back.
  raw = raw.replace(/^(https?:)\/(?!\/)/, "$1//");
  let target;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  if (target.hostname !== UPSTREAM_HOST) return null;
  return target;
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") ?? "";
    const cors = corsHeaders(origin);
    if (!cors) return new Response("Origin not allowed", { status: 403 });

    // The SDK posts JSON, which makes the browser send a preflight first.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const target = resolveTarget(new URL(request.url));
    if (!target) {
      return new Response(
        `This proxy only forwards to ${UPSTREAM_HOST}. ` +
          `Call it as https://<worker>/https://${UPSTREAM_HOST}/...`,
        { status: 400, headers: cors },
      );
    }

    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers: {
        "Content-Type":
          request.headers.get("Content-Type") ?? "application/json",
        Accept: request.headers.get("Accept") ?? "application/json",
      },
      body: request.method === "GET" ? undefined : await request.arrayBuffer(),
    });

    const headers = new Headers(cors);
    headers.set(
      "Content-Type",
      upstream.headers.get("Content-Type") ?? "application/json",
    );
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
