import type { FlowEntry } from '../context-flow-types'

import { describe, expect, it } from 'vitest'

import { useContextFlowFormatters } from './use-context-flow-formatters'

describe('useContextFlowFormatters', () => {
  const { buildPreviewItems, formatDestinations } = useContextFlowFormatters()

  it('formats destinations consistently', () => {
    expect(formatDestinations(['alpha', 'beta'])).toBe('alpha, beta')
    expect(formatDestinations('single')).toBe('single')
  })

  it('builds preview items for context updates', () => {
    const entry: FlowEntry = {
      id: 1,
      timestamp: Date.now(),
      direction: 'incoming',
      channel: 'server',
      type: 'context:update',
      summary: 'test',
      payload: {
        data: {
          text: 'Hello world',
          destinations: ['character'],
        },
      },
      searchText: '',
    }

    const items = buildPreviewItems(entry)
    expect(items.map(item => item.label)).toEqual(['Text', 'Destinations'])
    expect(items[0]?.value).toContain('Hello world')
    expect(items[1]?.value).toContain('character')
  })
})
