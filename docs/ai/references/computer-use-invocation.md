# Desktop computer-use invocation contract

The desktop host owns AUV admission, approval records, execution ordering, and screenshot storage.
The existing Chat runtime owns conversation correlation and tool selection.
This slice does not add an approval UI or resume a conversation after approval.

## Request provenance

The Chat orchestrator generates `requestCorrelation` for the accepted user message.
The stage-ui LLM adapter captures its conversation and turn IDs in request-local tool closures.
At execution, the tool wrapper adds the provider's `toolCallId` from execution options.
The desktop executor sends this correlation through Eventa.
Electron Main obtains the source `webContents.id` from IPC metadata, independent of the payload.

```text
Core Chat requestCorrelation
  -> stage-ui request-local tool closure
  -> Tool.execute(input, executionOptions)
  -> desktop Eventa invocation
  -> Main source and approval checks
  -> serialized AUV execution
  -> original Chat history
```

Model arguments contain `argv` or an image `path`.
They cannot supply approval IDs or correlation to the desktop executor.
Application-owned execution options can carry an approval ID.
An approval ID is a reference to a host record, not permission on its own.

Correlation identifies the application request. It does not authenticate code inside a renderer.
The Electron sender identifies the source renderer. It does not prove that renderer code is uncompromised.
The host rejects IPC without a live Electron sender.

## Approval lifecycle

The host copies arguments and provenance when it creates a pending action.
A record requires a session ID, turn ID, tool-call ID, and verified source ID.
Public records are detached snapshots and cannot change host state.

An approval binds all four origin fields and the exact argument array.
This slice permits execution only for that original request.
Execution in a new turn requires an explicit future contract. There is no automatic cross-turn transfer.

Admission checks run before queueing. They do not consume approval or block observations while approval waits.
The queued operation rechecks state, expiry, origin, arguments, and execution preconditions when its serial slot opens.
It then consumes approval synchronously, before its execution attempt starts.

Cancellation invalidates waiting approvals of the same source, session, and turn.
It does not cancel other turns in that session or actions from another renderer.
The renderer retains one cancellation listener per request signal, including gaps between tool calls.
Renderer destruction and host shutdown invalidate waiting approvals independently.

A committed operation retains the serial slot until its executor settles, even after its Chat turn is cancelled.
The host records its actual result. Cancellation does not falsely report that an executing operation never ran.
Startup failures, spawn failures, timeouts, and normal CLI exits all settle a consumed action once.
Failure does not restore approval. Replays and duplicate settlements are rejected.

An exit code describes the executor result. It does not independently prove the intended application effect.

## Input target boundary

A `--target` flag does not prove that an operating-system input event reaches that target.
Sensitive click, keyboard, pointer, and text commands remain closed, even with a matching approved record.
Enabling them requires an executor contract that binds delivery to the target.
Approval UI and target-bound input are separate follow-up slices.

## Screenshot reads

Model observations and `computerUseReadImage` require a session, turn, and tool-call ID by default.
`computerUsePreviewImage` belongs to local history rendering and requires an Electron source without inventing a session.
The preview endpoint is not exposed as a model tool.

Both endpoints use the same real-path confinement, file-size limit, format checks, and WebP conversion.
They read only screenshots within AIRI's private computer-use artifact store.
Local history previews follow a shared-store policy. They do not implement per-session artifact access control.
Changing that policy requires artifact ownership records, not additional correlation strings.

## Verification scope

`chat-runtime.test.ts` uses the real Core Chat orchestrator, Pinia LLM adapter, xsAI tool loop, and Eventa adapters.
Its session persistence port, provider network, Electron transport, and AUV process boundary use deterministic fixtures.
The tests check generated request identities, original history writes, concurrent sessions, cancellation, queue expiry, and settlement.
They also check that model arguments cannot inject approval and that targeted input stays closed.

`action-manager.test.ts` checks binding, snapshots, missing provenance, single consumption, and settlement integrity.
`use-computer-use-screenshots.test.ts` checks the preview contract and stale asynchronous results.

These are automated integration and regression tests. They are not live-model desktop acceptance.
The environment-gated live Runtime test separately checks the bundled CLI and private daemon.
Record model, environment, code SHA, failed attempts, and an independent result check for live Chat acceptance.
