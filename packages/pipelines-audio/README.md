# @proj-airi/pipelines-audio

Shared audio-pipeline orchestration for AIRI. The package owns input sharing, capture intervals, detector windows, playback groups, and text chunking. It does not depend on a UI.

## Use it for

- Sharing one audio source between recording, transcription, and detectors.
- Building and scheduling speech playback pipelines.
- Parsing streaming-control events.

## Do not use it for

- Vue or Electron lifecycle state.
- Provider credentials and product-specific error UI.
- Browser sources and file encoding, which belong in `@proj-airi/audio`.

## Input, capture, and observation

`AudioInput` shares one `LiveAudioSource`, for example a microphone. The first subscriber opens the source, and the last one to leave closes it.
A live source cannot wait for its readers. A file is an `AudioSource` but not a live source. Each consumer of a file opens its own stream, and that stream keeps native backpressure.
Each subscription, capture, and observer ends with its own abort signal. There is no lease to release.

```ts
const input = new AudioInput(source, { historyMs: 360 })

// capture() subscribes immediately. Its stream is continuous PCM for one interval.
const recording = capture(input, { signal })
const output = transcriber.transcribe({ audio: recording.stream, signal })

// The release control calls recording.finish(). Provider output continues until it completes.
for await (const event of output)
  showTranscript(event)
```

- `subscribe({ from, signal, maxBufferedMs })` returns blocks from now, or first replays retained history from `from`.
- `capture(input, { from, signal, maxBufferedMs })` adds `started`, `finish()`, `cancel(reason)`, and a gap check.
- `retain(signal)` returns a lease. Its holder calls `hold(position)` to keep history from that position.
- `observe(input, options, detector, onResult)` runs a detector over windows with `ordered` or `latest` scheduling.
- `audioWindows(shape)` is the windowing transform alone, for callers that schedule their own work.
- `createScope(signal)` owns one lifetime: an abort signal, reverse-order cleanups, and child scopes.

Observers support sliding windows and growing windows.
`preRollMs` keeps the history that pending detector windows need, including time spent in inference.
A sample gap restarts window growth. Frame coordinates never cross source connections.
A live source cannot wait for a slow reader. Each subscription, capture, and `ordered` observer has a `maxBufferedMs` limit, 60 seconds by default.
When a reader falls behind that limit, only that reader fails. The source and the other readers continue.
There are no mandatory detector deadlines. Plugins own their models, retained results, and disposal.

Captures and observers settle with `Outcome`: `finished` with a value, `cancelled` with a reason, or `failed` with an error.
A finished capture reports its interval. An observer finishes when the source ends and its last window is processed.

## Playback ownership

`Playback.openGroup()` creates an independent queue. Groups can play concurrently.
`finish()` drains one group. `stop({ fadeMs })` closes admission, discards queued clips, and waits for actual silence.
A cancelled clip does not cancel other clips in its group.

The driver owns the audio clock. `playback.nowMs()` reads it.
A clip can set `startAtMs` on that clock. The group still starts clips in order.
Each receipt entry reports `throughMs` and the rendered `interval` on the same clock.
A caller can start the next output relative to that interval, for example 2 seconds after a clip ends.
A group does not mix clips or schedule lanes against each other.
Playback knows no chat session, turn, or agent notification contract.
`Response` in core-agent supplies those conversation boundaries and producer ordering.

## Checks

Run `pnpm -F @proj-airi/pipelines-audio typecheck` and `pnpm -F @proj-airi/pipelines-audio test:run`.
Public tests cover capture independence, delayed history use, source gaps, file finalization, cancellation, and playback receipts.
