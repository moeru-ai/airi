# TTS Flux history aggregation

Status: accepted

## Decision

The existing `GET /api/v1/flux/history` endpoint returns `{ records, hasMore }`.
The response shape is inferred from the transaction service in `server/apps/api`.
The settings page keeps its existing local display type. No shared package is required.

Each record keeps the six public fields: `id`, `type`, `amount`,
`description`, `metadata`, and `createdAt`.

The server combines TTS debits with the same `turnId` for one user.
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

The speech pipeline reuses the existing chat `turnId` without a second identifier.
The existing speech intent preserves this ID across queues and renderer boundaries.
The chat runtime generates each turn ID with the configured ID factory (`nanoid` in stage-ui).
Billing does not require a local session ID or a cloud chat ID.

REST and WebSocket requests carry `turn_id`.
Valibot validates it at the request boundary.
The meter and billing service pass `turnId?: string` directly.
No correlation object or wrapper type is required.
Billing stores `turnId` in the existing metadata column.

## Boundaries and flow

Module dependencies:

```text
Stage -> speech intent / streaming session -> HTTP / WebSocket
HTTP / WebSocket -> turn ID validator -> meter -> billing -> ledger
Flux settings -> Flux history route -> transaction service -> ledger
```

Affected files:

```text
packages/stage-pages/src/pages/settings/flux.vue
packages/i18n/src/locales/{en,zh-Hans}/settings.yaml
packages/stage-ui/src/
  components/scenes/Stage.vue
  libs/speech/{tts-session,streaming-pipeline}.ts
  stores/modules/speech.ts
server/apps/api/src/
  app.ts
  routes/audio-speech-ws/session.ts
  routes/flux/index.ts
  services/domain/
    openai-speech/index.ts
    billing/{turn-id,flux-meter,billing-service}.ts
    flux-transaction.ts
```

Request sequence:

```text
Chat -> Speech: existing turnId
Speech -> API: turn_id on each TTS request
API -> Meter -> Billing: validated turnId
Billing -> Ledger: debit with metadata.turnId
Client -> History API: existing page request
History API -> Ledger: user filter, turn aggregation, pagination
History API -> Client: ordinary records and hasMore
```

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

PGlite tests cover aggregation before pagination and user isolation,
different rounds, malformed metadata, timestamp ties, and unchanged ledger entries.
A 51-charge round returns one record with its full amount.
A contract assertion limits records to the original six fields.

Meter tests keep the existing settlement checks and cover the cross-round example.
Speech tests cover REST, WebSocket, queued chats, and cross-renderer correlation.
Full typecheck and lint remain required.

Ablation checks removed one part at a time from the 14 history tests:

| Removed part | Result | Decision |
| --- | --- | --- |
| Window sum | 3 failures: round totals are incomplete | Keep |
| User filter | 7 failures, including user isolation | Keep |
| Stored ID validation | 3 failures: unrelated entries merge | Keep |

All 14 tests pass after restoration. Removing the correlation object preserves
all 135 affected backend tests, so only the scalar turn ID remains.
