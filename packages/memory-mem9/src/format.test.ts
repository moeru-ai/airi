import { describe, expect, it } from 'vitest'

import { buildSessionSummary, formatMemoriesBlock, normalizeMessageContent, selectMessagesForIngest } from './format'

describe('formatMemoriesBlock', () => {
  it('groups memories by type', () => {
    const block = formatMemoriesBlock([
      {
        id: '1',
        content: 'likes green tea',
        created_at: '',
        updated_at: '',
        memory_type: 'pinned',
      },
      {
        id: '2',
        content: 'works on Project AIRI',
        created_at: '',
        updated_at: '',
        memory_type: 'insight',
      },
    ])

    expect(block).toContain('[Preferences]')
    expect(block).toContain('[Knowledge]')
    expect(block).toContain('likes green tea')
    expect(block).toContain('works on Project AIRI')
  })
})

describe('selectMessagesForIngest', () => {
  it('keeps newest messages within byte budget', () => {
    const selected = selectMessagesForIngest([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
    ], 8, 10)

    expect(selected).toEqual([
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
    ])
  })
})

describe('normalizeMessageContent', () => {
  it('strips injected memory blocks', () => {
    const content = normalizeMessageContent('hello <relevant-memories>secret</relevant-memories> world')
    expect(content).toBe('hello  world'.trim())
  })

  it('joins text parts', () => {
    const content = normalizeMessageContent([
      { type: 'text', text: 'hello' },
      { type: 'image_url', image_url: { url: 'x' } },
      { type: 'text', text: 'world' },
    ])

    expect(content).toBe('hello world')
  })
})

describe('buildSessionSummary', () => {
  it('uses the most recent entries', () => {
    expect(buildSessionSummary(['a', 'b', 'c', 'd'], 2)).toBe('c | d')
  })
})
