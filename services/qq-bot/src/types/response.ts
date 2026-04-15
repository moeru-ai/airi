// src/types/response.ts
// ─────────────────────────────────────────────────────────────
// 响应载荷（ResponsePayload）类型定义 & 工厂函数
//
// 功能：定义流水线输出的三种响应形态（消息、合并转发、静默），
//       并提供类型安全的构造入口，确保各分支字段在编译期互斥。
// 设计依据：
//   - 使用 kind 判别字段 + TypeScript discriminated union，
//     switch(payload.kind) 自动窄化，编译期杜绝 segments/forward 混用。
//   - 输出侧消息段使用 OutputMessageSegment（不含 ReplySegment），
//     ReplySegment 仅由 Dispatcher 在发送前根据 replyTo 注入，
//     保证引用回复的单一声明式入口。
//   - 工厂函数返回窄类型（MessageResponse / ForwardResponse / SilentResponse），
//     调用方无法构造非法组合；所有空值边界 fail-fast（throw Error）。
//   - 移除无消费方的 metadata 字段（YAGNI），阶段间共享数据
//     由 PipelineContext.extensions（强类型）承担。
// 接口：
//   - 类型：ResponsePayload, MessageResponse, ForwardResponse,
//           SilentResponse, ForwardNode
//   - 工厂：createMessageResponse, createTextResponse,
//           createForwardResponse, createForwardNode, createSilentResponse
//   - 工具：mergeAdjacentText
// ─────────────────────────────────────────────────────────────

import type { OutputMessageSegment } from './message'

import { createLogger } from '../utils/logger'

// ─── 惰性 Logger ─────────────────────────────────────────────
// 避免模块加载时 config 尚未就绪导致 createLogger 拿到默认配置。
// 首次调用 getLogger() 时才实例化，此后复用同一实例。

let _logger: ReturnType<typeof createLogger> | undefined
function getLogger() {
  return (_logger ??= createLogger('response'))
}

// ─── ResponsePayload（Discriminated Union） ───────────────────
// 流水线输出的三种响应形态，以 kind 字面量作为判别字段。
//
// 使用方式：
//   switch (payload.kind) {
//     case 'message': payload.segments  // TS 窄化为 MessageResponse
//     case 'forward': payload.forward   // TS 窄化为 ForwardResponse
//     case 'silent':  /* no-op */       // TS 窄化为 SilentResponse
//   }

/**
 * 响应载荷联合类型。
 * ProcessStage / 命令处理器通过工厂函数构造，Dispatcher 按 kind 分发。
 */
export type ResponsePayload
  = | MessageResponse
    | ForwardResponse
    | SilentResponse

/**
 * 消息响应 — 发送一条或多条消息段组成的消息。
 * - segments: 输出侧消息段数组（不含 ReplySegment）
 * - replyTo:  可选的引用回复目标消息 ID，Dispatcher 统一转换为 ReplySegment
 */
export interface MessageResponse {
  kind: 'message'
  segments: OutputMessageSegment[]
  replyTo?: string
}

/**
 * 合并转发响应 — 发送一组合并转发节点。
 * - forward: 转发节点数组，每个节点包含伪造的发送者信息和消息内容
 */
export interface ForwardResponse {
  kind: 'forward'
  forward: ForwardNode[]
}

/**
 * 静默响应 — 流水线正常走完但不发送消息。
 * 适用场景：插件已处理、webhook 已触发等无需用户感知的后台操作。
 * 注意：需要用户反馈的命令（如 /clear）应用 createTextResponse，非 silent。
 */
export interface SilentResponse {
  kind: 'silent'
}

// ─── ForwardNode ─────────────────────────────────────────────

// TODO: nested forward — OneBot V11 支持 forward 节点的 content 中
// 再嵌套 ForwardSegment，当前设计暂不支持，需在 ForwardNode 类型
// 和 Dispatcher.sendForward() 中处理递归构造。

/**
 * 合并转发节点。
 * - name:    显示的发送者昵称
 * - uin:     显示的发送者 QQ 号
 * - content: 节点消息内容（OutputMessageSegment[]，不含 ReplySegment）
 * - time:    可选的伪造发送时间（Unix 秒级），不填则由实现端填充当前时间
 */
export interface ForwardNode {
  name: string
  uin: string
  content: OutputMessageSegment[]
  time?: number
}

// ─── 工厂函数 ────────────────────────────────────────────────
// 所有 ResponsePayload 的构造都应通过工厂函数，确保：
//   - 空值边界 fail-fast（throw Error），不静默吞错
//   - ForwardNode.time 毫秒防呆（自动转换 + warn）
//   - ForwardNode.content 统一为 OutputMessageSegment[]
//   - replyTo 空字符串视为无效，不写入
// 工厂函数返回窄类型，调用方无法构造非法组合。

/**
 * 构造静默响应。
 *
 * 功能：创建一个 kind='silent' 的响应载荷，表示不发送任何消息。
 * 设计依据：
 *   - 消除 null/undefined 的语义模糊：undefined = 没有阶段产生响应，
 *     silent = 有意选择不回复。Dispatcher 遇到 silent 直接 return。
 *   - 适用场景：插件已处理、webhook 已触发等后台操作。
 *
 * @returns SilentResponse（窄类型）
 */
export function createSilentResponse(): SilentResponse {
  return { kind: 'silent' }
}

/**
 * 通用消息响应工厂。
 *
 * 功能：构造 kind='message' 的响应载荷，所有消息分支的构造都应通过此函数。
 * 设计依据：
 *   - 空 segments 数组 = 上游 bug（LLM 返空 / 逻辑遗漏），fail-fast throw。
 *   - replyTo 空字符串视为无效消息 ID，不写入（避免 Dispatcher 注入
 *     { type: 'reply', data: { id: '' } }，NapCat 行为未定义）。
 *   - 返回窄类型 MessageResponse，赋值给 ResponsePayload 变量时自动 widen。
 *
 * @param segments - 输出侧消息段数组（不含 ReplySegment）
 * @param replyTo - 可选的引用回复目标消息 ID
 * @returns MessageResponse（窄类型）
 * @throws segments 为空数组时 throw Error
 */
export function createMessageResponse(
  segments: OutputMessageSegment[],
  replyTo?: string,
): MessageResponse {
  if (segments.length === 0)
    throw new Error('createMessageResponse: segments must not be empty')

  return {
    kind: 'message',
    segments,
    ...(replyTo && { replyTo }),
  }
}

/**
 * 纯文本响应快捷方式。
 *
 * 功能：将纯文本字符串包装为 MessageResponse，内部委托 createMessageResponse。
 * 设计依据：
 *   - ProcessStage / 命令处理器最常见的输出是纯文本，提供便捷入口。
 *   - 空字符串 = 上游 bug，fail-fast throw（与 createMessageResponse 一致）。
 *   - 等价于 createMessageResponse([{ type: 'text', data: { text } }], replyTo)。
 *
 * @param text - 响应文本内容
 * @param replyTo - 可选的引用回复目标消息 ID
 * @returns MessageResponse（窄类型）
 * @throws text 为空字符串时 throw Error
 */
export function createTextResponse(
  text: string,
  replyTo?: string,
): MessageResponse {
  if (!text)
    throw new Error('createTextResponse: text must not be empty')

  return createMessageResponse(
    [{ type: 'text', data: { text } }],
    replyTo,
  )
}

/**
 * 构造合并转发节点（字符串重载）。
 *
 * @param name - 显示的发送者昵称
 * @param uin - 显示的发送者 QQ 号
 * @param content - 纯文本内容（内部转换为 [TextSegment]）
 * @param time - 可选的伪造发送时间（Unix 秒级）
 */
export function createForwardNode(
  name: string,
  uin: string,
  content: string,
  time?: number,
): ForwardNode
/**
 * 构造合并转发节点（消息段数组重载）。
 *
 * @param name - 显示的发送者昵称
 * @param uin - 显示的发送者 QQ 号
 * @param content - 输出侧消息段数组
 * @param time - 可选的伪造发送时间（Unix 秒级）
 */
export function createForwardNode(
  name: string,
  uin: string,
  content: OutputMessageSegment[],
  time?: number,
): ForwardNode
/**
 * 构造合并转发节点（实现体）。
 *
 * 功能：创建 ForwardNode，统一 content 为 OutputMessageSegment[]。
 * 设计依据：
 *   - string 重载：内部转换为 [TextSegment]，Dispatcher 不再需要做
 *     typeof 分支判断，ForwardNode.content 始终是单一类型。
 *   - 空 content 数组 = 上游 bug，fail-fast throw。
 *   - time 毫秒防呆：JS Date.now() 返回毫秒，OneBot V11 time 为秒级，
 *     传入 > 1e12 时自动 Math.floor(÷1000) + warn，不 throw（意图明确，
 *     只是单位搞错）。
 *   - time ≤ 0（Unix epoch 或负值）几乎 100% 是 bug，warn + 忽略。
 *
 * @param name - 显示的发送者昵称
 * @param uin - 显示的发送者 QQ 号
 * @param content - 纯文本或输出侧消息段数组
 * @param time - 可选的伪造发送时间（Unix 秒级）
 * @returns ForwardNode
 * @throws content 为空数组时 throw Error
 */
export function createForwardNode(
  name: string,
  uin: string,
  content: string | OutputMessageSegment[],
  time?: number,
): ForwardNode {
  const segments: OutputMessageSegment[]
    = typeof content === 'string'
      ? [{ type: 'text', data: { text: content } }]
      : content

  if (segments.length === 0)
    throw new Error('createForwardNode: content must not be empty')

  let resolvedTime = time
  if (resolvedTime != null && resolvedTime > 1e12) {
    getLogger().warn(
      'ForwardNode.time appears to be in milliseconds, auto-converting to seconds',
    )
    resolvedTime = Math.floor(resolvedTime / 1000)
  }

  if (resolvedTime != null && resolvedTime <= 0) {
    getLogger().warn(
      'ForwardNode.time is <= 0 (Unix epoch or negative), ignoring',
    )
    resolvedTime = undefined
  }

  return {
    name,
    uin,
    content: segments,
    ...(resolvedTime != null && { time: resolvedTime }),
  }
}

/**
 * 构造合并转发响应。
 *
 * 功能：创建 kind='forward' 的响应载荷。
 * 设计依据：
 *   - 节点应通过 createForwardNode() 构造，确保 content 已统一为
 *     OutputMessageSegment[]。
 *   - 空节点数组 = 上游 bug，NapCat sendGroupForwardMessage 行为未定义，
 *     fail-fast throw。
 *
 * @param nodes - 合并转发节点数组（应通过 createForwardNode 构造）
 * @returns ForwardResponse（窄类型）
 * @throws nodes 为空数组时 throw Error
 */
export function createForwardResponse(
  nodes: ForwardNode[],
): ForwardResponse {
  if (nodes.length === 0)
    throw new Error('createForwardResponse: nodes must not be empty')

  return { kind: 'forward', forward: nodes }
}

// ─── 工具函数 ────────────────────────────────────────────────

/**
 * 合并相邻 TextSegment 为单个段。
 *
 * 功能：遍历消息段数组，将连续的 TextSegment 合并（拼接 data.text），
 *       非 text 段原样保留。
 * 设计依据：
 *   - LLM 返回文本经 DecorateStage 分割后可能产出连续 TextSegment，
 *     OneBot 实现端对连续 text 段的渲染行为未明确定义（可能拼接、
 *     可能换行、可能各实现不同）。
 *   - DecorateStage 出口处调用此函数，确保 segments 到达 Dispatcher
 *     时相邻 text 段已合并。
 *   - 纯函数，返回新数组，不修改传入的 segments。
 *   - 合并时创建新的 TextSegment 对象（不修改原对象），保持不可变性。
 *
 * @param segments - 输出侧消息段数组
 * @returns 合并后的新数组；空数组输入 → 返回空数组
 */
export function mergeAdjacentText(
  segments: OutputMessageSegment[],
): OutputMessageSegment[] {
  if (segments.length === 0)
    return []

  const result: OutputMessageSegment[] = []

  for (const seg of segments) {
    const prev = result.at(-1)
    if (seg.type === 'text' && prev?.type === 'text') {
      result[result.length - 1] = {
        type: 'text',
        data: { text: prev.data.text + seg.data.text },
      }
    }
    else {
      result.push(seg)
    }
  }

  return result
}
