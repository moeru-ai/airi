# Trusted Terminal approval

Phase 5.1 extends the existing Main PendingAction owner. It does not add a second authorization store or Agent Runtime.

## Boundary

Before provider startup, the normal Chat hook registers submitted text with Main.
Main verifies its designated Runtime main frame, issues a request ID and captures the original routing labels.
Session and Turn labels identify routing. They are not authenticated accounts.
When a turn ends without a Terminal action, Main releases its request record.
If registration fails, Chat can continue. Main still requires a registered request for Terminal.

An operator can enable `AIRI_TRUSTED_TERMINAL=1` for a Main-managed direct stdio MCP server.
Main gives that connection a private random credential. The server removes it from the child-process environment.
The credential admits the private protocol. It is not a user approval.
HTTP transports and proxy launcher PIDs cannot use this adapter.

The normal model tool call prepares an immutable Terminal snapshot without spawning a shell.
The snapshot contains the actual shell, complete argv, resolved cwd, cwd source, timeout and executor identity.
Main verifies the original request and model arguments, then creates its existing PendingAction.

A separate Main-created window displays that saved operation. Its decision path accepts only the actual window main frame and matching action.
The page supplies neither executable arguments nor approval state.
Public MCP approval tools cannot approve this operation.

After approval, Main enters the existing desktop queue. It checks expiry, cancellation, source, arguments and connection before consumption.
Consumption and one private RPC occur without an intervening await.
The server checks the saved snapshot and deadline again at its synchronous spawn boundary.
Refused, expired, cancelled or consumed records cannot grant a later operation.

## Results and limits

The original model Tool Result reports preparation only. It does not confirm execution or business success.
Main sends actual outcomes through a separate notice turn. A command exit of zero still needs a business Oracle.
An ambiguous failed reply cannot restore approval or cause an alias retry.
Without a lifecycle receipt, the Host blocks subsequent desktop writes until shutdown. Queue waiters can still settle.

The private executor reports its result after direct shell exit and bounded output drain.
On Windows, this does not establish descendant termination or containment of applications started by the shell.
The adapter is not a shell sandbox. It grants no native GUI input or workflow-wide approval.

Phase 5.1 tests cover controlled protocol execution and delegated normal-UI decisions with a mock provider.
Phase 5.2 adds deterministic lifecycle checks. Phase 5.3 adds bounded notice continuation. Phase 5.4 real-model acceptance remains separate.
Automated operator decisions do not prove real-human production authorization.

Existing MCP configuration and server-test management RPC remain a privileged surface.
This slice does not isolate an already compromised Renderer from those baseline management capabilities.

## Lifecycle checks

The private handler checks MCP cancellation at entry and at the final synchronous spawn boundary.
Readiness waits cannot turn an already cancelled control request into a new executor invocation.
The deadline is checked at that same boundary. No wait separates the final checks, record removal and spawn call.

Pending and approved actions remain cancellable until Main commits its private RPC.
After consumption, Chat cancellation does not abort that RPC or invent a rollback.
Known late results keep their real settlement. A lost result leaves a consumed, unsettled action and latches the shared mutation guard.
An approved action can expire or cancel while another operation still runs. The Host discards its uncommitted executor record.
The executor can report timeout facts with an unconfirmed lifecycle when inherited output pipes exceed the drain deadline.

Controlled tests cover request and transport cancellation, expiry after readiness, post-dispatch cancellation, timeout closure, replay and interleaved Sessions.
Counterfactual test transforms that remove the unknown hold or direct-close wait make the corresponding safety assertion fail.
These transforms run only in the test loader and never change product source.

## Notice continuation

Main binds each notice to the saved request, Session, Turn, Tool Call, Action and command snapshot.
It invokes only the original Runtime WebContents. It never broadcasts the outcome or falls back to the active conversation.
The temporary window context is disposed after delivery.

The Renderer uses the existing `notifyConversation` facade and stable message ID `terminal:<actionId>`.
Core stores the notice source, submits a new turn through the existing Session FIFO and deduplicates existing message IDs.
No old provider stream is resumed. The notice grants no permission to another command.

`stored` acknowledges the message receipt. It does not confirm generation completion or business success.
Explicit cancellation suppresses a replacement notice. A queued notice also follows the original request cancellation signal until storage.
After storage, it is a distinct turn with its own Chat cancellation. Delivery-context cleanup cannot cancel that new generation.
The default facade behavior still waits for completion. Only the Host adapter opts into the storage receipt.

Nonzero exit, timeout, rejection, expiry and unknown results retain their actual facts.
Unknown results do not reset consumed approval or cause an automatic command replay.
Unavailable owners and failed receipts remain delivery failures. There is no automatic reroute or durable retry scheduler.

Controlled tests and delegated UI experiments use a mock provider for this gate.
They do not establish real-model recovery or real-human production authorization.

## Integration execution contract

Terminal commits and native desktop mutations share the existing execution queue and its lingering-process admission check.
The check runs before the Terminal callback can consume approval.
Read-only desktop observation keeps its existing path.

A private refusal proves no execution only with matching prepared and request identities and a closed lifecycle.
Normal replies must also report `executorInvoked=false` and `noNewDispatch=true`.
Missing identity, conflicting fields, or an unknown lifecycle cannot establish zero execution.
Unconfirmed Terminal refusals retain the consumed approval and block further shared desktop mutations until Host shutdown.

A closed reply without an exit code reports an unknown execution result in Main and in the notice.
The notice keeps the closed lifecycle receipt.
A nonzero exit or timeout retains evidence of execution and possible effects.
Neither case restores approval or verifies the business outcome.
Missing serialized execution facts also remain unknown.
