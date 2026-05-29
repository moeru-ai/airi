# Text, Streaming, and Tools

Use this reference for `generateText`, `streamText`, chat options, and tool loops.

## Shared mental model

Most text APIs in xsAI use:

- `apiKey`
- `baseURL`
- `model`
- `messages`
- optional `fetch`, `headers`, `abortSignal`

For chat-style APIs, expect common options such as:

- `temperature`
- `topP`
- `stop`
- `seed`
- `toolChoice`
- `tools`
- `maxSteps`

## `generateText`

Use `generateText` when the user wants one final result.

Returns a result shaped like:

- `text`
- `finishReason`
- `usage`
- `messages`
- `steps`
- `toolCalls`
- `toolResults`
- `reasoningText`

## `streamText`

Use `streamText` when the user wants incremental output or tool events.

It returns immediately and exposes:

- `textStream`
- `fullStream`
- `reasoningTextStream`
- `messages` as a promise
- `steps` as a promise
- `usage` as a promise
- `totalUsage` as a promise

`fullStream` may contain events such as:

- `text-delta`
- `reasoning-delta`
- `tool-call-streaming-start`
- `tool-call-delta`
- `tool-call`
- `tool-result`
- `finish`
- `error`

## Tool loops

- `maxSteps` enables repeated tool-use loops.
- Each step appends assistant output and tool results, then makes another API call if needed.
- Use `toolChoice: 'required'` when the model must call a tool.

## Recommendation rules

- Prefer `generateText` for simple examples, scripts, and tests.
- Prefer `streamText` for UIs, live output, agent-like flows, and event-driven integrations.
- When the user wants a lightweight agent loop without a full agent framework, `streamText` plus tools is a good fit.
