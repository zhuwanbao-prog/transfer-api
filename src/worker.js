const BASE = "https://apihub.agnes-ai.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization,content-type,x-api-key",
  "Access-Control-Expose-Headers": "content-type,request-id,x-request-id",
};
const MODELS = JSON.stringify([{ id: "agnes-2.0-flash", name: "Agnes 2.0 Flash" },
  { id: "agnes-image-2.0-flash", name: "Agnes Image 2.0 Flash" },
  { id: "agnes-video-v2.0", name: "Agnes Video v2.0" }]);

const ROUTE_CHAT = "/v1/chat/completions";
const ROUTE_RESP = "/v1/responses";
const ROUTE_MODELS = "/v1/models";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname;

    // ---- auth (only when WORKER_API_KEY is set) ----
    const wkey = env.WORKER_API_KEY;
    if (wkey) {
      const actual = clientKey(request);
      if (!actual || !constEq(actual, wkey)) {
        return new Response(JSON.stringify({ error: { message: "Invalid API key", code: "invalid_api_key" } }), {
          status: 401,
          headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "WWW-Authenticate": "Bearer" },
        });
      }
    }

    // ---- health / root ----
    if (path === "/" || path === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "Agnes Transfer", upstream: BASE }), {
        headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // ---- models ----
    if (path === ROUTE_MODELS) {
      return new Response(JSON.stringify({ object: "list", data: JSON.parse(MODELS) }), {
        headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // ---- proxy: chat or responses ----
    if (path === ROUTE_CHAT || path === ROUTE_RESP) {
      const upstreamUrl = BASE + path;
      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: proxyHeaders(request, env),
        body: request.body,
        duplex: "half",
      });
      if (!upstream.ok) {
        return new Response(JSON.stringify({ error: { message: `upstream ${path}: ${upstream.status}` } }), {
          status: upstream.status,
          headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
        });
      }
      // 零拷贝：直接用上游 body 和 status，只加 CORS headers
      const out = new Headers(upstream.headers);
      for (const [k, v] of Object.entries(CORS)) out.set(k, v);
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: out,
      });
    }

    // ---- 404 ----
    return new Response(JSON.stringify({ error: { message: "Not found" } }), {
      status: 404,
      headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
    });
  },
};

// 从 request.headers 复制，只改 Authorization + host
function proxyHeaders(request, env) {
  const h = new Headers(request.headers);
  h.set("Authorization", `Bearer ${upstreamKey(request, env)}`);
  h.delete("host");
  return h;
}

// 优先用 env key；没设时透传客户端 key
function upstreamKey(request, env) {
  const k = env.AGNES_API_KEY || env.API_KEY || env.AUTH_KEY;
  if (k) return k;
  return clientKey(request);
}

function clientKey(request) {
  const auth = request.headers.get("authorization");
  if (auth && /^bearer\s+/i.test(auth)) return auth.slice(7).trim();
  return request.headers.get("x-api-key") || "";
}

function constEq(a, b) {
  const sa = String(a), sb = String(b);
  if (sa.length !== sb.length) return false;
  let d = 0;
  for (let i = 0; i < sa.length; i++) d |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  return d === 0;
}
