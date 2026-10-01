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

## Plain mechanisms

The design terms name conventional mechanisms. Code uses the plain names.

| Design term | Mechanism |
| --- | --- |
| Scheduler and admission | Several queues with admission rules |
| Execution envelope | A capability ACL for one run, checked where each action executes |
| Audience | Access labels with set operations: intersection, union, and inclusion |
| Exclusive resource and lease | A resource lease with an expiry |
| Session | A persisted session with a state machine |
| Mood role | One classifier call and a smoothing function |
| Long-term memory | A database with provenance and invalidation rules |
| Internal stimulus | A timer and rules or a classifier that decide whether to enqueue work |

The mechanisms are not the open work. Policy and evaluation are: when to stay silent, what to remember, when to interrupt, and whether mood changes decisions.
Scenario tests must prove those behaviors. A mechanism alone does not prove them.

## Stages and acceptance

| Stage | Change | Acceptance |
| --- | --- | --- |
| P0 | Reader isolation, expiry, bounded contexts, external session creation, fork provenance, one ticker owner, module-owned context, background execution, directed output | Unrelated context never enters a request. Private replies never broadcast to modules. External conversations persist. One owner runs notifications. |
| P1 | Session audience, bindings, lifecycle, digest, run table, execution envelopes, audience labels, and correlation | Recovery checks audience inclusion. Writes preserve read restrictions. Every run has a traceable identifier and envelope. |
| P2 | Per-session queues, capacity admission, cancellation, rollback, supervision | Background work cannot block another session. Cancellation cannot duplicate input or commit stale output. Queue growth stays bounded. |
| P3 | Unified workloads, deterministic admission, JEV triage, module declarations, control leases | Only declared destinations receive work. Every command passes admission and control checks. |
| P4 | Domain state slots, delivered speech history, spoken output, steering and input ownership | One voice owner speaks. Following turns distinguish generated text from delivered speech. |
| P5 | Model profiles, requirements, user tiers, optional spending limit, experimental task routing | The user selects the conversation model. A router changes a model only with task evidence, and cost never silently lowers conversation quality. Model switches retain portable history. |
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
Capacity limits, provider limits, deadlines, and exclusive resources constrain admission. A user spending limit is one optional limit, not an optimization target.
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

- P0 and P1 are Implemented with deterministic tests. Their live scenarios remain open. P2 through P10 have not started.
- Context slots, reader filtering, expiry, text budgets, bounded history, and fixed append-slot admission have deterministic tests.
- External bindings create persistent metadata. Forks retain parent provenance. Notification consumers follow renderer leadership and application lifetime.
- Notification cancellation blocks late output and awaits reaction stream closure. The main window disables background throttling.
- Queued notifications are replicated state. Any renderer enqueues through a leader action, and a promoted leader resumes the queue.
- Minecraft observations no longer use a frontend request provider. Producers use fixed event slots and preserve declared retention fields.
- Array destinations route transport peers. Object destinations name logical readers. Unaddressed module observations belong to the owner scene.
- Input side context follows the same rule. Without object destinations, it belongs to the input scene.
- Lanes describe subscriptions. A reader without a lane reads every lane that its destinations allow.
- Local chat output stays inside the host. External replies target their server-assigned source connection and omit internal prompt snapshots.
- Server routing rejects untargeted chat output. Broadcast and consumer delivery both preserve explicit destinations.
- Pool admission and retention use local `o200k_base` token cost. Short multibyte observations no longer consume a byte budget.
- Context mutations run in leader actions. Replicated checkpoints retain original expiry times. The leader keeps the delivery history.
- One owner prunes idle contexts. Followers read projections without publishing state proposals.
- Minecraft status and VS Code observations use the shared token counter. Oversized text becomes an origin handle with module-owned details.
- Minecraft renews unchanged online status. Three missed refreshes expire it, and unbinding stops renewal.
- Browser page, video, and subtitle observations replace fixed slots and use budgeted origin references. The extension announces the SDK module identity.
- Vision observations use budgeted origin references. The captured frame stays in the renderer and no longer reaches other modules.
- Every context producer in the repository fits the shared budget. Minecraft, VS Code, the web extension, and vision turn oversized text into origin handles. Discord notices stay short.
- A model resolves an origin handle through `builtIn_readContextSource`. The session must see an observation with that handle.
- The read goes only to the server-identified writer connection, and only that writer can answer. Details over 1000 tokens are cut.
- Reply and completion hooks reach other renderers through the same-origin stream channel. Devtools in a follower window sees every turn stage.
- Server-owned module removal clears the exact writer through the context leader. Bounded history rejects delayed copies after removal.
- The server drops client-authored module removal events. Repeated removal does not publish another state change.
- The leader replicates a bounded removal journal. Duplicate lifecycle notifications preserve fresh observations after reconnection within that window.
- Spark relay syntax lives in a trusted toolset prompt. Actual tool admission controls developer guidance for each model request.
- Chat and Responses remove tool guidance after revocation. Request guidance stays outside shared observations and generation history.
- History records keep identity and in-budget text only. Pool entries drop producer payloads and have a 2048-byte serialized limit.
- Eviction applies the writer budget first, then evicts the lowest retention across all writers.
- The o200k rank table loads on the first observation. A static import added 2.33 MB raw and 1.14 MB gzip to stage-web startup JavaScript.
  With the lazy chunk, startup JavaScript measures 1,756,808 bytes gzip, against 1,756,522 bytes for a build without the rank table.

### P1 progress

Labels follow the claim levels in the design review appendix: Observed has a named test, and Implemented lacks a full user scenario.

- Audience labels are sorted subject sets or `public`. Every scene includes the owner, because host surfaces show every session to the owner.
- Shared pool entries carry host-assigned audiences. A run reads an entry only when the entry's audience includes the run's effective audience.
- Sessions store an audience derived from bindings. It only narrows. Forks inherit bindings and audience, and binding recovery skips forks.
- A scene recovers a root session only when the session audience includes the scene audience.
- Observed (`chat-orchestrator-runs.test.ts`): each send has a run id, an envelope, and a state trace. Work beyond the session audience rejects before a run exists.
- Observed (`chat-orchestrator-runs.test.ts`): a provider failure records `blocked` with its error. Writes narrow the session audience to the labels the run read.
- Observed (`chat.contract.browser.test.ts`): a reply with an output target reads with the scene audience.
- Implemented: the context bridge labels observations from logical readers. Discord voice transcriptions bind to their channel.
- Not provided: the run table is the current execution path, not P3 intake. Ignored stimuli and intentional silence have no record yet.
- Observed (`session-store.browser.test.ts`): sessions move from active to idle, dormant, and retired. A retired session leaves binding recovery, and a run reactivates it.
- Observed (`session-store.browser.test.ts`): a digest must end at a message in its session and keeps the session audience.
- Implemented: Settings > Memory sets the dormant and retired thresholds. The leader applies them each minute.
- Designed: digest generation belongs to P7 history compaction. P1 stores and validates digests only.

### P2 progress

- Observed (`chat-orchestrator-runs.test.ts`): every hook context carries its session, run, and envelope outputs. Cross-window relays label turns from that context.
- Observed (`chat.contract.browser.test.ts`): only a local conversation run has the `voice` output. A reply with an output target never speaks.
- Implemented: the stage drives speech, motion, and expression only for a run with the `voice` output. External replies are no longer read aloud locally.
- Observed (`chat-orchestrator-runtime.test.ts`): a slow domain session does not block another session. One session runs in order.
- Observed (`chat-orchestrator-runtime.test.ts`): a full session queue rejects before a run exists. The run count stays within the limit, and only one send holds the voice.
- Implemented: chat surfaces read per-session running state. Stop and interruption target the voice owner instead of any running send.
- Observed (`chat-orchestrator-runs.test.ts`): a stalled or overdue run expires and its caller receives a failure. Repeated identical tool calls end a run as blocked.
- Observed (`chat-orchestrator-runs.test.ts`): a cancelled run with rollback removes its user turn and partial reply, so a requeued input appears once. A waiting run cancels before it starts.

### Open P0 evidence

These checks need live models, bots, or windows. They are not verified.

- Minecraft relay through a live model to a running bot, and a live `minecraft:status` source read.
- Discord channel recovery across a restart, with replies only in the source channel.
- Reminder timing in a minimized desktop window.
- Devtools in a follower window during a live turn.

### Known limits after P1

- The `spark_command` tool can send contexts to modules outside the run envelope. P3 moves it behind admission.
- A module without a declared scene speaks for the owner. Modules declare scenes and output audiences in the P3 `cognition` block.
- Only assistant writes narrow the session audience. Derived results and memory writes get labels in P8 and P10.

### Findings outside P0

- `chatStore.cleanup(sessionId)` resets the whole shared pool. Only devtools pages call it.
- A producer's `ttlMs` has no host maximum. Budgets still bound the pool.
- The server never returns an event to its sender. A renderer therefore never ingests its own vision observation. This behavior predates the branch.

### Replication cost

Every synced commit sends the whole domain state to every renderer. A browser test measured two renderers.
The workload simulated ten minutes of status renewal, page and subtitle slots, an unbudgeted writer, and vision frames.
Totals cover 460 observations and 1,393 channel messages.

| Version | Total sent | Largest message | Context state |
| --- | --- | --- | --- |
| Before history bounds | 811 MB | 3.10 MB | 3.03 MB |
| Bounded history | 40 MB | 161 KB | 87 KB |
| Leader-local history | 18 MB | 76 KB | 1.9 KB |

The remaining messages carry the synchronization operation log. Its retention belongs to `pinia-plugin-synced`.

### Validation findings

The full test chain exposed a preexisting config persistence race between plugin fixtures.
Config stores now bind their directory at first use. Delayed writes and cached state cannot move between user-data directories.
Deterministic tests cover delayed writes, cache isolation, same-file sharing, and startup directory overrides.
