const DEFAULT_UPSTREAM_BASE_URL = "https://apihub.agnes-ai.com";
const DEFAULT_MODEL = "agnes-2.0-flash";

const SUPPORTED_MODELS = [
  { id: "agnes-2.0-flash", name: "Agnes 2.0 Flash", type: "chat" },
  { id: "agnes-image-2.0-flash", name: "Agnes Image 2.0 Flash", type: "image" },
  { id: "agnes-video-v2.0", name: "Agnes Video v2.0", type: "video" },
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "authorization,content-type,x-api-key",
  "Access-Control-Expose-Headers": "content-type,request-id,x-request-id",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    try {
      const authError = validateWorkerApiKey(request, env);
      if (authError) return authError;

      if (path === "/" || path === "/health") {
        return jsonResponse(serviceInfo(request, env));
      }

      if (path === "/v1/models" && request.method === "GET") {
        return handleModels(request, env);
      }

      if (path === "/v1/chat/completions" && request.method === "POST") {
        return handleChatCompletions(request, env);
      }

      if (path === "/v1/responses" && request.method === "POST") {
        return handleResponses(request, env);
      }

      return errorResponse(404, "not_found", `No route for ${path}`);
    } catch (error) {
      return errorResponse(500, "internal_error", error && error.message ? error.message : String(error));
    }
  },
};

async function handleModels(request, env) {
  return jsonResponse({
    object: "list",
    data: SUPPORTED_MODELS.map((model) => ({
      id: model.id,
      object: "model",
      created: 0,
      owned_by: "agnes-ai",
      permission: [],
      root: model.id,
      parent: null,
    })),
  });
}

async function handleChatCompletions(request, env) {
  const body = await readJson(request);
  const model = body.model || env.DEFAULT_MODEL || DEFAULT_MODEL;
  const created = nowSeconds();
  const id = `chatcmpl_${randomId()}`;

  const upstreamPayload = buildUpstreamPayload(body, model);

  if (body.stream) {
    const upstream = await callUpstreamStream(request, env, "/v1/chat/completions", upstreamPayload);
    return sseResponse(streamUpstreamChat(upstream, { id, created, model }));
  }

  const result = await callUpstreamJson(request, env, "/v1/chat/completions", upstreamPayload);
  return jsonResponse(result);
}

async function handleResponses(request, env) {
  const body = await readJson(request);
  const model = body.model || env.DEFAULT_MODEL || DEFAULT_MODEL;
  const created = nowSeconds();
  const id = `resp_${randomId()}`;

  const upstreamPayload = buildUpstreamPayload(body, model);

  if (body.stream) {
    const upstream = await callUpstreamStream(request, env, "/v1/responses", upstreamPayload);
    return sseResponse(streamUpstreamResponses(upstream, { id, created, model }));
  }

  const result = await callUpstreamJson(request, env, "/v1/responses", upstreamPayload);
  return jsonResponse(result);
}

function buildUpstreamPayload(body, model) {
  return {
    model: model,
    messages: body.messages || [],
    stream: body.stream || false,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    top_p: body.top_p,
    ...body,
  };
}

async function callUpstreamJson(request, env, path, payload) {
  const response = await fetch(new URL(path, upstreamBase(env)), {
    method: "POST",
    headers: upstreamHeaders(request, env),
    body: JSON.stringify(payload || {}),
  });

  if (!response.ok) {
    throw new Error(`upstream ${path} failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function callUpstreamStream(request, env, path, payload) {
  const response = await fetch(new URL(path, upstreamBase(env)), {
    method: "POST",
    headers: upstreamHeaders(request, env),
    body: JSON.stringify(payload || {}),
  });

  if (!response.ok) {
    throw new Error(`upstream ${path} failed: ${response.status} ${await response.text()}`);
  }

  return response;
}

function streamUpstreamChat(upstream, meta) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const reader = upstream.body.getReader();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) {
              controller.enqueue(encoder.encode(line + "\n"));
            }
          }
        }

        if (buffer.trim()) {
          controller.enqueue(encoder.encode(buffer + "\n"));
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message || String(error) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
}

function streamUpstreamResponses(upstream, meta) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const reader = upstream.body.getReader();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) {
              controller.enqueue(encoder.encode(line + "\n"));
            }
          }
        }

        if (buffer.trim()) {
          controller.enqueue(encoder.encode(buffer + "\n"));
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message || String(error) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
}

function upstreamHeaders(request, env) {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${upstreamApiKey(request, env)}`);
  headers.set("Content-Type", "application/json");
  return headers;
}

function upstreamApiKey(request, env) {
  const key = optionalUpstreamApiKey(request, env);
  if (key) return key;

  if (env.WORKER_API_KEY) {
    throw new Error("Missing upstream API key. Set AGNES_API_KEY when WORKER_API_KEY is enabled.");
  }

  throw new Error("Missing upstream API key. Set AGNES_API_KEY or pass Authorization: Bearer <key> / x-api-key: <key>.");
}

function optionalUpstreamApiKey(request, env) {
  const configured = env.AGNES_API_KEY || env.API_KEY || env.AUTH_KEY;
  if (configured) return configured;

  if (env.WORKER_API_KEY) return "";

  return clientApiKey(request);
}

function validateWorkerApiKey(request, env) {
  const expected = env.WORKER_API_KEY;
  if (!expected) return null;

  const actual = clientApiKey(request);
  if (actual && constantTimeEqual(actual, expected)) return null;

  return jsonResponse({
    error: {
      message: "Invalid or missing Worker API key.",
      type: "authentication_error",
      code: "invalid_api_key",
    },
  }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
}

function clientApiKey(request) {
  const auth = request.headers.get("authorization") || "";
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();

  const xKey = request.headers.get("x-api-key");
  return xKey ? xKey.trim() : "";
}

function constantTimeEqual(actual, expected) {
  const actualText = String(actual || "");
  const expectedText = String(expected || "");
  if (actualText.length !== expectedText.length) return false;

  let diff = 0;
  for (let i = 0; i < actualText.length; i += 1) {
    diff |= actualText.charCodeAt(i) ^ expectedText.charCodeAt(i);
  }
  return diff === 0;
}

function upstreamBase(env) {
  return stripTrailingSlash(env.UPSTREAM_BASE_URL || DEFAULT_UPSTREAM_BASE_URL) + "/";
}

function normalizePath(path) {
  if (!path || path === "") return "/";
  const normalized = path.replace(/\/+/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}

function sseResponse(body) {
  return new Response(body, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function errorResponse(status, code, message) {
  return jsonResponse({
    error: {
      message,
      type: code,
      code,
    },
  }, { status });
}

async function readJson(request) {
  if (!request.body) return {};
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error("Request body must be valid JSON.");
  }
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function randomId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function serviceInfo(request, env) {
  const origin = new URL(request.url).origin;
  return {
    ok: true,
    service: "Agnes AI API Transfer Worker",
    upstream: stripTrailingSlash(env.UPSTREAM_BASE_URL || DEFAULT_UPSTREAM_BASE_URL),
    supported_models: SUPPORTED_MODELS,
    routes: {
      openai: `${origin}/v1/chat/completions, /v1/responses, /v1/models`,
    },
  };
}
