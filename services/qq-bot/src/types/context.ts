// src/types/context.ts
// ─────────────────────────────────────────────────────────────
// 流水线上下文（PipelineContext）& 相关类型
//
// 功能：定义流水线各阶段共享的上下文结构，以及阶段返回值、唤醒原因。
//
// 设计依据（决策 ① — 打破循环依赖）：
//   原依赖链：event.ts → PipelineContext → stage.ts → QQMessageEvent → event.ts 🔄
//   解决：将 PipelineContext、WakeReason、StageResult 抽离到 types/context.ts，
//   event.ts 和 stage.ts 都单向依赖 context.ts，环路消除。
//
// 设计依据（决策 ② — createDefaultContext 替代 createEvent）：
//   NapLink 各事件类型无统一 NapLinkEventData，createEvent(data, type) 无法类型化。
//   改为各 Normalizer 直接构造 QQMessageEvent，共享初始化由 createDefaultContext() 承担。
//
// 依赖：
//   types/message.ts       → InputMessageSegment
//   types/response.ts      → ResponsePayload
//   pipeline/extensions.ts → PipelineExtensions, createExtensions
// ─────────────────────────────────────────────────────────────

import type { MessageHistoryRow } from '../db/message-history-repo'
import type { PipelineExtensions } from '../pipeline/extensions'
import type { PassiveRecord } from '../pipeline/passive-record'
import type { ResponsePayload } from './response'

import { createExtensions } from '../pipeline/extensions'

// ─── 唤醒原因 ────────────────────────────────────────────────

/**
 * 唤醒原因字面量联合。
 *
 * 功能：标识触发 bot 响应的具体条件，WakeStage 写入 context.wakeReason。
 * 设计依据：
 *   - 与 WakeStage 唤醒优先级一一对应（设计文档 §②）：
 *     private（最高）> at > reply > keyword > random（最低）
 *   - 后续阶段可据此调整行为（如 ProcessStage 对 'random'
 *     降低响应置信度或切换 prompt 策略）。
 */
export type WakeReason = 'private' | 'at' | 'reply' | 'keyword' | 'random'

// ─── 阶段返回值 ─────────────────────────────────────────────

/**
 * 流水线阶段返回值（Discriminated Union）。
 *
 * 功能：PipelineStage.execute() 返回类型，Runner 据此控制流水线走向。
 * 设计依据：
 *   - 'continue': 继续下一阶段（最常见，如 FilterStage 放行）
 *   - 'skip':     跳过后续，不产生响应（如过滤噪声消息）
 *   - 'respond':  提前终止并立即发送响应（如命令直接回复）
 *   - Runner 用 switch(result.action) 穷举，新增 action 编译器强制覆盖。
 */
export type StageResult
  = | { action: 'continue' }
    | { action: 'skip' }
    | { action: 'respond', payload: ResponsePayload }

export type OpenAIMessageRole = 'system' | 'user' | 'assistant'

export interface OpenAIMessage {
  role: OpenAIMessageRole
  content: string
}

// ─── 流水线上下文 ────────────────────────────────────────────

/**
 * 流水线上下文 — 各阶段的共享读写数据区（黑板模式）。
 *
 * 设计依据：
 *   各阶段按职责写入，后续阶段按需读取，阶段间通过 context 解耦：
 *     WakeStage      → isWakeUp, wakeReason
 *     RateLimitStage → rateLimitPassed
 *     SessionStage   → sessionHistory
 *     ProcessStage   → response
 *     DecorateStage  → response（修饰）
 *   response 三态语义：
 *     undefined     = 尚无阶段产生响应
 *     kind:'silent' = 有意静默
 *     kind:'message'/'forward' = 正常响应
 *   extensions 承载顶层字段之外的阶段间共享数据
 *     （替代被移除的 ResponsePayload.metadata，YAGNI 决策）。
 */
export interface PipelineContext {
  /** 是否触发了唤醒条件（WakeStage 写入） */
  isWakeUp: boolean
  /** 唤醒原因（WakeStage 写入，仅 isWakeUp=true 时有值） */
  wakeReason?: WakeReason
  /** 是否通过频率限制（RateLimitStage 写入） */
  rateLimitPassed: boolean
  /**
   * 当前会话最近 N 条消息历史（SessionStage 写入）。
   * 每个元素包含发送者信息 + 原始消息链，便于下游序列化为对话上下文。
   * ProcessStage 读取作为 LLM 上下文窗口。
   */
  sessionHistory: PassiveRecord[]
  /** 当前活跃对话的 OpenAI 风格历史，由 ConversationStage 注入。 */
  conversationHistory?: OpenAIMessage[]
  /** Phase 3b：语义检索返回的相关历史消息。 */
  semanticHistory?: MessageHistoryRow[]
  /** 当前活跃对话 ID，由 ConversationStage 注入。 */
  conversationId?: string
  /**
   * 流水线响应载荷（ProcessStage / DecorateStage 写入）。
   * undefined = 尚无响应; kind:'silent' = 有意静默。
   * RespondStage / Dispatcher 消费。
   */
  response?: ResponsePayload
  /** 扩展数据区，见 pipeline/extensions.ts */
  extensions: PipelineExtensions
}

// ─── 工厂函数 ────────────────────────────────────────────────

/**
 * 创建 PipelineContext 默认初始值。
 *
 * 功能：Normalizer 构造 QQMessageEvent 时调用。
 * 设计依据（决策 ②）：
 *   - 替代原 createEvent() — NapLink 各事件无统一输入类型，
 *     改由各 Normalizer 直接构造事件，共享初始化走本函数。
 *   - 集中定义默认值，避免各 Normalizer 各自内联导致不一致。
 *   - 初始值：isWakeUp=false, rateLimitPassed=false,
 *     sessionHistory=[], response=undefined, extensions={}
 *
 * @returns 安全默认值的 PipelineContext
 */
export function createDefaultContext(): PipelineContext {
  return {
    isWakeUp: false,
    wakeReason: undefined,
    rateLimitPassed: false,
    sessionHistory: [],
    conversationHistory: undefined,
    semanticHistory: undefined,
    conversationId: undefined,
    response: undefined,
    extensions: createExtensions(),
  }
}
