# Workers And Runtime

## 进程角色

统一入口在 `src/bin/run.ts`：

- `api`
  - 启动 Hono HTTP + WebSocket 服务
- `cache-sync-consumer`
  - 消费 Redis Streams 中的计费事件，回写 Flux Redis 缓存
- `outbox-dispatcher`
  - 从 Postgres `outbox_events` 拉取未发布事件，投递到 Redis Streams

这三个角色已经是当前服务端部署拆分的基本单位。

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

## Outbox Dispatcher

实现位置：

- 入口：`src/bin/run-outbox-dispatcher.ts`
- 服务：`src/services/outbox-dispatcher.ts`
- 存储：`src/services/outbox-service.ts`
- MQ：`src/services/billing-mq.ts`

工作流程：

1. 从 `outbox_events` claim 一批未发布事件
2. 逐条发布到 Redis Stream
3. 发布成功后写 `publishedAt` 和 `streamMessageId`
4. 失败则释放 claim，等待下一轮处理

关键机制：

- 支持多实例并发 dispatcher
- claim 通过 TTL 失效，避免 worker 崩掉后永久锁死

相关环境变量：

- `OUTBOX_DISPATCHER_NAME`
- `OUTBOX_DISPATCHER_BATCH_SIZE`
- `OUTBOX_DISPATCHER_CLAIM_TTL_MS`
- `OUTBOX_DISPATCHER_POLL_MS`
- `BILLING_EVENTS_STREAM`

## Billing Events Consumer

实现位置：

- 入口：`src/bin/run-billing-events-consumer.ts`
- worker：`src/services/billing-mq-worker.ts`
- stream adapter：`src/services/billing-mq.ts`

当前默认 handler：

- `handleCacheSyncMessage()`

它只处理：

- `flux.credited`
- `flux.debited`

并把 `payload.balanceAfter` 写回 Redis：

- key: `flux:<userId>`

这说明当前 consumer 的目标非常克制：

- 不是账务真相处理器
- 不是分析流水处理器
- 只是缓存一致性补偿器

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
- `CLIENT_URL`
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

### Billing MQ / Outbox

- `BILLING_EVENTS_STREAM`
- `BILLING_EVENTS_CONSUMER_NAME`
- `BILLING_EVENTS_BATCH_SIZE`
- `BILLING_EVENTS_BLOCK_MS`
- `BILLING_EVENTS_MIN_IDLE_MS`
- `OUTBOX_DISPATCHER_NAME`
- `OUTBOX_DISPATCHER_BATCH_SIZE`
- `OUTBOX_DISPATCHER_CLAIM_TTL_MS`
- `OUTBOX_DISPATCHER_POLL_MS`

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
  - 先看 outbox，而不是直接在业务事务里调用 Redis Streams
- 改聊天同步
  - 先区分“持久化消息”与“广播通知”两层
- 改部署限流
  - 注意当前 `rate-limit.ts` 仍是单实例内存模型
