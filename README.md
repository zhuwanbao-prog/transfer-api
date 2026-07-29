# Agnes AI Transfer API Worker

中文 | [English](#english)

这是一个 Cloudflare Worker 中转适配器，用于把 `https://apihub.agnes-ai.com` 转换成标准 OpenAI 兼容的 `/v1/*` 接口。

## 支持模型

- `agnes-2.0-flash` — 文本对话
- `agnes-image-2.0-flash` — 图片生成
- `agnes-video-v2.0` — 视频生成

## 功能概览

- OpenAI 兼容：`/v1/chat/completions`、`/v1/responses`、`/v1/models`
- 支持流式输出（stream）
- 上游 API 透明转发，保留原始响应格式

## 通过 GitHub 关联 Cloudflare 自动部署

### 1. 推送到 GitHub

创建 GitHub 仓库并推送本项目。**不要把 Agnes API key 提交进仓库**。

### 2. 在 Cloudflare 连接 GitHub 仓库

1. 打开 Cloudflare Dashboard。
2. 进入 `Workers & Pages`。
3. 点击 `Create`。
4. 选择 `Import a repository` 或 `Connect to Git`。
5. 按提示授权 Cloudflare 访问 GitHub。
6. 选择本项目所在的 GitHub 仓库。
7. Root directory 填 `/`。

### 3. 配置构建参数

```text
Framework preset: None
Build command: npm install
Deploy command: npx wrangler deploy
Root directory: /
Wrangler config: wrangler.toml
```

### 4. 添加 Cloudflare Secret

在 Worker 设置里添加上游 key：

```text
AGNES_API_KEY=<你的 Agnes API key>
```

可选：再添加客户端访问 key 保护 Worker：

```text
WORKER_API_KEY=<你自定义的调用密钥>
```

位置：`Workers & Pages -> 你的 Worker -> Settings -> Variables -> Secrets`

请只把 key 放到 Secret 里，不要写进代码或 GitHub。

### 5. 部署后验证

```text
https://<your-worker>.workers.dev/health
```

看到 `"ok": true` 即表示正常运行。

测试模型列表：

```bash
curl https://<your-worker>.workers.dev/v1/models \
  -H "Authorization: Bearer <你的 WORKER_API_KEY>"
```

## 本地 Wrangler 手动部署

```powershell
npm install -g wrangler
wrangler login
wrangler secret put AGNES_API_KEY
wrangler secret put WORKER_API_KEY
wrangler deploy
```

## Key 使用规则

推荐配置两个 Secret：

```text
AGNES_API_KEY=<你的 Agnes API key>
WORKER_API_KEY=<你自定义的客户端 key>
```

- 设置了 `WORKER_API_KEY`：客户端必须传此 key，Worker 用 `AGNES_API_KEY` 请求上游
- 未设置 `WORKER_API_KEY`：客户端传任意 key，Worker 优先用 `AGNES_API_KEY`

## OpenAI 兼容接口

Base URL：

```text
https://<your-worker>.workers.dev/v1
```

支持：

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`

示例：

```bash
curl https://<your-worker>.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer <你的 WORKER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"agnes-2.0-flash","messages":[{"role":"user","content":"Hello"}]}'
```

流式输出：

```bash
curl https://<your-worker>.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer <你的 WORKER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"agnes-2.0-flash","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

---

## English

This is a Cloudflare Worker proxy for `https://apihub.agnes-ai.com`. It exposes standard OpenAI-compatible `/v1/*` routes.

## Supported Models

- `agnes-2.0-flash` — text chat
- `agnes-image-2.0-flash` — image generation
- `agnes-video-v2.0` — video generation

## Features

- OpenAI-compatible: `/v1/chat/completions`, `/v1/responses`, `/v1/models`
- Streaming (SSE) support
- Transparent upstream response forwarding

## Deploy from GitHub

Push to a GitHub repo, then connect it in Cloudflare Workers & Pages.

Build settings:

```text
Framework preset: None
Build command: npm install
Deploy command: npx wrangler deploy
Root directory: /
Wrangler config: wrangler.toml
```

## Add Secrets

```text
AGNES_API_KEY=<your Agnes API key>
WORKER_API_KEY=<optional client-facing key>
```

Location: `Workers & Pages -> your Worker -> Settings -> Variables -> Secrets`

## Manual Deploy

```powershell
npm install -g wrangler
wrangler login
wrangler secret put AGNES_API_KEY
wrangler secret put WORKER_API_KEY
wrangler deploy
```

## Key Rules

- `WORKER_API_KEY` set: clients must send it; Worker uses `AGNES_API_KEY` upstream
- `WORKER_API_KEY` not set: clients may send any key; Worker uses `AGNES_API_KEY` upstream

## OpenAI-compatible Routes

Base URL: `https://<your-worker>.workers.dev/v1`

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`

Example:

```bash
curl https://<your-worker>.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer <your key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"agnes-2.0-flash","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```
