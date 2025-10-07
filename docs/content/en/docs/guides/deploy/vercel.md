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

The build relies on environment variables that are injected at build time (and in runtime serverless functions) to preconfigure providers. Vercel will inherit the values defined in the dashboard or through `vercel env`/`vc env` commands. The complete list lives in `vercel.json`, but the table below highlights the most important ones:

| Name | Required | Description | Example |
| --- | --- | --- | --- |
| `DEFAULT_CHAT_PROVIDER` | Yes | Provider identifier the UI should use by default. Must match one of the configured providers. | `openai` |
| `DEFAULT_SPEECH_PROVIDER` | Yes | Default text-to-speech provider slug. | `openai-audio-speech` |
| `DEFAULT_TRANSCRIPTION_PROVIDER` | Yes | Default speech-to-text provider slug. | `openai-audio-transcription` |
| `OPENAI_API_KEY` | Optional | API key for OpenAI when `DEFAULT_CHAT_PROVIDER=openai`. Provide the matching base URL and model if you proxy the API. | `sk-...` |
| `OPENAI_BASE_URL` | Optional | Base URL for the OpenAI-compatible endpoint. Defaults to `https://api.openai.com/v1/`. | Custom proxy URL |
| `OPENAI_MODEL` | Optional | Chat model identifier used for OpenAI. | `gpt-4o-mini` |
| `OPENROUTER_API_KEY` | Optional | Credentials when using [OpenRouter](https://openrouter.ai/). | `sk-or-...` |
| `ANTHROPIC_API_KEY` | Optional | Credentials for Anthropic Claude. | `sk-ant-...` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional | Credentials for Google Gemini. | `AIza...` |
| `VITE_AIRI_WS_URL` | Optional | WebSocket endpoint for the new live configurator feature. Point this to your AIRI backend (`wss://your-backend/ws`) when you want remote module configuration to work in production. | `wss://airi.yourdomain.com/ws` |

> **Heads-up:** Every provider listed in `vercel.json` has matching `*_API_KEY`, `*_BASE_URL`, and `*_MODEL` entries. Only populate the combinations you plan to use. Empty values are safe to leave in place.

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
