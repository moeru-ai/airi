# Package Selection

Use this reference when the user asks what to install or import.

## General rule

- Prefer the smallest package that solves the task.
- Prefer the umbrella `xsai` package only when the user needs several features at once or wants a single import surface.

## Recommended choices

- `@xsai/generate-text`: simplest unary text generation
- `@xsai/stream-text`: streaming text or tool events
- `@xsai/generate-object`: structured output with validation
- `@xsai/stream-object`: incremental structured output
- `@xsai/tool`: tool definitions and raw JSON Schema tools
- `@xsai/embed`: embeddings
- `@xsai/generate-image`: image generation
- `@xsai/generate-speech`: text-to-speech
- `@xsai/generate-transcription`: unary transcription
- `@xsai/stream-transcription`: streaming transcription
- `xsai`: umbrella package that re-exports the packages above

## Import advice

- If the user explicitly cares about size, import from granular packages.
- If the user is writing examples for documentation or wants a single dependency, `xsai` is acceptable.
- When editing an existing codebase, follow the package style already used by the repo unless there is a good reason to change it.

## Positioning reminder

- xsAI is intentionally OpenAI-compatible-first.
- Do not recommend xsAI as a universal provider abstraction layer.
