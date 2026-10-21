# @proj-airi/stream-kit

Lifetime, scheduling, and stream helpers for AIRI. The package has no UI, audio, or provider dependency.

## Use it for

- One unit of async work with one outcome, a timeout, and cleanups: `createTask` and `runTask`.
- Work that only the newest input needs, like `switchMap`: `createLatest`.
- A lifetime for resources with child lifetimes: `createScope`.
- A readable stream that a push source writes to: `createPushStream`.
- A queue that runs handlers for each item in order: `createQueue`.

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

## Checks

```sh
pnpm -F @proj-airi/stream-kit typecheck
pnpm exec vitest run packages/stream-kit
```
