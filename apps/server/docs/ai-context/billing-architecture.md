# Distributed Billing Plan

## 架构概述

`apps/server` 的计费链采用 **Postgres 作为唯一账本真相源**，Redis 仅作缓存。余额变化路径分两类：`debitFlux` 在 DB 事务内只做 `UPDATE user_flux`，transaction/请求日志通过 Redis Stream 异步写入；credit 方法仍在事务内同步写入 transaction log。

### 数据模型

- **`user_flux`** — 用户余额快照（单行/用户）
- **`flux_transaction`** — append-only 账务流水（type: credit/debit/initial, amount, balanceBefore, balanceAfter, requestId）
  - 含 partial unique index `(userId, requestId) WHERE requestId IS NOT NULL`，DB 层幂等防重
- **`flux_transaction`** — 用户可见的历史记录

### debitFlux 链路（已实现）

DB 事务内仅做：

1. `SELECT user_flux FOR UPDATE` 锁行
2. 检查余额（不足返回 402）
3. 更新 `user_flux.flux`
4. 事务提交后 XADD Redis Stream（`billing-events`），携带扣费金额、余额快照、requestId 等
5. 事务提交后 best-effort `redis.set` 更新 Flux 余额缓存

transaction log / audit / llm_request_log 的写入均由 **billing-consumer** 异步完成。

### credit 方法链路（已实现）

credit 方法（`creditFlux` / `creditFluxFromStripeCheckout` / `creditFluxFromInvoice`）仍在 DB 事务内同步写入 `flux_transaction` 和 `flux_transaction`。

### 异步链路（已实现）

- **billing-consumer** — 消费 Redis Stream `billing-events`，将 transaction log、LLM 请求日志异步写入 DB

### 事件模型

Stream: `billing-events`

| Event Type | 触发场景 |
|---|---|
| `flux.debited` | LLM 请求扣费 |
| `flux.credited` | Stripe 充值、管理员授予 |
| `stripe.checkout.completed` | 一次性支付完成 |
| `llm.request.completed` | LLM 请求结束 |

### 进程角色

通过 `src/bin/run.ts` 分角色启动：

- `api` — HTTP 服务
- `billing-consumer` — 消费 Redis Stream，异步写入 transaction log、LLM 请求日志到 DB

## 关键服务

### BillingService (`services/billing-service.ts`)

所有余额写操作的唯一入口：

- **`debitFlux()`** — 扣费（LLM 请求），事务内：锁行 → 检余额(402) → 更新余额；事务提交后 XADD `flux.debited` 到 Redis Stream，transaction 由 billing-consumer 异步写入
- **`creditFlux()`** — 通用充值
- **`creditFluxFromStripeCheckout()`** — Stripe 一次性支付充值，幂等(`fluxCredited` 标志)
- **`creditFluxFromInvoice()`** — Stripe 订阅发票充值，幂等

### FluxService (`services/flux.ts`)

只负责读操作：

- **`getFlux()`** — Redis cache-aside 读（miss → DB → 填充 Redis），新用户自动初始化 + 写 transaction log(type=initial)
- **`updateStripeCustomerId()`**

### Redis 职责边界

Redis **不是**余额真相源，仅用于：

- `getFlux()` 读缓存（加速，丢失无影响）
- 配置 KV
- WebSocket 广播
- Redis Streams 事件总线

## 实现状态

| Phase | 状态 | 关键点 |
|-------|------|--------|
| 1. DB-first 账本 | ✅ 已完成 | `flux_transaction` 表，`SELECT FOR UPDATE` 原子扣减，Redis 降为缓存 |
| 2. Redis Streams 异步写入 | ✅ 已完成 | debitFlux 事务后 XADD，billing-consumer 异步写 transaction/请求日志 |
| 3. Stripe 幂等 | ✅ 已完成 | checkout + invoice 事务内幂等检查 |
| 4. LLM 计费优化 | ⚠️ 部分 | 已有 `requestId` 和 DB 事务扣费，待加 tiktoken fallback |
| 5. 部署拆分 | ✅ 已完成 | `bin/run.ts` 两角色启动（api / billing-consumer） |
| 6. 幂等防重 | ✅ 已完成 | `flux_transaction` partial unique index on `(userId, requestId)` |

### 已删除

- `flux-write-back.ts` — 定时回写补偿机制，不再需要
- `FluxService.consumeFlux()` / `addFlux()` — 写操作已移至 BillingService
- `llm_request_log.settled` — 无消费者，已移除
- `outbox_events` 表及 outbox-dispatcher 进程 — 已移除，统一由 billing-consumer 处理异步写入
- `cache-sync-consumer` 进程角色 — 已合并进 billing-consumer

## 剩余 TODO

### Phase 5 完善：LLM 计费精度

当前 LLM 扣费在 gateway 未返回 token 用量时使用固定 fallback rate，不精确：

- [ ] **tiktoken fallback** — gateway 未返回 usage 时，用 tiktoken 从 request messages + response body 自行计算 token 数
- [x] **消除静默失败** — non-streaming: debit 失败直接抛错阻断响应；streaming: 已发送无法撤回，改为 error 级别日志+记录 requestId 便于追查

## 明确不做

- 不引入 Kafka / RabbitMQ
- 不拆成多个独立 repo
- 不做预扣模式（无法准确估算 LLM 响应 token 数）
- 中期如角色扩容策略差异大，再考虑拆为 `server-api` / `server-workers` / `server-webhooks`
