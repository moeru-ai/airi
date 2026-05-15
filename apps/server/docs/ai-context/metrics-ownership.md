# Metrics Ownership

这份文档定义 AIRI 团队的指标分层规则：什么指标该走 Grafana / Prometheus（OTel server-side），什么该走 PostHog（前后端混合 product analytics），同名指标怎么处理。落地这份是为了避免后期"同一个 KPI 三处不同数"的漂移。

## 总原则

工具职责正交，**互补不互替**：

| 层 | 工具 | 关键属性 |
|---|---|---|
| **System / API observability** | Grafana Cloud + Prometheus + OTel | 系统健康、延迟、错误率、SRE on-call 告警 |
| **Product analytics** | PostHog Cloud | 用户行为、漏斗、retention、cohort、A/B、feature adoption |
| **Financial truth source** | Postgres (`flux_transaction` / Stripe webhook 持久化) | 收入与扣费 ledger，任何展示都视作近似 |
| **LLM-native observability**（预留） | Langfuse / Helicone（未接入） | token cost、prompt eval、provider trace — 后续按需引入 |

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
| 用户去重 DAU / WAU / retention | **PostHog** | 需要 distinctId 去重，session table 计数不准 |
| 收入展示（MRR / ARR / churn revenue） | **Postgres → 两边展示** | 真相在 Postgres，Grafana 取系统侧切片（panel-30），PostHog 取用户维度切片 |
| LLM token / cost | **Grafana**（短期） | 后续若引入 Langfuse 则迁过去 |
| 用户行为漏斗各步骤 | **PostHog**（必须） | 第一步通常是前端事件，Grafana 拿不到 |

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

`distinctId` 在登录后必须调 `posthog.identify(userId)`，userId 用 Better Auth 的 user id（跟 server 里的 `c.get('user').id` 一致）。后端 `posthog-node` 上报支付事件时用 fallback 链 `userId` (`session.metadata.userId`) > `email` (`session.customer_email`) > `session.id`——第一项跟前端 `identify` 一致，PostHog person merge 在这里完成。前端 wiring 由 `useSharedAnalyticsStore.initialize()` 自动处理，不需要每个 caller 手动 identify。

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
| Auth | `user_active_sessions` | Postgres → Grafana 派生 | 集群级 gauge，用 `avg()` 不要 `sum()` |
| Stripe | `airi_stripe_revenue_minor_unit_total` / `stripe_events_total` | Postgres → 两边展示 | Grafana 是系统侧 webhook 计数 |
| Runtime | `v8js_memory_*` / `nodejs_eventloop_delay_*` | Grafana | per `service_instance_id` |
| Rate-limit | `airi_rate_limit_blocked_total` | Grafana | in-memory per replica |

### PostHog（前后端混合，产品侧）

已接入：
- 前端 `posthog-js` 通过 `packages/stage-ui/src/stores/analytics/posthog.ts` 初始化，三个 app（web / desktop / pocket）按 `isStageTamagotchi()` 等选 project key
- 后端 `posthog-node` 通过 `apps/server/src/services/posthog.ts` + injeca provider `services:posthog`
- 前端↔后端 identity merge：`useSharedAnalyticsStore.initialize()` watch `authStore.isAuthenticated` 自动调 `posthog.identify(user.id)` / `reset()`

已埋点：

| 域 | 事件 | 来源 | 落点 | Truth |
|---|---|---|---|---|
| 付费漏斗 | `pricing_page_viewed` / `plan_selected` / `checkout_started` | 前端 | `packages/stage-pages/src/pages/settings/flux.vue` | PostHog |
| 付费漏斗终点 | `payment_completed` | 后端 webhook | `apps/server/src/routes/stripe/index.ts` | PostHog |
| Activation / Retention | `first_model_selected` / `model_switched` | 前端（consciousness store watcher） | `packages/stage-ui/src/stores/analytics/index.ts` | PostHog |
| Retention | `character_created` | 前端 | `apps/stage-web/src/pages/settings/characters/components/CharacterDialog.vue` | PostHog |
| Retention | `chat_session_started` | 前端 | `packages/stage-ui/src/components/scenarios/chat/components/sessions-drawer.vue` | PostHog |
| Churn | `subscription_cancelled`（带 cancellation_reason） | 后端 webhook | `apps/server/src/routes/stripe/index.ts` | PostHog |
| 老事件 | `provider_card_clicked` / `first_message_sent` | 前端 | `packages/stage-ui/src/composables/use-analytics.ts` | PostHog |

待埋点（API 已在 `use-analytics.ts` 暴露但调用点未接入）：

| 域 | 事件 | 状态 |
|---|---|---|
| Activation | `user_signed_up` | 等接到 auth callback 完成事件（Better Auth 的 signUp 成功 hook） |
| Retention | `voice_mode_activated` | 需要先在 hearing store 加显式 `enableVoiceMode` action — 当前 hearing 没有单一"用户主动启用"那一刻的 trigger，被动监听 + 录音 action 不构成 user intent 信号 |
| Feature adoption | `flux_image_generated` | 等图片生成 feature 上线 |

### 双展示指标（同名两边都有）

| 指标 | Grafana | PostHog | Truth | 语义差异 |
|---|---|---|---|---|
| 活跃用户数 | `user_active_sessions`（Postgres session 计数） | DAU = 去重 distinctId | **PostHog** | Grafana 是 active **sessions**，PostHog 是 active **users** |
| Checkout 完成数 | `stripe_checkout_completed_total` | `payment_completed` event | **Postgres** | 两边都展示，Grafana 是 webhook 计数，PostHog 是漏斗终点 |
| LLM 请求 | `gen_ai_client_operation_count_total` | `chat_session_started` 等 | **Grafana**（系统计数） | PostHog 是用户维度切片，会少于 Grafana（PostHog 只覆盖 logged-in user） |

## PostHog 接入路线图

落地分两步，**不要一次性埋全部事件**，否则 schema 漂移会很快出现。

### 阶段 1（P0 — 付费漏斗 + activation）

`apps/server`：

```ts
// services/posthog.ts（新增）
import { PostHog } from 'posthog-node'

export function createPostHog(env: ServerEnv) {
  return new PostHog(env.POSTHOG_KEY, { host: 'https://us.i.posthog.com' })
}

// 在 Stripe webhook handler 里
posthog.capture({
  distinctId: stripeCustomerEmail,
  event: 'payment_completed',
  properties: { plan_id, amount_usd, stripe_customer_id, stripe_subscription_id }
})
```

`apps/stage-web`：

```ts
import posthog from 'posthog-js'

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: 'https://us.i.posthog.com',
  capture_pageview: false, // 手动 capture 控制语义
})
// 登录后
posthog.identify(user.id)
// 在 pricing.vue
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

- 前端：`pricing_page_viewed`、`plan_selected`、`checkout_started`、`user_signed_up`、`first_message_sent`、`first_model_selected`
- 后端：`payment_completed`

PostHog UI 配两个 funnel：

- **付费漏斗** (7d 窗口)：`pricing_page_viewed → plan_selected → checkout_started → payment_completed`
- **激活漏斗** (14d 窗口)：`user_signed_up → first_message_sent → first_model_selected → payment_completed`

### 阶段 2（P1 — retention / feature adoption / churn）

埋点事件清单：`character_created`、`voice_mode_activated`、`chat_session_started`、`model_switched`、`flux_image_generated`、`subscription_cancelled`。

PostHog UI 配 cohort：

- **D7 Retention by voice mode**：第一次 session 用了 `voice_mode_activated` 的用户 vs 没用的，看 D7/D30 retention 差异
- **Churn 14d**：过去 14d 没有 `chat_session_started` 的付费用户，作为召回 cohort

### Stripe → PostHog 集成路径

**两条路径都接**：

| 路径 | 用途 |
|---|---|
| PostHog Stripe **source connector** | MRR / ARR / churn revenue dashboard（PostHog 原生 Revenue analytics） |
| **手动 capture** `payment_completed`（后端 webhook） | 漏斗终点 event，跟前端 `checkout_started` 串联 |

不能只用 source connector：它是 data warehouse 层，**不生成 person event，做不了漏斗**。

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
