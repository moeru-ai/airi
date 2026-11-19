import type { ChatSlices } from '../../../../types/chat'

import { describe, expect, it } from 'vitest'

import { formatToolPayload, groupToolCallSlices, summarizeToolCallGroup, toolDisplayName } from './tool-call-group'

function call(toolCallId: string, toolName = 'web_search'): ChatSlices {
  return { type: 'tool-call', toolCall: { toolCallId, toolCallType: 'function', toolName, args: '{}' } }
}

describe('tool call groups', () => {
  // A streamed reply interleaves text and calls. Text splits runs, and results never split them.
  it('groups consecutive calls, keeps results inside a run, and splits on text and own renderers', () => {
    const slices: ChatSlices[] = [
      { type: 'text', text: 'One moment.' },
      call('a'),
      { type: 'tool-call-result', id: 'a', result: 'ok' },
      call('b'),
      { type: 'text', text: 'Next.' },
      call('c', 'image_journal'),
      call('d'),
    ]

    const entries = groupToolCallSlices(slices, toolName => toolName === 'image_journal')

    expect(entries.map(entry => entry.kind === 'slice' ? entry.sliceIndex : entry.items.map(item => item.sliceIndex))).toEqual([0, [1, 3], 4, 5, [6]])
  })

  // A provider can repeat a call id across rounds. Two sibling groups still need different keys.
  it('keys groups by call id and its occurrence in the whole reply', () => {
    const entries = groupToolCallSlices([call('same'), { type: 'text', text: 'Next' }, call('same')], () => false)

    expect(entries.flatMap(entry => entry.kind === 'tool-group' ? [entry.key] : [])).toEqual(['same#0', 'same#1'])
  })

  it('reads every tool name the same way', () => {
    expect(toolDisplayName('builtIn_emitSparkCommand')).toBe('Emit spark command')
    expect(toolDisplayName('home_assistant_call_service')).toBe('Home assistant call service')
    expect(toolDisplayName('__')).toBe('__')
  })

  // The folded line follows the newest running call, then reports the total and the failures.
  it('summarizes running and settled calls', () => {
    expect(summarizeToolCallGroup(['done', 'executing'])).toEqual({ phase: 'running', count: 2, current: 1 })
    expect(summarizeToolCallGroup(['done', 'error', 'done'])).toEqual({ phase: 'settled', count: 3, failed: 1 })
  })
})

describe('tool payload formatting', () => {
  // Every tool shares one formatter, so keys and values stay exactly as the tool sent them.
  it('lists fields with their values and JSON types as sent, and nests objects under their key', () => {
    expect(formatToolPayload('{"city":"Bangkok","days":1,"current":{"isNight":true,"wind":null}}')).toEqual({
      kind: 'object',
      entries: [
        { key: 'city', value: { kind: 'text', text: 'Bangkok', type: 'string' } },
        { key: 'days', value: { kind: 'text', text: '1', type: 'number' } },
        { key: 'current', value: { kind: 'object', entries: [
          { key: 'isNight', value: { kind: 'text', text: 'true', type: 'boolean' } },
          { key: 'wind', value: { kind: 'text', text: 'null', type: 'null' } },
        ] } },
      ],
    })
  })

  it('shows a value that is not JSON as its plain string', () => {
    expect(formatToolPayload('Tool call error: timeout')).toStrictEqual({ kind: 'text', text: 'Tool call error: timeout' })
    expect(formatToolPayload('"quoted"')).toEqual({ kind: 'text', text: 'quoted', type: 'string' })
    expect(formatToolPayload(undefined)).toBeUndefined()
  })

  it('formats structured results', () => {
    expect(formatToolPayload([{ type: 'text', text: 'sunny' }])).toEqual({
      kind: 'array',
      items: [{ kind: 'object', entries: [{ key: 'type', value: { kind: 'text', text: 'text', type: 'string' } }, { key: 'text', value: { kind: 'text', text: 'sunny', type: 'string' } }] }],
    })
  })
})
