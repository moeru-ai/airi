# Tool selection for Terminal continuation

Status: Accepted for the unified Agent slice.

## Context

A Terminal outcome starts a new Chat turn in its original Session.
The stored source message already records that turn's selected tool references.
Normal Chat excludes restricted tools from history unless the new request selects them.
The previous Notice path supplied no references. It lost AUV observation after Terminal execution.
MCP remained available, including a separate Desktop dry-run backend.

## Decision

The Desktop Notice handler supplies the trusted original turn ID and the current UI tool selection.
Chat finds that exact user message within the target Session's loaded history.
The new turn receives the intersection of the source references and the current selection.
Missing history, a missing source, or an empty selection grants no restricted tools.
The lookup is synchronous. The existing send path immediately owns cancellation.

A Notice stores its selected references through the existing message contract.
A later Notice can continue from that message. Its tool set can only retain or shrink the previous set.
Another active Session cannot provide the source or gain the outcome.
The UI selection is captured at Notice admission, as with a normal Chat request.

Tool visibility does not carry an approval ID, consume an old approval, or authorize an executor.
Every Terminal operation still needs its own Main-owned approval.
Native GUI input remains disabled. Main attribution, cancellation, settlement and the shared queue remain unchanged.

## Evidence

The real-model baseline lost both AUV tools between the original request and the first outcome turn.
A browser regression uses real stores, the tool resolver, Core and SDK serialization with a controlled provider.
It records the actual provider request and asserts zero executor calls.
The cases cover a subset, a revoked selection, an unselected source, a missing source, and a shrinking Notice chain.
The target Session retains its messages while another Session stays selected.

## Limits

This contract does not make Renderer data a trusted authorization source.
Main remains responsible for authorization and real sender identity.
Approval binds argv and spawn cwd. Referenced scripts and dependencies remain mutable.
Summaries cannot create tool selection, approval or execution facts.
Durable source messages and Main records remain outside future context compression.
