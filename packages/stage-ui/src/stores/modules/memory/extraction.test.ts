import { describe, expect, it } from 'vitest'

import { buildExtractionMessages, EXTRACTION_SYSTEM_PROMPT, parseExtractedFacts } from './extraction'

describe('buildExtractionMessages', () => {
  /**
   * @example
   * buildExtractionMessages('User: hi') -> [system, user] with the conversation embedded.
   */
  it('returns a system + user message pair carrying the conversation', () => {
    const messages = buildExtractionMessages('User: I love tea')
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({ role: 'system', content: EXTRACTION_SYSTEM_PROMPT })
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain('User: I love tea')
  })
})

describe('parseExtractedFacts', () => {
  /**
   * @example
   * A bare JSON array parses into typed candidates.
   */
  it('parses a bare JSON array', () => {
    const out = parseExtractedFacts('[{"text":"User likes tea","type":"preference"}]')
    expect(out).toEqual([{ text: 'User likes tea', type: 'preference' }])
  })

  /**
   * @example
   * A ```json fenced block is unwrapped before parsing.
   */
  it('unwraps a json code fence', () => {
    const out = parseExtractedFacts('```json\n[{"text":"Has a cat","type":"fact"}]\n```')
    expect(out).toEqual([{ text: 'Has a cat', type: 'fact' }])
  })

  /**
   * @example
   * An array embedded in surrounding prose is still extracted.
   */
  it('extracts the array from surrounding prose', () => {
    const out = parseExtractedFacts('Sure! Here you go: [{"text":"Plays guitar","type":"fact"}] hope that helps')
    expect(out).toEqual([{ text: 'Plays guitar', type: 'fact' }])
  })

  /**
   * @example
   * Malformed items are dropped; valid ones survive.
   */
  it('drops invalid items but keeps valid ones', () => {
    const out = parseExtractedFacts('[{"text":"User is named Dusk","type":"fact"},{"text":"","type":"fact"},{"type":"oops"},{"text":"Likes ramen","type":"preference"}]')
    expect(out).toEqual([
      { text: 'User is named Dusk', type: 'fact' },
      { text: 'Likes ramen', type: 'preference' },
    ])
  })

  /**
   * @example
   * Trims whitespace around the stored text.
   */
  it('trims candidate text', () => {
    const out = parseExtractedFacts('[{"text":"  spaced out  ","type":"event"}]')
    expect(out).toEqual([{ text: 'spaced out', type: 'event' }])
  })

  /**
   * @example
   * Empty array, empty string, non-array, and non-JSON all yield [].
   */
  it('returns [] for empty / non-array / unparseable input', () => {
    expect(parseExtractedFacts('[]')).toEqual([])
    expect(parseExtractedFacts('')).toEqual([])
    expect(parseExtractedFacts('{"text":"x","type":"fact"}')).toEqual([])
    expect(parseExtractedFacts('not json at all')).toEqual([])
  })
})
