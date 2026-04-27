# Email auth via Resend (apps/server + apps/ui-server-auth)

Status: in progress
Last updated: 2026-04-27

## Goal

1. 接入 **Resend** 作为 `apps/server` 的统一邮件发送 service。
2. 把 Better Auth 的四个邮件回调接好：
   - `emailVerification.sendVerificationEmail`（注册后验证邮箱）
   - `emailAndPassword.sendResetPassword`（忘记密码）
   - `user.changeEmail.sendChangeEmailVerification`（改邮箱）
   - `magicLink.sendMagicLink`（passwordless 登录，启用 plugin）
3. 在 `apps/ui-server-auth` 加上邮箱注册 / 邮箱密码登录 / 忘记密码 / 重置密码 等界面。

## 用户路径（必须端到端跑通）

只有这两条本期要 ship：

1. **注册路径**：用户敲 `/sign-up` → 填邮箱 + 密码 → 提交 → 进 `verify-email` 提示页 → 收邮件点链接 → `verify-email?token=...` 落地页提示成功 → 跳 `/sign-in`。
2. **忘记密码路径**：用户在 `/sign-in` 点 "Forgot password" → 进 `/forgot-password` 输邮箱 → 提交 → 提示已发送 → 用户点邮件链接 → `/reset-password?token=...` 输新密码 → 跳 `/sign-in`。
3. **常规邮箱登录**：`/sign-in` 输邮箱 + 密码 → 走 OIDC `loginPage` 流程把用户登入，返回上游 `/oauth/authorize`。

服务端为 magic link / change email 接好回调（避免功能闭包不齐一半），但前端 UI 留待后续。Service 拒绝静默吞错——发送失败要走错误响应让 Better Auth 把错抛回前端。

## 范围明确

In:

- `apps/server/src/services/email.ts`：统一 `EmailService` 接口（`sendVerification` / `sendPasswordReset` / `sendMagicLink` / `sendChangeEmail`），每个方法对应一个 HTML + plaintext 模板。
- `apps/server/src/libs/auth.ts`：装上 4 个 callback；启用 `requireEmailVerification: true`；加载 `magicLink` plugin。
- `apps/server/src/libs/env.ts`：新增 `RESEND_API_KEY`（必填）、`RESEND_FROM_EMAIL`（必填）、`RESEND_FROM_NAME`（可选）、`AUTH_EMAIL_VERIFY_REDIRECT_URL` / `AUTH_PASSWORD_RESET_REDIRECT_URL`（可选，默认根据 `API_SERVER_URL` 推算 ui-server-auth origin）。
- `apps/server/src/app.ts`：把 `EmailService` 通过 `injeca` 装配，注入到 `auth` provider。
- `apps/ui-server-auth/src/pages`：扩 `sign-in.vue`；新增 `sign-up.vue`、`verify-email.vue`、`forgot-password.vue`、`reset-password.vue`。
- `apps/ui-server-auth/src/modules/sign-in.ts` 同级补 `email-password.ts` 处理 emailPassword sign-in/up + forgot/reset 的真实调用。
- `packages/i18n`：新增 auth.signUp / verifyEmail / forgotPassword / resetPassword 字段。

Out:

- Magic link 前端 UI（`magic-link-sent.vue` / sign-in 上的 "Email me a link" 入口）。
- Change email 前端流程（账号设置页里发起、点击新邮箱链接验证）。
- 自定义 SMTP fallback / 多 provider 抽象。本期只接 Resend，但 service 接口签名留 provider 替换余地。
- 邮箱 / 邮件模板的 i18n（先英文一个版本，后续补）。

## 关键决策

- **Resend SDK**：使用官方 `resend` npm 包。错误处理走 `errorMessageFrom`（`@moeru/std`）；失败时抛 `ApiError(502, 'email/send_failed', ...)` 让 Better Auth 把错传回前端。
- **触发邮件的位置**：Better Auth 的 hook 是 server 内部回调，不是 HTTP 路由——跨实例时只有处理该次 sign-in/up 的实例会触发，不会重复。
- **Verify / reset 链接 URL**：链接落地页不放 `apps/server`，而是放 `apps/ui-server-auth`。`API_SERVER_URL` 是 server 自身（如 `https://airi-api.moeru.ai`），ui-server-auth 通常是另一域（如 `https://auth.airi.moeru.ai`）；两者要么同源（dev）要么通过 trustedOrigins 已经互信。链接组装规则：
  - Verify email：`<UI_BASE>/verify-email?token=<token>`
  - Reset password：`<UI_BASE>/reset-password?token=<token>`
  - 由 `getAuthTrustedOrigins(request)` 第一个匹配的 origin 决定 `<UI_BASE>`，避免硬编码。
- **`requireEmailVerification: true` 开启的副作用**：现存历史用户（尚未验证）将在下次登录被拦截。**社交登录（Google/GitHub）默认 `emailVerified=true`**，不受影响。需要在 sign-up 后端响应中带 `requiresEmailVerification` 标志，前端据此跳到 `verify-email` 提示页。
- **OIDC `loginPage: '/sign-in'` 不变**：sign-in 加表单后仍然走 `oauth/authorize → /sign-in?... → 登录成功 → callbackURL 回 oauth/authorize`，不破坏现有流程。

## 假设 / 待验证

- `resend` SDK ESM-only？需在加包后 `pnpm typecheck` 验证（unverified）。
- `better-auth/plugins/magic-link` 可与 `oauthProvider` 共存（unverified，但插件是独立 endpoint，不冲突）。
- ui-server-auth 在 dev 下走 `http://localhost:5173`，与 `apps/server` 不同源。`server` 已在 `getAuthTrustedOrigins` 把 dev origin 加进来。

## 验证计划

每条用户路径要落一份验证记录到 `docs/ai/context/verifications/email-auth-<path>.md`：

1. `email-auth-signup.md`：dev 环境注册一次，列出真实 curl / 浏览器步骤、Resend dashboard 命中、点链接落地页结果。
2. `email-auth-forgot.md`：忘记密码同上。
3. `email-auth-signin-email-password.md`：emailPassword sign-in 完整 OIDC 闭环。

未跑过这三条 = 默认 unverified，不能声明完成。

## 不做（明确说"以后"）

- 邮件 i18n（仅英文）
- 邮件模板真实视觉设计（先用最小可读模板）
- Resend webhook（bounce / complaint 回调）接入
- 邮件审计日志写入 `request_log` 表
- Magic link 前端 UI 与 change-email 前端 UI
