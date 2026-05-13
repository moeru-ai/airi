# Observability Conventions

这份约定定义 AIRI 服务端新增 trace / metric attributes 时应该遵守的命名规则，目标是减少自定义前缀扩散，并让 Grafana / Tempo / Loki 查询尽量对齐 OpenTelemetry 语义约定。

## 总原则

- 能直接映射到 OpenTelemetry semantic conventions 的字段，优先使用标准字段。
- 不能映射到标准字段、但确实属于 AIRI 业务语义的字段，统一放到 `airi.*` 命名空间下。
- 不要新增新的顶级前缀，例如 `llm.*`、`gateway.*`、`telegram.*` 之类的 attribute key。
- span name、event name、metric name 不等于 attribute key；是否迁移它们要单独评估兼容性。
- 代码里不要继续散落新的 observability key 字符串字面量；统一从 [packages/server-shared/src/observability.ts](/packages/server-shared/src/observability.ts) 引用。

## 标准字段优先级

### GenAI

优先使用：

- `GEN_AI_ATTR_OPERATION_NAME`
- `GEN_AI_ATTR_REQUEST_MODEL`
- `GEN_AI_ATTR_USAGE_INPUT_TOKENS`
- `GEN_AI_ATTR_USAGE_OUTPUT_TOKENS`
- `SERVER_ATTR_ADDRESS`
- `SERVER_ATTR_PORT`

适用场景：

- chat completion
- embeddings
- 其他能明确归类到 GenAI 上游调用的请求

注意：

- 当前 OpenTelemetry GenAI semantic conventions 仍处于 `Development` 状态，因此只在“语义明确匹配”时采用。
- 没有明确标准归属的字段不要硬塞进 `gen_ai.*`。

### Database / Redis

优先使用：

- `db.system.name`
- `db.operation.name`
- `db.namespace`
- `db.query.text`
- `db.response.status_code`
- `server.address`
- `server.port`

Redis 相关优先复用 instrumentation 自动产生的标准属性，不要重复造一套并行命名。

## AIRI 自定义字段

以下场景使用 `airi.*`：

- 计费或余额语义
- 仅 AIRI 内部存在的流式控制字段
- 临时调试但仍需要进入可观测系统的业务字段

当前 attribute 示例：

- `AIRI_ATTR_BILLING_FLUX_CONSUMED`
- `AIRI_ATTR_GEN_AI_STREAM`
- `AIRI_ATTR_GEN_AI_STREAM_INTERRUPTED`
- `AIRI_ATTR_GEN_AI_OPERATION_KIND`
- `AIRI_ATTR_GEN_AI_INPUT_MESSAGES`
- `AIRI_ATTR_GEN_AI_INPUT_TEXT`
- `AIRI_ATTR_GEN_AI_OUTPUT_TEXT`

当前 `airi.*` metric 命名空间（Prom 系列名见 [`observability-metrics.md`](./observability-metrics.md)）：

- 计费：`airi.billing.flux.consumed` / `.credited` / `.unbilled` / `.tts.chars` / `.tts.preflight_rejections`
- 收入：`airi.stripe.revenue`
- 邮件：`airi.email.send` / `.failures` / `.duration`
- 限流：`airi.rate_limit.blocked`
- GenAI：`airi.gen_ai.stream.interrupted`

## Metric Name 策略

`apps/server` 的 LLM gateway metric 现在全部用标准 `gen_ai.client.*` semconv 名 + AIRI `airi.billing.*` 计费名。旧的 `llm.request.*` / `llm.tokens.*` / `flux.consumed` 字面名都已经迁移完，请**不要在新代码或 reviewer 建议里复活**它们 —— 代码里 const 命名（如 `METRIC_FLUX_CONSUMED`）保留是历史 identifier，对应的字面值已经是 `airi.billing.flux.consumed`，以字面值为准。

新增或重命名 metric 时遵守：

- metric name 改动比 attribute 改动更容易破坏现有 Prometheus 查询、Grafana 面板和告警。**先确认 dashboard / alerts 是否在跑这条 series**，再决定是否重命名。
- 重命名一定要走兼容迁移：先双发新旧两条 series，留出窗口给消费方切换，再删旧的；不要在普通功能改动里直接重命名。
- 完整 metric 清单（含 Prometheus 系列名）维护在 [`observability-metrics.md`](./observability-metrics.md)。新增任何 metric 都要同步更新那份文档。

## Grafana / Prometheus 查询策略

面板和告警查询优先依赖 metric labels，对齐我们已经统一的 attributes。

### GenAI 面板应该查什么

优先使用这些 Prometheus label：

- `gen_ai_request_model`
- `gen_ai_operation_name`
- `airi_gen_ai_operation_kind`
- `http_response_status_code`

说明：

- Prometheus 暴露时会把 attribute key 里的 `.` 转成 `_`，所以 `gen_ai.request.model` 会变成 `gen_ai_request_model`。
- `gen_ai_operation_name` 适合 chat、embeddings 这类有明确 semconv 的操作。
- `airi_gen_ai_operation_kind` 适合当前没有明确 semconv 的 AIRI 自定义操作类型，例如 `tts`、`asr`。

### 不再新增使用的旧查询维度

新增 dashboard、录制规则、告警时，不要再新增依赖这些旧 label：

- `model`
- `type`

旧面板可以渐进迁移，不要求一次性全部替换，但新改动必须直接使用新标签。

### 当前已落地的 dashboard 例子

[apps/server/otel/grafana/dashboards/airi-server-overview-cloud.json](/apps/server/otel/grafana/dashboards/airi-server-overview-cloud.json) 已经按以下方式查询：

- Request rate by model: `gen_ai_request_model`
- Request rate by operation: `gen_ai_operation_name` + `airi_gen_ai_operation_kind`
- Latency by model: `gen_ai_request_model`
- Flux consumed by model: `gen_ai_request_model`
- Token throughput by model: `gen_ai_request_model`

如果未来新增本地 dashboard 或新的 cloud dashboard，默认按这一套 label 维度来。

## Span Name 策略

span name 目前允许保留业务可读格式，例如：

- `llm.gateway.chat`
- `llm.gateway.tts`
- `llm.gateway.asr`

原因：

- span name 主要服务于人工浏览和局部检索。
- 语义筛选应优先依赖 attributes，而不是依赖 span name 文本。

如果未来统一 span name，也应保证查询主要依赖 `gen_ai.*` / `db.*` / `airi.*` attributes。

## 修改前检查

新增 observability 字段前，先问自己：

1. 这个字段能否映射到已有 OTel semconv？
2. 如果不能，它是否明确属于 AIRI 业务语义？
3. 如果属于 AIRI，是否应该挂到 `airi.*`，而不是新造顶级前缀？
4. 我改的是 attribute key 还是 metric name / span name？
5. 如果是 metric name，是否已经评估 Prometheus / Grafana / alerting 兼容性？
6. 如果要改 dashboard，我是否优先用了 `gen_ai_request_model`、`gen_ai_operation_name`、`airi_gen_ai_operation_kind`，而不是旧的 `model` / `type`？

## 当前参考实现

- [packages/server-shared/src/observability.ts](/packages/server-shared/src/observability.ts)
- [apps/server/src/routes/v1completions.ts](/apps/server/src/routes/v1completions.ts)
- [apps/server/src/otel/index.ts](/apps/server/src/otel/index.ts)
- [services/telegram-bot/src/llm/actions.ts](/services/telegram-bot/src/llm/actions.ts)
- [services/telegram-bot/src/bots/telegram/agent/actions/read-message.ts](/services/telegram-bot/src/bots/telegram/agent/actions/read-message.ts)

## SemconvStability 迁移说明

`@opentelemetry/instrumentation-http` 0.215+ 默认 OLD semconv（`http.server.duration` in ms），不是 STABLE 名。AIRI 在 [apps/server/instrumentation.ts](/apps/server/instrumentation.ts) 顶部强制 `OTEL_SEMCONV_STABILITY_OPT_IN=http`（仅 STABLE）。

| Semconv 模式 | 发哪些 series | 我们用 |
|---|---|---|
| OLD（默认）| `http.server.duration` (ms)、`http.client.duration` (ms)、attr 用 `http.method` / `http.status_code` | ❌ |
| STABLE（`=http`）| `http.server.request.duration` (s)、`http.client.request.duration` (s)、attr 用 `http.request.method` / `http.response.status_code` | ✅ |
| 双发（`=http/dup`）| 上面两套都发 | 仅在有外部 OLD-name 消费者待迁移时启用 |

**为什么直接 STABLE-only**：

- grep 整仓库零 OLD-name 引用
- Dashboard 与服务代码 checked in 在一起，无外部 dashboard
- 迁移没有自然终点，OLD 系列不显式清理就一直占 storage
- 双发会让每条 HTTP 请求 cardinality 翻倍

**何时切回 `dup`**：将来如果有别的 service 主动 scrape 本 server 的 OLD-name 系列，临时切几周完成迁移即可。

## Multi-Replica 注意事项

服务跑在 Railway 上有 ≥2 个副本（见 [workers-and-runtime.md](./workers-and-runtime.md)），所有 metric 设计必须显式考虑跨副本聚合。

### `service.instance.id` 必须设

[apps/server/instrumentation.ts](/apps/server/instrumentation.ts) 在 resource 上注入 `service.instance.id`，按优先级取 `RAILWAY_REPLICA_ID` → `SERVER_INSTANCE_ID` → `randomUUID()`（带 warn 日志，提示 ops 系列会随重启 churn）。`HOSTNAME` 曾经在 fallback 链里但 Railway 没文档化它是否 per-replica 唯一，所以踢出去了；需要跨重启稳定时显式设 `SERVER_INSTANCE_ID`。

**没设的后果**：两个副本的所有 metric series label tuple 完全一致（`service_name` + `deployment_environment` 一样），Prometheus 收到时按规则丢一条 / collapse 系列，结果一个副本完全消失。

加新 metric 时不用做任何事——只要从 `meter` 创建出来，instance id 自动随 resource 一起带上。

### 按 instrument 类型的副本安全表

| 类型 | 副本安全？ | 聚合方式 | 备注 |
|---|---|---|---|
| `Counter` | ✅ | `sum(rate(x[5m]))` | 每副本本地累加，`rate()` 自动处理重启 |
| `Histogram` | ✅ | `histogram_quantile(0.95, sum by (le, ...) (rate(x_bucket[5m])))` | 每副本本地 bucket，`sum by (le)` 合并 |
| `ObservableGauge`（**per-replica 状态**，如 `ws.connections.active`） | ✅ | `sum(x)` | callback 读本地 registry，所有副本求和 = 集群总量 |
| `ObservableGauge`（**cluster-wide 状态**，如 `user.active_sessions`） | ⚠️ | `max(x)` 或 `avg(x)` | 所有副本读同一份外部状态（DB），sum 会乘以副本数 |
| `UpDownCounter` | ⚠️ | 看场景 | 必须保证 `+1` 和 `-1` 在**同一副本**触发；否则单副本永久 +N 另一副本永久 -N |

### `UpDownCounter` 红线

只在以下情况用：
- `+1` 和对应的 `-1` 都在**同一请求生命周期**或**同一进程的局部状态机**里发生（典型：`http.server.active_requests` —— 请求开始 +1，结束 -1，必在同一副本）
- 不依赖任何外部 TTL / GC / 异步过期

如果存在「TTL 自然过期」「跨实例资源转移」「依赖 webhook 异步触发 -1」之类的情况，**不要用 UpDownCounter**。改用：
- `ObservableGauge` 从权威存储（DB / Redis）按 callback 读真实值，dashboard 用 `max()` / `avg()` 聚合
- 或者只保留对应的 `Counter`（"created" + "deleted"），让 dashboard 自己算差值

历史教训：`user.active_sessions` 最早是 UpDownCounter，登录 +1 / 登出 -1。但 Better Auth 的 session TTL 过期不会调 delete hook，counter 单实例就漂；多副本登录在 A、登出在 B 直接撕裂。改成 `ObservableGauge` 后由 [apps/server/src/app.ts](/apps/server/src/app.ts) 的 `registerActiveSessionsGauge` 通过 `SELECT COUNT(*) FROM session WHERE expires_at > NOW()` 在 scrape 时按需查 DB，带 10s 内存缓存避免 hammer。

### Dashboard 查询模板

加新 panel 时按这个清单核对：

| 数据语义 | PromQL 模板 |
|---|---|
| 业务事件速率（Counter） | `sum(rate(x_total{...}[$__rate_interval]))` |
| 按 label 切分速率 | `sum by (<label>) (rate(x_total{...}[$__rate_interval]))` |
| 时延分位（Histogram） | `histogram_quantile(0.95, sum by (le, <label>) (rate(x_bucket{...}[$__rate_interval])))` |
| 集群总量（per-replica gauge） | `sum(x{...})` |
| 集群唯一值（cluster-wide gauge） | `max(x{...})` 或 `avg(x{...})` |
| 按副本拆分调试 | `<agg> by (service_instance_id) (x{...})` |
| 错误率 | `100 * sum(rate(x_total{...,status_code=~"5.."}[5m])) / clamp_min(sum(rate(x_total{...}[5m])), 1)` |

红线：**任何 cumulative counter 都不能直接 `sum()` 不 wrap rate/increase**。Counter 在副本重启时归零，没有 rate() 包裹 Prometheus 会跳变；用 `increase($__range)` 看「时间窗口内总量」，用 `rate([interval])` 看「当前速率」。

### 「按副本拆分」何时加

默认 panel 都聚合到集群层面。但以下场景应该加 `by (service_instance_id)` 拆分图：

- 进程级资源（heap、event loop、DB pool）——一个副本泄漏 / pin CPU 别的副本掩盖不掉
- WS 连接 ——可以看出来是不是单个副本不均衡
- 自定义的 ObservableGauge 排查

Dashboard 当前 Infrastructure 行已经是 by instance 的（Heap、Event Loop、DB Pool）。

## Counter priming 注意事项

OTel SDK 的 Counter / UpDownCounter 在第一次 `.add()` 之前**完全不出现在 Prometheus 抓取里**。Histogram 同理（要等第一次 `.record()`）。

后果：低流量 metric 在 dashboard 上看起来像「埋点丢了」，告警里 `absent()` 也无法工作。

[apps/server/src/otel/index.ts](/apps/server/src/otel/index.ts) 的 `primeCounter` 在 SDK 启动后给每个 Counter 调一次 `.add(0)`，把 series 注册出来；`0` 不影响 rate / sum 计算。

加新 Counter 时**记得加进 prime 列表**，否则未触发的指标在 Grafana 里就是空的。

验证脚本：[apps/server/src/scripts/otel/smoke.ts](/apps/server/src/scripts/otel/smoke.ts)

```sh
pnpm -F @proj-airi/server exec node --import tsx ./src/scripts/otel/smoke.ts
```

打印 SDK 启动后立即可见的所有 instrument 名字。

## Dashboard 变量陷阱

**变量定义里不要引用业务 metric**。早期 [airi-server-overview-cloud.json](/apps/server/otel/grafana/dashboards/airi-server-overview-cloud.json) 的 `$env` / `$service` 都从 `http_server_request_duration_seconds_count` 取 label values —— 升级 instrumentation-http 后这个系列没了，导致：

1. 两个变量解析为空字符串
2. 所有 panel 的 `{service_name=~"$service", deployment_environment=~"$env"}` 匹配零 series
3. 整个 dashboard 全 No Data，**包括那些 metric 还活着的 panel**

修法：变量改用 `target_info`。这是 OTel SDK 启动就发的 resource-only series，永远存在，且天然自带 `service_name` / `deployment_environment` / `service_version` 这套 resource attributes。

```promql
# Good
label_values(target_info, deployment_environment)
label_values(target_info{deployment_environment=~"$env"}, service_name)

# Bad — 任何业务 metric 改名/迁移就全盘崩
label_values(http_server_request_duration_seconds_count, deployment_environment)
```

后续新增 dashboard 默认沿用 `target_info` 这条惯例。

## 完整 metric 目录

按域分组的全量 metric 清单（名字、类型、单位、labels、落点）见 [`observability-metrics.md`](./observability-metrics.md)。每加一个新 metric 时同步更新该文档。
