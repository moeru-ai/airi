# Admin Flux Grant Batch

- **Date**: 2026-05-07 (initial), 2026-05-08 (rename + docs move)
- **Status**: Implemented (v1) — pending end-to-end live verification
- **Surface**: `apps/server`

> **Naming note**: an earlier draft used the table name `campaign`. Renamed to `flux_grant_batch` before merge because `campaign` is a generic marketing term that overpromises (suggests support for coupons / discounts / referral rewards) while underdescribing the actual capability (batch FLUX grants only).

## 1. 背景

目前 `BillingService.creditFlux` 提供了"给单个 userId 加余额"的事务安全实现（[billing-service.ts:162](apps/server/src/services/billing/billing-service.ts#L162)），但没有任何上层入口（路由 / 脚本 / CLI）调用它。所有 promo / 客诉补偿 / 活动赠送类的余额发放，目前只能：

1. 直接写裸 SQL 修改 `user_flux` + `flux_transaction` + 手动失效 Redis（绕过 `BillingService`，违反 [`apps/server/CLAUDE.md`](apps/server/CLAUDE.md) "balance 写入只走 BillingService" 的架构约束）
2. 临时跑脚本，每次活动都要 ad-hoc

随着 FLUX 商业化推进，预计批量发放会成为常规运营动作（每月 1+ 次，每次 1k–10k 用户）。需要一个稳定、可观测、可重试的 admin 接口。

## 2. 目标 / 非目标

### 目标

- Dev 通过 admin API 给指定邮箱列表批量发放 FLUX
- 发放过程异步执行，可查询进度（待发 / 已发 / 跳过 / 失败 计数）
- 失败项可手动重试
- ledger 留下"活动赠送"语义标记（区别于 Stripe 充值、初始赠送）
- 创建前可 dry-run 预览（避免错 amount / 错人群）
- 通过 better-auth session + env allowlist 限制访问

### 非目标（v1）

- **回滚 / 反向操作**：罕见（年 0–2 次），用 ad-hoc SQL 处理；建固定接口 ROI 不成立
- **email → userId 解析以外的输入解析**：不支持 CSV 上传、不支持电话号码、不支持用户分群条件
- **运营自助 UI**：dashboard 提供只读查看 + 可以发起 API 调用，但不是为非技术用户设计
- **完整 RBAC role 系统**：env-var allowlist 够用，未来加 role 列再升级
- **细粒度 amount 上限 / 审批流**：dev 自律，必要时加 daily 总额限制即可
- **优惠码 / 折扣券 / 邀请奖励等其它优惠形式**：本 schema **不**包含 code 字段、`max_redemptions`、用户行为触发器等机制；未来要做这些功能是新的 schema（`coupon` / `referral_reward`），不在本 batch 表上加列

## 3. 数据模型

### 3.1 新增表

#### `flux_grant_batch`

```ts
export const fluxGrantBatch = pgTable('flux_grant_batch', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull(), // 操作者填写，e.g. "Spring 2026 Promo"
  type: text('type').notNull(), // 'promo'（v1 只支持这一种）
  amount: bigint('amount', { mode: 'number' }).notNull(), // 每人发多少 FLUX
  description: text('description'), // 写到每条 flux_transaction.description
  status: text('status').notNull(), // 'created' | 'running' | 'completed' | 'failed_partial'
  createdByUserId: text('created_by_user_id').notNull(), // 操作者 userId（来自 session）
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'), // worker 第一次拣起 recipient 的时间
  completedAt: timestamp('completed_at'), // 所有 recipient 终态后的时间
}, table => [
  index('flux_grant_batch_status_idx').on(table.status),
  index('flux_grant_batch_created_by_idx').on(table.createdByUserId),
])
```

**status 状态机：**

```
draft (dryRun, 不入库) → 不存在
created → running → completed         (全部 granted)
created → running → failed_partial    (部分 failed/skipped 后无法继续)
```

`draft` 仅在 dryRun 响应中出现，不持久化。创建即 `created`，worker 首次拣起改 `running`。

#### `flux_grant_batch_recipient`

```ts
export const fluxGrantBatchRecipient = pgTable('flux_grant_batch_recipient', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  batchId: text('batch_id').notNull(), // FK 概念上指向 flux_grant_batch.id（不强制 FK 约束以避免级联删除）
  inputEmail: text('input_email').notNull(), // 操作者输入快照（审计用），保留原始大小写
  userId: text('user_id'), // 解析成功才有；NULL = email 没匹配上
  status: text('status').notNull(), // 'pending' | 'granted' | 'skipped' | 'failed'
  errorReason: text('error_reason'), // 'not_found' | 'user_deleted' | 'duplicate_in_input' | 'user_deleted_after_resolution' | DB error message
  fluxTransactionId: text('flux_transaction_id'), // granted 后回填，指向 flux_transaction.id
  attemptCount: integer('attempt_count').notNull().default(0),
  lastAttemptedAt: timestamp('last_attempted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('flux_grant_batch_recipient_batch_status_idx').on(table.batchId, table.status),
  index('flux_grant_batch_recipient_pending_idx').on(table.status, table.lastAttemptedAt).where(sql`status = 'pending'`),
  uniqueIndex('flux_grant_batch_recipient_batch_email_uniq').on(table.batchId, table.inputEmail),
])
```

**status 状态机：**

```
pending → granted   (creditFlux 成功)
pending → failed    (重试上限后)
pending → skipped   (worker 执行时 user_flux.deleted_at 已置位)
created at insert:
  - pending  (email 解析成功，userId 已写入)
  - skipped  (email 没匹配 / 用户已注销 / input 重复)
```

**`(batch_id, input_email)` 唯一索引**：同一 batch 内邮箱不会重复处理。
**Partial index `WHERE status = 'pending'`**：worker 轮询效率，避免扫整表。

### 3.2 现有表扩展

#### `flux_transaction.type` 枚举注释扩展

[flux-transaction.ts:13](apps/server/src/schemas/flux-transaction.ts#L13) 现在的注释：

```ts
type: text('type').notNull(), // 'credit' | 'debit' | 'initial'
```

改为：

```ts
type: text('type').notNull(), // 'credit' | 'debit' | 'initial' | 'promo'
```

注：`type` 是 `text` + 注释伪枚举，DB 不强制。新增值无需 migration，但需要 grep 现有代码里是否有硬编码 `type === 'credit'` 的地方。已知影响面：

- `BillingService.creditFlux` 写入处（[billing-service.ts:194](apps/server/src/services/billing/billing-service.ts#L194)）：硬编码 `'credit'`，需要扩展为可入参
- `BillingService.creditFluxFromStripeCheckout` ([billing-service.ts:285](apps/server/src/services/billing/billing-service.ts#L285))：仍写 `'credit'`，不动
- `BillingService.creditFluxFromInvoice` ([billing-service.ts:397](apps/server/src/services/billing/billing-service.ts#L397))：仍写 `'credit'`，不动
- `flux-transaction.ts` 的 `TransactionEntry.type` 类型 union 加 `'promo'`
- `getStats` 的 capacity 算法把 `'promo'` 计入 `inArray` 列表（promo 入账后用户进度条 capacity 应跟着涨）

**为什么不拆 `type` + `category` 两列**：当前 credit 子类型只会增加 1 个（promo）。等出现第 2 个不同来源（refund / staff_grant / beta）时再做这次重构。YAGNI。

### 3.3 `BillingService.creditFlux` 签名扩展

```ts
async creditFlux(input: {
  userId: string
  amount: number
  requestId?: string
  description: string
  source: string
  type?: 'credit' | 'promo'              // 新增，默认 'credit'
  auditMetadata?: Record<string, unknown>
}): Promise<{ balanceBefore: number, balanceAfter: number, fluxTransactionId: string }>
```

写入 ledger 时使用 `input.type ?? 'credit'`。其他逻辑（事务、Redis 失效、`flux.credited` 事件）不变。

返回值新增 `fluxTransactionId`：worker 拿到后回填到 `flux_grant_batch_recipient.flux_transaction_id`，为后续报表查询省掉一次 join。

## 4. API 表面

所有路由挂在 `/api/admin/*`，前置 `sessionMiddleware` + 新增 `adminGuard` middleware。

### 4.1 `POST /api/admin/flux-grant-batches`

创建 batch。支持 dry-run。

**Request:**

```http
POST /api/admin/flux-grant-batches?dryRun=false
Content-Type: application/json
Authorization: Bearer <session-jwt>

{
  "name": "Spring 2026 Promo",
  "amount": 200,
  "description": "Spring promo grant",
  "emails": ["alice@example.com", "bob@example.com"]
}
```

**Query params:**
- `dryRun` (`true` | `false`，默认 `false`)：true 时只解析、不写库、不调度

**Body 字段：**
- `name`: 1–100 chars
- `amount`: integer ≥ 1, ≤ `MAX_GRANT_AMOUNT_PER_USER`（默认 10000）
- `description`: 0–500 chars
- `emails`: array of email strings, length 1–10000

**Response (dryRun=true):**

```json
{
  "preview": {
    "totalEmails": 1000,
    "willGrant": 947,
    "willSkip": {
      "notFound": 30,
      "userDeleted": 18,
      "duplicateInInput": 5
    },
    "totalFluxToIssue": 189400,
    "estimatedDurationSec": 19,
    "samples": {
      "willGrant": ["alice@example.com", "bob@example.com", "..."],
      "notFound": ["typo@old-domain.com", "..."],
      "userDeleted": ["deleted-user@example.com", "..."]
    }
  }
}
```

`samples` 每类截取前 5 条用于人工 sanity check。

**Response (dryRun=false):**

```json
{
  "batch": {
    "id": "fgb_abc123",
    "name": "Spring 2026 Promo",
    "status": "created",
    "createdAt": "2026-05-07T10:00:00.000Z",
    "createdByUserId": "uid_xyz"
  },
  "summary": {
    "totalEmails": 1000,
    "pending": 947,
    "skipped": 53,
    "totalFluxToIssue": 189400
  }
}
```

写库后立刻返回 `202 Accepted`，worker 异步执行。

**Errors:**
- `400` validation 失败 / amount 超上限 / emails 列表为空
- `401` 未登录
- `403` 已登录但不在 admin 白名单

### 4.2 `GET /api/admin/flux-grant-batches/:id`

查询单个 batch 详情和进度。

**Response:**

```json
{
  "batch": {
    "id": "fgb_abc123",
    "name": "Spring 2026 Promo",
    "type": "promo",
    "amount": 200,
    "status": "running",
    "createdByUserId": "uid_xyz",
    "createdAt": "2026-05-07T10:00:00.000Z",
    "startedAt": "2026-05-07T10:00:05.000Z",
    "completedAt": null
  },
  "progress": {
    "total": 1000,
    "pending": 200,
    "granted": 745,
    "skipped": 53,
    "failed": 2
  },
  "recentFailures": [
    {
      "id": "fgr_xxx",
      "inputEmail": "alice@example.com",
      "userId": "uid_alice",
      "errorReason": "DB connection timeout",
      "attemptCount": 3,
      "lastAttemptedAt": "2026-05-07T10:05:00.000Z"
    }
  ]
}
```

`recentFailures` 限 20 条，最近优先。

### 4.3 `GET /api/admin/flux-grant-batches`

列表分页查询。

**Query:**
- `limit`: default 20, max 100
- `cursor`: opaque cursor (created_at + id, base64-encoded)
- `status`: optional filter

**Response:**

```json
{
  "batches": [{ "id": "...", "name": "...", "status": "...", ... }],
  "nextCursor": "..."
}
```

### 4.4 `POST /api/admin/flux-grant-batches/:id/retry`

把所有 `status='failed'` 的 recipient 改回 `status='pending'`，重置 `attemptCount` 和 `lastAttemptedAt`。worker 下次轮询自动拣起。如果 batch 已经在 `completed` / `failed_partial` 终态，会被改回 `running`。

**Response:**

```json
{ "retriedCount": 2 }
```

**Idempotency**: 重复调用安全（没有 failed 项时返回 `retriedCount: 0`）。

## 5. 调度与执行

### 5.1 Worker 部署

复用 `billing-consumer` Railway role（[`apps/server/CLAUDE.md`](apps/server/CLAUDE.md) "Railway role 越少越好维护"），不开新 role。

`billing-consumer` 当前只跑 Redis Stream 消费循环（`src/bin/run-billing-consumer.ts`）。增加一个并行的 flux grant batch 轮询循环，独立 lifecycle。两个 loop 共享 DB pool 和 Redis 连接，通过 `Promise.all` 一起跑，任一抛错 + abortSignal 共享让另一个也退出。

### 5.2 调度循环

```
loop forever:
  1. findActiveBatches: 找出有 pending recipient 的 batch（status ∈ {created, running}）

  2. 对每个 batch，开事务取 N 条:
     SELECT recipient.* FROM flux_grant_batch_recipient
     INNER JOIN flux_grant_batch ON ...
     WHERE batch_id = $1
       AND status = 'pending'
       AND (last_attempted_at IS NULL OR last_attempted_at + backoff <= NOW())
     ORDER BY created_at
     LIMIT N
     FOR UPDATE SKIP LOCKED       -- 多 worker 实例安全

  3. 对每条 recipient：
     a. re-check user_flux.deleted_at；如果已注销 → status='skipped' + reason='user_deleted_after_resolution'
     b. 否则调 BillingService.creditFlux({
          userId, amount: batch.amount, type: 'promo',
          requestId: `flux-grant-batch-${batchId}-${recipientId}`,
          description: batch.description ?? `Flux grant batch: ${batch.name}`,
          source: 'admin_promo',
          auditMetadata: { batchId, batchName, recipientId },
        })
     c. 成功 → status='granted', flux_transaction_id 回填, attempt_count++
     d. 失败 (attempt < MAX_ATTEMPTS) → 保持 pending，attempt_count++，下轮重试
     e. 失败 (attempt >= MAX_ATTEMPTS) → status='failed', error_reason=...

  4. 当 batch 没有 pending 项时 (finalizeBatchIfDone):
     UPDATE flux_grant_batch
       SET status = (any failed → 'failed_partial' else 'completed'),
           completed_at = NOW()

  5. throttle: 每发一条 sleep (1000 / throttlePerSec) ms
  6. 没拿到行时 sleep idleSleepMs (默认 1000)
```

**关键约束：**

- `FOR UPDATE SKIP LOCKED`：多 `billing-consumer` 实例同时跑安全，不会重复处理同一行
- `(user_id, request_id)` 唯一索引（[flux-transaction.ts:24-26](apps/server/src/schemas/flux-transaction.ts#L24-L26)）：crash-recovery 时即使 `creditFlux` 重入也不会双发
- `requestId = flux-grant-batch-${batchId}-${recipientId}`：用 recipientId 而非 userId，因为同一 user 在不同 batch 可以被发多次（不同 recipient 行 → 不同 requestId）

### 5.3 Backoff 策略

```
backoffMs(attempt) =
  attempt == 0 → 0s
  attempt == 1 → 30s
  attempt >= 2 → 5min
```

`MAX_ATTEMPTS = 3`，可调（worker option）。

### 5.4 节流

`throttlePerSec` 默认 50。理由：

- `creditFlux` 单条约 10–20ms（DB tx + redis + stream xadd）
- 50/s 已经足够 1k 用户在 20s 内完成
- 不抢线上 LLM 流量（`/api/v1/openai` 高峰能到 100+ req/s）

## 6. Auth

### 6.1 新增 env var

```ts
// libs/env.ts EnvSchema 中追加一个字段：
const EnvSchema = object({
  // ...其它字段...
  ADMIN_EMAILS: optional(string(), ''), // 逗号分隔邮箱，e.g. "alice@example.com,bob@example.com"
})
```

空字符串 = 没人是 admin（生产默认安全）。

**为什么用 email 不用 user.id：**
- 运营心智模型 = 邮箱，没人记得 `uid_aaa`
- env 配置可读性 + grep 可读性都更好
- 离职 / 接任时直接编辑邮箱列表，不需要先去 DB 查 userId

**为什么必须 `email_verified = true`：**
- 否则攻击者可以注册一个新账号，用 admin 邮箱（在 admin 注销 / 邮箱被释放后），不验证就尝试访问 admin 接口
- 走 OAuth (Google/GitHub) 的用户邮箱默认 verified；email/password 注册要求显式验证
- 这是零成本的额外防线，admin 用户都会有 verified 邮箱

### 6.2 `adminGuard` middleware

新建 `apps/server/src/middlewares/admin-guard.ts`：

```ts
export function adminGuard(env: Env): MiddlewareHandler<HonoEnv> {
  const adminEmails = parseAdminEmails(env.ADMIN_EMAILS)  // lowercase + trim
  return async (c, next) => {
    const user = c.get('user')
    if (!user) throw createUnauthorizedError(...)
    if (!user.emailVerified) throw createForbiddenError('Admin access requires a verified email')
    if (!adminEmails.has(user.email.toLowerCase())) throw createForbiddenError(...)
    await next()
  }
}
```

挂载顺序：`sessionMiddleware → authGuard → adminGuard → 路由`。

### 6.3 审计

每个 batch 写 `created_by_user_id`。每条 ledger 的 metadata 含 `{batchId, batchName, recipientId}`，`description` 字段写 batch 名或 description。事后查"谁在什么时候发了什么活动"通过：

```sql
SELECT b.id, b.name, b.amount,
       COUNT(r.id) FILTER (WHERE r.status='granted') AS granted_count,
       u.email AS operator_email
FROM flux_grant_batch b
JOIN "user" u ON u.id = b.created_by_user_id
LEFT JOIN flux_grant_batch_recipient r ON r.batch_id = b.id
GROUP BY b.id, u.email
ORDER BY b.created_at DESC;
```

未来加 RBAC 时 `adminGuard` 改成 `user.role === 'admin'`，env-var 删除，其他保持。

## 7. Failure Modes & Recovery

| 故障 | 检测 | 恢复 |
|---|---|---|
| worker crash | Railway 自动重启 | `pending` 行被新 worker 拣起，`(user_id, request_id)` 唯一索引防双发 |
| Postgres 短暂故障 | `creditFlux` 抛错 | recipient `attempt_count++`，30s 后重试 |
| Redis 短暂故障 | `creditFlux` 在 update cache 阶段抛错 | 同上。已在事务中提交的余额不会回滚 → 下次 retry 会被唯一索引挡住但 cache 仍未刷新。**已知缺口**：v1 接受这个边界，下次 `getFlux` 触发 cache miss 会自动从 DB 读最新值。 |
| batch 创建后立刻 worker 还没拣起就有用户注销 | worker 执行前 re-check `user_flux.deleted_at` | 标 `skipped` + `user_deleted_after_resolution` |
| 单个 recipient 永久失败（非瞬时） | `attempt >= 3` 后标 `failed` | 操作者 `POST /retry` 或人工查 `error_reason` |
| 整个 batch 卡死（worker 不工作） | `progress.pending > 0 && lastUpdated > 5min` | 报警 → 看 `billing-consumer` 日志；手动重启 |

## 8. Configuration

### 8.1 env vars (libs/env.ts)

```
ADMIN_USER_IDS                    逗号分隔 userId allowlist；空 = 没人是 admin
```

### 8.2 Worker options（可调，目前在代码里写死默认）

```
batchSize         默认 50    每次轮询拣多少 recipient
throttlePerSec    默认 50    每秒最多发多少条
maxAttempts       默认 3     超过即标 failed
idleSleepMs       默认 1000  无 work 时 sleep 多久
```

未来可以接 configKV 实时调整。

### 8.3 Route-level constants

```
MAX_GRANT_AMOUNT_PER_USER    10_000   单人 amount 上限
MAX_EMAILS_PER_BATCH         10_000   单 batch emails 列表上限
```

## 9. 测试策略

### 9.1 Unit / Integration

- `parseAdminUserIds` + `adminGuard` middleware：allowlist 命中 / 不命中 / 空 allowlist / 无 session
- `resolveEmails`：case insensitive、找不到、用户注销、input 重复、samples 截断、estimatedDurationSec 边界
- `createFluxGrantBatchService.create`：persist batch + recipient rows，pending/skipped 状态正确
- `createFluxGrantBatchService.preview`：dry-run 不写库
- `createFluxGrantBatchService.retryFailed`：failed → pending 重置，completed batch 改回 running，无 failed 时 idempotent
- `backoffMs`：3 个分支边界

### 9.2 文件位置

- `apps/server/src/middlewares/tests/admin-guard.test.ts`
- `apps/server/src/services/admin-flux-grant-batch/tests/flux-grant-batch-service.test.ts`
- `apps/server/src/services/admin-flux-grant-batch/tests/flux-grant-batch-worker.test.ts`

## 10. 实施顺序

1. **Schema + migration**：`flux_grant_batch` + `flux_grant_batch_recipient` 表，`drizzle-kit generate`
2. **`BillingService.creditFlux` 扩展**：加 `type` 入参，返回 `fluxTransactionId`
3. **Service 层**：`createFluxGrantBatchService`（创建、查询、retry）+ 共享 worker helper
4. **Worker**：`runFluxGrantBatchWorker` 轮询循环
5. **Middleware**：`adminGuard` + `parseAdminUserIds`
6. **Routes**：`/api/admin/flux-grant-batches/*`
7. **Worker 接入**：在 `src/bin/run-billing-consumer.ts` 用 `Promise.all` 并行启动
8. **配置**：env var
9. **Verification**：`docs/ai/context/verifications/admin-flux-grant-batch.md`（按 CLAUDE.md verification 格式手动跑一次端到端）

## 11. 已知风险 / Open Questions

- **Redis cache 失效缺口**：worker 在 DB 事务 commit 后、cache update 前 crash → 下次 `getFlux` cache miss 触发自动修复。能接受。
- **`type='promo'` 软枚举**：DB 不强制；下游若有人写 `type IN ('credit', 'initial')` 没改的话会漏掉 promo 记录。实施时已 grep 全量过一遍（命中 `flux-transaction.ts:60` 的 capacity 计算，已修复）。
- **跨 batch 同 user 多次发**：允许（不同 recipientId → 不同 requestId）。同一 batch 内通过 `(batch_id, input_email)` 唯一索引防多发。
- **没有 daily total cap**：理论上 dev 可以一次发 10k × 10000 FLUX = 100M FLUX。当前没硬限。靠 dry-run + code review。
- **dashboard 联调**：本设计假设 dashboard 后续会接入。spec 里只规范 API；UI 设计不在范围内。

## 12. 参考

- [`apps/server/CLAUDE.md`](apps/server/CLAUDE.md) — 服务架构总览
- [`apps/server/docs/ai-context/billing-architecture.md`](apps/server/docs/ai-context/billing-architecture.md) — Flux/Stripe/outbox/Streams
- [`billing-service.ts`](apps/server/src/services/billing/billing-service.ts) — 现有 `creditFlux` 实现
- [`flux-transaction.ts`](apps/server/src/schemas/flux-transaction.ts) — ledger schema
- [`flux.ts`](apps/server/src/schemas/flux.ts) — `user_flux` schema
- [`redis-keys.ts`](apps/server/src/utils/redis-keys.ts) — Redis 键规范
