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

## Capture and observation

`AudioInput` owns one source connection. Each capture and observer has an independent lifetime.
Source adapters supply tagged PCM frames. Media adapters encode files or create native streams.

```ts
const capture = input.capture({ delivery: 'pcm' })
const output = transcriber.transcribe({
  audio: { kind: 'pcm', stream: capture.media },
  signal,
})

// Read output while capture remains open. The release control calls capture.finish().
for await (const event of output)
  showTranscript(event)
```

- `finish()` seals accepted audio and drains encoding. It does not abort transcription.
- `cancel(reason)` discards only that capture. It leaves other captures and observers active.
- `Recording` adds pending source admission to file capture. It borrows its source.
- `close()` terminates the source and all its consumers.

Observers support ordered or latest scheduling, sliding windows, and growing windows.
`preRollMs` retains the history required by pending detector windows, including time spent in inference.
Source replacement and sample gaps invalidate incompatible windows. Frame coordinates never cross source identities.
There are no framework byte quotas, queue quotas, or mandatory detector deadlines.
Plugins own their models, retained results, and disposal.

## Playback ownership

`Playback.openGroup()` creates an independent queue. Groups can play concurrently.
`finish()` drains one group. `stop({ fadeMs })` closes admission, discards queued clips, and waits for actual silence.
A cancelled clip does not cancel other clips in its group.
Playback knows no chat session, turn, or agent notification contract.
`Response` in core-agent supplies those conversation boundaries and producer ordering.

## Checks

Run `pnpm -F @proj-airi/pipelines-audio typecheck` and `pnpm -F @proj-airi/pipelines-audio test:run`.
Public tests cover capture independence, delayed history use, source gaps, file finalization, cancellation, and playback receipts.
