# Workers And Runtime

## 进程角色

统一入口在 `src/bin/run.ts`：

- `api`
  - 启动 Hono HTTP + WebSocket 服务
- `billing-consumer`
  - 消费 Redis Stream `billing-events`，异步将 ledger、audit log、LLM 请求日志写入 DB

这两个角色是当前服务端部署拆分的基本单位。

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

## Billing Consumer

实现位置：

- 入口：`src/bin/run-billing-consumer.ts`
- worker：`src/services/billing-mq-worker.ts`
- stream adapter：`src/services/billing-mq.ts`

工作流程：

1. 以 consumer group 模式消费 Redis Stream `billing-events`
2. 根据事件类型分发处理：
   - `flux.debited` — 写 `flux_transaction` 和 `flux_transaction`
   - `llm.request.log` — 写 `llm_request_log`
3. 处理成功后 ACK；handler 抛错时不 ACK，消息保持 pending 等待重试

相关环境变量：

- `BILLING_EVENTS_STREAM`
- `BILLING_EVENTS_CONSUMER_NAME`
- `BILLING_EVENTS_BATCH_SIZE`
- `BILLING_EVENTS_BLOCK_MS`
- `BILLING_EVENTS_MIN_IDLE_MS`

## Redis Streams 语义

`billing-mq.ts` 把 Redis Streams 抽象成：

- `publish()`
- `ensureConsumerGroup()`
- `consume()`
- `claimIdleMessages()`
- `ack()`

这层约束了消息处理语义：

- 使用 consumer group
- 使用 pending reclaim
- handler 抛错时不 ack，消息保持 pending

因此新增新的 stream consumer 时，最安全的方式通常是复用这层，不要自己裸写 `XREADGROUP`。

## 聊天 WebSocket 运行时

`src/routes/chat-ws.ts` 还有一套独立于 Redis Streams 的运行时机制：

- 同实例连接保存在进程内 `Map`
- 跨实例 fan-out 通过 Redis Pub/Sub

这意味着：

- WS 广播不具备持久化和重放能力
- 真正补齐消息还是靠 `pullMessages`
- 广播只是为了降低拉取延迟，不代表存在旧式 `sync` 端点

如果要改 Redis key / channel 构造、Pub/Sub payload 或 Streams 边界，先看 `redis-boundaries-and-pubsub.md`。

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

### Billing MQ

- `BILLING_EVENTS_STREAM`
- `BILLING_EVENTS_CONSUMER_NAME`
- `BILLING_EVENTS_BATCH_SIZE`
- `BILLING_EVENTS_BLOCK_MS`
- `BILLING_EVENTS_MIN_IDLE_MS`

### OTel

- `OTEL_SERVICE_NAMESPACE`
- `OTEL_SERVICE_NAME`
- `OTEL_TRACES_SAMPLING_RATIO`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `OTEL_DEBUG`

## 运行时修改建议

如果你要改：

- 新增 worker
  - 先看 `run.ts` 的角色模型和 `billing-mq-worker.ts`
- 改事件分发
  - 先看 billing-consumer handler，在 `billing-mq-worker.ts` 中增加新的事件处理分支
- 改聊天同步
  - 先区分“持久化消息”与“广播通知”两层
- 改部署限流
  - 注意当前 `rate-limit.ts` 仍是单实例内存模型
