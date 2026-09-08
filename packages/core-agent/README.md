# Core Agent

`@proj-airi/core-agent` owns scheduling, context composition, tool rounds, and generation events. Stage applications provide persistence and UI through its ports. Provider registration and configuration belong to `provider-inference`. Authentication and Flux billing belong to the gateway.

## Context and protocol projection

`ConversationContext` contains ordered turns. Each turn contains portable messages with structured segments: text, instructions, domain events, runtime context, media, tool calls, and tool results. A tool result refers to its call by `callId`.

`streamFrom` selects the configured provider capability before request projection. The Chat adapter renders Chat Completions messages. The Responses adapter renders native Items directly from the same context. Chat array compatibility cannot change Responses input. Both projections leave the context snapshot unchanged.

```ts
await streamFrom({
  model: 'selected-model',
  chatProvider: selectedProvider,
  context: {
    turns: [{
      messages: [{
        id: 'input-1',
        role: 'user',
        segments: [{ type: 'text', text: 'Hello' }],
      }],
    }],
  },
})
```

The existing session store uses Chat-shaped UI records. The orchestrator decodes those records at the storage boundary, then composes runtime context as structured segments. Chat sends, vision inputs, and Spark notifications use the same generation contract. Hooks and the plugin bridge receive a separate display projection. That projection is text-only and excludes native continuation data and media payloads. Images, audio, and files become labels, including tool results.

## Turn history

After all SDK steps settle, `onTranscript` receives only the new turn. Portable messages preserve intermediate calls and results. Optional continuation data preserves provider fields such as encrypted reasoning, assistant phase, and Chat reasoning fields.

The adapter preserves SDK continuation data without parsing nested provider fields through local schemas. It checks the outer array before replay. Its scope contains provider identity, endpoint, model, and conversation. A protocol or scope change projects portable messages. A local tool-result edit invalidates that turn's continuation data. Cancelled or failed generations do not commit a transcript.

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

Message roles constrain their segments. Users cannot invoke tools, and tool messages require correlated results.
Files have exactly one source. SDK output and restored continuation enter through protocol boundaries.
The public stream event union has no `any` branch. Protocol adapters translate SDK events into this contract.
The scheduler commits a transcript only after transport, local tools, and event consumers complete.
Source links remain separate from speech text and survive local history persistence.
