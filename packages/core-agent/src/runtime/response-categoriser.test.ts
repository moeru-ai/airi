import { describe, expect, it } from 'vitest'

import { createStreamingCategorizer } from './response-categoriser'

/**
 * @example
 * const categorizer = createStreamingCategorizer()
 */
describe('createStreamingCategorizer', () => {
  /**
   * @example
   * Plain responses are all speech.
   */
  it('handles pure speech without tags', () => {
    const categorizer = createStreamingCategorizer()
    const text = 'Hello, world! This is a test.'

    categorizer.consume(text)
    const result = categorizer.end()

    expect(result.speech).toBe(text)
    expect(result.reasoning).toBe('')
    expect(result.segments).toEqual([])
  })

  /**
   * @example
   * Complete reasoning tags are removed from speech and retained as reasoning.
   */
  it('filters complete reasoning tags from speech', () => {
    const categorizer = createStreamingCategorizer()

    categorizer.consume('Hello <reasoning>thinking about this</reasoning> world!')
    const result = categorizer.end()

    expect(result.speech).toBe('Hello world!')
    expect(result.reasoning).toBe('thinking about this')
    expect(result.segments[0]?.tagName).toBe('reasoning')
  })

  /**
   * @example
   * Incomplete reasoning tags are filtered while the stream is still inside them.
   */
  it('filters incomplete tags from speech during streaming', () => {
    const categorizer = createStreamingCategorizer()

    categorizer.consume('Hello <reasoning>thinking')
    expect(categorizer.filterToSpeech('Hello <reasoning>thinking', 0)).toBe('')

    categorizer.consume(' about this</reasoning> world!')
    const result = categorizer.end()

    expect(result.speech).toBe('Hello world!')
    expect(result.reasoning).toBe('thinking about this')
  })

  /**
   * @example
   * A streamed opening tag may arrive before its closing `>`.
   */
  it('filters dangling opening tag starts from speech during streaming', () => {
    const categorizer = createStreamingCategorizer()

    categorizer.consume('Hello <reas')

    expect(categorizer.filterToSpeech('Hello <reas', 0)).toBe('')
  })

  /**
   * @example
   * Special AIRI marker tokens inside reasoning tags are preserved as reasoning.
   */
  it('preserves special marker tokens inside reasoning tags', () => {
    const categorizer = createStreamingCategorizer()
    const text = 'Hello <think>thinking <|ACT {"emotion":{"name":"happy"}}|></think> world!'

    categorizer.consume(text)
    const result = categorizer.end()

    expect(result.speech).toBe('Hello world!')
    expect(result.reasoning).toContain('<|ACT {"emotion":{"name":"happy"}}|>')
  })
})
