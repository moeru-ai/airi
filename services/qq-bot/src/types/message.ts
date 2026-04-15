// src/types/message.ts
// ─────────────────────────────────────────────────────────────
// 消息段（MessageSegment）类型定义 & 工具函数
//
// 功能：定义 QQ Bot 内部流转的消息原子单元，并提供基础操作工具集。
// 设计依据：
//   - OneBot V11 协议的消息段模型为 { type, data }，本文件在此基础上
//     使用 TypeScript discriminated union 做类型收窄，使 Normalizer、
//     DecorateStage 等模块可通过 switch(seg.type) 获得完整的类型安全。
//   - NapLink SDK 的消息段是宽泛的 { type: string, data: Record<string, any> }，
//     我们在内部流转（chain、ResponsePayload）中使用自定义的强类型定义，
//     Normalizer 是唯一的 NapLink → 内部类型 转换点。
//   - 当前覆盖 9 种 QQ 常用消息段类型，后续可按需扩展。
// ─────────────────────────────────────────────────────────────

/**
 * 所有支持的消息段类型字面量联合。
 * 用于泛型约束、运行时类型判断等场景。
 */
export type MessageSegmentType
  = | 'text'
    | 'image'
    | 'at'
    | 'reply'
    | 'face'
    | 'file'
    | 'voice'
    | 'forward'
    | 'poke'

// ─── 具体消息段接口 ───────────────────────────────────────────
// 每个接口以 type 字面量作为判别字段（discriminant），
// data 中只保留该类型必需/可选的字段，保持最小化。

/** 纯文本消息段 */
export interface TextSegment {
  type: 'text'
  data: { text: string }
}

/**
 * 图片消息段
 * - file: 图片文件标识（可以是本地路径、URL 或 Base64，取决于 OneBot 实现端）
 * - url:  图片的可访问 URL（收到消息时由实现端填充，发送时可选）
 */
export interface ImageSegment {
  type: 'image'
  data: { file: string, url?: string }
}

/**
 * @提及消息段
 * - qq: 被 @ 的用户 QQ 号；特殊值 'all' 表示 @全体成员
 */
export interface AtSegment {
  type: 'at'
  data: { qq: string }
}

/**
 * 引用回复消息段
 * - id: 被引用的原消息 ID（OneBot message_id）
 */
export interface ReplySegment {
  type: 'reply'
  data: { id: string }
}

/**
 * QQ 表情消息段
 * - id: QQ 表情的数字 ID（对应 QQ 内置表情编号）
 */
export interface FaceSegment {
  type: 'face'
  data: { id: string }
}

/**
 * 文件消息段
 * - file: 文件标识
 * - name: 可选的文件显示名称
 */
export interface FileSegment {
  type: 'file'
  data: { file: string, name?: string }
}

/** 语音消息段 */
export interface VoiceSegment {
  type: 'voice'
  data: { file: string }
}

/**
 * 合并转发消息段
 * - id: 转发消息的 resId（通过此 ID 可获取完整转发内容）
 */
export interface ForwardSegment {
  type: 'forward'
  data: { id: string }
}

/**
 * 戳一戳消息段
 * - type: 戳一戳的子类型（如 "poke"、"ShowLove" 等，由 QQ 定义）
 * - id:   戳一戳的子类型 ID
 * 注意：data.type 与外层的 type: 'poke' 不冲突，前者描述戳一戳的具体动作，
 *       后者是 discriminated union 的判别字段。
 */
export interface PokeSegment {
  type: 'poke'
  data: { type: string, id: string }
}

// ─── 联合类型 ────────────────────────────────────────────────

/**
 * 消息段联合类型（Discriminated Union）。
 * 在内部流水线中作为消息链 (MessageSegment[]) 的元素类型使用。
 *
 * 使用方式：
 *   switch (seg.type) {
 *     case 'text':  seg.data.text   // TS 自动窄化为 TextSegment
 *     case 'image': seg.data.file   // TS 自动窄化为 ImageSegment
 *     ...
 *   }
 */
export type MessageSegment
  = | TextSegment
    | ImageSegment
    | AtSegment
    | ReplySegment
    | FaceSegment
    | FileSegment
    | VoiceSegment
    | ForwardSegment
    | PokeSegment

// ─── 输入/输出侧联合类型（P2 新增） ─────────────────────────

/** 输入侧消息段（含 ReplySegment），用于 event.chain、sessionHistory */
export type InputMessageSegment = MessageSegment

/** 输出侧消息段（不含 ReplySegment），用于 ResponsePayload.segments */
export type OutputMessageSegment = Exclude<MessageSegment, ReplySegment>

// ─── 工具函数 ────────────────────────────────────────────────
// 以下函数是消息链的基础操作工具集，供 Normalizer、WakeStage、
// DecorateStage 等模块使用。
//
// 设计原则：
//   - 全部为纯函数，不修改传入的 chain（.filter()/.map() 天然返回新数组）
//   - 空数组输入返回合理默认值（空字符串 / false / 空数组）
//   - 签名与设计文档一致，便于各模块按文档约定直接调用

/**
 * 拼接消息链中所有 TextSegment 的纯文本。
 *
 * 功能：从混合类型的消息链中提取文本内容，返回拼接后的字符串。
 * 设计依据：
 *   - Normalizer 优先使用 NapLink 的 raw_message 作为 event.text，
 *     本函数作为备用方案，用于需要从修改后的消息链重新提取文本的场景
 *     （如 DecorateStage 对消息链做变换后重新拼接）。
 *   - 不插入分隔符，因为 QQ 消息链中相邻 TextSegment 的文本
 *     本身已包含完整的空格和标点。
 *
 * @param chain - 消息段数组
 * @returns 拼接后的纯文本字符串；空链返回 ''
 */
export function extractText(chain: MessageSegment[]): string {
  return chain
    .filter((seg): seg is TextSegment => seg.type === 'text')
    .map(seg => seg.data.text)
    .join('')
}

/**
 * 判断消息链是否包含指定类型的消息段。
 *
 * 功能：通用的消息段类型检测，各流水线阶段均可使用。
 * 设计依据：
 *   - FilterStage 用于判断是否为纯表情消息（仅含 'face' 段）
 *   - WakeStage 用于判断是否包含 'reply' 段（回复 bot 唤醒条件）
 *   - 其他阶段按需使用，避免重复编写 .some() 逻辑
 *
 * @param chain - 消息段数组
 * @param type - 要检测的消息段类型
 * @returns 存在该类型返回 true；空链返回 false
 */
export function hasSegmentType(chain: MessageSegment[], type: MessageSegmentType): boolean {
  return chain.some(seg => seg.type === type)
}

/**
 * 判断消息链是否 @了指定的 bot。
 *
 * 功能：检测消息链中是否存在指向 bot 的 AtSegment。
 * 设计依据：
 *   - WakeStage 的 @bot 唤醒条件依赖此函数。
 *   - @全体成员（qq: 'all'）不视为 @bot：
 *     条件 seg.data.qq === botQQ 天然排除 'all'，
 *     因为合法 QQ 号不可能等于字符串 'all'。
 *   - 不考虑 @bot 出现多次的情况——只要存在一个即返回 true。
 *
 * @param chain - 消息段数组
 * @param botQQ - bot 的 QQ 号字符串
 * @returns 消息链中存在 @bot 返回 true；否则（含空链）返回 false
 */
export function findAtTarget(chain: InputMessageSegment[], botQQ: string): boolean {
  return chain.some(seg => seg.type === 'at' && seg.data.qq === botQQ)
}

/**
 * 从消息链中移除所有 @bot 的消息段，返回新数组。
 *
 * 功能：在 @bot 唤醒后，清理消息链中的 @bot 段，
 *       使后续阶段（ProcessStage）只处理实际内容。
 * 设计依据：
 *   - WakeStage 判定 @bot 唤醒后调用此函数，将清理后的 chain
 *     写回 event.chain，避免 LLM 收到无意义的 @段。
 *   - 仅移除 @bot 的段，保留 @其他用户 和 @全体成员（'all'），
 *     因为这些信息对 LLM 理解群聊语境可能有价值。
 *   - .filter() 天然返回新数组，不会修改原始 chain（纯函数保证）。
 *   - 使用德摩根定律展开保留条件（ESLint de-morgan/no-negated-conjunction）。
 *
 * @param chain - 消息段数组
 * @param botQQ - bot 的 QQ 号字符串
 * @returns 移除 @bot 段后的新消息段数组；空链返回 []
 */
export function removeAtSegments(chain: InputMessageSegment[], botQQ: string): InputMessageSegment[] {
  return chain.filter(seg => seg.type !== 'at' || seg.data.qq !== botQQ)
}
