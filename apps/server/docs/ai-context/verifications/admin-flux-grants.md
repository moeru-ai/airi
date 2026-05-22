# Admin Flux Grants — End-to-End Verification

## 用户路径 1：admin 同步发 grant → 余额到账

- **场景**：admin 通过 `POST /api/admin/flux-grants` 给一个邮箱发 100 FLUX，HTTP 同步返回 `granted` 数组 → 用户余额上升。
- **命令**（占位，需要重新实测）：
  ```bash
  TOKEN=...   # admin 用户 access token
  curl -s -X POST "http://localhost:3000/api/admin/flux-grants" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"description":"local verify","amount":100,"emails":["rbxin2003@gmail.com"]}'

  # 然后查余额
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/flux

  # 查 ledger
  curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:3000/api/v1/flux/history?limit=3'
  ```
- **预期**：
  - HTTP 200，body 包含 `result.granted: [{ email, userId, fluxTransactionId, balanceAfter }]`，`result.failed: []`，`result.skipped: []`
  - `/api/v1/flux` 返回的 `flux` 比之前增加 100
  - `/api/v1/flux/history` 顶部一条 `type='promo'`、`description='local verify'`、`metadata.issuedByUserId` = admin 的 userId
- **实际输出**：⏳ 待重新实测（架构刚从 batch 改成同步，旧 verification 已无效）。
- **环境**：本地 `pnpm -F @proj-airi/server dev`，commit SHA 待补，`ADMIN_EMAILS` 含 admin 邮箱且 `email_verified=true`。
- **最后验证**：⏳ 待补

## 用户路径 2：dry-run 预览邮箱列表

- **场景**：admin 在真发之前用 `?dryRun=true` 看 4 个 email（valid + 大小写变体重复 + 找不到）的解析结果。
- **命令**：
  ```bash
  curl -s -X POST 'http://localhost:3000/api/admin/flux-grants?dryRun=true' \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"description":"smoke","amount":100,"emails":["rbxin2003@gmail.com","RBXIN2003@gmail.com","ghost@nope.example","rbxin2003@gmail.com"]}'
  ```
- **预期**：HTTP 200，`{ preview: { willGrant: 1, willSkip: { notFound: 1, userDeleted: 0, duplicateInInput: 2 }, totalFluxToIssue: 100, ... } }`。`flux_transaction` 表无新增行。
- **实际输出**：⏳ 待重新实测
- **环境**：同上
- **最后验证**：⏳ 待补

## 用户路径 3：未登录 / 非 admin / 未验证邮箱被挡住

- **场景**：`adminGuard` 三种拒绝路径（401 无 session / 403 不在 allowlist / 403 邮箱未验证）。
- **命令**：
  ```bash
  curl -s -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/flux-grants -d '{}'
  # 期望 401
  ```
- **实际**：单元测试 [`admin-guard.test.ts`](apps/server/src/middlewares/tests/admin-guard.test.ts) 覆盖完整三条路径 + case-insensitive 匹配。Live 401/403 端到端验证⏳ 待补。
- **最后验证**：⏳ 待补（unit only）

## 已知缺口 / 未验证

- **整套 verification 都需要重跑**：架构从 `flux_grant_batch` 异步处理改成同步 `POST /api/admin/flux-grants` 后，旧的实测输出（含 `mq-stream` 日志、`batch.status: completed` 等）全部失效。Iron Law 要求至少跑一次路径 1 + 2 替换 ⏳ 占位。
- **失败重试 + idempotencyKey**：单测覆盖了"同 key 不同 recipient → 不同 requestId"这一逻辑，但没真跑过"故意打挂 DB 触发部分 failed → 用 `idempotencyKey` 重发只补失败的"端到端。
- **`emails` 上限 200 实际响应时间**：估算 4–10s，没在生产 DB 上跑过。如果 `creditFlux` 单条 > 50ms（远端 Postgres + Redis），需要回头下调上限或加批处理优化。
