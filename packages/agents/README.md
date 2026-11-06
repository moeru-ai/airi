# @proj-airi/agents

Single-purpose model agents. The AIRI runtimes and the evals in `evals/` use the same agent code.

## What it does

Each agent owns one prompt, one request shape, and one reply parser. An agent does not choose a model or a provider. The caller gives it a `GenerateText` function.

| Agent | Entry | Use |
| --- | --- | --- |
| Tool card | `@proj-airi/agents/tool-card` | Writes an OpenUI Lang card that shows the results of one tool. It can search icons with the tools that the caller passes. |
| Voice end judge | `@proj-airi/agents/voice-end-judge` | Decides whether a paused spoken message is finished. |
| Voice transcription rephrase | `@proj-airi/agents/voice-transcription-rephrase` | Cleans up the speech recognition text of one spoken message. |

## How to use it

```ts
import { createVoiceTranscriptionRephraseAgent, generateTextFrom } from '@proj-airi/agents'

const agent = createVoiceTranscriptionRephraseAgent({ generateText: generateTextFrom(model, provider) })
const rewritten = await agent.rephrase(['uh can you hear me'], signal)
```

In stage-ui, pass a `GenerateText` that calls the LLM store. The store remembers the compatibility of each provider.

## When to use it

- Use it for an agent that an eval must measure without a Pinia store, a Vue app, or Electron.
- Use it for an agent that more than one runtime calls.

## When not to use it

- Do not put the runtime wiring here, for example settings, tracing spans, or voice plugins. Keep those in `packages/stage-ui`.
- Do not put the general agent runtime here. It is in `packages/core-agent`.
