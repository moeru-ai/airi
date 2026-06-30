# Alert Rules

Reference table of alert rules for the AIRI server runtime. Each rule has a numeric ID, severity, signal source, threshold, runbook, and escalation path.

The CI job `.github/workflows/alerting.yml` evaluates health metrics coming out of the `server-runtime` `/health` endpoint and fails (with the ALR ID in the output) when thresholds are tripped.

## Severity Levels

| Level | Meaning                                                                 |
|-------|-------------------------------------------------------------------------|
| P0    | Total service outage, revenue-impacting. Page the secondary on-call now.|
| P1    | Major feature unusable, security incident, or data-loss risk. PagerDuty.|
| P2    | Degradation but service still functional. Slack channel notification.   |
| P3    | Minor or cosmetic issue. Track as issue.                               |

---

## Rules

### ALR-001 — peer-unhealthy-rate

**Severity:** P2

**Signal source:** `server-runtime /health` endpoint, `peers.unhealthy` / `peers.total`.

**Threshold:** `unhealthy / total > 0.20` for at least 5 consecutive minutes.

**Runbook:** [docs/ops/runbooks/peer-churn.md](./runbooks/peer-churn.md)

**Owner:** `@moeru-ai/airi-infra`

**Escalation:**

1. Alert fires to `#airi-alerts` Slack channel.
2. After 30 minutes of sustained unhealthy state with no acknowledgment, page `@airi-oncall`.

---

### ALR-002 — peer-churn-rate

**Severity:** P2

**Signal source:** Server logs `closed` event rate, aggregated over 10 minute windows.

**Threshold:** More than 3 peer disconnections per minute sustained for 10 minutes.

**Runbook:** [docs/ops/runbooks/peer-churn.md](./runbooks/peer-churn.md)

**Owner:** `@moeru-ai/airi-infra`

**Escalation:** Slack `#airi-alerts` → PagerDuty after 20 minutes unacknowledged.

---

### ALR-003 — broadcast-send-failures

**Severity:** P3

**Signal source:** Server log lines containing `failed to send event to peer`.

**Threshold:** Any occurrence raises a P3 issue (not a page).

**Runbook:** [docs/ops/runbooks/peer-churn.md](./runbooks/peer-churn.md)

**Owner:** `@moeru-ai/airi-infra`

**Escalation:** GitHub Issue is automatically opened via `actions/github-script`. No human page.

---

### ALR-004 — server-startup-failure

**Severity:** P1

**Signal source:** `server-runtime` process exit code non-zero, or the `failed to start WebSocket server` log line.

**Threshold:** Any crash within 60 seconds of process start shall be treated as a fast-fail startup regression.

**Runbook:** [docs/ops/runbooks/server-down.md](./runbooks/server-down.md)

**Owner:** `@moeru-ai/airi-infra`

**Escalation:** PagerDuty page to `@airi-oncall`.

---

## Mapping to PagerDuty / OpsGenie

To wire these rules into a real alerting backend:

1. Create one PagerDuty service per AIRI deployment tier (`airi-staging`, `airi-prod`).
2. Map each rule ID to an integration event via the PagerDuty Events API v2:
   - `dedup_key`: `airi-<rule-id>-<instance-id>-<utc-day>`
   - `event_action`: `trigger` on threshold breach, `resolve` on recovery
3. Define an OpsGenie team for `airi-infra` and map PagerDuty alerts → OpsGenie via the native integration.
4. The CI job below gives the cheapest path: the alert rules can evolve to be evaluated by a Prometheus or Datadog agent replacing the CI job when the deployment grows.
