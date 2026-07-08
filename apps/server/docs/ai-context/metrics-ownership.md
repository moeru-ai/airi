# Metrics Ownership

这份文档定义 AIRI 团队的指标分层规则：什么指标该走 Grafana / Prometheus（OTel server-side），什么该走 PostHog（frontend/external product analytics），同名指标怎么处理。落地这份是为了避免后期"同一个 KPI 三处不同数"的漂移。

## 总原则

工具职责正交，**互补不互替**：

| 层 | 工具 | 关键属性 |
|---|---|---|
| **System / API observability** | Grafana Cloud + Prometheus + OTel | 系统健康、延迟、错误率、SRE on-call 告警 |
| **Product analytics** | PostHog Cloud | 前端用户行为、漏斗、retention、cohort、A/B、feature adoption |
| **Financial truth source** | Postgres (`flux_transaction` / Stripe webhook 持久化) | 收入与扣费 ledger，任何展示都视作近似 |
| **LLM-native observability** | Langfuse Cloud（已接入：chat completion + TTS speech） | 逐条 prompt/completion trace、TTS text trace、token/字符用量、按 user/session 成本归因、eval。真实 staging HTTP E2E 与 model 定价匹配待做 |

**业界没有权威的判定 framework**（参见下方"参考来源"），这份文档落实成项目内的可执行规则。

## 7 题判定 Checklist

每条新增指标依次问这 7 个问题：

| # | 问题 | 偏 Grafana | 偏 PostHog |
|---|------|-----------|------------|
| 1 | 超阈值需要**分钟级 on-call 告警**？ | ✓ | |
| 2 | 主要读者是 **SRE / 后端工程师**，不是 PM？ | ✓ | |
| 3 | 需要跟 **trace / log join**（分布式 debug）？ | ✓ | |
| 4 | 含义依赖**用户身份 / session**（"哪个用户做了什么"）？ | | ✓ |
| 5 | 消费场景是**漏斗 / retention cohort / A/B test**？ | | ✓ |
| 6 | 会被 **CEO / PM 在周会 OKR review** 看？ | | ✓ |
| 7 | 采集点在**前端页面**（pricing page、onboarding）？ | （拿不到） | ✓ |

**裁决规则**：

- ≥4 个偏一侧 → 那一侧
- 平局 → 两边都放，但**指定唯一 truth side**（见下文）
- 如果一个指标 7 题答下来很纠结，多半是**指标定义本身没拆干净**——应该拆成两个不同的指标，分别归到两边，而不是混合归属

## Truth Side（重复指标处理）

业界没有银弹（PostHog 官方在 [issue #43633](https://github.com/posthog/posthog/issues/43633) 也承认 dual-emit 没有统一 pattern）。我们的做法：**接受两边数字差异，dashboard 上标注语义不同**。

### Truth side 指定原则

| 指标类型 | Truth side | 理由 |
|---|---|---|
| 计费 ledger（每一分钱可审计） | **Postgres** | Grafana / PostHog 都视作近似展示，争议查 SQL |
| HTTP / WS / DB / Stripe webhook **计数** | **Grafana**（OTel counter） | 系统事件，PostHog 看不到 |
| 用户去重 DAU / WAU / retention | **Postgres → Grafana** for server truth; **PostHog** for frontend journey | Server 不直接发 PostHog；后端事实查 `product_events` / `user.last_seen_at` |
| 收入展示（MRR / ARR / churn revenue） | **Postgres → 两边展示** | 真相在 Postgres，Grafana 取系统侧切片（panel-30），PostHog 取用户维度切片 |
| LLM token / cost（聚合速率、按模型） | **Grafana**（OTel counter） | 系统侧聚合，SRE 视角 |
| LLM 逐条 prompt / completion / TTS text / eval / 按 user-session 成本 | **Langfuse** | 已接入 chat completion + TTS speech，正文级 trace + eval |
| 用户行为漏斗各步骤 | **PostHog** for frontend steps; **Postgres/Grafana** for server steps | Server-side facts 不在请求路径发 PostHog |

### Better Auth session table 与活跃用户

`user_active_sessions`（COUNT(\*)）和 `user_distinct_active`（COUNT(DISTINCT user_id)）共享同一张 `session` 表：

- **Better Auth 每次 sign-in / 每次 OIDC access-token 颁发都新建一条 session row，从不主动 GC 过期 row**——因为 `oauth_access_token.session_id` FK 指向 session（`apps/server/src/libs/auth.ts:513` 注释）
- 实战观察：~80K `user_active_sessions` 对应实际只有几百 distinct user。比例 5+ 就该考虑加 session GC cron 或缩短 Better Auth `expiresIn`
- 永远展示 `user_distinct_active` 给非工程师看（PM、运营）；`user_active_sessions` 留给工程师 debug

### Dashboard 标注规则

两边都展示的指标，**必须**在 Grafana panel description 和 PostHog insight description 里：

1. 注明 truth side（"Truth: Postgres `flux_transaction` 表" / "Truth: PostHog 事件去重"）
2. 注明本侧统计的语义差异（如 "Grafana 这里是 session 计数，不去重；PostHog 那边是 user 去重 DAU"）
3. 如果两边数字差异预期 > 10%，写明合理范围

## PostHog 事件命名约定

格式：`<noun>_<verb_past_tense>`，全部 `snake_case`。

| 约定 | 示例 |
|---|---|
| 名词在前，动词过去式在后 | `pricing_page_viewed`、`plan_selected`、`payment_completed` |
| 一律 past tense | `signup_completed` 不是 `complete_signup` |
| 不带产品 / 模块前缀 | `chat_session_started` 不是 `airi_chat_session_started` |
| 不带技术细节前缀 | `model_switched` 不是 `frontend_model_switched` |
| properties 用 `snake_case` | `{ plan_id, price_usd, checkout_session_id }` |
| 跟外部系统串联的 ID 用原平台命名 | `stripe_customer_id`、`stripe_subscription_id`、`checkout_session_id` |

`distinctId` 在登录后必须调 `posthog.identify(userId)`，userId 用 Better Auth 的 user id（跟 server 里的 `c.get('user').id` 一致）。AIRI server 不直接接入 `posthog-node`，后端事实事件写入 Postgres `product_events` 并通过 `airi_product_events_total` 暴露到 Grafana。前端 wiring 由 `useSharedAnalyticsStore.initialize()` 自动处理，不需要每个 caller 手动 identify。

参考来源：[PostHog: 5 events all teams should track](https://posthog.com/blog/events-you-should-track-with-posthog)。

## Grafana 指标命名约定

沿用现有 [`observability-conventions.md`](./observability-conventions.md) 不再重复，关键约束：

- OTel semconv 优先（`http_*` / `db_*` / `gen_ai_*`），匹配不上才放 `airi.*` 命名空间
- counter 一律 `_total` 后缀，histogram 一律 `_seconds_bucket` / `_bytes_bucket`
- label 基数受控（route pattern 而非 URL，model name 而非 prompt）

## 当前指标归属总表

### Grafana / Prometheus（系统侧）

来源：`apps/server/src/otel/index.ts` 全量列表见 [`observability-metrics.md`](./observability-metrics.md)。Dashboard 配置在 [`apps/server/otel/grafana/dashboards/build.ts`](../../otel/grafana/dashboards/build.ts)。

| 域 | 代表性指标 | Truth | 备注 |
|---|---|---|---|
| HTTP | `http_server_request_duration_seconds_*` | Grafana | OTel 标准 |
| WS | `ws_connections_active` / `ws_messages_*_total` | Grafana | |
| LLM | `gen_ai_client_operation_count_total` / `gen_ai_client_first_token_duration_seconds` | Grafana | |
| Billing | `airi_billing_flux_unbilled_total` | Grafana | **告警必须**：`increase(airi_billing_flux_unbilled_total[5m]) > 0` |
| Auth | `user_active_sessions` / `user_distinct_active` | Postgres → Grafana 派生 | 集群级 gauge，用 `avg()` 不要 `sum()`。两个一起看：`user_active_sessions` = `COUNT(*)`（session row 数，会膨胀）, `user_distinct_active` = `COUNT(DISTINCT user_id)`（真实活跃用户数）|
| Stripe | `airi_stripe_revenue_minor_unit_total` / `stripe_events_total` | Postgres → 两边展示 | Grafana 是系统侧 webhook 计数 |
| Runtime | `v8js_memory_*` / `nodejs_eventloop_delay_*` | Grafana | per `service_instance_id` |
| Rate-limit | `airi_rate_limit_blocked_total` | Grafana | in-memory per replica |

### PostHog（前端 / 外部数据源，产品侧）

已接入：
- 前端 `posthog-js` 通过 `packages/stage-ui/src/stores/analytics/posthog.ts` 初始化，三个 app（web / desktop / pocket）按 `isStageTamagotchi()` 等选 project key
- Server 不接入 `posthog-node`。后端产品事件写 `product_events`，Grafana 展示低基数聚合；需要 PostHog revenue/person analytics 时优先用 PostHog Stripe source connector 或离线导入，不允许在 API 请求路径同步发 PostHog。
- 前端 identity：`useSharedAnalyticsStore.initialize()` watch `authStore.isAuthenticated` 自动调 `posthog.identify(user.id)` / `reset()`
- Conversation controls 事件的 `surface` 由 `packages/stage-ui/src/composables/use-analytics.ts` 统一按 runtime 推断，UI 调用点只传业务字段。

已埋点：

| 域 | 事件 | 来源 | 落点 | Truth |
|---|---|---|---|---|
| 付费漏斗 | `pricing_page_viewed` / `plan_selected` / `checkout_started` | 前端 | `packages/stage-pages/src/pages/settings/flux.vue` | PostHog |
| 付费漏斗终点 | `payment_completed` | 后端 webhook | `product_events` + Grafana；PostHog 走 Stripe source connector/离线导入 | Postgres |
| Activation / Retention | `first_model_selected` / `model_switched` | 前端（consciousness store watcher） | `packages/stage-ui/src/stores/analytics/index.ts` | PostHog |
| Retention | `character_created` | 前端 | `apps/stage-web/src/pages/settings/characters/components/CharacterDialog.vue` | PostHog |
| Retention | `chat_session_started` | 前端 | `packages/stage-ui/src/components/scenarios/chat/components/sessions-drawer.vue` | PostHog |
| Conversation controls | `chat_session_selected` | 前端 | `packages/stage-ui/src/components/scenarios/chat/components/sessions-drawer.vue` | PostHog |
| Conversation controls | `chat_message_deleted` / `chat_messages_cleared` / `chat_message_retried` | 前端 | `packages/stage-layouts/src/components/Layouts/*InteractiveArea.vue` / `packages/stage-layouts/src/components/Widgets/ChatActionButtons.vue` / `apps/stage-tamagotchi/src/renderer/components/InteractiveArea.vue` | PostHog |
| Conversation controls | `tts_stop_clicked` | 前端 | `packages/stage-layouts/src/composables/useStopSpeakingButton.ts` | PostHog |
| Churn | `subscription_cancelled`（带 cancellation_reason） | 外部 Stripe 数据源 | PostHog Stripe source connector | Stripe/Postgres |
| 老事件 | `provider_card_clicked` | 前端 | `packages/stage-ui/src/composables/use-analytics.ts` | PostHog |
| 已退役 | `first_message_sent` / `user_signed_up`（前端版） | 无生产者 | wrapper 已删除；激活口径用 `chat_activation_succeeded`，注册事实用服务端转发的 `signup_completed` | PostHog 历史数据仍在 |

待埋点（API 已在 `use-analytics.ts` 暴露但调用点未接入）：

| 域 | 事件 | 状态 |
|---|---|---|
| Activation | `user_signed_up` | 等接到 auth callback 完成事件（Better Auth 的 signUp 成功 hook） |
| Retention | `voice_mode_activated` | 需要先在 hearing store 加显式 `enableVoiceMode` action — 当前 hearing 没有单一"用户主动启用"那一刻的 trigger，被动监听 + 录音 action 不构成 user intent 信号 |
| Feature adoption | `flux_image_generated` | 等图片生成 feature 上线 |

### 双展示指标（同名两边都有）

| 指标 | Grafana | PostHog | Truth | 语义差异 |
|---|---|---|---|---|
| 活跃用户数 | `user_active_rolling` / `user_distinct_active` | DAU = 前端 journey 去重 distinctId | **Postgres/Grafana** for server truth | Grafana 是服务端可验证活跃，PostHog 是前端产品旅程 |
| Checkout 完成数 | `stripe_checkout_completed_total` + `product_events.payment_completed` | Stripe source connector / offline import | **Postgres** | Grafana 是 webhook 计数，PostHog 是产品漏斗展示 |
| LLM 请求 | `gen_ai_client_operation_count_total` | `chat_session_started` 等 | **Grafana**（系统计数） | PostHog 是用户维度切片，会少于 Grafana（PostHog 只覆盖 logged-in user） |

## PostHog 接入路线图

落地分两步，**不要一次性埋全部事件**，否则 schema 漂移会很快出现。PostHog 采集以前端为主；服务端只经 product-events 白名单转发业务事实（注册、支付、订阅），per-request 路径仍只写 Postgres/Grafana。

### 阶段 1（P0 — 付费漏斗 + activation）

所有 surface 共用根目录 `posthog.config.ts`（单一 project key，`surface` super property 区分端）。初始化实况：

```ts
import { DEFAULT_POSTHOG_CONFIG, POSTHOG_PROJECT_KEY } from '../posthog.config'

// DEFAULT_POSTHOG_CONFIG 内含 defaults: '2025-05-24'：
// SPA 路由切换自动发 $pageview / $pageleave，页面浏览不再手动埋。
posthog.init(POSTHOG_PROJECT_KEY, { ...DEFAULT_POSTHOG_CONFIG })
// 登录后（stage 端在 analytics store，auth 端在 profile.vue）
posthog.identify(user.id)
// 在 flux.vue
posthog.capture('pricing_page_viewed', { plan_period, source })
```

`apps/stage-tamagotchi`（Electron renderer）：

```ts
// NOTICE: Electron CSP 下普通 import 会静默失效，必须用 full bundle。
// 参考：https://posthog.com/tutorials/electron-analytics
import posthog from 'posthog-js/dist/module.full.no-external.js'

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: 'https://us.i.posthog.com',
  autocapture: false, // 桌面应用没有传统 URL 路由，手动控制
})
```

埋点事件清单（P0）：

- 前端：`pricing_page_viewed`、`plan_selected`、`checkout_started`、`signup_completed`（ui-server-auth 邮箱注册路径）、`first_model_selected`
- 后端：`product_events` 是事实账本；其中业务事实白名单（`signup_completed`、`payment_completed`、`subscription_started/renewed/cancelled`）由 product-events 服务经 posthog-node 转发一份到 PostHog（`apps/server/src/services/domain/product-events.ts`，distinctId = Better Auth user id）。LLM / TTS 等 per-request 事件不转发

PostHog UI 配两个 funnel：

- **付费漏斗** (7d 窗口)：`pricing_page_viewed → plan_selected → checkout_started → payment_completed`（最后一步来自服务端转发）
- **激活漏斗** (14d 窗口)：`signup_completed → onboarding_started → chat_activation_succeeded → payment_completed`

### 阶段 2（P1 — retention / feature adoption / churn）

埋点事件清单：`character_created`、`voice_mode_activated`、`chat_session_started`、`model_switched`、`flux_image_generated`、`subscription_cancelled`。

PostHog UI 配 cohort：

- **D7 Retention by voice mode**：第一次 session 用了 `voice_mode_activated` 的用户 vs 没用的，看 D7/D30 retention 差异
- **Churn 14d**：过去 14d 没有 `chat_session_started` 的付费用户，作为召回 cohort

### Stripe → PostHog 集成路径

**不在 server webhook 里手动 capture**：

| 路径 | 用途 |
|---|---|
| PostHog Stripe **source connector** | MRR / ARR / churn revenue dashboard（PostHog 原生 Revenue analytics） |
| 离线导入 `product_events.payment_completed`（可选） | 漏斗终点 event，跟前端 `checkout_started` 串联 |

不要在 API 请求路径同步发 PostHog：PostHog 网络尾延迟会污染 auth / billing / chat route latency。需要 person-level funnel endpoint 时，用后台导入或 connector，不阻塞用户请求。

## 5xx Triage 路径

Dashboard 上 follow 这条 panel 链可以从"出事了"一路 drill 到"哪个 trace 是真凶"：

1. **panel-4 `5xx Rate %`**（Row 1）— 数字 / gauge 颜色变红，说明出事
2. **panel-9 `Top Routes by 5xx`**（Row 2 donut）— "现在哪些 route 在失败"
3. **panel-44 `5xx Rate by Route`**（Row 5.5 timeseries）— "什么时候开始的、是单点还是普遍"
4. **panel-91 `5xx Error Logs`**（Row 8 上半）— 实际错误消息，里面有 `trace_id` field 可点 → Tempo 看完整 trace 回放

### Tempo / Loki derived fields 配置（一次性）

panel-91 的 `trace_id` 字段必须配 Grafana Cloud Loki datasource 的 **Derived fields** 才能跳 Tempo。这不在 dashboard JSON 范围内，是 datasource 级配置：

- **Grafana Cloud** → Connections → Data sources → 选 `grafanacloud-projairi-logs`（Loki）→ Derived fields
- 添加：
  - **Name**: `trace_id`
  - **Type**: Regex in label or value
  - **Regex**: `"trace_id":"([a-f0-9]+)"`（匹配我们 logger 的 JSON 输出）
  - **URL**: 留空
  - **Internal link**: ✓，datasource 选 `grafanacloud-projairi-traces`（Tempo）
- 同样手法可加 `req` (request id) → 配 internal link 回 Loki 自身，按 requestId filter

配置完之后日志面板里 `trace_id` 会变成蓝色可点，直接跳 Tempo waterfall。这一步配置只做一次，新加 panel 自动享有。

## Grafana Alert SOP

Alert rules **不放在** `apps/server/otel/grafana/dashboards/build.ts` 里——Grafana Cloud 用 Unified Alerting，rule 在 Grafana UI 或 alerting API 管理，跟 dashboard JSON 解耦。这一节维护我们应该配的 alert rule，新加 rule 时同步更新这里。

### P0 — page on-call（PagerDuty / Slack on-call channel）

| Alert | Query | Threshold | Notes |
|---|---|---|---|
| **Flux Unbilled leak** | `increase(airi_billing_flux_unbilled_total[5m])` | `> 0` for 5m | 收入直接漏；分 `reason` label 看是 `partial_debit_drained`（用户余额耗尽，预期）还是 `debit_failed`（DB / 真异常）。后者更急 |
| **5xx Rate spike** | `100 * sum(rate(http_server_request_duration_seconds_count{http_response_status_code=~"5.."}[5m])) / sum(rate(http_server_request_duration_seconds_count[5m]))` | `> 5%` for 10m | 跟 panel-4 阈值对齐 |
| **Email Failure spike** | `100 * sum(rate(airi_email_failures_total[5m])) / clamp_min(sum(rate(airi_email_send_total[5m])) + sum(rate(airi_email_failures_total[5m])), 1)` | `> 5%` for 10m | Resend / DNS / 黑名单挂了会阻塞注册流程 |

### P1 — notify only（Slack ops channel，不分页）

| Alert | Query | Threshold | Notes |
|---|---|---|---|
| **WS Connections cliff** | `sum(ws_connections_active)` | drop to 0 for 5m | 全断说明部署 / LB 异常 |
| **DB Pool exhaustion** | `max by (service_instance_id) (db_client_connection_count)` | `>= DB_POOL_MAX - 1` for 5m | 哪个 instance 满了 |
| **Heap > 85%** | `100 * sum by (service_instance_id) (v8js_memory_heap_used_bytes) / sum by (service_instance_id) (v8js_memory_heap_limit_bytes)` | `> 85%` for 15m | 内存泄漏前兆 |
| **Stripe webhook fail** | `increase(stripe_events_total{event_type="payment_intent.payment_failed"}[1h])` | `> 10` per hour | 支付链路问题 |

### 配置入口

Grafana Cloud → Alerts & IRM → Alert rules → New alert rule。把上面 query 粘进 PromQL editor，threshold 按表设置，labels 加 `severity=p0|p1`，notification policy 按 severity 路由到 PagerDuty 或 Slack。

每加一条 alert，**更新这张表**——alert 没在文档里登记 = 不知道为什么 page、不知道 owner、不知道历史阈值改动。

## 何时打破规则

这份文档定的是**默认值**，不是法律。下列情况可以打破：

- **系统指标也需要给 PM 看**（如 LLM provider 可用性影响产品决策）→ Grafana truth + 周期性 export 给 PostHog dashboard 展示
- **产品指标需要分钟级告警**（如付费转化突然归零）→ Grafana alert 监 Stripe webhook 计数，PostHog truth 不变
- **A/B test 影响系统指标**（如新 LLM router 影响延迟）→ feature flag 同时打到两边，Grafana panel 按 flag value 分线展示

打破规则的指标必须在 dashboard description 里说明，**不要静默打破**。

## 参考来源

业界没有权威 framework，下列来源是这份文档的依据：

- [PostHog Product Metrics Handbook](https://posthog.com/handbook/product/metrics) — PostHog 自己的内部分层
- [PostHog issue #43633](https://github.com/posthog/posthog/issues/43633) — dual-emit 问题的工程承认
- [Honeycomb Observability 2.0](https://www.honeycomb.io/blog/time-to-version-observability-signs-point-to-yes) — "消除工具边界"的少数派立场
- [Reforge: North Star Metrics](https://www.reforge.com/blog/north-star-metrics) — leading vs lagging 区分
- [DEV: Metrics for 500 Engineers with Linear + Grafana + PostHog](https://dev.to/johalputt/how-to-set-up-developer-metrics-for-500-engineers-using-linear-20-grafana-110-and-posthog-30-3l73) — 与我们结构最接近的公开案例
- [PostHog: Stripe payment platform](https://posthog.com/docs/revenue-analytics/payment-platforms/stripe) — Stripe 集成路径官方文档
- [PostHog: Electron analytics](https://posthog.com/tutorials/electron-analytics) — Electron renderer 接入要点
- [Google SRE Book: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/) — Four Golden Signals
- [Stripe: Essential SaaS Metrics](https://stripe.com/resources/more/essential-saas-metrics) — 收入侧指标定义
