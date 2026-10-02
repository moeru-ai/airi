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

## Intent behavior

A new intent can `queue`, `replace`, `interrupt`, or `interrupt-at-boundary` the active one.
`interrupt` cuts the playing segment. `interrupt-at-boundary` lets the playing segment finish, drops the rest of the active intent, and then plays the new one.
`stopByIntent` accepts `keepPlaying` for the same boundary stop.
Every turn ends with `onTurnEnd` or `onTurnCancel`. This includes an intent that was cancelled or stopped before it started.
`hasTurn` tells whether an intent of a turn still waits or plays.

## Speakable text

`createSpeakableTextFilter` removes written-only markup from streamed text before speech. Fenced code is dropped, and inline code keeps its text.
Heading, quote, and list markers at a line start are dropped. A link keeps its text and drops its address. Call `flush` after the last chunk.

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
