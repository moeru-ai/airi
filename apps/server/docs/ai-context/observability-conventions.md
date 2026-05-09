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

当前 `apps/server` 仍保留以下 metric name：

- `llm.request.duration`
- `llm.request.count`
- `llm.tokens.prompt`
- `llm.tokens.completion`
- `flux.consumed`

这是有意为之，不是遗漏。

原因：

- metric name 改动比 attribute 改动更容易破坏现有 Prometheus 查询、Grafana 面板和告警。
- 目前更高价值的是先统一 metric attributes，使查询维度稳定。
- 如需迁移 metric name，应该走兼容迁移方案，而不是在普通功能改动里直接重命名。

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
- [apps/server/src/libs/otel.ts](/apps/server/src/libs/otel.ts)
- [services/telegram-bot/src/llm/actions.ts](/services/telegram-bot/src/llm/actions.ts)
- [services/telegram-bot/src/bots/telegram/agent/actions/read-message.ts](/services/telegram-bot/src/bots/telegram/agent/actions/read-message.ts)

## SemconvStability 迁移说明

`@opentelemetry/instrumentation-http` 0.215+ 默认 OLD semconv（`http.server.duration` in ms），不是 STABLE 名。AIRI 在 [apps/server/instrumentation.mjs](/apps/server/instrumentation.mjs) 顶部强制 `OTEL_SEMCONV_STABILITY_OPT_IN=http`（仅 STABLE）。

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

## Counter priming 注意事项

OTel SDK 的 Counter / UpDownCounter 在第一次 `.add()` 之前**完全不出现在 Prometheus 抓取里**。Histogram 同理（要等第一次 `.record()`）。

后果：低流量 metric 在 dashboard 上看起来像「埋点丢了」，告警里 `absent()` 也无法工作。

[apps/server/src/libs/otel.ts](/apps/server/src/libs/otel.ts) 的 `primeCounter` 在 SDK 启动后给每个 Counter 调一次 `.add(0)`，把 series 注册出来；`0` 不影响 rate / sum 计算。

加新 Counter 时**记得加进 prime 列表**，否则未触发的指标在 Grafana 里就是空的。

验证脚本：[apps/server/src/scripts/otel-smoke.mjs](/apps/server/src/scripts/otel-smoke.mjs)

```sh
pnpm -F @proj-airi/server exec node --import tsx ./src/scripts/otel-smoke.mjs
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
