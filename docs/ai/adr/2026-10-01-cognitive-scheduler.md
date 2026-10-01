# Cognitive scheduler

Status: Accepted direction, staged implementation

## Context

The chat runtime serializes requests across sessions. Context snapshots include every active source, without reader isolation or expiry.
External input can name a session that has no persistent metadata. Several windows can also run the notification ticker.

These assumptions prevent concurrent domain work and can expose unrelated context to a private conversation.
The scheduler evolves the existing session storage, runtime ports, and plugin protocol.

## Decision

Implement P0 through P10 in order on one feature branch. Commit each coherent change after its focused checks.
Each commit includes the tests and documentation for its behavior. Track remaining acceptance separately from implemented code.

The scheduler owns admission, routing, budgets, supervision, and lifecycle. Modules declare domain meaning and retain their own state.
The conversation agent owns voice, the displayed character, and the owner chat surface. Domain agents output through their own channels.
The mood agent evaluates snapshots and maintains smooth, per-persona mood state.

Sessions persist between runs. Runs own cancellation, correlation, deadlines, and resource consumption.
Recipes describe task instructions and tools. They can serve multiple sessions.

Application context has context authority. Untrusted text cannot authorize tools, module control, or memory writes.
JEV improves decisions, with deterministic fallback and an 800ms deadline. Direct user conversation bypasses synchronous triage.

## Stages and acceptance

| Stage | Change | Acceptance |
| --- | --- | --- |
| P0 | Reader isolation, expiry, bounded contexts, external session creation, fork provenance, one ticker owner, module-owned context, background execution | Unrelated context never enters a request. Context remains bounded. External conversations persist. One owner runs notifications. |
| P1 | Session kind, bindings, lifecycle, digest, run table and correlation | Bindings recover the same persona session. Every run has a traceable identifier. |
| P2 | Per-session queues, budget admission, cancellation, rollback, supervision | Background work cannot block another session. Cancellation cannot duplicate input or commit stale output. |
| P3 | Unified workloads, deterministic admission, JEV triage, module declarations, control leases | Only declared destinations receive work. Every command passes admission and control checks. |
| P4 | Domain state slots, delivered speech history, spoken output, steering and input ownership | One voice owner speaks. Following turns distinguish generated text from delivered speech. |
| P5 | Model profiles, requirements, user tiers, request routing | Each selected model satisfies task requirements and budget. Model switches retain portable history. |
| P6 | Mood evaluation, PAD state, smoothing, decay and expression composition | Mood remains stable under noisy scores. Persona mood and sentence expression have distinct ownership. |
| P7 | Prompt recipes, history compaction, per-run persona identity | Prompt size remains bounded. Runtime identity follows the session rather than UI selection. |
| P8 | Client memory, provenance, visibility, proposals and disclosure checks | Low-trust claims cannot become trusted memories. Retrieval enforces visibility before ranking. |
| P9 | Persona session and mood transitions | A persona switch restores its own history and mood without importing another persona's experiences. |
| P10 | Parent runs, bounded derivation, result routing, external agent cooperation | Cancellation reaches descendants. Results default to binding scope. External modules retain autonomy. |

## Implementation boundaries

`core-agent` owns runtime policy and portable contracts. `stage-ui` connects storage, providers, tools, and visible streams.
`plugin-protocol` owns cross-process contracts. The server router retains transport availability routing.
The desktop renderer leader hosts the initial scheduler. Its lifecycle and background timing require explicit ownership.
Web and Pocket can serve interactive sessions. Persistent background scheduling requires a desktop or remote host.

Memory persists in IndexedDB, with local retrieval and optional cloud synchronization.
Each record carries provenance, trust, persona interoperability, and disclosure policy from its first write.
Model quality tiers come from user configuration until task-specific evaluation supplies quality measurements.
Hourly budget controls cost. Provider limits and exclusive module control also constrain admission.
Scheduler, budget, context, and memory settings belong in Settings > Memory.

## Validation

Use deterministic runtime tests for routing, expiry, budgets, cancellation, session recovery, and parent-run behavior.
Use browser tests for Web Platform and persistence behavior. Use Electron boundary mocks for window configuration and ownership.
Run affected workspace typechecks and tests. Run root typecheck for shared contracts and root lint before completion.
Use live voice and character evidence for speech handoff, expression composition, and persona switching.

The source reports used fake providers for runtime concurrency and small datasets for JEV decisions.
Their measured latency, cost, and classifier accuracy are hypotheses for local reproduction, rather than release acceptance.
Live Discord recovery, JEV direct-channel behavior, and owner transitions require additional integration evidence.

## Progress

- Design direction accepted. Implementation and acceptance remain open for P0 through P10.
