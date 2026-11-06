# Trusted Terminal approval

Phase 5.1 extends the existing Main PendingAction owner. It does not add a second authorization store or Agent Runtime.

## Boundary

Before provider startup, the normal Chat hook registers submitted text with Main.
Main verifies its designated Runtime main frame, issues a request ID and captures the original routing labels.
Session and Turn labels identify routing. They are not authenticated accounts.

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
Main keeps actual executor output separately. A command exit of zero still needs a business Oracle.
An ambiguous failed reply cannot restore approval or cause an alias retry.
Without a lifecycle receipt, the active queue slot stays held until Host shutdown.

The private executor waits for direct shell closure, including after its result timeout.
On Windows, this does not establish descendant termination or containment of applications started by the shell.
The adapter is not a shell sandbox. It grants no native GUI input or workflow-wide approval.

Phase 5.1 tests cover controlled protocol execution and delegated normal-UI decisions with a mock provider.
Phase 5.2 lifecycle admission, Phase 5.3 notification and Phase 5.4 real-model acceptance remain separate gates.
Automated operator decisions do not prove real-human production authorization.

Existing MCP configuration and server-test management RPC remain a privileged surface.
This slice does not isolate an already compromised Renderer from those baseline management capabilities.
