# Hosted Kit registration ownership

- Status: Accepted
- Date: 2026-09-22
- Scope: Plugin SDK and the Electron Extension Host

## Context

A Kit ID can refer to a Host descriptor, a Host Client factory, or an Extension endpoint. These sources have different payloads. They share registration identity and lifecycle rules.

The earlier implementation stored these sources in separate containers. This design allowed payload replacement without a new generation. Cleanup also removed registrations by Kit ID instead of registration identity.

## Decision

`KitProviderRegistry` owns one slot for each Kit ID. A slot is Host-ready, Extension-pending, or Extension-ready.

The Registry owns these policies:

- One Kit ID has one current slot.
- Each visible aggregate change gets a new generation.
- Each Host source gets a unique token and lease.
- Each Extension commit gets one session lease.
- A stale lease cannot remove a replacement registration.
- Pending Extension registrations are not visible.
- Extension commit publishes all declared Providers in one synchronous operation.

## Accepted registration models

The Registry does not store caller input directly. It captures external properties once. It then validates and normalizes the captured values.

The Registry stores immutable accepted models:

- `KitDescriptorSnapshot` for Host descriptors.
- A receiver-free `KitRef` snapshot for Host Client factories.
- An accepted Contract with canonical method and event names.
- An endpoint with the exact handler set from the accepted Contract.

The Registry freezes registration metadata. A factory or handler can close over Provider-owned runtime state. The Registry does not freeze that state.

## Host descriptor contract

Phase 3 intentionally narrows the Host descriptor interface. The Registry rejects non-canonical descriptors before it publishes a Host slot.

An accepted descriptor has these properties:

- The Kit ID is non-empty and has no outer whitespace.
- The version is an exact semantic version.
- The runtime list is non-empty and has no duplicate value.
- Each capability key is non-empty and has no outer whitespace.
- Each capability key occurs once.
- Each capability action is non-empty and has no outer whitespace.
- Each action occurs once in its capability.

Exact versions preserve prerelease and build identifiers, such as `1.2.3-rc.1+build.007`. Prefixes, outer whitespace, and version ranges remain invalid.

Host sources and Extension Contracts match declaration versions by their complete strings, including build metadata. Consumer range compatibility still uses SemVer precedence rules.

The Registry does not trim or remove duplicate values. This rule keeps accepted snapshots unambiguous. Invalid metadata fails with `invalid-host-source` before publication.

This decision breaks compatibility with the earlier `KitRegistryService`. That Module accepted empty or duplicate metadata. Host Kit authors must update descriptors before migration.

### Migration

- Remove outer whitespace from Kit IDs, capability keys, and actions.
- Use one exact semantic version.
- Declare at least one supported runtime.
- Remove duplicate runtimes, capability keys, and actions.

## Command input capture

Every Registry command captures caller-owned properties before it changes registration state. A narrow `try` block surrounds each external property read.

Validation and normalization run after capture. Their internal errors keep their original identity.

An input read failure becomes a `KitProviderRegistrationError`. The error does not retain the value thrown by the caller.

`beginExtensionSession()` uses `invalid-provider-session` for these failures:

- Owner capture.
- Declaration-list capture.
- Declaration field capture.
- Invalid owner or declaration values.

The error preserves each context field that capture completed before the failure. Unknown context fields stay absent or use an empty Kit ID.

The Registry rebuilds owners and declarations from known fields. It never reads extra enumerable fields.

The Registry uses `Array.from` for the declaration list. It does not call a `map` method from the input.

## Exposure policy normalization

`normalizeExposurePolicyOptions()` owns the policy-list validation and the stable `local-only` fallback. It also validates the selected default policy.

Contract and Host factory modules map the normalization result to their own error types. They do not implement separate policy rules.

## Factory receiver

`HostClientFactory` declares `this: void`. The Host invokes the factory with an undefined receiver.

A Kit author uses function parameters, module state, or an explicit closure for runtime state. The Registry does not bind or copy an arbitrary receiver.

## Installation ownership

The installation owner provides idempotence. The Registry rejects a second current source of the same kind.

The built-in Kit runtime records these states:

- `created`: no Host owns the sources.
- `installed`: one Host owns the stored source leases.
- `disposed`: installation is terminal because the runtime state is destroyed.

A repeated installation on the same Host is a no-op. An installation on another Host fails. An installation after disposal also fails.

## Query interfaces

Registry queries return immutable point-in-time snapshots. These snapshots do not expose source tokens or Extension handlers.

The existing `ExtensionHost.getKit()`, `listKits()`, and `getKitCapabilities()` methods return mutable defensive copies. This adapter preserves their established interface and prevents internal snapshot leakage.

## Lifecycle ownership

`ExtensionHost` keeps Extension setup and cleanup orchestration. It starts one Provider transaction before setup.

The Host keeps registration ownership in a private state associated with the session object:

- `pending` owns the setup transaction.
- `ready` owns the committed registration lease.
- `released` owns the shared cleanup promise.

If setup succeeds while registration is pending, the Host commits the transaction and replaces it with its session lease.

Stop releases pending reservations or the ready lease synchronously. A late setup completion cannot commit or restore the session to ready.

The Host does not abort Extension code or wait for a suspended setup during stop. When that setup settles, its start operation rejects.

Released sessions reject module registration. Concurrent stop calls and late setup failures share the same cleanup promise and its error.

The Host removes the session even when cleanup fails. If setup and cleanup both fail, the start operation retains both errors.

During stop or reload, the Host disposes the session lease before cleanup callbacks. These callbacks cannot observe a ready Provider after stop starts.

## Best-effort cleanup

`DisposableStore` attempts each registered entry sequentially in reverse registration order. A failed entry does not skip the remaining entries.

The store drains its entries before callbacks run. Each entry is attempted once, with no automatic retry. Repeated disposal remains a no-op.

Module and session cleanup compose these stores instead of implementing separate error loops:

- Module cleanup attempts binding removal before subscription disposal.
- Session cleanup attempts binding removal, all modules in reverse registration order, then root subscriptions.
- Module and session records are removed after their cleanup attempts, including failed attempts.

A single failure keeps its original identity. Multiple failures produce an `AggregateError` in attempt order. Nested cleanup groups retain their own error groups.

The shared session cleanup promise settles only after all cleanup attempts finish. Concurrent stop calls and late setup failure observe the same result.

This policy guarantees attempts, not successful release. It does not retry failed resources or impose timeouts on suspended disposers.

## Cleanup self-wait detection

Node/Electron Hosts use native `AsyncLocalStorage` to distinguish cleanup descendants from external callers. A shared boolean cannot distinguish these concurrent call chains.

Before a released session joins its cleanup promise, the Host checks whether that exact session object has an active cleanup ancestor.
If it does, stop or reload rejects instead of waiting for its own caller. Best-effort cleanup then attempts the remaining resources.
An uncaught self-wait error becomes part of the shared cleanup result. External concurrent callers still await the full result.

The context follows native asynchronous operations, including `await`. Nested cleanup can stop an unrelated session, but it cannot wait for an active ancestor.
Session object identity prevents equal IDs in different Hosts from matching. Completed frames become inactive, including in detached continuations.
This is call-chain detection, not a general detector for cycles between independently started cleanup operations.

The Node implementation lives under `runtimes/node` and loads only when cleanup starts on a Node/Electron Host.
The configured Host runtime selects this policy. A per-start Extension runtime override does not change the Host execution environment.
Web cleanup retains best-effort disposal and shared completion, without self-wait detection. Browser context propagation and arbitrary plugin code transforms remain outside this change.

## Extension transaction publication

Extension commit uses two synchronous passes.

Pass 1 validates every pending slot. It calculates candidate generations and builds every immutable ready record, snapshot, and lease.

Pass 1 does not change generation counters or slots. A failure leaves the complete transaction pending for rollback.

Pass 2 writes each generation and ready slot. It then removes the transaction record and returns the prebuilt result.

Pass 2 does not read caller-owned properties. It does not run validation, callbacks, event notification, or asynchronous work.

## Host lease adapter and cleanup

`registerKitApi()` wraps the Registry lease to add watcher notification. The wrapper copies only `accepted`, `kitId`, and `sourceKind`.

The wrapper delegates `dispose()` to the Registry lease. This closure keeps the exact registration token private.

The built-in Kit runtime stores all accepted Host leases. A failed installation releases leases in reverse registration order.

Normal disposal removes Host registrations before it destroys runtime state. Consumers cannot acquire a Client backed by disposed state.

## Consequences

The Registry interface stays focused on registration state. It does not execute Extension callbacks or manage permissions.

Host registration methods return leases instead of accepted payloads. Callers that own installation lifecycle must retain these leases.

Descriptor and factory sources can arrive from different registration sites. The Registry combines them only when their Kit IDs and versions match.
