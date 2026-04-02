## 背景

AIRI 已经负责面向角色的体验，包括人格、情绪、记忆和回复塑形。OpenClaw 负责工具执行与自动化。该集成必须让 AIRI 能委托可执行工作，同时不将执行复杂性泄露到对话层，也不向客户端代码暴露 OpenClaw 凭据。

## 目标 / 非目标

**目标：**
- 通过专用桥接将类任务请求从 AIRI 路由到 OpenClaw。
- 通过将结果措辞保留在 AIRI 侧来维持 AIRI 的人设一致性。
- 为请求和响应使用结构化契约。
- 将关系记忆与执行历史分离。

**非目标：**
- 用 OpenClaw 替换 AIRI 的聊天流水线。
- 让 OpenClaw 负责人格、情绪或 UI 展现。
- 在集成边界之外设计新的 OpenClaw 工具或自动化逻辑。

## 决策

1. **引入专用的桥接边界**
   AIRI 应调用一个位于后端 / 服务适配层的 OpenClaw bridge，而不是在面向用户的代码中直接调用 OpenClaw。结合仓库现有边界，这个 bridge 最合理的落点是 `services/` 侧的新适配模块，模式参考 `services/minecraft/src/airi/airi-bridge.ts`，由 `packages/stage-ui/src/stores/mods/api/context-bridge.ts` 与 `channel-server.ts` 所代表的现有 AIRI 编排入口把任务请求路由过去。这样可以把认证、超时、重试和结果归一化集中在一个地方，也能避免把 OpenClaw 凭据放进客户端运行时。
   考虑过的替代方案：浏览器直接调用 OpenClaw，或把 OpenClaw 调用嵌入 `packages/stage-ui/src/stores/chat.ts`。两者都会让关注点耦合得过于紧密，并把执行层细节带进 UI / 对话编排层。

   这里的 ownership split 需要明确：`stage-ui` 只保留薄的编排触点，负责意图路由、委托触发、状态摘要消费与最终人设化回复；服务侧适配器负责 OpenClaw 的 transport、auth、task lifecycle 管理，以及 execution-history 的持久化或等价存储边界。

2. **使用结构化请求/响应载荷**
   桥接应传递带类型的任务元数据，并接收带类型的执行结果。这样能让路由、日志记录和未来重试更可预测。
   考虑过的替代方案：只用纯文本提示，或按任务使用临时 JSON。纯文本对编排来说过于薄弱，临时形状又会很难演进。

3. **明确 OpenClaw 与现有 MCP / xsai 工具调用的关系**
   OpenClaw 集成不是对现有 MCP bridge 的替换。仓库里已有的 `packages/stage-ui/src/stores/mcp-tool-bridge.ts` 与 `packages/stage-ui/src/stores/llm.ts` 主要负责 xsai 工具装配与运行时工具调用，它们适合继续承担“把工具暴露给 LLM”的职责。OpenClaw bridge 则负责“把任务委托给外部执行网关并拿回结构化结果”，属于后端服务适配问题，而不是 renderer 侧 MCP transport 问题。
   这意味着第一版实现应把 OpenClaw 当成独立的服务委托通道。若后续需要让 AIRI 以 tool-call 形式显式触发 OpenClaw，可以在 `packages/stage-ui/src/stores/llm.ts` 上层暴露一个工具入口，但 `llm.ts` 仍只是工具装配 / 触发触点，真正的 transport、认证、执行生命周期与执行历史所有权仍应落在服务适配层。

4. **将人设塑形保留在 AIRI 侧**
   OpenClaw 应返回结果数据，而不是面向最终用户的文案。随后由 AIRI 用自己的语气来组织最终回复。
   考虑过的替代方案：让 OpenClaw 生成最终面向用户的文本。这会模糊职责边界，并带来人格漂移风险。

5. **将执行记忆与关系记忆分离**
   任务日志和工具输出应归入执行历史，而不是陪伴型记忆存储。AIRI 的记忆应继续以用户关系为中心。
   考虑过的替代方案：使用一个共享记忆桶。那会让检索变得更嘈杂，也会增加覆盖长期陪伴上下文的风险。

   在 ownership 上，这里的执行历史不应再作为开放问题保留：首版就由服务侧 OpenClaw 适配器拥有 execution-history store，至少负责保存 task id、状态流转、结构化结果摘要与错误信息；`stage-ui` 只读取必要的状态摘要，不拥有该存储。

6. **首版传输层选择 OpenAI-compatible HTTP，暂不使用 WebSocket / Eventa 直连 OpenClaw**
   首版 bridge 与 OpenClaw 之间优先采用 OpenAI-compatible HTTP 接口，例如 `/v1/responses` 或 `/v1/chat/completions` 一类端点。理由是 OpenClaw 在这里扮演的是外部执行网关，HTTP 更贴近现有网关式接入方式，也更适合由服务适配层统一处理认证、超时、审计与重试。
   WebSocket 或 Eventa 仍然保留给 AIRI 内部的 server channel、模块通知和更实时的运行时协作场景，不作为首版 OpenClaw bridge 的主 transport。这样可以减少一次性混入两套跨系统实时协议的复杂度。

## 风险 / 权衡

- [桥接成为瓶颈] → 尽可能让契约保持精简，并在可行时保持无状态。
- [过于详细的工具输出导致人格漂移] → 在 AIRI 渲染最终回复前先对结果做归一化。
- [凭据泄露] → OpenClaw token 处理仅保留在服务端。
- [把 OpenClaw 错放进 renderer / MCP bridge] → 明确区分“工具暴露层”和“外部执行适配层”，前者可继续在 xsai tool 装配处扩展，后者必须停留在服务侧。
- [执行状态与历史的 ownership 漂移回 UI] → 明确规定状态机与执行历史归服务适配层所有，UI 只消费摘要与最终结果。
- [跨两个系统的调试复杂度] → 单独持久化执行历史，并保留足够元数据用于关联。

## 迁移计划

1. 在现有 AIRI 流程之后添加桥接契约和路由行为。
2. 在服务适配层实现 OpenClaw bridge，并通过现有 server channel 路由接入。
3. 只通过桥接接入 OpenClaw。
4. 用结构化输出验证一条端到端任务路径。
5. 如果桥接失败，则通过禁用委托并回退到仅 AIRI 响应来完成回滚。

## 开放问题

- 首次上线时应优先委托哪些任务类型？
