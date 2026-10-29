# Keep trace assets with the trace files

Status: proposed.

## Context

The [trace event stream ADR](2026-10-22-agent-trace-event-stream.md) defines the record format, the content policy,
and the disk recording. It leaves the files of large content open:

- `TraceAssetRef { $asset, mediaType, bytes }` exists in `packages/trace-kit/src/core/types.ts`. Nothing defines
  what `$asset` names, where the bytes are, or when they go.
- `stream.started` has an optional `uri` for a recorded media stream. Nothing writes a stream, and a URI to a growing
  file cannot be part of the retention of a trace file.
- `IOTraceRecordingService` in `apps/stage-tamagotchi/src/main/services/airi/io-trace-recording` writes flat JSON Lines
  files to `userData/io-traces`. It writes `<time>.jsonl` while recording is on, and `flight-<reason>-<time>.jsonl` for
  each flight recorder dump. A file holds records only.
- The IO tracer draws a waveform from a `level` series: one number for each VAD window. The trace keeps no audio, so a
  developer cannot listen to a turn that went wrong.

The goal is a place to keep what happened during use, at the moment that it happened. A later step can cut one
trajectory out of these files and turn it into an eval case. That step is not part of this decision. It only needs the
records and their assets to stay together on disk.

Producers run in Electron renderer windows, in stage-web tabs, and in stage-pocket. Only the Tamagotchi main process
has a file system that the app owns. Web and mobile do not store trace files.

trace-kit, timeline-canvas, and the tracer UI are not released yet. This decision changes their API without
compatibility support.

## Decision

### Asset identity

`$asset` is the SHA-256 hash of the bytes, as `sha256:<64 hex digits>`.

- The same bytes get the same reference. A TTS clip that plays two times is stored one time.
- A reader can verify an asset file against its reference.
- A reference does not depend on a path, a host, or a session. A file that moves to another machine keeps its
  references.

`TraceAssetRef` keeps its fields. `mediaType` is the media type of the bytes, for example `audio/ogg` or `audio/wav`.
`bytes` is the size.

### The asset store

The Tamagotchi main process owns one asset store at `userData/io-traces/assets`.

- An asset file is `assets/<first 2 hex digits>/<hash>`, with mode `0o600`. The directories have mode `0o700`.
- The store writes to a temporary file, verifies the hash, then renames the file. A crash does not leave a partial
  asset under a valid name.
- The store keeps no index. The references in the trace files are the index.

A producer in a renderer sends bytes to main through a new eventa contract next to the hub contracts in
`apps/stage-tamagotchi/src/shared`:

```ts
/** Stores bytes in the asset store and returns their reference. Main computes the hash. */
const ioTraceHubPutAsset = defineInvokeEventa<TraceAssetRef, { mediaType: string, bytes: Uint8Array }>(
  'eventa:invoke:electron:io-trace-hub:put-asset',
)
```

- Main computes the hash. A renderer cannot claim a hash for other bytes.
- One call carries at most 4 MiB. A producer splits larger content into chunks. A media stream uses stream chunks,
  below.
- `TraceSink` gets `putAsset(mediaType, bytes): Promise<TraceAssetRef>`. In Tamagotchi, the sink calls the contract.
  Without an asset store, the sink keeps the bytes in memory only. See
  [Sources without a store](#sources-without-a-store).

### Media streams

A media stream is a series of chunk assets. `stream.started.uri` goes away.

```ts
/** One chunk of a media stream, for example 10 s of encoded audio. */
interface TraceStreamChunk extends TraceUntrackedRecordBase {
  type: 'stream.chunk'
  streamId: string
  asset: TraceAssetRef
  /** The first and last position of the chunk, on the stream clock. */
  from: number
  to: number
}
```

- Each chunk is a complete file that a player can decode alone, for example one Ogg Opus file or one WAV file.
- A chunk is at most 10 s long. A cut of a time window then reads a few chunks only.
- The positions are on the stream clock (`audio:capture:<stream>` or `audio:playout:<stream>`). The clock snapshots of
  the stream convert them to the trace clock, so a cut of a span is exact to the clock uncertainty.
- The live buffer evicts a chunk record with the other records of its time.

### Files on disk

Each recording and each flight dump is a directory:

```text
userData/io-traces/
  assets/<aa>/<sha256>
  <time>/
    manifest.json
    trace.jsonl
  flight-<reason>-<time>/
    manifest.json
    trace.jsonl
```

`trace.jsonl` keeps one JSON line for each record, as before. `manifest.json` describes the directory:

```ts
interface TraceFileManifest {
  /** The layout of the directory. This decision defines layout 1. */
  layout: 1
  /** `TRACE_FORMAT` of the records. */
  format: number
  kind: 'recording' | 'flight'
  /** The dump reason of a flight directory. */
  reason?: string
  /** The time window on the trace clock, and the wall clock time of its start. */
  from: number
  to: number
  startedAt: string
  sources: { source: string, epoch: string }[]
  /** What the content policy kept: `false` removes content attributes and content assets. */
  keepsContent: boolean
  /** Every asset that a record of `trace.jsonl` references, and whether the store holds its bytes. */
  assets: { ref: TraceAssetRef, stored: boolean }[]
}
```

- The service writes the manifest when the directory starts, and again when it closes or rotates. A crash leaves a
  manifest without the last assets. A reader then scans `trace.jsonl` for the references.
- Rotation starts a new directory when `trace.jsonl` reaches its size limit. The open question of the trace ADR about
  the limit stays open.
- A Valibot schema validates the manifest. It stays next to the recording service.

### Content policy

An asset has a sensitivity, like an attribute. The attribute definition that holds the reference gives it.

- An asset of a `content` attribute goes to the store only when the files keep content. Otherwise the record keeps the
  reference, and the manifest lists it with `stored: false`. A reader then knows that the content existed, its size,
  and its type.
- A `secret` attribute cannot hold an asset reference. The schema rejects it.
- Stream chunks are `content`. Microphone streams have their own setting, off by default. A developer turns it on in
  the IO tracer settings.
- The live buffer keeps the bytes of content assets in memory, under the same rules as other content.

### Retention

- The service removes a recording or flight directory 7 days after its last write.
- It also removes the oldest directories while the total size of `io-traces` is above a limit. The default limit is
  2 GiB.
- After it removes directories, it removes each asset that no remaining manifest lists. This is a mark and sweep over
  the manifests. It runs when recording starts and when a flight dump starts, the same as the cleanup today.
- A directory that a developer wants to keep moves out of `io-traces`. The service does not touch other paths.

### Sources without a store

stage-web and stage-pocket have no asset store.

- Their sink keeps the bytes of assets in memory, in a limit of 64 MiB. It evicts the oldest bytes first. The records
  keep their references.
- The export of the tracer writes one directory with the same layout, so a file from the web reads like a file from
  Tamagotchi.
- A later decision can connect these sources to a Tamagotchi hub. They then send records and assets over an eventa
  transport, for example a WebSocket. The format and the `put-asset` contract do not change for that. Pairing,
  source names that the hub assigns, and flow control belong to that decision.

## API changes

These changes break the current API. No caller outside this branch uses it.

| Area | Change |
| --- | --- |
| `TraceAssetRef.$asset` | Always `sha256:<hex>`. The schema checks the form. |
| `stream.started` | Removes `uri`. |
| Records | Adds `stream.chunk`. |
| `TraceSink` | Adds `putAsset`. |
| Eventa | Adds `ioTraceHubPutAsset`. |
| `IOTraceRecordingService` | Writes directories with `manifest.json` and `trace.jsonl`, not flat `.jsonl` files. Adds the size limit and the asset sweep. |
| `analyze-io-traces` skill | Reads the directory layout. |

## Migration

1. Merge trace-kit, timeline-canvas, and the tracer UI as they are. The flat files stay until step 2.
2. Add the asset store, the `put-asset` contract, the directory layout, the manifest, and the sweep. Update the
   `analyze-io-traces` skill in its own commit.
3. Add `stream.chunk` and the playback chunks of TTS. TTS bytes are already downloaded, so this step adds no
   microphone audio.
4. Add the microphone stream chunks behind their setting.
5. Add play and download of the audio of a span to the tracer.

## Consequences

- A developer can keep a session or a failure dump with its audio and open it on another machine.
- A later eval step can cut a window by its `turn` or `run` ID and copy the listed assets.
- The store holds content on disk only with the developer settings on. With them off, files keep the same data as
  today.
- Main does a hash and a file write for each asset. A 10 s Opus chunk is about 20 KB, so a voice session adds little
  load.

## Out of scope

- Detection and grouping of failure patterns. Flight dumps and recordings keep the files. Their analysis is later
  work.
- The cut of a trajectory into an eval case, and the eval format.
- Remote sources and their transport.
- Upload of trace files to a server.

## Open questions

- The codec of microphone chunks: Opus keeps files small, WAV keeps the samples exact for ASR and VAD tests.
- Whether a flight dump keeps the audio of its window when the microphone setting is off.
