import { describe, expect, it } from 'vitest'

import { toSpeechText } from './speech-text'

describe('toSpeechText', () => {
  it('removes markup that has no sound', () => {
    expect(toSpeechText('This is **important** and *soft*.')).toBe('This is important and soft.')
    expect(toSpeechText('这是**重要**的事情。')).toBe('这是重要的事情。')
    expect(toSpeechText('Read [the guide](https://example.com/guide) first.')).toBe('Read the guide first.')
    expect(toSpeechText('Run `pnpm test` now.')).toBe('Run pnpm test now.')
    expect(toSpeechText('A ![cat](cat.png) sleeps.')).toBe('A cat sleeps.')
  })

  it('puts a line break between blocks so that each block ends a TTS chunk', () => {
    expect(toSpeechText('# Plan\n\n- First step\n- Second step\n\n> Done')).toBe('Plan\nFirst step\nSecond step\nDone')
  })

  it('skips code blocks, HTML, and thematic breaks', () => {
    expect(toSpeechText('Before.\n\n```ts\nconst a = 1\n```\n\n---\n\n<div>hidden</div>\n\nAfter.')).toBe('Before.\nAfter.')
  })

  it('keeps symbols that the writer meant as operators', () => {
    expect(toSpeechText('2 * 3 = 6')).toBe('2 * 3 = 6')
    expect(toSpeechText('2*3 = 6')).toBe('2*3 = 6')
    expect(toSpeechText('2**10 = 1024')).toBe('2**10 = 1024')
    expect(toSpeechText('x ~= 3.14, ~3 hours')).toBe('x ~= 3.14, ~3 hours')
  })

  it('keeps delimiters that CommonMark reads as emphasis between ASCII operands', () => {
    expect(toSpeechText('x**2 + y**2 = r**2')).toBe('x**2 + y**2 = r**2')
    expect(toSpeechText('a*b*c')).toBe('a*b*c')
  })

  it('keeps each marker, also inside unspoken nodes, in source order', () => {
    const marker = ''

    expect(toSpeechText(`**${marker}Hi** there.`, { marker })).toBe(`${marker}Hi there.`)
    expect(toSpeechText(`See [docs](https://e.com/${marker}).`, { marker })).toBe(`See docs${marker}.`)
    expect(toSpeechText(`One.\n\n\`\`\`\n${marker}\n\`\`\`\n\nTwo.${marker}`, { marker })).toBe(`One.\n${marker}\nTwo.${marker}`)
  })
})
