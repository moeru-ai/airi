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

当前示例：

- `AIRI_ATTR_BILLING_FLUX_CONSUMED`
- `AIRI_ATTR_GEN_AI_STREAM`
- `AIRI_ATTR_GEN_AI_STREAM_INTERRUPTED`
- `AIRI_ATTR_GEN_AI_OPERATION_KIND`
- `AIRI_ATTR_GEN_AI_INPUT_MESSAGES`
- `AIRI_ATTR_GEN_AI_INPUT_TEXT`
- `AIRI_ATTR_GEN_AI_OUTPUT_TEXT`

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
