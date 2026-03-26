# Distributed Billing Plan

## 架构概述

`apps/server` 的计费链采用 **Postgres 作为唯一账本真相源**，Redis 仅作缓存。所有余额变化在 DB 事务内原子完成，同步写入 `flux_ledger`（流水）和 `outbox_events`（事件），通过 Redis Streams 分发给下游 consumer。

### 数据模型

- **`user_flux`** — 用户余额快照（单行/用户）
- **`flux_ledger`** — append-only 账务流水（type: credit/debit/initial, amount, balanceBefore, balanceAfter, requestId）
- **`outbox_events`** — 事件暂存，claim-lease 模式分发
- **`flux_audit_log`** — 用户可见的历史记录

### 同步链路（已实现）

每次余额变化的 DB 事务内：

1. `SELECT user_flux FOR UPDATE` 锁行
2. 更新 `user_flux.flux`
3. 写 `flux_ledger`
4. 写 `flux_audit_log`
5. 写 `outbox_events`
6. 事务提交后 best-effort 更新 Redis 缓存

### 异步链路（已实现）

- **outbox-dispatcher** — 轮询 `outbox_events`，发布到 Redis Stream `billing-events`
- **billing-consumer / cache-sync-consumer** — 消费 Stream 事件

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
- `outbox-dispatcher` — outbox → Redis Stream
- `billing-consumer` — 账务派生消费
- `cache-sync-consumer` — Redis 缓存同步

## 关键服务

### BillingService (`services/billing-service.ts`)

所有余额写操作的唯一入口：

- **`debitFlux()`** — 扣费（LLM 请求），事务内：锁行 → 检余额(402) → 更新余额 → ledger → audit → outbox(`flux.debited`)
- **`creditFlux()`** — 通用充值
- **`creditFluxFromStripeCheckout()`** — Stripe 一次性支付充值，幂等(`fluxCredited` 标志)
- **`creditFluxFromInvoice()`** — Stripe 订阅发票充值，幂等

### FluxService (`services/flux.ts`)

只负责读操作：

- **`getFlux()`** — Redis cache-aside 读（miss → DB → 填充 Redis），新用户自动初始化 + 写 ledger(type=initial)
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
| 1. DB-first 账本 | ✅ 已完成 | `flux_ledger` 表，`SELECT FOR UPDATE` 原子扣减，Redis 降为缓存 |
| 2. Outbox 事件 | ✅ 已完成 | 所有余额变化产生 outbox 事件，debit + credit 均覆盖 |
| 3. Redis Streams | ✅ 已完成 | MQ、dispatcher、worker 全部就位 |
| 4. Stripe 幂等 | ✅ 已完成 | checkout + invoice 事务内幂等检查 |
| 5. LLM 计费重构 | ⚠️ 部分 | 已有 `requestId` 和 DB 事务扣费，但仍是 post-response 模式 |
| 6. 部署拆分 | ✅ 已完成 | `bin/run.ts` 四角色启动 |

### 已删除

- `flux-write-back.ts` — 定时回写补偿机制，不再需要
- `FluxService.consumeFlux()` / `addFlux()` — 写操作已移至 BillingService

## 剩余 TODO

### Phase 5 完善：LLM 预扣模式

当前 LLM 扣费是 post-response（响应后扣费，失败静默吞掉），需改为预扣：

- [ ] **预扣模式** — 请求前 `debitFlux()`，余额不足直接 402 拒绝
- [ ] **结算差额** — 响应成功后按实际 token 用量调整（退还多扣或补扣不足）
- [ ] **消除静默失败** — 移除 `try/catch` 吞错，预扣失败 = 请求拒绝

### 其他

- [ ] `llm_request_log.settled` 字段可废弃（已无消费者）
- [ ] cache-sync consumer 适配 `flux.debited` 事件处理
- [ ] 考虑 `flux_ledger.requestId` 加 partial unique index 做应用层幂等

## 明确不做

- 不引入 Kafka / RabbitMQ
- 不拆成多个独立 repo
- 中期如角色扩容策略差异大，再考虑拆为 `server-api` / `server-workers` / `server-webhooks`
