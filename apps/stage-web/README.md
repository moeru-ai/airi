<h1 align="center">アイリ VTuber</h1>

<p align="center">
  [<a href="https://airi.ayaka.io">Try it</a>]
</p>

> Heavily inspired by [Neuro-sama](https://www.youtube.com/@Neurosama)

## Environment Configuration

Set environment variables before building (locally or on platforms such as Vercel) to preconfigure providers:

### AI Providers
- `OPENAI_API_KEY` / `OPENAI_BASE_URL`
- `OPENROUTER_API_KEY` / `OPENROUTER_BASE_URL`
- `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL`
- `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_GENERATIVE_AI_BASE_URL`

### Speech Providers
- `ELEVENLABS_API_KEY` / `ELEVENLABS_BASE_URL` / `ELEVENLABS_MODEL`
- `ALIBABA_CLOUD_API_KEY` / `ALIBABA_CLOUD_BASE_URL` / `ALIBABA_CLOUD_MODEL` (阿里百炼)
- `VOLCENGINE_API_KEY` / `VOLCENGINE_APP_ID` / `VOLCENGINE_BASE_URL` / `VOLCENGINE_MODEL` (火山引擎)
- `MICROSOFT_SPEECH_API_KEY` / `MICROSOFT_SPEECH_BASE_URL` / `MICROSOFT_SPEECH_REGION` / `MICROSOFT_SPEECH_ENDPOINT` / `MICROSOFT_SPEECH_MODEL`
- `INDEX_TTS_API_KEY` / `INDEX_TTS_BASE_URL` / `INDEX_TTS_MODEL` (Bilibili)
- `PLAYER2_BASE_URL` / `PLAYER2_SPEECH_MODEL`

### Default Providers
- `DEFAULT_CHAT_PROVIDER`, `DEFAULT_SPEECH_PROVIDER`, `DEFAULT_TRANSCRIPTION_PROVIDER`
- `*_MODEL` variables (for example `OPENAI_MODEL`, `OPENAI_SPEECH_MODEL`) to pin default chat/speech/transcription models

### WebSocket & Memory
- `VITE_AIRI_WS_URL` when deploying the live configurator (defaults to `ws://localhost:6121/ws` during local development)
- Memory providers: `MEMORY_PROVIDER`, `SHORT_TERM_MEMORY_PROVIDER`, `MEMORY_NAMESPACE`, `SHORT_TERM_MEMORY_MAX_MESSAGES`, `SHORT_TERM_MEMORY_TTL_SECONDS`
- Memory backends: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- Long-term stores and embeddings: `LONG_TERM_MEMORY_PROVIDER`, `MEMORY_LONG_TERM_PROVIDER`, `POSTGRES_*`, `DATABASE_URL`, `QDRANT_*`, `MEMORY_EMBEDDING_*`, `CLOUDFLARE_ACCOUNT_ID`

See `.env.example` and `vercel.json` for a complete list of supported variables and recommended defaults.
