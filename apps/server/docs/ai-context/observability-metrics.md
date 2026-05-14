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
4. UpDownCounter / ObservableGauge 不加 `_total`：`ws.connections.active` → `ws_connections_active`、`user.active_sessions` → `user_active_sessions`
5. 带单位的 instrument 在 SDK 导出时把单位插进名字：`airi.stripe.revenue`（unit `minor_unit`）→ `airi_stripe_revenue_minor_unit_total`

> 查询面板若拼名字时不确定后缀，先用 `{__name__=~"airi_billing_flux.*"}` 之类正则探一下。

## HTTP（来自 instrumentation-http）

| Metric | 类型 | Unit | 来源 | 关键 attributes |
|---|---|---|---|---|
| `http.server.request.duration` | Histogram | s | [`@hono/otel`](https://www.npmjs.com/package/@hono/otel) `httpInstrumentationMiddleware` in [app.ts](../../src/app.ts) | `http.request.method`、`http.route`、`http.response.status_code` |
| `http.server.active_requests` | UpDownCounter | — | 同上 | `http.request.method` |

> **入站走 @hono/otel，出站走 auto HttpInstrumentation**：auto instrumentation 在 Node http 层抓数据时 Hono 还没匹配路由，`http.route` label 永远为空。`@hono/otel` 在 Hono middleware 链里跑，能拿到匹配后的路由 pattern（`/api/v1/users/:id` 而非具体 URL），所以入站 metric 由它产生。auto HttpInstrumentation 在 [instrumentation.ts](../../instrumentation.ts) 里通过 `ignoreIncomingRequestHook: () => true` 仅保留**出站**（LLM gateway、Stripe、Resend），那部分还是要它来跟踪。
>
> **STABLE-only**：[instrumentation.ts](../../instrumentation.ts) 把 `OTEL_SEMCONV_STABILITY_OPT_IN=http` 提前注入。OLD 系列（`http.server.duration` in ms）不再发射。详见 [`observability-conventions.md` 的 SemconvStability 章节](./observability-conventions.md#semconvstability-迁移说明)。
>
> `/health` 路径在 [app.ts](../../src/app.ts) 的 @hono/otel 包装层被显式 skip，Railway 健康检查不进 metric。

## Auth & Users

全部由 [libs/auth.ts](../../src/libs/auth.ts) Better Auth hooks 触发。

| Metric | 类型 | 落点（hook） | Labels |
|---|---|---|---|
| `auth.attempts` | Counter | `before` hook，path 含 `/sign-in` 或 `/sign-up` | `auth.method`（path 末段） |
| `auth.failures` | Counter | `after` hook，`ctx.context.returned` 含 `error` | `auth.method` |
| `user.registered` | Counter | `databaseHooks.user.create.after` | — |
| `user.login` | Counter | `databaseHooks.session.create.after` | — |
| `user.active_sessions` | ObservableGauge | [app.ts](../../src/app.ts) `registerActiveSessionsGauge`，scrape 时查 `SELECT COUNT(*) FROM session WHERE expires_at > NOW()`（10s 内存缓存） | — |

> **`user.active_sessions` 是 cluster-wide gauge，dashboard 必须用 `max()` / `avg()`，不能用 `sum()`**。所有副本读同一份 DB 报同一个值，sum 会乘以副本数。详见 [observability-conventions.md 的 Multi-Replica 章节](./observability-conventions.md#multi-replica-注意事项)。
>
> 历史：之前是 UpDownCounter（+1 on login, -1 on logout），但 Better Auth session TTL 过期不会调 delete hook，counter 单实例就漂；多副本下登录在 A、登出在 B 会直接撕裂正负数。所以改成 DB-backed gauge。

## Engagement

| Metric | 类型 | 落点 | Labels |
|---|---|---|---|
| `chat.messages` | Counter | [services/chats.ts](../../src/services/chats.ts) `pushMessages` | — |
| `character.created` | Counter | [services/characters.ts](../../src/services/characters.ts) | — |
| `character.deleted` | Counter | 同上 | — |
| `character.engagement` | Counter | 同上（like/bookmark） | `action`（`like` / `unlike` / `bookmark` / `unbookmark`） |
| `ws.connections.active` | ObservableGauge | [routes/chat-ws/index.ts](../../src/routes/chat-ws/index.ts) `addCallback` walks `userConnections` Map | — |
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
| `airi.billing.flux.unbilled` | Counter | [routes/openai/v1/index.ts](../../src/routes/openai/v1/index.ts) streaming 路径里 `consumeFluxForLLM` 失败的 catch | `gen_ai.request.model`、`reason`（`debit_failed`）、`stage`（`streaming`） |
| `flux.insufficient_balance` | Counter | [services/billing/billing-service.ts](../../src/services/billing/billing-service.ts) `debitFlux` | — |
| `airi.billing.tts.chars` | Counter | [services/billing/flux-meter.ts](../../src/services/billing/flux-meter.ts) `accumulate` | `meter`（`tts`）、`model` |
| `airi.billing.tts.preflight_rejections` | Counter | `flux-meter.ts` `assertCanAfford` | `meter`、`reason`（`insufficient_balance`） |

> **`airi.billing.flux.unbilled` 是 P0 告警金线**：流式响应已经发给用户（HTTP 200，token 已经流出），但 post-stream debit 抛错——response 路径不会因此 5xx，DB latency 也只在 catch 那一瞬间显著。HTTP / DB 告警**覆盖不到**这条静默 revenue leak。推荐 alert：`increase(airi_billing_flux_unbilled_total[5m]) > 0` 持续 > 0 立刻 page。

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

[airi-server-overview-cloud.json](../../otel/grafana/dashboards/airi-server-overview-cloud.json) 由 [`build.ts`](../../otel/grafana/dashboards/build.ts) 生成（**直接改 JSON 会在下次 regenerate 时被覆盖；改 build.ts**），跑 `pnpm -F @proj-airi/server otel:dashboards` 重新生成。从上到下：

| Row | viz | 关键 metric |
|---|---|---|
| Service Health | stat / gauge | `user.active_sessions`（`max()`）、`ws.connections.active`（`sum()`）、`http.server.request.duration_count`（req/s + 5xx%）、`gen_ai.client.operation.count`、`airi.email.{send,failures}` 失败率 |
| Distribution (now) | donut | HTTP methods / LLM models / HTTP status codes — `increase([5m])` |
| Traffic Trends | timeseries | 同 distribution 的数据 over time |
| Latency | timeseries | `http.server.request.duration_bucket`（P95 by route）、`gen_ai.client.first_token.duration_bucket`（P95 by model） |
| Errors / Quality | mix | 4xx/5xx stacked area、`airi.gen_ai.stream.interrupted`、`airi.rate_limit.blocked` |
| Business | stat / gauge / donut | `airi.stripe.revenue`（by currency）、checkout conversion %、`stripe.events` 分布 |
| Infrastructure (collapsed, **by `service_instance_id`**) | timeseries | `db_client_operation_duration` P95（cluster）、`db_client_connection_count`、`v8js_memory_heap_used_bytes` %、`nodejs_eventloop_delay_p99_seconds` |
| Logs | logs | Loki，不是 Prometheus |

> **Multi-replica 聚合方式**：所有 panel 在 `build.ts` 里都已经按 `observability-conventions.md` 的副本安全表选择了正确的 aggregator（Counter 用 `sum(rate)`、cluster-wide gauge 用 `max()`、per-process gauge 用 `sum()`、infra 排查面板用 `by (service_instance_id)`）。加新 panel 时按那张表对照一遍。

## 验证 metric 是否已注册

[`src/scripts/otel/smoke.ts`](../../src/scripts/otel/smoke.ts) 跑一遍：

```sh
pnpm -F @proj-airi/server exec node --import tsx ./src/scripts/otel/smoke.ts
```

会打印 SDK 启动时立即 export 的所有 instrument 名字。**Counter 通过 `.add(0)` priming**（[otel/index.ts](../../src/otel/index.ts) `primeCounter`）后会出现在这里 —— Histogram 不会，要等真实 `.record()` 才出现。

## 加新 metric 时的 checklist

1. 决定命名空间：能映射到 OTel semconv 就用标准名，否则放 `airi.*`（不要造新顶级前缀）
2. 在 [utils/observability.ts](../../src/utils/observability.ts) 加常量
3. 在 [otel/index.ts](../../src/otel/index.ts) 的对应 metric group 接口（`HttpMetrics`/`AuthMetrics`/...）加字段，并在 `initOtel` 里 `meter.create*` 创建
4. **如果是 Counter，在 `primeCounter` 调用列表里加一行** —— 否则低流量时 panel 看起来"没数据"
5. 在 callsite 通过 DI 拿到 metrics 对象后调 `.add()` / `.record()`
6. 跑 `pnpm -F @proj-airi/server exec node --import tsx ./src/scripts/otel/smoke.ts` 确认注册
7. 更新本文档对应章节
