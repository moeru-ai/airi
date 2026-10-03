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

If setup succeeds, the Host commits the transaction and stores its session lease. If setup fails, the Host rolls back the transaction.

During stop or reload, the Host disposes the session lease before cleanup callbacks. These callbacks cannot observe a ready Provider after stop starts.

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
