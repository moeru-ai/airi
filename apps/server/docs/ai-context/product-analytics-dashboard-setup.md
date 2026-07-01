# Product Analytics Dashboard Setup

This document turns `product-analytics-instrumentation.md` into dashboard setup steps. It intentionally excludes Discord / QQ ingestion and daily / weekly report automation.

After setting up the dashboards, run `verifications/product-analytics-smoke.md` against the deployed environment.

## Scope

In scope:

- PostHog insights for frontend product journeys.
- Grafana panels for server-side product event health.
- Alert rules that can be configured directly in PostHog / Grafana.

Out of scope for this pass:

- Discord / QQ bot or spreadsheet synchronization.
- Daily / weekly report generation scripts.

## Destination Rules

| Question | Destination | Reason |
|---|---|---|
| Can a user start chatting? | PostHog | Frontend journey and distinct user funnels |
| Where does provider setup fail? | PostHog | Provider config events are frontend PostHog events |
| Which voice is selected or previewed? | PostHog / Postgres metadata | `voice_id` is high-cardinality and must not be a Prometheus label |
| Is server TTS healthy right now? | Grafana | Server product events and OTel metrics are Prometheus-safe |
| Are users submitting feedback? | PostHog | App feedback is frontend product analytics |

## PostHog Dashboard

Create a dashboard named `AIRI Activation And Feedback`.

Live dashboard created on 2026-06-30:

- Project: `Project AIRI (Web)` (`90721`)
- URL: `https://us.posthog.com/project/90721/dashboard/1779029`
- Current cards:
  - Text card: `AIRI product analytics runbook`
  - Funnel: `Chat activation funnel`
  - Trend: `Official provider usage`
  - Funnel: `Official TTS activation`
  - Trend: `Paywall exposure`
  - Trend: `Provider config failures`
  - Trend: `TTS voice selection and preview`
  - Trend: `Top selected TTS voices`
  - Trend: `Voice input friction`
  - Trend: `Feedback and bug reports`

### Insight 1: Chat Activation Funnel

Type: Funnel

Steps:

1. `chat_activation_started`
2. `chat_activation_succeeded`
3. `second_turn_started`

Breakdowns:

- `provider_mode`
- `surface`

Filters:

- Date range: last 7 days
- Exclude internal users if the project has an internal user cohort.

Watch for:

- Official provider conversion lower than custom provider conversion.
- Large drop after `chat_activation_started`.
- First-turn success but weak `second_turn_started` conversion.

### Insight 1b: Official Provider Selection

Type: Trends

Events:

- `official_provider_selected`

Breakdowns:

- `provider_id`
- `source`
- `auto_selected`

Watch for:

- Official provider auto-selection is present but users do not reach `second_turn_started`.
- A single provider id dominates errors or activation drop-off.

### Insight 2: Chat Activation Failures

Type: Trends

Events:

- `chat_activation_failed`

Breakdowns:

- `failure_stage`
- `error_code`
- `provider_mode`

Display:

- Stacked bar or line chart.

Watch for:

- `failure_stage = provider_config`
- `failure_stage = model_list`
- `failure_stage = llm_response`

### Insight 3: Provider Configuration Health

Type: Funnel

Steps:

1. `provider_config_started`
2. `provider_config_succeeded`

Breakdowns:

- `provider_mode`
- `step`

Companion trend:

- Event: `provider_config_failed`
- Breakdown: `error_code`

Watch for:

- Official provider failures greater than zero for more than 15 minutes.
- `step = manual_chat_ping` failures after auto validation succeeds.

### Insight 4: Model List Health

Type: Trends

Events:

- `model_list_loaded`
- `model_list_failed`

Breakdowns:

- `provider_id`
- `provider_mode`

Watch for:

- `model_list_failed` spikes for one provider.
- High failure rate after a release.

### Insight 5: TTS Voice Selection

Type: Trends

Events:

- `voice_selected`
- `voice_preview_played`
- `voice_pack_bound`
- `official_tts_exposed`
- `official_tts_preview_started`
- `official_tts_preview_succeeded`
- `official_tts_auto_enabled`

Breakdowns:

- `voice_type`
- `tts_provider_id`
- `source`

Do not use:

- Prometheus labels for `voice_id` or `voice_pack_id`.

Use PostHog or SQL when grouping by:

- `voice_id`
- `voice_pack_id`

Watch for:

- Users see official TTS but do not preview it.
- Official TTS preview succeeds but chat auto TTS is not triggered later.

### Insight 6: Voice Input Friction

Type: Funnel

Steps:

1. `voice_input_started`
2. `stt_succeeded`

Companion trends:

- `microphone_permission_denied`
- `audio_device_unavailable`
- `voice_input_cancelled`
- `stt_failed`

Breakdowns:

- `stt_provider_id`
- `error_code`
- `surface`

### Insight 7: Feedback And Bug Reports

Type: Trends

Events:

- `feedback_submitted`
- `bug_report_submitted`

Breakdowns:

- `category`
- `severity`
- `entrypoint`
- `surface`

Watch for:

- `severity = blocker` spikes.
- `entrypoint = about_update_error` after desktop releases.

## Grafana Dashboard

Source of truth:

- `apps/server/otel/grafana/dashboards/build.ts`
- Generated JSON: `apps/server/otel/grafana/dashboards/airi-server-overview-cloud.json`

The `Product Analytics` row includes:

- `Product Events (range)`
- `Product Failure %`
- `TTS Success %`
- `TTS Failed / Blocked (range)`
- `TTS Blocked by Reason`
- `TTS Blocked by Flux Bucket`
- `Top Product Actions (range)`
- `Product Event Rate`
- `TTS Event Rate by Source`

Live import status:

- Imported on 2026-06-30.
- Live URL: `https://projairi.grafana.net/d/ad8qbp5/airi-server-overview`
- Dashboard: `AIRI Server Overview - Product Analytics` (`ad8qbp5`)
- The live dashboard now shows the full `Product Analytics` row:
  - `Product Events (range)`
  - `Product Failure %`
  - `TTS Success %`
  - `TTS Failed / Blocked (range)`
  - `TTS Blocked by Reason`
  - `TTS Blocked by Flux Bucket`
  - `Top Product Actions (range)`
  - `Product Event Rate`
  - `TTS Event Rate by Source`
- The generated JSON remains the source of truth for the Product Analytics / TTS panel set.

Permission notes from the import retry:

- The first import attempt with title `AIRI Server Overview` and UID `rbr55dn` showed duplicate title / UID warnings because it targets the existing dashboard.
- A second import attempt with a new title / UID (`AIRI Server Overview - Product Analytics Test`, `airi-product-analytics-test`) removed the duplicate warnings, but still did not import.
- API confirmation returned `403 Access denied`: `You'll need additional permissions to perform this action. Permissions needed: any of dashboards:create, dashboards:write`.
- The logged-in Grafana user `1260907335@qq.com` has org role `Viewer`; API metadata for `/d/rbr55dn/airi-server-overview` reports `canSave=false`, `canEdit=false`, `canAdmin=false`.
- After permissions were updated, the generated dashboard was imported from Microsoft Edge. Grafana assigned the imported dashboard UID `ad8qbp5` instead of overwriting the earlier `rbr55dn` dashboard, so the imported dashboard was renamed to `AIRI Server Overview - Product Analytics` to avoid ambiguity.
- On 2026-07-01, the live `ad8qbp5` dashboard was updated to include `TTS Blocked by Reason` and `TTS Blocked by Flux Bucket`. The live dashboard uses panel id `105` for the Flux bucket panel because id `103` was already occupied by the imported `User Engagement` row.

Regenerate after dashboard changes:

```bash
node node_modules/tsx/dist/cli.mjs apps/server/otel/grafana/dashboards/build.ts
```

## Alert Setup

### PostHog Alerts

Configure these as insight subscriptions or monitor-style alerts.

| Alert | Insight | Trigger |
|---|---|---|
| Activation drop | Chat Activation Funnel | `chat_activation_succeeded / chat_activation_started` drops by 15% vs previous 24h |
| Provider config regression | Provider Configuration Health | Official provider `provider_config_failed` is greater than 0 for 15 minutes |
| Voice input spike | Voice Input Friction | `stt_failed / voice_input_started` exceeds 20% over 1h |
| Feedback spike | Feedback And Bug Reports | `bug_report_submitted` doubles vs previous 24h |

### Grafana Alerts

Use these PromQL expressions from the server dashboard context.

TTS success below 95% over 15 minutes:

```promql
100 * sum(increase(airi_product_events_total{feature="tts", action="speech_succeeded", status="succeeded"}[15m]))
/
clamp_min(sum(increase(airi_product_events_total{feature="tts", action="speech_requested", status="started"}[15m])), 1)
< 95
```

TTS blocked spike over 15 minutes:

```promql
sum(increase(airi_product_events_total{feature="tts", action="speech_blocked", status="blocked"}[15m])) > 10
```

TTS failed spike over 15 minutes:

```promql
sum(increase(airi_product_events_total{feature="tts", action="speech_failed", status="failed"}[15m])) > 5
```

Product failure ratio above 10% over 15 minutes:

```promql
100 * sum(increase(airi_product_events_total{feature!="", action!="", status="failed"}[15m]))
/
clamp_min(sum(increase(airi_product_events_total{feature!="", action!=""}[15m])), 1)
> 10
```

## Verification Checklist

- PostHog can show `chat_activation_started -> chat_activation_succeeded -> second_turn_started` by `provider_mode`.
- PostHog can show `official_provider_selected` by `provider_id`, `source`, and `auto_selected`.
- PostHog can show `voice_selected` by `voice_type` and `tts_provider_id`.
- PostHog can show official TTS exposure / preview / auto-enabled events.
- PostHog can show `paywall_seen` by `flux_balance_bucket`.
- PostHog can show `feedback_submitted` and `bug_report_submitted`.
- Grafana dashboard JSON contains `TTS Success %`, `TTS Failed / Blocked (range)`, `TTS Blocked by Reason`, `TTS Blocked by Flux Bucket`, and `TTS Event Rate by Source`.
- Grafana product analytics panels use only bounded labels: `feature`, `action`, `status`, `source`, `reason`, `flux_balance_bucket`.
