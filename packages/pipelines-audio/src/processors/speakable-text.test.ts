import { describe, expect, it } from 'vitest'

import { createSpeakableTextFilter } from './speakable-text'

function speak(chunks: string[]) {
  const filter = createSpeakableTextFilter()
  return chunks.map(chunk => filter.push(chunk)).join('') + filter.flush()
}

describe('speakable text filter', () => {
  it('drops fenced code even when the fence splits across chunks', () => {
    expect(speak(['Run this:\n`', '``ts\nconst a = 1\n``', '`\nThen restart.'])).toBe('Run this:\n\nThen restart.')
  })

  // The markdown renderer also fences code with tildes. Only a fence of the same kind closes it.
  it('drops code fenced with tildes, and speaks other tildes', () => {
    expect(speak([...'~~~ts\nconsole.log(42)\n```\nstill code\n~~~\nDone.'])).toBe('\nDone.')
    expect(speak(['About ~~~ three tildes and ~5 degrees.'])).toBe('About ~~~ three tildes and ~5 degrees.')
  })

  it('keeps inline code text without backticks', () => {
    expect(speak(['Use `pnpm', ' install` first.'])).toBe('Use pnpm install first.')
  })

  it('drops line markers for headings, quotes, and lists', () => {
    expect(speak(['## Steps\n- open it\n> note\n* done'])).toBe('Steps\nopen it\nnote\ndone')
  })

  it('keeps characters that only look like markers', () => {
    expect(speak(['-5 degrees\n*waves*'])).toBe('-5 degrees\n*waves*')
  })

  it('speaks link text and drops the address', () => {
    expect(speak(['See [the guide](https://', 'example.com/guide) now.'])).toBe('See the guide now.')
    expect(speak(['A [bracket] alone'])).toBe('A bracket alone')
  })

  it('releases an unclosed link at the end', () => {
    expect(speak(['Look [here'])).toBe('Look [here')
  })

  // ROOT CAUSE:
  // After `](` the filter dropped everything until `)`, so an unclosed address swallowed the rest of the reply.
  it('speaks the rest of a reply after an unclosed link address', () => {
    expect(speak(['Try [this](not a link', ' after all.'])).toBe('Try this(not a link after all.')
    expect(speak(['See [docs](https://example.com\nNext line.'])).toBe('See docs(https://example.com\nNext line.')
  })
})
