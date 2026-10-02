# Core Agent

`@proj-airi/core-agent` owns scheduling, context composition, tool rounds, and generation events. Stage applications provide persistence and UI through its ports. Provider registration and configuration belong to `provider-inference`. Authentication and Flux billing belong to the gateway.

## Conversation and protocol projection

`Conversation` contains ordered `Turn` values. `UserTurn` owns user content. `SystemTurn` owns instructions or application context. Its authority distinguishes system instructions, developer instructions, and context data. Application context does not gain instruction authority merely because the application supplied it.

`AssistantTurn` owns an ordered `rounds` array. One round represents one model invocation and all tool executions it requested, including parallel calls. Its content references tool invocations; each invocation owns its call and result once. The provider call id correlates results within that round. Tool reruns use the AIRI invocation id to distinguish repeated provider call ids. A run id refers to a real scheduler execution, not the number of rounds. Imported history has no model-call metadata when that information is unavailable.

`ProviderContinuation` stores each protocol's own SDK message type: Chat `Message[]` or Responses `ItemParam[]`.

`streamFrom` selects the configured provider capability before request projection. The Chat adapter renders Chat Completions messages. The Responses adapter renders native Items directly from the same context. Chat array compatibility cannot change Responses input. Both projections leave the context snapshot unchanged.

`streamFrom` retries a request up to three times when the provider returns HTTP 408, 429, or 5xx before any stream event reaches the caller. It waits for the `Retry-After` delay when the header is readable, or 3s, 6s, and 12s otherwise. A `Retry-After` longer than 30s fails at once. Other statuses, network failures, and failures after output or tool calls fail at once, so text and tool side effects never repeat. `abortSignal` also cancels a pending wait.

When a caller supplies `resolveStep`, `streamFrom` reads current settings before each model request. It resolves the first request before projecting the conversation. A continuation scope change starts a new SDK stream. Completed rounds and usage remain in one assistant turn. The callback returns the current tools and header overrides for each request.

```ts
await streamFrom({
  model: 'selected-model',
  chatProvider: selectedProvider,
  conversation: {
    turns: [{
      id: 'input-1',
      type: 'user',
      content: [{ type: 'text', text: 'Hello' }],
    }],
  },
})
```

The existing session store uses Chat-shaped UI records. The orchestrator decodes those records at the storage boundary, then composes runtime context as structured segments. Chat sends, vision inputs, and Spark notifications use the same generation contract. Hooks and the plugin bridge receive a separate display projection. That projection is text-only and excludes native continuation data and media payloads. Images, audio, and files become labels, including tool results.

## Turn history

Runtime context uses writer buckets containing independent `contextId` slots.
`replace-self` replaces only the matching slot in that writer's bucket.
Other slots and other writers remain intact. Snapshots are clones and cannot change registry state.
Reader snapshots match exact destination identities. Exclusions take precedence over inclusions.
A reader without a lane reads every lane. A lane-scoped reader reads its own lane and entries without a lane.
An entry without destinations is visible only to its writer. Explicit `{ all: true }` publishes to all readers.
An `Audience` is `public` or a sorted set of subjects. A reader with an `audience` reads an entry only when the entry's allowed audience includes it.
The host assigns entry audiences. An entry without a label reaches the owner only. Destinations and audiences must both allow a read.
`audienceFromBindings` gives every scene the owner plus one members subject for each external binding.
Writes take `intersectAudiences` of everything the run read. A run's effective audience is `unionAudiences` of its outputs.
An empty destination list publishes to no reader. Unfiltered snapshots serve local diagnostics only.
Active observations expire after 60 seconds by default. `ttlMs` overrides their lifetime, and a local `expiresAt` can shorten it.
The default budgets are 800 units total, 200 per writer, and 80 per entry. Each append slot retains at most eight events.
Only the fixed `events` slot accepts `append-self` by default. Hosts can declare other fixed slots through `appendContextIds`.
An empty slot list disables append. Slot matching is exact and each writer retains its own event window.
Rejected append updates preserve active observations and remain in diagnostic history.
Spark tools put append observations in the fixed event slot. Their unique event identifiers remain separate from the slot identifier.
`loadContextTokenCounter()` loads local `js-tiktoken/lite` with `o200k_base` once per process. The rank table is a separate chunk.
A host without observations never downloads it. `ingest` needs `countTokens`. Pruning, removal, and projection do not.
This encoding defines pool budgets, not provider billing. Literal control-token markers count as ordinary text.
Hosts can supply a different tokenizer through `countTokens`. The default loads no remote word list and sends no text over a network.
Producers can import `createContextText` and `loadContextTokenCounter` from `@proj-airi/core-agent/context` without loading the agent runtime.
`createContextText` is async. It replaces text over 80 tokens with a `sourceRef`. Producers retain the original details in their own state.
An origin handle identifies details. It cannot grant tool or read permissions. Oversized handles fail instead of entering the pool.
`limitContextText` cuts source details to `CONTEXT_SOURCE_TOKEN_LIMIT`, 1000 tokens, at a code point boundary.
Empty observations cost one unit. Retention combines salience and freshness, with older entries losing equal-priority ties.
The writer budget evicts only the incoming writer's entries. The pool budget then evicts the lowest retention across all writers.
Pool entries keep the fields that projection, expiry, and routing read. `content`, `ideas`, and `hints` stay with the producer.
Each stored entry has a 2048-byte serialized limit, so routing fields cannot inflate replication.
Rejected replacements preserve the previous slot. History records keep identity, slot, and in-budget text only. Rejected text never enters history or checkpoints.
Each send captures one session-filtered snapshot for both the model request and its display events.
`checkpoint()` captures active costs, original expiry times, and bounded history for trusted host replication.
`initialState` restores that checkpoint without replaying observations. Do not accept checkpoints from module transports.
`projectContextRegistryState` gives replicas a read-only projection without updating authoritative state.
`removeWriter()` removes only the named writer's active slots. It preserves bounded history for host delivery deduplication.
Each send also retains its host-selected `outputTarget`. Output hooks keep this return address separate from input content and context visibility.
Request-owned instruction providers run once per send. They bypass the observation pool and cannot retain stale instructions between sends.
`resolveToolsetPrompt` receives only admitted tools before each model request. Its trusted instructions enter a developer message, not shared context.
Tool revocation removes the instructions from the next request. These instructions never enter the SDK transcript or stored generation rounds.
The Spark command tool owns relay syntax guidance. Module observations supply current destination and availability facts.

After all SDK steps settle, `onGeneratedTurn` receives the new `AssistantTurn`. Each round records model usage, its finish reason, tool invocations, and native continuation data. SDK input snapshots define round boundaries; message roles do not define runtime rounds.

The generated turn contains settled rounds and is stored under the existing `generationTranscript` history key. Live deltas still use the existing stream event contract. An interrupted execution does not store a generated turn. If it produced visible output, local Chat history preserves that output with `interrupted: true` so the user can read and retry it.

The adapter preserves SDK continuation data without parsing nested provider fields through local schemas. It checks the outer array before replay. Its scope contains provider identity, endpoint, model, and conversation. Credentials and request headers do not change this scope. A protocol or scope change projects round content. Unknown native content records a projection issue without removing the original payload or other readable items. Cross-protocol projection reports that issue instead of silently omitting content. A local tool-result edit invalidates native data for that round and later rounds that used the old result. Cancelled or failed generations do not commit a generated turn. `AssistantTurn.status` is therefore `completed`. Tool executions within that turn can still report failure.

Local history preserves complete turns and visible output from interrupted turns. Interrupted records stay on the device because the cloud wire format cannot preserve their incomplete state. Cloud chat sync currently transfers completed text and does not restore native continuation on another device.

## Responses API

A provider resolves a discriminated `GenerationRequest` before context projection. The adapter owns its wire format and SDK event conversion. The adapter uses `@xsai-ext/responses` with `store: false`. It replays complete Items and executes local function tools for at most ten steps.

The current Responses adapter supports text, images, file data or URLs, refusals, and function calls. It rejects audio input and provider file IDs. It supports provider-executed web search alongside local function tools. Search records remain in native continuation. Citation events and portable text retain source URLs and offsets. Incomplete responses and EOF before a terminal event fail the generation. Session cancellation aborts the active provider request.

Realtime transport is not implemented. A future session adapter can project the same context, but must define continuous input, interruption, and session ownership separately.

## Runs and execution envelopes

`ingest` builds an `ExecutionEnvelope` through `createEnvelope`: the session, bindings, outputs, effective audience, and persona.
Work whose audience exceeds the session audience rejects before a run exists. The run table never records unauthorized work.
Each admitted send gets a `runId` in `RunTable`. Its state moves through `queued`, `working`, and one final state.
`done` means the send settled, `dropped` means cancellation, and `blocked` means a failure with its error.
The run id reaches `requestCorrelation.runId` and the generated `AssistantTurn.runId`. Run ids use their own factory, so message id sequences stay unchanged.
The context snapshot receives the run audience. Before each assistant write, the session audience narrows to the labels of the pool entries that the run read.
Every input passes intake first. `IntakeLog` records each decision apart from the run table: `admitted`, `deferred`, `merged`, `ignored`, or `rejected`.
An ignored or rejected input has no run. `rejected` is an audience, capacity, or authority failure, never a choice.
Direct owner input also needs an intake decision. `decideDirectIntake` decides it synchronously and locally, so the owner never waits for a remote classifier.
The default rule `decideDirectInput` ignores input with no text and no attachments, and admits the rest. An admitted run can still choose silence.
Input from a connection goes through `decideIntake`, which can ask a remote classifier. Either policy can admit or ignore chat input.
A failing policy admits the input with `decidedBy: 'fallback'`, so a broken policy cannot lose input.
`ingest` resolves with the stimulus id, its outcome, and the run id when it was admitted.
Each session has its own queue. A session runs one send at a time, and different sessions run concurrently up to `maxConcurrentRuns`.
The limit counts working runs of every owner that shares the run table. A limit of one is the single active run mode, with the same envelopes and traces.
A session holds at most `maxQueuedPerSession` waiting sends. A full queue rejects before a run exists. `getLimits` supplies both limits.
The voice is an exclusive lease in `LeaseTable`. A send with the `voice` output waits while any run holds it, and releases it when it ends. Domain sends keep running.
A lease is free when its holder releases it or it expires. Only a request with `preempt` and strictly higher salience takes over a held lease.
`handOver` moves a held lease to another holder, for example from a finished run to its speech that still plays. Nobody in the line takes it in between.
A handed-over lease can be interruptible. A request with `interrupt` takes it over at any salience. Direct owner input interrupts. Other sends wait for the speech to end.
Requests for one resource wait in a line. A free resource goes to the first candidate: higher salience tier, then the earlier deadline, then the longer wait.
Waiting time only prevents starvation. Requests for different resources never compare, so work that needs no shared resource runs in parallel.
Requesters withdraw when they stop waiting. A candidate that has not asked for five minutes leaves the line.
Pass `runs`, `intake`, and `leases` to share them with other run owners in the host. Each table notifies its subscribers.
Runtime state reports `runningSessionIds`, `voiceSessionId`, and the live reply of each running session.
Supervision ends a run that streams nothing for `stallTimeoutMs` (60 seconds) or runs past `runDeadlineMs` (10 minutes). The run becomes `expired`.
Three identical consecutive tool calls end a run as `blocked`. A supervised end rejects the send, so the caller sees a failure, never a quiet success.
`cancelRun(runId, { rollback })` stops a waiting or running run. Its late output never commits.
With `rollback`, the run's user turn and partial reply leave the session through `removeSessionMessages`. A requeued input therefore appears once.

## Silence

A conversation run can choose silence by calling `builtIn_stayQuiet` from `createStayQuietTool`. The run ends `done` with `silent` and its private reason.
A silent run appends no assistant message and emits no reply hooks, so no channel receives an empty reply.
Silence needs the explicit tool call. An empty reply without it stays a normal result, and a failure stays `blocked` or `expired`.
Spoken text after the tool call wins, and the reply is kept.

## Delivered speech

An assistant message can carry `deliveredSpeech`, the speech that reached the listener before playback stopped. It is present only for an interrupted voice reply.
A reply that a notification started carries `proactive` with its run id and source. It has no user turn before it, and later prompts read it like any assistant turn.
The next prompt reads only that part, with a cut mark. Tool calls stay. The chat keeps the generated text.

## Error bursts

`ErrorBurstBreaker` watches run changes. Three `blocked` runs within one minute start a one-minute cooldown.
Background owners defer work during the cooldown. Direct owner input never waits for it, so the owner sees each failure.

## Classifier triage

A `Classifier` answers typed questions with probabilities: `noul` for yes or no, `choice` for one option, and `score` for an ordered scale. It never generates text.
Questions use the Decisions API forms that OpenRouter and TypeSafe serve. `criteria` holds the yes and no meanings, the options, or the levels.
`appraiseStimulus` asks whether a stimulus deserves attention and how urgent it is, in one call. External text goes into the untrusted field only.
`askWithin` aborts a call at its deadline, 800 ms by default. A late, failing, or malformed answer means no appraisal.
`decideByAppraisal` uses an answer only when its confidence reaches the threshold, 0.8 by default. Users set the threshold.
A confident answer below 0.2 ignores the stimulus. Otherwise the urgency score averages with the prior. Without a usable answer, the prior decides as `fallback`.
A scene source stays at or below 0.8 salience, so classifier output can never let it interrupt. A classifier ranks work and never grants authority.

## Command admission

`admitCommand` checks every `spark:command` before it leaves the host. The issuing run must be `working`, and the command must name destinations.
Each destination must be a connected module whose `cognition.accepts` lists the intent. A module with scenes receives no commands.
A module with exclusive control gets a `module:<name>` lease for the run's session, with the declared expiry. Another session's live lease rejects the command.
A `critical` command with higher salience takes the lease over. An admitted command carries `holder`, the session that controls the module.
`createSparkCommandTool` reports a rejection to the model, so the model never claims a relay that admission refused.

## Spark notification cancellation

The host supplies an `abortSignal` to the notification agent and its model runner.
Cancellation blocks new model work, late reaction deltas, and command completion, even when a runner ignores transport cancellation.
An asynchronous reaction sink remains part of the run until its stream closes. Completed audio playback has a separate host lifecycle.
`handle` returns the commands and the reaction text. The reaction is empty when the agent chose no response.

## Verify

```sh
pnpm -F @proj-airi/core-agent typecheck
pnpm -F @proj-airi/core-agent exec vitest run src/runtime src/messages src/agents/spark-notify
```

## Type boundaries

Turn types constrain their content. User and system turns cannot contain execution rounds. Only assistant rounds own tool invocations.
Files have exactly one source. SDK output and restored continuation enter through protocol boundaries.
The public stream event union has no `any` branch. Protocol adapters translate SDK events into this contract.
The scheduler commits a generated turn only after transport, local tools, and event consumers complete.
Source links remain separate from speech text and survive local history persistence.
