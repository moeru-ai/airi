# Admin Flux Grant Batch — End-to-End Verification

## 用户路径 1：admin 发起 batch → worker 异步 credit → 余额到账

- **场景**：admin 通过 `POST /api/admin/flux-grant-batches` 给一个邮箱发 5000 FLUX，worker 异步执行 → 用户余额从 44958 升到 49958
- **命令**：
  ```bash
  # 1. 创建 batch（不 dry-run）
  curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    'http://localhost:3000/api/admin/flux-grant-batches' \
    -d '{"name":"Live test 5000 FLUX 2026-05-08","amount":5000,"description":"End-to-end live verification grant","emails":["rbxin2003@gmail.com"]}'

  # 2. 等 worker 处理后查余额
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/flux

  # 3. 查 batch 详情
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/flux-grant-batches/cYt0gL3XVPdYfkuqAlwS-

  # 4. 查最近 ledger 记录
  curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:3000/api/v1/flux/history?limit=3&offset=0'
  ```
- **预期输出**：
  - 创建：HTTP 202，返回 `{batch:{status:"created"}, summary:{pending:1, totalFluxToIssue:5000}}`
  - 余额：`{flux: 49958}`（44958 + 5000）
  - Batch 详情：`{status:"completed", progress:{granted:1, pending:0, failed:0}}`，`startedAt` / `completedAt` 都非 null
  - Ledger 顶上一条：`{type:"promo", amount:5000, metadata:{batchId, batchName, recipientId}}`
- **实际输出**：
  - 创建：`{"batch":{"id":"cYt0gL3XVPdYfkuqAlwS-","name":"Live test 5000 FLUX 2026-05-08","status":"created","createdAt":"2026-05-07T17:17:29.642Z","createdByUserId":"R89bHt3QoCNkNywbYr7lbnpkb75y77MN"},"summary":{"totalEmails":1,"pending":1,"skipped":0,"totalFluxToIssue":5000}}` HTTP 202 ✓
  - 余额：`{"userId":"R89bHt3QoCNkNywbYr7lbnpkb75y77MN","flux":49958}` ✓
  - Batch 详情：`{"batch":{"status":"completed","startedAt":"2026-05-07T17:20:53.776Z","completedAt":"2026-05-07T17:20:59.179Z",...},"progress":{"total":1,"pending":0,"granted":1,"skipped":0,"failed":0},"recentFailures":[]}` ✓
  - Ledger：`{"id":"ouAbZQc93j3uJ1NRhRPgy","type":"promo","amount":5000,"description":"End-to-end live verification grant","metadata":{"batchId":"cYt0gL3XVPdYfkuqAlwS-","batchName":"Live test 5000 FLUX 2026-05-08","recipientId":"_qb-d8T5Js5-nvX3jbOuV"},"createdAt":"2026-05-07T17:20:54.528Z"}` ✓
  - billing-consumer 日志：`[billing-service] Credited flux  { userId=R89bHt3QoCNkNywbYr7lbnpkb75y77MN amount=5000 balance=49958 }` 和 `[mq-stream] Published event to Redis Stream  { stream=billing:events streamMessageId=1778174459013-0 }`
- **环境**：
  - 本地 dev（`pnpm dev` + `pnpm server billing-consumer`）
  - 服务 commit：`server-dev` 分支未 commit 状态（含本次重命名 + SQL fix）
  - 用户 ID：`R89bHt3QoCNkNywbYr7lbnpkb75y77MN`，邮箱 `rbxin2003@gmail.com`，verified
  - `ADMIN_EMAILS` 包含 `rbxin2003@gmail.com`
- **最后验证**：2026-05-08

## 用户路径 2：dry-run 预览 邮箱列表

- **场景**：admin 准备 batch 前，用 dry-run 检查 4 个 email（valid + 大小写变体重复 + 第三次重复 + 找不到）的解析结果
- **命令**：
  ```bash
  curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    'http://localhost:3000/api/admin/flux-grant-batches?dryRun=true' \
    -d '{"name":"Smoke test","amount":100,"description":"probe","emails":["rbxin2003@gmail.com","RBXIN2003@gmail.com","ghost@nope.example","rbxin2003@gmail.com"]}'
  ```
- **预期输出**：
  - HTTP 200，`{preview:{willGrant:1, willSkip:{notFound:1, userDeleted:0, duplicateInInput:2}, totalFluxToIssue:100}}`
  - 不写库（不创建 batch row）
- **实际输出**：
  - `{"preview":{"totalEmails":4,"willGrant":1,"willSkip":{"notFound":1,"userDeleted":0,"duplicateInInput":2},"totalFluxToIssue":100,"estimatedDurationSec":1,"samples":{"willGrant":["rbxin2003@gmail.com"],"notFound":["ghost@nope.example"],"userDeleted":[]}}}` HTTP 200 ✓
  - 后续 `GET /api/admin/flux-grant-batches` 列表里没有 "Smoke test" 这个 batch ✓（不写库验证）
- **环境**：同上
- **最后验证**：2026-05-08

## 用户路径 3：未登录 / 非 admin / 未验证邮箱 被挡住

- **场景**：adminGuard 三种拒绝路径（401 / 403 未在白名单 / 403 邮箱未验证）
- **命令**：
  ```bash
  # 401：无 token
  curl -s -w "%{http_code}\n" http://localhost:3000/api/admin/flux-grant-batches

  # 403：登录但邮箱不在白名单（用一个非 admin 用户的 token）→ 暂未验证（需要另一个测试 user）

  # 403：登录但 emailVerified=false → 暂未验证（需要构造未验证用户）
  ```
- **预期输出**：401 / 403 / 403
- **实际输出**：单元测试 [admin-guard.test.ts](apps/server/src/middlewares/tests/admin-guard.test.ts) 6 条用例全过（覆盖三种拒绝路径 + 通过路径 + case-insensitive 匹配）。**Live 路径 1 + 2 + 3 在浏览器/curl 端的 401/403 验证暂缺，标记为 PARTIAL。**
- **环境**：同上
- **最后验证**：2026-05-08（unit only）

## 已知缺口 / 未验证

- **多 worker 实例并发** `FOR UPDATE SKIP LOCKED` 不双发：单元测试覆盖了幂等约束（`(user_id, request_id)` 唯一索引），多实例 race condition 没真跑
- **重试路径**：`POST /retry` 接口已写，未端到端测试。需要构造一个 failed recipient（DB 短暂故障）触发 retry 才能验证
- **`flux.credited` 事件下游消费**：log 显示 stream XADD 成功，但没追到具体下游消费者的影响（目前 `billing-consumer-handler` 对 `flux.credited` 只 log，无 DB 写）
- **大批量性能**：50 throttle/s 是估算，没有跑过 1k+ 用户的 batch 实测
