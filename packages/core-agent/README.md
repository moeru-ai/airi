# Core Agent

`@proj-airi/core-agent` owns scheduling, context composition, tool rounds, and generation events. Stage applications provide persistence and UI through its ports. Provider registration and configuration belong to `provider-inference`. Authentication and Flux billing belong to the gateway.

## Conversation and protocol projection

`Conversation` contains ordered `Turn` values. `UserTurn` owns user content. `SystemTurn` owns instructions or application context. Its authority distinguishes system instructions, developer instructions, and context data. Application context does not gain instruction authority merely because the application supplied it.

`AssistantTurn` owns an ordered `rounds` array. One round represents one model invocation and all tool executions it requested, including parallel calls. Its content references tool invocations; each invocation owns its call and result once. The provider call id correlates results within that round. Tool reruns use the AIRI invocation id to distinguish repeated provider call ids. A run id refers to a real scheduler execution, not the number of rounds. Imported history has no model-call metadata when that information is unavailable.

`ProviderContinuation` stores each protocol's own SDK message type: Chat `Message[]` or Responses `ItemParam[]`.

`streamFrom` selects the configured provider capability before request projection. The Chat adapter renders Chat Completions messages. The Responses adapter renders native Items directly from the same context. Chat array compatibility cannot change Responses input. Both projections leave the context snapshot unchanged.

`streamFrom` retries a request up to three times when the provider returns HTTP 408, 429, or 5xx before any stream event reaches the caller. It waits for the `Retry-After` delay when the header is readable, or 3s, 6s, and 12s otherwise. A `Retry-After` longer than 30s fails at once. Other statuses, network failures, and failures after output or tool calls fail at once, so text and tool side effects never repeat. `abortSignal` also cancels a pending wait.

When a caller supplies `resolveStep`, `streamFrom` reads current settings before each model request. It resolves the first request before projecting the conversation. A continuation scope change starts a new SDK stream. Completed rounds and usage remain in one assistant turn. The callback returns the current tools and header overrides for each request.

Set `StreamOptions.toolsEnabled` to `false` for a generation that must not use tools, such as a background greeting.
The runtime skips caller and built-in tool resolvers. Both protocols omit tools and tool choice. Responses also omits provider web search.
This policy takes priority over capability overrides and live tools from `resolveStep`. It does not change compatibility caches or stored tool results.
An absent or `true` value keeps the existing tool policy. This option controls requests, not provider-side access or a security sandbox.

`prepareConversation` adapts media to the resolved request before the protocol adapter projects the conversation. It runs for each SDK stream, so it also runs after a scope change selects another model. It returns a request copy and keeps stored recordings intact. Stage uses it to send audio only to models that accept audio, and transcripts to other models.

The chat orchestrator forwards a send's `resolveStep`. It appends that send's system prompt supplement, including sticker instructions, to each resolved prompt.

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

After all SDK steps settle, `onGeneratedTurn` receives the new `AssistantTurn`. Each round records model usage, its finish reason, tool invocations, and native continuation data. SDK input snapshots define round boundaries; message roles do not define runtime rounds.

The generated turn contains settled rounds and is stored under the existing `generationTranscript` history key. Live deltas still use the existing stream event contract. An interrupted execution does not store a generated turn. If it produced visible output, local Chat history preserves that output with `interrupted: true` so the user can read and retry it.

A stored assistant message has `createdAt` from when it started and `completedAt` from when it stopped receiving output, at its end or at its interruption. Windows that do not run the generation use `completedAt`, for example to time how long a reply shows.

The adapter preserves SDK continuation data without parsing nested provider fields through local schemas. It checks the outer array before replay. Its scope contains provider identity, endpoint, model, and conversation. Credentials and request headers do not change this scope. A protocol or scope change projects round content. Unknown native content records a projection issue without removing the original payload or other readable items. Cross-protocol projection reports that issue instead of silently omitting content. A local tool-result edit invalidates native data for that round and later rounds that used the old result. Cancelled or failed generations do not commit a generated turn. `AssistantTurn.status` is therefore `completed`. Tool executions within that turn can still report failure.

Local history preserves complete turns and visible output from interrupted turns. Interrupted records stay on the device because the cloud wire format cannot preserve their incomplete state. Cloud chat sync currently transfers completed text and does not restore native continuation on another device.

## Responses API

A provider resolves a discriminated `GenerationRequest` before context projection. The adapter owns its wire format and SDK event conversion. The adapter uses `@xsai-ext/responses` with `store: false`. It replays complete Items and executes local function tools for at most ten steps.

The current Responses adapter supports text, images, file data or URLs, refusals, and function calls. It rejects audio input and provider file IDs. It supports provider-executed web search alongside local function tools. Search records remain in native continuation. Citation events and portable text retain source URLs and offsets. Incomplete responses and EOF before a terminal event fail the generation. Session cancellation aborts the active provider request.

Realtime transport is not implemented. A future session adapter can project the same context, but must define continuous input, interruption, and session ownership separately.

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

## Chat stickers

A host can supply `stickers` in the send options. Each entry has an `id` and a model-facing `description`. Hosts include image names and emotion tags in that description.
The queue copies the catalog when the request is submitted, alongside its provider identity and system prompt supplement.
Concurrent sessions and queued sends retain their own catalog. The runtime adds its marker instructions to that request's system prompt.
An absent or empty catalog disables sticker output and adds no prompt instructions.

The existing marker parser accepts `<|STICKER id|>` across stream chunks.
The runtime stores at most one known ID as a `ChatSlicesSticker` per reply.
Unknown IDs are ignored. Sticker markers never reach literal speech or special-token hooks.
Other special markers retain their existing behavior. A reply can contain text, a sticker, or both.
The host renderer resolves the ID to local artwork. The core has no image assets, URLs, storage, or model dependencies.

## VoiceController

The implemented coordinator is `VoiceController`. It composes audio primitives with transcription, trusted plugins, submission, and named response interruption.
Use it for conversation lifecycles. Use pipelines-audio directly for an independent recording attachment.
Browser resources stay in audio adapters. Character selection and persistence stay in application adapters.

```text
src/voice/
├── index.ts         # The public voice API. Import from the package root, not from these files.
├── controller.ts    # VoiceController and its options
├── interruption.ts  # Interruption receipts and the durable interruption event
├── turn.ts          # TurnRef and turnKey
├── input/           # One speech input: admission, capture, transcript, end detection, submission
├── output/          # VoiceResponse and ordered SpeechStream producers
└── plugins/         # Trusted plugin types, installation, input scopes, and task lifetimes
```

`input/` and `output/` do not import `controller.ts`. `plugins/` reads input types but never the controller.

```ts
const voice = new VoiceController({
  audio,
  transcriber: sessionId => hearingFor(sessionId),
  submit: (input, signal) => saveDraftOrSubmit(input, signal),
  speech: turn => speechOutputFor(turn),
  recordInterruption: event => agent.receiveInterruption(event),
})

const input = voice.beginInput({
  sessionId,
  interruptTurns: [currentTurn],
  start: { kind: 'after-silence' },
})

// The release control calls end. Provider final output and selected plugin work can then finish.
const result = await input.end()
```

- `SpeechInputAttempt` exists during playback fade and until the source delivers audio, which includes microphone permission.
- `SpeechInput` exists after capture admission. It retains raw transcripts, corrected text, speaker evidence, and plugin context.
- `end()` completes recording. `cancel(reason)` rejects later publication from the attempt.
- `interrupt({ turns, cause })` targets named responses and reports silence separately from agent delivery.
- The notification receiver deduplicates by event ID. Its acknowledgment means durable receipt, without another user message or response.
- `audio` is a shared `AudioInput`. Attempts and plugins subscribe to it. The controller never closes it.
- `replaceAudio(input)` cancels active attempts and moves plugin observations to the new input.
- A transcriber receives continuous PCM. An adapter that needs a file or a MediaStream converts the PCM itself.

### Trusted plugins

```ts
voice.use({
  name: 'memory',
  setup(plugin) {
    plugin.onSpeechInput((input) => {
      input.subscribe({ transcript: 'corrected', speakers: true, scheduling: 'latest' }, async (ctx) => {
        const matches = await memory.search({
          text: ctx.snapshot.transcript.text,
          speakers: ctx.snapshot.speakers,
          signal: ctx.signal,
        })
        ctx.context.set('matches', matches)
      })
    })
  },
})
```

The task context checks freshness at publication. A stale result cannot replace current context.
`ordered` processes every accepted snapshot in order. `latest` cancels stale work and replaces pending snapshots.
Lifecycle tasks can await `untilTranscriptionEnded()` or `untilDependenciesSettled()`.
Timeouts and submission grace periods are caller options. The runtime imposes no resource quotas.

VAD, PTT, wake words, speaker models, turn detection, memory search, and rewrite models remain external policy or adapters.
Plugins receive source-tagged windows and scoped controls. They do not receive unrestricted controller access.
Automatic patches use raw word or sentence coordinates and preserve raw history.

### Output without voice input

```ts
const voice = new VoiceController({ speech: turn => speechOutputFor(turn) })
const response = voice.openResponse({ sessionId, turnId })
const acknowledgment = response.openSpeech({ purpose: 'acknowledgment' })
const answer = response.openSpeech({ purpose: 'answer' })

await acknowledgment.write('Let me check.')
acknowledgment.end()
await answer.write(answerText)
answer.end()
await response.finish()
```

Producers can synthesize concurrently. Playback follows their reservation order.
Cancelling an acknowledgment releases its place without reporting a user interruption.
Whole-turn interruption aborts generation, synthesis, queued audio, and playback for that response.
