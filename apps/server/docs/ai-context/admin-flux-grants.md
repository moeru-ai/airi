# Admin Flux Grants

Admin 一次性给若干用户发 FLUX（Beta 致谢、补偿、运营赠送等）的接口。整个流程**单一同步 HTTP 调用**搞定，没有 batch 表、没有状态机、没有后台 loop。

## 1. 背景

旧设计是 `flux_grant_batch` + `flux_grant_batch_recipient` 两张表 + 状态机 + 异步处理 + retry 端点 + advisory-lock poller，~800 行代码。实际产品里 admin 发放频率"几周一次、几十个用户"，过度工程。简化为：

- 一个 `POST /api/admin/flux-grants` 接口
- 同步处理：resolve emails → 顺序调 `creditFlux` → 返回每条的 outcome
- 审计走 `flux_transaction` 表（`type='promo'`、`metadata.description` / `metadata.idempotencyKey`）
- 失败处理：admin 看响应里的 `failed[]`，自己再发一次（用 `idempotencyKey` 防止已成功的部分被双发）

## 2. 路由

`POST /api/admin/flux-grants?dryRun=true|false`

Auth：`authGuard` + `adminGuard`（`ADMIN_EMAILS` allowlist + 验证邮箱）。

Body：

```ts
{
  description: string,         // 1..500 chars; 写入 flux_transaction.metadata.description
  amount: number,              // 1..MAX_GRANT_AMOUNT_PER_USER (10_000), 单人发放数量
  emails: string[],            // 1..MAX_EMAILS_PER_GRANT (200) 个 email
  idempotencyKey?: string,     // 可选，最长 100 chars。提供后每个 recipient 的
                               // requestId = `flux-grant:${idempotencyKey}:${userId}`，
                               // 重发同 (key, recipients) 是 no-op；不提供则每次 grant
                               // 都会重发。
}
```

dry-run 响应：

```ts
{ preview: { totalEmails, willGrant, willSkip: { notFound, userDeleted, duplicateInInput }, totalFluxToIssue, samples } }
```

实发响应：

```ts
{
  summary: { totalEmails, willGrant, willSkip, totalFluxToIssue, samples },
  result: {
    granted: [{ email, userId, fluxTransactionId, balanceAfter }],
    skipped: [{ email, reason: 'duplicate_in_input' | 'not_found' | 'user_deleted' }],
    failed:  [{ email, userId, error }],          // creditFlux 抛错时进这里
  },
}
```

## 3. 处理流程（同步）

1. 路由层 valibot 校验 body
2. `service.resolveEmails(emails)`：
   - 输入小写化后 `IN (...)` 查 `user.email`（不能 wrap `LOWER()`，会 break unique index → seq scan）
   - 命中 user 后再查 `user_flux.deletedAt`
   - 重复输入按出现顺序首条留下，后续标 `duplicate_in_input`
3. 对每个 `status='pending'` 的 recipient 顺序调 `BillingService.creditFlux({ userId, amount, type: 'promo', requestId, description, source: 'admin_promo', auditMetadata })`
4. 抛错记到 `result.failed[]`，循环继续；成功记到 `result.granted[]`
5. HTTP 返回完整 `result`

没有 sleep / throttle —— 200 个 recipient × 20–50ms 单条 ≈ 4–10s，安心进 LB 30s 超时窗口。如果以后真的需要更大批量，先评估是否值得拆，再决定加 cap 还是引入异步。

## 4. 失败 / 恢复

| 故障 | 表现 | 恢复 |
|---|---|---|
| 单条 recipient `creditFlux` 抛错（DB blip 等） | 出现在 `result.failed[]` | admin 看响应，自己再发一次相同请求；如果用了 `idempotencyKey`，已 granted 的不会被双发，只重试 failed 的 |
| 整个请求超 LB 超时 | 客户端看到超时，部分 recipient 已扣账 | admin 用同 `idempotencyKey` 重发，已成功的直接幂等跳过 |
| Operator 输错邮箱 / 数量 | 先用 `?dryRun=true` 看 preview | 改完再去掉 dryRun |

## 5. 审计

- 每条成功 grant 在 `flux_transaction` 写一行（`type='promo'`、`metadata.description`、`metadata.issuedByUserId`、可选 `metadata.idempotencyKey`）
- 没有专门的 admin 报表；用 `/api/v1/flux/history` 或直接 SQL 按 `metadata->>'description'` / `metadata->>'idempotencyKey'` 查

```sql
-- 看某次 grant 实际发了多少
SELECT user_id, amount, balance_after, created_at
  FROM flux_transaction
 WHERE metadata->>'idempotencyKey' = 'beta-2026-q2'
 ORDER BY created_at;
```

## 6. 实现位置

- 路由：[`apps/server/src/routes/admin/flux-grants/index.ts`](apps/server/src/routes/admin/flux-grants/index.ts)
- Service：[`apps/server/src/services/admin-flux-grants/index.ts`](apps/server/src/services/admin-flux-grants/index.ts)
- 单测：[`apps/server/src/services/admin-flux-grants/tests/admin-flux-grants.test.ts`](apps/server/src/services/admin-flux-grants/tests/admin-flux-grants.test.ts)
- adminGuard：[`apps/server/src/middlewares/admin-guard.ts`](apps/server/src/middlewares/admin-guard.ts)
- 数据库：**没有**专门的表；唯一持久化是 `flux_transaction` ledger
- 已废弃：`flux_grant_batch` / `flux_grant_batch_recipient`（drizzle migration `0011_superb_lady_deathstrike.sql` 删表）

## 7. 不做

- 不做 batch 状态机 / retry endpoint —— 同步响应里已经有 failed 列表，admin 看到失败就自己再发
- 不做异步处理 / 后台 loop —— 200 用户上限完全可以塞进一个 HTTP 请求
- 不做 dashboard 展示 —— 直接查 `flux_transaction` 即可
- 不做高并发 / 大批量 —— 这是 admin 工具不是 bulk import；超 200 就让 admin 拆请求

## 8. 已知不足

- **无 admin-side 失败留痕**：`failed[]` 只在 HTTP 响应里返回一次，admin 关掉浏览器就没了。如果将来发现需要"上次失败的那批"持久化，再单独加一张 `admin_grant_attempt_log` 之类的，不要把它做回 batch 表。
- **`emails` 上限 200 是经验估算**：单 `creditFlux` 假设 20–50ms。如果实际生产数据显示更慢，下调上限。
