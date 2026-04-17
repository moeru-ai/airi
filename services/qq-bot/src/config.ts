// src/config.ts
// ─────────────────────────────────────────────────────────────
// 配置类型定义、Valibot Schema、加载函数
//
// 功能：定义 QQ Bot 的完整配置结构，使用 Valibot schema 实现
//       运行时验证 + 默认值填充 + TypeScript 类型推断三合一。
// 设计依据：
//   - 单一 schema 源（Single Source of Truth）：所有配置的类型、
//     默认值、验证规则都由 Valibot schema 定义，避免 interface
//     与验证逻辑不同步。
//   - 配置优先级：YAML 文件 > 环境变量 > 内置默认值。
//     Valibot 处理 YAML + 默认值，loadConfig 后置处理 env fallback。
//   - 与设计文档 §完整配置文件结构 一一对应，每个 Stage 的配置
//     独立为子 schema，顶层 BotConfigSchema 组合所有子段。
//   - 各 PipelineStage 子类构造函数接收对应的子类型
//     （如 FilterStage(config: FilterConfig)），通过 v.InferOutput 推断。
// ─────────────────────────────────────────────────────────────

import fs from 'node:fs'
import process from 'node:process'

import { parse as parseYaml } from 'yaml'

import * as v from 'valibot'

import { createLogger } from './utils/logger.js'

// ─── 惰性 Logger ─────────────────────────────────────────────
// 与 response.ts 同理：模块加载时 config 尚未就绪，
// 首次调用 getLogger() 时才实例化。
// 但 loadConfig 本身是启动阶段调用，此时 logger 已通过
// createLogger 获得默认 info 级别实例，足够使用。

const logger = createLogger('config')
const EMBEDDING_ENV_PLACEHOLDER_RE = /^\$\{([A-Z0-9_]+)\}$/u

// ═══════════════════════════════════════════════════════════════
// §1 NapLink 连接配置 Schema
// ═══════════════════════════════════════════════════════════════
// 功能：定义 NapLink SDK 构造函数所需的连接参数。
// 设计依据：
//   - 字段与 NapLink 的 NapLinkConfig 类型一一对应，直接透传。
//   - url 是唯一必填项（NapCat 的 WebSocket 地址）。
//   - 超时和心跳间隔有合理默认值，用户通常不需要修改。

const NapLinkConnectionSchema = v.object({
  /** NapCat WebSocket 地址，如 "ws://localhost:3001" */
  url: v.string(),
  /** 访问令牌（可选，NapCat 配置了 token 时需要匹配） */
  token: v.optional(v.string()),
  /** 连接超时（毫秒），默认 30000 */
  timeout: v.optional(v.number(), 30_000),
  /** 心跳间隔（毫秒），默认 30000，0 = 禁用 */
  pingInterval: v.optional(v.number(), 30_000),
})

// ─── NapLink 重连配置 ───
// 功能：控制断线后的自动重连行为。
// 设计依据：
//   - 指数退避（exponential backoff）是 WebSocket 重连的业界标准。
//   - NapLink SDK 内置重连机制，这些参数直接透传给 SDK。
//   - 默认启用重连，最多 10 次，初始延迟 1s，最大 60s，倍率 2。

const NapLinkBackoffSchema = v.object({
  /** 初始延迟（毫秒） */
  initial: v.optional(v.number(), 1_000),
  /** 最大延迟（毫秒） */
  max: v.optional(v.number(), 60_000),
  /** 退避倍数 */
  multiplier: v.optional(v.number(), 2),
})

const NapLinkReconnectSchema = v.object({
  /** 是否启用自动重连 */
  enabled: v.optional(v.boolean(), true),
  /** 最大重连次数 */
  maxAttempts: v.optional(v.number(), 10),
  /** 退避策略 */
  backoff: v.optional(NapLinkBackoffSchema, {
    initial: 1_000,
    max: 60_000,
    multiplier: 2,
  }),
})

// ─── NapLink 日志配置 ───
// 设计依据：NapLink 自身的日志级别控制。
//   实际做法是把 NapLink level 设为 'debug'（全部吐出），
//   由我们的 NapLinkLoggerAdapter 内部 LoggerInstance 控制过滤。
//   但仍暴露此配置项，允许用户在 NapLink 层级额外限制。

const NapLinkLoggingSchema = v.object({
  level: v.optional(
    v.picklist(['debug', 'info', 'warn', 'error', 'off']),
    'debug',
  ),
})

// ─── NapLink API 配置 ───
// 功能：控制 NapLink API 调用（OneBot action）的超时和重试。
// 设计依据：NapLink 对每个 action 调用都有内置的超时和重试机制，
//   这些参数直接透传给 SDK。

const NapLinkApiSchema = v.object({
  /** API 调用超时（毫秒） */
  timeout: v.optional(v.number(), 30_000),
  /** API 失败重试次数 */
  retries: v.optional(v.number(), 3),
})

// ─── NapLink 顶层 Schema ───

const NapLinkSchema = v.object({
  connection: NapLinkConnectionSchema,
  reconnect: v.optional(NapLinkReconnectSchema, {
    enabled: true,
    maxAttempts: 10,
    backoff: { initial: 1_000, max: 60_000, multiplier: 2 },
  }),
  logging: v.optional(NapLinkLoggingSchema, { level: 'debug' }),
  api: v.optional(NapLinkApiSchema, { timeout: 30_000, retries: 3 }),
})

// ═══════════════════════════════════════════════════════════════
// §2 流水线各阶段配置 Schema
// ═══════════════════════════════════════════════════════════════

// ─── ① FilterStage 配置 ───
// 功能：基础过滤——黑白名单、系统用户、空消息过滤。
// 设计依据：
//   - 合并 AstrBot 的 WakingCheck + Whitelist 两个阶段为一个。
//   - whitelistMode 默认关闭（false），即默认接受所有非黑名单消息。
//   - QQ 管家 (2854196310) 作为默认系统用户写入 ignoreSystemUsers。
//   - ignoreEmptyMessages 默认 true，过滤纯表情/空内容消息，
//     避免浪费 LLM token。
//   - whitelistUsers 是对设计文档的补充：whitelistMode 开启时，
//     除了白名单群，也应支持白名单用户（如管理员私聊）。

const FilterConfigSchema = v.object({
  /** QQ 号黑名单 */
  blacklistUsers: v.optional(v.array(v.string()), []),
  /** 群号黑名单 */
  blacklistGroups: v.optional(v.array(v.string()), []),
  /** 是否启用白名单模式（启用后仅允许白名单内的群/用户） */
  whitelistMode: v.optional(v.boolean(), false),
  /** 白名单群号（whitelistMode = true 时生效） */
  whitelistGroups: v.optional(v.array(v.string()), []),
  /**
   * 白名单用户 QQ 号（whitelistMode = true 时生效）
   * 设计补充：原设计文档仅有 whitelistGroups，
   * 但白名单模式下也需要支持特定用户（如管理员私聊），
   * 故增加此字段。FilterStage 判定逻辑：
   *   whitelistMode && !(whitelistGroups.includes(groupId) || whitelistUsers.includes(userId))
   *   → skip
   */
  whitelistUsers: v.optional(v.array(v.string()), []),
  /** 系统用户 QQ 号（始终过滤），默认含 QQ 管家 */
  ignoreSystemUsers: v.optional(v.array(v.string()), ['2854196310']),
  /** 是否过滤纯表情/空消息 */
  ignoreEmptyMessages: v.optional(v.boolean(), true),
})

// ─── ② WakeStage 配置 ───
// 功能：判定消息是否需要 bot 响应。
// 设计依据：
//   - 唤醒条件优先级：私聊 > @bot > 回复bot > 关键词 > 随机。
//   - keywordMatchMode 支持三种模式，'contains' 最常用作为默认。
//   - randomWakeRate 默认 0（关闭），避免 bot 未经配置就随机回复。
//   - alwaysWakeInPrivate 默认 true：私聊场景 bot 应始终响应。

const WakeConfigSchema = v.object({
  /** 触发关键词列表，如 ["airi", "爱莉"] */
  keywords: v.optional(v.array(v.string()), []),
  /** 关键词匹配模式：prefix = 前缀匹配，contains = 包含，regex = 正则 */
  keywordMatchMode: v.optional(
    v.picklist(['prefix', 'contains', 'regex']),
    'contains',
  ),
  /**
   * 群聊随机唤醒概率 (0~1)，0 = 关闭。
   * loadConfig 后置校验会 clamp 到 [0, 1] 范围。
   */
  randomWakeRate: v.optional(v.number(), 0),
  /** 私聊是否始终唤醒 */
  alwaysWakeInPrivate: v.optional(v.boolean(), true),
})

// ─── ③ RateLimitStage 配置 ───
// 功能：防止 bot 刷屏，多维度限流。
// 设计依据：
//   - 三个维度独立限流（per-session / per-user / global），
//     参考 AstrBot 的 RateLimitStage 但增加了 per-user 维度。
//   - 滑动窗口（windowMs）比固定窗口更平滑，避免窗口边界突发。
//   - cooldownMs 是回复后的冷却期，防止同一会话连续触发。
//   - onLimited 默认 'silent'（静默丢弃），避免限流提示本身成为刷屏。

const RateLimitWindowSchema = v.object({
  /** 窗口内最大允许次数 */
  max: v.number(),
  /** 窗口长度（毫秒） */
  windowMs: v.number(),
})

const RateLimitConfigSchema = v.object({
  /** 每会话限流：同一群/私聊内 N 条/窗口 */
  perSession: v.optional(RateLimitWindowSchema, { max: 10, windowMs: 60_000 }),
  /** 每用户限流：同一用户 N 条/窗口 */
  perUser: v.optional(RateLimitWindowSchema, { max: 10, windowMs: 60_000 }),
  /** 全局限流：所有消息 N 条/窗口 */
  global: v.optional(RateLimitWindowSchema, { max: 60, windowMs: 60_000 }),
  /** 单次回复后冷却时间（毫秒） */
  cooldownMs: v.optional(v.number(), 3_000),
  /** 被限流时的策略：silent = 静默丢弃，notify = 回复提示 */
  onLimited: v.optional(v.picklist(['silent', 'notify']), 'silent'),
  /** 限流提示语（仅 onLimited = 'notify' 时使用） */
  notifyMessage: v.optional(v.string(), '请稍后再试~'),
})

// ─── ④ SessionStage 配置 ───
// 功能：控制会话上下文管理行为。
// 设计依据：
//   - maxHistoryPerSession = 50：环形缓冲区容量，
//     参考 AIRI Telegram 的 100 条但减半
//     （QQ 群聊消息更碎片化，50 条已覆盖足够上下文）。
//   - contextWindow = 20：传给 LLM 的上下文条数，
//     与 AIRI Telegram 一致，平衡上下文质量与 token 消耗。
//   - timeoutMs = 30 分钟：会话超时重置，
//     参考常见聊天机器人的会话过期策略。
//   - isolateByTopic：QQ 频道话题隔离，Phase 5 预留。

const SessionConfigSchema = v.object({
  /** 环形缓冲区容量（每会话最大历史条数） */
  maxHistoryPerSession: v.optional(v.number(), 50),
  /** LLM 上下文窗口大小（取最近 N 条传给 LLM） */
  contextWindow: v.optional(v.number(), 20),
  /** 会话超时（毫秒），超时后清空上下文 */
  timeoutMs: v.optional(v.number(), 30 * 60 * 1_000),
  /** QQ 频道话题隔离（Phase 5 预留） */
  isolateByTopic: v.optional(v.boolean(), false),
})

// ─── ④.1 DB 配置 ───
// 功能：控制本地 SQLite 持久化路径与清理策略。
const DbConfigSchema = v.object({
  /** SQLite 文件路径 */
  path: v.optional(v.string(), 'data/qq-bot.db'),
  /** 每个 session 保留的消息历史条数上限 */
  maxHistoryRows: v.optional(v.number(), 500),
  /** 定时清理间隔（毫秒），0 = 禁用 */
  pruneIntervalMs: v.optional(v.number(), 3_600_000),
})

// ─── ④.3 Embedding 配置 ───
// 功能：控制 embedding 提供方与模型参数。
const EmbeddingConfigSchema = v.object({
  enabled: v.optional(v.boolean(), true),
  provider: v.optional(v.picklist(['bailian']), 'bailian'),
  apiKey: v.optional(v.string()),
  model: v.optional(v.string(), 'text-embedding-v4'),
  dimension: v.optional(v.number(), 1024),
})

// ─── ④.4 语义检索配置 ───
// 功能：控制是否启用语义检索与返回条数。
const SemanticRetrievalConfigSchema = v.object({
  enabled: v.optional(v.boolean(), true),
  topK: v.optional(v.number(), 5),
})

// ─── ④.2 Context Compression 配置 ───
// 功能：在上下文接近模型窗口上限时压缩历史，避免硬截断。
const CompressionConfigSchema = v.object({
  /** 是否启用上下文压缩 */
  enabled: v.optional(v.boolean(), true),
  /** 触发阈值（占 maxContextWindow 的比例） */
  threshold: v.optional(v.number(), 0.82),
  /** 压缩策略：truncate 或 llm-summary */
  strategy: v.optional(v.picklist(['truncate', 'llm-summary']), 'llm-summary'),
  /** truncate 策略：每次丢弃轮数 */
  truncateRounds: v.optional(v.number(), 2),
  /** llm-summary 策略：保留最近轮数 */
  keepRecentRounds: v.optional(v.number(), 4),
  /** 模型上下文窗口上限 */
  maxContextWindow: v.optional(v.number(), 8192),
  /** llm-summary 的摘要提示词 */
  summaryPrompt: v.optional(v.string(), [
    '基于完整对话历史，生成关键要点和进展的简洁摘要：',
    '1. 系统性覆盖所有讨论的核心话题及最终结论',
    '2. 如果使用了工具，总结工具调用次数和关键发现',
    '3. 用用户的语言撰写摘要',
  ].join('\n')),
})

// ─── ⑤ ProcessStage 配置 ───
// 功能：核心处理阶段的配置，包含命令系统。
// 设计依据：
//   - 命令前缀默认 '/'，与大多数 QQ bot 惯例一致。
//     env fallback，在 loadConfig 后置处理中实现（§5 步骤 4）。
//     这三个字段在 schema 中均为 v.optional(v.string())，
//     不设 Valibot 层默认值——默认值来自环境变量。
//   - systemPrompt 默认空字符串，留空 = 不注入 system message，
//     由用户在 YAML 中自定义角色设定。
//   - temperature 0.7 是对话场景的常用值（兼顾创意与一致性）。
//   - maxTokens 2048 适合大多数单轮回复场景。

const ProcessConfigSchema = v.object({
  /** AIRI 响应超时（毫秒），默认 60000 */
  replyTimeoutMs: v.optional(v.number(), 60_000),
  /** 发送失败重试次数，默认 3 */
  sendMaxRetries: v.optional(v.number(), 3),
  commands: v.optional(
    v.object({
      prefix: v.optional(v.string(), '/'),
      enabled: v.optional(
        v.array(v.string()),
        ['help', 'status', 'new', 'switch', 'history', 'clear'],
      ),
    }),
    { prefix: '/', enabled: ['help', 'status', 'new', 'switch', 'history', 'clear'] },
  ),
})

// ─── ⑥ DecorateStage 配置 ───
// 功能：响应装饰——消息分割、格式转换、内容过滤。
// 设计依据：
//   - maxMessageLength = 4500：QQ 单条消息字符限制约 4500~5000，
//     留 500 字符余量避免边界截断。
//   - splitStrategy 默认 'multi-message'：长消息拆为多条发送，
//     比截断（truncate）用户体验更好。
//   - autoReply 默认 true：群聊中自动引用原消息，
//     声明式设置 response.replyTo，Dispatcher 统一注入 ReplySegment。
//   - contentFilter 默认关闭，用户按需启用敏感词替换。

const ContentFilterSchema = v.object({
  /** 是否启用内容过滤 */
  enabled: v.optional(v.boolean(), false),
  /** 敏感词替换映射 { "原词": "替换词" } */
  replacements: v.optional(v.record(v.string(), v.string()), {}),
})

const DecorateConfigSchema = v.object({
  /** 单条消息最大长度（字符数） */
  maxMessageLength: v.optional(v.number(), 4500),
  /** 长消息拆分策略：truncate = 截断，multi-message = 拆分为多条 */
  splitStrategy: v.optional(
    v.picklist(['truncate', 'multi-message']),
    'multi-message',
  ),
  /** 是否自动引用原消息（声明式，Dispatcher 统一注入 ReplySegment） */
  autoReply: v.optional(v.boolean(), true),
  /** 内容过滤配置 */
  contentFilter: v.optional(ContentFilterSchema, {
    enabled: false,
    replacements: {},
  }),
})

// ─── ⑦ RespondStage 配置 ───
// 功能：控制消息发送行为——打字延迟、重试等。
// 设计依据：
//   - typingDelay 模拟人类打字速度，范围 200~1000ms，
//     避免 bot 回复过快显得不自然（参考 AIRI Telegram 的 30s sleep，
//     但大幅缩短——30s 太久，QQ 群聊节奏更快）。
//   - multiMessageDelay = 500ms：多条消息间隔，
//     避免 QQ 客户端的消息合并机制把多条消息合成一条。
//   - retryCount = 2：业务层重试次数，NapLink 自身的 api.retries
//     作为底层兜底（两层重试互补）。
//   - retryDelayMs = 1000：重试间隔 1 秒，给 NapCat 恢复时间。

const TypingDelaySchema = v.object({
  /** 最小延迟（毫秒） */
  min: v.optional(v.number(), 200),
  /** 最大延迟（毫秒） */
  max: v.optional(v.number(), 1000),
})

const RespondConfigSchema = v.object({
  /** 模拟打字延迟范围（实际延迟在 min~max 间随机取值） */
  typingDelay: v.optional(TypingDelaySchema, { min: 200, max: 1000 }),
  /** 多条消息间隔（毫秒） */
  multiMessageDelay: v.optional(v.number(), 500),
  /** 发送失败重试次数（业务层） */
  retryCount: v.optional(v.number(), 2),
  /** 重试间隔（毫秒） */
  retryDelayMs: v.optional(v.number(), 1_000),
})

const AgentLoopConfigSchema = v.object({
  enabled: v.optional(v.boolean(), false),
  intervalMs: v.optional(v.number(), 60_000),
  minUnreadToCheck: v.optional(v.number(), 3),
  maxProactivePerHour: v.optional(v.number(), 5),
})

// ═══════════════════════════════════════════════════════════════
// §3 全局日志配置 Schema
// ═══════════════════════════════════════════════════════════════
// 功能：控制全局日志级别，覆盖所有 LoggerInstance。
// 设计依据：
//   - 与 logger.ts 的 initLoggers(config) 对接：
//     loadConfig 返回后，index.ts 调用 initLoggers(config)
//     遍历注册表统一刷新级别。
//   - 默认 'info'：生产环境的常用级别，
//     开发时可在 YAML 中切换为 'debug'。

const GlobalLoggingSchema = v.object({
  level: v.optional(
    v.picklist(['debug', 'info', 'warn', 'error', 'off']),
    'info',
  ),
})

// ═══════════════════════════════════════════════════════════════
// §4 顶层 BotConfig Schema
// ═══════════════════════════════════════════════════════════════
// 功能：组合所有子段，形成完整的配置结构。
// 设计依据：
//   - naplink 是唯一没有顶层默认值的段——connection.url 必须由用户
//     在 YAML 中显式配置（NapCat 地址因部署环境而异）。
//   - 其余所有段都有完整默认值：用户只需配置 naplink.connection.url
//     和 LLM 凭证（env）就能启动最小可用 bot。
//   - botQQ 可选，未设置时通过 client.getLoginInfo() 自动获取，
//     在 client.ts 的 getBotQQ() 中处理。

const AiriSchema = v.object({
  url: v.optional(v.string(), 'ws://localhost:6121/ws'),
  token: v.optional(v.string()),
})

export const BotConfigSchema = v.object({
  /** NapLink 连接配置（直接透传给 NapLink 构造函数） */
  naplink: NapLinkSchema,
  airi: v.optional(AiriSchema, {}),
  /** ① FilterStage 配置 */
  filter: v.optional(FilterConfigSchema, {
    blacklistUsers: [],
    blacklistGroups: [],
    whitelistMode: false,
    whitelistGroups: [],
    whitelistUsers: [],
    ignoreSystemUsers: ['2854196310'],
    ignoreEmptyMessages: true,
  }),

  /** ② WakeStage 配置 */
  wake: v.optional(WakeConfigSchema, {
    keywords: [],
    keywordMatchMode: 'contains' as const,
    randomWakeRate: 0,
    alwaysWakeInPrivate: true,
  }),

  /** ③ RateLimitStage 配置 */
  rateLimit: v.optional(RateLimitConfigSchema, {
    perSession: { max: 10, windowMs: 60_000 },
    perUser: { max: 10, windowMs: 60_000 },
    global: { max: 60, windowMs: 60_000 },
    cooldownMs: 3_000,
    onLimited: 'silent' as const,
    notifyMessage: '请稍后再试~',
  }),

  /** ④ SessionStage 配置 */
  session: v.optional(SessionConfigSchema, {
    maxHistoryPerSession: 50,
    contextWindow: 20,
    timeoutMs: 30 * 60 * 1_000,
    isolateByTopic: false,
  }),

  /** SQLite 持久化配置 */
  db: v.optional(DbConfigSchema, {
    path: 'data/qq-bot.db',
    maxHistoryRows: 500,
    pruneIntervalMs: 3_600_000,
  }),

  /** Embedding 配置 */
  embedding: v.optional(EmbeddingConfigSchema, {
    enabled: true,
    provider: 'bailian' as const,
    apiKey: undefined,
    model: 'text-embedding-v4',
    dimension: 1024,
  }),

  /** 语义检索配置 */
  semanticRetrieval: v.optional(SemanticRetrievalConfigSchema, {
    enabled: true,
    topK: 5,
  }),

  /** 上下文压缩配置 */
  compression: v.optional(CompressionConfigSchema, {
    enabled: true,
    threshold: 0.82,
    strategy: 'llm-summary' as const,
    truncateRounds: 2,
    keepRecentRounds: 4,
    maxContextWindow: 8192,
    summaryPrompt: [
      '基于完整对话历史，生成关键要点和进展的简洁摘要：',
      '1. 系统性覆盖所有讨论的核心话题及最终结论',
      '2. 如果使用了工具，总结工具调用次数和关键发现',
      '3. 用用户的语言撰写摘要',
    ].join('\n'),
  }),

  /** ⑤ ProcessStage 配置 */
  process: v.optional(ProcessConfigSchema, {
    replyTimeoutMs: 60_000,
    sendMaxRetries: 3,
    commands: { prefix: '/', enabled: ['help', 'status', 'new', 'switch', 'history', 'clear'] },
  }),

  /** ⑥ DecorateStage 配置 */
  decorate: v.optional(DecorateConfigSchema, {
    maxMessageLength: 4500,
    splitStrategy: 'multi-message' as const,
    autoReply: true,
    contentFilter: { enabled: false, replacements: {} },
  }),

  /** ⑦ RespondStage 配置 */
  respond: v.optional(RespondConfigSchema, {
    typingDelay: { min: 200, max: 1000 },
    multiMessageDelay: 500,
    retryCount: 2,
    retryDelayMs: 1_000,
  }),

  agentLoop: v.optional(AgentLoopConfigSchema, {
    enabled: false,
    intervalMs: 60_000,
    minUnreadToCheck: 3,
    maxProactivePerHour: 5,
  }),

  /** 全局日志级别（覆盖所有 logger 实例） */
  logging: v.optional(GlobalLoggingSchema, { level: 'info' }),

  /**
   * Bot QQ 号（可选）。
   * 未设置时通过 client.getLoginInfo() 自动获取（见 client.ts getBotQQ）。
   * 显式设置可跳过一次 API 调用，也可用于测试环境。
   */
  botQQ: v.optional(v.string()),
})

// ═══════════════════════════════════════════════════════════════
// §5 类型导出
// ═══════════════════════════════════════════════════════════════
// 功能：从 Valibot schema 推断 TypeScript 类型并导出。
// 设计依据：
//   - 使用 v.InferOutput 而非手写 interface，确保类型与 schema
//     始终同步（Single Source of Truth）。
//   - 各阶段子类型独立导出，供 PipelineStage 子类构造函数使用
//     （如 FilterStage(config: FilterConfig)）。
//   - 顶层 BotConfig 供 index.ts、client.ts、PipelineRunner 使用。

/** 完整配置类型（顶层） */
export type BotConfig = v.InferOutput<typeof BotConfigSchema>

/** NapLink 连接配置类型 */
export type NapLinkConfig = v.InferOutput<typeof NapLinkSchema>

/** ① FilterStage 配置类型 */
export type FilterConfig = v.InferOutput<typeof FilterConfigSchema>

/** ② WakeStage 配置类型 */
export type WakeConfig = v.InferOutput<typeof WakeConfigSchema>

/** ③ RateLimitStage 配置类型 */
export type RateLimitConfig = v.InferOutput<typeof RateLimitConfigSchema>

/** ④ SessionStage 配置类型 */
export type SessionConfig = v.InferOutput<typeof SessionConfigSchema>

/** ④.1 DB 配置类型 */
export type DbConfig = v.InferOutput<typeof DbConfigSchema>

/** ④.2 Context Compression 配置类型 */
export interface CompressionConfig extends v.InferOutput<typeof CompressionConfigSchema> {}

/** ④.3 Embedding 配置类型 */
export type EmbeddingConfig = v.InferOutput<typeof EmbeddingConfigSchema>

/** ④.4 语义检索配置类型 */
export type SemanticRetrievalConfig = v.InferOutput<typeof SemanticRetrievalConfigSchema>

/** ⑤ ProcessStage 配置类型（含 commands + llm） */
export type ProcessConfig = v.InferOutput<typeof ProcessConfigSchema>

/** 内置命令配置类型（来源于 ProcessConfig.commands） */
export type CommandsConfig = ProcessConfig['commands']

/** ⑥ DecorateStage 配置类型 */
export type DecorateConfig = v.InferOutput<typeof DecorateConfigSchema>

/** ⑦ RespondStage 配置类型 */
export type RespondConfig = v.InferOutput<typeof RespondConfigSchema>

/** AgentLoop 配置类型 */
export type AgentLoopConfig = v.InferOutput<typeof AgentLoopConfigSchema>

// ═══════════════════════════════════════════════════════════════
// §6 配置加载函数
// ═══════════════════════════════════════════════════════════════

/** 默认配置文件路径 */
const DEFAULT_CONFIG_PATH = 'config.yaml'

/**
 * 加载并验证配置文件。
 *
 * 功能：从 YAML 文件读取配置，通过 Valibot schema 验证并填充默认值，
 *       最后对 LLM 字段做环境变量 fallback。
 * 设计依据：
 *   - 配置优先级：YAML 文件 > 环境变量 > 内置默认值。
 *   - Valibot v.parse() 一步完成验证 + 默认值填充 + 类型推断。
 *   - 三种错误场景分别给出清晰提示：
 *     1. 文件不存在 → 提示路径和示例文件
 *     2. YAML 语法错误 → yaml 库自带行号信息
 *     3. Schema 验证失败 → 格式化 Valibot issues 为可读文本
 *   - 后置业务校验（warn 级别，不阻止启动）：
 *     randomWakeRate 越界。
 *
 * @param path - YAML 文件路径（默认 'config.yaml'）
 * @returns 验证后的 BotConfig 对象（所有字段已填充默认值）
 * @throws 文件不存在、YAML 语法错误、Schema 验证失败时抛出 Error
 */
export function loadConfig(path: string = DEFAULT_CONFIG_PATH): BotConfig {
  // ─── 步骤 1：读取文件 ───
  // 使用同步读取：loadConfig 在启动阶段调用，
  // 此时无并发需求，同步更简洁且易于错误处理。
  let rawYaml: string
  try {
    rawYaml = fs.readFileSync(path, 'utf-8')
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Failed to read config file "${path}": ${message}\n`
      + 'Hint: Copy config.example.yaml to config.yaml and fill in your settings.',
    )
  }

  // ─── 步骤 2：解析 YAML ───
  // yaml 库的 parse() 在语法错误时抛出 YAMLParseError，
  // 自带行号和位置信息，直接透传给用户。
  let rawObject: unknown
  try {
    rawObject = parseYaml(rawYaml)
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to parse YAML in "${path}": ${message}`)
  }

  // 空文件或纯注释 → yaml.parse 返回 null/undefined
  if (rawObject == null || typeof rawObject !== 'object') {
    throw new Error(
      `Config file "${path}" is empty or does not contain a valid YAML object.`,
    )
  }

  // ─── 步骤 3：Valibot 验证 + 默认值填充 ───
  // v.parse(schema, input)：
  //   - 通过 → 返回类型安全的 BotConfig（所有 v.optional 字段已填充默认值）
  //   - 失败 → 抛出 ValiError，包含结构化 issues 数组
  let config: BotConfig
  try {
    config = v.parse(BotConfigSchema, rawObject)
  }
  catch (err) {
    // 格式化 Valibot 错误为可读文本
    // 每个 issue 包含 path（字段路径）和 message（错误描述）
    if (err instanceof v.ValiError) {
      const issues = err.issues
        .map((issue) => {
          const fieldPath = issue.path
            ?.map((p: v.IssuePathItem) => p.key)
            .join('.')
            ?? '(root)'
          return `  - ${fieldPath}: ${issue.message}`
        })
        .join('\n')
      throw new Error(
        `Config validation failed for "${path}":\n${issues}`,
      )
    }
    throw err
  }

  // ─── 步骤 4：后置业务校验（warn 级别，不阻止启动） ───
  // 设计依据：
  //   某些跨字段约束或语义约束无法用 Valibot 单字段 schema 表达。
  //   用 warn（非 throw）：允许用户先启动 bot 再逐步完善配置。

  // randomWakeRate 越界保护：clamp 到 [0, 1] 并 warn。
  // 不在 Valibot schema 中用 v.minValue/v.maxValue，
  // 因为我们想 clamp 而非 reject（宽容策略）。
  const wakeConfig = config.wake ?? {
    keywords: [],
    keywordMatchMode: 'contains' as const,
    randomWakeRate: 0,
    alwaysWakeInPrivate: true,
  }

  if (wakeConfig.randomWakeRate < 0 || wakeConfig.randomWakeRate > 1) {
    logger.warn(
      `wake.randomWakeRate (${wakeConfig.randomWakeRate}) is outside [0, 1] range, `
      + 'clamping to nearest bound.',
    )
    wakeConfig.randomWakeRate = Math.max(0, Math.min(1, wakeConfig.randomWakeRate))
  }

  config.wake = wakeConfig

  // embedding.apiKey 支持 ${ENV_VAR} 占位符注入。
  const embeddingConfig = config.embedding
  if (embeddingConfig.apiKey) {
    const match = embeddingConfig.apiKey.match(EMBEDDING_ENV_PLACEHOLDER_RE)
    if (match) {
      const envKey = match[1]
      embeddingConfig.apiKey = process.env[envKey]
      if (!embeddingConfig.apiKey)
        logger.warn(`embedding.apiKey env var is empty: ${envKey}`)
    }
  }

  if (embeddingConfig.enabled && !embeddingConfig.apiKey)
    logger.warn('embedding is enabled but embedding.apiKey is empty, semantic embedding will be disabled at runtime')

  logger.info(`Config loaded from "${path}"`)
  return config
}

/**
 * 监听配置文件变更并在成功重载时回调。
 *
 * 设计说明：
 * - 使用 fs.watch + 防抖，避免编辑器一次保存触发多次 reload。
 * - reload 失败仅记录错误并保留当前运行配置，不中断服务。
 */
export function watchConfig(
  path: string,
  onReload: (config: BotConfig) => void,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const watcher = fs.watch(path, () => {
    if (debounceTimer)
      clearTimeout(debounceTimer)

    debounceTimer = setTimeout(() => {
      try {
        const nextConfig = loadConfig(path)
        logger.info(`Config reloaded from "${path}"`)
        onReload(nextConfig)
      }
      catch (err) {
        logger.error(`Config reload failed for "${path}"`, err as Error)
      }
    }, 500)
  })

  return () => {
    watcher.close()
    if (debounceTimer)
      clearTimeout(debounceTimer)
  }
}
