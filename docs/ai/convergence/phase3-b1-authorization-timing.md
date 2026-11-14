# Phase 3-B1 authorization timing

Date: 2026-11-05. Repair base: `133a83982eb2f662e5871598a4676cad2cd6ee9e`.

This change repairs the reproduced Host startup and cancellation races.
It does not admit native input. The existing input deny remains unchanged.

## State and cancellation boundary

No state value, authorization store, public approval interface, or automatic continuation was added.

| Term | Existing representation | Meaning and cancellation boundary |
| --- | --- | --- |
| Pending | `status=pending` | No approval. Execution rejects. Host can reject or cancel it. |
| Approved | `status=approved` | One immutable request can dispatch. Queue and daemon readiness waits retain this state. Cancellation and expiry remain effective. |
| Consumed | `status=consumed` | Host commits one CLI dispatch attempt. The action cannot regain approval, even if spawning fails. |
| Executing | No separate state | A dispatched CLI promise is outstanding. The action is consumed and has no settlement. Native execution start is not established by this state. |
| Settled | `status=consumed` with `settlement` | Host records the returned CLI result or execution error once. A success code does not prove a GUI business effect. |
| Cancelled before dispatch | `status=cancelled` with failure settlement | No dispatch. Existing cancellation reasons remain intact. |
| Expired before dispatch | `status=expired` | No dispatch. Expiry is terminal once observed. It does not become an execution settlement. |

Rejected actions also retain their existing terminal state and rejection reason.
Cancellation does not revoke a dispatched system effect.

## Change

The original code consumed approval before `await connect()`.
An approval expired during startup and still dispatched in the reproduction.
Host cancellation also missed the consumed record during that wait.

The repaired order is:

```text
validate caller, classification, immutable argv and approval
  -> wait for Host queue
  -> validate approval without consuming
  -> await daemon readiness
  -> reject shutdown or request abort
  -> prepare credential, environment and complete CLI arguments
  -> consume with fresh expiry, status, attribution and argv checks
  -> call execFile in the same synchronous JavaScript turn
  -> preserve the returned result and settle once
```

There is no `await`, timer, IPC request, or scheduled callback between consumption and the `execFile` call.
Expiry is checked at consumption. It is not a continuing permission after dispatch commitment.
The Host cannot process a later cancellation event between those synchronous statements.

A pre-dispatch failure cancels an approval that remains approved.
This includes startup failure, missing launcher credentials, request abort, and an aborted queue wait.
Cancelled, expired, rejected, and consumed records keep their existing state and reason.
A duplicate request cannot settle or restore another request's consumed action.

The mutation is in [runtime.ts](../../../apps/stage-tamagotchi/src/main/services/airi/computer-use/runtime.ts).
The [manager](../../../apps/stage-tamagotchi/src/main/services/airi/computer-use/action-manager.ts) changes comments only.
Its state values, record fields, matching checks, TTL, and consumption implementation remain unchanged.

## Deterministic reproduction

Tests changed before production code.
The complete regression-only patch failed against the repair base with **10 failed and 32 passed**.
After the repair, the same file passed **42 tests**.
The final file adds a post-dispatch nonzero-result check and passes **43 tests**.

The tests use `Promise.withResolvers` barriers and a controlled `Date` clock.
No sleep or timing-only race assertion was added.
A cached daemon still yields at its async `connect` boundary.
An explicit microtask places invalidation before that continuation.

| Scenario | Before | After |
| --- | --- | --- |
| TTL reaches its deadline during cold startup | One executor call | Zero executor calls, expired |
| Host cancels during cold startup | One executor call, cancel count zero | Zero executor calls, cancel count one |
| Renderer closes during cold startup | One executor call | Zero executor calls, cancelled |
| Request aborts during startup | Zero calls, already consumed | Zero calls, unconsumed action cancelled |
| TTL or Host cancellation during cached readiness yield | Dispatches | Only the earlier warmup read runs |
| Host shuts down during startup | Executor boundary called with an aborted Host signal | Zero boundary calls, daemon stopped |
| Queued request aborts before its operation starts | Zero mutation calls, approval remains reusable | Zero mutation calls, cancelled |
| Cancel A while B waits | A still dispatches | A rejects, B alone dispatches and settles |
| Same approved action queued twice | One dispatch | One dispatch, duplicate rejects |
| TTL, Host cancel, or request abort after dispatch | Preserves result | Preserves result and serial ownership |
| Startup failure | Consumed failure | Unconsumed action cancelled, still unavailable for replay |
| Spawn failure, timeout, or CLI nonzero exit | Consumed failure | Same one-use failure settlement |

The shutdown reproduction counts a Mock boundary call.
Node's real `execFile` can reject an already aborted signal before creating a child.
It does not establish that the old shutdown case performed a native operation.

The [tests](../../../apps/stage-tamagotchi/src/main/services/airi/computer-use/chat-runtime.test.ts) use production Chat, tool resolution, Eventa and Host logic.
Electron and process effects are controlled boundaries.
Approved `app.activate` exercises the existing mutation contract without enabling input.
No real application activates in these tests.

The zero-call assertions apply to the Host's actual `execFile` invocation boundary, using a controlled executor.
If Host does not invoke that boundary, this request cannot start an AUV CLI command through it.
These assertions are not a real Electron or native-input E2E result.

## Remaining admission limits

Host dispatch commitment is not a native execution acknowledgement.
CLI startup, transport, driver work, queue submission and application effect remain separate boundaries.
The repair does not promise cancellation until the last native instruction.
It preserves the existing result after Host dispatch and does not report a fictitious rollback.

Request cancellation after dispatch does not kill the per-request CLI through this path.
Host shutdown retains its existing global abort behavior.
Timeout or process termination can leave native effects uncertain. Failure settlement does not prove zero effects.

The TTL still uses the existing wall clock.
No monotonic clock contract or system-clock rollback policy was added.

The original Chat identity remains Renderer correlation plus the actual Electron source.
Trusted human confirmation and native target lifetime binding remain absent.
The separate read-only B2 audit also corrects the assumption that an endpoint guarantees daemon execution.

**B1 is ready for focused review. Real GUI writes remain NO-GO.**
No Driver, approval UI, Runtime, Token Broker, B0 Notice, C3, or cross-session continuation is part of this change.
