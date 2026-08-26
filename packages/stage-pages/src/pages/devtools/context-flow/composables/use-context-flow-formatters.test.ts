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
      channel: 'server',
      direction: 'incoming',
      id: 1,
      payload: {
        data: {
          destinations: ['character'],
          text: 'Hello world',
        },
      },
      searchText: '',
      summary: 'test',
      timestamp: Date.now(),
      type: 'context:update',
    }

    const items = buildPreviewItems(entry)
    expect(items.map(item => item.label)).toEqual(['Text', 'Destinations'])
    expect(items[0]?.value).toContain('Hello world')
    expect(items[1]?.value).toContain('character')
  })
})
