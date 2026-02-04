import type { LlmLogEntry } from './llm-log'

import { describe, expect, it } from 'vitest'

import { createLlmLogRuntime } from './llm-log'

function seedEntries(count: number): LlmLogEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    turnId: Math.floor(index / 2) + 1,
    kind: index % 3 === 0 ? 'planner_error' : 'turn_input',
    timestamp: 1000 + index,
    eventType: 'perception',
    sourceType: 'minecraft',
    sourceId: index % 2 === 0 ? 'Alex' : 'Steve',
    tags: index % 3 === 0 ? ['error', 'planner'] : ['input'],
    text: index % 3 === 0 ? 'Invalid tool parameters' : 'Chat event',
    metadata: { i: index },
  }))
}

describe('llmLog runtime', () => {
  it('supports fluent filtering and latest slicing', () => {
    const entries = seedEntries(20)
    const llmLog = createLlmLogRuntime(() => entries)
    const result = llmLog.query().errors().latest(3).list()

    expect(result).toHaveLength(3)
    expect(result.every(entry => entry.tags.includes('error'))).toBe(true)
    expect(result[0]?.timestamp).toBeGreaterThan(result[1]?.timestamp ?? 0)
  })

  it('supports text/source filtering and counting', () => {
    const entries = seedEntries(12)
    const llmLog = createLlmLogRuntime(() => entries)
    const count = llmLog
      .query()
      .textIncludes('invalid tool')
      .whereSource('minecraft', 'Alex')
      .count()

    expect(count).toBeGreaterThan(0)
  })

  it('returns immutable copies from latest()', () => {
    const entries = seedEntries(4)
    const llmLog = createLlmLogRuntime(() => entries)
    const recent = llmLog.latest(2)
    recent[0]!.tags.push('mutated')

    expect(entries[3]?.tags.includes('mutated')).toBe(false)
  })
})
