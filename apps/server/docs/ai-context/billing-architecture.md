# Billing Architecture

## 架构概述

`apps/server` 的计费链：**Postgres 是唯一账本真相源，所有余额写操作（debit / credit）和 ledger 行写入都在同一个 DB 事务里完成**。Redis 只承担余额读缓存。不再使用 Redis Stream / 后台 consumer 处理计费副作用。

### 数据模型

- **`user_flux`** — 用户余额快照（单行/用户）
- **`flux_transaction`** — append-only 账务流水（type: credit / debit / initial / promo, amount, balanceBefore, balanceAfter, requestId, metadata）
  - partial unique index `(userId, requestId) WHERE requestId IS NOT NULL`，DB 层幂等防重
- **`llm_request_log`** — 每个 LLM/TTS 请求的可观测记录（model / status / duration / fluxConsumed / token 用量）

### debitFlux 链路

`BillingService.consumeFluxForLLM()` 调用 `debitFlux()`，单个事务内：

1. 若有 `requestId`，先查 `flux_transaction` 是否已存在同 `(userId, requestId)` 行 → 命中则直接返回历史结果，不再扣费、不写新行（幂等回放）
2. `SELECT user_flux FOR UPDATE` 锁行
3. 检查余额（不足返回 402）
4. 更新 `user_flux.flux`
5. `INSERT INTO flux_transaction (...)`，把扣费金额、token 用量、source 写进 metadata
6. 事务提交后 best-effort `redis.set` 更新 Flux 余额缓存（失败仅 warn 日志）

### credit 链路

`creditFlux()` / `creditFluxFromStripeCheckout()` / `creditFluxFromInvoice()` 全部在事务内同步：

- claim 行（Stripe 路径）/ 幂等查 `flux_transaction`（admin 路径）
- 锁 `user_flux` 行 → 加额 → 更新
- 写 `flux_transaction`
- 事务提交后 `redis.set` 更新缓存

Stripe 路径靠 `stripe_checkout_session.fluxCredited` / `stripe_invoice.fluxCredited` 标志做对象级幂等；admin 路径靠 `(userId, requestId)` 唯一索引做幂等。

### LLM 请求日志

OpenAI route (`routes/openai/v1/index.ts`) 在 `consumeFluxForLLM` 完成后调用 `requestLogService.logRequest(...)` 同步写 `llm_request_log`。失败被记为 warn 日志，不阻断已经返回给用户的响应（流式响应已发出，错误兜不回来；非流式情况下 debit 已扣，request log 丢失也只是观测层面的损失）。

`llm_request_log` 没有 FK，没有二级索引，单纯追加；写入成本可以忽略。

### 进程角色

只有 `api` 一个 role（`src/bin/run.ts`），且没有任何"常驻后台 loop"或"fire-and-forget 异步任务"。所有写路径（包括 admin flux grant）都在请求线程内完成；多实例安全靠 `(userId, requestId)` 幂等索引。详见 [`workers-and-runtime.md`](workers-and-runtime.md)。

### Stripe 定价

Flux 充值定价完全由 Stripe Product/Price 管理，详见 [stripe-pricing.md](stripe-pricing.md)。

### Sub-Flux 计量服务（债务账本）

TTS 字符、STT 秒等单价 < 1 Flux 的服务通过 `FluxMeter` 累计零头，跨阈值才下扣，避免短请求被向上取整为 1 Flux。详见 [flux-meter.md](flux-meter.md)。

## 关键服务

### BillingService (`services/billing/billing-service.ts`)

所有余额写操作的唯一入口：

- **`consumeFluxForLLM()`** — LLM 请求扣费包装；事务内 `lock → check → update → insert ledger`，提交后刷 Redis 缓存；带 `requestId` 时支持幂等回放
- **`creditFlux()`** — 通用充值（admin promo / 普通 credit）；幂等
- **`creditFluxFromStripeCheckout()`** — Stripe 一次性支付充值，按 session 幂等
- **`creditFluxFromInvoice()`** — Stripe 订阅发票充值，按 invoice 幂等

### FluxService (`services/flux.ts`)

只负责读操作：

- **`getFlux()`** — Redis cache-aside 读（miss → DB → 填充 Redis），新用户自动初始化
- **`updateStripeCustomerId()`**

### Redis 职责边界

Redis **不是**余额真相源，仅用于：

- `getFlux()` 读缓存（丢失无影响）
- 配置 KV
- WebSocket 广播

不再使用 Redis Streams 做计费链路。

## 实现状态

| Phase | 状态 | 关键点 |
|-------|------|--------|
| 1. DB-first 账本 | ✅ | `flux_transaction` 表，`SELECT FOR UPDATE` 原子扣减，Redis 降为缓存 |
| 2. 同步事务 ledger 写入 | ✅ | debit / credit 在单一事务内同时改余额和写 ledger，不再有 stream consumer |
| 3. Stripe 幂等 | ✅ | checkout + invoice 事务内幂等检查 |
| 4. LLM 计费优化 | ⚠️ | 已有 `requestId` 和 DB 事务扣费，待加 tiktoken fallback |
| 5. 单进程部署 | ✅ | 只剩 `api` role；admin flux grant 在 POST 请求线程内同步执行，没有后台 loop |
| 6. 幂等防重 | ✅ | `flux_transaction` partial unique index on `(userId, requestId)` + 事务内回放命中检查 |

### 已删除

- `flux-write-back.ts` — 定时回写补偿机制
- `FluxService.consumeFlux()` / `addFlux()` — 写操作集中到 BillingService
- `llm_request_log.settled` — 无消费者
- `outbox_events` 表及 outbox-dispatcher 进程
- `cache-sync-consumer` 进程角色
- **Redis Stream `billing-events` + `worker` role + `billing-consumer-handler`** — 异步副作用全部回收到事务内同步执行；不再有“事务提交了但 XADD 失败 → ledger 丢行”的窗口
- 相关 env：`BILLING_EVENTS_STREAM` / `BILLING_EVENTS_CONSUMER_NAME` / `BILLING_EVENTS_BATCH_SIZE` / `BILLING_EVENTS_BLOCK_MS` / `BILLING_EVENTS_MIN_IDLE_MS`

## 剩余 TODO

### LLM 计费精度

- [ ] **tiktoken fallback** — gateway 未返回 usage 时用 tiktoken 从 request messages + response body 自算 token 数
- [x] **消除静默失败** — non-streaming: debit 失败直接抛错阻断响应；streaming: 已发送无法撤回，改为 error 级别日志 + 记录 requestId 便于追查

## 明确不做

- 不引入 Kafka / RabbitMQ
- 不拆成多个独立 repo
- 不做预扣模式（无法准确估算 LLM 响应 token 数）
- 不再为“异步副作用”单独拉一个 worker 进程；事务内同步搞定就够了。如果以后真有阻塞型耗时副作用，单独评估时再说
