---
date: 2026-05-30
topic: voice-pack
---

# Voice Pack 音色系统需求

## Summary

两件事一起做，号池负载均衡优先：

1. **TTS 号池负载均衡（最高优先）。** 一个上游 `app_id` 只有 10 并发，买并发贵，所以一个账号开 10 个 app（10 个 app_id）= 100 并发。需要一个容量感知的号池：实时追踪每个 app_id 的在途请求数，把流量路由到还有并发余量的号，并对池子整体水位做监控。
2. **Voice Pack 音色系统。** 引入服务端 `voice_packs` 表，把 `provider + model + voice + 参数覆盖` 收敛成用户只选一个「声线」。绑定到角色卡时把**解析后的值快照冻结**进卡，之后改表永不影响已绑定的卡。一个 Voice Pack pin 一个 tts model id，该 model 的 upstreams/keys 就是上面那个号池。

## Problem Frame

**号池并发约束。** 上游 TTS 服务按 `app_id` 限制并发（典型 10），扩并发额度很贵。绕开的办法是同一账号注册多个 app 拿到多个 `app_id` 凑并发。但当前服务端 `routeTts` 的 `createKeyRotator`（`apps/server/src/services/.../router.ts:429`）是**盲轮转**：不追踪每个号的在途请求数，会把某个号打爆到并发上限、别的号还闲着；跨 upstream 更是固定顺序、不分摊。结果是 100 并发的理论容量用不满，还会因为单号超限触发 429。

**音色被动漂移。** 当前音色是全局 UI 状态：`active-provider` + `active-model` + `voice` 三个独立 localStorage key（`packages/stage-ui/src/stores/modules/speech.ts:32-35`），不绑定角色卡、不是快照。voice catalog 是 per-model 的，上游 model 下线、默认音色被改、目录调整时，用户选好的音色会悄悄变成另一个甚至失效。`DEFAULT_TTS_VOICES`（commit `95915923e`）已把 per-model 默认音色配置化、并要求 caller 必须显式传 voice，但「绑定后永不变」这层语义还不存在。

**用户被迫理解 provider 拓扑。** 选音色要先懂 Microsoft / 阿里云 等各自的 model 和 voice id 格式，对用户是无关负担。

## Key Decisions

- **号池负载均衡排在最前，且与 Voice Pack 解耦。** 它是 TTS 基建，惠及所有 TTS 合成，不依赖 voice_packs。Voice Pack 只是 pin 一个 tts model id，那个 model 的 upstreams/keys 即号池。一个计划覆盖两块，unit 顺序把号池 LB 放最前。
- **容量感知而非盲轮转。** 调度按每个 app_id 的在途并发余量挑号，不是 round-robin 盲转。并发计数若服务端多副本则必须放共享存储（Redis，与现有 flux meter 同源），否则各副本各算、号池超卖。（部署拓扑规划时实测确认。）
- **Voice Pack library 是服务端 `voice_packs` 表（复数表名），管理员策展。** 不是前端 localStorage。本轮只装「云提供商音色」= `provider + model + voice + 参数覆盖`，同时覆盖标准 voice 与阿里云克隆 model id 两类（结构相同）。软禁用用 `enabled` 列，不删行。
- **参数覆盖是 pack 身份的一部分。** 同一 `provider+model+voice` 配不同 pitch / 响度 = 不同 Voice Pack，用户分别可选（Neuro-sama 那个 Pitch +20%、响度 +5% 的例子）。
- **绑定冻结的是解析后的值，不是表外键。** 角色卡冻结 `provider/model/voice/params/tier + pin 的 tts model id` 进 `extensions.airi.modules.speech.voicePack`（扩 `airi-card.ts:173-176` 现有 speech 快照点）。存外键会导致改表连带改卡，回到漂移。`resolveAiriExtension`（`airi-card.ts:161`）处理字段缺失，不加 backward-compat guard。
- **failover 复用现有 routeTts。** 等价后端容灾（耗尽 fail-fast、带上下文、绝不静默换音色）复用 `routeTts` 现有跨 upstream/key 重试。R7「等价判定」（同音色、可复现参数）是服务端不校验的新语义，只能在 `voice_packs` 定义层把关。
- **tier 复用 `tts-billing-tiers.md` 的 lite/standard/pro/premium 命名。** `voice_packs` 一列，冻进快照。本轮只有一个 meter（`FLUX_PER_1K_CHARS_TTS` 单值），四档 meter 拆分属 billing 独立线，所以本轮 tier 是**展示 + 数据**，「按最高档取价」暂无真实差价效果。

## Key Flows

- F1. **号池容量感知路由**
  - **Trigger:** 一次 TTS 合成请求进入服务端路由。
  - **Steps:** 解析目标 tts model 的号池（upstreams/keys，每个 key 对应一个 app_id）→ 读各 app_id 当前在途并发数 → 挑还有并发余量的号 → 占用一个并发槽 → 发起合成 → 完成/失败释放槽。全部号满 → 排队或返回容量错误（不静默吞）。
  - **Covered by:** R1, R2, R3
- F2. **绑定流程**
  - **Trigger:** 用户选定一个 Voice Pack 绑定到某角色卡。
  - **Steps:** 从 `voice_packs` 读 enabled 的 pack → 把解析后的值快照冻结写入角色卡 extensions → 角色卡此后只读自己的冻结快照。
  - **Covered by:** R8, R9
- F3. **合成读快照 + 容灾**
  - **Trigger:** 角色卡触发 TTS 合成。
  - **Steps:** 读角色卡冻结快照 → 映射 tts model id → 参数走 SSML prosody / adapter options → 经号池 LB（F1）挑号合成 → 后端不可用在等价后端间 failover，耗尽 fail-fast。
  - **Covered by:** R10, R11

## Requirements

**TTS 号池负载均衡（最高优先）**

- R1. 服务端追踪号池内每个 `app_id`（key）的实时在途请求数，路由时挑还有并发余量的号，不用盲轮转。
- R2. 并发计数在服务端多副本部署下跨副本共享一致（避免超卖）；单副本则进程内即可。最终方案以实测部署拓扑为准。
- R3. 号池全满时不静默降级：要么排队等空位，要么返回带上下文的容量错误（可 grep），让调用方看见。
- R4. 跨 upstream 的多个号都参与负载均衡，不是固定优先第一个 upstream。
- R5. 监控号池水位：每个 app_id 的并发利用率、饱和、429、池子整体使用率，出到现有可观测栈（指标走 Prometheus/OTel metrics，trace 已有 Langfuse）。
- R6. 容量感知调度跳过最近失败/限流的号一段时间（轻量 reactive 健康判定），避免反复打到坏号。
- R7. 一个号（app_id）打满或失败时，failover 到池内其它号；全池耗尽 fail-fast，带 `triedKeys/triedUpstreams` 类上下文，复用现有 `mapUpstreamError` 模式。

**Voice Pack 表与管理**

- R8. 服务端 `voice_packs` 表存「云提供商音色」：`provider + model + voice_id + 参数覆盖（pitch/rate/volume 等）+ tier + enabled`。同时覆盖标准 voice 与云端克隆 model id 两类。
- R9. 参数覆盖是 pack 身份的一部分：同 `provider+model+voice` 不同参数 = 不同 pack。
- R10. admin CRUD HTTP API：新增 / 编辑 / 禁用（软禁用）/ 列出 pack，复用现有 admin + injeca 机制。本轮不做管理 UI。
- R11. 市场侧只列 `enabled` 的 pack。

**角色卡绑定与合成**

- R12. 角色卡绑定 Voice Pack 时，冻结**解析后的值**（provider/model/voice/params/tier + pin 的 tts model id）进 `extensions.airi.modules.speech.voicePack`；改表不影响已绑定卡。
- R13. 合成读冻结快照，参数走 SSML prosody（SSML-capable provider）或 adapter speed/extraOptions；某参数无法在目标后端应用时 fail-fast 报错，不静默丢弃。
- R14. 提供最小绑定入口（复用现有 speech 设置页选 pack → 触发冻结），保证端到端可绑可合成可验证。
- R15. tier：`voice_packs` 一列，复用 lite/standard/pro/premium，冻进快照（本轮展示 + 数据，不碰实际扣费）。

## Acceptance Examples

- AE1. **号池容量感知（覆盖 R1、R4）。** 池内 10 个 app_id 各上限 10 并发。并发打到 50 路时，请求被摊到多个号（如每号约 5 路），不是把前几个号打满到 10 再溢出。
- AE2. **不超卖 + 不静默（覆盖 R2、R3）。** 多副本下并发计数共享：100 路全满时第 101 路排队或收到容量错误，不会因为副本各算各的把某号打到 11 并发。
- AE3. **坏号退避（覆盖 R6、R7）。** 某 app_id 连续 429/失败 → 一段时间内不再被选中，流量转到健康号；全池耗尽才 fail-fast 带上下文。
- AE4. **绑定后不漂移（覆盖 R12）。** 绑定 Voice Pack A 到角色卡 → 之后在 `voice_packs` 编辑 A（换 voice、改参数）或禁用 A → 角色卡音色不变，仍用绑定时快照。
- AE5. **参数不可应用 fail-fast（覆盖 R13）。** 冻结快照带某 provider 不支持的参数 → 合成报错指出该参数无法应用，而非静默出声丢参数。

## Scope Boundaries

**Deferred for later（第二轮或独立线）**

- 参考音频整块（含 materialize 字节存储、随机 roll、情绪标签）。未来落 `voice_pack_reference` 子表（FK → `voice_packs`，一个 pack 多条参考音频）；`voice_packs` 永远是唯一身份/市场/计费实体，市场/绑定/合成只读它、不做多态双表读。本轮只把这个形状记进文档，不建表。
- emotion embedding 内容类型（百分比向量）。
- 声音克隆 `upload → 调云端 clone API → 轮询 model id` 流程；本轮只消费已克隆好的 model id。
- 四档计量器拆分（lite/standard/pro/premium 各一个 `ttsMeter`），属 `tts-billing-tiers.md` 线。
- 用户侧精选市场浏览页（声线卡片列表 + tier badge filter）。本轮只做最小绑定入口。
- Voice Pack 管理 UI 页面（本轮 admin 只出 HTTP API）。
- 可分发市场（发布、下载、分享他人的 Voice Pack）。

## Dependencies / Assumptions

- 号池并发计数的存储方案依赖 server 部署拓扑（多副本 → Redis 共享，复用 flux meter 的 Redis pattern；单副本 → 进程内）。规划/实现时实测确认。
- 现有 `routeTts` 跨 upstream/key 重试、`mapUpstreamError`、`fallbackHttpCodes`（含 429）是号池 failover 的复用基础。
- `app_id` / access token 在 `ttsUpstreamSchema`（`config-kv.ts:57-61`）的落位（keys[] 还是 adapterParams）需按 Volcengine adapter 实测确认，决定「一个号」对应 schema 哪个粒度。
- 监控指标出口：trace 已接 Langfuse（OTel SpanProcessor），并发 gauge/counter 类指标需确认现有 Prometheus/OTel metrics 注册点。
- `packages/ccc` 的 `Extensions` 开放可扩展（`extensions.ts:1`），冻结快照扩 `extensions.airi.modules.speech`。角色卡正在上整卡 LWW 云同步（`docs/ai/context/plans/2026-05-09-character-cards-cloud-sync-design.md`），快照 schema 改动会被同步带走，需对齐。
- `tts-billing-tiers.md` 的四档命名是 tier 取值来源；该文档当前在 main worktree 未提交，本分支引用时注意同步。

## Sources / Research

- `apps/server/src/services/.../router.ts:413-617` — `routeTts` 主循环、`dispatchOneTtsUpstream`、`createKeyRotator`（盲轮转，号池 LB 的改造点）。
- `apps/server/src/app.ts:616-632` — `ttsMeter` = `createFluxMeter`（Redis 用法，号池并发计数可复用的 Redis pattern）。
- `apps/server/src/services/adapters/config-kv.ts:57-61, 83-87` — `ttsUpstreamSchema` / `ttsModelSchema`（多 upstreams/keys 结构，号池建模点）。
- `apps/server/src/routes/openai/v1/index.ts:489-642, 738` — `handleTTS`、`/audio/voices` catalog、`ttsGuard`。
- `packages/stage-ui/src/stores/modules/airi-card.ts:161-215` — 角色卡 speech 快照写入/读取（冻结快照落点）。
- `packages/stage-ui/src/stores/modules/speech.ts:32-35, 298-338` — 当前全局 voice 状态、`generateSSML`（pitch/rate/volume）。
- `packages/ccc/src/export/types/extensions.ts:1` — 开放 extensions。
- `docs/ai/context/tts-billing-tiers.md` — 四档 tier 命名来源。
- `docs/ai/context/plans/2026-05-09-character-cards-cloud-sync-design.md` — 整卡 LWW 云同步，快照 schema 需对齐。
