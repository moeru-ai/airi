// src/types/event.ts
// ─────────────────────────────────────────────────────────────
// 统一事件模型（QQMessageEvent）类型定义 & 工具函数
//
// 功能：定义从 NapLink 事件标准化后的统一消息事件结构，
//       作为流水线所有阶段的输入载体。
// 设计依据：
//   - 适配器内部使用统一事件模型，屏蔽 NapLink SDK 的层级化
//     事件类型差异（GroupMessageEventData / PrivateMessageEventData 等）。
//   - source 独立接口，来源元数据与消息内容解耦。
//   - raw: unknown（决策 ②）— 各事件 data 类型各异，无法用
//     单一具体类型覆盖，需要时 as 断言到具体类型。
//   - chain 使用自定义 InputMessageSegment[]（决策 #5），
//     获得 discriminated union 的类型安全。
//   - context 引用 PipelineContext（types/context.ts，决策 ①），
//     打破 event.ts ↔ pipeline/stage.ts 循环依赖。
//   - 移除 createEvent()（决策 ②）— NapLink 无统一 NapLinkEventData
//     类型，改由各 Normalizer 函数直接构造 QQMessageEvent，
//     共享初始化通过 createDefaultContext() 实现。
// ─────────────────────────────────────────────────────────────

import type { PipelineContext } from './context'
import type { InputMessageSegment } from './message'

// ─── 来源类型 ────────────────────────────────────────────────

/**
 * 消息来源类型。
 * - 'private': 私聊（C2C）
 * - 'group':   群聊
 * - 'guild':   QQ 频道（Phase 5 预留）
 *
 * 与 OneBot V11 message_type 对齐，额外预留 guild。
 * 使用字面量联合（非 enum），与项目风格一致。
 */
export type EventSourceType = 'private' | 'group' | 'guild'

// ─── 来源信息 ────────────────────────────────────────────────

/**
 * 消息来源元数据。
 *
 * 设计依据：
 *   - platform: 'qq' 字面量，预留跨平台扩展。
 *   - sessionId 格式 "qq:{type}:{groupId|userId}"，
 *     与 AstrBot unified_msg_origin 对齐，供 SessionStage /
 *     RateLimitStage 统一做会话隔离和限流。
 *   - groupId/groupName 可选——私聊不携带，避免空字符串。
 *   - userName 由 Normalizer 决定优先级：群名片(card) > 昵称(nickname)。
 */
export interface EventSource {
  /** 平台标识，固定 'qq'。预留跨平台扩展。 */
  platform: 'qq'
  /** 消息来源类型 */
  type: EventSourceType
  /** 发送者 QQ 号（字符串，避免大数精度丢失） */
  userId: string
  /** 发送者显示名（群名片 > 昵称） */
  userName: string
  /** 群号（仅群聊时存在） */
  groupId?: string
  /**
   * 群名称（仅群聊时存在）。
   * NapLink GroupMessageEventData 可能不含 group_name，
   * Normalizer 尝试提取，缺失时置 undefined（非关键路径）。
   */
  groupName?: string
  /**
   * 统一会话 ID。格式 "qq:{type}:{groupId|userId}"
   * 由 buildSessionId() 集中构造，确保格式一致性。
   */
  sessionId: string
}

// ─── 统一事件模型 ────────────────────────────────────────────

/**
 * QQ 消息事件 — 流水线的统一输入载体。
 *
 * 设计依据：
 *   - Normalizer 构造完整实例，各阶段只读 source/chain/text，
 *     可写 context 和 stopped（职责分离）。
 *   - id = String(OneBot message_id)，与 ReplySegment.data.id 格式一致。
 *   - text 取 NapLink raw_message（非 chain 拼接），更准确。
 *   - raw 保留 NapLink 原始 data（unknown），用于回退访问扩展字段。
 *   - context 由 createDefaultContext() 初始化（黑板模式）。
 *   - stopped 是事件级中止标志，与 StageResult 互补：
 *     Runner 依次检查 StageResult → event.stopped。
 */
export interface QQMessageEvent {
  /** 消息唯一 ID（= String(OneBot message_id)） */
  id: string
  /** 收到时间戳（Unix 毫秒，Normalizer 取 Date.now()） */
  timestamp: number
  /** 消息来源信息 */
  source: EventSource
  /**
   * NapLink 原始事件 data（保留用于回退）。
   * unknown 类型：不同事件 data 结构各异，需要时 as 断言：
   *   const raw = event.raw as GroupMessageEventData
   */
  raw: unknown
  /**
   * 标准化消息链（输入侧，含 ReplySegment）。
   * Normalizer 从 NapLink data.message 逐段映射而来。
   * WakeStage 可能修改（如 removeAtSegments 去除 @bot 段）。
   */
  chain: InputMessageSegment[]
  /**
   * 纯文本（= NapLink data.raw_message）。
   * WakeStage 关键词匹配、FilterStage 空消息判断的快速路径。
   */
  text: string
  /**
   * 流水线上下文 — 各阶段共享读写区域。
   * 由 createDefaultContext() 初始化，定义在 types/context.ts（决策 ①）。
   */
  context: PipelineContext
  /**
   * 流水线中止标志（初始 false）。
   * 任意阶段可设 true，Runner 每阶段后检查。
   * 与 StageResult 互补：StageResult 是显式返回值，
   * stopped 是紧急中止标志。
   */
  stopped: boolean
}

// ─── 工具函数 ────────────────────────────────────────────────

/**
 * 构造统一会话 ID。
 *
 * 功能：格式化 sessionId 字符串 "qq:{type}:{id}"。
 * 设计依据：
 *   - 格式与 AstrBot unified_msg_origin 对齐。
 *   - 群聊用 groupId（同群共享上下文），私聊用 userId（独立上下文）。
 *   - 独立函数而非 Normalizer 内联——sessionId 格式是项目级约定，
 *     集中定义避免 normalizeGroupMessage / normalizePrivateMessage
 *     各自拼接导致不一致。
 *
 * @param type - 消息来源类型
 * @param groupId - 群号（群聊/频道时）
 * @param userId - 用户 QQ 号（私聊 fallback）
 * @returns 格式化的 sessionId，如 "qq:group:123456"
 */
export function buildSessionId(
  type: EventSourceType,
  groupId: string | undefined,
  userId: string,
): string {
  // 群聊/频道以 groupId 为会话标识，私聊以 userId 为会话标识。
  // groupId 缺失时 fallback 到 userId（防御性，正常群聊不会缺失）。
  const id = type === 'private' ? userId : groupId ?? userId
  return `qq:${type}:${id}`
}
