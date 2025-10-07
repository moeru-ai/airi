---
title: 在 Vercel 上部署 Stage Web
description: 在 Vercel 上启动 Project AIRI Stage Web 应用并配置所需的环境变量。
---

## 概述

Vercel 可以直接从此 monorepo 构建并提供 Stage Web 应用程序。提供的 `vercel.json` 配置文件设置了构建命令、输出文件夹，并公开了生产部署所需的请求头。请按照以下步骤导入仓库、提供必要的密钥，并启用依赖 WebSocket 端点的最新配置器功能。

## 前置要求

- 拥有 Vercel 账户，并可访问托管你 fork 的 `moeru-ai/airi` 仓库的 Git 提供商
- 如果计划在推送前测试构建，需在本地启用 Corepack（`corepack enable`）
- AIRI 后端或编排器实例，供 Web 客户端通信（可选，但通过新的 WebSocket 通道进行实时配置时必需）

## 1. 将项目导入 Vercel

1. Fork `moeru-ai/airi` 或创建只读 Git 集成。
2. 在 Vercel 仪表板中，点击 **Add New… → Project**，选择仓库，让 Vercel 检测根目录。
3. 保持框架检测为 **Vite**。构建命令和输出目录已在 `vercel.json` 中指定，因此无需在 UI 中覆盖它们。
4. 保存项目以便填充环境变量。

## 2. 配置环境变量

构建依赖于在构建时（以及运行时 serverless 函数中）注入的环境变量来预配置提供商。Vercel 将继承仪表板中定义的值或通过 `vercel env`/`vc env` 命令定义的值。完整列表位于 `vercel.json` 中，但下表突出显示了最重要的变量：

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `DEFAULT_CHAT_PROVIDER` | 是 | UI 默认使用的提供商标识符。必须匹配已配置的提供商之一。 | `openai` |
| `DEFAULT_SPEECH_PROVIDER` | 是 | 默认的文本转语音提供商标识。 | `openai-audio-speech` |
| `DEFAULT_TRANSCRIPTION_PROVIDER` | 是 | 默认的语音转文本提供商标识。 | `openai-audio-transcription` |
| `OPENAI_API_KEY` | 可选 | 当 `DEFAULT_CHAT_PROVIDER=openai` 时用于 OpenAI 的 API 密钥。如果代理 API，请提供匹配的基础 URL 和模型。 | `sk-...` |
| `OPENAI_BASE_URL` | 可选 | OpenAI 兼容端点的基础 URL。默认为 `https://api.openai.com/v1/`。 | 自定义代理 URL |
| `OPENAI_MODEL` | 可选 | 用于 OpenAI 的聊天模型标识符。 | `gpt-4o-mini` |
| `OPENROUTER_API_KEY` | 可选 | 使用 [OpenRouter](https://openrouter.ai/) 时的凭据。 | `sk-or-...` |
| `ANTHROPIC_API_KEY` | 可选 | Anthropic Claude 的凭据。 | `sk-ant-...` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | 可选 | Google Gemini 的凭据。 | `AIza...` |
| `VITE_AIRI_WS_URL` | 可选 | 新的实时配置器功能的 WebSocket 端点。当希望远程模块配置在生产中工作时，将其指向 AIRI 后端（`wss://your-backend/ws`）。 | `wss://airi.yourdomain.com/ws` |

> **注意：** `vercel.json` 中列出的每个提供商都有匹配的 `*_API_KEY`、`*_BASE_URL` 和 `*_MODEL` 条目。仅填充你计划使用的组合。空值可以安全地保留。

### 记忆系统配置

Stage 记忆系统可通过环境变量配置，因此你可以为短期记忆选择 Redis/Upstash，为长期嵌入存储选择 Postgres/Qdrant。

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `MEMORY_PROVIDER` / `SHORT_TERM_MEMORY_PROVIDER` | 可选 | 短期存储提供商（`local-redis`、`upstash-redis` 或 `vercel-kv`）。留空则回退到 `local-redis`。 | `upstash-redis` |
| `MEMORY_NAMESPACE` | 可选 | 用于短期记忆的 Redis 键前缀。 | `memory` |
| `SHORT_TERM_MEMORY_MAX_MESSAGES` | 可选 | 每个会话保留的最近消息数上限。 | `20` |
| `SHORT_TERM_MEMORY_TTL_SECONDS` | 可选 | 短期条目的 TTL。 | `1800` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | 可选 | 当 `MEMORY_PROVIDER=upstash-redis` 时所需的 REST 凭据。 | `https://us1-bold-foo.upstash.io` |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | 可选 | 运行自己的 Redis 实例时的连接详细信息。 | `redis.internal`、`6379` |
| `LONG_TERM_MEMORY_PROVIDER` / `MEMORY_LONG_TERM_PROVIDER` | 可选 | 长期存储（`postgres-pgvector`、`qdrant` 或 `none`）。默认为 `postgres-pgvector`。 | `qdrant` |
| `POSTGRES_URL` / `POSTGRES_PRISMA_URL` / `DATABASE_URL` | 可选 | pgvector 部署的连接字符串。你也可以混合使用下面的 host/user/password 选项。 | `postgresql://user:pass@host/db` |
| `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_DATABASE` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_SSL` | 可选 | 如果不提供 URL，可使用单独的 Postgres 连接参数。 | `postgres.internal`、`5432`、`true` |
| `QDRANT_URL` / `QDRANT_API_KEY` | 可选 | 使用 Qdrant 进行向量存储时的连接详细信息。 | `https://qdrant.example.com` |
| `QDRANT_COLLECTION` / `QDRANT_VECTOR_SIZE` | 可选 | Qdrant 的集合配置。 | `memory_entries`、`1536` |
| `MEMORY_EMBEDDING_PROVIDER` | 可选 | 长期存储使用的嵌入提供商（`openai`、`openai-compatible`、`cloudflare`）。 | `openai` |
| `MEMORY_EMBEDDING_API_KEY` | 可选 | 嵌入提供商的 API 密钥。省略时回退到 `OPENAI_API_KEY`。 | `sk-...` |
| `MEMORY_EMBEDDING_BASE_URL` / `MEMORY_EMBEDDING_MODEL` | 可选 | 覆盖嵌入端点和模型。 | `https://api.openai.com/v1/`、`text-embedding-3-small` |
| `CLOUDFLARE_ACCOUNT_ID` | 可选 | 使用 Cloudflare Workers AI 嵌入时必需。 | `1234567890abcdef` |

通过 Vercel UI（**Settings → Environment Variables**）或 CLI 设置值：

```bash
vercel env add DEFAULT_CHAT_PROVIDER
vercel env add VITE_AIRI_WS_URL
vercel env add MEMORY_PROVIDER
vercel env add LONG_TERM_MEMORY_PROVIDER
```

根据需要为每个变量重复操作。根据工作流程使用 **Production**、**Preview** 和 **Development** 作用域。在 UI 中启用长期记忆之前配置嵌入凭据和存储端点，以避免运行时错误。

## 3. 触发构建

1. 提交并推送你的更改（或点击 **Deploy** 进行初始导入）。
2. Vercel 自动运行 `pnpm install --frozen-lockfile` 和 `pnpm --filter @proj-airi/stage-web run build`，将资源输出到 `vercel.json` 中定义的 `dist` 目录。
3. 构建完成后，访问部署 URL 以验证 UI 是否加载，如果设置了 `VITE_AIRI_WS_URL`，请验证是否连接到后端。

## 4. 可选的本地验证

在推送之前，你可以在本地模拟生产构建：

```bash
pnpm install
pnpm --filter @proj-airi/stage-web run build
```

然后运行 `pnpm --filter @proj-airi/stage-web run preview` 来提供生成的文件并验证配置。

## 故障排除

- **缺少提供商凭据：** UI 回退到具有有效 API 密钥的提供商。如果聊天/语音功能未出现，请在 **Settings → Environment Variables → Production** 中仔细检查变量。
- **配置器未连接：** 确保 `VITE_AIRI_WS_URL` 指向可达的 WebSocket 服务器，并且后端允许来自 Vercel 域的连接。根据需要更新 CORS 规则或反向代理。
- **`pnpm install` 时构建失败：** Vercel 使用仓库的 lockfile。如果本地安装失败，请在重新部署之前修复问题并提交。
