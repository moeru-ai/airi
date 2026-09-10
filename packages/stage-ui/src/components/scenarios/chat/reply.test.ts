import type { ChatHistoryReplyPayload } from './reply'

import { describe, expect, it } from 'vitest'

import { isChatReplyTargetMessage, normalizeChatReplyPreview } from './reply'

describe('chat reply composition', () => {
  it('normalizes a multi-line message for the compact reply preview', () => {
    expect(normalizeChatReplyPreview('  First line\n\nSecond   line  ')).toBe('First line Second line')
  })

  it('matches reply targets by message id and object identity', () => {
    const message: ChatHistoryReplyPayload['message'] = { role: 'user', content: 'hello' }
    const target: ChatHistoryReplyPayload = { label: 'You', message }

    expect(isChatReplyTargetMessage(target, message)).toBe(true)
    expect(isChatReplyTargetMessage(target, { role: 'user', content: 'hello' })).toBe(false)

    const identifiedTarget: ChatHistoryReplyPayload = {
      label: 'AIRI',
      message: { id: 'assistant-1', role: 'assistant', content: 'hello', slices: [], tool_results: [] },
    }
    expect(isChatReplyTargetMessage(identifiedTarget, {
      id: 'assistant-1',
      role: 'assistant',
      content: 'updated',
      slices: [],
      tool_results: [],
    })).toBe(true)
  })
})
