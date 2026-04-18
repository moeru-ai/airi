import { describe, expect, it } from 'vitest'

import { splitForDiscord, stripDiscordMentions } from '../src/utils/text'

/**
 * @example
 * splitForDiscord("hello world") // -> ["hello world"]
 */
describe('splitForDiscord', () => {
  it('returns the original string when it is shorter than the limit', () => {
    expect(splitForDiscord('hi', 2000)).toEqual(['hi'])
  })

  it('returns an empty array for empty content', () => {
    expect(splitForDiscord('', 2000)).toEqual([])
  })

  it('splits on the last newline within the limit', () => {
    const content = `${'a'.repeat(1800)}\n${'b'.repeat(500)}`

    const chunks = splitForDiscord(content, 2000)

    expect(chunks.length).toBe(2)
    expect(chunks[0]).toBe('a'.repeat(1800))
    expect(chunks[1]).toBe('b'.repeat(500))
  })

  it('falls back to splitting on the last space when no newline exists', () => {
    const head = 'a'.repeat(1990)
    const tail = 'b'.repeat(200)
    const content = `${head} ${tail}`

    const chunks = splitForDiscord(content, 2000)

    expect(chunks[0]).toBe(head)
    expect(chunks[1]).toBe(tail)
  })

  it('hard-splits at maxLength when there is neither newline nor space', () => {
    const content = 'a'.repeat(4500)

    const chunks = splitForDiscord(content, 2000)

    expect(chunks.length).toBe(3)
    expect(chunks[0].length).toBe(2000)
    expect(chunks[1].length).toBe(2000)
    expect(chunks[2].length).toBe(500)
    expect(chunks.join('')).toBe(content)
  })

  it('throws for non-positive maxLength', () => {
    expect(() => splitForDiscord('hello', 0)).toThrow()
  })
})

/**
 * @example
 * stripDiscordMentions("<@1> hi <@!2>") // -> "hi"
 */
describe('stripDiscordMentions', () => {
  it('removes <@id> and <@!id> mentions and trims the result', () => {
    expect(stripDiscordMentions('<@123456789> hello <@!987654321>')).toBe('hello')
  })

  it('leaves non-mention content untouched', () => {
    expect(stripDiscordMentions('hello world')).toBe('hello world')
  })
})
