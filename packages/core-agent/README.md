# Core Agent

`@proj-airi/core-agent` owns scheduling, context composition, tool rounds, and generation events. Stage applications provide persistence and UI through its ports. Provider registration and configuration belong to `provider-inference`. Authentication and Flux billing belong to the gateway.

## Conversation and protocol projection

`Conversation` contains ordered `Turn` values. `UserTurn` owns user content. `SystemTurn` owns instructions or application context. Its authority distinguishes system instructions, developer instructions, and context data. Application context does not gain instruction authority merely because the application supplied it.

`AssistantTurn` owns an ordered `rounds` array. One round represents one model invocation and all tool executions it requested, including parallel calls. Its content references tool invocations; each invocation owns its call and result once. The call id correlates results within that round. A run id refers to a real scheduler execution, not the number of rounds. Imported history has no model-call metadata when that information is unavailable.

`AgentMessage<Protocol>` is the owning SDK's wire message type after projection. It is not a second universal message schema.

`streamFrom` selects the configured provider capability before request projection. The Chat adapter renders Chat Completions messages. The Responses adapter renders native Items directly from the same context. Chat array compatibility cannot change Responses input. Both projections leave the context snapshot unchanged.

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

After all SDK steps settle, `onTranscript` receives the new `AssistantTurn`. Each round records model usage, its finish reason, tool invocations, and native continuation data. SDK input snapshots define round boundaries; message roles do not define runtime rounds.

The persisted transcript contains settled rounds. Live deltas still use the existing stream event contract. This change does not add persistence for interrupted executions.

The adapter preserves SDK continuation data without parsing nested provider fields through local schemas. It checks the outer array before replay. Its scope contains provider identity, endpoint, model, and conversation. A protocol or scope change projects round content. Unknown native content records a projection issue without removing the original payload or other readable items. Cross-protocol projection reports that issue instead of silently omitting content. A local tool-result edit invalidates native data for that round and later rounds that used the old result. Cancelled or failed generations do not commit a transcript.

Local history preserves complete turns. Cloud chat sync currently transfers text and does not restore native continuation on another device.

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
The scheduler commits a transcript only after transport, local tools, and event consumers complete.
Source links remain separate from speech text and survive local history persistence.
