// src/utils/chain-serializer.ts
// ─────────────────────────────────────────────────────────────
// 消息链序列化工具
//
// 功能：将输入消息链转换为可读、单行的上下文文本，供 LLM 注入使用。
// 设计：
//   - 文本段保留原文，但将换行压平为空格，确保结果始终为单行。
//   - 非文本段映射为语义标签，降低上下文歧义。
//   - senderName 存在时输出 "{senderName}: {内容}"，便于还原对话角色。
// ─────────────────────────────────────────────────────────────

import type { InputMessageSegment } from '../types/message.js'

const SINGLE_LINE_BREAK_RE = /\r?\n/gu

function toSingleLine(text: string): string {
  return text.replace(SINGLE_LINE_BREAK_RE, ' ')
}

export function serializeChain(chain: InputMessageSegment[], senderName?: string): string {
  const content = chain
    .map((segment) => {
      switch (segment.type) {
        case 'text':
          return toSingleLine(segment.data.text)
        case 'at':
          return `@${segment.data.qq}`
        case 'image':
          return '[图片]'
        case 'face':
          return '[表情]'
        case 'reply':
          return `[回复:${segment.data.id}]`
        default:
          return `[${segment.type}]`
      }
    })
    .join('')
    .trim()

  const normalizedSenderName = senderName ? toSingleLine(senderName).trim() : ''
  return normalizedSenderName.length > 0 ? `${normalizedSenderName}: ${content}` : content
}
