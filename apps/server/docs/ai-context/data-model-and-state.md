# Data Model And State

## 真相源原则

这套服务端最关键的状态归属如下：

- `Postgres`
  - 用户认证数据
  - 角色、聊天、Provider 配置
  - Flux 余额与账本
  - Stripe 业务镜像
  - LLM 请求日志
- `Redis`
  - Flux 余额缓存
  - 服务配置 KV
  - 聊天跨实例广播
  - 计费事件队列

如果要判断“改哪个地方才算真的改成功”，大多数场景答案都是 Postgres。

## 主要表分组

### 认证

- `user`
- `session`
- `account`
- `verification`

来源文件：

- `src/schemas/accounts.ts`

说明：

- `better-auth` 直接用这组表
- `src/schemas/auth.ts` 基本是重复副本，目前不是主要依赖入口

### 角色与用户交互

- `characters`
- `character_covers`
- `avatar_model`
- `character_capabilities`
- `character_i18n`
- `character_prompts`
- `user_character_likes`
- `user_character_bookmarks`

来源文件：

- `src/schemas/characters.ts`
- `src/schemas/user-character.ts`

说明：

- 角色实体采用软删除
- 点赞与收藏通过中间表建模
- 计数值冗余保存在 `characters` 表上

### 聊天

- `chats`
- `chat_members`
- `messages`
- `media`
- `stickers`
- `sticker_packs`

来源文件：

- `src/schemas/chats.ts`

说明：

- `messages.seq` 是会话内顺序字段
- 写消息时通过 `SELECT ... FOR UPDATE` 锁 chat 以串行生成 seq
- `senderId` 是宽松字段，不强制外键

### Provider 配置

- `user_provider_configs`
- `system_provider_configs`

来源文件：

- `src/schemas/providers.ts`

说明：

- 运行时查询时会把系统配置和用户配置拼接成一个结果集
- `config` 是 `jsonb`

### Flux / 账本 / 审计

- `user_flux`
- `flux_transaction`
- `flux_transaction`

来源文件：

- `src/schemas/flux.ts`
- `src/schemas/flux-transaction.ts`
- `src/schemas/flux-transaction.ts`

职责边界：

- `user_flux`
  - 当前余额快照
- `flux_transaction`
  - append-only 账本流水
  - 偏系统真相源
- `flux_transaction`
  - 用户可见历史
  - 偏产品展示

关键约束：

- `flux_transaction` 对 `(userId, requestId)` 有部分唯一索引
- 用来做扣费 / 充值幂等

### Stripe 业务镜像

- `stripe_customer`
- `stripe_checkout_session`
- `stripe_subscription`
- `stripe_invoice`

来源文件：

- `src/schemas/stripe.ts`

说明：

- 这些表是 Stripe 状态的本地镜像
- 真正的余额变化仍由 `billingService` 写入 `user_flux + flux_transaction`
- `fluxCredited` 字段用于避免重复入账

### LLM 请求日志

- `llm_request_log`

来源文件：

- `src/schemas/llm-request-log.ts`

说明：

- 只做追加写入
- 明确不加 user 外键，以避免高并发写入的额外约束成本

## 服务与状态写入边界

### `createFluxService()`

负责：

- 余额读取
- 新用户首次读取时初始化 `user_flux`
- Redis cache-aside

不负责：

- 扣费
- 充值
- transaction 写入

### `createBillingService()`

负责：

- 所有余额写操作
- DB 事务
- debitFlux：事务内仅更新余额；事务后 XADD Redis Stream，transaction log 由 billing-consumer 异步写入
- credit 方法：事务内同步写 transaction
- 事务提交后 best-effort `redis.set` 更新 Flux 余额缓存

这是所有 Flux 写路径应收敛到的中心。

### `createStripeService()`

负责：

- Stripe 实体 upsert

不负责：

- 最终 Flux 入账

真正入账通过 `billingService.creditFluxFromStripeCheckout()` 或相关 credit 方法完成。

## Redis 中的数据类型

### Flux 缓存

- key: `flux:<userId>`
- value: 字符串化整数

写入来源：

- `fluxService.getFlux()` cache miss 后回填
- `billingService` 余额事务提交后 best-effort `redis.set` 直接更新（API 进程内同步）

### 配置 KV

- key: `config:<CONFIG_NAME>`

由 `config-kv.ts` 管理，支持：

- 数值
- 字符串
- `FLUX_PACKAGES` JSON

### 聊天跨实例广播

- channel: `chat:broadcast:<userId>`

### 计费事件流

- stream: 默认 `billing-events`

## 幂等与并发控制

### 余额并发

`billingService` 在事务中：

1. `SELECT user_flux FOR UPDATE`
2. 计算新余额
3. 写余额（debitFlux 事务内仅此一步；credit 方法同步写 transaction）
4. 事务提交后 XADD Redis Stream（debitFlux）或直接返回（credit）

这保证同一用户余额更新是串行化的。

### Stripe 幂等

主要依赖：

- `stripe_checkout_session.fluxCredited`
- `stripe_invoice.fluxCredited`
- `flux_transaction(userId, requestId)` 唯一约束

## 现有代码中的结构信号

- `request-log.ts` 与 `llm-request-log.ts` 完全重叠，后者更像旧名残留。
- `accounts.ts` 与 `auth.ts` 也是重复 schema，后续如果做整理，应先统一真实使用入口再删副本。
