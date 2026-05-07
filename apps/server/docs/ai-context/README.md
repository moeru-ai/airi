# AIRI Server AI Context

这组文档面向后续 AI / 开发者协作，目标是让人快速回答四个问题：

1. 服务端是怎么启动和组装的
2. 每条 API / WS 请求最终落到哪个服务
3. 哪些状态以 Postgres 为真相源，哪些只是缓存或派生数据
4. 计费、充值、事件分发这些高风险链路有哪些约束

## 文档索引

- `architecture-overview.md`
  - 入口、依赖注入、应用装配、核心边界
- `transport-and-routes.md`
  - HTTP / WebSocket 接口面、路由到服务映射、鉴权与中间件
- `data-model-and-state.md`
  - 主要表、状态归属、缓存与事件模型
- `workers-and-runtime.md`
  - 单 `api` role、进程内后台 loop、advisory lock 协调、运行时约束
- `redis-boundaries-and-pubsub.md`
  - Redis key / channel 收口、Pub/Sub 边界、运行时校验约束
- `config-and-naming-conventions.md`
  - `configKV` 默认值来源、Redis key 命名、HTTP route 命名、后续收敛 TODO
- `billing-architecture.md`
  - 计费链路专项说明，重点看 Flux ledger / Stripe 幂等
- `flux-meter.md`
  - Sub-Flux 计量服务（TTS/STT 等）的债务账本机制与复用指南
- `observability-conventions.md`
  - traces / metrics 命名规则，标准 OTel 字段与 `airi.*` 自定义字段边界
- `auth-and-oidc.md`
  - 认证与 OIDC Provider 架构、登录流程、trusted clients、踩坑记录
- `email-auth-resend.md`
  - Resend 接入、Better Auth 四个邮件 callback、范围 / 决策 / 不做项
- `account-deletion.md`
  - 账号注销架构：auth 表 hard delete + 业务表软删，handler 协议、各业务行为、failure 模型
- `admin-flux-grants.md`
  - Admin 批量发 FLUX（活动赠送）：单一同步 POST，无 batch 表无后台 loop，`adminGuard` 邮箱白名单 + 可选 `idempotencyKey`
- `verifications/email-auth.md`
  - 邮箱注册 / 忘记密码 / OIDC 桥接登录 三条用户路径的真实实测证据
- `verifications/account-deletion.md`
  - 账号注销端到端验证：what's verified（schema/typecheck/units）和 what's pending（live DB + Resend + Stripe trace）

## 快速结论

- `apps/server/src/app.ts` 是唯一的 API 应用装配入口。
- 服务端采用 `Hono + injeca + Drizzle + Redis + better-auth`。
- 路由层整体较薄，业务逻辑主要在 `src/services/`。
- **Postgres 是所有余额与计费状态的唯一真相源**，Redis 只做缓存、KV、Pub/Sub。计费链路不再使用 Redis Streams。
- WebSocket 只用于聊天同步，跨实例广播依赖 Redis Pub/Sub。
- 对外 LLM 能力不是本地推理，而是转发到配置里的 gateway，再按 usage / fallback rate 扣 Flux。

## 修改代码前建议先看

- 改 API 入口或新增依赖：先看 `architecture-overview.md`
- 改某个接口行为：先看 `transport-and-routes.md`
- 改表结构、缓存或幂等：先看 `data-model-and-state.md`
- 改后台 loop、部署形态：先看 `workers-and-runtime.md`
- 改 Redis key、Pub/Sub 边界：先看 `redis-boundaries-and-pubsub.md`
- 改配置默认值、Redis key 命名、HTTP route 命名：先看 `config-and-naming-conventions.md`
- 改扣费、充值、Stripe：先看 `billing-architecture.md`
- 改 trace / metric attributes、OTel 命名：先看 `observability-conventions.md`
- 改认证、OIDC、登录流程：先看 `auth-and-oidc.md`
- 改邮件 service / Better Auth 邮件 callback：先看 `email-auth-resend.md`
