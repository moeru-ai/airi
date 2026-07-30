# Admin Access (Role) + Account Ban + Balance Override

服务端的 admin 能力统一在 better-auth 内置 `admin` 插件的 **role** 体系下，不再用 `ADMIN_EMAILS` 环境变量白名单。

## 授权模型：role-based

- `auth.ts` 启用 `admin({ adminRoles: ['admin'] })`。它给 `user` 表加 `role / banned / banReason / banExpires`，给 `session` 加 `impersonatedBy`（schema 手写进 `schemas/accounts.ts`，字段名与插件一致，迁移 `drizzle/0013_naive_groot.sql`）。
- 自建的 `/api/admin/*` 路由用 `middlewares/admin-guard.ts` 的 `adminGuard`：读 `c.get('user').role`，命中 `'admin'`（支持逗号分隔多角色）才放行，否则 401（无 user）/ 403（无 admin role）。
- **没有 env 白名单，也没有自动 seed**。第一个 admin 手动设：`UPDATE "user" SET role = 'admin' WHERE email = '...';`。在那之前没人能访问任何 admin 端点（自建的和 better-auth 的都不行）。

## better-auth admin 端点（收敛后的 ban/unban 在这里）

- 账号封禁/解封用 better-auth 原生端点：`POST /api/auth/admin/ban-user`、`/api/auth/admin/unban-user`（body 用 `userId`，可带 `banReason` / `banExpiresIn`）。调用者需要 admin role（插件内部 `hasPermission` 校验）。
- ban 会写 `user.banned = true` 并 `deleteSessions(userId)`。`banExpires` 到点后，插件在下次登录的 `session.create.before` 自动翻回 `banned = false`。
- **危险端点用 `disabledPaths` 关掉**（`auth.ts`）：`create-user / update-user / set-role / set-user-password / remove-user / impersonate-user / stop-impersonating`。只留读 + ban/unban + session 管理子集（list-users / ban-user / unban-user / list-user-sessions / revoke-user-session(s) / get-user / has-permission）。
- `set-role` 也关了：role 授予走手动 DB，不开放 HTTP 提权面。

## 封禁怎么「立即生效」

admin 插件的封禁强制只在 `session.create.before`（拦新登录）。但 stage-web / electron / pocket 热路径带的是 oauthProvider 签的无状态 RS256 JWT，`resolveJWTAccessToken` 只验签 + `findUserById`，**不建 session、不查 session 行**，插件那个钩子根本不触发。

所以热路径的封禁判断自己做，落在 `resolveRequestAuth`（所有传输层唯一鉴权入口：`sessionMiddleware` / 两个 WebSocket / OIDC `get-session`）：

- 解析出 user 后调 `isUserBannedNow(user)`（`libs/request-auth.ts`），命中返回 `null` → 上层当未鉴权（401）。
- `isUserBannedNow` 读的是 `user.banned`（`findUserById` 已经把整行 user 带回来了，**零额外查询**），并判 `banExpires`：过期的 ban 当未封禁。
- `findUserById` 的 TS 返回类型是 better-auth 基础 User，不含插件字段，但运行时整行都在 → `request-auth.ts` 有一处带 `// NOTICE:` 的 widen cast 拿回 `banned`。

另外 `/api/auth/oauth2/userinfo` 单独加了一道 guard（`routes/auth/index.ts`）：`/api/auth/*` 绕过 `sessionMiddleware`，而 userinfo 只验签就返 profile，所以这里用 `resolveSessionIgnoringBan` + `isUserBannedNow` 拦被封用户的有效 JWT。`/oauth2/introspect` 要 confidential client（一方 client 全 public），无可达调用方，不补。

**封禁时撤销 OAuth 凭据**（codex review 发现并修）：admin 插件 `banUser` 只删 session，留着 `oauth_refresh_token` / `oauth_access_token`。oauthProvider 的 `/oauth2/token` refresh grant（`@better-auth/oauth-provider/dist/index.mjs:718`）加载 user 但**不查 `banned`**，所以被封用户本可用现存 refresh token 换一个全新 JWT。那个新 JWT 在所有资源路径仍被 `isUserBannedNow` 挡住（拿不到实际访问），但为了从源头断掉，`auth.ts` 加了 `databaseHooks.user.update.after`：检测 `banned=true` 时删该用户的 oauth refresh/access token 行（`banUser` 通过 `updateUser` 写 banned，触发此 hook）。这样 refresh grant 自然失败。

## 余额设定（无 better-auth 对应物，保留自建）

改余额是 flux 领域操作，better-auth admin 没有，保留为自建路由 `POST /api/admin/users/balance`，用 `adminGuard`（role）守。

- `AdminUsersService.setBalance` 把 selector（email | userId 二选一，`requireSingleSelector` 强校验）解析成 userId（`resolveUserByIdOrEmail`），再委托 `BillingService.setFlux`。
- `setFlux` 单事务锁 `user_flux` 行 → 改余额 → 写 `flux_transaction`（type `admin_set`，方向 + before/after + issuedBy 进 metadata）→ 提交后 `redis.del` 失效缓存（不是写新值，避免参与 credit/debit 已有的跨操作 cache 竞态，详见下）。

flux-grants（`/api/admin/flux-grants`）和 router-config（`/api/admin/config/router`）同理：保留自建，鉴权从 `adminGuard(env)` 换成 role-based `adminGuard`。

## 相关文件

- `src/libs/auth.ts` — `admin()` 插件 + `disabledPaths`
- `src/schemas/accounts.ts` — user/session 上的 admin 插件字段
- `src/middlewares/admin-guard.ts` — role-based `adminGuard`
- `src/libs/request-auth.ts` — `isUserBannedNow` + 热路径封禁闸
- `src/routes/auth/index.ts` — `/oauth2/userinfo` 封禁 guard
- `src/routes/admin/users/index.ts` — `POST /balance`（自建）
- `src/services/domain/admin/users/index.ts` — `setBalance` 编排
- `src/services/domain/billing/billing-service.ts` — `setFlux`

## 余额缓存竞态（预先存在）

`creditFlux` / `debitFlux` / `setFlux` 的 Redis 写都在事务提交后、行锁外，无版本号。多实例并发下较慢的旧 SET 可能后到覆盖新值。这不是本次引入的，`setFlux` 用 `redis.del`（失效，对齐 `FluxService.deleteAllForUser`）而非 SET，至少不往里添 stale SET。彻底修需要给三个写统一加版本化缓存写，超出范围。`getFlux` 是 cache-aside，stale 窗口下次 miss 自愈，Postgres 始终是真相。

## 已知边界 / 取舍

- **第一个 admin 必须手动设 role**（删了 `ADMIN_EMAILS`）。首次部署/新环境要手动 `UPDATE "user" SET role='admin'`
- **ban 是 userId 单维**：账号在时 userId ban 已堵死一切登录方式（邮箱、所有 OAuth 都 resolve 到同一 user）。不覆盖「账号被删后用同邮箱/OAuth 重注册」——被封用户登不进去也删不了号，该洞只在 admin 主动删号后出现
- **dashboard 没上**：`@better-auth/infra` 的 `dash()` 是闭源 SaaS（`dash.better-auth.com`）的服务端 SDK，会把认证/用户数据外发第三方、`/dash/execute-adapter` 远程驱动 DB，且 `DashOptions` 只有 `activityTracking`、塞不进我们的 flux 业务页面。决定：业务管理（flux / grants / router config）将来自建 admin UI，user/session 管理直接调 better-auth admin 端点，不引入外部 SaaS
- admin 插件的 ban-user 端点 + `session.create.before` 登录拦截属于库行为，未跑真实 better-auth 登录流端到端验（靠源码确认 + 我们的热路径闸有真实执行覆盖）。详见 `verifications/admin-user-balance-ban.md`
