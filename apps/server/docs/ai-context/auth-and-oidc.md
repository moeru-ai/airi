# 认证与 OIDC Provider

## 一句话总结

Server 通过 `better-auth` 同时充当**用户认证后端**和 **OIDC Provider（Authorization Server）**，为 Web、Electron Desktop、Capacitor Mobile 三个客户端提供 Authorization Code + PKCE 登录流程。

## 架构角色

```
┌─────────────────────────────────┐
│  社交登录 IdP (Google, GitHub)  │
└──────────────┬──────────────────┘
               ↓ OAuth 2.0
┌──────────────────────────────────────────────────┐
│  AIRI Server (better-auth OIDC Provider)         │
│                                                  │
│  /api/auth/oauth2/authorize  ← PKCE 授权          │
│  /api/auth/oauth2/token      ← Code 换 Token      │
│  /api/auth/oidc/session      ← OIDC→Session 桥接  │
│  /api/auth/oidc/electron-callback ← 回调中继页     │
│  /api/auth/sign-in/social    ← 社交登录入口        │
│  /sign-in                    ← 登录选择页          │
└──────────────┬──────────────────────┬────────────┘
               ↓                      ↓
        ┌──────────┐          ┌──────────────┐
        │ Stage Web │          │ Stage Electron│
        │ /auth/    │          │ 127.0.0.1:   │
        │ callback  │          │ {port}/      │
        └──────────┘          │ callback     │
                              └──────────────┘
```

## 核心组件

### Server 端

| 文件 | 职责 |
|------|------|
| `src/libs/auth.ts` | better-auth 配置：社交 provider、OIDC provider 插件、trusted clients 列表 |
| `src/app.ts` `/sign-in` 路由 | 登录页：支持 `?provider=google\|github` 直接 302 跳转，否则 fallback 到 HTML 选择页 |
| `src/routes/oidc/session.ts` | OIDC→Session 桥接端点：验证 OIDC access token → 创建 better-auth session → 返回 session token |
| `src/routes/oidc/electron-callback.ts` | Electron 回调中继页：服务端 HTML 页面通过 JS fetch() 将 auth code 转发到 Electron 本地 loopback |
| `src/utils/sign-in-page.ts` | 渲染 fallback HTML 登录页（Google/GitHub 按钮） |
| `src/utils/origin.ts` | 可信来源配置：`localhost`、`127.0.0.1`、`airi.moeru.ai`、`capacitor://localhost` |
| `src/libs/env.ts` | OIDC 相关环境变量定义（Valibot schema） |

### Trusted Clients

| Client | ID 环境变量 | redirect_uri | 类型 |
|--------|------------|--------------|------|
| Web | `OIDC_CLIENT_ID_WEB` | `https://airi.moeru.ai/auth/callback`, `http://localhost:5173/auth/callback` | web |
| Electron | `OIDC_CLIENT_ID_ELECTRON` | `{API_SERVER_URL}/api/auth/oidc/electron-callback`（服务端中继） | native |
| Mobile | `OIDC_CLIENT_ID_POCKET` | `capacitor://localhost/auth/callback` | native |

### 环境变量

```
# 社交 Provider
AUTH_GOOGLE_CLIENT_ID, AUTH_GOOGLE_CLIENT_SECRET
AUTH_GITHUB_CLIENT_ID, AUTH_GITHUB_CLIENT_SECRET

# OIDC Trusted Clients（均 optional，不配则不注册）
OIDC_CLIENT_ID_WEB, OIDC_CLIENT_SECRET_WEB
OIDC_CLIENT_ID_ELECTRON, OIDC_CLIENT_SECRET_ELECTRON
OIDC_CLIENT_ID_POCKET, OIDC_CLIENT_SECRET_POCKET
```

## 登录流程

### 完整流程（以 Web 为例）

1. 用户点击 "Google 登录" → client 构建 authorize URL（含 PKCE `code_challenge` + `provider=google`）
2. 浏览器跳转到 `/api/auth/oauth2/authorize`
3. better-auth 发现用户未登录 → 将 OIDC 参数存入 `oidc_login_prompt` 签名 cookie → 302 到 `/sign-in?...&provider=google`
4. `/sign-in` 路由看到 `provider=google` → 302 到 `/api/auth/sign-in/social?provider=google&callbackURL=/`
5. better-auth 跳转到 Google OAuth → 用户授权 → Google 回调到 server
6. better-auth 创建/关联用户 → 检测到 `oidc_login_prompt` cookie → 自动继续 OIDC 流程
7. Server 生成 authorization code → 302 到 client 的 `redirect_uri?code=xxx&state=xxx`
8. Client 用 code + code_verifier 换 token → 拿到 `access_token`、`refresh_token`

### Electron 特殊处理

Electron 不使用自定义协议（`airi://`），而是在 main process 临时启动一个 HTTP server 监听 `127.0.0.1:{port}/callback`：
- 固定端口范围：19721-19725，按顺序尝试
- 收到回调后立即关闭 server
- 5 分钟超时安全机制

**服务端回调中继**（2026-03-30 新增）：

Electron 的 OIDC redirect_uri 不再直接指向 loopback 端口，而是指向服务端的 `/api/auth/oidc/electron-callback`。这个端点返回一个 HTML 页面，页面通过 JS `fetch()` 将 auth code 转发到本地 loopback。

好处：
- 浏览器不显示 `http://127.0.0.1:19721/...` 这样的 URL
- 只需注册一个 redirect_uri（不再需要 5 个端口对应的 URL）
- Loopback server 需要设置 CORS `Access-Control-Allow-Origin: *`

端口编码方式：loopback 端口编码在 `state` 参数中，格式为 `{port}:{originalState}`。中继页面提取端口后，将 code 和原始 state 通过 fetch 发送到 `http://127.0.0.1:{port}/callback`。

### OIDC→Session 桥接（2026-03-30 新增）

better-auth 的 `oidcProvider` 插件发出的 OIDC access token 存在 `oauth_access_token` 表中，与 better-auth session（`session` 表）不兼容。Electron 登录后需要调用 `POST /api/auth/oidc/session` 桥接端点：

1. 验证 Bearer token 对应 `oauth_access_token` 表中的有效记录
2. 验证 `clientId = OIDC_CLIENT_ID_ELECTRON`（仅限 Electron 客户端）
3. 验证 `accessTokenExpiresAt > now`
4. 通过 `(await auth.$context).internalAdapter.createSession(userId)` 创建 better-auth session
5. 缓存 `oidc_token → session_token` 映射（TTL 5 分钟，幂等）
6. TTL 过期后删除 `oauth_access_token` 行

安全措施：
- 客户端 ID 限制（仅 Electron）
- Token 过期检查
- 幂等 + TTL 限制重放窗口
- 统一 401 响应（防止信息泄漏）
- 事务级锁定防止并发

### provider 参数直通

客户端在 authorize URL 中附带 `provider` 参数，server 的 `/sign-in` 路由会直接 302 到对应社交 provider，**跳过选择页**。没有 `provider` 参数时 fallback 到 HTML 选择页（兜底场景，如直接浏览器访问）。

## 踩坑记录

### better-auth redirect_uri 精确匹配

better-auth 的 OIDC 插件对 `redirect_uri` 做**精确字符串匹配**（`authorize.mjs`）：

```javascript
client.redirectUrls.find(url => url === ctx.query.redirect_uri)
```

RFC 8252 S7.3 要求 Authorization Server 对 loopback 地址允许任意端口，但 better-auth 不支持。因此 Electron 使用服务端中继 URL 作为 redirect_uri，绕过了端口匹配问题。

### better-auth cookie 与 Bearer 共存

better-auth client 默认 `credentials: "include"`，会同时发送 cookie。我们 override 为 `credentials: "omit"`，只使用 Bearer token 认证。见 `packages/stage-ui/src/libs/auth.ts` 的 NOTICE 注释。

### skipStateCookieCheck

Capacitor 移动端无法正确处理 state cookie，所以 OIDC provider 配置了 `skipStateCookieCheck: true`。PKCE 仍然提供 CSRF 防护。

### better-auth internalAdapter

`(await auth.$context).internalAdapter.createSession(userId)` 是创建 session 的正确路径。`auth.api` 是 HTTP endpoint handlers 的集合，没有 `createSession` 方法。参考 better-auth admin 插件和 test-utils 的用法。注意 `createAuth()` 返回 `any`（TS2742），需要无类型安全地访问 `$context`。

## 修改指南

- 新增 OIDC client → `src/libs/auth.ts` 的 `buildTrustedClients`，加环境变量到 `src/libs/env.ts`
- 改登录页 → `src/utils/sign-in-page.ts`（HTML），或 `src/app.ts` 的 `/sign-in` 路由
- 改认证中间件 → `src/app.ts` 的 session middleware
- 改 trusted origins → `src/utils/origin.ts`
- 调试 OIDC 流程 → 检查 `oidc_login_prompt` cookie 是否正确设置和消费
- 改桥接端点 → `src/routes/oidc/session.ts`
- 改回调中继 → `src/routes/oidc/electron-callback.ts`
- Electron 认证回调处理 → `apps/stage-tamagotchi/src/renderer/bridges/electron-auth-callback.ts`（service 级别，不在 Vue 组件中）
