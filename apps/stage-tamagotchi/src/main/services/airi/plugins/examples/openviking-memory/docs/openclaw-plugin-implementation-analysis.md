# OpenViking OpenClaw 插件实现分析

> 面向其他项目实现类似插件的对比参考文档

---

## 目录

1. [整体架构](#1-整体架构)
2. [Recall 机制（自动记忆召回）](#2-recall-机制自动记忆召回)
3. [一轮对话结束后的处理（afterTurn）](#3-一轮对话结束后的处理afterturn)
4. [Agent 分离的处理](#4-agent-分离的处理)
5. [其他关键设计](#5-其他关键设计)
6. [实现对比参考清单](#6-实现对比参考清单)

---

## 1. 整体架构

### 1.1 插件定位

OpenViking 插件是一个 **context-engine** 类型的 OpenClaw 插件。它既提供工具的注册，更重要的是它接管了 OpenClaw 的**上下文组装(assemble)** 和**对话后处理(afterTurn)** 两个核心流程，通过远程 OpenViking 服务实现记忆管理。

### 1.2 核心文件职责

| 文件 | 职责 |
|------|------|
| [index.ts](file:///Users/wangtingting/Workspace/OpenViking/examples/openclaw-plugin/index.ts) | 插件入口：注册 tools、commands、hooks、context-engine、service |
| [config.ts](file:///Users/wangtingting/Workspace/OpenViking/examples/openclaw-plugin/config.ts) | 配置 schema 和默认值（30+ 配置项） |
| [client.ts](file:///Users/wangtingting/Workspace/OpenViking/examples/openclaw-plugin/client.ts) | OpenViking 服务 HTTP 客户端（REST API 封装） |
| [context-engine.ts](file:///Users/wangtingting/Workspace/OpenViking/examples/openclaw-plugin/context-engine.ts) | 核心上下文引擎：assemble / afterTurn / compact |
| [auto-recall.ts](file:///Users/wangtingting/Workspace/OpenViking/examples/openclaw-plugin/auto-recall.ts) | 自动记忆召回逻辑 |
| [memory-ranking.ts](file:///Users/wangtingting/Workspace/OpenViking/examples/openclaw-plugin/memory-ranking.ts) | 记忆排序、去重、注入选择 |
| [text-utils.ts](file:///Users/wangtingting/Workspace/OpenViking/examples/openclaw-plugin/text-utils.ts) | 文本清理、捕获决策、新轮次消息提取 |
| [session-transcript-repair.ts](file:///Users/wangtingting/Workspace/OpenViking/examples/openclaw-plugin/session-transcript-repair.ts) | tool_use/tool_result 配对修复 |
| [tool-call-id.ts](file:///Users/wangtingting/Workspace/OpenViking/examples/openclaw-plugin/tool-call-id.ts) | 工具调用 ID 工具函数 |
| [process-manager.ts](file:///Users/wangtingting/Workspace/OpenViking/examples/openclaw-plugin/process-manager.ts) | 超时控制和健康检查 |

### 1.3 插件生命周期

```
Plugin.register(api)
  ├── 解析配置 (memoryOpenVikingConfigSchema)
  ├── 初始化 OpenVikingClient (HTTP 客户端)
  ├── 注册 Tools (11 个工具)
  ├── 注册 Commands (3 个斜杠命令)
  ├── 注册 Hooks (session_start, session_end, before_reset, after_compaction)
  ├── 注册 ContextEngine (assemble / afterTurn / compact / ingest)
  ├── 注册 Service (启动时健康检查)
  └── 注册 Setup CLI
```

### 1.4 对宿主框架的依赖接口

插件通过 `OpenClawPluginApi` 与宿主框架交互：

```typescript
type OpenClawPluginApi = {
  pluginConfig?: unknown;        // 从宿主获取插件配置
  logger: PluginLogger;          // 日志输出
  registerTool: (...);           // 注册工具
  registerCommand?: (...);       // 注册命令
  registerService: (...);        // 注册服务
  registerContextEngine?: (...); // 注册上下文引擎（核心接口）
  registerCli?: (...);           // 注册 CLI
  on: (hookName, handler, opts?) => void;  // 注册生命周期钩子
};
```

---

## 2. Recall 机制（自动记忆召回）

### 2.1 触发时机

Recall 有**两条代码路径**：

**路径 A：Assemble 阶段的 transform_context 路径（自动召回）**

在 [context-engine.ts assemble 方法](file:///Users/wangtingting/Workspace/OpenViking/examples/openclaw-plugin/context-engine.ts#L1091-L1266) 中，当检测到是 `transformContextAssemble`（非主 assemble）时，自动触发 recall 逻辑。

**路径 B：Tool 触发的显式召回**

通过注册 `memory_recall` 工具，Agent 可以显式调用召回。

### 2.2 自动 Recall 完整流程

```
assemble(params)                                    [context-engine.ts]
  │
  ├─ 1. 判断是否为 transformContextAssemble
  │     - 无 availableTools/citationsMode/prompt 参数 → 是
  │
  ├─ 2. 检查召回条件
  │     - cfg.autoRecall !== false
  │     - 最新消息 role === "user"
  │     - 还没有注入过 recall block（检查 AUTO_RECALL_SOURCE_MARKER）
  │
  ├─ 3. 准备查询文本
  │     prepareRecallQuery(latestMessageText)        [auto-recall.ts]
  │     - sanitizeUserTextForCapture() 清理噪音
  │     - 截断到 RECALL_QUERY_MAX_CHARS (4000)
  │
  ├─ 4. 健康预检
  │     quickRecallPrecheck(baseUrl)                 [process-manager.ts]
  │     - GET /health 超时 500ms
  │
  ├─ 5. 并行搜索（带 5s 超时）
  │     buildAutoRecallContext()                     [auto-recall.ts]
  │     │
  │     ├─ 并行 find 到多个 scope：
  │     │   - viking://user/memories
  │     │   - viking://agent/memories
  │     │   - viking://resources (可选，cfg.recallResources)
  │     │   - 每个 scope 请求 limit = recallLimit * 4（至少 20）
  │     │   - scoreThreshold = 0（服务端不做阈值过滤）
  │     │
  │     ├─ 合并结果 & URI 去重
  │     │
  │     ├─ 过滤叶节点 (level === 2 或无 level)
  │     │
  │     ├─ 后处理排序                                    [memory-ranking.ts]
  │     │   postProcessMemories(items, { limit, scoreThreshold })
  │     │   - 按 score 降序排列
  │     │   - 过滤低于 scoreThreshold 的（默认 0.15）
  │     │   - 按 abstract:category 或 uri 去重
  │     │
  │     ├─ 注入选择（带查询感知的排序）                     [memory-ranking.ts]
  │     │   pickMemoriesForInjection(items, limit, query)
  │     │   - buildRecallQueryProfile(query) → 解析查询意图
  │     │   - rankForInjection(item, query):
  │     │     baseScore + leafBoost(0.12) + eventBoost(0.1)
  │     │     + preferenceBoost(0.08) + lexicalOverlapBoost(≤0.2)
  │     │   - 优先选叶节点；不足时补充非叶节点
  │     │
  │     ├─ 构建记忆行（带字符预算）                         [auto-recall.ts]
  │     │   buildMemoryLinesWithBudget(memories, readFn, options)
  │     │   - recallPreferAbstract: 优先使用 abstract 避免额外 HTTP 请求
  │     │   - 非 abstract 模式下对 level===2 调用 client.read(uri)
  │     │   - recallMaxInjectedChars 字符预算（默认 4000）
  │     │   - 单个记忆不截断：放不下就 skip
  │     │
  │     └─ buildRecallContextBlock(memoryLines)
  │        <relevant-memories>
  │        Source: openviking-auto-recall
  │        The following OpenViking memories may be relevant:
  │        - [category] content
  │        </relevant-memories>
  │
  └─ 6. 将 recall block 注入到最新 user 消息前面
       prependRecallToLatestUserMessage(messages, recallBlock)
```

### 2.3 显式 Recall（memory_recall 工具）

与自动 recall 流程类似，但有以下区别：

- 由 Agent 主动调用，携带自定义 query、limit、scoreThreshold
- 默认搜索 `viking://user/memories` + `viking://agent/memories`（可选 resources）
- 返回格式化的文本结果给 Agent
- 同时在 `details` 中返回结构化数据

### 2.4 配置关键参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `autoRecall` | `true` | 是否启用自动召回 |
| `recallLimit` | `6` | 最终注入的记忆数量上限 |
| `recallScoreThreshold` | `0.15` | 最低分数阈值 |
| `recallMaxInjectedChars` | `4000` | 注入内容的最大字符数 |
| `recallPreferAbstract` | `false` | 是否优先使用摘要而非完整内容 |
| `recallResources` | `false` | 是否在召回中包括 viking://resources |

### 2.5 设计要点总结

1. **查询来源**：从最新用户消息文本提取，自动清理 `<relevant-memories>` 块和元数据噪音
2. **多 scope 并行搜索**：user memories + agent memories + resources 并发搜索
3. **两阶段排序**：先按语义分数的 postProcessMemories，再按查询意图的 pickMemoriesForInjection
4. **字符预算约束**：单个记忆不截断，完整放不下就跳过（而非截断显示）
5. **超时保护**：整个 auto-recall 有 5s 超时，搜索前有健康预检
6. **重复注入保护**：检查消息中是否已有 `AUTO_RECALL_SOURCE_MARKER`

---

## 3. 一轮对话结束后的处理（afterTurn）

### 3.1 触发时机

`afterTurn` 在每轮对话结束时由 OpenClaw 框架调用，触发条件：

- `cfg.autoCapture !== false`
- 不是心跳消息（`isHeartbeat !== true`）

### 3.2 完整流程

```
afterTurn(params)                                  [context-engine.ts]
  │
  ├─ 1. 跳过检查
  │     - !cfg.autoCapture → 直接返回
  │     - isHeartbeat → 直接返回
  │     - isBypassedSession → 跳过并记录 diag
  │
  ├─ 2. 解析 Session Identity
  │     resolveSessionIdentity(params)
  │     - sessionKey = params.sessionKey || runtimeContext.sessionKey
  │     - ovSessionId = openClawSessionToOvStorageId(sessionId, sessionKey)
  │     - agentId = resolveAgentId(sessionId, sessionKey, ovSessionId)
  │
  ├─ 3. 提取新轮次消息
  │     extractNewTurnMessages(messages, prePromptMessageCount)
  │     │
  │     ├─ 扫描所有消息建立 toolUseInputs 索引（toolCallId → input）
  │     │
  │     ├─ 从 startIndex 开始遍历：
  │     │   - user/assistant → role: "user"/"assistant", type: "text"
  │     │     (清理 Sender 元数据、时间戳、relevant-memories 块)
  │     │   - toolResult → role: "user", type: "tool"
  │     │     (携带 toolCallId, toolName, toolInput, toolOutput, toolStatus)
  │     │   - assistant 无文本但有 toolCall → 生成 "[tool: names]" 占位符
  │     │   - 跳过 system 消息
  │     │
  │     └─ coalesceConsecutiveToolMessages()
  │         - 合并连续的纯 tool 消息（多个 toolResult 合并为一个消息的多个 parts）
  │
  ├─ 4. 发送消息到 OpenViking 服务
  │     for each extractedMessage:
  │       client.addSessionMessage(ovSessionId, role, parts, agentId, createdAt, roleId)
  │       - parts 类型：
  │         { type: "text", text: "..." }
  │         { type: "tool", tool_id, tool_name, tool_input, tool_output, tool_status }
  │       - role_id 字段：user 消息携带 senderId 的角色 ID
  │
  ├─ 5. 检查 commit 阈值
  │     client.getSession(ovSessionId, agentId)
  │     if pendingTokens < cfg.commitTokenThreshold (默认 20000):
  │       → 跳过 commit，等待更多消息积累
  │
  └─ 6. 异步 Commit（达到阈值时）
       client.commitSession(ovSessionId, {
         wait: false,    // 不等待 Phase 2 完成
         agentId,
         keepRecentCount: cfg.commitKeepRecentCount  // 默认 10
       })
       │
       ├─ Phase 1: 归档（同步返回）
       │   - 压缩会话消息为 archive
       │   - 返回 task_id（Phase 2 任务 ID）
       │
       └─ Phase 2: 记忆提取（异步后台执行）
           - 从归档内容中提取语义记忆
           - 提取完成后可通过 pollPhase2ExtractionOutcome 查询结果
```

### 3.3 消息类型转换

从 OpenClaw AgentMessage 到 OV Message Part 的转换：

| OpenClaw | OV Part |
|----------|---------|
| `user` (text content) | `{ type: "text", text: cleanedText }` |
| `assistant` (text content) | `{ type: "text", text: cleanedText }` |
| `toolResult` | `{ type: "tool", tool_id, tool_name, tool_input, tool_output, tool_status: "completed" }` |
| `system` | 跳过 |
| `assistant` (仅 toolCall, 无文本) | `{ type: "text", text: "[tool: name1, name2]" }` |

### 3.4 文本清理

发送前文本经过 [sanitizeUserTextForCapture](file:///Users/wangtingting/Workspace/OpenViking/examples/openclaw-plugin/text-utils.ts#L48-L74) 清理：

1. 过滤 HEARTBEAT 消息
2. 提取 Compactor 系统消息中的实际内容
3. 移除 `<relevant-memories>` 块（避免 recall 内容被当作用户输入捕获）
4. 移除 Conversation metadata JSON 块
5. 移除 Sender metadata 块
6. 移除 JSON 代码块中的元数据
7. 移除时间戳前缀 `[2024-01-01 12:00]`
8. 移除 Subagent Context 标记
9. 移除 null 字符，合并多余空白

### 3.5 Commit 阈值机制

- `commitTokenThreshold`（默认 20000）：累计的 pending_tokens 超过此值才触发 commit
- `commitKeepRecentCount`（默认 10）：commit 后保留最近 N 条消息在 session 中，保持上下文连续性
- `compact` 路径中 `keepRecentCount` 始终为 0（全量归档）
- Commit 使用 `wait: false` 模式，Phase 2 记忆提取异步执行

### 3.6 设计要点总结

1. **增量捕获**：只提取本轮新增的消息（通过 `prePromptMessageCount` 确定起点）
2. **结构化传输**：消息以 parts 数组形式发送，区分 text 和 tool 类型
3. **阈值触发**：积累够阈值才 commit，避免频繁提交
4. **WM v2 保留**：commit 后保留最近 N 条消息保持上下文的连续性
5. **异步提取**：Phase 2 记忆提取不阻塞对话流程
6. **噪音清理**：多层正则清理确保发送到 OV 的是干净的用户内容

---

## 4. Agent 分离的处理

### 4.1 核心问题

OpenClaw 支持多个 Agent（如 `agent:main`, `agent:cron`），每个 Agent 的对话历史和记忆应该隔离。插件需要将 OpenClaw 的 Agent 身份正确映射到 OpenViking 的多租户路由。

### 4.2 Agent ID 解析流程

```
createSessionAgentResolver(configAgentPrefix)     [index.ts]
  │
  ├─ remember(ctx)
  │   - 从 sessionKey/sessionId 中提取 agentId
  │     extractAgentIdFromSessionKey(sessionKey)
  │     // 正则: /^agent:([^:]+):/
  │   - 构建 resolved agentId = configPrefix + "_" + rawAgentId
  │   - 调用 sanitizeOpenVikingAgentIdHeader() 确保仅 [a-zA-Z0-9_-]
  │   - 记忆映射：sessionKey → resolvedAgentId
  │
  └─ resolve(sessionId, sessionKey, ovSessionId)
      │
      ├─ 1. 查找已记忆的映射
      │     aliases = [sessionId, sessionKey, ovSessionId]
      │     if 任意 alias 已映射 → 复用已有结果
      │
      ├─ 2. 从 sessionKey 中提取 agentId
      │     extractAgentIdFromSessionKey(sessionKey)
      │     extractAgentIdFromSessionKey(sessionId)
      │
      ├─ 3. 回退逻辑
      │     if 有显式 agentId → configPrefix + "_" + agentId
      │     if 无 agentId + 无 prefix → "main"（DEFAULT_OPENCLAW_AGENT_ID）
      │     if 无 agentId + 有 prefix → configPrefix + "_main"
      │
      └─ 返回分支信息
          branch: "session_resolved" | "config_only_fallback" | "default_no_session"
```

### 4.3 Session Key 格式

OpenClaw 的 sessionKey 格式为 `agent:<agentId>:<rest>`，例如：
- `agent:main:session-uuid`
- `agent:cron:daily-backup`

插件从 sessionKey 中提取 `agentId`：
```typescript
function extractAgentIdFromSessionKey(sessionKey?: string): string | undefined {
  const match = raw.match(/^agent:([^:]+):/)
  return match?.[1]?.trim()
}
```

### 4.4 Session ID → OV Storage ID 映射

由于 OpenViking 的 session ID 需要兼容 Windows 路径（不能含 `:`），插件提供映射函数：

```typescript
openClawSessionToOvStorageId(sessionId, sessionKey):
  - 如果 sessionId 是 UUID → 直接使用（小写）
  - 如果 sessionKey 存在 → sha256(sessionKey).hex()
  - 如果 sessionId 含非法字符 → sha256("openclaw-session:" + sessionId).hex()
  - 否则 → 直接使用 sessionId
```

### 4.5 租户路由层级

插件通过 HTTP Header 实现多租户路由：

| Header | 来源 | 说明 |
|--------|------|------|
| `X-OpenViking-Agent` | 动态解析 | 当前会话的 Agent ID |
| `X-OpenViking-Account` | 配置 | 账户级别隔离 |
| `X-OpenViking-User` | 配置 | 用户级别隔离 |
| `X-API-Key` | 配置/环境变量 | API 密钥认证 |

### 4.6 命名空间策略（URI 作用域）

```typescript
// 两种维度的隔离策略（通过配置控制）
isolateUserScopeByAgent:  // false: viking://user/<userId>/...
                          // true:  viking://user/<userId>/agent/<agentId>/...

isolateAgentScopeByUser:  // false: viking://agent/<agentId>/...
                          // true:  viking://agent/<agentId>/user/<userId>/...
```

### 4.7 多范围搜索策略

在 recall 时，并行搜索两个 scope（对应两种记忆类别）：

| Scope | URI | 说明 |
|-------|-----|------|
| User Memories | `viking://user/memories` | 用户级别的跨 Agent 记忆 |
| Agent Memories | `viking://agent/memories` | 当前 Agent 隔离的记忆 |
| Resources | `viking://resources` | 账户级共享知识（可选） |

### 4.8 bypassSessionPatterns 机制

支持按 session key 模式绕过 OpenViking 处理：

```
配置示例: ["agent:*:cron:**"]
- * 匹配单个段（不含 :）
- ** 匹配任意段
- 匹配的 session 跳过所有 OpenViking 操作
```

在 `index.ts` 中每个 tool 和 hook 调用前都会检查：
```typescript
if (isBypassedSession(ctx)) {
  return makeBypassedToolResult(toolName)
}
```

### 4.9 设计要点总结

1. **Session Key 解析 Agent**：从 `agent:<id>:...` 格式中提取 agentId
2. **记忆化映射**：首次解析后缓存 sessionKey → agentId 的映射
3. **三层回退**：显式绑定 → config prefix 回退 → "main" 默认
4. **URI 标准化**：通过 `normalizeTargetUri()` 将别名 URI 转换为完整规范路径
5. **HTTP Header 路由**：通过 X-OpenViking-Agent/Account/User 实现多租户
6. **安全过滤**：agentId 经过 `sanitizeOpenVikingAgentIdHeader()` 确保仅 [a-zA-Z0-9_-]
7. **可配置 bypass**：支持基于模式的 session 绕过

---

## 5. 其他关键设计

### 5.1 上下文组装（assemble）

`assemble` 方法有两种模式：

**主 Assemble（Main Assemble）**：当携带 `availableTools` 或 `citationsMode` 或 `prompt` 参数时

1. 调用 `GET /api/v1/sessions/{id}/context?token_budget=N` 获取 OV 端的上下文
2. 返回的数据包含：
   - `latest_archive_overview` — 所有历史归档的综合摘要
   - `pre_archive_abstracts` — 每个归档的一行摘要
   - `messages` — 未被归档的活跃消息
   - `estimatedTokens` / `stats`
3. 执行 4 层上下文分区：
   - **Instruction** — 系统提示指南（Archive Index 使用说明）
   - **Archive** — 会话历史摘要
   - **Session** — 活跃 OV 消息（预算受限时从头部裁剪）
   - **Reserved** — 预留空间给模型输出
4. 消息规范化处理：
   - `normalizeAssistantContent` → `canonicalizeAgentMessages`
   - `sanitizeToolUseResultPairing` → 修复 tool_use/tool_result 配对
   - `mergeConsecutiveUsers` → 合并连续 user 消息
   - `ensureAlternation` → 确保 user/assistant 交替（防御性检查）

**Transform Context Assemble**：不带上述参数时，只执行 auto-recall（见第 2 节）

### 5.2 压缩（compact）

`compact` 方法在上下文超预算时触发：

1. 检查是否被 bypass
2. 获取 pre-commit 的 token 估算
3. 调用 `commitSession(ovSessionId, { wait: true, keepRecentCount: 0 })` 并等待 Phase 2 完成
4. 获取 post-commit 的 `sessionContext` 验证压缩效果
5. 返回 `tokensBefore` / `tokensAfter` 对比

与 afterTurn 的 commit 区别：compact 路径 `wait: true` 且 `keepRecentCount: 0`

### 5.3 工具结果的 Externalization

插件支持将大型工具结果写入 OV 存储，避免占用对话上下文：

- `openviking_tool_result_list` — 列出 externalized 的工具结果
- `openviking_tool_result_read` — 按偏移量读取工具结果（支持分页）
- `openviking_tool_result_search` — 在 externalized 结果中搜索关键词

### 5.4 会话归档搜索

- `ov_archive_search` — 在已归档消息中 grep 关键词
- `ov_archive_expand` — 展开某个归档，恢复原始消息

### 5.5 生命周期钩子

| 钩子 | 行为 |
|------|------|
| `session_start` | 记录 session → agent 映射 |
| `session_end` | 记录 session → agent 映射 |
| `before_reset` | commitOVSession（wait=true） |
| `after_compaction` | 保留（未来扩展） |

---

## 6. 实现对比参考清单

如果要在其他项目中实现类似插件，以下是需要实现的**核心接口和流程**：

### 6.1 必须实现的能力

| 能力 | 对应接口 | 说明 |
|------|---------|------|
| 配置管理 | `config.ts` | 定义插件配置 schema、默认值、环境变量解析 |
| HTTP 客户端 | `client.ts` | 封装对记忆服务的 REST API 调用 |
| 上下文组装 | `assemble()` | 在发送前注入历史记忆/摘要到上下文 |
| 对话后处理 | `afterTurn()` | 提取新对话内容发送到记忆服务 |
| Agent 路由 | `resolveAgentId()` | 从会话信息解析当前 Agent 身份 |
| 记忆召回 | `auto-recall.ts` | 根据用户输入搜索并注入相关记忆 |

### 6.2 关键设计决策点

1. **Recall 时机**：在 assemble 阶段注入（该插件选择在 `transformContextAssemble` 路径）
2. **Recall 范围**：多 scope 并行搜索 vs 单一 scope
3. **Recall 预算**：基于字符数 vs 基于 token 数 vs 基于条目数
4. **Capture 策略**：全量捕获(semantic) vs 关键词触发(keyword)
5. **Commit 策略**：按阈值触发 vs 每轮触发 vs 定时触发
6. **Agent 隔离**：sessionKey 解析 vs 独立配置 vs 运行时注入
7. **多租户路由**：HTTP Header vs URL path vs JWT
8. **内容清理**：正则过滤 vs NLP 过滤 vs 不清理

### 6.3 最小可行实现路径

如果要实现一个最小版本的类似插件：

```
1. config.ts        — 基础配置（API URL、API Key、autoRecall、autoCapture）
2. client.ts        — fetch wrapper（find、addSessionMessage、commitSession）
3. index.ts         — 注册 context-engine，实现：
   ├── assemble()   — 调用 find API + 注入 recall 结果到 user 消息
   └── afterTurn()  — 调用 addSessionMessage + commitSession
4. agent 路由        — 简单的 config.agentId 或从 session 信息提取
```

### 6.4 无需复用的组件

以下组件与 OpenClaw 框架紧耦合，其他项目需要自行实现对应逻辑：

- `session-transcript-repair.ts` — 修复 tool_use/tool_result 配对（依赖 OpenClaw 的消息格式）
- `tool-call-id.ts` — 工具调用 ID 处理（依赖 OpenClaw 的 AgentMessage 类型）
- `text-utils.ts` 中的 `extractNewTurnMessages` — 消息提取逻辑依赖 OpenClaw 消息格式

### 6.5 数据流总览

```
┌──────────────┐     assemble(recall)     ┌──────────────────┐
│              │ ◄─────────────────────── │                  │
│  OpenClaw    │     afterTurn(capture)   │  OpenViking      │
│  Agent       │ ───────────────────────► │  Plugin          │
│              │                          │                  │
└──────────────┘                          └────────┬─────────┘
                                                   │
                                          ┌────────▼─────────┐
                                          │  OpenViking       │
                                          │  Server           │
                                          │  (REST API)       │
                                          └──────────────────┘

assemble 方向 (读):    find() → 召回记忆 → 注入上下文
afterTurn 方向 (写):   提取消息 → addSessionMessage() → commitSession()
```
