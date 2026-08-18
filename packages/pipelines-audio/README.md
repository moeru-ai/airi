# @proj-airi/pipelines-audio

Shared audio-pipeline orchestration for AIRI. The package owns reusable streaming, playback, text-chunking, and transcript-buffering policies without depending on an application UI.

## Use it for

- Building and scheduling speech playback pipelines.
- Parsing streaming-control events.
- Grouping nearby ASR fragments with `createTranscriptBuffer` before a product sends one spoken turn downstream.

## Do not use it for

- Vue or Electron lifecycle state.
- Provider credentials and product-specific error UI.
- Raw audio encoding utilities, which belong in `@proj-airi/audio`.

## Transcript buffering

```ts
import { createTranscriptBuffer } from '@proj-airi/pipelines-audio'

const buffer = createTranscriptBuffer({
  flushDelayMs: 1200,
  flush: async text => sendToChat(text),
})

buffer.push('hello')
buffer.push('world')
await buffer.dispose()
```
