# Flux Meter（债务账本计费）

## 背景

Flux 是整数计费单位。但部分服务（TTS 字符、STT 秒、embedding token 等）的单价远小于 1 Flux：例如 TTS 当前定价 `FLUX_PER_1K_CHARS_TTS = 2`，意味着 1 Flux ≈ 500 字符。

最初的实现采用 `max(MIN_CHARGE_TTS, ceil(chars/1000 * rate))`，每个 TTS 请求都被向上取整为至少 1 Flux。这在前端把一整轮 Agent 回复切成 N 个短句分发的场景下极不公平：100 字的回复被切 10 段 = 10 Flux，而单次发完只要 1 Flux。

## 决策

实现一层通用的"债务账本"，把不到 1 Flux 的零头存在 Redis，跨请求累计，攒够整数 Flux 才下扣。

### 为什么不是 sessionID / turnId 聚合

考虑过让前端给每轮对话发一个 turnId，服务端按 turn 聚合后结算。否决理由：

1. **前端改造成本**：要生成 turnId、改 OpenAI 兼容请求 header、加 `finalize` 信号、处理崩溃路径
2. **预扣边界混乱**：一轮总字符数事先未知，余额检查要按"最坏情况"或"已累计 + 当前"估算，余额刚好够时容易在中途 402，把一轮对话切两半（前半段有声音、后半段没）
3. **结算依赖客户端信号**：finalize 不发就要 keyspace notification + worker 兜底，多实例下要选主或幂等
4. **欠账上限不可控**：一轮可以有几千字，欠账可能多 Flux

债务账本不依赖任何业务边界：每次精确扣，欠账恒定 < 1 Flux（< `unitsPerFlux` 个单位），TTL 到期抹零，对账简单。

### 为什么不是时间窗口

5 分钟聚合也能解决"短请求被高估"问题，但需要 cron / 懒扣双机制处理窗口边界，且窗口跨越用户会话时语义诡异。债务账本没有"窗口"概念，纯量化累计。

## 数据流

```
┌──────────┐  units    ┌─────────────┐
│  route   │──────────▶│ FluxMeter   │
│(handleX) │           │ accumulate()│
└──────────┘           └─────┬───────┘
                             │ Lua: INCRBY + 阈值判断 + DECRBY
                             ▼
                       ┌──────────┐
                       │  Redis   │ flux-meter:{name}:{userId}:debt
                       └─────┬────┘
                             │ 跨阈值 → fluxToDebit > 0
                             ▼
                       ┌──────────────────────┐
                       │ BillingService       │
                       │ consumeFluxForLLM()  │ ← 走原有 debitFlux + Stream
                       └──────────────────────┘
```

### Lua 脚本（原子）

```lua
local debt = redis.call('INCRBY', key, units)
redis.call('EXPIRE', key, ttl)
if debt >= unitsPerFlux then
  local flux = math.floor(debt / unitsPerFlux)
  redis.call('DECRBY', key, flux * unitsPerFlux)
  return {flux, debt - flux*unitsPerFlux}
end
return {0, debt}
```

INCRBY/DECRBY 的组合在 Redis 单线程模型下天然原子；多服务实例并发请求同一用户安全。

## API

`packages/server/src/services/billing/flux-meter.ts`

- `createFluxMeter(redis, billingService, { name, unitsPerFlux, debtTtlSeconds })` → meter 实例
- `meter.assertCanAfford(userId, newUnits, currentBalance)` — 请求前余额校验，余额不足直接 throw 402
- `meter.accumulate({ userId, units, currentBalance, requestId, metadata })` — 累加并按需结算，返回 `{ fluxDebited, debtAfter, balanceAfter }`
- `meter.peekDebt(userId)` — 读当前未结算字符数（运维/调试用）

## 复用指南

任何"消耗单位 < 1 Flux"的服务都应该走债务账本，不要重复实现"单请求最低消费"。

### 已接入

| 服务 | name | unitsPerFlux 来源 |
|---|---|---|
| TTS | `tts` | `1000 / FLUX_PER_1K_CHARS_TTS`（在 `app.ts` 装配时计算） |

### 推荐接入

| 服务 | name | unitsPerFlux 示意 |
|---|---|---|
| STT 转录 | `stt` | 60 秒 = 1 Flux |
| Embedding | `embedding` | 10000 token = 1 Flux |
| 自营小模型 chat | `llm-mini` | 视定价而定 |

**不适用**：每次调用本身就 ≥ 1 Flux 的服务（如图像生成）。直接 `consumeFluxForLLM` 即可，套一层 meter 反而降低可读性。

### 接入步骤

1. 在 `services/config-kv.ts` 加费率/TTL 配置项
2. 在 `app.ts` 用 `injeca.provide` 注册新 meter，注入对应路由 / 服务
3. 在路由中：先 `assertCanAfford`，调上游成功后 `accumulate`
4. 加单测覆盖：累计跨阈值、empty input、余额不足

## Tradeoff & 已知局限

- **欠账上限**：每用户每 meter 最多欠 `unitsPerFlux - 1` 个单位（< 1 Flux），TTL 到期抹零。这部分给用户。
  - 想严格不欠账：加 settler worker 监听 `__keyevent@0__:expired` 在过期时强制结算到下一个整 Flux。当前不做，量化损失太小。
- **审计粒度变粗**：`flux_transaction` 一条记录可能对应多次请求，description 固定为 `metered:<name>`。具体哪几个 requestId 贡献了这次扣费，靠 OTel span / `request_log` 反查。
- **预扣不精准**：`assertCanAfford` 按"当前累计 + 这次 units"算，无法预知后续请求。极端情况下用户余额从够到不够之间会有几次请求成功（最多欠 < 1 Flux），可接受。
- **TTL 重置**：每次 accumulate 都 `EXPIRE`，一个长期活跃用户的债务永远不会过期，会一直滚到下次跨阈值。这是期望行为。

## 不做

- 不做会话 / turn 级聚合（理由见上）
- 不做 keyspace notification 兜底结算（量化损失可忽略）
- 不在第一版支持 meter 间组合扣费（一次请求消耗多种资源）
- 不为 meter 单独建 transaction 表（`flux_transaction` 已够用）
