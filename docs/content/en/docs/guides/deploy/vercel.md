---
title: Deploy Stage Web on Vercel
description: Launch the Project AIRI Stage Web experience on Vercel and configure the required environment variables.
---

## Overview

Vercel can build and serve the Stage Web application directly from this monorepo. The provided `vercel.json` config wires up the build command, sets the output folder, and exposes the headers used by the production deployment. Follow the steps below to import the repository, provide the necessary secrets, and enable the recent configurator feature that relies on a WebSocket endpoint.

## Prerequisites

- A Vercel account with access to the Git provider hosting your fork of `moeru-ai/airi`
- Corepack enabled locally (`corepack enable`) if you plan to test the build before pushing
- An AIRI backend or orchestrator instance that the web client can talk to (optional, but required for live configuration through the new WebSocket channel)

## 1. Import the project into Vercel

1. Fork `moeru-ai/airi` or create a read-only Git integration.
2. In the Vercel dashboard, click **Add New… → Project**, pick the repository, and let Vercel detect the root.
3. Leave the framework detected as **Vite**. The build command and output directory are already specified inside `vercel.json`, so you do not need to override them in the UI.
4. Save the project so you can populate environment variables.

## 2. Configure environment variables

The build relies on environment variables that are injected at build time (and in runtime serverless functions) to preconfigure providers. Vercel will inherit the values defined in the dashboard or through `vercel env`/`vc env` commands. The complete list lives in `vercel.json`, and all available environment variables are listed below:

### Basic Configuration

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `VITE_SKIP_PROVIDER_HEALTH_CHECK` | Recommended | Skip provider health checks to avoid CORS errors. Set to `true` to save provider configurations directly without validation in serverless deployments. Defaults to `true` in browser environments. | `true` |
| `DEFAULT_CHAT_PROVIDER` | Yes | Provider identifier the UI should use by default. Must match one of the configured providers. | `openai` |
| `DEFAULT_SPEECH_PROVIDER` | Yes | Default text-to-speech provider slug. | `openai-audio-speech` |
| `DEFAULT_TRANSCRIPTION_PROVIDER` | Yes | Default speech-to-text provider slug. | `openai-audio-transcription` |
| `VITE_AIRI_WS_URL` | Optional | WebSocket endpoint for the new live configurator feature. Point this to your AIRI backend (`wss://your-backend/ws`) when you want remote module configuration to work in production. | `wss://airi.yourdomain.com/ws` |

### AI Provider Configuration

Each AI provider has corresponding API key, base URL, and model configuration. Only configure the providers you plan to use.

#### OpenAI

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Optional | OpenAI API key | `sk-...` |
| `OPENAI_BASE_URL` | Optional | OpenAI API base URL, defaults to `https://api.openai.com/v1/` | `https://api.openai.com/v1/` |
| `OPENAI_MODEL` | Optional | Chat model identifier | `gpt-4o-mini` |
| `OPENAI_SPEECH_MODEL` | Optional | Speech synthesis model | `tts-1` |
| `OPENAI_TRANSCRIPTION_MODEL` | Optional | Speech-to-text model | `whisper-1` |

#### OpenAI Compatible Providers

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `OPENAI_COMPATIBLE_API_KEY` | Optional | OpenAI compatible API key | `sk-...` |
| `OPENAI_COMPATIBLE_BASE_URL` | Optional | OpenAI compatible API base URL | `https://your-api.com/v1/` |
| `OPENAI_COMPATIBLE_MODEL` | Optional | Chat model identifier | `custom-model` |
| `OPENAI_COMPATIBLE_SPEECH_MODEL` | Optional | Speech synthesis model | `custom-tts` |
| `OPENAI_COMPATIBLE_TRANSCRIPTION_MODEL` | Optional | Speech-to-text model | `custom-whisper` |

#### OpenRouter

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | Optional | OpenRouter API key | `sk-or-...` |
| `OPENROUTER_BASE_URL` | Optional | OpenRouter base URL, defaults to `https://openrouter.ai/api/v1/` | `https://openrouter.ai/api/v1/` |
| `OPENROUTER_MODEL` | Optional | Model identifier | `anthropic/claude-3.5-sonnet` |

#### Anthropic

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | Optional | Anthropic API key | `sk-ant-...` |
| `ANTHROPIC_BASE_URL` | Optional | Anthropic API base URL, defaults to `https://api.anthropic.com/v1/` | `https://api.anthropic.com/v1/` |
| `ANTHROPIC_MODEL` | Optional | Claude model identifier | `claude-3-5-sonnet-20241022` |

#### Google Gemini

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional | Google Generative AI API key | `AIza...` |
| `GOOGLE_GENERATIVE_AI_BASE_URL` | Optional | Google API base URL, defaults to `https://generativelanguage.googleapis.com/v1beta/openai/` | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `GOOGLE_GENERATIVE_AI_MODEL` | Optional | Gemini model identifier | `gemini-2.0-flash-exp` |

#### DeepSeek

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | Optional | DeepSeek API key | `sk-...` |
| `DEEPSEEK_BASE_URL` | Optional | DeepSeek API base URL, defaults to `https://api.deepseek.com/` | `https://api.deepseek.com/` |
| `DEEPSEEK_MODEL` | Optional | DeepSeek model identifier | `deepseek-chat` |

#### AI302

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `AI302_API_KEY` | Optional | AI302 API key | `sk-...` |
| `AI302_BASE_URL` | Optional | AI302 API base URL, defaults to `https://api.302.ai/v1/` | `https://api.302.ai/v1/` |
| `AI302_MODEL` | Optional | Model identifier | `gpt-4o-mini` |

#### Together AI

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `TOGETHER_API_KEY` | Optional | Together AI API key | `...` |
| `TOGETHER_BASE_URL` | Optional | Together AI base URL, defaults to `https://api.together.xyz/v1/` | `https://api.together.xyz/v1/` |
| `TOGETHER_MODEL` | Optional | Model identifier | `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` |

#### xAI (Grok)

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `XAI_API_KEY` | Optional | xAI API key | `xai-...` |
| `XAI_BASE_URL` | Optional | xAI API base URL, defaults to `https://api.x.ai/v1/` | `https://api.x.ai/v1/` |
| `XAI_MODEL` | Optional | Grok model identifier | `grok-2-latest` |

#### Novita AI

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `NOVITA_API_KEY` | Optional | Novita AI API key | `...` |
| `NOVITA_BASE_URL` | Optional | Novita AI base URL, defaults to `https://api.novita.ai/openai/` | `https://api.novita.ai/openai/` |
| `NOVITA_MODEL` | Optional | Model identifier | `meta-llama/llama-3.1-8b-instruct` |

#### Fireworks AI

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `FIREWORKS_API_KEY` | Optional | Fireworks AI API key | `fw-...` |
| `FIREWORKS_BASE_URL` | Optional | Fireworks AI base URL, defaults to `https://api.fireworks.ai/inference/v1/` | `https://api.fireworks.ai/inference/v1/` |
| `FIREWORKS_MODEL` | Optional | Model identifier | `accounts/fireworks/models/llama-v3p1-8b-instruct` |

#### Featherless AI

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `FEATHERLESS_API_KEY` | Optional | Featherless AI API key | `...` |
| `FEATHERLESS_BASE_URL` | Optional | Featherless AI base URL, defaults to `https://api.featherless.ai/v1/` | `https://api.featherless.ai/v1/` |
| `FEATHERLESS_MODEL` | Optional | Model identifier | `meta-llama/Meta-Llama-3.1-8B-Instruct` |

#### Perplexity

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `PERPLEXITY_API_KEY` | Optional | Perplexity API key | `pplx-...` |
| `PERPLEXITY_BASE_URL` | Optional | Perplexity API base URL, defaults to `https://api.perplexity.ai/` | `https://api.perplexity.ai/` |
| `PERPLEXITY_MODEL` | Optional | Model identifier | `llama-3.1-sonar-small-128k-online` |

#### Mistral AI

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `MISTRAL_API_KEY` | Optional | Mistral AI API key | `...` |
| `MISTRAL_BASE_URL` | Optional | Mistral AI base URL, defaults to `https://api.mistral.ai/v1/` | `https://api.mistral.ai/v1/` |
| `MISTRAL_MODEL` | Optional | Model identifier | `mistral-small-latest` |

#### Moonshot AI

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `MOONSHOT_API_KEY` | Optional | Moonshot AI API key | `sk-...` |
| `MOONSHOT_BASE_URL` | Optional | Moonshot AI base URL, defaults to `https://api.moonshot.ai/v1/` | `https://api.moonshot.ai/v1/` |
| `MOONSHOT_MODEL` | Optional | Model identifier | `moonshot-v1-8k` |

#### ModelScope

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `MODELSCOPE_API_KEY` | Optional | ModelScope API key | `...` |
| `MODELSCOPE_BASE_URL` | Optional | ModelScope API base URL, defaults to `https://api-inference.modelscope.cn/v1/` | `https://api-inference.modelscope.cn/v1/` |
| `MODELSCOPE_MODEL` | Optional | Model identifier | `qwen2.5-72b-instruct` |

#### Local Model Providers

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `CLOUDFLARE_WORKERS_AI_MODEL` | Optional | Cloudflare Workers AI model identifier | `@cf/meta/llama-3.1-8b-instruct` |
| `OLLAMA_MODEL` | Optional | Ollama chat model name | `llama3.2` |
| `OLLAMA_EMBEDDING_MODEL` | Optional | Ollama embedding model name | `nomic-embed-text` |
| `LM_STUDIO_MODEL` | Optional | LM Studio model name | `llama-3.1-8b` |
| `PLAYER2_MODEL` | Optional | Player2 chat model name | `custom-model` |
| `PLAYER2_SPEECH_MODEL` | Optional | Player2 speech model name | `custom-tts` |
| `VLLM_MODEL` | Optional | vLLM model name | `meta-llama/Meta-Llama-3.1-8B-Instruct` |

### Memory system configuration

The Stage memory system is configurable through environment variables so you can choose Redis/Upstash for short-term memory and Postgres/Qdrant for long-term embedding storage.

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `MEMORY_PROVIDER` / `SHORT_TERM_MEMORY_PROVIDER` | Optional | Short-term store provider (`local-redis`, `upstash-redis`, or `vercel-kv`). Leaving blank falls back to `local-redis`. | `upstash-redis` |
| `MEMORY_NAMESPACE` | Optional | Redis key prefix used for short-term memory. | `memory` |
| `SHORT_TERM_MEMORY_MAX_MESSAGES` | Optional | Cap on recent messages kept per session. | `20` |
| `SHORT_TERM_MEMORY_TTL_SECONDS` | Optional | TTL for short-term entries. | `1800` |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Optional | REST credentials required when `MEMORY_PROVIDER=upstash-redis`. | `https://us1-bold-foo.upstash.io` |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Optional | Connection details when running your own Redis instance. | `redis.internal`, `6379` |
| `LONG_TERM_MEMORY_PROVIDER` / `MEMORY_LONG_TERM_PROVIDER` | Optional | Long-term store (`postgres-pgvector`, `qdrant`, or `none`). Defaults to `postgres-pgvector`. | `qdrant` |
| `POSTGRES_URL` / `POSTGRES_PRISMA_URL` / `DATABASE_URL` | Optional | Connection string for pgvector deployments. You can also mix and match the host/user/password options below. | `postgresql://user:pass@host/db` |
| `POSTGRES_HOST` / `POSTGRES_PORT` / `POSTGRES_DATABASE` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_SSL` | Optional | Individual Postgres connection parameters if you do not supply a URL. | `postgres.internal`, `5432`, `true` |
| `QDRANT_URL` / `QDRANT_API_KEY` | Optional | Connection details when using Qdrant for vector storage. | `https://qdrant.example.com` |
| `QDRANT_COLLECTION` / `QDRANT_VECTOR_SIZE` | Optional | Collection configuration for Qdrant. | `memory_entries`, `1536` |
| `MEMORY_EMBEDDING_PROVIDER` | Optional | Embedding provider used by the long-term store (`openai`, `openai-compatible`, `cloudflare`). | `openai` |
| `MEMORY_EMBEDDING_API_KEY` | Optional | API key for the embedding provider. Falls back to `OPENAI_API_KEY` when omitted. | `sk-...` |
| `MEMORY_EMBEDDING_BASE_URL` / `MEMORY_EMBEDDING_MODEL` | Optional | Override the embedding endpoint and model. | `https://api.openai.com/v1/`, `text-embedding-3-small` |
| `CLOUDFLARE_ACCOUNT_ID` | Optional | Required when using Cloudflare Workers AI embeddings. | `1234567890abcdef` |

Set the values through the Vercel UI (**Settings → Environment Variables**) or via CLI:

```bash
vercel env add DEFAULT_CHAT_PROVIDER
vercel env add VITE_AIRI_WS_URL
vercel env add MEMORY_PROVIDER
vercel env add LONG_TERM_MEMORY_PROVIDER
```

Repeat for each variable you need. Use **Production**, **Preview**, and **Development** scopes according to your workflow. Configure embedding credentials and storage endpoints before enabling long-term memory in the UI to avoid runtime errors.

## 3. Trigger a build

1. Commit and push your changes (or click **Deploy** for the initial import).
2. Vercel runs `pnpm install --frozen-lockfile` and `pnpm --filter @proj-airi/stage-web run build` automatically, emitting assets into the `dist` directory defined in `vercel.json`.
3. Once the build finishes, visit the deployment URL to verify the UI loads and is connected to your backend if `VITE_AIRI_WS_URL` is set.

## 4. Optional local verification

Before pushing, you can simulate the production build locally:

```bash
pnpm install
pnpm --filter @proj-airi/stage-web run build
```

Then run `pnpm --filter @proj-airi/stage-web run preview` to serve the generated files and validate your configuration.

## Troubleshooting

- **Missing provider credentials:** The UI falls back to providers that have valid API keys. Double-check the variables in **Settings → Environment Variables → Production** if chat/speech features do not appear.
- **Configurator not connecting:** Ensure `VITE_AIRI_WS_URL` points to a reachable WebSocket server and that the backend allows connections from your Vercel domain. Update CORS rules or reverse proxies as needed.
- **Build failures on `pnpm install`:** Vercel uses the repo’s lockfile. If installation fails locally, fix the issue and commit before re-deploying.
