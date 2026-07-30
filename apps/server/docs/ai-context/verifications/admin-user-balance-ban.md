# Verification: Admin 授权(role) + 封禁 + 改余额

- 环境：commit `6f63ce96e`（工作区改动未提交），本地 vitest + PGlite 内存 Postgres
- 最后验证日期：2026-05-26
- 模型：admin 授权改 better-auth `admin` 插件的 **role**（删 `ADMIN_EMAILS`）；ban/unban 收敛到 better-auth 原生 `user.banned`；改余额保留自建。设计见 `../account-ban.md`

## 已验证（fresh execution）

命令：

```sh
pnpm -F @proj-airi/server typecheck         # tsc --noEmit，无输出（通过）
pnpm exec vitest run apps/server            # 全量 Test Files 43 passed / Tests 398 passed（含 tests/ 集成测试）
pnpm db:generate                            # → drizzle/0013_naive_groot.sql
pnpm -F @proj-airi/server-schema build      # 重新打包迁移
```

### 用户路径 → 预期 → 实测

1. role-based adminGuard（HTTP 边界）
   - 预期：无 user → 401；role 非 admin / 无 role → 403；role='admin'（含逗号分隔 'user,admin'）→ 放行
   - 实测：`middlewares/tests/admin-guard.test.ts` 5 个用例通过

2. admin flux-grants 走 role 鉴权（真实 app + PGlite 集成）
   - 预期：session user role='admin' → 200 grant；无 role → 403；无 session → 401
   - 实测：`tests/verifications/admin-flux-grants.integration.test.ts` 通过，经 `buildApp` 全量装配 + 真实 PGlite（user 表带新 role 列），adminGuard 读 `user.role` 判定

3. 封禁立即生效（热路径，OIDC JWT）
   - 预期：`resolveRequestAuth` 对 `user.banned` 命中的 principal 返回 null（即使 session 能解析）；`banExpires` 已过期当未封禁
   - 实测：`libs/tests/request-auth.test.ts`「rejects a banned principal even when the session resolves」「treats an expired ban as not banned」通过

4. userinfo 封禁 guard（HTTP 边界）
   - 预期：被封 subject 打 `/api/auth/oauth2/userinfo` → 403 不到 handler；未封禁透传；ban 过期透传
   - 实测：`routes/auth/oidc-userinfo-ban.test.ts` 3 个用例通过，挂真实 `createAuthRoutes` 装配，banned 由 mock 的 getSession user 驱动

5. 改余额为 0 / 任意值（含缓存失效）
   - 预期：`user_flux.flux` 覆盖，写 `admin_set` 账本（direction + before/after + issuedBy），提交后 `redis.del` 失效缓存
   - 实测：`services/domain/billing/tests/billing-service.test.ts` setFlux 三个用例通过（设值 / 归零 / 初始化行 + `redis.del` 断言）

6. 余额 route 鉴权 + 校验（HTTP 边界）
   - 预期：未登录 401 / 非 admin role 403 / 负余额 400 / selector 非恰好一个 400 / 正常委托并回传
   - 实测：`routes/admin/users/route.test.ts` 6 个用例通过

7. 迁移
   - `drizzle/0013_naive_groot.sql`：`ALTER user ADD role/banned/ban_reason/ban_expires` + `ALTER session ADD impersonated_by`，无 account_ban
   - server-schema 重打包成功

8. 封禁撤销 OAuth 凭据（codex review 发现）
   - 预期：ban 时(`updateUser` 写 banned=true)触发 `databaseHooks.user.update.after`,删该用户 oauth refresh/access token,堵住「refresh grant 换新 JWT」
   - 状态:已加 hook + `// NOTICE:`,typecheck/lint 通过。hook 真正触发依赖 better-auth `updateUser` 全流程,属下方 pending（同 admin 端点真实登录流）。新 JWT 即便被 mint 也已被 isUserBannedNow 在第 3、4 条覆盖的资源路径挡住

## 待实测（pending）

- better-auth `admin` 插件自身的 `/api/auth/admin/ban-user|unban-user` 端点 + `session.create.before` 登录拦截未跑真实 better-auth 登录流（需起真服务 + Postgres + OAuth）。靠源码确认语义；我们自己的热路径闸（resolveRequestAuth / userinfo guard）已被第 3、4 条真实执行覆盖
- 真实部署：第一个 admin 需手动 `UPDATE "user" SET role='admin' WHERE email='...'`；多实例 Railway + 真实 Redis 下的封禁延迟未测

## 设计取舍（不再覆盖）

- 删 `ADMIN_EMAILS`：首次部署/新环境要手动设 role
- ban userId 单维：不覆盖「删号后用同邮箱/OAuth 重注册」（见 `../account-ban.md`）
- dashboard 未上：`@better-auth/infra` dash() 是闭源 SaaS + 数据外发 + 不可扩展，业务管理将来自建 UI
