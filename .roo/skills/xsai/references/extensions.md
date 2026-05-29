# Extensions

Use this reference only when the user explicitly needs an xsAI extension package.

## General rule

- Prefer core `xsai` and `@xsai/*` packages by default.
- Reach for `@xsai-ext/*` only when the user needs an extension capability that is not part of the core path.

## Available extension packages

### `@xsai-ext/providers`

Use this when the user wants predefined provider factories for OpenAI-compatible vendors.

Use cases:

- avoid repeating `baseURL` and `apiKey` wiring
- create reusable provider presets
- work with OpenAI-compatible vendors through a small helper layer

Positioning:

- this is a convenience layer, not a universal provider abstraction
- if the user values minimal size above all else, direct `baseURL` + `apiKey` may still be preferable

### `@xsai-ext/responses`

Use this when the user wants the OpenAI Responses API instead of Chat Completions.

Use cases:

- OpenAI Responses API event streams
- function calling flows built on Responses API semantics
- normalization around Responses API input and output shapes

Positioning:

- use this only when the user explicitly needs Responses API behavior
- do not recommend it as the default path when Chat Completions already solves the task

### `@xsai-ext/telemetry`

Use this when the user explicitly wants OTEL-based telemetry for xsAI operations.

Use cases:

- OpenTelemetry spans around xsAI calls
- telemetry pipelines and observability integrations

Positioning:

- this is an extension, not part of the minimal core path
- if the user is optimizing for the smallest dependency footprint, avoid recommending it unless observability is required

## Recommendation rules

- Keep core recommendations core-first.
- Mention extension packages only when they directly solve the user's stated requirement.
- If the user asks for the smallest setup, prefer core packages and omit extension packages unless necessary.
