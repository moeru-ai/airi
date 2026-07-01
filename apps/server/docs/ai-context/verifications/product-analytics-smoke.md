# Verification: Product Analytics Smoke Test

Status: **code-level instrumentation verified; live PostHog dashboard updated; Grafana dashboard updated; alert setup pending**
Owner: Community / Product Analytics
Last updated: 2026-07-01
Related:
- [`product-analytics-instrumentation.md`](../product-analytics-instrumentation.md)
- [`product-analytics-dashboard-setup.md`](../product-analytics-dashboard-setup.md)
- [`airi-server-overview-cloud.json`](../../../otel/grafana/dashboards/airi-server-overview-cloud.json)

## 用户路径

- **场景**：验证新增埋点能回答“用户是否能正常开始聊天”“Provider 配置卡在哪里”“哪个 TTS 音色被选择 / 实际播放”“语音输入卡在哪里”“用户是否提交反馈”。
- **预期**：PostHog 能看到前端 journey events；Postgres `product_events` 能看到服务端 TTS metadata；Grafana 能看到低基数 server-side product health。
- **当前状态**：代码与 dashboard JSON 已验证；线上 PostHog dashboard 已补官方 Provider / 官方 TTS / paywall 卡片；线上 Grafana `AIRI Server Overview - Product Analytics` (`ad8qbp5`) 已补 TTS blocked reason / Flux bucket 面板；alert 仍需人工配置。

## 已经由代码验证

| Area | Evidence |
|---|---|
| Frontend analytics API | `packages/stage-ui/src/composables/use-analytics.test.ts` 覆盖 activation、model list、provider config、voice selection、voice input、feedback event API |
| Chat activation hooks | `packages/core-agent/src/runtime/chat-orchestrator-runtime.test.ts` 覆盖 activation started / succeeded / failed hook |
| Voice input failures | `packages/stage-ui/src/composables/audio/audio-device.test.ts` 与 `packages/stage-ui/src/stores/modules/hearing.analytics.test.ts` 覆盖 permission / device / cancel / STT failed |
| Server TTS metadata | `apps/server/src/routes/openai/v1/route.test.ts` 与 `apps/server/src/routes/audio-speech-ws/route.test.ts` 覆盖 REST / WS TTS `voice_id`、`voice_type`、`voice_pack_id` metadata |
| Grafana product row | `apps/server/otel/grafana/dashboards/build.test.ts` 覆盖 Product Analytics panels、layout references、PromQL 不包含 high-cardinality voice / user fields |

## Live Smoke Checklist

Run this after deploying a build with the instrumentation changes. The PostHog dashboard and Grafana dashboard shell are already created, but they still need live event traffic from the deployed build.

### 1. PostHog: chat activation

Action:

1. Use a fresh or test account.
2. Start with an official provider.
3. Send the first chat message and wait for the assistant response.
4. Send a second message in the same session.

Expected PostHog events:

```text
chat_activation_started
chat_activation_succeeded
second_turn_started
```

Required properties:

```text
provider_mode = official
provider_id = <official provider id>
model_id = <selected model id>
surface = web | mobile | electron
turn_index = 2
```

Fail if:

- `chat_activation_started` appears but `chat_activation_succeeded` never appears for a successful chat.
- The second message is sent but `second_turn_started` does not appear.
- `provider_mode` is missing or always `unknown`.
- `surface` is missing.

### 1b. PostHog: official provider selection

Action:

1. Sign in with an account that has no active chat provider yet, or switch the chat provider to the official provider in settings.

Expected PostHog events:

```text
official_provider_selected
```

Required properties:

```text
provider_mode = official
provider_id = <official provider id>
source = default_auto | settings
auto_selected = true | false
```

Fail if:

- Default official provider bootstrap reports `auto_selected = false`.
- Manual settings selection reports `auto_selected = true`.

### 2. PostHog: provider config failure

Action:

1. Configure a custom provider with an invalid key or invalid endpoint.
2. Trigger settings validation or manual chat ping.

Expected PostHog events:

```text
provider_config_started
provider_config_failed
```

Required properties:

```text
provider_mode = custom
provider_id = <provider id>
step = settings_auto_validate | manual_chat_ping
error_code = <bounded error code>
```

Fail if:

- Raw error text, API key fragments, endpoint secrets, or stack traces appear in event properties.
- `provider_config_failed` has no `error_code`.

### 3. PostHog: TTS voice selection

Action:

1. Open speech settings.
2. Select an official TTS provider.
3. Select or keep an official voice.
4. Play voice preview once.

Expected PostHog events:

```text
tts_provider_selected
official_tts_exposed
official_tts_preview_started
official_tts_preview_succeeded
voice_selected
voice_preview_played
```

Required properties:

```text
tts_provider_id = <provider id>
tts_model_id = <model id>
voice_id = <catalog voice id or custom>
voice_type = official_default | official_selected | custom_configured | voice_pack | unknown
source = settings | manual_preview
```

Fail if:

- `voice_selected` is missing, because this blocks “哪个 TTS 音色比较多”的核心问题。
- Official TTS preview succeeds in the UI but `official_tts_preview_succeeded` is missing.
- Official default voice is indistinguishable from custom configured voice.

### 3b. PostHog: official TTS auto playback

Action:

1. Enable chat auto TTS with an official TTS provider.
2. Send a chat message and wait for an assistant response that triggers speech playback.

Expected PostHog events:

```text
official_tts_auto_enabled
```

Required properties:

```text
tts_provider_id = <official provider id>
tts_model_id = <model id>
source = chat_auto_tts
enabled = true
```

Fail if:

- Chat auto TTS plays through the official provider but `official_tts_auto_enabled` is missing.

### 4. PostHog: voice input friction

Action:

1. Start voice input.
2. Test one failure path: deny microphone permission, use a browser/device with no microphone, or cancel input.

Expected PostHog events:

```text
voice_input_started
microphone_permission_requested
microphone_permission_denied
audio_device_unavailable
voice_input_cancelled
stt_failed
```

Only the events that match the exercised path need to appear.

Fail if:

- Permission denied or device unavailable is only visible as a generic `stt_failed`.
- `error_code` contains raw browser error text.

### 4b. PostHog: paywall exposure

Action:

1. Open the Flux / plan purchase entry.
2. Use an account with a known low or zero Flux balance if possible.

Expected PostHog events:

```text
paywall_seen
```

Required properties:

```text
surface = settings_flux
reason = manual_topup
flux_balance_bucket = zero | 1_100 | 101_1000 | 1001_10000 | 10000_plus | unknown
```

Fail if:

- The purchase entry is visible but `paywall_seen` is missing.
- A precise balance is sent instead of the bounded `flux_balance_bucket`.

### 5. Postgres: server-side TTS metadata

Action:

1. Trigger one REST TTS request.
2. Trigger one chat/WS TTS request if the deployed environment supports it.

Query:

```sql
SELECT
  created_at,
  user_id,
  source,
  provider,
  model,
  action,
  status,
  metadata->>'voice_id'      AS voice_id,
  metadata->>'voice_type'    AS voice_type,
  metadata->>'voice_pack_id' AS voice_pack_id
FROM product_events
WHERE feature = 'tts'
  AND created_at >= now() - interval '1 hour'
ORDER BY created_at DESC
LIMIT 50;
```

Expected:

- `speech_requested` and `speech_succeeded` rows exist for successful TTS.
- `voice_id` is present when the request provided a selected voice.
- `voice_type` distinguishes official default / selected / custom / voice pack where available.
- Blocked rows include bounded `block_reason` and `flux_balance_bucket`.
- Failed rows include bounded `failure_reason`.

Fail if:

- TTS succeeds but no `product_events` row is written.
- Metadata contains raw prompts, message text, API keys, or request bodies.

### 7. Grafana: Product Analytics row

Action:

1. Open `https://projairi.grafana.net/d/ad8qbp5/airi-server-overview`.
2. Open the `Product Analytics` row.
3. Use a 1h time range after running the smoke actions above.

Expected panels:

```text
Product Events (range)
Product Failure %
TTS Success %
TTS Failed / Blocked (range)
TTS Blocked by Reason
TTS Blocked by Flux Bucket
Top Product Actions (range)
Product Event Rate
TTS Event Rate by Source
```

PromQL sanity:

```promql
sum(increase(airi_product_events_total{feature="tts"}[1h]))
```

Expected:

- Query returns a non-zero value after TTS smoke actions.
- Legends only use bounded labels: `feature`, `action`, `status`, `source`, `reason`, `flux_balance_bucket`.

Fail if:

- Prometheus labels contain `voice_id`, `voice_pack_id`, `user_id`, `session_id`, or `request_id`.
- Grafana shows product panels but Postgres has no matching TTS rows.

## Quick Analysis Queries

Top selected voices should come from PostHog `voice_selected` for frontend intent. Server-side playback can be cross-checked from Postgres:

```sql
SELECT
  metadata->>'voice_id' AS voice_id,
  metadata->>'voice_type' AS voice_type,
  provider,
  model,
  COUNT(*) AS play_count,
  COUNT(DISTINCT user_id) AS distinct_users
FROM product_events
WHERE feature = 'tts'
  AND action = 'speech_succeeded'
  AND created_at >= now() - interval '7 days'
GROUP BY 1, 2, 3, 4
ORDER BY play_count DESC
LIMIT 20;
```

Server-side TTS blocked / failed ranking:

```sql
SELECT
  action,
  status,
  source,
  reason,
  COUNT(*) AS event_count,
  COUNT(DISTINCT user_id) AS distinct_users
FROM product_events
WHERE feature = 'tts'
  AND action IN ('speech_failed', 'speech_blocked')
  AND created_at >= now() - interval '24 hours'
GROUP BY 1, 2, 3, 4
ORDER BY event_count DESC;
```

## Exit Criteria

| Item | Pass condition |
|---|---|
| Activation | PostHog funnel shows `chat_activation_started -> chat_activation_succeeded` by `provider_mode` |
| Retention proxy | PostHog shows `second_turn_started` for the second message in a successful session |
| Official provider | PostHog shows `official_provider_selected` by `provider_id` and `source` |
| Provider config | Failed custom config emits `provider_config_failed` with bounded `error_code` |
| TTS voice | PostHog can rank `voice_selected` by `voice_id`; official TTS exposure / preview / auto playback events appear; Postgres can rank actual `speech_succeeded` by metadata voice |
| Voice input | Permission / device / cancel paths are distinguishable |
| Feedback | Feedback event API exists with bounded fields; product feedback UI/server submission is split into a separate PR |
| Grafana | Product Analytics row renders TTS reason / Flux bucket panels and uses only bounded Prometheus labels |

## Known Pending Work

- PostHog dashboard cards are created, but the official provider / official TTS / paywall cards need deployed traffic before they show meaningful data.
- Updated Grafana panels are deployed to the production Grafana workspace, but alert rules still need to be configured.
- Discord / QQ ingestion and daily / weekly automation scripts are intentionally excluded from this pass.
