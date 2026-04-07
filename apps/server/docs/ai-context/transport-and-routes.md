# Transport And Routes

## 路由总览

应用在 `src/app.ts` 中挂载以下路由：

- `GET /health`
- `/api/auth/*`
- `/api/v1/characters`
- `/api/v1/providers`
- `/api/v1/chats`
- `/api/v1/openai`
- `/api/v1/flux`
- `/api/v1/stripe`
- `GET /ws/chat`

## 鉴权链路

### HTTP

- `sessionMiddleware(auth)`
  - 通过 `better-auth` 解析当前 session
  - 把 `user` / `session` 注入 Hono context
- `authGuard`
  - 检查 `c.get('user')`
  - 未登录直接 401

### WebSocket

`GET /ws/chat` 走 query token：

- 读取 `token`
- 用 `auth.api.getSession()` 验证 Bearer token
- 校验通过后为该 `user.id` 建立 Eventa peer

这意味着聊天 WS 的鉴权方式和普通 cookie session 路径不完全相同。

## 路由到服务映射

### `/api/auth/*` 及 `/sign-in`

实现位置：

- 路由入口：`src/routes/auth/index.ts`（通过 `.route('/')` 挂载到根路径）
- token auth 辅助路由：`src/routes/oidc/token-auth.ts`
- Electron 回调中继：`src/routes/oidc/electron-callback.ts`
- better-auth 配置：`src/libs/auth.ts`
- Bearer 解析：`src/libs/request-auth.ts`
- 登录页渲染：`src/utils/sign-in-page.ts`

特点：

- 基于 `better-auth` + `oauthProvider` 插件
- 开启 email/password、Google、GitHub 社交登录
- Bearer plugin + JWT plugin 已启用
- `/api/auth/*` 有独立 IP 限流
- `GET /api/auth/get-session`、`POST /api/auth/sign-out`、`GET /api/auth/list-sessions` 由本地路由处理
- Bearer token 会先尝试 better-auth session，再回退到受信任 OIDC access token
- 详见 `auth-and-oidc.md`

### `/api/v1/characters`

实现位置：

- route: `src/routes/characters/index.ts`
- service: `src/services/characters.ts`

主要能力：

- `GET /`
  - 默认返回当前用户拥有的角色
  - `?all=true` 返回全部未删除角色
- `GET /:id`
- `POST /`
- `PATCH /:id`
- `DELETE /:id`
- `POST /:id/like`
- `POST /:id/bookmark`

特点：

- 路由层做 `valibot` 校验
- 更新和删除会额外校验 `ownerId === user.id`
- 点赞和收藏是 toggle 语义

### `/api/v1/providers`

实现位置：

- route: `src/routes/providers/index.ts`
- service: `src/services/providers.ts`

主要能力：

- 用户 Provider Config CRUD
- 查询时会合并：
  - `user_provider_configs`
  - `system_provider_configs`

特点：

- `findAll(ownerId)` 通过 `unionAll` 合并系统配置和用户配置
- 用户只能改自己的 user config，不能改 system config

### `/api/v1/chats`

实现位置：

- route: `src/routes/chats/index.ts`
- service: `src/services/chats.ts`

主要能力：

- Chat CRUD
- 成员增删

聊天核心约束：

- 所有操作都会先校验用户是否属于 chat member
- 删除是软删除，写 `deletedAt`
- 消息序号 `seq` 在写消息时通过锁 chat 行串行分配

### `GET /ws/chat`

实现位置：

- route 注册：`src/app.ts`
- handler factory: `src/routes/chat-ws/index.ts`
- 底层事件适配：`src/libs/eventa-hono-adapter.ts`

主要 RPC：

- `sendMessages`
  - 调 `chatService.pushMessages()`
  - 再调 `chatService.pullMessages()` 生成广播 payload
- `pullMessages`
  - 调 `chatService.pullMessages()`

广播策略：

- 同实例：内存 `Map<userId, Set<EventContext>>`
- 跨实例：Redis Pub/Sub，channel 前缀 `chat:broadcast:`

实现约束：

- Redis Pub/Sub 只承担通知职责，不承担持久化和重放职责
- key / channel 与 payload 边界应集中收口，不要在调用点散落模板字符串和裸 `JSON.parse`
- 具体规范见 `redis-boundaries-and-pubsub.md`

### `/api/v1/openai`

实现位置：

- route: `src/routes/openai/v1/index.ts`
- 依赖服务：
  - `fluxService`
  - `billingService`
  - `configKV`
  - `requestLogService`

当前已开放：

- `POST /api/v1/openai/chat/completions`
- `POST /api/v1/openai/chat/completion`
- `POST /api/v1/openai/audio/speech`
- `POST /api/v1/openai/audio/transcriptions`

请求流程：

1. 校验已登录
2. 检查相关配置是否存在
3. 检查用户 Flux 是否大于 0
4. 代理请求到 `GATEWAY_BASE_URL`
5. 解析 usage，计算扣费
6. 记录 metrics
7. 调 `billingService.debitFlux()`
8. 异步写 `llm_request_log`

重要取舍：

- non-streaming
  - 先拿完整响应
  - 再扣费
  - 扣费失败会阻断响应
- streaming
  - 先把流回给客户端
  - 流结束后再 best-effort 扣费
  - 扣费失败只打 error log，不回滚给客户端

### `/api/v1/flux`

实现位置：

- route: `src/routes/flux/index.ts`
- services:
  - `fluxService`
  - `fluxTransactionService`

主要能力：

- `GET /api/v1/flux`
  - 读取当前用户余额
- `GET /api/v1/flux/history`
  - 读取用户可见流水

### `/api/v1/stripe`

实现位置：

- route: `src/routes/stripe/index.ts`
- services:
  - `fluxService`
  - `stripeService`
  - `billingService`
  - `configKV`

主要能力：

- `GET /packages`
- `POST /checkout`
- `GET /orders`
- `GET /invoices`
- `POST /portal`
- `POST /webhook`

主要职责拆分：

- `stripeService`
  - 负责把 Stripe customer / session / subscription / invoice 持久化
- `billingService`
  - 负责真正改余额

## 参数校验方式

输入 schema 位于各资源路由目录下的 `schema.ts`：

- `characters.schema.ts`
- `chats.schema.ts`
- `providers.schema.ts`

route 层统一使用 `safeParse`，失败时抛：

- `createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)`

## 中间件与 guard

### `configGuard`

作用：

- 检查某些 Redis 配置项是否已写入
- 缺失时返回 503

使用场景：

- LLM chat
- Stripe checkout
- 未来的 TTS / ASR

### `rateLimiter`

封装自 `hono-rate-limiter`，当前默认是单实例内存存储。

影响：

- 多实例部署下不是全局一致限流
- 适合作为基础保护，不适合作为严格额度控制
