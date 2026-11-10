import type { Tool } from '@xsai/shared-chat'

import type { MessageSegment, Turn } from '../messages/types'
import type { ChatHistoryItem } from '../types/chat'

import { errorMessageFrom } from '@moeru/std'

/**
 * Estimates the number of tokens in a string.
 *
 * Uses a conservative rule-of-thumb:
 * - CJK characters: 1 token per character
 * - Non-CJK characters: ~3.5 characters per token (Math.ceil(chars / 3.5))
 * This ensures we never underestimate tokens and risk exceeding model context limits.
 */
export function estimateTextTokens(text: string | undefined | null): number {
  if (!text)
    return 0
  const cjkMatches = text.match(/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g)
  const cjkCount = cjkMatches ? cjkMatches.length : 0
  const nonCjkCount = text.length - cjkCount
  return Math.ceil(cjkCount + (nonCjkCount / 3.5))
}

/**
 * Estimates tokens for an individual MessageSegment.
 */
export function estimateSegmentTokens(segment: MessageSegment): number {
  switch (segment.type) {
    case 'text':
    case 'refusal':
      return estimateTextTokens(segment.text)
    case 'tool-call':
      return estimateTextTokens(segment.name) + estimateTextTokens(segment.arguments) + 8
    case 'tool-result':
      return segment.content.reduce((sum, seg) => sum + estimateSegmentTokens(seg), 0) + 8
    case 'image':
      return segment.detail === 'high' ? 1000 : 256
    case 'audio':
      return 128
    case 'file':
      return estimateTextTokens(segment.name) + 64
    case 'runtime-context':
      return segment.entries.reduce((sum, entry) => sum + estimateTextTokens(entry.text) + 4, 0)
    case 'history-block':
      return 64
    default:
      return 8
  }
}

/**
 * Estimates tokens for a projected Turn.
 */
export function estimateTurnTokens(turn: Turn): number {
  if (turn.type === 'user' || turn.type === 'system') {
    return turn.content.reduce((sum, seg) => sum + estimateSegmentTokens(seg), 4)
  }
  if (turn.type === 'assistant') {
    let tokens = 4
    for (const round of turn.rounds) {
      tokens += round.content.reduce((sum, seg) => sum + (seg.type === 'tool' ? 8 : estimateSegmentTokens(seg)), 4)
      for (const invocation of round.toolInvocations) {
        tokens += estimateTextTokens(invocation.name) + estimateTextTokens(invocation.arguments) + 12
        if (invocation.execution.status === 'succeeded' || invocation.execution.status === 'failed') {
          tokens += invocation.execution.output.reduce((sum, seg) => sum + estimateSegmentTokens(seg), 0)
        }
      }
    }
    return tokens
  }
  return 4
}

/**
 * Estimates tokens for a Tool definition (name, description, parameters schema).
 */
export function estimateToolTokens(tool: Tool): number {
  let tokens = 12 // envelope overhead
  if (tool.function.name)
    tokens += estimateTextTokens(tool.function.name)
  if (tool.function.description)
    tokens += estimateTextTokens(tool.function.description)
  if (tool.function.parameters) {
    try {
      tokens += estimateTextTokens(JSON.stringify(tool.function.parameters))
    }
    catch {
      tokens += 64
    }
  }
  return tokens
}

/**
 * Estimates tokens for a content part (text, image, audio, file) in multimodal messages.
 */
export function estimateContentPartTokens(part: unknown): number {
  if (!part || typeof part !== 'object')
    return 8

  const p = part as Record<string, unknown>
  if (p.type === 'text' && typeof p.text === 'string')
    return estimateTextTokens(p.text)

  if (p.type === 'image_url' || p.type === 'image' || p.type === 'input_image') {
    const imgObj = (p.image_url && typeof p.image_url === 'object') ? (p.image_url as Record<string, unknown>) : undefined
    const detail = imgObj?.detail ?? p.detail
    return detail === 'high' ? 1000 : 256
  }

  if (p.type === 'audio' || p.type === 'input_audio')
    return 128

  if (p.type === 'file') {
    const fileObj = (p.file && typeof p.file === 'object') ? (p.file as Record<string, unknown>) : undefined
    const name = typeof fileObj?.filename === 'string' ? fileObj.filename : (typeof p.name === 'string' ? p.name : '')
    return estimateTextTokens(name) + 64
  }

  return 64
}

/**
 * Estimates tokens for a stored ChatHistoryItem.
 */
export function estimateHistoryItemTokens(item: ChatHistoryItem): number {
  if (item.role === 'assistant') {
    if (item.generationTranscript)
      return estimateTurnTokens(item.generationTranscript)

    if (item.providerTranscript?.length) {
      let tokens = 0
      for (const msg of item.providerTranscript) {
        tokens += 4 // role overhead
        if (typeof msg.content === 'string') {
          tokens += estimateTextTokens(msg.content)
        }
        else if (Array.isArray(msg.content)) {
          for (const part of msg.content)
            tokens += estimateContentPartTokens(part)
        }
        if ('tool_calls' in msg && Array.isArray((msg as { tool_calls?: unknown[] }).tool_calls)) {
          for (const tc of (msg as { tool_calls: Array<{ function?: { name?: string, arguments?: string } }> }).tool_calls) {
            tokens += estimateTextTokens(tc.function?.name) + estimateTextTokens(tc.function?.arguments) + 8
          }
        }
      }
      return Math.max(4, tokens)
    }
  }

  let tokens = 4 // role overhead
  if (typeof item.content === 'string') {
    tokens += estimateTextTokens(item.content)
  }
  else if (Array.isArray(item.content)) {
    for (const part of item.content) {
      tokens += estimateContentPartTokens(part)
    }
  }
  if (item.role === 'assistant' && item.tool_results) {
    for (const res of item.tool_results) {
      tokens += estimateTextTokens(typeof res === 'string' ? res : JSON.stringify(res)) + 8
    }
  }
  if (item.notice)
    tokens += estimateTextTokens(item.notice.source) + 8
  if (item.skills)
    tokens += item.skills.reduce((sum, skill) => sum + estimateTextTokens(skill.instructions) + 10, 0)
  return tokens
}

/**
 * Safely truncates oversized tool result content to fit within a maximum token budget,
 * appending a visible indicator.
 */
export function truncateToolResultContent(
  content: string,
  maxTokens: number,
): { text: string, truncated: boolean, truncatedChars: number } {
  const currentTokens = estimateTextTokens(content)
  if (currentTokens <= maxTokens)
    return { text: content, truncated: false, truncatedChars: 0 }

  const targetTokens = Math.max(20, maxTokens - 20)
  let low = 0
  let high = content.length
  let keepChars = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const tokens = estimateTextTokens(content.slice(0, mid))
    if (tokens <= targetTokens) {
      keepChars = mid
      low = mid + 1
    }
    else {
      high = mid - 1
    }
  }

  keepChars = Math.max(keepChars, 1)
  const truncatedChars = content.length - keepChars
  const marker = `\n\n[... truncated ${truncatedChars} characters to fit context window ...]`
  return {
    text: `${content.slice(0, keepChars)}${marker}`,
    truncated: true,
    truncatedChars,
  }
}

/**
 * Detects whether an error thrown by an LLM provider indicates that the request
 * exceeded the model's maximum context length.
 */
export function isContextLengthExceededError(error: unknown): boolean {
  const message = (errorMessageFrom(error) ?? '').toLowerCase()
  return (
    message.includes('context_length_exceeded')
    || message.includes('maximum context length')
    || message.includes('context window')
    || message.includes('prompt is too long')
    || message.includes('too many tokens')
    || message.includes('max_tokens is too large')
    || message.includes('token limit')
  )
}
