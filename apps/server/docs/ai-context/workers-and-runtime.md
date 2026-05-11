# Workers And Runtime

## 进程角色

入口：`src/bin/run.ts`。

- `api`
  - 启动 Hono HTTP + WebSocket 服务
  - 没有任何"常驻后台 loop"，也没有"POST 触发的 fire-and-forget"。所有写路径都在请求线程里同步完成

不再有独立的 `worker` / `billing-consumer` 进程。原先的 Redis Stream billing event 链路、advisory-lock poller、admin flux grant batch 异步处理全部移除。

## API 角色

启动路径：

- `src/bin/run.ts`
- `runApiServer()`
- `createApp()`

启动时会做的事情：

- 解析 env
- 初始化日志
- 可选初始化 OTel
- 连接 Postgres / Redis
- 跑数据库迁移
- 装配服务
- 启动 HTTP server
- 注入 WebSocket

## Admin flux grant：同步执行

详见 [`admin-flux-grants.md`](admin-flux-grants.md)。简要：admin 调 `POST /api/admin/flux-grants`，路由 handler 在请求线程内顺序对每个 recipient 调 `BillingService.creditFlux`，HTTP 响应里直接返回每条的 outcome（granted / skipped / failed）。失败由 admin 看响应自行重发，可选 `idempotencyKey` 让重发安全。

## 失败 / 崩溃恢复

服务端没有需要恢复的"中间状态"。每次 `creditFlux` 自己是一个 DB 事务；要么写进 `flux_transaction` ledger 要么没写，没有第三态。`(user_id, request_id)` partial unique index 保证带 `idempotencyKey` 的重发不会双发。

## 环境变量分层

### 基础运行

- `HOST`
- `PORT`
- `API_SERVER_URL`
- `DATABASE_URL`
- `REDIS_URL`

### Auth

- `AUTH_GOOGLE_CLIENT_ID`
- `AUTH_GOOGLE_CLIENT_SECRET`
- `AUTH_GITHUB_CLIENT_ID`
- `AUTH_GITHUB_CLIENT_SECRET`

### Stripe

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### OTel

- `OTEL_SERVICE_NAMESPACE`
- `OTEL_SERVICE_NAME`
- `OTEL_TRACES_SAMPLING_RATIO`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `OTEL_DEBUG`

> NOTICE: `BILLING_EVENTS_*` 已全部移除。

## 聊天 WebSocket 运行时

`src/routes/chat-ws/index.ts` 是另一种独立运行时：

- 同实例连接保存在进程内 `Map`
- 跨实例 fan-out 通过 Redis Pub/Sub

这意味着：

- WS 广播不具备持久化和重放能力
- 真正补齐消息还是靠 `pullMessages`
- 广播只是为了降低拉取延迟，不代表存在旧式 `sync` 端点

如果要改 Redis key / channel 构造、Pub/Sub payload，先看 `redis-boundaries-and-pubsub.md`。

## OpenTelemetry

初始化在 `src/libs/otel.ts`。

启用条件：

- `OTEL_EXPORTER_OTLP_ENDPOINT` 存在

覆盖面：

- HTTP
- Auth
- Chat engagement
- Revenue
- LLM
- DB / Redis instrumentation

重要实现细节：

- `sdk.start()` 必须发生在 `metrics.getMeter()` 之前
- `/health` 会被 HTTP instrumentation 忽略

## 运行时修改建议

- **新增异步工作**：先问三遍"为什么不能在请求线程里同步做完"。绝大多数 admin / webhook / 短 batch 都可以；实在不行也优先 fire-and-forget per-request，而不是引入常驻 loop。
- **真的需要 idle-driven 的活**（清理过期 token、定时聚合等）：先评估是否值得。如果是，开 Postgres `pg_cron` 或外部 cron service 调专门的 internal API endpoint，比"进程内常驻 loop"更可观察、更易停。
- **改 Stripe / Flux 写路径**：看 `billing-architecture.md`，所有 ledger 写入都在事务内同步完成
- **改聊天同步**：先区分"持久化消息"与"广播通知"两层
- **改部署限流**：注意当前 `rate-limit.ts` 仍是单实例内存模型
