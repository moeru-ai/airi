# Config And Naming Conventions

## 目标

这篇文档收口三类容易逐步漂移的约定：

- `configKV` 的默认值和读取语义
- Redis key / channel 的命名规则
- HTTP route 的资源命名规则

这些约定不是“代码风格建议”，而是为了减少：

- 默认值写两份导致的配置漂移
- Redis key 命名混用导致的排障成本
- HTTP route 语义不稳定导致的版本化困难

## `configKV` 约定

### 单一真相源

`src/services/config-kv.ts` 中的 `ConfigEntrySchemas` 是以下三件事的单一真相源：

- 配置值的运行时校验
- 配置值的默认值
- Redis 中的序列化 / 反序列化 shape

这意味着：

- 默认值必须定义在 `ConfigEntrySchemas`
- 业务代码不要再写第二份 `?? defaultValue`
- `configKV.get()` / `configKV.getOrThrow()` 应直接依赖 schema 默认值

### 读取语义

- `getOptional(key)`
  - 用于“这个 key 合法地可以不存在”的场景
  - 对 required key，未配置时返回 `null`
  - 对带 schema 默认值的 key，返回默认值
- `getOrThrow(key)`
  - 用于“缺失就是配置错误”的场景
  - required key 未配置时抛 `CONFIG_NOT_SET`
- `get(key)`
  - 是 `getOrThrow(key)` 的别名
  - 默认用于业务代码

### 禁止事项

- 不要给 `getOptional` 增加调用点默认值参数，例如 `getOptional(key, fallback)`
- 不要同时在 schema 和调用侧维护两份默认值
- 不要绕过 `configKV` 直接从 Redis 读配置

### 当前例子

推荐：

```ts
const fluxPer1kTokens = await configKV.get('FLUX_PER_1K_TOKENS')
const maxCheckoutAmount = await configKV.get('MAX_CHECKOUT_AMOUNT_CENTS')
```

不推荐：

```ts
const fluxPer1kTokens = (await configKV.getOptional('FLUX_PER_1K_TOKENS')) ?? 1
const maxCheckoutAmount = (await configKV.getOptional('MAX_CHECKOUT_AMOUNT_CENTS')) ?? 1_000_000
```

## Redis key / channel 命名

### 命名规则

Redis key 和 channel 统一采用“分段命名”，推荐使用冒号 `:` 作为分隔符：

```txt
{scope}:{id}:{resource}
{scope}:{id}:{subscope}:{subid}:{resource}
lock:{domain}:{id}
config:{key}
```

推荐例子：

```txt
user:{userId}:flux
config:{key}
chat:{userId}:broadcast
lock:user:{userId}:flux
```

不推荐例子：

```txt
flux:{userId}
chat:broadcast:{userId}
userFlux:{userId}
userUidFlux1
```

### 设计原则

- 前缀表达 namespace，而不是随手缩写
- 真实 Redis key 不要出现 `1`、`2` 这种占位编号
- 参数占位编号只用于文档里的模板名，不用于运行时 key
- key / channel 必须通过 helper 收口，不要在业务代码里散落模板字符串

### 文档里的模板命名

如果要在文档中表示“这个 key 有几个参数位”，可以用编号描述模板：

- `userUserId1Flux`
- `configKey1`
- `lockDomain1Id1`

但最终真实 key 仍然必须是：

```txt
user:{userId}:flux
config:{key}
lock:{domain}:{id}
```

## HTTP route 命名

### 资源命名原则

- 优先使用复数资源名
- 从属资源优先挂在父资源下
- 当前登录用户资源优先使用 `me`

推荐：

```txt
/api/v1/flux
/api/v1/flux/history
```

不推荐：

```txt
/api/user/flux
/api/flux
```

### 版本化约束

如果某类 HTTP API 需要长期稳定对外契约，优先在一个明确子树下版本化，例如：

```txt
/api/v1/...
/api/v1/openai/...
```

不要让“部分资源版本化、部分资源裸挂”长期并存而没有说明。

## TODO

- Replace DB-derived HTTP request schemas for characters/providers/chats with explicit DTO schemas.
- Move ownership and membership authorization rules behind actor-aware service APIs instead of splitting them across routes and services.
- Stabilize HTTP response shapes so services no longer leak raw Drizzle returning arrays to routes.
- Encode chat member invariants in schema validation and map those failures to 4xx API errors.
- Split the OpenAI compat route and chat WebSocket handler into smaller modules so transport code stops owning orchestration complexity.
- 把 `apps/server` 中现有 Redis key / channel 继续向 helper 收口，避免业务代码里散落模板字符串。
- 统一把旧式 key 命名迁移到分段命名风格，优先处理 Flux cache、chat broadcast、lock key。
- 给 `configKV` 增补一份“哪些配置属于 infra、哪些属于运营策略”的清单，避免继续模糊放置位置。
- 把所有 `configKV.getOptional(...) ?? defaultValue` 模式清理掉，默认值统一回到 `ConfigEntrySchemas`。
- 评估是否继续沿用统一 `/api/v1/*` 版本树，还是为兼容 API 与业务 API 引入更明确的子域分隔。
