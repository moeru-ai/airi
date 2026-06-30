# Runbook: Server Down (ALR-001, ALR-004)

## Trigger

PagerDuty/OpsGenie fires `airi-prod` PagerDuty service with dedup key matching `airi-ALR-001-*` or `airi-ALR-004-*`.

## Impact Assessment

1. Confirm scope:
   - Is this staging or prod? Check the `tags.instance` field on the PagerDuty event.
   - Run `curl http://<instance>:6121/health | head -c 200`. Observe `status`, `peers.*`, `instanceId`.
2. Triage:
   - Healthy server returns 200 with `status: "healthy"`.
   - Process crash returns ECONNREFUSED.
   - Dead socket with unhealthy peers returns 200 with `status: "degraded"` and `peers.unhealthy > 0`.

## Mitigation

### Case A — Process crash / startup failure (ALR-004)

1. Pull deployment logs:
   - `journalctl -u airi-server --since "1 hour ago"` on the host
   - GitHub Actions run for the release tag
2. Check recent changes:
   - `git log --since="6 hours ago" --oneline packages/server-runtime/`
3. Common causes:
   - Port-in-use: another stale `airi-server` instance holds the port. `ss -tlnp | grep 6121`.
   - TLS cert expired or passphrase invalid (`tlsConfig.passphrase` is required for PEM).
   - Dependency resolution failure at startup after a package upgrade.
4. Rollback:
   - If the crash correlates to a recent deployment, revert the `server-runtime` commit, re-run the CI pipeline.

### Case B — Unhealthy peers (ALR-001)

1. Verify with `/health` that `peers.unhealthy / peers.total > 0.20`.
2. Identify affected peers from the structured log:
   - `peer activity recovered, marking healthy` — peer was unhealthy briefly and recovered
   - `heartbeat late, marking unhealthy` — sustained missed heartbeats
3. Common causes:
   - Client library change that sends ping frames less frequently than `heartbeatTtlMs`
   - Network partition between client and the websocket server
   - GC pauses in the server process (look for high RSS, look for `heartbeatTtlMs` drift)
4. Scale out:
   - Scale the `server-runtime` deployment horizontally to absorb unhealthy peers while investigation continues.

## Recovery Confirmation

- `/health` returns `status: "healthy"` for 10+ consecutive minutes.
- All PagerDuty auto-resolution events fire with `dedup_key: airi-ALR-001-<instance>-<day>`.
- Observe zero new `heartbeat late` log lines.

## Post-Incident

- Open an incident issue with labels `incident`, `runbook/server-down`.
- File the log excerpt and timeline.
- Update the alert rule threshold if the noise/false-positive ratio is unsatisfactory.
