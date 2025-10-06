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

See `vercel.json` for a complete list of supported variables and recommended defaults.
