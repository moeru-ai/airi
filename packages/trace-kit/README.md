# @proj-airi/trace-kit

Trace records, clocks, collection, and projections for AIRI agent and pipeline activity.

The package depends only on `@moeru/std` and `valibot`. Then `core-agent`, `pipelines-audio`, and `plugin-protocol` can depend on it without a cycle.

## Use it for

- Writing what a module does as an ordered stream of records: span begin and end, instants, states, samples, and logs.
- Joining work across windows, processes, and plugins by domain IDs and typed links, not by parent spans only.
- Converting times of several clocks, such as windows, the main process, and audio streams, to one trace clock.
- Keeping recent records in one collector, and feeding live views, files, and tests from it.
- Turning records into view state with pure projections: timeline, event log, and metrics.

## Do not use it for

- Product UI. Product UI reads domain projections of eventa events, not traces.
- Remote telemetry. Upload to a telemetry service is out of scope.
- Logs that a person reads in a terminal. Use `@guiiai/logg`.

## Entry points

| Import | Contents |
| --- | --- |
| `@proj-airi/trace-kit` | Record types, the Valibot schema, the `define*` functions, `ClockGraph`, `TraceSource`, `TraceSpan`, `SeriesWriter` for frequent series such as audio levels, and the conventions |
| `@proj-airi/trace-kit/collector` | `TraceCollector`: buffer, pinned set, series rings, watermarks, source lifecycle, and the flight recorder |
| `@proj-airi/trace-kit/projections` | `TraceReader`, the timeline, the event log, and attribute metrics |
| `@proj-airi/trace-kit/voice` | The voice profile: tracks, ID keys, names, attributes, metrics, and the floor transfer projection |
| `@proj-airi/trace-kit/agent` | The agent profile: chat turns, model requests, tools, control, and background work |
| `@proj-airi/trace-kit/views` | Pure view models of a trace: item lookups, related spans, track summaries, pipeline nodes, and `createTraceViewReader`. They return data, not display text. |

The root entry does not import a profile.

## Write records

A producer writes to a `TraceSink`. A module without a sink uses `noopTraceSink`.

```ts
import { beginSpan, trackPath } from '@proj-airi/trace-kit'
import { AgentNames, AgentTracks } from '@proj-airi/trace-kit/agent'

const span = beginSpan(sink, {
  track: trackPath(AgentTracks.LLM, { agent: 'agent' }),
  name: AgentNames.ModelRequest,
  ids: { conversation: sessionId, turn: turnId },
})
span.instant('llm.first_chunk')
span.end({ attrs: { 'llm.ttft_ms': 412 } })
```

- `span.begin` is sent at once, so views show open work.
- Carry the domain IDs that the producer already has. Do not look up an ID from another module.
- Use a link for a relation that is not nesting, for example `caused-by` to the span that started the work.
- Give `ts` as the time of the event. A record can be backdated.

`TraceSource` stamps `source`, `epoch`, and `seq`, and announces the definitions of its profiles when it starts.

## Attribute names

Attribute names are constants in the style of `@opentelemetry/semantic-conventions`: `ATTR_<NAME>`.

```ts
import { ATTR_AIRI_TOPIC_ID, ATTR_GEN_AI_REQUEST_MODEL } from '@proj-airi/trace-kit'

span.update({ [ATTR_GEN_AI_REQUEST_MODEL]: model, [ATTR_AIRI_TOPIC_ID]: topicId })
```

- The `ATTR_GEN_AI_*` constants are copies of the exports of `@opentelemetry/semantic-conventions/incubating`, with the same names and values. `SEMCONV_VERSION` is the package version that they follow.
- Upstream tells libraries not to import the incubating entry at runtime. A test compares each copy with the installed package, so a change upstream fails the tests.
- `ATTR_GEN_AI_MEMORY_QUERY_TEXT` is not in the npm package yet. It follows the GenAI conventions repository.
- The other constants, for example `ATTR_CENSORED`, `ATTR_DECISION_LATENCY_MS`, and `ATTR_AIRI_TOPIC_ID`, are AIRI names.

## Collect and read

```ts
const collector = new TraceCollector({ now: () => performance.now() })
const timeline = createTimelineProjection()
const reader = new TraceReader([timeline], collector.traceClock)
collector.subscribe(message => reader.handle(message))
reader.view(timeline).tracks
```

A subscription first gets the pinned set, the gaps, the buffer, and the series rings. Then it gets `caughtUp` and each later record. The host calls `collector.tick()` about once a second.

The collector builds on the event stream primitives of `@proj-airi/stream-kit`: `RetentionBuffer`, `SequenceTracker`, `Watermark`, `DemandUnion`, `createLeaseTable`, `createCooldown`, and `createCatchUpFeed`. `onWantedChange` runs only when the union of the viewer tracks changes.

A viewer that does not own the collector reads a `TraceFeedSource`: the trace clock and a `subscribe` function that sends `TraceFeedMessage` values. A host gives a local collector, a hub in another process, or a fixture as a feed source.

To read a file or the records of a test, call `reader.handleRecords(records)`.

## Clocks

Each record names its clock. A source writes `clock.snapshot` records that pair its clock with another clock, and `clock.discontinuity` after sleep or a device change. `ClockGraph` fits offset and drift for each clock pair, and converts through the shortest path of pairs. A media stream clock counts frames. Declare its rate with `setUnitsPerMs`.
