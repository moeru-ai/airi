# TTS Flux history aggregation

Status: accepted

## Decision

The existing `GET /api/v1/flux/history` endpoint returns `{ records, hasMore }`.
Each record keeps the six public fields: `id`, `type`, `amount`,
`description`, `metadata`, and `createdAt`.

The server combines TTS debits with the same conversation and round for one user.
It reads the existing `flux_transaction` table in one SQL statement.
A window sum calculates the full amount. A row number selects the latest entry.
The query applies pagination after aggregation. Equal timestamps use the entry ID
as a deterministic tie-breaker.

Other entry fields come from the latest debit.
Missing, blank, non-string, or oversized correlation values leave entries separate.
Non-TTS entries and credits remain separate.
The query does not change stored ledger entries.

There is no new endpoint, projection table, trigger, migration, or Redis owner key.
The client displays ordinary records without group counts or expandable children.

## Correlation

The speech pipeline reuses the existing chat `turnId` as `roundId`.
It snapshots the conversation at intent creation, including queued chats and
cross-renderer speech. Later session switches cannot change that snapshot.

REST and WebSocket requests carry the pair.
Valibot validates it at the request boundary.
Billing stores the pair in the existing metadata column.

## Settlement semantics

The meter keeps its existing user-level residual counter, threshold, TTL,
and rollback behavior. Only the correlation metadata passes through it.

History groups debits by the request that triggers settlement.
It does not allocate fractional usage back to earlier rounds.

For example, round A contributes 700 units and round B contributes 400 units.
With a 1000-unit threshold, the meter debits 1 Flux during B and keeps 100 units.
That debit appears under B. This is a history of posted charges, not exact
per-round usage accounting.

## Deferred work

- Measure the query with realistic history sizes before adding indexes or read models.
- Define fractional usage attribution separately if exact per-round cost is required.
- Assess cursor pagination if new charges cause skipped or repeated offset pages.
- Fix settlement and rollback concurrency separately from history presentation.

None of these changes is part of this PR.

## Verification

PGlite tests cover aggregation before pagination, conversation and user isolation,
different rounds, malformed metadata, timestamp ties, and unchanged ledger entries.
A 51-charge round returns one record with its full amount.
A contract assertion limits records to the original six fields.

Meter tests keep the existing settlement checks and cover the cross-round example.
Speech tests cover REST, WebSocket, queued chats, and cross-renderer correlation.
Full typecheck and lint remain required.
