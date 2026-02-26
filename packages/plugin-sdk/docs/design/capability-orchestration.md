# Capability-Oriented Module Orchestration

- [Summary](#summary)
- [Background](#background)
- [Context](#context)
- [Goals](#goals)
- [Non-goals](#non-goals)
- [Proposal](#proposal)
- [Vision](#vision)
- [Design Details](#design-details)
- [Lifecycle Model](#lifecycle-model)
- [Capability Registry Model](#capability-registry-model)
- [Use Cases](#use-cases)
- [Verify & Test](#verify--test)
- [Criteria](#criteria)
- [Test & QA](#test--qa)
- [Progress](#progress)
- [Status](#status)
- [Next Steps](#next-steps)
- [Reviews](#reviews)
- [Q&A](#qa)
- [Related Documentations](#related-documentations)

## Summary

Define a capability-oriented orchestration model for AIRI plugins and modules where dependency resolution is runtime-driven instead of static metadata-driven. Plugin Host coordinates module lifecycle using a stateful capability registry and readiness gates, enabling multi-runtime deployments (Electron, Web, Pocket) without hardcoding stage-first boot order.

## Background

Current plugin lifecycle in `PluginHost` is phase-based but does not yet enforce dynamic dependency waiting between modules and platform-provided APIs. In practice, APIs like provider listing can be available only after platform runtime, stage runtime, and UI/store initialization complete. This creates race conditions when modules initialize before required capabilities are actually ready.

## Context

The AIRI ecosystem is moving toward:

- Multiple plugin hosts (Electron now, Pocket and Web later).
- Multiple stage instances per host/runtime.
- Platform-specific extension APIs that should be discoverable through one control-plane model.
- Plugin modules that may provide capabilities required by other modules and by stage/configurator flows.

The design must avoid privileged hardcoded ordering such as "stage always loads first", while still giving deterministic and testable startup behavior.

## Goals

- Support runtime capability discovery and readiness gating without static dependency metadata.
- Keep lifecycle orchestration host-driven and runtime-neutral.
- Allow module dependencies to target capabilities, not implementation modules.
- Support multiple stage instances and platform-specific APIs in one model.
- Prevent missed readiness signals by relying on stateful registry snapshots, not one-shot events.

## Non-goals

- Defining the final production policy engine (priority, quotas, fairness) in this iteration.
- Designing UI/UX details of configurator pages.
- Finalizing transport federation protocol between all runtimes in this document.

## Proposal

Introduce a host-owned capability registry and make module initialization capability-aware:

1. Modules announce possible capabilities early (`announced`/`preparing` phase).
2. Modules mark capabilities as ready once invokable.
3. Modules declare runtime requirements as capability predicates.
4. Host transitions modules into `waiting-deps` until requirements resolve.
5. Host resumes module preparation/setup when required capabilities become ready.

Readiness and availability are stateful in registry snapshots, with event notifications as incremental updates.

## Vision

AIRI plugin orchestration should behave like an extensible runtime kernel:

- Hosts are runtime adapters (Electron, Pocket, Web), not policy exceptions.
- Stages are normal modules that publish and consume capabilities.
- Modules compose through capability contracts, not hardcoded start order.
- Adding new platform APIs means registering new capabilities, not rewriting lifecycle code.

## Design Details

Capability-first lifecycle orchestration with dynamic dependency resolution.

### Lifecycle Model

Proposed host-side phases for each module:

- `loading`
- `loaded`
- `authenticating`
- `authenticated`
- `announced`
- `preparing`
- `waiting-deps`
- `prepared`
- `configuration-needed`
- `configured`
- `ready`
- `degraded`
- `failed`
- `stopped`

Key rules:

- `preparing -> waiting-deps` if required capabilities are unresolved.
- `waiting-deps -> prepared` when all required capability predicates resolve.
- `ready -> degraded` when previously bound capability is withdrawn/degraded.
- `degraded -> ready` when dependency set becomes healthy again.

### Capability Registry Model

Registry properties:

- Stateful snapshot store (authoritative readiness state).
- Capability records scoped by `hostId`, `instanceId`, and runtime.
- Support both direct key lookup and predicate matching.
- Version and health metadata per capability record.

Capability record baseline:

```ts
interface CapabilityRecord {
  capabilityId: string
  providerModuleId: string
  hostId: string
  instanceId?: string
  runtime: 'electron' | 'web' | 'pocket' | 'node'
  state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
  version?: string
  health?: 'ok' | 'degraded' | 'unknown'
  metadata?: Record<string, unknown>
}
```

Requirement baseline:

```ts
interface CapabilityRequirement {
  allOf?: string[]
  anyOf?: string[]
  predicate?: (record: CapabilityRecord) => boolean
  timeoutMs?: number
}
```

### Use Cases

1. Stage provider catalog dependency chain
   - Provider-definition plugin announces capability.
   - Stage/configurator module announces provider catalog capability when store is mounted.
   - Consumer plugin module waits for both capabilities, then configures provider-backed features.

2. Multi-stage instance isolation
   - Two stage instances in one host register same capability class under different `instanceId`.
   - Module requests capability in same `instanceId` scope.
   - Host binds consumer to correct stage-local capability.

3. Pocket runtime API extension
   - Pocket runtime module registers `mobile.sensor` capability.
   - Plugins targeting mobile predicates can activate on pocket host without Electron-specific assumptions.

4. Late readiness and replay safety
   - Capability became ready before module started waiting.
   - Module receives snapshot-based resolution immediately and skips unnecessary wait.

## Verify & Test

### Criteria

- Module lifecycle correctly enters `waiting-deps` when required capabilities are missing.
- Module resumes deterministically when capabilities become ready.
- Snapshot-based registry prevents missed-ready race conditions.
- Same module capability requirements work across Electron and at least one non-Electron runtime adapter.
- Capability scoping by `instanceId` prevents cross-stage binding errors.

### Test & QA

- Unit test: registry stores and replays announced/ready/degraded states.
- Unit test: module transitions `preparing -> waiting-deps -> prepared`.
- Unit test: pre-existing ready capability resolves wait immediately.
- Unit test: degraded dependency transitions module from `ready` to `degraded`.
- Integration test: stage-side capability registration unblocks plugin module initialization.

## Progress

### Status

Proposed.

### Next Steps

1. Add host registry abstraction and lifecycle integration in `packages/plugin-sdk/src/plugin-host`.
2. Introduce `waiting-deps` and `degraded` transitions to host state machine and tests.
3. Define minimal protocol events for capability announce/ready/degraded/snapshot.
4. Wire stage-side capability publication in Electron host integration first.

## Reviews

### Q&A

- Q: Why not use static plugin dependency metadata?
  A: Runtime capability dependencies are more flexible for multi-stage and multi-runtime setups where availability depends on live initialization state, not package declarations.

- Q: How does this avoid missed readiness events?
  A: Registry snapshot is authoritative. Events are incremental signals only; late consumers always query snapshot state.

- Q: Does this force one core stage ordering?
  A: No. Ordering emerges from capability availability and requirement predicates, not privileged host rules.

### Related Documentations

- [AIRI Plugin Platform](./architecture.md)
- [Multi-Transport Plugin Contexts](./multi-transport.md)
