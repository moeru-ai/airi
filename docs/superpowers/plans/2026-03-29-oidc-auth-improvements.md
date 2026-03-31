# OIDC Auth 改进：实施记录

> 2026-03-29 实施。本文档记录改了什么、为什么这么改、哪里踩坑、还有什么没做。

## 背景

原有 OIDC 实现存在以下问题：
- PKCE 加密工具在 Web (`auth-oidc.ts`) 和 Electron (`auth.ts`) 各有一份
- Electron 使用 `airi://` 自定义协议做回调，在 Windows 上有被恶意应用劫持的风险
- `exchangeCodeForTokens` 直接写 Pinia store，不是纯函数，难以测试和复用
- 没有 token 自动刷新机制
- Server 的 `/sign-in` 每次都渲染 HTML 选择页，即使 client 已经知道用户要用哪个 provider

## 做了什么

### 1. 抽取共享 PKCE 工具（`@proj-airi/stage-shared/auth`）

- 新建 `packages/stage-shared/src/auth/pkce.ts`，导出 `generateCodeVerifier`、`generateCodeChallenge`、`generateState`、`base64UrlEncode`
- 使用 Web Crypto API（`crypto.getRandomValues`、`crypto.subtle.digest`），Browser 和 Node.js 通用
- 7 个单元测试，含 RFC 7636 Appendix B 测试向量
- Web 端和 Electron 端都改为从这里导入

### 2. Server `/sign-in` 支持 `provider` 参数直通

- Client 在 authorize URL 中附带 `&provider=github`
- better-auth 的 authorize 端点会把所有 query params 透传到 loginPage URL
- `/sign-in` 路由检测到 `provider` 参数后直接 302 到 `/api/auth/sign-in/social?provider=xxx`
- 没有 `provider` 时 fallback 到原有 HTML 选择页

### 3. 纯函数化 token exchange + 自动刷新

- `exchangeCodeForTokens` 不再直接写 store，返回 `TokenResponse`
- 新增 `persistTokens(tokens, clientId)` 负责写 store + 调度刷新
- `scheduleTokenRefresh` 在 token 80% 生命周期时自动刷新
- `signOut` 清理刷新定时器
- `refreshAccessToken` 也是纯函数

### 4. Electron loopback 替代 `airi://`

- 新建 `loopback-server.ts`：临时 HTTP server 监听 `127.0.0.1`
- 固定端口范围 19721-19725，按顺序尝试（原因见踩坑记录）
- 收到回调后立即关闭 server，5 分钟超时安全机制
- 删除了 `registerProtocol()`、`handleDeepLink()`、`open-url`/`second-instance` 事件监听
- Server 端 trusted client 的 `redirectUrls` 从 `airi://auth/callback` 改为 5 个 loopback 地址

### 5. LoginDrawer 和 onboarding 适配

- `LoginDrawer.vue` 从废弃的 `signIn` 迁移到 `signInOIDC`（传 provider）
- Onboarding `step-welcome.vue` 在所有平台（含 Electron）启用登录按钮

## 踩坑记录

### better-auth redirect_uri 精确匹配

**问题**：better-auth OIDC 插件的 authorize 端点用 `===` 比较 `redirect_uri`：
```javascript
client.redirectUrls.find(url => url === ctx.query.redirect_uri)
```

RFC 8252 S7.3 要求 Authorization Server 对 loopback 地址接受任意端口，但 better-auth 不支持。

**解决方案**：使用固定端口范围（19721-19725），全部注册到 trusted client 的 `redirectUrls`。如果所有端口都被占用，报错提示用户。

**备选方案（未采用）**：
- 在 server 侧 middleware 劫持 redirect_uri 校验 → 太 hacky
- `Promise.withResolvers` → Electron 的 Node.js 版本可能不支持，改用手动 `new Promise`

### better-auth cookie 与 Bearer 共存

`createAuthClient` 默认 `credentials: "include"`，会同时发 cookie 和 Bearer header。我们 override 为 `credentials: "omit"`，只用 Bearer。这个行为在 `config.mjs` L40 硬编码，靠 spread 覆盖（L47）。

### Capacitor state cookie

Capacitor 移动端无法正确处理跨域 state cookie，OIDC provider 配了 `skipStateCookieCheck: true`。PKCE 本身已提供 CSRF 防护。

### authClient 初始化时机

`authClient` 在模块顶层初始化（`createAuthClient` 需要 `baseURL`），此时 Pinia 还没激活。所以 `getAuthToken()` 直接读 `localStorage` 而不是通过 store，但 key 相同，读写保持一致。

## 还没做的

### 高优先级

- [ ] **Electron 端 token 自动刷新** — Web 端已实现（`scheduleTokenRefresh`），但 Electron renderer 侧的 `controls-island-auth-button.vue` 拿到 token 后没有调度刷新。需要在 renderer 收到 `electronAuthCallback` 时也启动刷新定时器。
- [ ] **Token 持久化安全** — Electron 端的 access_token 和 refresh_token 目前存在 renderer 的 localStorage 中。更安全的做法是存在 main process（例如用 `safeStorage` 加密），renderer 只持有短生命周期的 token。
- [ ] **`signIn`（废弃函数）清理** — `auth.ts` 中已经删除了 `signIn` 导出，但其他地方可能还有残留引用。需要全局搜索确认。

### 中优先级

- [ ] **better-auth loopback port 通配** — 如果 better-auth 未来支持 loopback URI 的端口通配匹配（per RFC 8252），可以去掉固定端口限制，改回随机端口。关注 better-auth 的 issue/PR。
- [ ] **登录状态同步** — 多窗口场景（Electron 多窗口、Web 多 tab）的登录状态同步。目前依赖 localStorage 的 `storage` 事件，但没有主动监听。
- [ ] **Error boundary** — 登录失败的 UI 反馈不够完善。`callback.vue` 有基本的错误展示，但 Electron 端只是 toast，没有重试引导。

### 低优先级

- [ ] **Device Code Flow** — 为 CLI 工具提供 Device Code 授权流程（RFC 8628），目前没有需求。
- [ ] **第三方 client 接入** — 如果未来要开放 OIDC 给第三方应用，需要独立的 IdP 前端（`stage-idp`），目前只有第一方 client，不需要。
