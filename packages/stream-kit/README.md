# @proj-airi/stream-kit

Lifetime, scheduling, and stream helpers for AIRI. The package has no UI, audio, or provider dependency.

## Use it for

- One unit of async work with one outcome, a timeout, and cleanups: `createTask` and `runTask`.
- Work that only the newest input needs, like `switchMap`: `createLatest`.
- A lifetime for resources with child lifetimes: `createScope`.
- A readable stream that a push source writes to: `createPushStream`.
- A queue that runs handlers for each item in order: `createQueue`.
- Event stream state: batches, a bounded buffer, sequence and lateness checks, demand, leases, cooldowns, and a feed that catches up new subscribers. See [Event streams](#event-streams).

## Do not use it for

- Audio windows, captures, or playback. Use `@proj-airi/pipelines-audio`.
- Cross-process events. Use `@moeru/eventa`.

## Tasks

A task settles once with an `Outcome`: `finished`, `cancelled`, or `failed`.

```ts
const task = runTask(async ({ signal }) => fetchText(url, signal), { signal: parent, timeoutMs: 5000 })
task.defer(() => connection.close())
const outcome = await task.done
```

- `signal` aborts on cancellation, failure, timeout, or parent abort. It does not abort on `finish`, so handed-off work, such as queued playback, continues.
- Cleanups run once, in reverse order, after the outcome. `closed` resolves after they settle.
- `worstOutcome(outcomes)` merges outcomes. A failure wins over a cancellation, and a cancellation wins over success.

## Newest input only

```ts
const runner = createLatest<Document>(async (document, signal) => {
  cache.set(document.text, await rewrite(document.text, signal))
}, { key: document => document.text, debounceMs: 600 })

runner.push(document)
```

- A new key aborts the active run and replaces a waiting input. An equal key keeps the active run.
- `debounceMs` waits until the key stays the same for that long.
- `cancelPending()` drops a waiting input and keeps the active run.
- Errors of superseded or closed runs are not reported.

## Event streams

These primitives keep no hidden clock. Each method that needs the time takes `now`, and only `createBatcher` starts a timer.

### Batches: `createBatcher`

Groups items, like `groupedWithin`. A batch flushes at `maxItems` items or `maxWaitMs` after its first item, whichever comes first. Use it to send many small messages as fewer large ones.

```ts
const batcher = createBatcher<TraceRecord>({ maxWaitMs: 50, maxItems: 500, flush: records => send({ records }) })
batcher.push(record)
batcher.close() // flushes the rest
```

- `schedule` replaces the `setTimeout` timer, for example in tests.
- With `now`, a push after the deadline flushes at once, also when a background tab delays the timer.

### Bounded buffer: `RetentionBuffer`

Keeps the newest items within `maxBytes` and `maxAgeMs`, in insertion order. Use it for a replay buffer or a flight recorder window.

```ts
const buffer = new RetentionBuffer<Entry>({ maxBytes: 8_000_000, maxAgeMs: 600_000, sizeOf: entry => entry.bytes, ageOf: entry => entry.observedAt, onEvict: reportGap })
buffer.push(entry) // applies the byte limit
buffer.evict(now) // applies both limits, from a periodic tick
```

- Only the oldest items drop. Eviction costs time for the dropped items only.
- `onEvict` receives each group of dropped items, so the caller can report a gap.

### Sequence numbers: `SequenceTracker`

Accepts each sequence number once, in any arrival order. Use it to drop repeats after a reconnect or a retry.

```ts
const tracker = new SequenceTracker()
if (tracker.accept(record.seq))
  handle(record) // a repeat does not reach this line
```

`nextSeq - 1` is the end of the unbroken prefix.

### Late events: `Watermark`

Tracks the newest event time and marks an event that is more than `allowedLatenessMs` behind it.

```ts
const watermark = new Watermark({ allowedLatenessMs: 2000 })
const { late } = watermark.observe(record.ts)
```

### Wanted keys: `DemandUnion`

The union of what each member wants. A `'*'` member makes the union `'*'`. Use it so that a producer skips work that no viewer wants.

```ts
const demand = new DemandUnion<string>({ onChange: union => source.setWanted(union) })
demand.set(viewerId, ['audio.level'])
demand.delete(viewerId)
```

`onChange` runs only when the union changes.

### Leases: `createLeaseTable`

Keys that stay alive while their owner renews them. Use it for heartbeats and repeated announcements.

```ts
const leases = createLeaseTable<string>({ ttlMs: 12_000 })
leases.touch(tabId, now)
for (const tab of leases.expired(now))
  forgetTab(tab)
```

### Cooldowns: `createCooldown`

Allows an action at most once per window for each key.

```ts
const cooldown = createCooldown({ ms: 30_000 })
if (cooldown.tryAcquire(source, now))
  dump()
```

### Catch-up feed: `createCatchUpFeed`

A live feed in which a new subscriber receives the backlog, then an optional `caughtUp` message, then live messages. Use it when a viewer opens after the stream started.

```ts
const feed = createCatchUpFeed<Message>({ backlog: () => buffer.values(), caughtUp: () => ({ kind: 'caughtUp' }) })
const { unsubscribe } = feed.subscribe(render)
buffer.push(record)
feed.publish({ kind: 'record', record })
```

- No message is lost or repeated between the backlog and the live messages. The owner must update the backlog state before each `publish`.
- A `publish` during the backlog delivery waits, and goes to the new subscriber after `caughtUp`.
- The backlog and `caughtUp` arrive synchronously inside `subscribe`.
- The `strategy` applies to live messages. `unbounded` calls the listener inside `publish`. `sliding` and `dropping` keep up to `capacity` messages and deliver them in a microtask. A full `sliding` queue drops its oldest message, and a full `dropping` queue drops the new one.

## Checks

```sh
pnpm -F @proj-airi/stream-kit typecheck
pnpm -F @proj-airi/stream-kit test:run
```
