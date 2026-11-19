import { describe, expect, it } from 'vitest'

import { MarkdownSegmenter } from './segmenter'

/** Streams `text` one character at a time, as a model can, and returns every segment, the rest included. */
function segmentsOf(text: string): string[] {
  const segmenter = new MarkdownSegmenter()
  const segments = [...text].flatMap(char => segmenter.push(char))
  return [...segments, ...segmenter.end()]
}

describe('markdownSegmenter', () => {
  it('ends a segment after each sentence, and keeps the text whole', () => {
    const text = '第一句。第二句！First one. Second one? Last'
    const segments = segmentsOf(text)
    expect(segments).toEqual(['第一句。', '第二句！', 'First one. ', 'Second one? ', 'Last'])
    expect(segments.join('')).toBe(text)
  })

  it('keeps a formula, inline code, and a link whole', () => {
    expect(segmentsOf('Area: $x = 3. y$. Then')).toEqual(['Area: $x = 3. y$. ', 'Then'])
    expect(segmentsOf('Run `a. b` now. Then')).toEqual(['Run `a. b` now. ', 'Then'])
    expect(segmentsOf('See [a. b](https://x.y/a. b). Then')).toEqual(['See [a. b](https://x.y/a. b). ', 'Then'])
    expect(segmentsOf('结果是 \\(x。y\\)。然后')).toEqual(['结果是 \\(x。y\\)。', '然后'])
  })

  it('keeps display math and a code block whole across lines', () => {
    expect(segmentsOf('Before.\n$$\nx = 1.\n$$\nAfter.\nEnd')).toEqual(['Before.\n', '$$\nx = 1.\n$$\n', 'After.\n', 'End'])
    expect(segmentsOf('Code:\n```js\na. b\n\nc. d\n```\nAfter. End')).toEqual(['Code:\n', '```js\na. b\n\nc. d\n```\n', 'After. ', 'End'])
  })

  it('does not open a formula at a price', () => {
    expect(segmentsOf('It costs $5. Then $x$. End')).toEqual(['It costs $5. ', 'Then $x$. ', 'End'])
  })

  it('keeps emphasis whole, and reads an asterisk between spaces as an operator', () => {
    expect(segmentsOf('**Bold. Still bold.** Then')).toEqual(['**Bold. Still bold.** ', 'Then'])
    expect(segmentsOf('So 2 * 3. Then')).toEqual(['So 2 * 3. ', 'Then'])
  })

  it('keeps a table, an indented continuation, and a setext heading with their lines', () => {
    expect(segmentsOf('Table:\n| a. | b |\n| - | - |\n| 1. | 2 |\nAfter.\nEnd')).toEqual(['Table:\n', '| a. | b |\n| - | - |\n| 1. | 2 |\n', 'After.\n', 'End'])
    expect(segmentsOf('- Item one\n  more\n- Item two\nEnd')).toEqual(['- Item one\n  more\n', '- Item two\n', 'End'])
    expect(segmentsOf('Title\n===\nBody')).toEqual(['Title\n===\n', 'Body'])
  })

  it('does not end a sentence at a list number or a decimal', () => {
    expect(segmentsOf('1. First\n2. Pi is 3.14 here. End')).toEqual(['1. First\n', '2. Pi is 3.14 here. ', 'End'])
  })

  it('ends a segment at a flush only when nothing is open', () => {
    const segmenter = new MarkdownSegmenter()
    expect(segmenter.push('Half a sentence')).toEqual([])
    expect(segmenter.flush()).toEqual(['Half a sentence'])
    expect(segmenter.push('In $x')).toEqual([])
    expect(segmenter.flush()).toEqual([])
    expect(segmenter.push('^2$')).toEqual([])
    expect(segmenter.flush()).toEqual(['In $x^2$'])
  })
})
