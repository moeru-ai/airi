# Runbook: Peer Churn (ALR-002, ALR-003)

## Trigger

PagerDuty/OpsGenie fires `airi-prod` PagerDuty service with dedup key `airi-ALR-002-*` (sustained 30+ peer disconnects in 10 minutes). Alternatively, GitHub Issue is created via `actions/github-script` for ALR-003 (any single `failed to send event to peer` log line).

## Impact Assessment

1. Pull the server log for the last hour:
   - `journalctl -u airi-server --since "1 hour ago" | grep -E "(closed|failed to send|heartbeat)"`
2. Summarize the disconnection codes:
   - `closeCode:1005` — silent network drop, often client-side
   - `closeCode:1006` — abnormal closure (the TCP RST case)
   - `closeCode:1001` — endpoint going away (server shutdown or reload)
3. Classify:
   - All peers disconnecting at the same time → server-side broadcast failure (ALR-003)
   - Random subset disconnecting continuously → network/heartbeat race (ALR-002)

## Mitigation

### Case A — Broadcast send failure (ALR-003)

1. Identify which target peer:
   - `failed to send event to peer, removing peer` log line includes `peer`, `toPeer`, and the `event.type`.
2. Read the corresponding `peer.module`, `peerModuleIndex`, `peerHealth` to confirm the peer was unhealthy before the failed send.
3. Action:
   - The runtime automatically removes the peer on failure (`peers.delete`, `unregisterModulePeer`). Check that recovery paths in `/health` show `peers.total` is stable after the event.
4. Client-side fix:
   - If the same module version is repeatedly hitting this, upgrade client to the latest `@proj-airi/server-sdk` version.

### Case B — Sustained peer churn (ALR-002)

1. Correlate with deployments: `git log --since="1 hour ago" --oneline` in `packages/server-sdk/` and `packages/server-runtime/`.
2. Check `heartbeatTtlMs` and `healthCheckIntervalMs` in logs:
   - If `healthCheckIntervalMs / heartbeatTtlMs` is below 4x, peers will be marked unhealthy too quickly under load.
   > Note: `healthCheckIntervalMs = heartbeatTtlMs / 4` (four checks per heartbeat TTL).
3. If the ratio is fine, look for:
   - GC pauses (`node --trace-gc` in staging)
   - Deployment orchestrator draining Kubernetes pods (gracefulCloseTimeout = 0.5s)
4. Rollout fix:
   - Increase `heartbeatTtlMs` to 2x the 99th percentile client latency.

## Recovery Confirmation

- `peers.unhealthy / peers.total < 0.20` for 10+ consecutive minutes.
- Zero `failed to send event to peer` log lines in trailing 5 minutes.
- Recovery event in PagerDuty auto-resolves the incident.

## Post-Incident

- Update `server-runtime` `heartbeatTtlMs` default if the threshold proved too aggressive.
- File an incident issue with labels `incident`, `runbook/peer-churn`.
- Consider a new alert rule if the pattern is novel.
