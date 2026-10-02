# Cognitive scheduler

Status: Accepted, scope revised on 2026-10-03

## Context

The chat runtime serialized requests across sessions. Context snapshots included every active source, without reader isolation or expiry.
External input could name a session that had no persistent metadata. Several windows could run the notification ticker.

These assumptions blocked concurrent work and could expose unrelated context to a private conversation.
The first plan answered them with a full scheduler: intake classifiers, relay agents, scheduler-composed prompts, model routing, and staged result routing.

Live use on 2026-10-03 showed the cost of that plan. Each extra agent resent its own prompt, and each classifier added a model call per message.
The features that the owner used most were small: per-session persona identity, mood, and recipes. They needed little of the scheduler machinery.

## Decision

AIRI keeps one main conversation agent. Background task agents work beside it.

- Input is a stimulus, not an obligation. The main agent can read a message and stay silent through the stay-quiet recipe.
- Output does not need external input. Auto-run recipes start on a silence, a schedule, or a new observation from a registered source.
- A background task is a recipe run in its own session. It never resends the main conversation, and it can use only the tools granted to the owner's message.
- A background task notifies the main agent directly with a context notice. No relay agent rewrites its result.
- The owner can see every background task, stop it, and predict what it does from its recipe.
- Persona switching moves the main agent to another persona session. The new persona gets enough context and the shared long-term memory, and the stage shows the switch.
- Long-term memory is a small index and one entry per fact, like a project memory file. A recipe can tidy it. Each entry names who can see it.

Each identity reads from the session's persona when a run starts, never from a snapshot in history.
Mood belongs to each persona. The character card sets the temperament, and the attention classifier is optional.

## Kept from the first plan

These parts cost no model calls and fix real defects, so they stay:

- Reader isolation, expiry, and budgets for shared context. Discord context never reaches the owner chat.
- Audience labels on sessions, context, and output. Private replies never reach other people.
- Per-session queues, cancellation with rollback, run supervision, and loop correction.
- The voice lease. Only one speaker holds the voice.
- Derived runs with depth and fan-out bounds and cascading cancellation. Background tasks use them.
- The optional hourly spending limit.

## Removed from the first plan

- The spark-notify reaction relay for internal proposals and background results.
- Idle appraisal, already replaced by owner recipes.
- The intake classifier for connection input and the module `cognition` declarations that fed it.
- Model routing and model tiers.
- Scheduler-composed prompts, result routing rules beyond the parent conversation, and the external-agent run convention.

Code for removed parts leaves the branch in the commit that removes it, with this record and the progress notes below.

## Plan

| Step | Change | Acceptance |
| --- | --- | --- |
| 1 | Remove the relay, intake classifier, module declarations, and routing | No feature in the kept list changes. Fewer model calls per owner message. |
| 2 | Background task notices, a task list, and a stop control | A finished task adds one context notice to its conversation. The owner can stop a running task. |
| 3 | Long-term memory as an index and entries, and a tidy recipe | The main agent reads the index each turn and opens entries on demand. Owner-only entries never reach a scene. |
| 4 | Persona switching with a stage effect | A switch keeps each persona's history and mood, and carries shared memory. |

## Implementation boundaries

`core-agent` owns runtime policy and portable contracts. `stage-ui` connects storage, providers, tools, and visible streams.
The desktop renderer leader hosts background tasks and recipe triggers. Web and Pocket serve interactive sessions.
Settings follow what they belong to. Recipes live under long-term memory. The character card holds the temperament. Rarely changed settings stay folded.

## Validation

Use deterministic runtime tests for queues, cancellation, derived runs, triggers, and audience rules.
Use browser tests for persistence and chat surfaces. Use live voice and character evidence for speech, expression, and persona switching.
Measure model calls and prompt tokens per owner message before and after each step.

## Progress

- The notes below record the first plan, stage by stage. Notes for removed parts leave with their code. Live scenarios remain open.
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
- Observed (`chat-orchestrator-runs.test.ts`, `run-supervision.test.ts`): a stalled or overdue run expires and its caller receives a failure. The third identical consecutive tool call does not run. Its result corrects the model, and only one more identical call ends the run as blocked.
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
- Observed (`orchestrator/index.test.ts`, T9): with no external input, an owner recipe with an idle trigger starts once per silence in its own session.
- Observed (`orchestrator/index.test.ts`, T10 and T12): with no due recipe, the scheduler asks and starts nothing. A proposal beyond depth two is rejected.
- Observed (`lease-table.test.ts`): candidates for one resource rank by salience tier, then deadline, then waiting time. Other resources never wait for them.
- Observed (`orchestrator/index.test.ts`): an urgent waiting notification goes ahead of a later chat send for the voice. An expired notification is ignored before any classifier call.
- Observed (`chat-orchestrator-runs.test.ts`, `orchestrator/index.test.ts`, T20): the run limit counts working runs of every owner. A limit of one serializes chat sends and notifications with the normal envelopes and traces.
- Observed (`orchestrator/index.test.ts`): notification runs follow the same stall and deadline limits as chat runs. A stalled request expires, its reaction speech stops, and the voice is released.
- Observed (`error-burst.test.ts`, `orchestrator/index.test.ts`): three blocked runs within a minute pause notifications and recipe triggers for a minute. Paused work is deferred, never dropped. Direct owner input does not wait.
- Implemented: intake applies hard constraints, then resource order. Rules decide who gets a chance now. The run, and later mood and persona, decide whether to speak.
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
- Observed (`chat.contract.browser.test.ts`): a device scene gets the voice only while the speech host can forward it. With streaming speech or muted speech, the scene gets a text reply instead, so no reply is lost.
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
- Implemented: with SSML on, each segment's pitch follows pleasure and its speed follows arousal, read at synthesis time. Without SSML, the voice is unchanged.
- Implemented: mood reuses the attention classifier. The temperament is set in the card editor with a point on two axes, tone and energy, around an even center. The control shows degrees, not emotion categories, after maintainer review found four emotion corners too black and white.
- Observed (`mood.test.ts`): prompts name the mood as a blend, and the short-term memory page lists each present feeling with its share.
- Observed (`mood.test.ts`): anger and fear differ by dominance. A sentence expression that opposes the mood in pleasure loses up to half of its intensity. Thinking keeps its intensity.
- Observed (`triage.test.ts`): the same event gets different classifier decisions under different moods, and the appraisal records the mood in effect.
- Observed (`chat-orchestrator-runtime.test.ts`, `mood.test.ts`): each run's prompt carries one mood sentence, such as "Current mood: slightly irritated.", for the persona of its own session. Notification reactions read the same sentence.
- Observed (`mood.test.ts` in stage-ui): mood moves only after confident scores for every dimension, only for the appraised persona, and rests at the baseline without a classifier.
- Implemented: finished turns and urgent events appraise mood beside the work. The stage composes sentence expressions with the mood and returns to the mood baseline after speech.

### P7 progress

- Observed (`chat-orchestrator-runs.test.ts`, `chat.contract.browser.test.ts`): each run reads the identity of its session persona when it starts. A card edit reaches the next run, and a switch never rewrites another session's history.
- Implemented: sessions no longer store a system snapshot. Format rules live in the stage-ui prompt recipe, and notification reactions speak as the session persona.
- Observed (`history-budget.test.ts`, `chat-orchestrator-runs.test.ts`): long history stays within the token budget, priced by what each message projects, tool results and transcripts included. Omitted exchanges give way to a covering digest or a count, and the stored history keeps every message.
- Observed (`chat-orchestrator-runs.test.ts`): a waiting run whose session narrowed below its audience is blocked when it starts and again when it reads history. A spoken reaction joins only a session that only the owner reads.
- Observed (`recipes.test.ts`, `chat.contract.browser.test.ts`, `prompt-recipe.test.ts`): recipes are the user's skills. Reading without replying is a built-in recipe that the owner can turn off, and the run then gets no silence tool. A model proposal waits for one owner approval.
- Observed (`recipe.test.ts`, `chat-orchestrator-runs.test.ts`, stage-ui `triage.test.ts`): decision recipes ask yes-or-no, choice, or score questions before a reply. Each confident answer has its own action, silence wins, and hints join the message as context. A failed decision lets the run reply.
- Observed (`use-recipe.test.ts`, `chat.contract.browser.test.ts`): a recipe runs in its own space. `builtIn_useRecipe` proposes a task to the scheduler and returns at once, so recipe steps never enter the conversation. The tool's guidance lists recipes by purpose and names decision recipes, auto-run recipes, and waiting proposals as the current state.
- Observed (`chat.contract.browser.test.ts`): a keyword trigger starts a task recipe as derived work in the recipe's own hidden session, before the reply. The conversation only learns that it started. The recipe session reads the recipe steps after the identity, gets the tools granted to the owner's message and nothing more, and cannot start or save recipes.
- Observed (orchestrator `index.test.ts`): a finished task recipe returns to its parent conversation as an internal stimulus, with a reference to the recipe run and its reply. The conversation decides what to say.
- Observed (`history.browser.test.ts`, `chat-orchestrator-runs.test.ts`): each reply shows the recipes it used. A handed task shows as a recipe label with the task, and a decision recipe that changed the reply shows on the reply.
- Observed (`recipes.test.ts`): the owner can edit an owner or model recipe. Its source, switch, and approval stay.
- Observed (`recipe.test.ts`, orchestrator `index.test.ts`): auto-run recipes start on an idle or schedule trigger. An idle trigger fires once per owner silence. A start is a proposal, so it waits for the voice and pauses at the spending limit. With no due recipe, nothing is asked or called.
- Observed (`recipe.test.ts`, orchestrator `index.test.ts`): an auto-run recipe can have a gate. The classifier answers it when the trigger fires, and only a confident yes runs the recipe.
- Observed (`recipe.test.ts`, orchestrator `index.test.ts`): an event trigger follows a registered source, such as a module that reports observations. A newer observation starts the recipe in its own session with that observation as its task, at most once per cooldown.
- Implemented: idle appraisal and its built-in recipe are removed. Owner recipes with triggers replace them, so nothing looks around unless the owner set a recipe.
- Designed: mood triggers.
- Observed (`propose-recipe.test.ts`, `chat.contract.browser.test.ts`): the owner can create a recipe in conversation. Owner-private runs get `builtIn_proposeRecipe`, scene runs do not, and the proposal waits for one approval.
- Observed (`chat-orchestrator-runs.test.ts`): a derived run has no voice or owner output, reads within its parent audience, and records an internal intake with its parent. Depth, fan-out, and an ended parent reject derivation before a run exists. Cancelling a parent cancels its derived runs.
- Designed: a recipe run reporting partial progress to the scheduler, and writing urgent state to its slot in the shared pool.
- Designed: handover recipes, such as a way of talking, switch the conversation to the recipe's persona and hand back when it ends (P9).
- Not provided: nothing writes session digests yet, so long sessions show the count. Summaries need a model call and belong with memory in P8.

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
