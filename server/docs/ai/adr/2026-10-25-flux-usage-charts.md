# Flux usage charts

## Decision

`GET /api/v1/flux/usage/daily` returns `{ days, longestSessionMs }` for the last 365 local days of the signed-in user.
`timeZone` is an IANA name. A missing or invalid name returns 400 `INVALID_TIME_ZONE`.
Each day has `date` (`YYYY-MM-DD`), `llmMicroFlux`, `ttsMicroFlux`, and `newSessionCount`. A day without usage is zero.
A session counts once, on the local day of its first `llm_request_log` row. `longestSessionMs` uses sessions that started in this window.

## Known limits

Speech writes no `llm_request_log` row and stores no `sessionId`. Speech fees add to the Flux charts and never to the session chart.
`llm_request_log` writes are best-effort. A failed write lowers the session count.
`flux_usage` is a confirmed fee, not a wallet debit. Daily Flux can differ from the wallet history while fees wait in the pool.

`created_at` is `timestamp` without time zone. Drizzle reads and writes it as UTC.
The query reads that value as UTC, then converts it to the caller time zone.
The database default `now()` must run in UTC, or the local day is wrong.
That UTC reading goes away when the ledger tables use `timestamptz`.
