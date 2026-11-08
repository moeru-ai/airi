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

  it('truncates long text to 160 characters and trims trailing whitespace before ellipsis', () => {
    const longTextWithSpace = `${'a'.repeat(158)}   ${'b'.repeat(20)}`
    expect(normalizeChatReplyPreview(longTextWithSpace)).toBe(`${'a'.repeat(158)}…`)

    const exactLimitAscii = 'a'.repeat(200)
    expect(normalizeChatReplyPreview(exactLimitAscii)).toBe(`${'a'.repeat(159)}…`)
  })

  it('keeps astral-plane emoji whole when straddling the truncation boundary', () => {
    const straddling = `${'a'.repeat(158)}😀 more text after the emoji`
    const straddlingResult = normalizeChatReplyPreview(straddling)
    expect(straddlingResult).toBe(`${'a'.repeat(158)}😀…`)
    expect(straddlingResult.isWellFormed()).toBe(true)
    expect(() => encodeURIComponent(straddlingResult)).not.toThrow()

    const atBoundary = `${'a'.repeat(159)}😀 more text`
    const atBoundaryResult = normalizeChatReplyPreview(atBoundary)
    expect(atBoundaryResult).toBe(`${'a'.repeat(159)}…`)
    expect(atBoundaryResult.isWellFormed()).toBe(true)
    expect(() => encodeURIComponent(atBoundaryResult)).not.toThrow()

    const exact160WithEmoji = `${'a'.repeat(159)}😀`
    const exact160Result = normalizeChatReplyPreview(exact160WithEmoji)
    expect(exact160Result).toBe(exact160WithEmoji)
    expect(exact160Result.isWellFormed()).toBe(true)
    expect(() => encodeURIComponent(exact160Result)).not.toThrow()
  })
})
