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
Agents are not types. Tasks, execution envelopes, sessions, recipes, and runs are the core concepts.
The scheduler builds each execution envelope from scope, outputs, audience, memory view, capabilities, leases, persona, recipe, model policy, and lifetime.
A recipe cannot widen that envelope. Code enforces its limits at tool execution, retrieval, context snapshots, session recovery, and output.
Voice, the expression baseline, and module control are exclusive resources. Their current holders define the conversation and mood roles.
Domain runs output through their own channels.
The mood agent evaluates snapshots and maintains smooth, per-persona mood state.

Sessions persist between runs. Runs own cancellation, correlation, deadlines, and resource consumption.
Recipes describe task instructions and tools. They can serve multiple sessions.

Information carries an allowed audience: public, or a set of audience subjects.
A run derives its effective audience from the union of all its output audiences.
It can read a record only when that effective audience is a subset of the record's allowed audience.
Writes inherit the intersection of all information read, including session history. Session audiences can only narrow.
Recovery requires a compatible audience. A new scene uses a new session and only audience-compatible summaries.
Audience rules and persona disclosure rules remain independent.

Application context has context authority. Untrusted text cannot authorize tools, module control, or memory writes.
JEV improves decisions, with deterministic fallback and an 800ms deadline. Direct user conversation bypasses synchronous triage.

## Stages and acceptance

| Stage | Change | Acceptance |
| --- | --- | --- |
| P0 | Reader isolation, expiry, bounded contexts, external session creation, fork provenance, one ticker owner, module-owned context, background execution, directed output | Unrelated context never enters a request. Private replies never broadcast to modules. External conversations persist. One owner runs notifications. |
| P1 | Session audience, bindings, lifecycle, digest, run table, execution envelopes, audience labels, and correlation | Recovery checks audience inclusion. Writes preserve read restrictions. Every run has a traceable identifier and envelope. |
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
Each record carries provenance, trust, audience, persona interoperability, and disclosure policy from its first write.
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

- P0 is in progress. P1 through P10 have not started.
- Context slots, reader filtering, expiry, text budgets, bounded history, and fixed append-slot admission have deterministic tests.
- External bindings create persistent metadata. Forks retain parent provenance. Notification consumers follow renderer leadership and application lifetime.
- Notification cancellation blocks late output and awaits reaction stream closure. The main window disables background throttling.
- Minecraft observations no longer use a frontend request provider. Producers use fixed event slots and preserve declared retention fields.
- Array destinations route transport peers. Object destinations name logical readers. Unaddressed module observations belong to the owner scene.
- Lanes describe subscriptions. A reader without a lane reads every lane that its destinations allow.
- Local chat output stays inside the host. External replies target their server-assigned source connection and omit internal prompt snapshots.
- Server routing rejects untargeted chat output. Broadcast and consumer delivery both preserve explicit destinations.
- Pool admission and retention use local `o200k_base` token cost. Short multibyte observations no longer consume a byte budget.

### Remaining P0 acceptance

- Hidden task forks read owner-scene observations until P1 adds audience checks to recovery and derivation.
- P1 must add information-flow labels beyond P0 transport isolation. Output targets alone do not authorize session recovery or private context reads.
- Module status text must fit the observation budget or use an origin reference. Producer-level status acceptance still requires verification.
- Context mirrors still ingest events in multiple renderers. Registry mutation ownership and periodic cleanup require a leader-owned boundary.
- Live external-session recovery and minimized-window timing still require integration evidence.

### Validation findings

The full test chain exposed a preexisting config persistence race between plugin fixtures.
Config stores now bind their directory at first use. Delayed writes and cached state cannot move between user-data directories.
Deterministic tests cover delayed writes, cache isolation, same-file sharing, and startup directory overrides.
