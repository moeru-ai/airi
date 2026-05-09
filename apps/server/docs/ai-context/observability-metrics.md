# Metrics Catalog

服务端当前所有 metric 的完整目录。按业务领域分组。

> 命名规则、`airi.*` 边界、attribute 选择请看 [`observability-conventions.md`](./observability-conventions.md)。本文档只做"哪些 metric 存在、怎么查"。

## 名字到 Prometheus 系列的换算

OTel SDK 在导出到 Prometheus 时做两件事：

1. `.` → `_`：`airi.billing.flux.consumed` → `airi_billing_flux_consumed`
2. Counter 加 `_total` 后缀：`auth.attempts` → `auth_attempts_total`
3. Histogram 拆三件套：`http.server.request.duration` →
   - `http_server_request_duration_seconds_bucket`（含 `le` label）
   - `http_server_request_duration_seconds_count`
   - `http_server_request_duration_seconds_sum`
4. UpDownCounter 不加 `_total`：`ws.connections.active` → `ws_connections_active`
5. 带单位的 instrument 在 SDK 导出时把单位插进名字：`airi.stripe.revenue`（unit `minor_unit`）→ `airi_stripe_revenue_minor_unit_total`

> 查询面板若拼名字时不确定后缀，先用 `{__name__=~"airi_billing_flux.*"}` 之类正则探一下。

## HTTP（来自 instrumentation-http）

| Metric | 类型 | Unit | 来源 | 关键 attributes |
|---|---|---|---|---|
| `http.server.request.duration` | Histogram | s | `instrumentation-http`（STABLE semconv） | `http.request.method`、`http.route`、`http.response.status_code` |
| `http.server.active_requests` | UpDownCounter | — | [middlewares/otel.ts](../../src/middlewares/otel.ts) `otelMiddleware` | `http.request.method`、`http.route` |

> **STABLE-only**：[instrumentation.mjs:25](../../instrumentation.mjs) 把 `OTEL_SEMCONV_STABILITY_OPT_IN=http` 提前注入。OLD 系列（`http.server.duration` in ms）不再发射。详见 [`observability-conventions.md` 的 SemconvStability 章节](./observability-conventions.md#semconvstability-迁移说明)。

## Auth & Users

全部由 [libs/auth.ts](../../src/libs/auth.ts) Better Auth hooks 触发。

| Metric | 类型 | 落点（hook） | Labels |
|---|---|---|---|
| `auth.attempts` | Counter | `before` hook，path 含 `/sign-in` 或 `/sign-up` | `auth.method`（path 末段） |
| `auth.failures` | Counter | `after` hook，`ctx.context.returned` 含 `error` | `auth.method` |
| `user.registered` | Counter | `databaseHooks.user.create.after` | — |
| `user.login` | Counter | `databaseHooks.session.create.after` | — |
| `user.active_sessions` | UpDownCounter | session create / delete | — |

## Engagement

| Metric | 类型 | 落点 | Labels |
|---|---|---|---|
| `chat.messages` | Counter | [services/chats.ts](../../src/services/chats.ts) `pushMessages` | — |
| `character.created` | Counter | [services/characters.ts](../../src/services/characters.ts) | — |
| `character.deleted` | Counter | 同上 | — |
| `character.engagement` | Counter | 同上（like/bookmark） | `action`（`like` / `unlike` / `bookmark` / `unbookmark`） |
| `ws.connections.active` | UpDownCounter | [routes/chat-ws/index.ts](../../src/routes/chat-ws/index.ts) | — |
| `ws.messages.sent` | Counter | 同上 | — |
| `ws.messages.received` | Counter | [services/chats.ts](../../src/services/chats.ts) | — |

## Revenue & Billing

### Stripe lifecycle

| Metric | 类型 | 落点 | Labels |
|---|---|---|---|
| `stripe.checkout.created` | Counter | [routes/stripe/index.ts](../../src/routes/stripe/index.ts) `/checkout` POST | — |
| `stripe.checkout.completed` | Counter | webhook `checkout.session.completed` | — |
| `stripe.payment.failed` | Counter | webhook `invoice.payment_failed` | — |
| `stripe.subscription.event` | Counter | webhook `customer.subscription.*` | `event_type`（`created`/`updated`/`deleted`） |
| `stripe.events` | Counter | 任何 webhook | `event_type`（完整 event.type，e.g. `invoice.paid`） |
| `airi.stripe.revenue` | Counter（`minor_unit`） | webhook `checkout.session.completed` + `invoice.paid` | `currency`、`source`（`checkout`/`invoice`） |

> **金额单位**：`airi.stripe.revenue` 用最小币种单位（cents 等），跨币种 sum 没有意义，**永远 `sum by (currency)`**。要换主单位（dollars 等）做 `/ 100` 即可，前提是该币种没有不同 minor unit 比例。

### Flux ledger

| Metric | 类型 | 落点 | Labels |
|---|---|---|---|
| `airi.billing.flux.consumed` | Counter | [routes/openai/v1/index.ts](../../src/routes/openai/v1/index.ts) `recordMetrics`（chat / tts） | `gen_ai.request.model`、`gen_ai.operation.name`/`airi.gen_ai.operation.kind`、`http.response.status_code` |
| `airi.billing.flux.credited` | Counter | [services/billing/billing-service.ts](../../src/services/billing/billing-service.ts) 三条入账路径 | `source`（`stripe.checkout`/`stripe.invoice`/`promo`/`admin_grant`/...）、`type`（`credit`/`promo`） |
| `airi.billing.flux.unbilled` | Counter | `routes/openai/v1/index.ts` 流式 debit 失败 catch | `gen_ai.request.model`、`reason`（`debit_failed`）、`stage`（`streaming`） |
| `flux.insufficient_balance` | Counter | [services/billing/billing-service.ts](../../src/services/billing/billing-service.ts) `debitFlux` | — |
| `airi.billing.tts.chars` | Counter | [services/billing/flux-meter.ts](../../src/services/billing/flux-meter.ts) `accumulate` | `meter`（`tts`）、`model` |
| `airi.billing.tts.preflight_rejections` | Counter | `flux-meter.ts` `assertCanAfford` | `meter`、`reason`（`insufficient_balance`） |

> **`airi.billing.flux.unbilled` 是 P0 告警金线**：任何持续 > 0 都意味着真实收入泄漏，应当 page。语义上等于"流式响应已经发给用户但 DB debit 失败的 Flux 量"。

## GenAI

| Metric | 类型 | Unit | 落点 | Labels |
|---|---|---|---|---|
| `gen_ai.client.operation.duration` | Histogram | s | `routes/openai/v1/index.ts` `recordMetrics` | `gen_ai.request.model`、`gen_ai.operation.name`/`airi.gen_ai.operation.kind`、`http.response.status_code` |
| `gen_ai.client.operation.count` | Counter | — | 同上 | 同上 |
| `gen_ai.client.token.usage.input` | Counter | — | 同上 | 同上 |
| `gen_ai.client.token.usage.output` | Counter | — | 同上 | 同上 |
| `gen_ai.client.first_token.duration` | Histogram | s | 流式 reader 第一个非空 chunk 抵达时 | `gen_ai.request.model`、`gen_ai.operation.name` |
| `airi.gen_ai.stream.interrupted` | Counter | — | 流式 reader catch | `gen_ai.request.model`、`stage`（`before_first_chunk`/`mid_stream`） |

## Email（Resend）

来源 [services/email.ts](../../src/services/email.ts) 的 `send()` 内部 try/catch。

| Metric | 类型 | Labels |
|---|---|---|
| `airi.email.send` | Counter | `template`（`verification`/`password_reset`/`magic_link`/`change_email`/`delete_account`/`unknown`） |
| `airi.email.failures` | Counter | `template`、`error_name`（Resend `error.name` 或 `unhandled`） |
| `airi.email.duration` | Histogram（s） | `template`、`outcome`（`ok`/`error`） |

## Rate limiting

来源 [middlewares/rate-limit.ts](../../src/middlewares/rate-limit.ts) 的 `handler`。

| Metric | 类型 | Labels |
|---|---|---|
| `airi.rate_limit.blocked` | Counter | `route`（callsite 提供，e.g. `auth.api` / `openai.completions` / `stripe.checkout`）、`key_type`（`user`/`ip`）、`limit`（窗口内最大次数） |

> **注意**：`route` 是 callsite 显式提供的稳定 label，不是 raw URL path —— URL path 是高 cardinality，会爆炸。新加 rate limiter 时记得传 `routeLabel`。

## Node.js Runtime

来自 `@opentelemetry/instrumentation-runtime-node`，下面这些是 dashboard 上用到的子集（不全列）：

- `v8js.memory.heap.{used,limit,space.physical_size,space.available_size}` Gauge / bytes
- `nodejs.eventloop.delay.{p50,p99,mean,...}` Gauge / s
- `nodejs.eventloop.utilization` Gauge / ratio
- `v8js.gc.duration` Histogram / s

## 已落地的 dashboard 行映射

[airi-server-overview-cloud.json](../../otel/grafana/dashboards/airi-server-overview-cloud.json)，从上到下：

| Row | 关键 metric |
|---|---|
| HTTP Overview | `http.server.request.duration`（rate / P95 / by route / 5xx 率） |
| Auth & Users | `auth.attempts` / `auth.failures` / `user.{login,registered,active_sessions}` + 失败率 |
| Engagement | `ws.connections.active` / `ws.messages.{sent,received}` / `chat.messages` / `character.{created,deleted,engagement}` |
| Business Metrics | `airi.billing.flux.consumed` / `flux.insufficient_balance` / `gen_ai.client.token.usage.*` / `stripe.checkout.completed` / `airi.billing.flux.credited` |
| Stripe Detail | `stripe.{events,subscription.event,payment.failed}` / checkout funnel / `airi.stripe.revenue` |
| Node.js Runtime | runtime instrumentation 那一批 |
| LLM Gateway | `gen_ai.client.{operation.count,operation.duration,token.usage.*,first_token.duration}` / `airi.billing.flux.consumed` / `airi.billing.flux.unbilled` / `airi.gen_ai.stream.interrupted` / `airi.billing.tts.chars` |
| Reliability | `airi.email.{send,failures}` 失败率 / `airi.rate_limit.blocked` / `airi.billing.tts.preflight_rejections` |
| Application Logs | Loki，不是 Prometheus |

## 验证 metric 是否已注册

[`src/scripts/otel-smoke.mjs`](../../src/scripts/otel-smoke.mjs) 跑一遍：

```sh
pnpm -F @proj-airi/server exec node --import tsx ./src/scripts/otel-smoke.mjs
```

会打印 SDK 启动时立即 export 的所有 instrument 名字。**Counter 通过 `.add(0)` priming**（[libs/otel.ts](../../src/libs/otel.ts) `primeCounter`）后会出现在这里 —— Histogram 不会，要等真实 `.record()` 才出现。

## 加新 metric 时的 checklist

1. 决定命名空间：能映射到 OTel semconv 就用标准名，否则放 `airi.*`（不要造新顶级前缀）
2. 在 [utils/observability.ts](../../src/utils/observability.ts) 加常量
3. 在 [libs/otel.ts](../../src/libs/otel.ts) 的对应 metric group 接口（`HttpMetrics`/`AuthMetrics`/...）加字段，并在 `initOtel` 里 `meter.create*` 创建
4. **如果是 Counter，在 `primeCounter` 调用列表里加一行** —— 否则低流量时 panel 看起来"没数据"
5. 在 callsite 通过 DI 拿到 metrics 对象后调 `.add()` / `.record()`
6. 跑 `pnpm -F @proj-airi/server exec node --import tsx ./src/scripts/otel-smoke.mjs` 确认注册
7. 更新本文档对应章节
