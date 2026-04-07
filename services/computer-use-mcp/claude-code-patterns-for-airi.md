# Claude Code Patterns for AIRI

这份文档不是源码摘抄，也不是“Claude Code 模仿计划”。

它只做一件事：

- 把 Claude Code 里**值得学的工程模式**翻译成 AIRI 自己能落地的设计语言
- 明确哪些现在该做，哪些现在别碰

边界先写死：

- 不抄源码
- 不抄 prompt
- 不把 Anthropic 内部工程习惯硬搬进 AIRI
- 只学结构、边界、默认策略、运行时分层

还有一个必须写死的纠偏：

- 不要让 AIRI 长成 “Claude Code 的轮廓”
- `tool system` 很重要，但它不是 `computer-use-mcp` 的抽象中心
- 对 AIRI 来说，真正的中心应该是：
  - runtime facts
  - lane contracts
  - action cycle
  - verification / repair
- tool directory / tool search / retrieval 都是支撑层，不是主心骨

参考材料：

- `https://www.codefather.cn/post/2039551862717313025`
- 本地拉下来的 Claude Code 泄漏仓库，仅用于结构研究，不作为实现来源

## 1. 最值得学的点

### 1.1 Query Loop 很朴素，但壳很硬

Claude Code 最有价值的地方，不是“神奇 planner”，而是它把 agent loop 做成了一个清晰的 runtime shell：

1. 压上下文
2. 调模型
3. 解析 `tool_use`
4. 执行工具
5. 回写结果
6. 没有新工具调用就结束

这个思路对 AIRI 的意义是：

- 不要把“agent”理解成一堆 workflow 拼起来
- 要有一个统一的 turn/runtime 边界
- snapshot、trace、tool execution、budget、approval 都应该围着这个边界转

这也是为什么 `runtime-coordinator` 是值得先做的。

### 1.2 ToolSearchTool 是真巧思，不是噱头

当工具很多，尤其 MCP 外接工具很多时，把所有完整工具 schema 都塞进 prompt 里，会有三个坏处：

- token 浪费
- 工具描述噪音过大
- 模型更容易选错工具

Claude Code 的做法很对：

- 先给模型一个**工具名 + 一句话介绍**的精简目录
- 让模型先做“候选选择”
- 再按需加载少量工具的完整定义

这不是小优化，是工具数量上来后的必要结构。

对 AIRI 来说，这个点尤其有价值，因为 `computer-use-mcp` 未来天然会遇到：

- desktop 工具
- browser 工具
- terminal 工具
- workflow/internal 工具
- coding 工具
- 外接 MCP 工具

如果不做工具发现分层，后面 prompt 只会越来越脏。

### 1.3 fail-closed 默认值很值钱

Claude Code 那种“默认保守”的思路非常对。

不是开发者忘了标注安全属性，系统就默认它是安全的；而是反过来：

- 没声明并发安全 -> 当成不安全
- 没声明只读 -> 当成可能写
- 没声明是否危险 -> 不给它自动走宽松路径

这个思路适合 AIRI。

因为 AIRI 现在最怕的，不是工具不够多，而是：

- 工具边界不清
- lane 污染
- 误并发
- 审批策略被绕开

### 1.4 工具注册不只是功能问题，也是 token/caching 问题

文章里提到 Claude Code 的工具清单要和 prompt cache 体系保持同步，这件事说明了一个现实：

**工具集合本身就是 runtime 输入的一部分。**

对 AIRI 的启发不是“去学他们的 Statsig 和内部缓存体系”，而是：

- 工具暴露面要稳定
- 工具目录要可摘要
- 工具 schema 的展开要可控

否则后面一旦做 prompt caching 或 summary reuse，会很难做干净。

### 1.5 内容检索优先走 agentic search，不要先上 RAG 信仰

这是 Claude Code 另一个很值钱的判断：

- 对本地代码仓、会话日志、记忆目录这类**强文本、强结构、变化快**的数据
- 不一定要先做 embedding / 向量库 / 检索增强生成
- 很多时候，直接让 agent 用 `grep` / `rg` / `glob` / 文件枚举去找，反而更稳

这个思路的优点很实际：

- 没有索引过期问题
- 不用维护额外向量库
- 命中结果可解释
- 模型可以边搜边改查询词，而不是被动吃检索结果

但这个判断不能被滥用。

它更适合：

- 本地代码检索
- 当前仓库里的 symbol / 文本搜索
- 短期记忆目录检索
- 会话日志或 JSONL 历史检索

它不天然适合：

- 跨项目大规模知识库
- 强语义近义召回
- 多语言模糊概念匹配
- 需要高召回率的文档问答

所以正确结论不是“RAG 没用”，而是：

**AIRI 现在不该为了显得高级，过早把 coding/context retrieval 建成向量检索系统。**

先把 `agentic search` 做硬，价值更高，也更符合当前阶段。

### 1.6 真正该学的是边界感，不是 Claude Code 的形状

Claude Code 值得学的，不是“它有一个很强的工具系统”，而是：

- 它知道哪些层该硬，哪些层该晚点做
- 它默认保守，而不是默认乐观
- 它把 runtime / tool / memory / lane 分层，而不是揉成一坨

但 `computer-use-mcp` 不是纯 coding harness。

对 AIRI 来说，如果主战场是 multi-surface computer use，那么真正决定系统质量的不是：

- 工具目录做得多漂亮
- tool search 节省了多少 token
- retrieval 多像 Claude Code

而是：

- runtime facts 是不是真、够不够新鲜
- lane handoff 是否清晰
- action 执行后有没有 postcondition verification
- 失败后能不能 repair / reroute / audit

所以 Claude-inspired 结构该保留，但 AIRI 的系统中心应该改成：

**Action Kernel + Lane Contracts + Verification**

## 2. AIRI 现在该做什么

### 2.1 先承认：tool-first 不是系统中心，只是重要支撑层

对 coding line，先做 descriptor / tool directory / search-first retrieval 很合理。

但对 `computer-use-mcp` 主线，这些层更适合作为：

- runtime 的输入面
- approval / review / trace 的辅助层
- 大工具集下的暴露控制层

而不是系统主轴。

如果现在把它们继续当成最高优先级，AIRI 很容易长成：

- tool system 越来越完整
- 多 surface action cycle 反而没被同样强度地抽象出来

这不是好事。

### 2.2 统一 Tool Descriptor 仍然值得做，但它该往 Operation Contract 演进

统一 descriptor 还是对的，但对 `computer-use-mcp` 来说，真正更值钱的下一步不是只停在 descriptor，而是继续长成 **Operation Contract**。

建议补这些字段：

- `effectType`: `observe | read | mutate | launch | network | shell`
- `targetSurface`: `browser | desktop | terminal | coding`
- `requiresFocus`
- `idempotent`
- `reversible`
- `postconditionRequired`
- `approvalScope`

否则后面 approval / verification / recovery 还是得靠工具名猜行为。

### 2.3 Tool Directory 和 Tool Search 仍然有价值，但定位要降一级

Tool directory / tool search 依然值得保留，但它们应该服务于：

- tool exposure hygiene
- prompt/token 控制
- review/debug/introspection

不是替代 action kernel。

更合理的策略仍然是：

- 核心固定工具少时，直接给完整 schema
- 工具数量超过阈值时，切到“目录 -> 候选 -> 完整定义”两阶段暴露

建议先把阈值写成显式配置，而不是让实现时自由发挥：

- 例如工具数 > 24
- 或估算工具 schema token 超过某个上限

### 2.4 fail-closed 默认值应该进 Tool Descriptor / Operation Contract

建议 AIRI 明确采用这些默认值：

- `concurrencySafe = false`
- `readOnly = false`
- `destructive = false`
- `requiresApproval = true` 对未知 mutation/tool family 走保守路径

这里的核心不是字段长什么样，而是默认策略要保守。

不要因为开发者忘记填 metadata，就把工具默认为无害。

### 2.5 coding line 的内容检索先做 search-first，不做 embedding-first

对 `computer-use-mcp` 来说，这条最应该落在 coding line：

- 先用 `rg --files`、`rg`、路径过滤、文件类型过滤、symbol 命中来缩搜索面
- 再让模型决定该读哪几个文件
- 读完之后再决定要不要继续扩搜索

这比“先把仓库全量 embedding 再问答”更适合现在的 AIRI。

原因很简单：

- monorepo 变化快
- 代码检索本来就天然适合文本搜索
- embedding 索引维护成本高
- reviewer 很难看出向量检索为什么给了某些上下文

换句话说：

- **先做 search-driven coding surface**
- **再考虑更强的语义检索**

但这条更适合作为 **coding lane 的局部路线**，而不是 `computer-use-mcp` 全局下一优先级。

如果主战场是 multi-surface computer use，那么更靠前的应该是：

1. runtime fact freshness / provenance
2. lane handoff contract
3. postcondition verification / recovery contract
4. approval token 绑定 effect + target + TTL + context hash
5. 之后才是 coding line 的 search-first retrieval

## 3. AIRI 现在不该做什么

### 3.1 不要抄 Claude 的 giant bootstrap

Claude Code 那种超重入口壳不适合 AIRI 现在复制。

原因很简单：

- Anthropic 那套是大团队产品组织的结果
- AIRI 现在更需要清晰分层，不需要更大的 god object

### 3.2 不要急着做 memory / subagent / prompt cache 全家桶

这些东西都很有吸引力，但顺序不能乱。

如果工具语义、runtime shell、tool exposure 还没站稳：

- memory 只会变 prompt 垃圾堆
- subagent 会把系统复杂度直接拉爆
- prompt cache 会变成脆弱耦合层

### 3.3 不要把 ToolSearch 做成“AI 搜工具的 AI”

它的价值不是花哨，而是**节省 token 和收敛暴露面**。

所以第一版不要做：

- embedding 检索
- 重排序模型
- 多轮工具发现规划

第一版就是：

- 目录
- 关键词筛选
- lane/safety 过滤
- 返回简洁候选

够了。

### 3.4 不要把“agentic search”误包装成“全面知识检索方案”

`grep` 很强，但不是万能。

如果后面 AIRI 真要做：

- 跨会话知识沉淀
- 文档语义问答
- 多来源长周期知识复用

那还是可能需要专门的 retrieval 层。

所以这一步该写清楚：

- 现在采用的是 **search-first retrieval**
- 不是永久拒绝 RAG
- 只是当前阶段优先级和工程收益判断

### 3.5 不要把 prep layer 继续养成第二个 planner

如果 prep 层继续同时承担：

- 前置条件探测
- 前置动作生成
- execution batch 安排
- reroute 建议
- 局部判断

它很快就会和 workflow planner / recovery / diagnosis 重叠。

更干净的边界是：

- prep layer = **precondition resolver**
- 它可以发现前置条件问题
- 它可以生成前置动作
- 但它不应该偷偷承担全局任务规划

否则系统最后会出现三套半 planner，谁都不完全负责。

### 3.6 不要把 app-specific 特判写进 substrate

`computer-use-mcp` v1 现在对 Terminal / Cursor / Chrome 这类 app 有现实偏好，这是合理的。

但下一步不能继续按 app 名称把逻辑长进 runtime 本体，否则会出现 app rules zoo。

更合理的方式是：

- substrate 只定义 generic capability：
  - launch
  - focus
  - observe
  - type
  - click
  - run shell
- app profile 只补：
  - bundle id
  - known quirks
  - selector hints
  - verification hints
  - safe open/focus contract

## 4. 对应到 `computer-use-mcp` 的实施顺序

### Stage A: Runtime Facts Freshness / Provenance

目标：

- 不只是拿到 runtime snapshot
- 还要知道每个事实：
  - 来自哪里
  - 何时探测
  - 目前新鲜度如何
  - 何时应失效

优先落点：

- `runtime-coordinator.ts`
- runtime fact providers
- snapshot assembler / freshness policy
- browser / desktop / terminal handoff 边界

### Stage B: Operation Contract Registry

目标：

- 让工具元数据从“描述工具”升级成“约束操作”
- 让 approval / verification / recovery 不再靠工具名猜行为

优先落点：

- effect semantics
- target surface
- postcondition requirement
- approval scope
- idempotence / reversibility

### Stage C: Action Cycle Verification / Repair Contract

目标：

- 固定 observe -> decide -> act -> verify -> repair 闭环
- 明确每类操作的 postcondition contract
- 明确 verify 失败后的 repair / reroute / abort 规则

优先落点：

- desktop mutate/control
- browser act/control
- terminal shell / PTY
- coding write/apply

### Stage D: Lane Handoff Contract

目标：

- 明确 browser / desktop / terminal / coding 之间何时切 lane
- handoff 时携带哪些 facts、constraints、approval scopes、verify obligations

这一步不做 Atlas 级 planner，只先把 route reason 和 handoff boundary 写清楚。

### Stage E: Tool Exposure Hygiene

目标：

- 保留 descriptor / tool directory / tool search
- 但把它们放回“暴露控制和 introspection”层
- 在大工具集场景下减少 token，而不是假装这就是系统中心

### Stage F: Coding-Line Search-First Retrieval

目标：

- 让 coding line 的 repo / trace / task memory 检索更显式、更可解释
- 这一步依然是对的，但它是 **lane-scoped follow-up**，不是整个系统的抽象中心

首批覆盖：

- repo code
- session trace
- task memory

这一层仍然不意味着立刻上向量库或 RAG。

## 5. 对 AIRI 的直接结论

最该学 Claude Code 的，不是“它有多强”，而是这几个判断：

- runtime 要有统一壳
- tool 要有统一 descriptor
- tool 暴露要分层
- 默认值要保守
- lane 要分开

最不该学的，是它那一整坨巨型产品化外围系统。

如果只能选一个 **现在该补的新点**，那就是：

**先把 Operation Contract + Verification Contract 立起来。**

因为这一步：

- 比继续扩 tool exposure 更接近 `computer-use-mcp` 的主复杂度
- 比直接做 retrieval / memory 更能提升执行可靠性
- 能真正支撑 approval / recovery / reroute / audit

如果只能选第二个点，那就是：

**给 runtime facts 加 freshness / provenance。**

如果只能选第三个点，那才是：

**把 coding line 的 context retrieval 明确做成 search-first。**

## 6. 一句话原则

不要试图“把 Claude Code 搬进 AIRI”。

正确做法是：

**用 Claude Code 暴露出来的边界感和默认策略，逼 AIRI 自己长出更干净的 action kernel、lane contracts 和 verification system。**
