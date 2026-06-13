# Langfuse LLM-native 观测接入

逐条 prompt 级 trace + 评测 + 成本归因到用户/会话。阶段 1(chat completion + TTS speech)已实现并验证,见下「已实现」与 `verifications/langfuse-tracing.md`。

## 目标

1. 逐条 prompt trace：每次 `/api/v1/openai/chat/completions` 的 input messages、output、model 完整可读。
2. 评测 eval：dataset、人工标注、LLM-as-judge。
3. 成本归因：按 user 和按 conversation/session 切分 token 与成本。

## 为什么直接 Langfuse，不先用 Grafana 顶

Grafana 栈（Prometheus/Tempo/Loki）已经管好 ops 聚合层，继续不动：rate、latency、聚合 token 吞吐/消耗、按模型 flux、错误、fallback、上游健康。这层完整。

上面三个目标里 Grafana 栈的实际能力：

- 逐条 prompt trace：Tempo 能塞 span，但 trace 是 head-sampled，采样比 < 1 直接丢 prompt；span 属性有体积上限，长 prompt 被截；没有把 prompt 当一等对象读/对比/标注的界面。
- eval：零能力，dataset / 标注队列 / LLM-as-judge 全得自己造。
- 按 user/session 成本：Prometheus 按 userId/sessionId 做 label 会高基数爆炸，做不了。按 user 的成本原料其实在 `llm_request_log` 表里，用 SQL 能查，跟 Grafana 无关。

这三件事里正文采集是最重的活，两边都得从零写，先做 Grafana 一点不省。真正能省的只有 eval 和 per-user/session 成本，而这俩在 Grafana 上等于手搓一个更差的 Langfuse，迁移时全扔。所以不走「先 Grafana 再 Langfuse」，直接 Langfuse 补 LLM-native 这一层。

边界划分：

- Grafana 栈：ops 指标，不动。
- Langfuse：逐条 prompt trace + 正文 + eval + user/session 成本归因。

## 选型：Langfuse v5 = OpenTelemetry SpanProcessor

Langfuse v5 JS SDK 基于 OpenTelemetry，`@langfuse/otel` 的 `LangfuseSpanProcessor` 就是一个 OTel SpanProcessor。AIRI 这里没有把它挂到现有 NodeSDK 上，而是起一个独立 `NodeTracerProvider` 并通过 `setLangfuseTracerProvider()` 只给 `@langfuse/tracing` 使用。

- Grafana 出口：`OTLPTraceExporter` → Grafana Cloud Tempo。
- Langfuse 出口：独立 provider 上的 `LangfuseSpanProcessor` → Langfuse Cloud。
- 两者共享 OTel context/trace id，但不共享 SpanProcessor，避免 prompt/completion 正文进 Grafana Tempo。

不走「复用 OTLP exporter 指向 Langfuse」的原因：① 目标里有 eval，eval 只能走 Langfuse SDK/API，OTLP 解决不了；② 现有 span 用 `airi.gen_ai.*` 自定义 attribute key，Langfuse 不认，得改成它认的 generation 字段。一套 SDK 把 trace + 正文 + 成本 + eval 全包，不维护两条上报路。

需要的包：`@langfuse/tracing`、`@langfuse/otel`。

## 部署形态与脱敏决策

- 形态：Langfuse Cloud。
- 脱敏：不脱敏。prompt/completion 正文全量出境到 Langfuse 托管，已确认可接受。
- 凭据:`LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL`(SDK 默认变量名,带下划线),走 Railway env secret,本地走 `.env.local`。instrumentation.ts 和网关 route 都直读 `process.env`,**不进 `env.ts` 的 valibot schema**。原因:instrumentation 是 preload(在 env 解析之前跑),且这是部署开关(类比 NODE_ENV)不是服务依赖,不需要进 DI。

## Session 来源决策

网关 `openai/v1/index.ts` 是无状态 OpenAI 兼容代理，本身没有 conversation/session 概念，每请求只有 `c.get('user')` 的 userId 和一个临时 `nanoid()` requestId。`chats` 表存在但跟这条代理路径零关联（那是另一套 `/chats` API）。

所以 session id 必须客户端传。决策：客户端传对话 id，网关读出来当 Langfuse `sessionId`。

落地点几乎免费：stage-ui 的 `packages/stage-ui/src/libs/providers/providers/official/shared.ts` 已有 `withCredentials()` fetch 包装器在每请求注入 `Authorization` header。在同一处加一个 `x-airi-session-id` header 即可，不用碰 `@xsai` 的 body 透传。stage-web 和 stage-tamagotchi 都复用这个 provider，改一处两端生效。

改端范围仅此一处。telegram-bot 自带 provider，不经 server 网关，不在范围内。

## 成本归因方案

- USD 真金成本：交给 Langfuse 按 model 定价表自动算（传 `usageDetails` 的 input/output tokens 即可）。风险见下。
- flux 业务成本：作为自定义字段放 generation 的 `metadata`（flux 不是货币，不塞 `costDetails`）。
- 这样业务成本（flux）和真金成本（USD）都在，按 user / session 都能切。

## 已实现(阶段 1:chat completion)

### `apps/server/instrumentation.ts`

- `langfuseEnabled = !!LANGFUSE_PUBLIC_KEY && !!LANGFUSE_SECRET_KEY`,与 `otlpEndpoint` **独立门控**。两者任一开启就启动 NodeSDK;只配一个不会让另一个静默 no-op。
- OTLP 的 trace exporter / metric reader / log processor 仅在 `otlpEndpoint` 存在时挂(条件 spread),NodeSDK 的 `spanProcessors` 数组只装 OTLP 的 `BatchSpanProcessor`。
- Langfuse 起独立 `NodeTracerProvider`(`langfuseProvider`),其上挂 `LangfuseSpanProcessor`(`exportMode: 'batched'`),再 `setLangfuseTracerProvider(langfuseProvider)` 让 `startObservation` 路由到它。
- `shouldExportSpan`:只放行带 `langfuse.*` 属性的 span(SDK 创建的 generation 都带 `langfuse.observation.type` 等)。这是防御性兜底,独立 provider 本来就只见自己的 span。
- 独立 provider 显式 `AlwaysOnSampler`:调低 `OTEL_TRACES_SAMPLING_RATIO` 给 Grafana 降量,不会丢 Langfuse generation,逐条 prompt 捕获保持完整。
- SIGTERM:`Promise.all([sdk.shutdown(), langfuseProvider?.shutdown()])`。`sdk.shutdown()` 不会 drain 独立 provider,必须显式 shutdown,否则最后一批 generation 在部署重启时丢失。

### `apps/server/src/routes/openai/v1/index.ts`(`handleCompletion`)

`langfuseEnabled` 门控(只读一次,非每请求):读 `process.env.LANGFUSE_TRACING_ACTIVE`,这个 sentinel 由 instrumentation.ts 在 `setLangfuseTracerProvider()` 成功**之后**才置 `'1'`。**禁用时不创建 generation** —— 这很关键:Langfuse 关闭时没调 `setLangfuseTracerProvider`,`startObservation` 会 fallback 到全局 provider,正文就会漏进 OTLP/Grafana。gate 绑定真实 provider 状态(单一真相在 instrumentation.ts),而不是在 route 里独立再判一次 key —— 避免将来改 instrumentation 的开关条件时两处 desync 导致正文漏到错误后端。

output(给 eval 用,要可读):非流式 = `responseBody`;流式 = 从 SSE delta 解析出的 assistant 正文(`extractSseDeltaText` 逐行解析 `choices[0].delta.content`,**不是**原始 `data: {...}` 框架),硬上界 1M 字符防止长输出 × 高并发占内存。

generation 形态:

- `startObservation('chat.completion', { input: body.messages, model: requestModel, metadata: { requestId, stream } }, { asType: 'generation' })`。
- 身份:`generation.otelSpan.setAttribute('langfuse.user.id', user.id)`;有 `x-airi-session-id` header 时再 set `langfuse.session.id`。这两个 compat 属性被平台提升为 trace 级,支撑按 user/session 归因。
- output:非流式 = `responseBody`;流式 = 后台累积的 assistant 正文。
- usageDetails:`{ input: promptTokens, output: completionTokens }`,复用计费已提取的 usage。
- metadata:保留 `{ requestId, stream }`,完成时补 `{ fluxConsumed }`。
- 生命周期:5 个退出分支各 `generation?.update(...)` + `generation?.end()` 恰好一次 —— router throw catch、`!response.ok`、流式 interrupted(finally)、流式 completed(finally)、非流式。错误分支标 `level: 'ERROR'` + `statusMessage`。流式 generation 在后台 async IIFE 的 finally 里结束,跟 `span.end()` 对齐,不在 response 返回时提前结束。

### `apps/server/src/routes/openai/v1/index.ts`(`handleTTS`)

- `startTtsGeneration({ input: { text, voice, speed, responseFormat }, model, requestId, userId, sessionId })` 创建 `tts.speech` generation。
- 不缓冲二进制 audio 到 Langfuse；成功 output 只记录 `{ contentType }`。
- usageDetails 使用 `{ input: inputChars }`，flux 作为 metadata 记录。
- router throw、上游非 2xx、billing/Redis failure 都会 `fail(...)` 并 end；成功在 `ttsMeter.accumulate()` 后 `succeed(...)`。

### `packages/stage-ui/src/libs/providers/providers/official/shared.ts`

- `withCredentials()` 除 `Authorization` 外，会在 Pinia 已初始化且有 active chat session 时注入 `x-airi-session-id`。
- stage-web / stage-tamagotchi / stage-pocket 复用 official provider 的请求都会带同一个会话 id；匿名或非 chat 上下文没有 active session 时自动退化为 user-only trace。

### `apps/server/src/libs/env.ts`

未改 —— LANGFUSE_* 故意不进 valibot schema(见「部署形态与脱敏决策」)。

## 验证

见 [`verifications/langfuse-tracing.md`](./verifications/langfuse-tracing.md)。Langfuse Cloud(project airi)回读到 `chat.completion` GENERATION,完整带 input(messages)/ output / model / usageDetails / userId / sessionId / metadata,trace 与 generation 共享 traceId。当前代码路径的 typecheck、targeted Vitest、eslint 通过。

## 待办(后续阶段)

- **staging 真实端到端**:`.env.local` 的 DB/Redis/OTLP 全指生产,本地起真实 server 会连生产。在 staging(指向非生产)起 server 发一次真实 chat 请求补全 HTTP 路径端到端。
- **model 定价匹配**:网关 model 是解析后的路由名,能否命中 Langfuse 定价表算 USD 待实测;命不中就配自定义定价或传 `costDetails`。flux 已放 metadata。
