# Server Architecture Overview

## 一句话总结

`apps/server` 是一个基于 `Hono` 的 Node 服务端，负责认证、角色/聊天/Provider 配置、Flux 余额、Stripe 充值和面向 gateway 的 LLM 代理。整体模式是：

- 路由层负责参数校验、鉴权、错误映射
- 服务层负责业务逻辑和数据库事务
- `Postgres` 负责持久化与账本真相
- `Redis` 负责缓存、配置 KV、Pub/Sub、Streams
- `injeca` 负责把这些依赖组装成一个可启动应用

## 入口与装配

核心入口在 `src/app.ts`：

- `createApp()`
  - 初始化 logger
  - 解析环境变量
  - 初始化 OpenTelemetry
  - 建立 Postgres / Redis 连接
  - 执行数据库迁移
  - 构建各个 service
  - 注册路由和中间件
- `runApiServer()`
  - 启动 HTTP 服务
  - 注入 WebSocket
  - 绑定 `uncaughtException` / `unhandledRejection`

CLI 入口在 `src/bin/run.ts`，支持两种角色：

- `api`
- `billing-consumer`

## 依赖注入结构

`app.ts` 使用 `injeca.provide()` 注册依赖，依赖关系大致如下：

- 基础设施
  - `env`
  - `otel`
  - `db`
  - `redis`
  - `configKV`
- 服务
  - `auth`
  - `characterService`
  - `providerService`
  - `chatService`
  - `stripeService`
  - `fluxTransactionService`
  - `fluxService`
  - `requestLogService`
  - `billingService`

这个装配顺序说明了几个事实：

- `billingService` 依赖 `db + redis`
- `fluxService` 只读余额，不承担余额写入职责
- `auth` 直接绑定数据库 schema，不是外部独立服务

## 应用层边界

### 1. HTTP / WS 传输层

在 `src/routes/` 和 `src/middlewares/`：

- 参数校验使用 `valibot`
- 用户身份来自 `sessionMiddleware` 和 `authGuard`
- 业务异常统一抛 `ApiError`
- 全局 `onError` 转成标准 JSON 错误响应

### 2. 业务服务层

在 `src/services/`：

- `characters.ts`
- `chats.ts`
- `providers.ts`
- `flux.ts`
- `billing-service.ts`
- `stripe.ts`

这里是主要改动面。大多数业务改动都不应该直接写进 route handler。

### 3. 持久化层

在 `src/schemas/`：

- Drizzle schema 基本覆盖了所有核心表
- 数据迁移由 `@proj-airi/server-schema` 提供
- `app.ts` 启动时会执行迁移

## 中间件与通用约束

全局中间件链路大致是：

1. `/api/*` 启用 CORS
2. `hono/logger`
3. 可选的 `otelMiddleware`
4. `sessionMiddleware`
5. `bodyLimit(1MB)`
6. 各 route 的局部 guard

需要记住的行为：

- WebSocket `/ws/chat` 在 `bodyLimit` 之前注册
- `sessionMiddleware` 不会阻断匿名请求，只是往 context 填 `user/session`
- `authGuard` 才会真正返回 401
- `rate-limit.ts` 目前是**内存限流**，不是分布式限流

## 错误模型

统一错误类型在 `src/utils/error.ts`：

- `ApiError(statusCode, errorCode, message, details)`

约定：

- 业务层可以直接抛 `ApiError`
- 未知异常会被包装成 `500 INTERNAL_SERVER_ERROR`
- 参数错误、权限错误、余额不足都已有明确 helper

## 关键设计取舍

### Flux 读写分离

- `FluxService`
  - 面向读取
  - Redis cache-aside
  - 新用户首次读取时初始化余额
- `BillingService`
  - 面向写入
  - debitFlux：事务内更新余额，事务后 XADD Redis Stream；credit 方法：事务内同步写流水和审计

这是服务端最重要的边界之一，尽量不要把写余额逻辑重新塞回 `flux.ts`。

### LLM 网关代理而不是本地 provider 编排

`/api/v1/openai` 并不直接调具体模型 provider，而是转发到 `config: GATEWAY_BASE_URL`。因此：

- 服务端关心的是鉴权、限流、计费、日志、观测
- 具体模型执行和 usage 返回格式由 gateway 决定

### Redis 有多种职责，但都不是余额真相源

Redis 在这里同时承担：

- Flux 余额缓存
- 运行时配置 KV
- WebSocket 跨实例广播 Pub/Sub
- 计费事件 Streams

但余额真相仍然在 Postgres。

## 当前值得注意的实现信号

- `src/services/request-log.ts` 和 `src/services/llm-request-log.ts` 职责重复，当前实际注入的是前者。
- `src/schemas/accounts.ts` 和 `src/schemas/auth.ts` 内容重复，`createAuth()` 使用的是 `accounts.ts`。
- `src/routes/openai/v1/index.ts` 已实现 `handleTTS` / `handleTranscription`，但路由仍被注释掉，当前只开放 chat completions。
