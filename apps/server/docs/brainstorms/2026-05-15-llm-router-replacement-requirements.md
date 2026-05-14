---
date: 2026-05-15
topic: llm-router-replacement
---

# Internal LLM/TTS Router Replacing knoway

## Summary

在 `apps/server` 内部新建一个 LLM/TTS 路由模块替换 knoway。LLM 走单格式直传 + 请求内 key fallback；同一逻辑模型可挂多个 upstream，**v1 实装 upstream 间 fallback**（一个 upstream 的全部 key 都失败时切下一个 upstream），upstream 间的 LB / 加权分流延后。TTS 用 adapter interface 抽象 provider，v1 发 Azure / Alibaba cosyvoice / Volcengine 三家手写 REST 适配器；voice catalog 用提交仓库的静态 JSON。完整 OTel + Grafana + healthz 覆盖，一次性切流配 revert 回滚兜底。Provider key 必须 envelope-encrypted 后再写入 configKV，OTel key id 用 SHA-256 前 8 字符脱敏。**审计日志（保留用户请求 / 响应体）暂不做，作为 TODO 留给 v2**。

---

## Problem Frame

今天 `apps/server` 的 `/api/v1/openai/*` 是个薄代理，把 chat completions、`audio/speech`、`audio/voices` 转发给 sidecar 部署的 knoway。

knoway 的两个核心限制把生产推到痛点上：

1. **每个 cluster 只支持一个 upstream（一对 URL + key）**。我们近一年在生产上反复遇到 **slow-recovery 型失败**：(a) 上游 key 余额耗尽（要等结算 / 充值才能恢复），(b) 上游 key 被吊销 / 401（要换新 key 才能恢复）。两类都不是几分钟自愈的 429/5xx，是需要人介入的失败。但 knoway 不支持同 cluster 内多 key fallback，意味着这两类失败 = **用户直接看到错误**，从 key 异常到上线下一个 key 期间整条 LLM/TTS 链路对该 cluster 是黑的。
2. knoway 是独立 Go 服务，把 LLM/TTS 这一层的"路由 + 鉴权 header 注入 + 模型重映射"放在 server 外面，**牺牲了一跳网络延迟、多了一个语言运行时和部署单元**，而它实际做的工作（URL rewrite + header 注入 + 多 cluster voices 聚合 + 协议转换）对今天的规模（1 个 LLM cluster + 1 个 TTS cluster）来说是 over-engineered。

复合代价：用户侧黑时间 + 维护两套部署 + ops 在 key 异常时不仅要换 key 还要管 knoway 这层。

---

## Actors

- A1. **End-user 客户端**：经认证用户通过 `/api/v1/openai/*` 调用 chat completions / TTS / voice listing。看不到内部 fallback 细节，只在所有 key 都失败时收到错误。
- A2. **Server-side 路由模块**（新）：在 `apps/server` 内执行 key 选择、fallback、TTS 协议转换、voices 列表组装。
- A3. **Upstream provider**：OpenRouter（LLM）、Azure Speech / DashScope cosyvoice / Volcengine TTS（TTS）。每家都有自己的 key 配额、错误码、协议格式。
- A4. **Operator / admin**：通过现有 admin 通道维护 key 列表（增删改）、查看路由器健康。失败发生时通过 Grafana 告警感知 + 手动响应。

---

## Key Flows

- F1. **LLM chat completion，首 key 成功**
  - **Trigger**：A1 POST `/api/v1/openai/chat/completions`
  - **Actors**：A1, A2, A3
  - **Steps**：A2 按配置顺序取第一个 LLM key → 向 A3 发起请求（含 stream pass-through）→ A3 200 → A2 透传响应给 A1，按现有路径完成计费 + OTel 收尾
  - **Outcome**：A1 拿到完整响应；OTel 上报 fallback depth = 0
  - **Covered by**：R1, R5, R10

- F2. **LLM chat completion，请求内 fallback**
  - **Trigger**：A1 POST `/api/v1/openai/chat/completions`，配置中存在 ≥ 2 个 key
  - **Actors**：A1, A2, A3
  - **Steps**：A2 取 key#1 → A3 返回 fallback 触发码（如 401 / 402 / 429 / 5xx）→ A2 立刻取 key#2 → A3 200 → A2 透传给 A1
  - **Outcome**：A1 看到 200；A2 记录每次 fallback 的 reason + 来源 key
  - **Covered by**：R2, R3, R10

- F3. **LLM chat completion，全 key 用尽**
  - **Trigger**：A1 POST，全部 key 在本次请求中全部失败
  - **Actors**：A1, A2
  - **Steps**：A2 顺序试完所有 key 都拿到 fallback 触发码 → A2 向 A1 返回网关侧错误
  - **Outcome**：A1 收到 5xx（具体类型按下文 D1 映射）；Grafana key-exhausted 计数器 + 1
  - **Covered by**：R3, R4, R10, R11

- F4. **TTS speech，单 provider 多 key fallback**
  - **Trigger**：A1 POST `/api/v1/openai/audio/speech`，请求模型对应一个 TTS provider（v1 是 Azure / Alibaba cosyvoice / Volcengine 之一）
  - **Actors**：A1, A2, A3
  - **Steps**：A2 调对应 adapter 把 OpenAI 输入翻译成 provider 原生格式 → 顺序试 key → 拿到音频 bytes / stream → 翻译回 OpenAI 响应格式给 A1
  - **Outcome**：A1 拿到音频；fallback 行为与 LLM 一致
  - **Covered by**：R6, R7, R8, R10

- F5. **Voices listing**
  - **Trigger**：A1 GET `/api/v1/openai/audio/voices?model=...`
  - **Actors**：A1, A2
  - **Steps**：A2 根据 model 路由到对应 adapter → adapter 返回该 provider 的静态 voice catalog → A2 合并 configKV 维护的 `DEFAULT_TTS_VOICES` 推荐 map → 返回
  - **Outcome**：A1 拿到 voices 列表，shape 与 frontend 既有消费者兼容（沿用 `unspeech` 包的 `Voice` / `VoiceFormat` / `VoiceLanguage` 类型）
  - **Covered by**：R9

- F6. **Client 真错与上游错的分离**
  - **Trigger**：A1 送出非法 body（如不存在的 model alias、malformed JSON）
  - **Actors**：A1, A2
  - **Steps**：A2 在打 upstream 之前的本地校验阶段就拒绝 → 返回 4xx 带具体原因
  - **Outcome**：A1 拿到客户端错（4xx）；不进 fallback 流程；OTel 不记录 fallback 事件
  - **Covered by**：R4, R12

---

## Requirements

**LLM 路由**

- R1. 支持 OpenAI 兼容 `/v1/chat/completions`（含 SSE 流式）的代理；客户端契约与 knoway 时代完全一致（status、shape、stream 协议）。
- R2. 配置中允许一个逻辑模型挂多个 key；同一次请求内按配置顺序试 key，任一成功即返回成功。
- R3. 触发请求内 fallback 的条件至少包含：上游 4xx 鉴权 / 余额类（401、402、403）、上游限流（429）、上游 5xx、上游网络超时。具体阈值（超时秒数等）planning 阶段定。
- R4. 当**所有** key 在本次请求中全部失败时，向客户端返回**网关侧错误**（5xx 区间），而不是把上游的 4xx 透传出去。
- R5. Schema 允许一个逻辑模型映射到**多个 upstream**（不同 base URL / 不同 provider）。v1 实装 **upstream 间 fallback**：当某个 upstream 的全部 key 都在本次请求失败后，切换到数组中的下一个 upstream 继续试它的 key 列表。直到所有 upstream 的所有 key 都失败才向客户端返 5xx。v1 **不**实装 upstream 间的负载均衡（按 weight 分流 / latency 路由 / 成本路由）—— LB 留待真有多 upstream 在线后再加。

**TTS 路由**

- R6. 支持 `/v1/audio/speech`（OpenAI 兼容）；v1 三个 adapter：Azure Cognitive Services Speech、Alibaba Cloud DashScope cosyvoice、Volcengine TTS。
- R7. TTS adapter interface 抽象 provider 协议转换（OpenAI 输入 → provider 原生请求；provider 响应 → OpenAI 输出）；adapter 自带该 provider 的所需参数（region、sample_rate、voice 映射等）。Interface 必须 self-contained，不依赖 server 内部类型，方便未来抽 package。
- R8. TTS 请求内 fallback 行为与 LLM 一致（R2-R4 适用）。
- R9. 支持 `/v1/audio/voices?model=...` 返回该 provider 的 voice catalog；catalog 用提交仓库的静态 JSON 维护，月级 ops 手动刷新。响应形状沿用 frontend 已用的 `Voice` / `VoiceFormat` / `VoiceLanguage` 类型（来自 `unspeech` 包，纯类型导入，无运行时依赖）。

**Observability**

- R10. OTel 埋点必须覆盖 LLM + TTS 两条路径，使用 GenAI 语义规约（`gen_ai.system`、`gen_ai.request.model`、`gen_ai.response.model`、`gen_ai.usage.*`、`gen_ai.operation.name`）加上 airi 自定义网关属性：哪个 upstream、哪个 key、fallback 深度、触发原因。**Key 标识必须是 SHA-256(key) 的前 8 字符**，**不是 raw key 的前 N 字符**。OTel 数据会出本进程到 Grafana / 第三方 backend，raw key 前缀外泄等于秘密外泄。
- R11. 新增 metric counters：fallback 次数（按 provider / 来源 key / 触发原因维度）、上游错误分布（按 provider / status code）、key 全失败次数（按 provider，告警源）。
- R12. Grafana 告警至少三条规则：P0 key 全死（短窗内 exhausted 计数器 > 阈值 → page）；P1 fallback 比例飙升（一段窗口内 fallback / 总请求超过阈值 → 通知）；P2 单 key 持续失败（一段窗口内某 key 贡献绝大多数上游错误 → 提醒手动 disable）。具体阈值在第一次上线后基于真实流量调。

**Health 端点**

- R13. 提供两个独立的 health 端点：liveness（process 活着即 200，永远不依赖外部状态）和 readiness（检查必要外部依赖如 DB / Redis 后才 200）。
- R14. Gateway 层的 key 健康状态**不阻塞** readiness —— 单个 key 抖动不应该让整个 instance 被摘流量。如果想暴露 gateway 自身的健康摘要，走独立端点或 admin 端点。

**配置与运维**

- R15. 配置（哪些 provider 存在、它们的 upstream URL、key 列表、模型 alias 映射）存储沿用 `configKV` 抽象。**注意**：当前 `configKV` 是 Postgres 为 truth + Redis 为 cache 的封装（apps/server/src/services/config-kv.ts），且 `ConfigEntrySchemas` 是 Valibot 闭合常量对象 —— 不支持任意 provider 名的动态 key。本次必须新增一个 composite schema 条目（如 `LLM_ROUTER_CONFIG`）承载整棵路由器配置树。这是 schema design 工作，不是"零配置改动复用现有抽象"。
- R15a. **Key 等敏感字段不得明文存进 configKV 行**。Provider API key 必须先经 envelope encryption（KMS DEK 或 Railway secret variable 派生的 master key）加密后再写入；OTel 中只保留 hash 前缀（见 R10 改进版）。Redis 快照泄露 / Redis 端点错配 / Postgres dump 泄露任一情景下，攻击者拿到的应是密文不是 raw key。
- R16. Key 列表的增删改通过现有 admin endpoint 模式暴露，不为这次单独造新管理系统。配置改动对运行中的 instance 必须**有界传播**：propagation 完成时间 ≤ **5 秒**（跨所有 Railway instance），且 ops 必须有可观测信号（如 OTel counter `airi.gateway.config.reload` 按 instance 维度分组）确认每个 instance 已切换到新版本。Key 撤销场景下（最敏感），未传播完成期间的请求**必须**仍能用旧 key 继续服务用户，不能因为传播未完成而 5xx —— 但 ops 必须能基于上述信号判断"还有多少 instance 没切"。具体实现机制（pub/sub 失效本地 cache vs 每请求读 configKV vs Redis TTL）planning 阶段定，但**有界 + 可观测**是 v1 安全级 requirement。
- R16a. 管理 key 的 admin 接口权限模型：本次必须显式回答**单一 admin 角色 vs 分角色**（key 写权限 vs 审计读权限分离）；如果保持单一 admin 角色，必须在 Scope Boundaries 显式声明"v1 接受 admin 凭据被攻陷可即时注入恶意 key"风险，作为 known limitation 列入 follow-up。Key 写操作是否需要 step-up auth / 双人确认 / 写入审计行同样属于此处决策。

**迁移**

- R17. 一次性切流：knoway 与新模块**不并跑**。PR 合入即生效；出事走 revert deploy 回滚。本次没有 schema migration（audit 已移出 v1），所以 revert 是干净的纯代码 git revert，不需要拆 PR。
- R18. knoway 的 docker-compose 配置保留作为回滚兜底，**删除触发条件是数据驱动而不是日历**：连续观察到至少 14 天 OR 至少 1 次峰值流量事件期间路由器没出 P1+ 事故才允许删 compose。出现 P1 即重置计数。
- R19. PR 必须带：
  - 覆盖**所有 fallback 路径**的单测（含全 key 死亡返 5xx 路径、单 key 中段失败切下一 key 路径、流式 SSE 中段中断的 finally release 路径、**跨 upstream fallback 切换路径**、全 upstream 列表用尽路径）；
  - **mock-based 集成测试**（mock upstream 401/402/429/5xx/timeout 各种触发码）；
  - **回滚 runbook**：(a) git revert 命令、(b) knoway compose 路径与重启步骤、(c) 已分发的新配置回写为 knoway-compatible 形态的脚本或步骤；
  - **部署后首 24 小时主动盯指标清单**（含 P0/P1/P2 alert 都没炸的 baseline、fallback depth 分布、key 错误率分布、跨 upstream fallback 触发率）。

<!-- v1 不做审计日志 — 移出 scope（详见 Scope Boundaries）。Driver 是 "有人刷接口想知道送了什么"，
     当前服务规模小、暂时不需要补这个能力。Future 支持需要哪些事项见 "Future: Privacy & Audit Support"。 -->

**审计日志（v1 不做 — TODO）**

- 见 Scope Boundaries 的 audit 相关条目和 "Future: Privacy & Audit Support" 笔记。

---

## Acceptance Examples

- AE1. **Covers R2, R3.** 给定 chat completion 配置中有 3 个 key，第一个 key 上游返回 429。当请求进入时，路由器立刻切换到 key#2 发起新请求，key#2 成功，客户端拿到 200，OTel 记录 `fallback.depth=1` 且 `fallback.reason="429"`。
- AE2. **Covers R3, R4, R11.** 给定 chat completion 配置中所有 key 在本次请求都返回 401。路由器按顺序试完所有 key，所有失败，返回 5xx 给客户端（不透传 401）；`key.exhausted.count{provider}` 计数 +1。
- AE3. **Covers R4, R12.** 给定客户端送的 body 里 `model` 字段是配置中不存在的 alias。路由器在打 upstream 之前的本地校验阶段拒绝，返回 4xx（客户端错），不进 fallback 流程，OTel 不记录 fallback 事件。
- AE4. **Covers R6, R7.** 给定客户端 POST 一段中文文本到 `/v1/audio/speech`，model 指向配置中的 cosyvoice provider。路由器调用 Alibaba adapter 把 OpenAI 输入翻译成 DashScope 原生请求格式，拿到音频后翻译回 OpenAI 响应格式给客户端。客户端无感知协议层差异。
- AE5. **Covers R9.** 给定客户端 GET `/v1/audio/voices?model=microsoft-azure-tts-alias`。路由器返回 Azure provider 的静态 voice catalog，shape 与 frontend 现有 `Voice` 类型消费者一致；configKV 里的推荐 voice map 已合并进响应。
- AE6. **Covers R13, R14.** 给定某个 Azure key 持续返回 401（被吊销）但 cosyvoice 和 LLM 路径都正常。Liveness 端点 200，readiness 端点 200（不被 gateway 内部某 key 健康状态污染），但 Grafana P2 告警在窗口内触发。
- AE7. **Covers R5.** 给定 chat completion 配置一个逻辑模型挂 2 个 upstream：upstream A 有 keys [a1, a2]、upstream B 有 keys [b1, b2]。本次请求 a1 失败 → a2 失败 → 切到 upstream B → b1 成功。客户端拿到 200；OTel 记录 fallback.depth=2、跨 upstream 一次。如果 b1 + b2 都失败，全 upstream 列表用尽返 5xx。

---

## Success Criteria

- 切流后用户**不再**在生产看到由 key 余额耗尽 / key 吊销引起的报错（只要任一备用 key 还活着）。事故型失败的用户黑时间从"换 key 上线之前都黑"降到"全 key 都死了才黑"。
- knoway 容器从 airi-railway compose 删除；server 端到 LLM/TTS upstream 少一跳网络延迟。
- OTel + Grafana 上线后 1-2 个月能基于真实数据回答："是否需要为 v2 加 key 持久化健康状态"；如果数据显示需要，决策依据是观测到的浪费，不是猜测。
- 下一名读这份需求 + 后续 plan 的开发者能在 1 周内把第 4 个 TTS adapter（比如 ElevenLabs）加上而不动 v1 核心代码，证明 adapter 边界对了。**注**：v1 上线后必须实际有 1 次"加新 adapter"的演练（哪怕是 stub PR），否则这条 success criteria 不可证伪。
- **SLO 触发 v2 持久化健康状态的硬阈值**：v1 上线后 OTel 数据如果显示**平均 `fallback.depth` > 0.5 持续 24 小时** 或 **某单 key 连续贡献 > 30 分钟 > 80% 的上游错误**，下个 sprint 必须把"持久化死活状态 + admin enable/disable"上线。不是"等数据决定"的开放问题，是触发条件已经约定好的自动晋升。这避免了"interesting graph but no action"的漂移。

---

## Scope Boundaries

- v1 **不**持久化 key 死活状态，**不**做 admin enable/disable key 健康的 UI。是否引入由 v1 上线后的 OTel 数据决定。
- v1 **不**做 cooldown / 半开探测熔断 —— 失败模型是慢恢复型（quota / 401），熔断机制用不上。短瞬故障（429 / 5xx）通过请求内 fallback 处理就够。
- v1 **不**做成本感知路由 / 加权负载均衡（要等多 upstream 真用上）。
- v1 **不**做上游模型可用性自动发现 / 动态 catalog。voices 用静态 JSON。
- v1 **不**改 `/v1` 对客户端的接口契约（保持 OpenAI 兼容，与 knoway 时代完全一致）。
- v1 **不**抽出独立的 gateway 部署单元，**不**引入新语言运行时。
- v1 **不**抽 `packages/llm-router` 或 `packages/tts-router` —— 内联在 `apps/server`，无第二 consumer；adapter interface self-contained 方便未来真抽。
- v1 **不**引入 Portkey / Vercel AI SDK / Azure WebSocket SDK / DashScope SDK / Volcengine SDK 任何官方包。所有 provider 通信都是 hand-rolled REST。
- v1 TTS **只**发 Azure + Alibaba cosyvoice + Volcengine 三家。ElevenLabs / Player2 / Deepgram 等其他 provider 留给下个版本（schema 已留位置）。
- **不**替代 frontend BYOK 路径用的 unspeech-server。那条路径继续走 unspeech；本次只动 server 端 `/api/v1/openai/audio/*`。
- **不**双跑迁移；一次性切流，靠回滚兜底（D17-D18）。
- v1 **不做审计日志**（保留用户请求体 + 响应体）。Driver 是"有人刷接口我们想知道送了啥"用于安全事故复盘，但当前服务规模小，暂时不优先做。作为 v2 TODO 等真出事故再补 —— 详见下方 "Future: Privacy & Audit Support" 笔记列出真要做时需要带哪些配套（最小可用 vs 合规级别）。
- v1 **不**做 LB / 加权分流 / 成本感知路由（要等真有多 upstream 在线后再加；多 upstream fallback 在 v1 做，但 LB 不做）。
- v1 **不**做任何 key 级 cooldown / 限流标记 / 短期黑名单。假设上游是 key-level 限流（详见 D33）；如假设错则承担 429 风暴下 fallback 失效的代价，等 D29 SLO 触发器报警后再补 cooldown。

---

## Key Decisions

- **D1. 上游侧失败统一映射为网关侧错误（5xx）；客户端真错（pre-upstream 校验失败）保持 4xx**：HTTP 语义上 4xx 意味着客户端的错；把上游的 401 / 402 透传给客户端是在污蔑客户端。客户端应该看到的是"网关那边没把你的请求送达"信号（retry 或 page on-call），而不是去 debug 自己 prompt。具体码段（502 / 503 / 504 怎么分）planning 阶段定。
- **D2. 失败模型决定不做 cooldown / 半开探测**：生产真实失败是慢恢复型（quota、key 吊销），不是几分钟自愈的瞬时型。熔断机制为后者设计，对前者等于摆设。
- **D3. Schema 一次到位（支持多 upstream / 多 provider 数组），实现只用数组首项**：扩展位置在 schema 上零成本（一层数组），多 upstream/provider 间的 fallback/LB 语义延后到真用时再定。Carrying cost 可接受。
- **D4. 请求内 fallback；不持久化 key 死活状态（v1）**：用 OTel 数据驱动决定 v2 是否需要。当前 3-5 key 规模浪费的延迟（每次试一次失败 key ~200ms）可接受。
- **D5/D6/D7. OTel + Grafana + 双 healthz 一次到位**：可观测性是事故型失败响应的核心 —— 没有指标就没法判断 v2 是否要扩。double healthz 分 liveness / readiness 防止 gateway 内部 key 健康污染整个 instance 流量摘除决策。
- **D10. 自写 key rotator，不引 Portkey**：Portkey 是 250+ provider 通用网关，多 key 模型也是 leaky（要模成多 virtual provider）。我们 1-3 家 provider 场景下，~50 行自写代码比引入大库 + 把语义掰成 Portkey 形状更直接。
- **D11. 三家 TTS 全 hand-rolled REST，不引官方 SDK**：Azure 官方 SDK 是 WebSocket 取向 MB 级；DashScope / Volcengine 官方 SDK 是薄签名器没附加价值。三家 REST 协议都稳定且小。
- **D12. Voice catalog 静态 JSON 提交仓库，月级 ops 手动刷新**：Azure ~600 voice 月级变化，cosyvoice / Volcengine 体积更小且更稳定。运行时跨服务聚合是 knoway 当年的过度设计，新模块不复制。
- **D13. 类型层复用 unspeech 的 `Voice` / `VoiceFormat` / `VoiceLanguage`**：保持与 frontend 既有消费者兼容；纯类型导入，无运行时依赖（CLAUDE.md "Import types from the module that owns the contract" 原则）。
- **D14. 内联进 `apps/server`，不抽独立 package**：无第二 consumer = YAGNI。adapter interface 设计成 self-contained，未来真有第二 consumer 抽包成本低。
- **D17. 一次性切流 + revert 回滚兜底**：双跑会增加复杂度（双计费？双埋点？谁是 source of truth？）；一次切 + 强测试 + 24h 主动盯 + knoway compose 保留至数据驱动条件满足才删，是更便宜的方案。
- **D20. v1 不做审计日志**：driver 是事故复盘（"有人刷接口我们想知道送了啥"），但当前服务规模小，对应风险面也小。承担 "短期内出事故无法复盘" 的代价，作为 v2 TODO；真出事时再补，比现在猜需求做高得多。具体未来要做时需要哪些配套见 "Future: Privacy & Audit Support" 笔记。
- **D28. R16 配置热生效升格为安全级 requirement**：未传播完成的窗口期内，撤销的 key 仍可服务请求 = 安全漏洞（admin 删了 leaked key 后还在 N 秒内被使用）。propagation 必须**有界**（≤ 5 秒）且**可观测**（OTel counter 按 instance 维度暴露当前生效配置版本）。具体机制 planning 定，但"有界 + 可观测"是 commit。
- **D29. 当前 SLO 触发 v2 的硬阈值已写入 Success Criteria**（avg fallback.depth > 0.5/24h OR 单 key > 80% 错误 > 30 分钟）。这避免 D4 的"OTel 数据驱动 v2"漂移成"interesting graph but no action"。理由来自 adversarial (ADV2)。
- **D30. OTel `airi.gateway.key.id` 必须是 SHA-256(key) 前 8 字符**，不是 raw key 前缀。Raw 前缀外泄 = 秘密外泄到 Grafana / 第三方 OTel backend。理由来自 security reviewer (SEC4)。
- **D31. 多 upstream fallback 在 v1 做，LB 不做**：fallback 是核心可靠性需求（一个 provider 挂了能切到另一个）；LB 是 nice-to-have，要等真有多 upstream 在线产生流量分配需求时再加。数组语义因此明确为"按顺序 fallback"，不是"按 weight 分流"。理由：用户明确表述。
- **D32. unspeech-server 与 server-side TTS adapter 双实现接受不做 sidecar**：用户明确拒绝 sidecar 方案；接受 moeru-ai 在 unspeech（Go，frontend BYOK 用）和 apps/server 内 TS adapter（hosted 路径用）维护两份 OpenAI ↔ provider 协议转换。代价（协议变更两边同步）已知，可接受。理由：用户明确表述。
- **D33. 上游限流粒度按"key-level"假设处理，v1 不做 cooldown 也不做限流，risk-accepted**：四家上游 provider（OpenRouter / Azure / DashScope / Volcengine）的限流策略我们不实测、不查文档、不在 v1 处理。**假设错的实际后果**：如果有家是 account-level 限流，429 风暴会同时打死所有 key 让 fallback 失效，用户看到 5xx。**兜底机制**：D29 的 SLO 触发器（avg fallback.depth > 0.5/24h OR 单 key > 80% 错误 > 30 分钟）可同时触发两个动作 —— "持久化 key 死活状态" 或 "加 key 级 cooldown"，具体看故障形态决定。出事就修。理由：用户明确表述"先不做不管"。

---

## Future: Privacy & Audit Support

*当前 v1 不做。这里列出真要做审计 / 隐私时需要带哪些配套，作为 v2 起点参考。两档：内部 debug 用就够 / 想真正合规要做的全套。*

### Tier 1 — 内部 debug 用最小可用（出事故能复盘）

只解决你说的 "有人刷接口我们想知道他发了啥"，不上合规级别：

- **存哪些**：扩展 `llm_request_log` 表加 `request_body` / `response_body` 两列。
- **截断**：单条上限要定（请求侧锚定 Hono `bodyLimit`、响应侧 8MB 兼容长上下文输出），超限截断 + flag 标记。
- **TTS**：响应是音频，别存音频字节（大且没用），存元数据（命中哪个 voice、sample_rate、哪个 upstream）。
- **流式 LLM**：要在流结束后把 SSE 块拼成完整文本再写入（现有代码只 buffer 末 2KB 用于 token 计费，要升级）。
- **写入语义**：best-effort（写失败不影响业务响应，因为响应已经发给用户了），失败计数 + Grafana 告警。
- **保留期**：先 90 天，configKV 可调。
- **清理**：靠 Postgres TTL / 现有 ops cron，不为这事造新定时任务。
- **访问控制**：现有 admin auth 够用。

**这一档需要面对的两个真问题**（reviewer 共识，记在这等做的时候处理）：
- 同行耦合：audit body 跟 status/duration/flux 同一行。Audit body 过大让整行写失败 = 同时丢业务元数据。解法：(a) 接受，配合计费 reconciliation 容忍缺失；或 (b) 拆 `llm_request_audit` 子表通过 FK 关联。
- Best-effort 漏写率：高峰期容易掉。如果只是 debug 用，能接受；如果想做合规审查，就得改成同事务或 durable queue（见 Tier 2）。

### Tier 2 — 真正合规级（GDPR / PIPL / SOC2 之类的）

只有真要上合规审查或 EU/中国大陆正式商用前才考虑。每条都要工程 + 法务双投入：

- **用户披露**：隐私政策里明确写"我们保留你的 prompt 多久、为什么、谁能访问"。前端要有可见入口。
- **用户删除权**：用户要能触发"删掉我的所有历史" → 需要 admin endpoint + 跨表的级联删除路径（不只 `llm_request_log`，还有任何带 userId 的 audit 表）。
- **写入语义升级**：best-effort 不合格。合规角度的问题永远是"请求 X 的 prompt 在哪？"，"高峰期掉了"不是能接受的答案。需要改为同事务写入 或 写入 durable queue（Redis Streams / 类似）+ cron 兜底入库。
- **跨境传输**：EU 用户的数据流到非 EU 服务器需要 Standard Contractual Clauses 法律文件。中国用户的数据出境需要走《个人信息出境标准合同》。这是法务层面的事，工程上需要可识别"哪条记录是哪个法域用户的"。
- **跟上游 provider 签 DPA**：用户 prompt 会被发给 OpenRouter / Azure / 阿里云 / 火山引擎处理。这几家都各自有 Data Processing Agreement，要签。法务事。
- **PII 自动识别 + redact**：用户的 prompt 可能含手机号 / 身份证 / 邮箱 / 健康信息。合规角度建议存入前先扫一遍打码。开源 lib 有（Microsoft Presidio 之类），但识别准确率和性能要权衡。
- **数据最小化**：不存"为了存而存"的字段。只存能直接回答审计问题的最小集。
- **加密升级**：不只依赖 Postgres / Railway 的磁盘加密。应用层用 envelope encryption（KMS 给的 master key 派生 DEK），密文存库。密钥泄露 ≠ 数据泄露。
- **访问审计**：审计的审计。"谁在 2026-05-15 查了 user X 的 prompt？" 这种问题要能答。再加一张 `audit_access_log` 表记录 admin 操作。
- **数据本地化**：中国大陆用户的数据可能要求存中国境内的机器。多区域部署 + 路由策略。
- **保留期审视**：90 天可能过长。合规角度 "存储最小化" 原则下，应该按业务实际需求最短。

**判断什么时候要从 Tier 1 升 Tier 2**：用户量超过 ~1k DAU、有商业合同方要求、有 EU/中国大陆用户付费、出过用户对自己数据的投诉、收到监管问询。任一触发就该开 Tier 2 brainstorm。

### Tier 3 — 滥用检测 / 内容审查（不同需求，单独考虑）

如果 "有人刷接口" 升级到 "有人用我们的服务跑非法内容生成"，需要的是**实时**审查而非事后审计：

- 请求侧关键词 / classifier 过滤（输入审查）
- 响应侧 classifier 过滤（输出审查）
- 用户级风控信号（短时间内异常多 / 异常 prompt pattern）
- 跟上游 provider 的 content policy 对齐
- 用户封禁机制

这条跟 Tier 1/2 是不同形态的工程（实时管道 vs 事后日志），单独开 brainstorm。

---

## Dependencies / Assumptions

- 依赖 `configKV` 服务（Redis-backed）作为路由配置 + key 列表的存储。沿用 `apps/server/src/services/config-kv.ts` 已有抽象，不新建表。
- 依赖现有 admin endpoint 模式作为 key 管理 UI 入口（具体接口由 planning 阶段定）。
- 依赖现有 OTel pipeline（已配置 `gen_ai.*` 标准属性 + `airi.*` 自定义属性，参见 `apps/server/docs/ai-context/observability-conventions.md`）。
- 依赖现有 Grafana 部署作为告警渲染目标。
- 假设 v1 的 LLM/TTS provider 数量保持在 1-3 家量级（≤ 5）；超过此规模需要重新评估"不持久化 key 死活"和"adapter 内联"的选择。
- 假设上游 provider（Azure / DashScope / Volcengine）的 REST 协议在 v1 生命周期内（~6 个月）保持稳定；如有重大协议变更需修订对应 adapter。

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] 触发 fallback 的具体超时阈值（上游响应超时 vs 全 fallback 链路超时）—— 需基于 knoway 当前 p99 测量数据定。
- [Affects R4, D1][Technical] 上游错误 → 网关 5xx 的具体映射规则（401/402/403/429 → 503？5xx → 502？超时 → 504？）—— 实现阶段细化。
- [Affects R12][Needs research] Grafana 告警阈值的初始值 —— 上线后基于真实流量调，第一周阈值靠经验估。
- [Affects R15, R16][Technical] 配置变更的热生效机制（pub/sub 失效本地 cache？还是每次请求读 configKV？）—— 取决于 configKV 当前实现的读延迟特性。
- [Affects R7][Technical] TTS adapter interface 的具体函数签名（统一 `(input, options) → ArrayBuffer | ReadableStream` 还是分 chat-style / TTS-style？）—— planning 阶段定。
- [Affects R6, R8][Technical] DashScope cosyvoice 和 Volcengine TTS 是否支持流式输出？v1 是否一并支持？—— 需要查官方 REST 文档。

<!-- Resolve Before Planning 已清空 — 限流粒度问题作为 risk acceptance 落进 Key Decisions D33。文档现在 zero blockers 可进 plan。 -->
