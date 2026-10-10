# Dependency patches

## @xsai-ext/responses 0.5.1

This patch fixes behavior in the published SDK. AIRI's protocol and billing code remain in workspace packages.

- Reject `response.incomplete` and stream error events so AIRI does not store failed turns.
- Type native `web_search` tools and their output Items for replay across steps.
- Await `onNativeEvent` before transcript commit so consumers can retain sources and search activity.

Browser regressions are in `packages/provider-inference/src/responses.browser.test.ts`. Core integration tests use the real patched SDK with synthetic HTTP responses in `packages/core-agent/src/runtime/responses.test.ts`.

The patch changes `dist` because the npm artifact ships compiled code. To contribute upstream, port these changes to the corresponding sources in [xsAI](https://github.com/moeru-ai/xsai), then run the same regressions.

Remove the patch when an upstream release passes these tests and provides native event callbacks and web search types. Recheck incomplete-response behavior before removal: AIRI treats an incomplete turn as a failure.

To update the patch:

```sh
pnpm patch @xsai-ext/responses@0.5.1
# Edit the directory printed by pnpm.
pnpm patch-commit <directory>
```

## pinia-plugin-synced 0.1.4

This patch makes a replicated store apply idempotent, so a snapshot that changes nothing notifies nobody.

- `applyStoreState` returns before `$patch` when the incoming snapshot deep-equals the current state. Pinia notifies subscribers on every `$patch`, so a redundant apply reached `$subscribe` callbacks as a change.
- `applyDomainState` skips a revision that is not newer than the one it applied. The old test compared for equality, so a repeated or late revision re-applied.

The two together fix a race the browser tests meet in CI. The tests in `packages/stage-ui/src/stores` install their `$subscribe` counters after the election signal, and `tab-election` sends the leader's first state snapshot in a message of its own. When that snapshot arrives after the counters, the follower applies its baseline, and the no-op apply fired the counter. The follower then reported two mutations where the test allows one.

Reproduction: delay only the inbound `onState` messages of the follower by 60 ms or more. Before the patch the follower count is 2 and the leader count is 1, which is the CI signature. After the patch both are 1. A follower that answers a remote snapshot with its own write still reports 2, so the assertion keeps its guarantee.

The patch changes `dist` because the npm artifact ships compiled code. The package has no released sources, so port these changes to [pinia-plugin-synced](https://github.com/nekomeowww/pinia-plugin-synced) rather than to this repository.

Remove the patch when an upstream release applies a snapshot only when it differs and reconciles revisions in order. Check both before removal: the delay reproduction above, and the follower-writes-back case that must still fail.

To update the patch:

```sh
pnpm patch pinia-plugin-synced@0.1.4
# Edit the directory printed by pnpm.
pnpm patch-commit <directory>
```
