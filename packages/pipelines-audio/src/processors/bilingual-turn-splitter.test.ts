import type { BilingualTurnEvent } from './bilingual-turn-splitter'

import { describe, expect, it } from 'vitest'

import { createBilingualTurnSplitter, projectSpokenText } from './bilingual-turn-splitter'

function collect(chunks: string[]): BilingualTurnEvent[] {
  const splitter = createBilingualTurnSplitter()
  const events = chunks.flatMap(chunk => splitter.consume(chunk))
  events.push(...splitter.end())
  return events
}

function spokenOf(events: BilingualTurnEvent[]): string {
  return events
    .filter(event => event.kind === 'spoken')
    .map(event => event.text)
    .join('')
}

describe('bilingual turn splitter', () => {
  it('pairs each spoken sentence with the bracket that follows it', () => {
    const events = collect(['Hello! [你好！] How are you? [你好吗？]'])

    expect(events).toEqual([
      { kind: 'spoken', text: 'Hello! ' },
      { kind: 'translation', pairId: 0, spokenStart: 0, text: '你好！' },
      { kind: 'spoken', text: ' How are you? ' },
      { kind: 'translation', pairId: 1, spokenStart: 6, text: '你好吗？' },
    ])
  })

  it('reports each pair at the start of its spoken sentence, counted without whitespace', () => {
    const events = collect(['你好！[Hello!] 再见！[Goodbye!]'])

    expect(events.filter(event => event.kind === 'translation')).toEqual([
      { kind: 'translation', pairId: 0, spokenStart: 0, text: 'Hello!' },
      { kind: 'translation', pairId: 1, spokenStart: 3, text: 'Goodbye!' },
    ])
  })

  it('projects a whole turn to its spoken text without the translations', () => {
    expect(projectSpokenText('Hello! [你好！] How are you? [你好吗？]')).toBe('Hello!  How are you? ')
    expect(projectSpokenText('Done. [完成]')).toBe('Done. ')
  })

  it('projects the same text from a streamed chunk sequence', () => {
    const events = collect(['Hel', 'lo! [你', '好！] Bye. [再', '见]'])

    expect(spokenOf(events)).toBe(projectSpokenText('Hello! [你好！] Bye. [再见]'))
    expect(events.filter(event => event.kind === 'translation')).toHaveLength(2)
  })

  it('keeps a markdown link on the spoken track', () => {
    const input = 'See this! [the guide](https://example.com) now.'
    const events = collect([input])

    expect(events).toEqual([{ kind: 'spoken', text: input }])
  })

  it('keeps subscripts and numeric citations on the spoken track', () => {
    const input = 'Read arr[0] now. See also [2].'
    const events = collect([input])

    expect(events).toEqual([{ kind: 'spoken', text: input }])
  })

  it('keeps a bracket without a preceding sentence end on the spoken track', () => {
    const events = collect(['Use arr[index] here.'])

    expect(events).toEqual([{ kind: 'spoken', text: 'Use arr[index] here.' }])
  })

  it('keeps an unclosed bracket on the spoken track at the end of the turn', () => {
    const events = collect(['Wait. [unfinished'])

    expect(spokenOf(events)).toBe('Wait. [unfinished')
    expect(events.filter(event => event.kind === 'translation')).toEqual([])
  })

  it('keeps nested brackets on the spoken track', () => {
    const input = 'The matrix. [[1,2],[3,4]]'
    const events = collect([input])

    expect(spokenOf(events)).toBe(input)
    expect(events.filter(event => event.kind === 'translation')).toEqual([])
  })
})
