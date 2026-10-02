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
Direct input still passes intake. A synchronous local policy decides it, without automatic admission and without a reply obligation.
The design appendices outside the repository take priority over the whitepaper where they differ.

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
Settings follow what they belong to. Settings > Memory holds attention and the folded run limits. Short-term and long-term memory pages hold session thresholds and the current mood. The Consciousness page holds the spending limit and the folded model tiers. The character card holds the temperament. Settings that rarely need a change stay folded.

## Validation

Use deterministic runtime tests for routing, expiry, budgets, cancellation, session recovery, and parent-run behavior.
Use browser tests for Web Platform and persistence behavior. Use Electron boundary mocks for window configuration and ownership.
Run affected workspace typechecks and tests. Run root typecheck for shared contracts and root lint before completion.
Use live voice and character evidence for speech handoff, expression composition, and persona switching.

The source reports used fake providers for runtime concurrency and small datasets for JEV decisions.
Their measured latency, cost, and classifier accuracy are hypotheses for local reproduction, rather than release acceptance.
Live Discord recovery, JEV direct-channel behavior, and owner transitions require additional integration evidence.

## Progress

- P0 through P5 are Implemented with deterministic tests. Their live scenarios remain open. P6 through P10 have not started.
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
- Not provided in P1: the run table recorded admitted runs only. P3 intake adds records for ignored, deferred, and rejected stimuli.
- Observed (`session-store.browser.test.ts`): sessions move from active to idle, dormant, and retired. A retired session leaves binding recovery, and a run reactivates it.
- Observed (`session-store.browser.test.ts`): a digest must end at a message in its session and keeps the session audience.
- Implemented: the short-term and long-term memory pages set the dormant and retired thresholds. The leader applies them each minute.
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
- Implemented: Settings > Memory sets the concurrency, queue, stall, and deadline limits in a folded section. A limit never switches models or skips work silently.
- Resolved in P3: an error burst breaker pauses background work after repeated blocked runs.

### P3 progress

- Observed (`chat-orchestrator-runs.test.ts`): an ignored connection input creates no run, provider call, or message. The intake trace records the ignore.
- Observed (`chat-orchestrator-runs.test.ts`): direct owner input gets a synchronous local intake decision, never a remote one. The local policy can ignore it without a run.
- Observed (`chat-orchestrator-runs.test.ts`): the default local rule ignores empty input and admits the rest. A failing policy admits by fallback.
- Observed (`chat-orchestrator-runs.test.ts`): an audience failure records `rejected` without a run. Rejection is a failure, never a choice.
- Observed (`lease-table.test.ts`, `chat-orchestrator-runs.test.ts`): the voice is a lease with one holder. A chat send waits while another run owner holds it.
- Implemented: one run table, intake trace, and lease table serve every run owner in a renderer.
- Observed (`orchestrator/index.test.ts`): a notification waits while another run holds the voice. An admitted notification is a run that holds and then releases the voice.
- Observed (`orchestrator/index.test.ts`): a newer notification with the same `coalesceKey` replaces a waiting one. An expired notification is ignored without a run.
- Observed (`orchestrator/index.test.ts`): a missing model ends a notification run as `blocked`, never as silence.
- Observed (`store.browser.test.ts`): a due task enters intake as an internal stimulus.
- Observed (`setupApp.liveness.test.ts`): the server lists each module with its connection and `cognition` declaration. It drops module lists forged by peers.
- Observed (`context-bridge.contract.browser.test.ts`): a module with declared scenes cannot name an owner session. Its input reaches only the bound session of a declared scene.
- Observed (`context-bridge.contract.browser.test.ts`): a scene outside the module's namespace invalidates the declaration and rejects its input.
- Implemented: Discord declares the `discord:channel:` scene.
- Observed (`command-admission.test.ts`): a command needs a working run and declared destinations that accept its intent. Broadcasts and scene modules are rejected.
- Observed (`command-admission.test.ts`): module control is a session lease. Another session is rejected until expiry, and critical higher-salience work takes it over.
- Observed (`spark-command.test.ts`, `orchestrator/index.test.ts`): chat tool and notification commands pass admission and carry their holder. A rejected command never reaches the channel.
- Observed (`airi-bridge.test.ts`): Minecraft drops commands without a holder and contradictory commands from another session during the lease.
- Observed (`triage.test.ts`): one classifier call asks about attention and urgency. A late classifier is aborted at the deadline, and the prior decides.
- Observed (`triage.test.ts`): only answers at or above the user threshold decide. Scene sources stay below interruption whatever the classifier says.
- Observed (`classifier.test.ts`, `triage.test.ts` in stage-ui): a Decisions API endpoint and a chat model are interchangeable backends. External text stays in its own field, and invalid answers are dropped.
- Implemented: the Decisions backend defaults to OpenRouter and accepts any endpoint with the same schema, for example TypeSafe. Questions use the API's `criteria` forms.
- Observed (`orchestrator/index.test.ts`): a notification that a confident classifier skips creates no run. Each record keeps the backend and the threshold in effect.
- Implemented: Settings > Memory selects the backend and the trust threshold. The default is no classifier.
- Observed (`orchestrator/index.test.ts`, T9): a confident idle appraisal becomes an internal proposal, and its run outputs without external input.
- Observed (`orchestrator/index.test.ts`, T10 and T12): an idle appraisal can discard its proposal without a run. Unchanged observations are not appraised again. A proposal beyond depth two is rejected.
- Observed (`lease-table.test.ts`): candidates for one resource rank by salience tier, then deadline, then waiting time. Other resources never wait for them.
- Observed (`orchestrator/index.test.ts`): an urgent waiting notification goes ahead of a later chat send for the voice. An expired notification is ignored before any classifier call.
- Observed (`chat-orchestrator-runs.test.ts`, `orchestrator/index.test.ts`, T20): the run limit counts working runs of every owner. A limit of one serializes chat sends and notifications with the normal envelopes and traces.
- Observed (`error-burst.test.ts`, `orchestrator/index.test.ts`): three blocked runs within a minute pause notifications and idle appraisal for a minute. Paused work is deferred, never dropped. Direct owner input does not wait.
- Implemented: intake applies hard constraints, then resource order. Rules decide who gets a chance now. The run, and later mood and persona, decide whether to speak.
- Designed: persona and mood change appraisal cadence in P6. P3 uses the user's idle check interval, and a short interval changes how often the character looks, not how often it speaks.
- Experimental: whether either backend improves attention decisions. Live evidence after P10 must compare decisions and latency against fixed rules.

### P4 progress

- Observed (`chat-orchestrator-runs.test.ts`, T2): a run that calls the silence tool ends `done` with `silent`, and leaves no assistant message or reply hook.
- Observed (`chat-orchestrator-runs.test.ts`, T8): an empty reply without the tool and a provider failure never count as silence. Spoken text after the tool wins.
- Implemented: every chat run offers the silence tool, so the tool list stays stable. The decision belongs to the run, not to intake.
- Observed (`delivery.test.ts`, `chat-orchestrator-runs.test.ts`, `chat.contract.browser.test.ts`, T6): an interrupted voice reply records its finished segments. The next prompt reads only that delivered part, and the chat keeps the generated text.
- Not provided: streaming speech providers bypass the segment pipeline, so their interruptions do not record delivered speech.
- Observed (`speech-pipeline.test.ts`, `playback-manager.test.ts`): an intent can interrupt at a segment boundary. The playing sentence finishes, and the rest of the old intent never plays.
- Observed (`orchestrator/index.test.ts`): a notification at 0.85 or more takes the voice from calmer speech and interrupts at a boundary. A calmer notification waits in line.
- Observed (`speakable-text.test.ts`): speech drops fenced code, markup markers, and link addresses, even across chunk boundaries. The chat keeps the full text.
- Experimental: a classifier check and a fast model rewrite for other unspeakable text wait for P5 model tiers. The markup filter is the deterministic fallback.
- Observed (`speech-device.test.ts`): a module can offer a speech device only for its declared scenes. A device leaves with its module.
- Observed (`chat.contract.browser.test.ts`, `context-bridge.contract.browser.test.ts`): while a device is active, a local conversation answers in text, and only the device scene's run speaks. Its reply is spoken, not posted as text.
- Observed (`device-forwarding.test.ts`): a device turn's segments reach the device in local playback order. A local interruption stops the device and drops later segments.
- Implemented: Discord offers each joined voice channel as a speech device, plays forwarded segments in order, and stops on `speech:stop`. It offers its channels again after AIRI reconnects. Live playback is unverified.
- Implemented before P4: domain state reaches the conversation through fixed, replacing context slots (P0). Owner input reaches the conversation run, and domain work goes through admitted commands (P3).
- Implemented: input ownership needs no classifier handoff. Direct conversation stays free of synchronous classifier triage, so the conversation run hands domain intent to modules through admitted commands.
- Observed (`voice-playback.test.ts`, `lease-table.test.ts`, `chat-orchestrator-runs.test.ts`): a run's speech keeps the voice after the run ends, until its turn ends. Calm work waits. Owner input cuts in.
- Observed (`speech-pipeline.test.ts`): a turn cancelled before it started still reports its cancellation, so its playback lease is released.
- Not provided: streaming speech providers bypass the segment pipeline. Their voice lease still ends with generation.
- Observed (`orchestrator/index.test.ts`, `chat-orchestrator-runs.test.ts`, T11): a spoken notification reaction joins the owner session with its run id and source, and adds no user turn. The next owner turn reads it.
- Observed (`delivery.test.ts`): an interrupted reaction records its heard part on that message, like a chat reply.
- Not provided: the reaction prompt does not read the session history yet. Prompt recipes in P7 own that assembly.
- Observed (`chat-orchestrator-runs.test.ts`, T3): work without the voice output runs while another run holds the voice, and never reserves it.

### P5 progress

- Observed (`chat-orchestrator-runtime.test.ts`, `llm-service.test.ts`): portable history survives a model or adapter switch. Native continuation stays with its own adapter and model.
- Observed (`model-profile.test.ts`): a profile keeps catalog facts and learned tool failures, and unknown facts stay unknown.
- Observed (`spending.test.ts`): the ledger counts costs in a rolling window and reports when spending falls under the limit.
- Observed (`model-routing.test.ts`): without task evidence, the router keeps the configured model. It never ranks by price.
- Implemented: the conversation model is never a routing task. The whitepaper's "conversation model as the default tier" yields to Appendix A, so the user's choice stays.
- Designed: no production task routes yet. Quality tests need live task traffic, which waits for the timing measurements after P10.
- Observed (`chat-orchestrator-runs.test.ts`, `orchestrator/index.test.ts`, `model-profiles.test.ts`): a reached spending limit rejects owner input with a message and defers notifications before any model or classifier request. No model is swapped.
- Implemented: every model request reports its first-token delay and estimated cost. The Consciousness page holds the optional hourly limit and the folded model tiers.
- Not provided: the ledger lives in leader memory and restarts empty. Decisions API classifier calls report no token usage, so they are not counted.

### P6 progress

- Observed (`mood.test.ts`): classifier jitter of about ±0.04 moves the settled baseline expression by less than 0.04 per update, and its name stays the same. Mood returns to the persona baseline by its half-life.
- Observed (`mood.test.ts`): each feeling fades by its own half-life, so anger fades before sorrow. Feeling probabilities are the weights of one appraisal.
- Observed (`mood.test.ts`, `airi-card-editor.test.ts`, stage-ui `mood.test.ts`): the temperament on a character card sets how far and how long mood moves. The center is rational, and the edge is emotional.
- Implemented: mood reuses the attention classifier. The temperament is set with a four-quadrant control in the card editor, separate from the mood that analysis moves.
- Observed (`mood.test.ts`): anger and fear differ by dominance. A sentence expression that opposes the mood in pleasure loses up to half of its intensity. Thinking keeps its intensity.
- Observed (`triage.test.ts`): the same event gets different classifier decisions under different moods, and the appraisal records the mood in effect.
- Observed (`chat-orchestrator-runtime.test.ts`, `mood.test.ts`): each run's prompt carries one mood sentence, such as "Current mood: slightly irritated.", for the persona of its own session. Notification reactions read the same sentence.
- Observed (`mood.test.ts` in stage-ui): mood moves only after confident scores for every dimension, only for the appraised persona, and rests at the baseline without a classifier.
- Implemented: finished turns and urgent events appraise mood beside the work. Idle checks scale by arousal. The stage composes sentence expressions with the mood and returns to the mood baseline after speech.

### Open P0 evidence

These checks need live models, bots, or windows. They are not verified.

- Minecraft relay through a live model to a running bot, and a live `minecraft:status` source read.
- Discord channel recovery across a restart, with replies only in the source channel.
- Reminder timing in a minimized desktop window.
- Devtools in a follower window during a live turn.

### Known limits after P1

- Resolved in P3: the command tool and notification commands pass admission. The tool can no longer broadcast.
- A module without a declared scene speaks for the owner. Modules that serve other people declare scenes in the P3 `cognition` block. Public scenes wait for a caller, for example live streaming.
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
