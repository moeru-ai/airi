# 认证与 OIDC Provider

## 一句话总结

Server 通过 `better-auth` 同时充当**用户认证后端**和 **OIDC Provider（Authorization Server）**，为 Web、Electron Desktop、Capacitor Mobile 三个客户端提供 Authorization Code + PKCE 登录流程。客户端直接持有 OIDC access token，并通过服务端统一的 Bearer 解析链路完成鉴权与 session 查询。

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
│  /api/auth/oidc/electron-callback ← 回调中继页     │
│  /api/auth/sign-in/social    ← 社交登录入口        │
│  /sign-in                    ← 登录选择页          │
└──────────────┬──────────────────┬────────────────┘
               ↓                  ↓
        ┌──────────┐       ┌──────────────┐
        │ Stage Web │       │ Stage Electron│
        │ /auth/    │       │ 127.0.0.1:   │
        │ callback  │       │ {port}/      │
        └──────────┘       │ callback     │
                            └──────────────┘
```

## 核心组件

### Server 端

| 文件 | 职责 |
|------|------|
| `src/libs/auth.ts` | better-auth 配置：社交 provider、OIDC provider 插件、trusted clients 种子数据、session/cookie 策略 |
| `src/routes/auth/index.ts` | 所有鉴权路由的统一入口：sign-in 页、rate limiter、token auth 辅助路由、electron callback、well-known metadata、better-auth catch-all |
| `src/routes/oidc/electron-callback.ts` | Electron 回调中继页：服务端 HTML 页面通过 JS fetch() 将 auth code 转发到 Electron 本地 loopback |
| `src/routes/oidc/token-auth.ts` | Bearer token 辅助路由：`get-session`、`sign-out`、`list-sessions` |
| `src/utils/sign-in-page.ts` | 渲染 fallback HTML 登录页（Google/GitHub 按钮） |
| `src/utils/origin.ts` | 可信来源配置：`localhost`、`127.0.0.1`、`airi.moeru.ai`、`capacitor://localhost` |
| `src/libs/env.ts` | OIDC 相关环境变量定义（Valibot schema） |
| `src/libs/request-auth.ts` | 统一鉴权解析：优先读 better-auth session，再回退到受信任 OIDC access token |

### Client 端

| 文件 | 职责 |
|------|------|
| `packages/stage-ui/src/libs/auth-oidc.ts` | OIDC 协议实现：构建 authorize URL、PKCE 生成、code 换 token、token 刷新、flow state 持久化 |
| `packages/stage-ui/src/libs/auth.ts` | 高层鉴权编排：`signInOIDC()` 发起登录、`applyOIDCTokens()` 持久化 token、`fetchSession()` 同步会话、自动刷新调度 |
| `packages/stage-ui/src/stores/auth.ts` | Pinia auth store：持久化 `user`、`session`、`token`、`refreshToken` 到 localStorage |
| `packages/stage-shared/src/auth/pkce.ts` | PKCE 工具函数：`generateCodeVerifier()`、`generateCodeChallenge()`、`generateState()` |
| `apps/stage-web/src/pages/auth/callback.vue` | Web 回调页：提取 code → 换 token → 持久化 access token → `fetchSession()` → 跳转首页 |
| `apps/stage-web/src/pages/auth/sign-in.vue` | Web 登录页：调用 `signInOIDC()` 发起 OIDC 流程 |

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
# Web and Pocket are public clients (no secret, PKCE only)
OIDC_CLIENT_ID_WEB
OIDC_CLIENT_ID_ELECTRON, OIDC_CLIENT_SECRET_ELECTRON
OIDC_CLIENT_ID_POCKET
```

## Token 层次

| Token | 用途 | 存储位置 | 生命周期 |
|-------|------|---------|---------|
| Authorization Code | 一次性换 token | URL query param (`?code=`) | 极短，一次性 |
| OIDC Access Token (JWT) | 实际的 API 鉴权凭证（Bearer） | localStorage `auth/v1/token` | 1 小时 TTL，自包含，不存数据库 |
| OIDC Refresh Token | 刷新 access token | localStorage `auth/v1/refresh-token` | 长期，rotation 机制 |
| Session 对象 | UI / API 所需的用户态快照 | `fetchSession()` 后保存在 auth store | 跟随 access token 可解析结果 |

**为什么现在可以直接用 OIDC access token？** 因为服务端的 `resolveRequestAuth()` 已经统一支持两条路径：先走 `auth.api.getSession()` 解析 better-auth session；如果没有 session，再用 `jose.jwtVerify()` 本地验证 JWT 签名、issuer、audience、过期时间，然后通过 `findUserById()` 补齐用户信息。对业务路由来说，拿到的仍然是统一的 `{ user, session }` 结构。

**JWT 签发条件：** 前端在 authorize/token 请求中传递 `resource` 参数（值为 `API_SERVER_URL`），oauthProvider 据此签发 JWT 而非 opaque token。JWKS 通过 `/api/auth/jwks` 端点获取并缓存。

**撤销策略：** JWT 1 小时 TTL + refresh token rotation。signout 时撤销 refresh token，JWT 等自然过期。不使用 denylist 或 Redis。

**为什么不用 cookie？** 客户端和服务端跨域（如 `localhost:5173` vs `localhost:3000`），cookie 无法跨域传递。客户端 `credentials: 'omit'`，纯 Bearer token 鉴权。

## 登录流程

### Web 完整流程

```
Client (localhost:5173)                    Server (localhost:3000)                   Social IdP
        │                                          │                                      │
   1. signInOIDC()                                 │                                      │
      构建 PKCE (verifier + challenge)             │                                      │
      存 sessionStorage                            │                                      │
      window.location →                            │                                      │
        │                                          │                                      │
   2. GET /api/auth/oauth2/authorize               │                                      │
      ?response_type=code                          │                                      │
      &client_id=airi-stage-web                    │                                      │
      &redirect_uri=localhost:5173/auth/callback    │                                      │
      &code_challenge=xxx                          │                                      │
      &provider=github                             │                                      │
        │                                          │                                      │
        │                           3. 用户未登录                                           │
        │                              302 → /sign-in?...所有 OIDC 参数...                  │
        │                                          │                                      │
        │                           4. /sign-in 看到 provider=github                       │
        │                              重建 callbackURL = /api/auth/oauth2/authorize?...   │
        │                              302 → /api/auth/sign-in/social                     │
        │                                    ?provider=github                             │
        │                                    &callbackURL={OIDC authorize URL}            │
        │                                          │                                      │
        │                                          ──────── 302 to GitHub ───────────────► │
        │                                          │                              5. 用户授权
        │                                          │ ◄──────── callback ────────────────── │
        │                                          │                                      │
        │                           6. better-auth 创建 user + session（server cookie）     │
        │                              302 → callbackURL（= OIDC authorize）               │
        │                                          │                                      │
        │                           7. /api/auth/oauth2/authorize                         │
        │                              用户已有 session → 签发 authorization code            │
        │                              302 → redirect_uri?code=xxx&state=xxx              │
        │                                          │                                      │
   8. /auth/callback                               │                                      │
      consumeFlowState() 恢复 PKCE                 │                                      │
      验证 state 防 CSRF                            │                                      │
        │                                          │                                      │
   9. POST /api/auth/oauth2/token ──────────────►  │                                      │
      (code + code_verifier + client_id + resource) │                                      │
      ◄──── { access_token (JWT), refresh_token } ─ │                                      │
        │                                          │                                      │
  10. GET /api/auth/get-session ─────────────────►  │                                      │
      (Bearer: access_token)                       │                                      │
      ◄──── { user, session } ──────────────────── │                                      │
        │                                          │                                      │
  11. 写入 authStore → 跳转首页                      │                                      │
```

**关键设计：callbackURL 传递 OIDC 参数**

`/sign-in` 路由收到的 URL 包含所有 OIDC 授权参数（`response_type`、`client_id`、`redirect_uri`、`code_challenge` 等）。它将这些参数重建为完整的 OIDC authorize URL，作为 `callbackURL` 传给社交登录。社交登录完成后，用户被重定向回 OIDC authorize 端点，此时用户已有 server session，OIDC 流程继续签发 code。

### Electron 特殊处理

Electron 不使用自定义协议（`airi://`），而是在 main process 临时启动一个 HTTP server 监听 `127.0.0.1:{port}/callback`：
- 固定端口范围：19721-19725，按顺序尝试
- 收到回调后立即关闭 server
- 5 分钟超时安全机制

**服务端回调中继**：

Electron 的 OIDC redirect_uri 不再直接指向 loopback 端口，而是指向服务端的 `/api/auth/oidc/electron-callback`。这个端点返回一个 HTML 页面，页面通过 JS `fetch()` 将 auth code 转发到本地 loopback。

好处：
- 浏览器不显示 `http://127.0.0.1:19721/...` 这样的 URL
- 只需注册一个 redirect_uri（不再需要 5 个端口对应的 URL）
- Loopback server 需要设置 CORS `Access-Control-Allow-Origin: *`

端口编码方式：loopback 端口编码在 `state` 参数中，格式为 `{port}:{originalState}`。中继页面提取端口后，将 code 和原始 state 通过 fetch 发送到 `http://127.0.0.1:{port}/callback`。

### Bearer 鉴权解析

服务端通过 `src/libs/request-auth.ts` 解析请求头：

1. 先调用 `auth.api.getSession({ headers })`，支持标准 better-auth session / cookie / Bearer session token
2. 如果没有命中，读取 `Authorization: Bearer <token>`
3. 使用 `jose.jwtVerify()` 本地验证 JWT 签名、issuer、audience、过期时间
4. 从 JWT `sub` claim 提取 userId，调用 `findUserById()` 补齐用户信息
5. 构造统一的 `{ user, session }`

JWT access token 由 oauthProvider 签发，条件是前端在 authorize/token 请求中传递 `resource` 参数（值为 `API_SERVER_URL`）。JWKS 通过 `/api/auth/jwks` 端点获取并缓存。

这样业务中间件和路由层不需要关心 token 来自 better-auth session 还是 OIDC JWT access token。

### 自动 Token 刷新

客户端在 OIDC token 生命周期 80% 时自动调用 `/api/auth/oauth2/token`（`grant_type=refresh_token`），刷新后直接覆盖本地 access token。页面重载后从 localStorage 恢复刷新调度：

- `auth/v1/oidc-client-id` — 客户端 ID
- `auth/v1/oidc-client-secret` — 客户端 Secret
- `auth/v1/oidc-token-expiry` — Token 过期时间戳

### provider 参数直通

客户端在 authorize URL 中附带 `provider` 参数，server 的 `/sign-in` 路由会直接 302 到对应社交 provider，**跳过选择页**。没有 `provider` 参数时 fallback 到 HTML 选择页（兜底场景，如直接浏览器访问）。

## 路由注册顺序

Auth 路由集中在 `src/routes/auth/index.ts`，通过 `.route('/', authRoutes)` 挂载到根路径。路由注册顺序很重要：

1. `GET /sign-in` — 登录选择页（或直接 302 到社交 provider）
2. `USE /api/auth/*` — rate limiter（IP 限流）
3. `.route('/api/auth', createOIDCTokenAuthRoute(deps))` — token auth 辅助路由（`/get-session`、`/sign-out`、`/list-sessions`）
4. `.route('/api/auth/oidc/electron-callback')` — electron 回调中继
5. `GET /.well-known/oauth-authorization-server/api/auth` — OAuth 2.1 AS metadata
6. `GET /api/auth/.well-known/openid-configuration` — OIDC discovery
7. `['POST', 'GET'] /api/auth/*` — **catch-all**，将所有其他请求转发给 `auth.handler()`

自定义 auth 路由注册在 catch-all 之前，所以不会被 better-auth 拦截。`/api/auth/oauth2/authorize` 和 `/api/auth/oauth2/token` 等标准端点由 catch-all 转发给 better-auth 内部处理。

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

Capacitor 移动端无法正确处理 state cookie（系统浏览器和 WebView cookie jar 隔离），所以 better-auth 配置了 `skipStateCookieCheck: true`。PKCE 仍然提供 CSRF 防护。

### better-auth internalAdapter

`(await auth.$context).internalAdapter.createSession(userId)` 是创建 session 的正确路径。`auth.api` 是 HTTP endpoint handlers 的集合，没有 `createSession` 方法。参考 better-auth admin 插件和 test-utils 的用法。注意 `createAuth()` 返回 `any`（TS2742），需要无类型安全地访问 `$context`。

### OIDC 流程中断：callbackURL 必须指回 authorize

社交登录完成后，`callbackURL` 必须指向 `/api/auth/oauth2/authorize?...OIDC参数...`，否则用户会被重定向到服务端根路径，OIDC 授权码流程中断。`/sign-in` 路由从 URL query params 重建完整的 OIDC authorize URL 作为 `callbackURL`。

## 修改指南

- 新增 OIDC client → `src/libs/auth.ts` 的 `buildTrustedClientSeeds`，加环境变量到 `src/libs/env.ts`
- 改登录页 → `src/utils/sign-in-page.ts`（HTML），或 `src/routes/auth/index.ts` 的 `/sign-in` 路由
- 改认证中间件 → `src/app.ts` 的 session middleware
- 改 trusted origins → `src/utils/origin.ts`
- 改 Bearer 鉴权解析 → `src/libs/request-auth.ts`（JWT 本地验签，依赖 jose + JWKS）
- 改 token auth 辅助路由 → `src/routes/oidc/token-auth.ts`
- 改回调中继 → `src/routes/oidc/electron-callback.ts`
- 改 Auth 路由结构 → `src/routes/auth/index.ts`
- 调试 OIDC 流程 → 检查 `/sign-in` 的 callbackURL 是否正确重建，以及 `oidc_login_prompt` cookie
- Client 端登录逻辑 → `packages/stage-ui/src/libs/auth.ts` 和 `packages/stage-ui/src/libs/auth-oidc.ts`
- Electron 认证回调处理 → `apps/stage-tamagotchi/src/renderer/bridges/electron-auth-callback.ts`
