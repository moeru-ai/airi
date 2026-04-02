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

## 2. AIRI 现在该做什么

### 2.1 先补统一 Tool Descriptor，不要继续散装注册

现在 `register-tools.ts` 还是偏“把工具注册到 MCP”。

下一步应该补一层统一 descriptor，至少带这些字段：

- `canonicalName`
- `displayName`
- `summary`
- `lane`
- `kind`
- `concurrencySafe`
- `readOnly`
- `destructive`
- `requiresApproval`
- `schemaLoader`
- `executor`

重点不是花哨，而是把“工具的语义信息”从注册代码里抽出来。

### 2.2 先做 Tool Directory，再做 Tool Search

不要一上来就做花哨的向量检索。

第一步更合理：

- 做一个稳定的 tool directory
- 每个工具只有名字 + 一句话介绍 + safety 元数据
- 先把这个目录用于 prompt / trace / debug / review

第二步才是：

- 增加一个 `tool_search` 类工具
- 输入任务意图或关键词
- 返回候选工具清单
- 再按需注入完整 schema

换句话说：

- `tool directory` 是基础设施
- `tool search` 是它的消费方式之一

### 2.3 只在“工具太多”时启用精简暴露

不要把 ToolSearch 变成默认路径，不然小场景反而更绕。

更合理的策略：

- 核心固定工具少时，直接给完整 schema
- 工具数量超过阈值时，切到“目录 -> 候选 -> 完整定义”两阶段暴露

建议先把阈值写成显式配置，而不是让实现时自由发挥：

- 例如工具数 > 24
- 或估算工具 schema token 超过某个上限

### 2.4 fail-closed 默认值应该进 Tool Descriptor

建议 AIRI 明确采用这些默认值：

- `concurrencySafe = false`
- `readOnly = false`
- `destructive = false`
- `requiresApproval = true` 对未知 mutation/tool family 走保守路径

这里的核心不是字段长什么样，而是默认策略要保守。

不要因为开发者忘记填 metadata，就把工具默认为无害。

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

## 4. 对应到 `computer-use-mcp` 的实施顺序

### Stage A: Tool Descriptor Registry

目标：

- 给真实 MCP tools 建立统一 descriptor 层
- 不改变工具能力，只改变描述与注册结构

优先落点：

- `src/server/register-tools.ts`
- `src/server/register-coding.ts`
- `src/workflows/prep-tools.ts`

### Stage B: Tool Directory Export

目标：

- 产出一份轻量工具目录
- 每项只有：
  - 工具名
  - 一句话介绍
  - lane
  - safety flags

这个阶段先不做 tool search，也不改模型调用逻辑。

### Stage C: ToolSearch Tool

目标：

- 增加一个内部工具或 runtime 步骤
- 让模型在大工具集下先选候选工具

建议输入：

- 用户任务描述
- 当前 lane 偏好
- 是否允许 mutation

建议输出：

- `toolName`
- `summary`
- `lane`
- `whyMatched`

### Stage D: Selective Schema Hydration

目标：

- 模型只拿候选工具的完整 schema
- 不是每轮都拿全量工具定义

这个阶段才真正开始产生 token 节省收益。

## 5. 对 AIRI 的直接结论

最该学 Claude Code 的，不是“它有多强”，而是这几个判断：

- runtime 要有统一壳
- tool 要有统一 descriptor
- tool 暴露要分层
- 默认值要保守
- lane 要分开

最不该学的，是它那一整坨巨型产品化外围系统。

如果只能选一个现在就做的点，那就是：

**先把 Tool Directory 做出来。**

因为这一步：

- 比直接做 ToolSearch 更稳
- 比继续堆新工具更值钱
- 还能顺手改善 review、trace、prompt 暴露和后续 token 控制

## 6. 一句话原则

不要试图“把 Claude Code 搬进 AIRI”。

正确做法是：

**用 Claude Code 暴露出来的优秀结构，逼 AIRI 自己长出更干净的 runtime 和 tool system。**
