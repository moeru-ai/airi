# TTS Flux history aggregation

Status: accepted

## Decision

The existing history endpoint combines TTS debit entries with the same `turnId`.
It returns the latest entry and the sum of the group before pagination.

The existing chat turn ID passes through REST or streaming TTS to billing metadata.
The ledger remains immutable. Other transaction types remain individual records.

## Boundaries

```text
TTS request -> metadata.turnId -> flux_transaction
Flux history -> group by turnId -> ordinary history record
```

This change does not change meter thresholds, debt ownership, or charge timing.
