# Verification: Langfuse LLM-native tracing

## 场景

用户路径:客户端发 `POST /api/v1/openai/chat/completions` → 网关 `handleCompletion` 在处理时创建 Langfuse generation(input messages / output / model / token usage / userId / sessionId)→ 数据到达 Langfuse Cloud,可在逐条 prompt trace、eval、按用户/会话成本归因里查询。

## 为什么不用真实 server 起

`apps/server/.env.local` 的 `DATABASE_URL`(Neon)、`REDIS_URL`(Upstash)、`OTEL_EXPORTER_OTLP_ENDPOINT`(Grafana)全部指向**生产**实例。本地 `pnpm dev` 会连生产库并把 OTLP span 打到生产 Grafana,污染线上可观测性数据,也有触发真实计费的风险。因此用隔离 smoke 脚本复刻 `instrumentation.ts` + `handleCompletion` 的完全相同 wiring(独立 `NodeTracerProvider` + `LangfuseSpanProcessor` + `shouldExportSpan` langfuse.* 过滤 + `setLangfuseTracerProvider` + `startObservation(asType:'generation')` + `langfuse.user.id`/`langfuse.session.id` 属性),只验证 Langfuse 导出链路,不碰生产 DB/Redis/Grafana。生产路径的 generation 代码与 smoke 同形,typecheck 保证编译一致。

## 命令

```sh
# 1. 凭据有效性
curl -u "$LANGFUSE_PUBLIC_KEY:$LANGFUSE_SECRET_KEY" https://us.cloud.langfuse.com/api/public/projects
# 2. smoke 脚本复刻 wiring,发一条 chat.completion generation 后 forceFlush + shutdown
pnpm exec dotenvx run -f .env.local -- tsx <smoke>   # 临时脚本,验证后已删
# 3. 回读 Langfuse Cloud
curl -u "$PK:$SK" https://us.cloud.langfuse.com/api/public/traces?limit=20
curl -u "$PK:$SK" https://us.cloud.langfuse.com/api/public/observations?limit=20
```

类型 / 静态检查:

```sh
pnpm -F @proj-airi/server typecheck   # tsc --noEmit,0 错误
pnpm exec eslint apps/server/instrumentation.ts apps/server/src/routes/openai/v1/index.ts   # 0 warning/error
```

## 预期

- 凭据 API 返回 200。
- smoke 无报错,forceFlush + shutdown 成功。
- 回读 traces 出现 `name=chat.completion`,带 `userId` / `sessionId`(证明 `langfuse.user.id`/`langfuse.session.id` 提升为 trace 级归因)。
- 回读 observations 出现 `type=GENERATION`,带 `model` / `input`(messages 数组)/ `output` / `usageDetails`。

## 实际

- typecheck 0 错误;eslint 0 输出。
- 凭据:`status=200`,project `name=Airi` id `cmajdtoua06h2ad07yp1qf1nk`。
- 直接 ingestion API POST(文档化 batch 格式)返回 `status=207`,两 event 均 `201 created` —— 写入端点 + 凭据 + 格式全部正确。
- 回读(摄取 lag 约 90s 后,新项目首批较慢):

```
TRACE name=chat.completion user=smoke-user session=smoke-session   (× 多条 smoke run)
TRACE name=direct-ingest-test user=direct-user
OBS_COUNT=20
OBS name=chat.completion type=GENERATION model=smoke-test-model
  in=[{"role":"user","content":"ping from airi langfuse smoke (...)"}]
  out="pong"
  usage={"input":5,"output":1}
```

input messages / output / model / usageDetails / userId / sessionId 全部落到 Langfuse Cloud。`shouldExportSpan` langfuse.* 过滤未拒绝 generation span(smoke 用的就是该过滤,trace 正常出现)。

## 已知限制

- 未经真实 `handleCompletion` HTTP 请求验证(需生产隔离环境 + auth token + 配置好的 LLM_ROUTER_CONFIG 模型)。smoke 复刻同一 SDK 调用形态 + typecheck 编译一致 + lint 通过,作为当前可得的最强 fresh evidence。下一次在 staging(DB/Redis/Grafana 指向非生产)起真实 server 发一次 chat 请求即可补全端到端。

## codex review 后复测

codex 独立 review 报 8 项,修了 4 项(详见下方代码改动)。修复后复测:

- typecheck `tsc --noEmit` 0 错误;eslint(instrumentation.ts + openai/v1/index.ts)0 输出。
- SSE 解析纯逻辑单测(`extractSseDeltaText` + chunk 边界组装)4 case 全 PASS:简单多 delta、内容跨 chunk 断行、usage-only/空行忽略、malformed line 降级。
- 带 `AlwaysOnSampler`(F4 修复)的 live smoke 再次回读成功:Langfuse Cloud observation `model=verify-model`,`input=[{role:user,content:...}]`,`output="Hello"`,`usageDetails={input:5,output:2,total:6}` —— 确认 provider sampler 改动没破坏导出。

修复项:
- F4(sampler,真 bug):generation 的 parent 是 `@hono/otel` HTTP span,默认 ParentBased sampler 会让 `OTEL_TRACES_SAMPLING_RATIO<1` 时连带丢 Langfuse generation。改 langfuseProvider 显式 `AlwaysOnSampler`,Langfuse 捕获与 Grafana head-sampling 解耦。
- F6(非流式 generation 泄漏,真 bug):`response.json()` 解析失败时 span + generation 都不 end。加 try/catch 在抛出前关闭两者。
- F7(流式 output 是原始 SSE,体验):改 `extractSseDeltaText` 逐行解析出 assistant 正文,不再存 `data:` 框架。
- F9(流式 fullText 内存,真 bug):加 1M 上界；后续复审发现单个超大 delta 仍会越界,已改成按剩余容量 slice 的硬上限。
- F5(gate)：codex 判 non-issue，仍主动改成 instrumentation 置的 `LANGFUSE_TRACING_ACTIVE` sentinel(单一真相,防 enable 条件 desync 漏 PII)。
- 拒绝/记录:F1(隔离)/F3(shutdown)/F5/F7-gate codex 判 non-issue,确认;F2(traceId 关联)经核对实为「继承 Hono span traceId,OTLP 开启时可关联」,已修正注释与文档(此前误述为不关联);F10(input base64 无 cap)记为已知限制,低优先。

## 抽象重构后复测(llm-tracing 深模块)

把 Langfuse 逻辑从 transport 层 `openai/v1/index.ts` 抽到 `services/domain/llm-tracing/index.ts`(gate / SDK / SSE 解析 / 生命周期全部隐藏,route 只调 `startChatGeneration` → `appendStreamChunk` / `succeed` / `fail`)。复测:

- `pnpm -F @proj-airi/server typecheck`:0 错误。
- `pnpm exec vitest run .../llm-tracing/index.test.ts`:**Tests 9 passed (9)** —— disabled no-op、创建参数、session 有无、非流式 output、流式跨 chunk 组装、malformed SSE 忽略、fail ERROR、幂等 end。纯逻辑单测,按 Iron Law 即该模块的 fresh evidence。
- `pnpm exec eslint`(instrumentation + route + 模块 + 测试):0 输出。
- 端到端行为不变:route 改的只是调用形态,generation 字段映射与之前 smoke 回读到的一致(input/output/model/usageDetails/userId/sessionId)。

## 收尾复测(TTS + client session + hard cap)

补齐:

- `startTtsGeneration` + `/api/v1/audio/speech` route:记录 `tts.speech` generation,不缓冲二进制 audio,只记录 input text/voice/speed/format、contentType、input char usage、flux metadata。
- `packages/stage-ui/src/libs/providers/providers/official/shared.ts`:official provider fetch 自动带 `x-airi-session-id`(Pinia active chat session 存在时)。
- 流式 output hard cap:单个超大 SSE delta 也只追加剩余容量。

复测:

- `pnpm -F @proj-airi/server typecheck`:0 错误。
- `pnpm exec vitest run apps/server/src/services/domain/llm-tracing/index.test.ts apps/server/src/services/domain/llm-router/tests/router.test.ts apps/server/src/routes/openai/v1/route.test.ts`:3 files / 77 tests passed。
- `pnpm exec eslint apps/server/instrumentation.ts apps/server/src/routes/openai/v1/index.ts apps/server/src/services/domain/llm-tracing/index.ts apps/server/src/services/domain/llm-tracing/index.test.ts apps/server/src/services/domain/llm-router/router.ts apps/server/src/services/domain/llm-router/tests/router.test.ts packages/stage-ui/src/libs/providers/providers/official/shared.ts`:0 输出。
- `pnpm -F @proj-airi/stage-ui typecheck`:0 错误。

Langfuse 隔离 live smoke(覆盖 `NODE_ENV=codex-langfuse-smoke`, `OTEL_SERVICE_NAME=server-codex-langfuse-smoke`, `SERVER_INSTANCE_ID=codex-langfuse-smoke`, 且清空 `OTEL_EXPORTER_OTLP_ENDPOINT`/`OTEL_EXPORTER_OTLP_HEADERS`)已补跑,只复用 `.env.local` 的 Langfuse keys,不连 DB/Redis/Grafana OTLP:

- 写入命令:`pnpm exec dotenvx run -f .env.local --ignore=MISSING_ENV_FILE -- tsx --import ./instrumentation.ts scripts/langfuse-smoke.ts`
- 启动日志确认:`OpenTelemetry initialized — OTLP: off, Langfuse: https://us.cloud.langfuse.com`
- run id:`codex-langfuse-1780140569403`
- 回读 traces:
  - `tts.speech`, `userId=codex-langfuse-smoke-user`, `sessionId=codex-langfuse-1780140569403-session`, `metadata.requestId=codex-langfuse-1780140569403-tts`
  - `chat.completion`, `userId=codex-langfuse-smoke-user`, `sessionId=codex-langfuse-1780140569403-session`, `metadata.requestId=codex-langfuse-1780140569403-chat`
- 回读 observations:
  - `tts.speech`, `type=GENERATION`, `model=codex-smoke-tts-model`, `usageDetails={input:38,total:38}`, `output.contentType=audio/mpeg`
  - `chat.completion`, `type=GENERATION`, `model=codex-smoke-chat-model`, `usageDetails={input:4,output:5,total:9}`, `output="hello from chat smoke"`
- 两条回读记录的 `resourceAttributes` 均为 `service.name=server-codex-langfuse-smoke`, `service.namespace=airi`, `service.instance.id=codex-langfuse-smoke`, `deployment.environment=codex-langfuse-smoke`。

仍未做真实 server HTTP E2E:本地 `.env.local` 里的 DB/Redis 仍指向生产实例。当前已验证的是同一 `instrumentation.ts` + `llm-tracing` generation SDK 写入链路;真实 HTTP 请求还需要 staging DB/Redis/router/auth token 后补跑。

## 模型归因修正(chat-auto alias → 上游模型)

Langfuse Model costs 页面曾出现 `chat-auto`。这不是 Langfuse pricing 配置问题,而是 route 在调用 `llmRouter.route(...)` 前就用 client/request model 创建 `chat.completion` generation;如果 router config 通过 `upstream.overrideModel` 把 `chat-auto` 改写成真实上游模型,Langfuse 仍记录 alias。

修正:

- `LlmRouteContext.upstreamModel`:router 成功命中上游时写入实际发给上游的 `overrideModel ?? modelName`。
- `handleCompletion`:router 返回后再创建 Langfuse generation,`model` 使用 `routeCtx.upstreamModel ?? requestModel`。
- route 里的 billing/request-log/本地 OTel metric 仍保持原有 `requestModel` 语义;本次只修 Langfuse model-cost 归因。

复测:

- `apps/server/src/services/domain/llm-router/tests/router.test.ts`:覆盖 `upstream.overrideModel` 同时写入 `ctx.upstreamModel`。
- `apps/server/src/routes/openai/v1/route.test.ts`:覆盖请求 `model=chat-auto`、router context 返回 `openai/gpt-4o-mini` 时,`startChatGeneration({ model })` 使用 `openai/gpt-4o-mini`。
- `pnpm exec vitest run apps/server/src/services/domain/llm-router/tests/router.test.ts apps/server/src/routes/openai/v1/route.test.ts apps/server/src/services/domain/llm-tracing/index.test.ts`:3 files / 78 tests passed。
- `pnpm -F @proj-airi/server typecheck`:0 错误。
- `pnpm exec eslint apps/server/src/routes/openai/v1/index.ts apps/server/src/routes/openai/v1/route.test.ts apps/server/src/services/domain/llm-router/router.ts apps/server/src/services/domain/llm-router/types.ts apps/server/src/services/domain/llm-router/tests/router.test.ts`:0 输出。

## 环境

- base commit: `dc1037f34`(本次改动未提交,工作树状态)
- Langfuse: us.cloud.langfuse.com,project Airi
- SDK: `@langfuse/tracing` + `@langfuse/otel` 5.4.0,`@opentelemetry/api` 1.9.1
- 最后验证日期:2026-05-30
