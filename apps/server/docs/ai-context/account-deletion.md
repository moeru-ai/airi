# Account Deletion

User-requested account deletion. Auth identity is hard-deleted; business records are soft-deleted (preserved with `deleted_at`) for audit/compliance.

## 决策摘要

| 决策点 | 选择 | 理由 |
|---|---|---|
| `apps/server/src/schemas/accounts.ts` | **不动** | better-auth `auth:generate` 自动产物。修改会被下次生成覆盖 |
| Auth 表 (user/session/account/oauth\*/verification) | **hard delete + cascade** | 跟着 user 一起 cascade 干净。无审计价值，留着只是 dangling auth state |
| 业务表 (flux\*/stripe\*/character\*/providers/chats) | **soft delete (deleted_at)** | 审计、合规、debug 需要保留"这条记录原属于哪个 user" |
| 业务表对 user.id 的 FK | **drop FK constraint，保留裸 userId 列** | better-auth hard-delete user 时不会被 cascade 干掉。跟 `llm_request_log` 现有做法一致 |
| llm_request_log | **不参与软删，独立 retention** | 高并发写入，本就无 FK；保留期由独立 retention job 决定（合规） |
| 删除流程 | **better-auth 内建邮件确认** | `user.deleteUser.sendDeleteAccountVerification` + token 回调，开箱即用 |
| 误删恢复 | **不支持** | 用户认知中"删除即不可逆"。要恢复就重新注册（同 email 没问题，user 行已删，唯一约束释放） |
| Stripe 订阅 | **立即 cancel，不退款（v1）** | 简单、对内部记账影响最小。条款需注明。后续可改 |
| Flux 余额 | **清零（userFlux.deletedAt）** | 同上。后续可补退款逻辑 |

## 流程

```
用户在 settings/account 点 Delete
  ↓
POST /api/auth/delete-user (Bearer)              ← better-auth
  ↓
sendDeleteAccountVerification → Resend           ← 我们的 EmailService
  ↓ 用户收邮件，点链接
GET /api/auth/delete-user/callback?token=...     ← better-auth 验 token
  ↓ token 有效
beforeDelete(user)                               ← UserDeletionService.softDeleteAll(userId)
  ├─ stripe     (priority 10): stripeService.deleteAllForUser
  │                            → Stripe API cancel + 4 张 stripe_* 表打 deletedAt
  ├─ flux       (priority 20): fluxService.deleteAllForUser
  │                            → userFlux 打 deletedAt + redis cache 失效
  ├─ providers  (priority 30): providerService.deleteAllForUser
  │                            → userProviderConfigs 打 deletedAt
  ├─ characters (priority 30): characterService.deleteAllForUser
  │                            → character / likes / bookmarks 打 deletedAt
  └─ chats      (priority 30): chatService.deleteAllForUser
                               → chats / messages 打 deletedAt
  ↓
internalAdapter.deleteUser(userId)               ← user 行真删
  ↓ Postgres FK cascade
session/account/oauth_client/oauth_*_token/oauth_consent  ← 真删
  ↓
重定向到 callbackURL
```

## 架构：service own 自己的删除语义

每个业务 service 自己 own `deleteAllForUser(userId)` 方法 —— 删除该 user scope 下所有相关数据的能力跟 service 的其他 CRUD 方法住在一起。`UserDeletionService` 只是个**调度器**：按 priority 串行调用各 service 的方法，throw 中止。

依赖图：

```
auth ──depends on──► userDeletionService ──depends on──► [stripeService, fluxService, ...]
                            │
                            └─ 内部仅持有 { name, priority, softDelete } 列表，
                               softDelete 是对 service.deleteAllForUser 的 thin wrapper
```

auth 和业务 service **互不依赖**，双方都只依赖 `userDeletionService` 这层抽象。这是 DIP 的标准形态。

```ts
// apps/server/src/services/user-deletion/types.ts
export interface UserDeletionHandler {
  name: string
  /** Lower runs first. 10=external side-effects, 20=financial+cache, 30=pure DB */
  priority: number
  softDelete: (ctx: UserDeletionContext) => Promise<void>
}

export interface UserDeletionService {
  register: (handler: UserDeletionHandler) => void
  softDeleteAll: (input: { userId: string, reason: UserDeletionReason }) => Promise<void>
}
```

装配在 `app.ts` 一处完成（每个 service 一行 `register`）。不分 transaction：每个 service 方法自己管 db/外部调用，**Stripe 这种没法 rollback 的副作用必须最先做**（priority 最小），失败就抛错中止后续 service 调用 + better-auth 的 user 删除，用户重试即可（idempotent：Stripe sub 已 cancel 的再 cancel 是 no-op；deletedAt 已设置的再 update 是 no-op）。

## 加新业务模块的步骤

1. 在该 service 加 `async deleteAllForUser(userId: string)` 方法
2. 在 `app.ts` 的 `userDeletionService` build 里加一行 `service.register({...})`
3. 完成

不需要：写新文件、改 service 接口、改 auth.ts、改 types.ts。

## 各业务 service 的 deleteAllForUser

| Service | priority | 内容 | 依赖 |
|---|---|---|---|
| **stripeService** | 10 | (1) 查 stripeSubscription where userId=? and status=active；(2) Stripe API `subscriptions.cancel(id, { prorate: false })`；(3) 4 张 `stripe_*` 表 update deletedAt=now() | DB, Stripe SDK (optional) |
| **fluxService** | 20 | (1) `update userFlux set deletedAt=now() where userId=?`；(2) `redis del flux:balance:{userId}`；(3) **不动** flux_transaction（账本审计） | DB, Redis |
| **providerService** | 30 | `update userProviderConfigs set deletedAt=now() where ownerId=?` | DB |
| **characterService** | 30 | (1) `character set deletedAt=now() where ownerId=? or creatorId=?`；(2) `characterLikes/Bookmarks set deletedAt=now() where userId=?` | DB |
| **chatService** | 30 | 按 `chat.type` 分支：① `private`/`bot` 整 chat soft-delete + 该 user 发的 message soft-delete；② `group`/`channel` 只硬删该 user 的 `chat_members` 行，**user 发的 message 保留**给其他 member 维持对话上下文（sender 通过"user 行 hard-delete + senderId bare text 无 FK"自然匿名化，UI 拿 senderId lookup 不到 user 时渲染为 "Deleted User"） | DB |
| llm_request_log | 不参与 | 独立 retention job 处理 | — |

## 业务查询的软删过滤

**所有读业务表的查询都必须加 `isNull(deletedAt)` 过滤**，否则被删用户的数据还能被列出来 / 关联出来。重点扫描：

- `apps/server/src/services/flux.ts` — getBalance / readBalance
- `apps/server/src/services/characters.ts` — listCharacters
- `apps/server/src/services/providers.ts` — listProviderConfigs
- `apps/server/src/services/chats.ts` — listChats / listMessages
- `apps/server/src/services/billing/billing-service.ts` — invoice / sub 查询

写完后用 `pnpm typecheck` + grep `from(flux|character|chats|providers|stripe)` 兜底。

## Failure 模型

| 阶段失败 | 行为 | 后果 |
|---|---|---|
| sendDeleteAccountVerification | better-auth 抛 500 | 用户重试 |
| token 验失败/过期 | better-auth 返 404 | 用户重新发起 |
| Stripe handler 抛错 | 整个 beforeDelete 中止 → user 不删 | DB 状态保持原样，Stripe sub 状态可能已 cancel（罕见），下次重试 idempotent |
| Flux/其他 handler 抛错 | 同上中止 → user 不删 | 已经 cancel 的 Stripe sub 不会回滚（Stripe API 不支持 un-cancel），用户得重新订阅。**记录到 deletion_failure_log**（telemetry / sentry alert） |
| user 真删后 afterDelete 抛错 | user 已删，session 已 revoke，已无法回滚 | 仅 log，不影响用户体验 |

**没有补偿事务**。Multi-step soft-delete 失败的处置策略是：失败即中止，依赖 idempotency 让重试干净。

## Idempotency

- better-auth 的 verification token 一次性消费（`deleteVerificationByIdentifier`），点链接两次第二次会 404
- handler 全部用 `update where deletedAt is null` 守卫，重跑无副作用
- Stripe `subscriptions.cancel` 对已 cancel 的 sub 返回 200（idempotent by spec）

## 群聊匿名化（"Deleted User"）

群聊场景下 `messages.senderId` 故意是 **bare `text` 列没有 FK**，所以：

- better-auth hard-delete `user` 行后，`messages.senderId='abc123'` 字符串还在，但 `select * from "user" where id='abc123'` 空集
- name / email / avatar 全部跟 user 行一起没了
- senderId 还能 group by（同一 user 发的 message 仍可识别为同一来源），但**反查不到任何 PII**
- UI 路径：渲染 message sender 时 user lookup miss → 显示 "Deleted User" / "[已注销]"

**chatService.deleteAllForUser 不需要主动改 senderId**，schema "bare text + 无 FK + auth user 行 hard-delete" 这三件事联合产出匿名化效果。

## 第三方 OAuth provider 端

better-auth `internalAdapter.deleteAccounts` 删本地 `account` 表（user 跟 google/github 登录方式的关联），oauth_* 表通过 FK cascade 删干净。**第三方 OAuth provider 那边的 grant 不主动撤销** —— 跟 Stripe / Slack / Discord 等业界默认一致。User 真要彻底清，应该去 OAuth provider 自己的 dashboard（如 google.com/security）撤。

如果未来出现严格 GDPR 需求，可以加 best-effort 调 Google `/o/oauth2/revoke?token=...` —— 但需要保留 refresh token，且 endpoint 本身就是 best-effort。

## 不做项 (v1)

- ❌ 软删 → hard delete reaper job（业务表保留无限期，等首次清理需求驱动；llm_request_log 已有独立 retention）
- ❌ 误删恢复（用户认知中删除即终态；UI 必须文案警示）
- ❌ Stripe / Flux 退款（条款里写明，后续按需补）
- ❌ 删除事件外发 Webhook / Slack 通知（用 telemetry 替代）
- ❌ Admin 手动触发 delete（后续 admin panel 任务）
- ❌ 主动撤销第三方 OAuth provider 端的 grant（业界默认不做，user 自助撤）

## 相关代码索引

- 业务表 schema: `apps/server/src/schemas/{flux,flux-transaction,stripe,characters,user-character,providers,chats}.ts`
- Auth schema (不改): `apps/server/src/schemas/accounts.ts`
- Auth 配置: `apps/server/src/libs/auth.ts` (extend with `user.deleteUser`)
- Email service: `apps/server/src/services/email.ts` (extend interface + Resend impl)
- Deletion scheduler: `apps/server/src/services/user-deletion/` (registry only, no domain logic)
- 各 service 自己的 `deleteAllForUser`: `apps/server/src/services/{characters,chats,flux,providers,stripe}.ts`
- UI - settings page: `packages/stage-pages/src/pages/settings/account/account-settings-page.vue` (line ~430 TODO)
- UI - confirmation page (新): `apps/ui-server-auth/src/pages/delete-account.vue`
- i18n: `packages/i18n/src/locales/{en,zh}/settings/account.yaml`

## Verification

实测路径见 `docs/ai/context/verifications/account-deletion.md`（待补）。

最小路径：

1. 注册 user A
2. 创建一个 character，给 5 flux，订阅 active sub（mock Stripe）
3. UI 点 Delete → 收邮件 → 点链接
4. 验证：
   - `select * from "user" where email='A'` 空
   - `select * from session where user_id='A'` 空
   - `select * from user_flux where user_id='A'` deleted_at 非空
   - `select * from character where owner_id='A'` deleted_at 非空
   - `select * from stripe_subscription where user_id='A'` deleted_at 非空，Stripe API 端 sub status=canceled
   - `select * from flux_transaction where user_id='A'` 仍存在（账本审计）
5. 重新用 email A 注册成功（unique 约束已释放）
