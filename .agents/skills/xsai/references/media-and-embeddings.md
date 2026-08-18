# Media and Embeddings

Use this reference for embeddings, image generation, speech, and transcription.

## Embeddings

Use `@xsai/embed` for:

- `embed`
- `embedMany`

Typical inputs:

- `input`
- optional `dimensions`
- `model`
- `apiKey`
- `baseURL`

## Image generation

Use `@xsai/generate-image` for OpenAI-compatible image generation.

Useful options include:

- `prompt`
- `n`
- `size`
- `responseFormat`

Returned images are normalized to data URLs plus MIME types.

## Speech synthesis

Use `@xsai/generate-speech` for text-to-speech.

Useful options include:

- `input`
- `voice`
- `responseFormat`
- `speed`

The result is binary audio data.

## Transcription

- `@xsai/generate-transcription`: unary speech-to-text
- `@xsai/stream-transcription`: streaming speech-to-text

Use the unary API for batch transcription and the streaming API for live or incremental output.

## Scope reminder

These APIs still follow the same xsAI rule:

- small
- Fetch-based
- OpenAI-compatible-first
