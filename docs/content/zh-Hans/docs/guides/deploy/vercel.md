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

构建依赖于在构建时（以及运行时 serverless 函数中）注入的环境变量来预配置提供商。Vercel 将继承仪表板中定义的值或通过 `vercel env`/`vc env` 命令定义的值。完整列表位于 `vercel.json` 中，下面列出了所有可用的环境变量：

### 基础配置

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `VITE_SKIP_PROVIDER_HEALTH_CHECK` | 推荐 | 跳过提供商健康检查以避免 CORS 错误。设置为 `true` 可在 serverless 部署中直接保存提供商配置而无需验证。默认在浏览器中为 `true`。 | `true` |
| `DEFAULT_CHAT_PROVIDER` | 是 | UI 默认使用的提供商标识符。必须匹配已配置的提供商之一。 | `openai` |
| `DEFAULT_SPEECH_PROVIDER` | 是 | 默认的文本转语音提供商标识。 | `openai-audio-speech` |
| `DEFAULT_TRANSCRIPTION_PROVIDER` | 是 | 默认的语音转文本提供商标识。 | `openai-audio-transcription` |
| `VITE_AIRI_WS_URL` | 可选 | 新的实时配置器功能的 WebSocket 端点。当希望远程模块配置在生产中工作时，将其指向 AIRI 后端（`wss://your-backend/ws`）。 | `wss://airi.yourdomain.com/ws` |

### AI 提供商配置

每个 AI 提供商都有对应的 API 密钥、基础 URL 和模型配置。仅配置你计划使用的提供商。

#### OpenAI

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | 可选 | OpenAI API 密钥 | `sk-...` |
| `OPENAI_BASE_URL` | 可选 | OpenAI API 基础 URL，默认为 `https://api.openai.com/v1/` | `https://api.openai.com/v1/` |
| `OPENAI_MODEL` | 可选 | 聊天模型标识符 | `gpt-4o-mini` |
| `OPENAI_SPEECH_MODEL` | 可选 | 语音合成模型 | `tts-1` |
| `OPENAI_TRANSCRIPTION_MODEL` | 可选 | 语音转文本模型 | `whisper-1` |

#### OpenAI 兼容提供商

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `OPENAI_COMPATIBLE_API_KEY` | 可选 | OpenAI 兼容 API 密钥 | `sk-...` |
| `OPENAI_COMPATIBLE_BASE_URL` | 可选 | OpenAI 兼容 API 基础 URL | `https://your-api.com/v1/` |
| `OPENAI_COMPATIBLE_MODEL` | 可选 | 聊天模型标识符 | `custom-model` |
| `OPENAI_COMPATIBLE_SPEECH_MODEL` | 可选 | 语音合成模型 | `custom-tts` |
| `OPENAI_COMPATIBLE_TRANSCRIPTION_MODEL` | 可选 | 语音转文本模型 | `custom-whisper` |

#### OpenRouter

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | 可选 | OpenRouter API 密钥 | `sk-or-...` |
| `OPENROUTER_BASE_URL` | 可选 | OpenRouter 基础 URL，默认为 `https://openrouter.ai/api/v1/` | `https://openrouter.ai/api/v1/` |
| `OPENROUTER_MODEL` | 可选 | 模型标识符 | `anthropic/claude-3.5-sonnet` |

#### Anthropic

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | 可选 | Anthropic API 密钥 | `sk-ant-...` |
| `ANTHROPIC_BASE_URL` | 可选 | Anthropic API 基础 URL，默认为 `https://api.anthropic.com/v1/` | `https://api.anthropic.com/v1/` |
| `ANTHROPIC_MODEL` | 可选 | Claude 模型标识符 | `claude-3-5-sonnet-20241022` |

#### Google Gemini

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | 可选 | Google Generative AI API 密钥 | `AIza...` |
| `GOOGLE_GENERATIVE_AI_BASE_URL` | 可选 | Google API 基础 URL，默认为 `https://generativelanguage.googleapis.com/v1beta/openai/` | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `GOOGLE_GENERATIVE_AI_MODEL` | 可选 | Gemini 模型标识符 | `gemini-2.0-flash-exp` |

#### DeepSeek

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | 可选 | DeepSeek API 密钥 | `sk-...` |
| `DEEPSEEK_BASE_URL` | 可选 | DeepSeek API 基础 URL，默认为 `https://api.deepseek.com/` | `https://api.deepseek.com/` |
| `DEEPSEEK_MODEL` | 可选 | DeepSeek 模型标识符 | `deepseek-chat` |

#### AI302

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `AI302_API_KEY` | 可选 | AI302 API 密钥 | `sk-...` |
| `AI302_BASE_URL` | 可选 | AI302 API 基础 URL，默认为 `https://api.302.ai/v1/` | `https://api.302.ai/v1/` |
| `AI302_MODEL` | 可选 | 模型标识符 | `gpt-4o-mini` |

#### Together AI

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `TOGETHER_API_KEY` | 可选 | Together AI API 密钥 | `...` |
| `TOGETHER_BASE_URL` | 可选 | Together AI 基础 URL，默认为 `https://api.together.xyz/v1/` | `https://api.together.xyz/v1/` |
| `TOGETHER_MODEL` | 可选 | 模型标识符 | `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` |

#### xAI (Grok)

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `XAI_API_KEY` | 可选 | xAI API 密钥 | `xai-...` |
| `XAI_BASE_URL` | 可选 | xAI API 基础 URL，默认为 `https://api.x.ai/v1/` | `https://api.x.ai/v1/` |
| `XAI_MODEL` | 可选 | Grok 模型标识符 | `grok-2-latest` |

#### Novita AI

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `NOVITA_API_KEY` | 可选 | Novita AI API 密钥 | `...` |
| `NOVITA_BASE_URL` | 可选 | Novita AI 基础 URL，默认为 `https://api.novita.ai/openai/` | `https://api.novita.ai/openai/` |
| `NOVITA_MODEL` | 可选 | 模型标识符 | `meta-llama/llama-3.1-8b-instruct` |

#### Fireworks AI

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `FIREWORKS_API_KEY` | 可选 | Fireworks AI API 密钥 | `fw-...` |
| `FIREWORKS_BASE_URL` | 可选 | Fireworks AI 基础 URL，默认为 `https://api.fireworks.ai/inference/v1/` | `https://api.fireworks.ai/inference/v1/` |
| `FIREWORKS_MODEL` | 可选 | 模型标识符 | `accounts/fireworks/models/llama-v3p1-8b-instruct` |

#### Featherless AI

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `FEATHERLESS_API_KEY` | 可选 | Featherless AI API 密钥 | `...` |
| `FEATHERLESS_BASE_URL` | 可选 | Featherless AI 基础 URL，默认为 `https://api.featherless.ai/v1/` | `https://api.featherless.ai/v1/` |
| `FEATHERLESS_MODEL` | 可选 | 模型标识符 | `meta-llama/Meta-Llama-3.1-8B-Instruct` |

#### Perplexity

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `PERPLEXITY_API_KEY` | 可选 | Perplexity API 密钥 | `pplx-...` |
| `PERPLEXITY_BASE_URL` | 可选 | Perplexity API 基础 URL，默认为 `https://api.perplexity.ai/` | `https://api.perplexity.ai/` |
| `PERPLEXITY_MODEL` | 可选 | 模型标识符 | `llama-3.1-sonar-small-128k-online` |

#### Mistral AI

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `MISTRAL_API_KEY` | 可选 | Mistral AI API 密钥 | `...` |
| `MISTRAL_BASE_URL` | 可选 | Mistral AI 基础 URL，默认为 `https://api.mistral.ai/v1/` | `https://api.mistral.ai/v1/` |
| `MISTRAL_MODEL` | 可选 | 模型标识符 | `mistral-small-latest` |

#### Moonshot AI

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `MOONSHOT_API_KEY` | 可选 | Moonshot AI API 密钥 | `sk-...` |
| `MOONSHOT_BASE_URL` | 可选 | Moonshot AI 基础 URL，默认为 `https://api.moonshot.ai/v1/` | `https://api.moonshot.ai/v1/` |
| `MOONSHOT_MODEL` | 可选 | 模型标识符 | `moonshot-v1-8k` |

#### ModelScope

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `MODELSCOPE_API_KEY` | 可选 | ModelScope API 密钥 | `...` |
| `MODELSCOPE_BASE_URL` | 可选 | ModelScope API 基础 URL，默认为 `https://api-inference.modelscope.cn/v1/` | `https://api-inference.modelscope.cn/v1/` |
| `MODELSCOPE_MODEL` | 可选 | 模型标识符 | `qwen2.5-72b-instruct` |

#### Cloudflare Workers AI

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `CLOUDFLARE_WORKERS_AI_API_KEY` | 可选 | Cloudflare Workers AI 的 API 令牌 | `your-cloudflare-api-token` |
| `CLOUDFLARE_ACCOUNT_ID` | 可选 | Cloudflare 账户 ID（也用于嵌入） | `1234567890abcdef` |
| `CLOUDFLARE_WORKERS_AI_MODEL` | 可选 | Cloudflare Workers AI 模型标识符 | `@cf/meta/llama-3.1-8b-instruct` |

#### 本地模型提供商

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `OLLAMA_MODEL` | 可选 | Ollama 聊天模型名称 | `llama3.2` |
| `OLLAMA_EMBEDDING_MODEL` | 可选 | Ollama 嵌入模型名称 | `nomic-embed-text` |
| `LM_STUDIO_MODEL` | 可选 | LM Studio 模型名称 | `llama-3.1-8b` |
| `PLAYER2_MODEL` | 可选 | Player2 聊天模型名称 | `custom-model` |
| `PLAYER2_SPEECH_MODEL` | 可选 | Player2 语音模型名称 | `custom-tts` |
| `VLLM_MODEL` | 可选 | vLLM 模型名称 | `meta-llama/Meta-Llama-3.1-8B-Instruct` |

### 语音提供商配置

除 OpenAI 之外的其他语音合成提供商：

#### ElevenLabs

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `ELEVENLABS_API_KEY` | 可选 | ElevenLabs API 密钥 | `sk_...` |
| `ELEVENLABS_BASE_URL` | 可选 | ElevenLabs API 基础 URL，默认为 `https://unspeech.hyp3r.link/v1/` | `https://unspeech.hyp3r.link/v1/` |
| `ELEVENLABS_MODEL` | 可选 | ElevenLabs 模型标识符 | `eleven_multilingual_v2` |

#### 阿里百炼 (Alibaba Cloud Model Studio)

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `ALIBABA_CLOUD_API_KEY` | 可选 | 阿里云百炼 API 密钥 | `sk-...` |
| `ALIBABA_CLOUD_BASE_URL` | 可选 | 阿里云 API 基础 URL，默认为 `https://unspeech.hyp3r.link/v1/` | `https://unspeech.hyp3r.link/v1/` |
| `ALIBABA_CLOUD_MODEL` | 可选 | CosyVoice 模型标识符 | `cosyvoice-v1` |

#### 火山引擎 (Volcengine / Doubao)

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `VOLCENGINE_API_KEY` | 可选 | 火山引擎 API 密钥 | `your-api-key` |
| `VOLCENGINE_APP_ID` | 火山引擎必需 | 火山引擎 App ID | `your-app-id` |
| `VOLCENGINE_BASE_URL` | 可选 | 火山引擎 API 基础 URL，默认为 `https://unspeech.hyp3r.link/v1/` | `https://unspeech.hyp3r.link/v1/` |
| `VOLCENGINE_MODEL` | 可选 | 火山引擎模型标识符 | `v1` |

**注意：** 火山引擎需要同时提供 `VOLCENGINE_API_KEY` 和 `VOLCENGINE_APP_ID` 才能正常工作。

#### Microsoft / Azure Speech

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `MICROSOFT_SPEECH_API_KEY` | 可选 | Microsoft / Azure Speech API 密钥 | `your-subscription-key` |
| `MICROSOFT_SPEECH_BASE_URL` | 可选 | Microsoft Speech API 基础 URL，默认为 `https://unspeech.hyp3r.link/v1/` | `https://unspeech.hyp3r.link/v1/` |
| `MICROSOFT_SPEECH_REGION` | 可选 | Azure Speech 服务区域 | `eastasia` |
| `MICROSOFT_SPEECH_ENDPOINT` | 可选 | Azure Speech 服务端点（替代 BASE_URL + REGION） | `https://eastasia.api.cognitive.microsoft.com` |
| `MICROSOFT_SPEECH_MODEL` | 可选 | Microsoft Speech 模型标识符 | `v1` |

**注意：** 可以使用 `MICROSOFT_SPEECH_REGION` 或 `MICROSOFT_SPEECH_ENDPOINT`，两者选其一。如果未指定，区域默认为 `eastasia`。

#### Index-TTS (Bilibili)

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `INDEX_TTS_API_KEY` | 可选 | Index-TTS API 密钥（如需身份验证） | `your-api-key` |
| `INDEX_TTS_BASE_URL` | 可选 | Index-TTS 服务 URL | `http://localhost:11996/tts` |
| `INDEX_TTS_MODEL` | 可选 | Index-TTS 模型标识符 | `IndexTTS-1.5` |

**注意：** Index-TTS 通常用于本地部署。配置前请确保服务正在运行。

### 记忆系统配置

Stage 记忆系统支持在 Vercel 的 serverless 环境中运行，无需独立后端服务器。系统通过 `/api/memory/*` serverless 函数实现短期和长期记忆功能。

#### 短期记忆配置（必需）

短期记忆用于存储对话历史，支持 Vercel KV 和 Upstash Redis 两种后端：

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `KV_URL` / `KV_REST_API_URL` | Vercel KV 必需 | Vercel KV REST API URL，在 Vercel 仪表板创建 KV 数据库后自动提供 | `https://*.kv.vercel-storage.com` |
| `KV_REST_API_TOKEN` | Vercel KV 必需 | Vercel KV REST API 令牌 | `AX****` |
| `KV_REST_API_READ_ONLY_TOKEN` | Vercel KV 可选 | Vercel KV 只读令牌 | `AW****` |
| `UPSTASH_KV_REST_API_URL` / `UPSTASH_KV_URL` | Upstash 必需 | Upstash Redis REST URL，在 Vercel 中创建 Upstash 集成时自动提供 | `https://us1-bold-foo.upstash.io` |
| `UPSTASH_KV_REST_API_TOKEN` | Upstash 必需 | Upstash Redis REST Token | `AX****` |
| `UPSTASH_REDIS_URL` | Upstash 可选 | Upstash Redis 连接 URL（备用格式） | `redis://default:****@us1-bold-foo.upstash.io:6379` |
| `MEMORY_NAMESPACE` | 可选 | 用于短期记忆的键前缀 | `memory` |
| `SHORT_TERM_MEMORY_MAX_MESSAGES` | 可选 | 每个会话保留的最近消息数上限 | `20` |
| `SHORT_TERM_MEMORY_TTL_SECONDS` | 可选 | 短期条目的 TTL（秒） | `1800` |

**提示：** Vercel 项目可直接在 **Storage** 标签中创建 Vercel KV 数据库，环境变量会自动注入。或者使用 Upstash 提供的免费 Redis 实例。

#### 长期记忆配置（可选）

长期记忆通过向量数据库实现语义搜索，支持 Postgres+pgvector 和 Qdrant：

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `LONG_TERM_MEMORY_PROVIDER` / `MEMORY_LONG_TERM_PROVIDER` | 可选 | 长期存储提供商（`postgres-pgvector`、`qdrant` 或 `none`） | `postgres-pgvector` |
| `POSTGRES_URL` / `DATABASE_URL` | Postgres 必需 | Vercel Postgres 或其他 Postgres 数据库连接字符串 | `postgresql://user:pass@host/db` |
| `MEMORY_TABLE_NAME` | Postgres 可选 | pgvector 表名，默认 `memory_embeddings` | `memory_embeddings` |
| `QDRANT_URL` | Qdrant 必需 | Qdrant 服务 URL | `https://xyz.cloud.qdrant.io` |
| `QDRANT_API_KEY` | Qdrant 可选 | Qdrant API 密钥 | `your-api-key` |
| `QDRANT_COLLECTION_NAME` | Qdrant 可选 | Qdrant 集合名称，默认 `memory` | `memory` |

#### Embedding 配置（长期记忆必需）

长期记忆需要生成文本嵌入，支持 OpenAI 和 Cloudflare Workers AI：

| 名称 | 必需 | 描述 | 示例 |
| --- | --- | --- | --- |
| `EMBEDDING_PROVIDER` | 长期记忆必需 | 嵌入提供商（`openai` 或 `cloudflare`） | `openai` |
| `EMBEDDING_MODEL` | 可选 | 嵌入模型名称 | `text-embedding-3-small` |
| `EMBEDDING_DIMENSIONS` | 可选 | 嵌入向量维度 | `1536` |
| `OPENAI_API_KEY` | OpenAI 必需 | OpenAI API 密钥（也用于聊天） | `sk-...` |
| `OPENAI_BASE_URL` | OpenAI 可选 | OpenAI API 基础 URL | `https://api.openai.com/v1/` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 必需 | Cloudflare 账户 ID | `1234567890abcdef` |
| `CLOUDFLARE_API_TOKEN` | Cloudflare 必需 | Cloudflare API Token（需要 Workers AI 权限） | `your-cf-token` |
| `CLOUDFLARE_EMBEDDING_MODEL` | Cloudflare 可选 | Cloudflare Workers AI 嵌入模型 | `@cf/baai/bge-base-en-v1.5` |

**重要说明：**

1. **数据库初始化：** 长期记忆需要手动创建数据库表或集合：
   - **Postgres+pgvector：** 需要执行以下 SQL 创建表和索引：
     ```sql
     CREATE EXTENSION IF NOT EXISTS vector;
     CREATE TABLE memory_embeddings (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id TEXT NOT NULL,
       content TEXT NOT NULL,
       embedding VECTOR(1536),
       metadata JSONB,
       created_at TIMESTAMP DEFAULT NOW()
     );
     CREATE INDEX ON memory_embeddings USING ivfflat (embedding vector_cosine_ops);
     ```
   - **Qdrant：** 需要通过 API 或控制台创建集合，并配置向量维度和距离度量。

2. **Vercel Postgres 集成：** 在 Vercel 项目的 **Storage** 标签中创建 Postgres 数据库，环境变量 `POSTGRES_URL` 会自动注入。

3. **成本考虑：**
   - Vercel KV 和 Postgres 有免费额度，超出需付费
   - Upstash 和 Qdrant Cloud 提供免费套餐
   - OpenAI embedding API 按 token 计费
   - Cloudflare Workers AI 提供慷慨的免费额度

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
