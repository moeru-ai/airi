import { describe, expect, it } from 'vitest'

import {
  applyResultBudget,
  buildSafetyTierAdvisory,
  clearInvocationLog,
  getInvocationLog,
  getInvocationSummary,
  inferSafetyTier,
  recordInvocation,
} from './tool-invocation-intelligence'

describe('inferSafetyTier', () => {
  it('returns "destructive" when descriptor.destructive is true', () => {
    expect(inferSafetyTier({ destructive: true, readOnly: false } as any)).toBe('destructive')
  })

  it('returns "safe" when readOnly is true and not destructive', () => {
    expect(inferSafetyTier({ destructive: false, readOnly: true } as any)).toBe('safe')
  })

  it('returns "guarded" for default write tools', () => {
    expect(inferSafetyTier({ destructive: false, readOnly: false } as any)).toBe('guarded')
  })

  it('destructive takes precedence over readOnly', () => {
    // Edge case: both true — destructive wins
    expect(inferSafetyTier({ destructive: true, readOnly: true } as any)).toBe('destructive')
  })
})

describe('buildSafetyTierAdvisory', () => {
  it('returns null for unknown tools', () => {
    expect(buildSafetyTierAdvisory('nonexistent_tool_xyz')).toBeNull()
  })
})

describe('applyResultBudget', () => {
  it('passes through content under budget', () => {
    const content = [{ type: 'text', text: 'hello' }]
    const result = applyResultBudget('some_tool', content, 1000)
    expect(result.truncated).toBe(false)
    expect(result.content).toEqual(content)
  })

  it('truncates content over budget', () => {
    const longText = 'x'.repeat(2000)
    const content = [{ type: 'text', text: longText }]
    const result = applyResultBudget('some_tool', content, 100)
    expect(result.truncated).toBe(true)
    expect(result.originalSize).toBe(2000)
    // Last item should be the truncation notice
    const lastItem = result.content.at(-1)
    expect(lastItem.text).toContain('Result truncated')
  })

  it('passes through non-text content items untouched', () => {
    const content = [
      { type: 'image', data: 'base64data' },
      { type: 'text', text: 'x'.repeat(200) },
    ]
    const result = applyResultBudget('some_tool', content, 100)
    expect(result.truncated).toBe(true)
    // Image should still be present
    expect(result.content[0]).toEqual({ type: 'image', data: 'base64data' })
  })

  it('skips budget for exempt tools', () => {
    const longText = 'x'.repeat(100_000)
    const content = [{ type: 'text', text: longText }]
    const result = applyResultBudget('screenshot', content, 100)
    expect(result.truncated).toBe(false)
  })

  it('handles empty content', () => {
    const result = applyResultBudget('some_tool', [], 100)
    expect(result.truncated).toBe(false)
    expect(result.content).toEqual([])
  })

  it('handles multiple text items with partial truncation', () => {
    const content = [
      { type: 'text', text: 'first'.repeat(20) }, // 100 chars
      { type: 'text', text: 'second'.repeat(20) }, // 120 chars
    ]
    const result = applyResultBudget('some_tool', content, 150)
    expect(result.truncated).toBe(true)
    // First item should be fully preserved (100 chars <= 150 budget)
    expect(result.content[0].text).toBe('first'.repeat(20))
  })
})

describe('invocation telemetry', () => {
  it('records and retrieves invocations', () => {
    clearInvocationLog()
    recordInvocation({
      toolName: 'test_tool',
      lane: 'coding',
      safetyTier: 'safe',
      calledAt: new Date().toISOString(),
      durationMs: 42,
      resultTruncated: false,
    })
    expect(getInvocationLog()).toHaveLength(1)
    expect(getInvocationLog()[0].toolName).toBe('test_tool')
  })

  it('getInvocationSummary aggregates correctly', () => {
    clearInvocationLog()
    recordInvocation({
      toolName: 'a',
      lane: 'coding',
      safetyTier: 'safe',
      calledAt: '',
      resultTruncated: false,
    })
    recordInvocation({
      toolName: 'b',
      lane: 'desktop',
      safetyTier: 'destructive',
      calledAt: '',
      resultTruncated: true,
    })
    recordInvocation({
      toolName: 'c',
      lane: 'coding',
      safetyTier: 'guarded',
      calledAt: '',
      resultTruncated: false,
    })

    const summary = getInvocationSummary()
    expect(summary.totalCalls).toBe(3)
    expect(summary.byLane.coding).toBe(2)
    expect(summary.byLane.desktop).toBe(1)
    expect(summary.destructiveCalls).toBe(1)
    expect(summary.truncatedResults).toBe(1)
  })

  it('bounds invocation log to MAX_INVOCATION_LOG', () => {
    clearInvocationLog()
    for (let i = 0; i < 120; i++) {
      recordInvocation({
        toolName: `tool_${i}`,
        lane: 'coding',
        safetyTier: 'safe',
        calledAt: '',
        resultTruncated: false,
      })
    }
    expect(getInvocationLog()).toHaveLength(100)
    // Oldest should have been evicted
    expect(getInvocationLog()[0].toolName).toBe('tool_20')
  })
})
