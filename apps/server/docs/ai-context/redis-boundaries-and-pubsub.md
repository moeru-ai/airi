# Redis Boundaries And Pub/Sub

## 目标

这篇文档约束服务端使用 Redis 时的几个高风险边界：

- key / channel 拼接
- Pub/Sub payload 序列化与反序列化
- Redis 返回值的运行时校验
- Redis 与 Postgres 的职责边界

这不是“推荐写法”集合，而是后续改代码时应该默认遵守的约束。

## 一句话规则

- 不要在业务代码里到处手写 Redis key / channel 模板字符串。
- 不要把 TypeScript 类型注解当成 Redis 边界的运行时校验。
- 不要把 Pub/Sub 当持久化通道。
- 不要让 Redis 承担余额、账本、订单这类真相源职责。

## Redis 职责边界

当前 `apps/server` 中 Redis 主要承担四类职责：

- cache
  - 例如 `user:{userId}:flux`
- config KV
  - 例如 `config:{key}`
- Pub/Sub
  - 例如聊天跨实例广播 `chat:{userId}:broadcast`
- Streams
  - 例如 `billing-events`

其中：

- Postgres 是余额、账本、订单、聊天消息等持久状态的唯一真相源
- Redis Pub/Sub 只负责降低跨实例通知延迟，不提供持久化、回放、补偿
- Redis Streams 用于异步事件消费，但也必须在边界层做输入输出校验

## Key / Channel 收口规则

### 必须收口

Redis key 和 Pub/Sub channel 必须通过单独 helper 构造，不要在多个调用点重复写模板字符串。

推荐模式：

```ts
function fluxRedisKey(userId: string): string {
  return `user:${userId}:flux`
}

function userBroadcastChannel(userId: string): string {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new TypeError('user broadcast channel requires a non-empty string userId')
  }

  return `chat:${userId}:broadcast`
}
```

这样做的原因不是“风格统一”，而是为了避免：

- key 前缀分散在多个文件
- 某个调用点把对象、空串、错误 id 拼进 channel
- 后续重构前缀或路由粒度时漏改

### 禁止依赖模板字符串兜底

不要假设 `` `${value}` `` 可以安全把任意值转成 Redis key。

原因：

- 如果 `value` 在运行时是对象，会得到 `[object Object]`
- 这类错误不会在 TypeScript 编译期暴露
- 一旦写进 Redis channel / key，排查成本很高

## Pub/Sub Payload 规则

### 发布侧

发布侧必须显式构造消息对象，不要把“业务对象刚好长得像 payload”当成协议。

推荐模式：

```ts
interface BroadcastMessage {
  userId: string
  payload: {
    chatId: string
    messages: unknown[]
    fromSeq: number
    toSeq: number
  }
}

function createBroadcastMessage(
  userId: string,
  payload: BroadcastMessage['payload'],
): BroadcastMessage {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new TypeError('broadcast message requires a non-empty string userId')
  }

  return { userId, payload }
}
```

### 消费侧

消费侧不要只写：

```ts
const data = JSON.parse(message) as BroadcastMessage
```

因为这只是类型断言，不是校验。

至少要验证：

- `userId` 是非空字符串
- `payload.chatId` 是字符串
- `payload.messages` 是数组
- `fromSeq` / `toSeq` 是数字

如果消息不合法，应该记录错误并丢弃，而不是继续广播到本地连接。

## Streams 边界规则

Redis Streams 的参考实现已经在 `src/libs/mq/stream.ts` 里。

这层模式值得复用的点有两个：

- 输入通过 `serialize()` 收口
- 输出通过 `deserialize()` 和运行时检查收口

也就是说：

- 不要在业务代码里裸写 `XADD` / `XREADGROUP`
- 不要相信 Redis 返回值一定符合你期望的 shape
- 边界校验失败时应该尽早抛错，而不是继续传播脏数据

## Chat WS 当前约束

`src/routes/chat-ws.ts` 当前采用：

- 同实例内存连接表
- 跨实例 Redis Pub/Sub

这个设计的语义必须明确：

- 广播通知不是持久化消息
- 丢广播不会丢聊天真相数据
- 客户端补齐消息仍然依赖 `pullMessages`

因此后续如果改聊天同步：

- 需要“可重放”时，不要继续堆在 Pub/Sub 上
- 需要“跨实例即时通知”时，可以继续用 Pub/Sub
- 需要“持久事件消费”时，应优先考虑 Streams

## 修改 Redis 代码时的检查清单

- 这个 Redis 数据是 cache、KV、Pub/Sub 还是 Stream？
- 它是不是被误当成真相源？
- key / channel 是否通过 helper 统一构造？
- 是否校验了关键标识符，例如 `userId`、`chatId`、`streamMessageId`？
- Pub/Sub payload 是否有显式创建函数和解析函数？
- 解析失败时是否会安全丢弃，而不是继续传播？
- 这个需求是否其实应该用 Streams，而不是 Pub/Sub？

## 当前代码可直接参考的位置

- key helper
  - `src/services/flux.ts`
- Streams 边界封装
  - `src/libs/mq/stream.ts`
- Pub/Sub 聊天广播
  - `src/routes/chat-ws.ts`
- 命名规范和待迁移事项
  - `config-and-naming-conventions.md`

## 对 AI / 后续修改者的直接要求

- 新增 Redis key / channel 时，先写 helper，再写调用点
- 新增 Pub/Sub payload 时，先定义消息 shape 和 parse / create 边界，再接业务逻辑
- 如果看到业务代码里散落 `` `prefix:${id}` ``，优先做小范围收口
- 如果看到 `JSON.parse(...) as SomeType` 出现在 Redis 边界，默认把它视为待修复点
