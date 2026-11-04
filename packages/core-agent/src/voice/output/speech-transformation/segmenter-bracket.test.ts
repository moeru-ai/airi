import { describe, expect, it } from 'vitest'

import { MarkdownSegmenter } from './segmenter'

/** Streams `text` one character at a time, as a model can, and returns every segment, the rest included. */
function segmentsOf(text: string): string[] {
  const segmenter = new MarkdownSegmenter()
  const segments = [...text].flatMap(char => segmenter.push(char))
  return [...segments, ...segmenter.end()]
}

describe('markdownSegmenter bracket handling', () => {
  // https://github.com/moeru-ai/airi/issues/3391
  // ROOT CAUSE:
  //
  // An unmatched opening bracket "[" (such as an emoticon ":[") in a response
  // increments state.brackets. In CommonMark, links cannot span across blank lines.
  // Because state.brackets and state.url were not reset on blank lines (\n\n),
  // state.brackets remained positive, keeping isOpen(state) true. This blocked
  // MarkdownSegmenter from flushing subsequent paragraphs during streaming until
  // stream completion, delaying speech synthesis.
  //
  // Before:
  // if (text[index + 1] === '\n') {
  //   state.code = undefined
  //   state.emphasis = false
  //   state.strong = false
  //   if (state.math === '$')
  //     state.math = undefined
  // }
  //
  // Fix: reset state.brackets to 0 and state.url to false on blank lines.
  // if (text[index + 1] === '\n') {
  //   state.code = undefined
  //   state.brackets = 0
  //   state.url = false
  //   state.emphasis = false
  //   state.strong = false
  //   if (state.math === '$')
  //     state.math = undefined
  // }
  it('Issue #3391: flushes subsequent paragraphs when a preceding paragraph contains an unmatched opening bracket', () => {
    const text = 'Here is an emoticon :[\n\nSecond paragraph is ready. Next sentence.'
    const segments = segmentsOf(text)

    expect(segments).toEqual([
      'Here is an emoticon :[\n',
      '\n',
      'Second paragraph is ready. ',
      'Next sentence.',
    ])
    expect(segments.join('')).toBe(text)
  })

  it('Issue #3391: emits segments during active streaming before end is called', () => {
    const segmenter = new MarkdownSegmenter()

    // Push first paragraph with unmatched bracket and start of second paragraph
    const firstPush = segmenter.push('Emoticon :[\n\nSecond paragraph. More text follows.')
    // Because state.brackets reset at \n\n, safeEnd found a valid sentence end after "Second paragraph. "
    expect(firstPush).toEqual(['Emoticon :[\n\nSecond paragraph. '])

    // Remainder stays in buffer until end()
    expect(segmenter.end()).toEqual(['More text follows.'])
  })

  it('Issue #3391: resets unclosed url state across blank lines', () => {
    const text = 'Check [broken link](\n\nNew paragraph is ready. Next sentence.'
    const segments = segmentsOf(text)

    expect(segments).toEqual([
      'Check [broken link](\n',
      '\n',
      'New paragraph is ready. ',
      'Next sentence.',
    ])
    expect(segments.join('')).toBe(text)
  })

  it('Issue #3391: resets multiple unmatched brackets across blank lines', () => {
    const segmenter = new MarkdownSegmenter()
    const firstPush = segmenter.push('Emoticons :[ :[ :[\n\nParagraph two. Continuing stream.')
    expect(firstPush).toEqual(['Emoticons :[ :[ :[\n\nParagraph two. '])
    expect(segmenter.end()).toEqual(['Continuing stream.'])
  })

  it('preserves valid markdown links that contain single newlines without blank lines', () => {
    const segmenter = new MarkdownSegmenter()
    const pushResult = segmenter.push('See [link\nlabel](https://example.com/path). More text follows.')
    expect(pushResult).toEqual(['See [link\nlabel](https://example.com/path). '])
    expect(segmenter.end()).toEqual(['More text follows.'])
  })
})
