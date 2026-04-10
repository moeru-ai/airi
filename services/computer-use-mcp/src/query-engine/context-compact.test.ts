import { describe, expect, it } from 'vitest'

import type { QueryMessage } from './types'

import { compactIfNeeded, estimateMessageTokens } from './context-compact'

describe('context-compact', () => {
  describe('estimateMessageTokens', () => {
    it('estimates tokens from message content', () => {
      const messages: QueryMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello world.' },
      ]
      const tokens = estimateMessageTokens(messages)
      // ~30 chars / 4 ≈ 8 tokens per message + 4 overhead each ≈ 24 total
      expect(tokens).toBeGreaterThan(10)
      expect(tokens).toBeLessThan(50)
    })

    it('includes tool_calls in assistant token estimate', () => {
      const withoutTools: QueryMessage[] = [
        { role: 'assistant', content: 'Hello' },
      ]
      const withTools: QueryMessage[] = [
        {
          role: 'assistant',
          content: 'Hello',
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'read_file', arguments: '{"file_path": "/foo/bar.ts"}' },
          }],
        },
      ]
      expect(estimateMessageTokens(withTools)).toBeGreaterThan(estimateMessageTokens(withoutTools))
    })
  })

  describe('compactIfNeeded', () => {
    const systemMsg: QueryMessage = { role: 'system', content: 'System prompt.' }
    const userMsg: QueryMessage = { role: 'user', content: 'Do something.' }

    it('does not compact when under threshold', () => {
      const messages: QueryMessage[] = [systemMsg, userMsg]
      const result = compactIfNeeded(messages, {
        compactThreshold: 100_000,
        preserveRecentCount: 5,
      })
      expect(result.compacted).toBe(false)
      expect(result.messages).toBe(messages) // Same reference
    })

    it('does not compact when too few messages', () => {
      const messages: QueryMessage[] = [systemMsg, userMsg]
      const result = compactIfNeeded(messages, {
        compactThreshold: 1, // Very low threshold
        preserveRecentCount: 5,
      })
      expect(result.compacted).toBe(false)
    })

    it('compacts when over threshold with enough messages', () => {
      // Build a long conversation
      const messages: QueryMessage[] = [systemMsg]
      for (let i = 0; i < 20; i++) {
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: `call_${i}`,
            type: 'function',
            function: { name: 'read_file', arguments: `{"file_path": "/file${i}.ts"}` },
          }],
        })
        messages.push({
          role: 'tool',
          tool_call_id: `call_${i}`,
          content: 'x'.repeat(500), // 500 chars each = ~125 tokens
        })
      }

      const result = compactIfNeeded(messages, {
        compactThreshold: 100, // Very low threshold to force compaction
        preserveRecentCount: 5,
      })

      expect(result.compacted).toBe(true)
      expect(result.compactedCount).toBeLessThan(result.originalCount)
      expect(result.estimatedTokensAfter).toBeLessThan(result.estimatedTokensBefore)
      // System message preserved
      expect(result.messages[0]).toBe(systemMsg)
      // Recent messages preserved
      expect(result.messages.length).toBe(5 + 2) // 5 preserved + system + summary
    })

    it('preserves system message and recent messages', () => {
      const messages: QueryMessage[] = [systemMsg]
      for (let i = 0; i < 10; i++) {
        messages.push({ role: 'user', content: `Message ${i} ${'x'.repeat(200)}` })
        messages.push({ role: 'assistant', content: `Reply ${i} ${'y'.repeat(200)}` })
      }

      const result = compactIfNeeded(messages, {
        compactThreshold: 50,
        preserveRecentCount: 4,
      })

      expect(result.compacted).toBe(true)
      // First message is system
      expect(result.messages[0]!.role).toBe('system')
      // Second message is the summary
      expect(result.messages[1]!.role).toBe('user')
      expect(result.messages[1]!.content).toContain('Conversation History Summary')
      // Last 4 messages are preserved verbatim
      const lastFour = result.messages.slice(-4)
      expect(lastFour).toEqual(messages.slice(-4))
    })

    it('includes tool call names in summary', () => {
      const messages: QueryMessage[] = [systemMsg]
      messages.push({
        role: 'assistant',
        content: 'Let me read the file.',
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'read_file', arguments: '{}' },
        }],
      })
      messages.push({ role: 'tool', tool_call_id: 'call_1', content: 'x'.repeat(500) })
      // Add enough messages to trigger compaction
      for (let i = 0; i < 10; i++) {
        messages.push({ role: 'user', content: `msg ${i} ${'z'.repeat(200)}` })
        messages.push({ role: 'assistant', content: `reply ${i} ${'w'.repeat(200)}` })
      }

      const result = compactIfNeeded(messages, {
        compactThreshold: 50,
        preserveRecentCount: 4,
      })

      expect(result.compacted).toBe(true)
      const summary = result.messages[1]!.content
      expect(summary).toContain('read_file')
    })
  })
})
