<h1 align="center">アイリ VTuber</h1>

<p align="center">
  [<a href="https://airi.ayaka.io">Try it</a>]
</p>

> Heavily inspired by [Neuro-sama](https://www.youtube.com/@Neurosama)

## Environment Configuration

Set environment variables before building (locally or on platforms such as Vercel) to preconfigure providers:

- `OPENAI_API_KEY` / `OPENAI_BASE_URL`
- `OPENROUTER_API_KEY` / `OPENROUTER_BASE_URL`
- `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL`
- `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_GENERATIVE_AI_BASE_URL`
- `DEFAULT_CHAT_PROVIDER`, `DEFAULT_SPEECH_PROVIDER`, `DEFAULT_TRANSCRIPTION_PROVIDER`
- `*_MODEL` variables (for example `OPENAI_MODEL`, `OPENAI_SPEECH_MODEL`) to pin default chat/speech/transcription models
- `VITE_AIRI_WS_URL` when deploying the live configurator (defaults to `ws://localhost:6121/ws` during local development)
- Memory providers: `MEMORY_PROVIDER`, `SHORT_TERM_MEMORY_PROVIDER`, `MEMORY_NAMESPACE`, `SHORT_TERM_MEMORY_MAX_MESSAGES`, `SHORT_TERM_MEMORY_TTL_SECONDS`
- Memory backends: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- Long-term stores and embeddings: `LONG_TERM_MEMORY_PROVIDER`, `MEMORY_LONG_TERM_PROVIDER`, `POSTGRES_*`, `DATABASE_URL`, `QDRANT_*`, `MEMORY_EMBEDDING_*`, `CLOUDFLARE_ACCOUNT_ID`

See `vercel.json` for a complete list of supported variables and recommended defaults.
