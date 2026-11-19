# sync-runner

Decides when a synchronization runs. It does not decide what a synchronization exchanges.

## What it does

- `SyncRunner` runs one synchronization at a time. A request during a run queues one more run.
- A failed run retries after a delay, until a run succeeds.
- `watchSyncTriggers` requests a run after an account change, a local change, focus, visibility, a reconnection, and startup.

## When to use it

- A feature compares local state with a server and exchanges the differences.
- A run can fail at any point, and the next run repairs the result.

## When not to use it

- The work is a sequence of steps that must continue after a restart, such as a file transfer. Use `libs/file-transfer`, and let a run start or retry the transfers.
- The feature needs field conflict rules. `libs/document-sync` gives them. Call its `synchronize` from a `SyncRunner`.

## How to add a feature

Put the runner in a store that uses `pinia-plugin-synced`, so one window runs it:

```ts
const runner = new SyncRunner(reconcile, {
  onError: error => console.error('[feature-sync] Run failed:', errorMessageFrom(error)),
})
onScopeDispose(() => runner.dispose())

async function synchronize() {
  await runner.request()
}

// Each window observes the events. The action routes each request to the leader.
watchSyncTriggers(() => useFeatureStore(pinia).synchronize().catch(logError), {
  sources: [userId],
  changes: localDocuments,
})

// Add 'synchronize' to `synced.actions` of the store.
```

## Rules for the caller

- A run reads the current state. It must not depend on a value that an earlier run saved as progress.
- Do not write to synchronized state in a trigger. Call the action.
- Keep a leader-routed action short. A follower call rejects after 30 seconds, although the leader continues. Report long work through synchronized state.
- Only write synchronized state when its content changes. Each new object sends a snapshot to every window.

`stores/modules/airi-card.ts` and `stores/display-model-cloud.ts` are the reference uses.
