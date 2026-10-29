# Record agent and pipeline activity as one trace event stream

Status: proposed.

## Context

The IO tracer shows the voice and chat pipeline of one turn as bars on a time axis. After #3064 and #3065, it works
like this:

- Producers use the OpenTelemetry JS SDK. `startSpan` in `packages/stage-ui/src/composables/use-io-tracer.ts` creates
  spans. A `SimpleSpanProcessor` exports a span only when it ends.
- The wire format is `SerializedIOSpan` in `packages/stage-shared/src/types/io-trace.ts`.
- In Tamagotchi, every window sends its ended spans to `IOTraceHub` in the main process. The hub keeps recent spans
  and sends them to the disk recording and to open tracer views. stage-web reads its own tab and BroadcastChannel.
- The vocabulary is closed. `IOSubsystems` has 10 values. Colors, icons, and layout buckets are in 4 other places. A
  span without a subsystem is not drawn.

These problems remain:

1. **No open work.** A span is visible only after it ends. A slow LLM stream or a hung ASR request is invisible
   while it runs.
2. **Only spans.** A first token, a seal command, a duck, or a grant is an instant. A floor state or a playback queue
   is a state. A VAD probability or a turn-model score is a series. OTel spans express none of these well.
3. **Causes are not parents.** A barge-in, a speculative draft, an interjection, and an async memory write are caused
   by a turn, but they do not run inside it. They can end after the turn ends.
4. **Links are guessed.** stage-ui joins spans through process-local maps: `linkVoiceTurn`, `takeVoiceTurnParent`, and
   a 60 second composer heuristic. They break across windows and processes.
5. **Large parts are not traced.** The send queue, prompt composition, provider retries, xsai `step.*` events, tool
   calls, voice policy commands, plugin `watch` and `finalize` stages, playback rejects, the emotion queue, spark
   scheduling, and memory tools emit nothing.
6. **Plugins have no trace context.** `EventBaseMetadata` has only `event.id` and `event.parentId`.
7. **Time has no clock.** A time value does not say which clock it comes from. AIRI has at least five clocks: the wall
   clock, one monotonic clock for each process and window, the capture audio context, the playout audio context, and
   remote hosts. Benchmarks and datasets use positions in recorded audio.
8. **The voice model has two parties.** A conversation between several people and agents, a meeting, or two agents
   that talk by voice cannot be described.

Two planned features make these problems larger:
- A voice pipeline like [frankenvoice](https://github.com/teaspotato/frankenvoice). It has turn-taking states,
  barge-in verdicts, drafts, interjections, and paced TTS.
- Async signals and memory. An agent emits an intent. A sub-agent decides with a typed choice whether to create a
  memory, and what memory.

The main goal of the tracer is to show what happens where, now, while we build these pipelines.

This decision is based on the [agent trace literature review](../research/2026-10-23-agent-trace-literature-review.md).
The review covers trace data models and clocks, multi-party turn-taking, full-duplex spoken dialogue, agent
observability, and event sourcing. Earlier checks compared this design with Pipecat, LiveKit Agents, TEN Framework,
Vocode, Bolna, the OpenAI Realtime API, voice benchmarks, dialogue datasets, and observability tools.

## Decision

AIRI records activity as one ordered stream of trace records. The semantics follow the Chrome Trace Event Format
and Perfetto TrackEvent:
- Begin and end are separate records.
- Instants and counters are records of their own.
- Relations between records are links, not only parents.
- Each time value names its clock. A reader converts clocks with recorded correspondence points.

OTLP and Perfetto JSON are export formats only. They are not the internal model.

The model has three layers. Each layer depends only on the layers above it in this table.

| Layer | Holds | Changes when |
| --- | --- | --- |
| Core | Record types, structural fields, clocks, and the `define*` functions. It has no domain words. | Rarely. The format version changes. |
| Conventions | Attribute names, naming rules, measurement rules, and the content policy that apply to any domain | A convention version changes. |
| Profiles | The tracks, ID keys, states, pipelines, metrics, and exports of one domain | The domain changes. A plugin can bring its own profile. |

AIRI has two first-party profiles: `voice` (conversation, turn-taking, input, and output for any number of
participants) and `agent` (chat turns, tools, sub-agents, async decisions, and memory). A plugin profile has the key
`plugin:<id>`.

A projection turns records into view state. Projections are part of this decision. See [Projections](#projections).
Product UI does not read traces. It reads domain projections of eventa events. The trace is a sibling projection of
the same events.

### Why not the OpenTelemetry SDK

| Need | OTel SDK and OTLP | Trace record stream |
| --- | --- | --- |
| Draw open work | The exporter gets a span only at its end. `onStart` is in-process only. | `span.begin` is sent at once. |
| Instants during a span | Span events arrive with the span at its end. Live instants need log records. | `instant` is sent at once. |
| Counters | A separate metrics signal, joined by trace ID and span ID | `sample` in the same stream |
| Relations | Span links, set only at span start | `links` on any record |
| Clocks | Epoch nanoseconds that trust the host clock | A named clock on each value, with snapshots |
| Interop | Native | Mapped on export to OTLP and Perfetto JSON |

## Core

### Sources

A source is one producer: a window, a worker, the main process, a plugin, or the server. Each run of a source is an
epoch. A window reload or a plugin reconnect starts a new epoch.

- A source starts each epoch with a `source.started` record. It gives the format version, the runtime, and the
  profiles that it uses with their versions.
- `seq` counts records in one epoch. A record is identified by `(source, epoch, seq)`.
- A source ends an epoch with `source.stopped`. If a source disappears without it, the collector writes `source.lost`.
  Lost means that the IPC channel closed, that a heartbeat timed out, or that a new epoch of the same source started.
- The collector is a source too. It writes `source.lost` with its own `source`, `epoch`, and `seq`. The `of` field
  names the lost epoch and its last `seq`. Then the record does not use the `seq` space of the lost source.

### Clocks

Each time value has a clock. A clock is a key that `defineClock` declares, for example `mono:window:main`,
`mono:collector`, `audio:capture:<stream>`, `audio:playout:<stream>`, or `wall:server:api`.

- A producer writes the raw value of its own clock in `ts`. It does not convert.
- A `clock.snapshot` record gives the values of two or more clocks at one instant, with an uncertainty.
- A `clock.discontinuity` record says that a clock jumped or stopped. Sleep, a device change, and an audio context
  suspend are discontinuities.
- The collector adds `observedTs` on its own monotonic clock when it receives a record.
- The collector converts every value to one trace clock when it reads records: its own monotonic clock. Wall time is a
  label only.
- The conversion fits offset and drift over a window of snapshots. A drift of 50 ppm adds 3 ms each minute, so offset
  alone is not enough for long sessions.

These rules make the clocks hold:

- Every source runs a ping exchange with the collector at start, every 10 to 30 seconds, after a resume, and after a
  visibility change. This applies to local windows and workers too, because each has its own time origin. The
  collector keeps the sample with the smallest round trip, and records half the round trip as the uncertainty.
- A monotonic clock does not always continue through system sleep. The behavior differs on each operating system. So
  no source assumes that a monotonic clock is continuous across sleep. On the Electron `powerMonitor` suspend and
  resume events, and on a renderer freeze or visibility change, a source writes `clock.discontinuity` and new
  snapshots. A duration across a discontinuity is not computed from the monotonic clock.
- A media stream is a clock domain. Its records give positions in frames, not in milliseconds. The source writes a
  `clock.snapshot` for the stream at start, every few seconds, and on any change.
  - For capture, the snapshot pairs the worklet `currentFrame` with the monotonic time. It adds the capture latency
    when the platform reports it.
  - For playout, the snapshot comes from `AudioContext.getOutputTimestamp()` and adds `outputLatency`. A stream that
    reports no latency marks the converted time as estimated.
- A device change or a new audio context ends a stream and starts a new one.
- A viewer orders records by converted time. If a converted time puts an effect before its cause, the viewer moves the
  effect after the cause in the view only, and marks the record. Stored values do not change.

### Records

The type sketch shows the shape. Field names can change in the implementation.

```ts
type TraceValue = string | number | boolean | string[] | number[] | TraceAssetRef

/** Binary or large data, stored outside the record. */
interface TraceAssetRef { $asset: string, mediaType: string, bytes: number }

/** One record of the stream. */
interface TraceRef { source: string, epoch: string, seq: number }

/** A typed relation. `defineLink` declares the relation, for example `caused-by` or `retry-of`. */
interface TraceLink {
  to: TraceRef | { spanId: string } | { key: string, id: string | number }
  rel: string
}

/** Fields of a record without a track: a system record or an annotation. */
interface TraceUntrackedRecordBase {
  /** Stable ID of one producer, for example `window:main`, `main`, `collector`, `plugin:minecraft`, or `server:api`. */
  source: string
  epoch: string
  /** Emit order in the epoch. */
  seq: number
  /** The raw value of `clock` when the event happened. */
  ts: number
  clock: string
  /** Set by the collector on its own clock. */
  observedTs?: number
  /** Domain IDs by defined ID key. A stream uses it to name its actor. */
  ids?: Record<string, string | number>
  attrs?: Record<string, TraceValue>
}

/** Fields of a record about domain activity. */
interface TraceRecordBase extends TraceUntrackedRecordBase {
  /** A track path that matches a track definition, for example `participants/u_1/speech` or `plugin:minecraft/bots/b_2/planner`. */
  track: string
  links?: TraceLink[]
  /** `reported` by the producer, or `observed` from outside, for example from audio. The default is `reported`. */
  evidence?: 'reported' | 'observed'
}

type TraceStatus = 'ok' | 'error' | 'cancelled'

/** Who or what produced an annotation. */
interface TraceAnnotator {
  /** `rule`: deterministic code. `model`: an LLM or another model. `human`: a reviewer. */
  kind: 'rule' | 'model' | 'human'
  /** Stable name of the annotator, for example `wer` or `turn-judge`. */
  id?: string
  /** The model ID when `kind` is `model`. */
  model?: string
  /** A prompt hash, a rule set version, or a package version. */
  version?: string
}

type TraceRecord
  = | TraceUntrackedRecordBase & { type: 'source.started', format: number, runtime: string, profiles: { key: string, version: string }[] }
    | TraceUntrackedRecordBase & { type: 'source.stopped' }
    | TraceUntrackedRecordBase & { type: 'source.lost', of: { source: string, epoch: string, lastSeq: number }, reason: 'ipc-closed' | 'heartbeat-timeout' | 'epoch-replaced' }
    | TraceUntrackedRecordBase & { type: 'clock.snapshot', values: { clock: string, value: number }[], uncertaintyMs: number }
    | TraceUntrackedRecordBase & { type: 'clock.discontinuity', of: string, reason: string }
    /** A media stream. It has its own clock. Recorded streams have a URI. */
    | TraceUntrackedRecordBase & { type: 'stream.started', streamId: string, mediaType: string, rate?: number, channels?: number, uri?: string }
    | TraceUntrackedRecordBase & { type: 'stream.stopped', streamId: string }
    | TraceRecordBase & { type: 'span.begin', spanId: string, parentSpanId?: string, name: string, deadlineMs?: number }
    | TraceRecordBase & { type: 'span.update', spanId: string }
    | TraceRecordBase & { type: 'span.end', spanId: string, status: TraceStatus, reason?: string, message?: string }
    /** A span that the producer measures after it ends. Chrome trace `X`. */
    | TraceRecordBase & { type: 'span.complete', spanId: string, parentSpanId?: string, name: string, durationMs: number, status: TraceStatus, reason?: string }
    | TraceRecordBase & { type: 'instant', name: string, spanId?: string }
    | TraceRecordBase & { type: 'state', value: string, from?: string }
    | TraceRecordBase & { type: 'sample', values: Record<string, number> }
    /** About one second of a series. `ts` is the time of the first point. */
    | TraceRecordBase & { type: 'sample.chunk', intervalMs?: number, offsetsMs?: number[], values: Record<string, number[]> }
    | TraceRecordBase & { type: 'log', level: 'debug' | 'info' | 'warn' | 'error', message: string }
    /** Announces one definition. See [Definitions](#definitions). */
    | TraceUntrackedRecordBase & { type: 'definition', kind: string, key: string, data: unknown }
    /** A label, score, or evaluation that is added later. A producer decision is not an annotation. */
    | TraceUntrackedRecordBase & { type: 'annotation', target: { ref?: TraceRef, spanId?: string, ids?: Record<string, string | number> }, name: string, value?: TraceValue, label?: string, explanation?: string, annotator: TraceAnnotator }
```

These rules apply to records:

- Two kinds of records have no track, no links, and no evidence: system records and annotations.
  - A system record describes the trace itself: `source.*`, `clock.*`, `stream.*`, and `definition`. The event log
    shows it. The timeline draws `source.lost` as a global marker and `clock.discontinuity` as a shaded band. It does
    not draw the other system records.
  - The timeline draws an annotation on its target, for example as a score badge on a span.
- A span begins and ends on one track, in one epoch of one source. `parentSpanId` is for real nesting only, for
  example an attempt span inside its request span.
- A relation that is not nesting is a link. The defined relations are `caused-by`, `cancelled-by`, `retry-of`,
  `supersedes`, `revises`, `follows-from`, and `same-entity`. Profiles add more.
- A link can point to a domain ID. Then a plugin can link to a record of the host without its `seq`.
- `status` is closed. `reason` is open, and the conventions define its common values. A cancelled span has a
  `cancelled-by` link to the record that cancelled it.
- `span.update` adds attributes to an open span. Attributes merge shallowly in `seq` order, and the last write of a key
  wins. An array replaces the earlier array. The attributes of `span.end` merge last.
- An `instant` with `spanId` belongs to that span. Without `spanId`, it belongs to its track only.
- A `state` record can give the state that it leaves in `from`, the trigger as a `caused-by` link, and the rule that
  decided it in the `rule` attribute. Then the viewer can show why a state changed.
- A record carries the domain IDs that the producer already has. The producer does not look up an ID from another
  module. A producer gives an ID when the work starts, before its object exists.
- `ts` is the time of the event, not the emit time. A producer can backdate a record.
- A series with more than a few points each second uses `sample.chunk`: about one second of points in one record. A
  regular series gives `intervalMs`. An irregular series gives `offsetsMs` from `ts`. A single `sample` is for values
  that change rarely.
- `deadlineMs` marks an open span as overdue after that time. The viewer shows it. It does not end the span.
- A record with a position in a stream gives the attributes `stream.id`, `stream.start_frame`, and
  `stream.end_frame`. The snapshots of the stream clock convert them.
- An annotation records its annotator in `annotator`. A model decision while the pipeline runs stays a `decision.*` attribute
  of the producer record. Then one trace can be both a prediction and a labeled sample.
- An annotation can target a record, a span, or a set of IDs. A level is named by its ID key, for
  example a conversation-level or a topic-level annotation. A profile tells which ID keys it uses for levels.

### Definitions

A definition says what a key means: a track, an attribute, an ID key, a metric, a score, and the other kinds below.
Code declares each definition once with a `define*` function. The idea comes from the `defineMetric` and
`defineScore` functions of the vieval eval framework. AIRI uses its own shapes.

| Function | Declares |
| --- | --- |
| `defineTrack` | A track path pattern, its label, group, order, renderer, states, state owner, and retention hints |
| `defineAttribute` | An attribute key, its type, unit, label, sensitivity, and whether it can be aggregated |
| `defineIdKey` | An ID key, for example `turn` or `toolCall` |
| `defineLink` | A link relation, for example `retry-of` |
| `defineEndReason` | A value of `span.end.reason`, for example `interrupted` |
| `defineClock` | A clock key pattern, its unit, and whether it stops during sleep when that is known |
| `defineMetric` | A metric, its label, description, unit, the better direction, and how its values are found |
| `defineScore` | An annotation name for a score from 0 to 1, where higher is better, and its usual annotator |
| `definePipeline` | Pipeline stages and edges |
| `definePreset` | A view preset: a path query and a layout, for example "Barge-in" or "Memory" |
| `defineProfile` | A profile: its key, version, and the definitions above |

```ts
/** One string, or one string for each BCP 47 locale. The protocol already uses this type. */
type Localizable = string | Record<string, string>

interface TraceText {
  label?: Localizable
  /** What the key means and how to read it. The viewer shows it on hover. */
  description?: Localizable
}

interface TraceTrackDefinition extends TraceText {
  /** A path pattern. `{key}` matches one instance segment, named by an ID key, for example `participants/{actor}/speech`. */
  path: string
  /** An open string. Profiles give their own groups. */
  group: string
  order: number
  /** One track can combine kinds, for example `['spans', 'state']`. */
  render: ('spans' | 'instants' | 'state' | 'series')[]
  color?: string
  icon?: string
  unit?: string
  /** The values of a state track, in legend order. */
  states?: string[]
  /** The source that writes the state of this track. A record from another source is a warning. */
  stateOwner?: 'single' | 'any'
  /** Retention and sampling hints for the collector. */
  retention?: { keep: 'latest' | 'window', maxHz?: number, fullRateS?: number }
  /** The `{key}` that names the entity of the track, for example `actor` or `agent`. The viewer draws one lane for each entity. */
  entity?: string
  /** How the spans of the track show on the entity lane: `waiting` (hatched), `thinking` (light), or `active` (solid). */
  activity?: 'waiting' | 'thinking' | 'active'
  /** An instant that changes the activity inside a span, for example `llm.first_chunk` from `thinking` to `active`. */
  activitySplit?: { instant: string, activity: 'waiting' | 'thinking' | 'active' }
}

interface TraceAttributeDefinition extends TraceText {
  key: string
  type: 'string' | 'number' | 'boolean' | 'list' | 'asset' | 'json'
  unit?: string
  /** `content` is user content. `secret` must never leave the process. */
  sensitivity: 'none' | 'content' | 'secret'
  aggregatable?: boolean
}

interface TraceMetricDefinition extends TraceText {
  key: string
  unit?: string
  /** Whether a larger value is better (`higher`) or a smaller value is better (`lower`). */
  better?: 'higher' | 'lower'
  /** ID keys that split the metric, for example `['from', 'to']` for a matrix of participant pairs. */
  dimensions?: string[]
  /** The default is `['p50', 'p95']`. */
  aggregate?: ('p50' | 'p95' | 'p99' | 'mean' | 'sum' | 'count')[]
  /** `session` keeps the values of the whole session. `window` uses the buffer only. */
  scope?: 'session' | 'window'
  value:
    /** The value is an attribute of a record. Any profile, a plugin profile too, can use this kind. */
    | { kind: 'attribute', track: string, record: TraceRecord['type'], attribute: string }
    /** A first-party projection computes the value. */
    | { kind: 'derived', projection: string }
}

interface TraceScoreDefinition extends TraceText {
  key: string
  /** What usually produces the value. An annotation can name another annotator. */
  annotator?: TraceAnnotator
}

interface TracePipelineDefinition extends TraceText {
  key: string
  /** A stage can be a path pattern, so that a stage has one instance for each participant or bot. */
  stages: { key: string, label: Localizable, tracks: string[] }[]
  /** `kind` is open. The conventions define `cmd`, `data`, `audio`, and `signal`. Cycles are allowed. */
  edges: { from: string, to: string, kind: string, name: string }[]
}
```

This example declares the response latency of the voice profile:

```ts
const responseLatency = defineMetric({
  key: 'voice.response_latency',
  label: { 'en': 'Response latency', 'zh-Hans': '响应延迟' },
  description: {
    'en': 'From the speech end of the previous speaker to the first audible frame of the next speaker.',
    'zh-Hans': '从上一位说话人说完，到下一位说话人第一帧可听见的声音。',
  },
  unit: 'ms',
  better: 'lower',
  dimensions: ['from', 'to'],
  value: { kind: 'derived', projection: 'voice.floor-transfer' },
})
```

These rules apply to definitions:

- A source announces a definition with a `definition` record before the first record that uses it, and again when it
  changes. A viewer keeps the latest definition of each kind and key. Definitions are in the pinned set of the
  collector. Then a file describes itself after a plugin changes or goes away.
- A definition has an owner profile. Its key has the prefix of that profile.
- A metric of kind `attribute` needs no code in the viewer. A plugin can declare its own metrics with labels, a unit,
  and a direction in this way. A metric of kind `derived` needs a projection. In the first version, only first-party
  code defines projections.
- A score is from 0 to 1, and higher is better. Any other value of an annotation, such as a WER, is a metric.
- A key without a definition still works. The viewer shows the raw key, without a label or a unit.

These rules keep the layers apart:

- The core does not import a profile. A profile imports the core and the conventions.
- A viewer ignores a record type that it does not know. It keeps and shows an attribute that it does not know.
- `source.started.format` is the format version. A reader upcasts an older format. It rejects a newer major version.
- A plugin attribute key starts with `plugin.<id>.`. A plugin track path, ID key, or pipeline key starts with
  `plugin:<id>`.
- A track path names instances, so several bots, channels, participants, or sparks do not overwrite each other. A
  record on a path that matches no pattern is still drawn in a group named "Other", with a color from a hash of the
  path.

## Conventions

The conventions have a version. The trace package exports it, and exports write it into their metadata.

### Names

- An instant name has the form `<object>.<past-tense verb>`, for example `speech.started` or `output.truncated`.
- A command has an imperative name, for example `response.cancel`. Its receipt has a `caused-by` link to the command.
  Then the viewer shows the delay between a command and its receipt.
- A name with a unit has a unit suffix, for example `_ms`, `_frames`, or `_tokens`.
- A list attribute that packs many items has a `_list` suffix, for example `asr.words_list` as
  `[text, start_frame, end_frame, ...]`. Use it when one record for each item is too many.
- A JSON attribute has a `_json` suffix and a size limit.

### Attributes

| Area | Names |
| --- | --- |
| Model and tools | The `gen_ai.*` names of [semantic-conventions-genai](https://github.com/open-telemetry/semantic-conventions-genai). The trace package pins one commit, because the conventions have development stability. It does not use open proposals such as `gen_ai.agent.turn`. |
| Provider IDs | `provider.request_id`, `provider.response_id`, `provider.item_id`. Then a trace joins with provider logs. |
| Retries | A request span holds one attempt span for each try, with `retry.count` and `fallback.index`. |
| Measurement quality | `censored: true` on a measurement that an interruption cut short. `warmup: true` on a cold start. |
| Decisions | `decision.choices`, `decision.verdict`, `decision.p`, `decision.threshold`, `decision.reason`, `decision.latency_ms`, `decider` |
| Messages between stages | `msg.kind`, `msg.name`, `msg.to`. The receiving record has a `caused-by` link to the sending record. |
| Interruptibility | `work.interruptible` |
| Scope IDs | Only the `conversation` ID key maps to `gen_ai.conversation.id`. The `topic` ID key maps to `airi.topic.id`. |

### Measurement

- A producer records each measurement. It does not record averages. Projections aggregate.
- A measurement is a duration between two records, or a count or a ratio of records. A profile defines its metrics
  with their start and end records.
- Reports show p50 and p95. A mean is shown only next to them. p95 needs 100 samples or more.
- A ratio is a ratio of sums, not a mean of ratios.
- Censored, warm-up, and failed measurements are left out of percentiles. They are counted on their own.
- A summary of a span, such as a latency or a usage count, is an attribute of that span. It is not a `sample`. A
  `sample` is for continuous values only, for example a probability or a queue depth.

### Content

- Each attribute definition marks the attribute as `none`, `content`, or `secret`. The conventions define the `gen_ai`
  content attributes: `gen_ai.system_instructions`, `gen_ai.input.messages`, `gen_ai.output.messages`,
  `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`, and `gen_ai.memory.query.text`.
- The collector applies the policy before the buffer and the disk. The live buffer keeps content. Files on disk and
  exports remove content, unless a developer setting is on.
- The collector scrubs secrets from every attribute, including attributes that are not content. Tool arguments can
  hold API keys.
- Large content, such as audio or a long prompt, is an asset reference, not an inline value.

## Profiles

### Voice profile

The voice profile describes a conversation with any number of participants. A participant is an actor of the chat
domain: a person, an agent, or a bot. A direct chat between one person and one agent is one case of the model. No
track, metric, or export assumes two parties.

#### Tracks and states

| Track path | Render | States |
| --- | --- | --- |
| `participants/{actor}/state` | `state` | `initializing`, `idle`, `listening`, `thinking`, `waiting`, `speaking`, `away` |
| `participants/{actor}/wake` | `spans` | |
| `participants/{actor}/input` | `spans`, `series` | |
| `participants/{actor}/speech` | `spans`, `instants` | |
| `participants/{actor}/asr` | `spans`, `instants` | |
| `participants/{actor}/rephrase` | `spans` | |
| `participants/{actor}/text` | `instants` | |
| `participants/{actor}/output` | `spans` | |
| `participants/{actor}/tts` | `spans`, `instants` | |
| `participants/{actor}/playback` | `spans`, `state`, `series` | `idle`, `playing`, `paused` |
| `conversations/{conversation}/floor` | `instants` | |
| `conversations/{conversation}/endpoint` | `instants` | |
| `conversations/{conversation}/speculation` | `state` | `open`, `holding`, `dropping` |

- The participant state is the five-state model of full-duplex dialogue surveys (`idle`, `listening`, `speaking`,
  `waiting`, and overlap), plus `thinking`, `initializing`, and `away`. Overlap is not a participant state. It is a
  floor with two or more holders.
- The floor is a set of holders. `floor.taken` and `floor.released` instants give the `actor`. The floor projection
  derives `floor.holders`. An optional `floor.id` allows parallel floors, for example side talk.
- `participants/{actor}/input` holds a span for each speech input and two series of the detector windows: the
  microphone `level` and the VAD `probability`. One window gives both values, so they share one track and one clock.
- `participants/{actor}/playback` holds a span for each played clip and the `level` series of its decoded audio. The
  levels go out when the clip stops, and only up to the stop.
- `participants/{actor}/text` holds model text that runs ahead of the audio. Planned text and heard text stay apart.
- A false interruption pauses playback and resumes it. The playback span does not end.

ID keys: `conversation`, `turn`, `turnSeq`, `input`, `response`, `segment`, `speculation`, `interrupt`, and `actor`.
No common turn ID exists in other tools, so AIRI defines its own. `conversation` maps to `gen_ai.conversation.id`.

- An annotation with the target `{ conversation }` is a conversation-level annotation. The target `{ turn }` is a
  turn-level annotation.
- Speech start gives the input ID before the input exists, as the OpenAI Realtime `speech_started` event gives the
  future `item_id`.

#### Who to whom

- A turn and a speech span have `turn.addressees`, a list of actor IDs, or `all`.
- A floor transfer has `floor.selection`: `selected`, `self-selected`, or `continued`. It also has `floor.take.reason`:
  `addressed`, `silence`, `self-select`, or `tool-result`.
- `interrupt.started` has `interrupter` and `interrupted`. `backchannel.detected` has `listener` and `target`.
- A scheduler decision of who speaks next uses the `decision.*` attributes, with the candidate actors in
  `decision.choices`. "When" and "who" are two decisions with two records.

#### Streams

- Each participant has its own input stream: the local microphone, each remote person, and the playout of each agent.
- A mixed microphone with diarization creates provisional actors. The chat domain `speaker-binding` event maps them
  later.
- For each agent, the profile records what that agent heard: the mixed input at that agent.
- The playout of an agent is marked as self-audio for that agent, so that its own voice does not trigger its VAD.
- `stream.started` records the VAD model and its settings, because benchmark timing depends on them.

#### Records that a voice pipeline must emit

| Stage | Records |
| --- | --- |
| Streams | `stream.started` for each participant stream, and stream clock snapshots |
| Speech | A `speech` span for each speech segment of each participant, with stream frames. The VAD stop and the VAD hangover as attributes, because speech end is the VAD stop minus the hangover. |
| End of turn | `endpoint.decided` for each decision, with `decision.p`, `decision.threshold`, `decision.verdict`, and `decision.reason` (`silence`, `punctuation`, `semantic`, `provider-final`, `utterance-end`, `idle-timeout`). `turn.ended` when the pipeline commits. `turn.held` for a pause inside a turn. |
| ASR | A span for each utterance. `transcript.partial` for each partial, with its text. `transcript.final`. `asr.words_list` with word frames. |
| Model | A request span with attempt spans. `llm.first_chunk` and `llm.first_answer` instants. A `sample.chunk` of chunk arrivals with token counts. Usage on `span.end`. |
| Tools | A span for each tool call, with `toolCall` and `toolGroup` IDs. A filler speech state while a tool runs. |
| TTS | A request span. `tts.first_byte` and `tts.first_audible` instants. Audio duration on `span.end`. Alignment as a `_list` attribute. |
| Playback | A span for each segment on the playout stream. The first played frame and the stop frame. |
| Overlap | `interrupt.started` with the overlap start. A gate decision with two attributes. `overlap.intent` is `interruption`, `backchannel`, `collaboration`, `side-talk`, `background`, or `noise`. `overlap.response` is `continue`, `adapt`, or `yield`. |
| Heard output | `output.truncated` with `heard.frames`, `planned.frames`, `heard.chars`, `heard.text` (content), and `heard.method` (`playback-ack`, `position`, `estimate`) |

The chat domain trims a cut-off reply in the history to the `output.truncated` values. Then the trace and the
context agree.

An end-to-end speech model does not expose its decisions. Then the profile derives floor, speech, and overlap records
from the audio streams and provider events, with `evidence: 'observed'`.

#### Metrics

The voice profile declares each metric with `defineMetric`, with English and Chinese labels and descriptions, a unit,
and the better direction. Each metric is defined for an ordered pair of participants (from, to). A projection aggregates the pairs into an N×N
matrix. The dyadic metrics of the benchmarks are the cells of a 2×2 matrix.

| Metric | Definition |
| --- | --- |
| Floor transfer offset | For a transfer from A to B: the speech start of B minus the speech end of A. A negative value is an overlap. |
| Response latency of B | The floor transfer offset of transfers to B, split by "B was addressed" and "B self-selected". For an agent, the end is its first audible frame on its playout stream. |
| Stop latency | For an interruption of B by A: the overlap start → the playout stop of B |
| Take-over rate | The share of transfers that B takes, for each context: after a turn end, after a pause, after a backchannel |
| Wrong take-over | B takes the floor while another participant was addressed |
| Missed turn | B is addressed and does not respond in a budget |
| Overlap | Overlap time for each pair, and time with three or more holders |
| Interruption | Count, yield rate, and stop latency for each (interrupter, interrupted) pair |
| Talk share | Speech time of each participant over total speech time |
| End-of-turn quality | The false cutoff rate at a latency budget, and speech end → `turn.ended` |
| Component latency | `llm.ttft_ms`, `llm.ttfat_ms`, `llm.tpot_ms`, `tts.ttfb_ms`, `tts.ttfa_ms`, `asr.final_ms`, `rtf` |

The component latency names have these definitions:

| Name | Start → end, or formula |
| --- | --- |
| `llm.ttft_ms` | request sent → first content chunk |
| `llm.ttfat_ms` | request sent → first answer token or tool call, after reasoning |
| `llm.tpot_ms` | `(e2e - ttft) / (output tokens - 1)`, for more than one token |
| `llm.chunk_gap_ms` | the gap between two chunk arrivals. Other tools call this "ITL", with two different meanings. |
| `tts.ttfb_ms` | request sent → first audio byte |
| `tts.ttfa_ms` | request sent → first audible frame, after leading silence |
| `asr.final_ms` | speech end → final transcript |
| `rtf` | `Σ compute time / Σ audio duration` |

A projection also splits each response latency into contributions: end of turn, ASR final, model first token, TTS
first audio, and playout. The sum of the contributions is the total. A computed contribution is marked.

MOS, LLM judge scores, and WER depend on the judge or a reference. They are annotations, not metrics of the profile.

#### Exports to datasets

A recorded session can become an eval or training sample. The exporters use stream frames, not converted times.

| Target | Uses |
| --- | --- |
| One channel for each participant | A multi-channel WAV or one WAV for each actor, plus RTTM with one speaker label for each actor |
| Full-Duplex-Bench folder and Moshi format | A projection for one target agent: the agent on one channel, all other participants mixed on the other. The export metadata records the projection. |
| smart-turn clips | 16 kHz clips of 8 s or less that end at each `endpoint.decided`, with the verdict and the target actor |

### Agent profile

The agent profile covers chat turns, tools, sub-agents, and async work. Its ID keys are `topic`, `round`, `request`,
`message`, `toolCall`, `toolGroup`, `intent`, `decision`, `job`, `agent`, and `run`. `run` groups the trials of one
eval task.

- Every record of a sub-agent carries the `agent` ID. Then the caller agent is not lost.
- The chat domain `causation` maps fully: `parentId` becomes a `caused-by` link, and `rootId` and `chainId` become the
  ID keys `causationRoot` and `causationChain`.
- An annotation with the target `{ topic }` is a topic-level annotation. A topic contains several conversations.
- A handoff is an `agent.handed_off` instant with a `caused-by` link. It is not a span type, because OTel has no
  handoff span.
- A sub-agent has a state track with `running`, `paused`, `waiting`, and `done`.
- These end reasons are defined for an agent loop: `max-steps`, `handed-off`, and `awaiting-input`.
- Failure labels from taxonomies such as MAST use annotation names under `failure.<taxonomy>.<mode>`.

The chat domain model defines `signal`, `schedule`, `sub-agent`, and `outcome` events. The agent profile records
async work as follows:

```
turn T ──instant intent.emitted { intent, kind: memory }
          └─caused-by← span decision { decision, decider, choices, verdict, p, reason }   track: background/decision
                        └─caused-by← span memory.write { op, keys }                       track: background/memory
                                      └─instant outcome { created | merged | skipped }
```

- These records are on Background tracks. They can end after the turn ends.
- An end-of-turn decision, an overlap gate, an interjection check, a triage decision, and a memory decision use the
  same `decision.*` attributes. One renderer shows them all.

## Packages and boundaries

| Module | Owns |
| --- | --- |
| `packages/trace-kit` (`@proj-airi/trace-kit`) | The core and the conventions: schemas (Valibot), the `define*` functions, clock conversion, `TraceSink`, a no-op sink, the collector buffer, projections, and the exporters. The first-party profiles are subpath exports, for example `/voice` and `/agent`. The root export does not import them. |
| `packages/core-agent`, `packages/pipelines-audio` | Producers. They accept a `TraceSink` and use the profile constants. |
| `packages/plugin-protocol` | Trace fields of protocol events, and the `trace:emit` and `trace:subscribe` events |
| `packages/stage-ui` | Producers for stage-ui modules, and the bridge from local sinks to the collector |
| `packages/stage-pages` | Tracer views |
| `apps/stage-tamagotchi` | The collector in the main process, disk and audio recording, and IPC contracts |

The trace package depends only on `@moeru/std` and `valibot`. Then core-agent, pipelines-audio, and plugin-protocol
can depend on it without a cycle. core-agent does not depend on stage-shared today, so the contracts cannot stay
there.

`TraceSink` is a dependency at an external boundary, because the records leave the module. Producers receive it the
same way as their other boundary dependencies. A module without a sink uses the no-op sink and pays only one call.
A sink that sends to several sinks catches the error of each one, so one failing sink does not stop the others.

```ts
interface TraceSink {
  emit: (record: Omit<TraceRecord, 'source' | 'epoch' | 'seq' | 'observedTs'>) => void
  /** Tells whether a track path has a reader or an active capture preset. A producer can skip a costly series. */
  wants: (track: string) => boolean
}
```

## Producers

Producers prefer projection over new calls. Many modules already emit eventa events. A projection subscribes to
them and writes records. It does not add trace calls inside the logic.

| Source | Records |
| --- | --- |
| Voice controller (`VoiceController.events`) | Input lifecycle as spans. Signals as instants or series: speech activity score, echo gate, pause, end judgement. Policy commands (seal, cancel, interrupt) with the rule that proposed them. |
| Voice plugins | `watch` and `finalize` stages as spans, with timeouts and errors |
| Chat orchestrator runtime | Queue wait, enqueue, and dequeue. Prompt composition and context build. Compaction. Model and scope changes from `resolveStep`. Each round from xsai `step.*`. Retries with backoff. Tool calls. Interrupt receipts. |
| LLM stream | First chunk and first answer as instants. Chunk arrivals as a series at 10 Hz or less. |
| pipelines-audio eventa map | Segments, TTS request and result, playback start, end, interrupt, and reject, intent and turn events, queue overflow |
| Speech text | Markdown segmentation and `toSpeechText` preprocessing as spans |
| Avatar | Emotion queue and motions as instants. Lipsync as a series only while a reader wants it. |
| Spark and context | Each spark as a span keyed by its spark ID, with its states. Context bridge input and output. `context:update` ingestion. |
| Memory and recipes | Memory tool reads and writes. Recipe and automation triggers. |
| Renderer runtime | The frame timings and VRM loading that `packages/stage-ui-three/src/trace` now keeps in a separate system. Event loop stalls as a series. |
| Session start | One `session.started` instant with a snapshot of the voice, model, and provider options |

These rules apply to producers:

- A series is sampled at 20 Hz or less, and sent as `sample.chunk` records. A producer emits a series only while
  `wants(track)` is true.
- Audio does not produce one record for each frame. An edge with audio has a `sample` of frame rate and queue depth
  while a reader wants it.
- A record that is an external input to a policy has `replay.input: true`: VAD scores, ASR partials, provider chunks,
  and clock ticks. A test harness can then feed a recorded trace into a new policy and compare its decisions. The
  harness itself is out of scope.

## Collection

### Hosts

| Host | Collector | Transport |
| --- | --- | --- |
| Tamagotchi | The hub in the main process. `IOTraceHub` carries records instead of spans. | Each window sends records through eventa. The main process, plugins, and the server channel write to the hub directly. |
| stage-web | A hub in the leader tab. A Web Lock elects the leader, as the context bridge does. | BroadcastChannel between tabs. A new leader asks the other tabs to send their buffers again. |
| stage-pocket | A hub in the page. The app has one page. | In memory |

stage-web does not use SharedWorker. Chromium on Android disables it. See the notice in
`packages/stage-ui/src/stores/mods/api/context-bridge.ts`.

The collector runs the clock ping exchange with each source. See [Clocks](#clocks).

### Buffer

The collector keeps two stores. They do not take space from each other.

| Store | Holds | Limits |
| --- | --- | --- |
| Event buffer | All records except series | 30 minutes and 16 MB in memory. The oldest records go first. |
| Series rings | One columnar ring for each series track: `Float64Array` times and `Float32Array` values | 30 minutes. The last 5 minutes keep the full rate. Older points keep the minimum and maximum of each second. |

A track definition can change the time limit and the full-rate window of its series ring.

The limits come from a simulation of a 30 minute voice session. It had a turn about every 15 seconds and about 85
records for each turn. The script is [`trace-buffer-simulation.mjs`](../research/scripts/trace-buffer-simulation.mjs).

| Case | Records each second | Size of 30 minutes | One buffer of 5000 records covers |
| --- | --- | --- | --- |
| 2 participants, no viewer | 3.4 | 1.6 MB | 25 minutes |
| 3 participants, a turn every 5 seconds, no viewer | 4.9 | 2.3 MB | 17 minutes |
| 3 participants, viewer open, one record for each point | 64.8 | 20 MB | 1.3 minutes |
| 3 participants, viewer open, one-second chunks | 6.9 | 3.4 MB | 12 minutes |

A count limit fails in each case. The series also push ended turns out of a shared buffer. With two stores, the event
buffer covers the same time as without a viewer, and the series rings keep 30 minutes in less than 1 MB. The sizes are
JSON sizes. Objects in memory are often 2 to 3 times larger, so 16 MB covers 30 minutes of events with room left.
Measure the real rates after step 5 of the migration, and change the limits with that data.

A pinned set stays outside the limits:
- the latest `source.started` of each live epoch
- each live stream and its latest clock snapshots
- each open span, with its updates merged
- the latest `state` of each state track
- the latest `definition` record of each kind and key

When the buffer evicts records, it keeps a `gap` marker with the evicted time range. The feed sends it, so a late viewer
sees the gap.

### Subscription

A viewer subscribes to a collector through `IOTraceSource`, which becomes `TraceFeed`. The collector sends, in order:
1. the pinned set
2. the buffered records
3. a `caughtUp` marker with a cursor: the last `seq` of each epoch
4. each later record

`gap` and `caughtUp` are feed markers, not trace records. They have no `source`, `epoch`, or `seq`, and the disk
recording does not write them.

The viewer also tells the collector the track paths that it shows. The collector sends that set to the producers
through `wants`.

### Order and lateness

- The collector drops a record with a `(source, epoch, seq)` that it has seen.
- Each source has a watermark: the collector does not expect a later record from it with an earlier time. Before the
  watermark, the view is final. After it, the view is provisional.
- A record that arrives later than the allowed lateness goes to a `late` counter and to the event log. It does not
  change the final view.
- A `span.end` without its begin becomes a span that starts at the left edge of the buffer, with a "start missing"
  marker. An update without its begin waits for the allowed lateness, then it is dropped and counted. A link to an
  evicted record draws a stub marked "evicted".
- `source.stopped` or `source.lost` makes the open spans of the old epoch "abandoned" in the view. When a new epoch
  starts before the old epoch stops, the collector first writes `source.lost` with the reason `epoch-replaced`. The collector does not invent a `span.end`. The state tracks that the source owns become "unknown".

### Recording

- The disk recording writes one JSON line for each record. It rotates files by size and keeps them for 7 days. Each
  file has a sidecar index for each time block and track, with a snapshot of the pinned set for each block. A replay
  seek then reads one snapshot and one block.
- When a span ends with `error`, or an open span passes its `deadlineMs`, the collector writes the preceding minute of
  the buffer to disk. It does this when disk recording is off too. These limits apply:
  - Each span triggers a dump one time at most.
  - Each source has a cooldown, for example 1 minute. A trigger in the cooldown does not start a new dump.
  - If the window of a new dump overlaps the previous dump, the collector appends to the previous file.
- A capture preset turns on tracks before a viewer opens. A developer setting or an environment variable selects it.
- The audio recording is a separate setting. When it is on, the collector writes each participant stream as chunk
  assets. The dataset exports need these files. The
  [trace assets ADR](2026-10-29-trace-assets-and-file-persistence.md) defines the assets, the directory layout, and
  their retention.

## Projections

A projection turns records into view state. The timeline, the pipeline view, the metrics, the event log, and the
replay tests are projections of one feed. Live views and replays then give the same result.

```ts
interface TraceApplyContext {
  /** The record came from the pinned set. */
  pinned: boolean
  /** The record arrived after the watermark of its source. */
  late: boolean
}

interface TraceProjection<State, View = State> {
  /** A stable key, for example `timeline`, `pipeline`, or `voice.floor-transfer`. */
  key: string
  reset: () => State
  /** Pure. No I/O, no clock, no Vue refs. It tolerates orphans and duplicates. */
  handleRecord: (state: State, record: TraceRecord, context: TraceApplyContext) => State
  /** The collector evicted records. A projection that keeps window statistics updates them. */
  evict?: (state: State, range: { from: number, to: number }) => State
  finalize?: (state: State) => State
  select: (state: State) => View
  snapshot?: (state: State) => unknown
  restore?: (data: unknown) => State
}
```

These rules apply to projections:

- The apply order is the `seq` order of each epoch, with epochs interleaved in arrival order. The display order is
  converted time. The two orders are separate.
- A state track has one owner source unless its descriptor says `any`. The current state is the record with the
  latest converted time. A backdated state goes into the history but does not replace a later state.
- A metric says whether it covers the buffer window or the whole session. A session metric keeps its accumulators
  outside the evicted buffer.
- The state of a projection is plain objects and typed arrays, marked with `markRaw` or kept in a `shallowRef`. One
  version counter changes at about 20 Hz. Components read through selectors keyed on that counter. Records are not
  reactive.
- Replay feeds records in the apply order with their recorded `observedTs`. A projection does not read `Date.now()`.
- Indexes that projections share: by span ID, by record key, a reverse index of links, and by ID key and value.

## Viewer

The viewer has three views of the same projections. One selection is shared by all three.

| View | Answers |
| --- | --- |
| Timeline | When something happened, how long it took, and what waited for what |
| Pipeline | Where the pipeline is now, or at the scrub cursor: one node for each stage instance, with its state |
| Event log | What happened exactly: a filtered record list with attributes, late records, and counters |

The timeline follows these rules:

- **Storage.** Each track keeps columns: `Float64Array` starts and ends, and arrays for kinds and labels. The columns
  are in arrival order. A sorted index for the visible window is rebuilt when it is needed. Spans narrower than 2 px
  merge into one fill. Instants that are too dense become a histogram.
- **Live clock.** One `requestAnimationFrame` loop writes two CSS variables: `--now` and `--axis`. An open span gets
  its width from CSS: `clamp(0, now - start, duration)`.
- **Follow-latest.** The axis grows in steps of 10 s, 30 s, and 60 s, with exponential smoothing. It keeps about 4 s
  of space ahead of now. A scroll or a zoom by the user pauses following for 2.5 s. A Follow switch turns following
  on or off.
- **Scrub cursor.** A cursor selects a time. The pipeline view and the state tracks show the latest state at that
  time.
- **Provisional region.** The time after the earliest watermark is drawn as provisional.
- **Idle gaps.** A switch collapses idle time between turns, so short turns do not shrink.
- **Entity lanes.** Each entity has one lane: a participant, an agent, a conversation, or a group of tracks without an
  entity. The tracks of one entity value share the lane, also across profiles. The lane draws the spans of its tracks
  as layered segments by `activity`. A lane expands into the rows of its tracks.
- **Handoffs.** A `caused-by` link to a span on another lane, and a parent on another lane, draw a connector with a dot
  at each end. A child on another lane also draws a return connector at its end. A failed segment shows a cross, and a
  segment with a `retry-of` link shows a retry mark.
- **Layout.** In an expanded lane, each track is a row. Nested spans in one lane stack by depth. Spans that overlap at the
  same depth get sub-lanes. A sub-lane is assigned once, at begin. An empty track folds into a count. A track with an
  error stays visible. Overdue, abandoned, and late items are marked.
- **Links.** A hover or a click shows the links of the selected record in both directions. Other records dim. A state
  change shows its trigger and its rule.
- **Presets.** A view preset selects track paths and a layout. Profiles ship presets.
- **Metrics.** The viewer shows the metrics of the loaded profiles, with their labels and units, as p50 and p95, and the latency breakdown of
  the selected turn.
- **Animation.** animejs runs the discrete transitions: a new item, a link arrow that draws in, and a detail card
  that moves between items. The live clock does not use animejs.
- **Rendering.** The first version uses DOM elements with virtualization. Dense series and lanes move to a canvas in
  a worker later.

The pipeline view takes its stages and edges from the pipeline descriptors. A stage pattern has one node for each
instance. The state of a stage is the latest record on its state track. A stage without a state track is `busy` while
it has open spans, `error` after a span ends with an error, and `idle` otherwise. The view also finds edges from links
between tracks of different stages, and marks an edge that no descriptor declares.

The viewer is for live work and for the AIRI semantics. Deep offline analysis uses the Perfetto export in Perfetto UI.

The uiarc agent timeline is a paid component. AIRI reuses its ideas only: the CSS clock, the axis steps, the follow
pause, and the dimmed path. AIRI does not copy its code.

## Plugins

- `EventBaseMetadata` gets an optional `trace` field: `{ traceparent?: string, ids?: Record<string, string | number>, links?: TraceLink[] }`.
  `traceparent` is the W3C trace context. server-runtime keeps the field when it relays an event. MCP calls carry the
  trace context in `params._meta`.
- A new `trace:emit` event carries a batch of records from one module. It needs the `pipelines` permission with the
  `emit` action.
- The collector sets `source` from the module identity. It rejects a track path, an attribute key, or an ID key
  without the module prefix. It rejects a plugin annotation with a `human` annotator.
- A new `trace:subscribe` event lets a module read tracks, for example an eval plugin. It needs a permission for each
  track group.
- A module declares its profile with the `define*` functions and announces the definitions in `trace:emit`. Labels
  and descriptions use `Localizable`, as the protocol does for permissions. A plugin can declare metrics of kind
  `attribute`, with their labels, units, and directions. It cannot declare metrics of kind `derived` in the first
  version.
- `module:status` phases become a state track for each module in the Runtime group.

## Exports

| Record | OTLP | Perfetto JSON |
| --- | --- | --- |
| `span.begin`, `span.update`, and `span.end` | One span with the merged attributes | `B` and `E` |
| `span.complete` | One span | `X` |
| `instant` with `spanId` | A span event | `i` |
| Other `instant`, `log` | A log record with the trace ID and span ID | `i` |
| `state` | A log record | `i` on the track, with the value in `args` |
| `sample` and `sample.chunk` | A gauge in metrics, one point for each value | `C`, one event for each value |
| `annotation` on a span | The `gen_ai.evaluation.result` event | `i` with the value in `args` |
| `annotation` on a set of IDs | A log record with the mapped scope IDs, for example `gen_ai.conversation.id` or `airi.topic.id`, without a span parent | `i` with the value in `args` |
| `clock.snapshot` | Not exported. Times are converted first. | `ClockSnapshot` |
| `source.started` and `source.stopped` | Resource attributes of the source | `M` events `process_name` and `process_labels` |
| `source.lost` | A log record with severity `WARN` | `i` on the process |
| `stream.started` and `stream.stopped` | A log record. The stream ID becomes the `stream.id` attribute. | `M` event `thread_name` for the stream track |
| `clock.discontinuity` | A log record | `i` with global scope |
| `definition` | Export metadata only | Labels and units in the export metadata |
| A link on `span.begin` | A span link | Flow events `s` and `f` |
| Other links | A log record with both span IDs. OTel sets links only when a span starts. | Flow events `s` and `f` |

Most system records become metadata in an export. Annotations are in the rows above. `source.lost` and `clock.discontinuity` become events, because a
reader needs to see where data is missing or a clock jumped. OTLP has no track metadata, so a stream record becomes a
log record there.

These rules apply to the OTLP export:

- Spans map to `gen_ai.operation.name`: a model request to `chat`, a tool call to `execute_tool`, a sub-agent run to
  `invoke_agent`, and memory work to `create_memory`, `update_memory`, `delete_memory`, or `search_memory`.
- Model calls and remote agents have `SPAN_KIND_CLIENT`. Other spans have `SPAN_KIND_INTERNAL`.
- Background work that outlives its turn is a new trace with a span link to its cause. It is not a child of the ended
  turn span.
- The annotator kind maps to the OTel author kinds: `human` to `HUMAN`, `model` to `LLM`, and `rule` to `CODE`.
- The export metadata gives the pinned semantic conventions commit. An optional OpenInference attribute set adds span
  kinds for Phoenix, and `DECISION` for `decision.*` spans.

The trace package also exports a trajectory for each turn: the ordered messages and tool calls. Trajectory match and
agent-as-a-judge evaluations use this shape. The dataset exports are in the voice profile.

## Consequences

- An open LLM stream, a hung request, and an async memory write are visible while they run.
- One stream, one set of projections, and one store cover live views, disk files, replay, exports, and eval samples.
- Times from different processes, audio devices, and hosts line up, and a long session does not drift.
- A conversation with any number of people and agents is traceable. The dyadic metrics stay as a special case.
- A new domain adds a profile. The core and the viewer do not change.
- A plugin can add a profile, and its records join the turns that caused them.
- Producers carry domain IDs. This is more work at each call site, but it removes the guessing maps.
- AIRI owns a schema, the clock conversion, the conventions, and two mappers instead of the OTel SDK. Each needs tests.
- Records are more frequent than spans. Series sampling, `wants`, retention hints, and the buffer limits keep the cost
  bounded.
- A recorded stream can be a test. A Vitest case can replay a stream through projections and assert an order.

## Migration

Each step is one PR. The tracer keeps working after each step.

1. Add the trace package: the core, the clocks, the `define*` functions, the conventions, the voice and agent profiles, the
   projections, `TraceSink`, and the buffer with the pinned set. The hub carries records. A temporary adapter converts
   the current OTel spans to `span.begin` and `span.end` records. Mark it with `// NOTICE:`. Remove it in step 3.
2. Add the clock ping exchange, snapshots, and suspend handling to every source and the collector.
3. Move the current 12 span names to the sink, with explicit domain IDs. Remove the OTel dependencies, the linking
   maps, and `IOSubsystems`.
4. Rewrite the viewer on the projections: lanes, the live clock, follow-latest, the scrub cursor, states, series,
   links, and metrics.
5. Add the core-agent and pipelines-audio producers, with the voice records for each participant and the stream clock
   snapshots.
6. Add the Perfetto export, the OTLP export, and the trajectory export.
7. Add the stage-web collector, file replay with the sidecar index, and audio recording.
8. Add the plugin protocol fields, `trace:emit`, `trace:subscribe`, and plugin profiles.
9. Add the dataset exports.
10. Add the Background tracks when async signals and memory land.

Update the `analyze-io-traces` skill in the PR of step 3, in its own commit, because the file format changes.

## Out of scope

- The implementation of async signals, memory, and the frankenvoice pipeline.
- Upload of traces to a remote collector or a telemetry service.
- Old trace files. The new format does not read the `SerializedIOSpan` files.
- Offline evaluation jobs, such as WER against a reference or an LLM judge. They write annotations, but they are not
  part of this decision.
- A replay harness that runs a new policy against recorded inputs. This decision only marks the inputs.
- Plugin metrics of kind `derived`.

## Open questions

- The trace clock of stage-web and stage-pocket, which have no Electron main process.
- The interval of clock snapshots, and the window of the drift fit.
- The allowed lateness for each kind of source.
- The owner of the scheduler decision of who speaks next in a group chat. The chat domain ADR has the same question.
- Audio recording: its default, its storage limit, and audio before a wake word.
- The size limit of a trace file before rotation.

## Prior art

The [literature review](../research/2026-10-23-agent-trace-literature-review.md) has the full sources. These sources
shaped this decision the most:

| Source | What AIRI takes |
| --- | --- |
| Chrome Trace Event Format and Perfetto TrackEvent | Begin and end records, complete spans, instants, counters, flows, tracks, and clock snapshots |
| CTF 2, MCAP, Rerun, OTel logs | Named clocks, event time apart from observed time, and several timelines |
| Dapper, X-Trace, Canopy, Jaeger, ShiViz | Order by IDs and sequence numbers, and visible repair of clock skew |
| RTP and RTCP, WebRTC stats, GStreamer, Web Audio | Media clocks mapped to system time by periodic pairs, and output latency |
| The Dataflow model, Kafka compaction, EventStoreDB, Redux DevTools, XState inspect | Watermarks and lateness, snapshots for late joiners, pure folds, and state changes with their trigger |
| Turn-taking theory, VAP, MultiTalk, AMI, ICSI, CHiME | One channel for each participant, the floor transfer offset, and "when" apart from "who" |
| Full-Duplex-Bench, τ-Voice, Talking Turns, Moshi | Response latency, stop latency, take-over rate, overlap behavior, and observed records for end-to-end models |
| OTel GenAI conventions, OpenInference, Langfuse, OpenAI Agents SDK | `gen_ai.*` names, the agent span minimum, evaluations with an author kind, and a content policy that is off by default |
| Pipecat, LiveKit Agents, TEN Framework, Vocode, Bolna, OpenAI Realtime API | Latency contributions, interruption source and playout position, typed edges, heard text, and past-tense event names |
| vieval `defineMetric` and `defineScore` | Definitions declared once in code, with localized labels and descriptions, a unit, a better direction, and an announcement before first use |
| frankenvoice, recorder-minecraft timeline, uiarc agent timeline | Domain IDs with a causal graph, columnar lanes, and the CSS clock with follow-latest |
