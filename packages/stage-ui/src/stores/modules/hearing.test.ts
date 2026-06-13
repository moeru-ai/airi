import { describe, expect, it } from 'vitest'

import { filterTranscriptionByConfidence, resolveStreamTranscriptionExecutor } from './hearing'

describe('filterTranscriptionByConfidence', () => {
  const segments = [
    { text: 'Hello ', avg_logprob: -0.3 },
    { text: 'world ', avg_logprob: -1.2 },
    { text: 'gibberish', avg_logprob: -2.5 },
  ]

  it('keeps all segments when threshold is very low', () => {
    expect(filterTranscriptionByConfidence(segments, -3)).toBe('Hello world gibberish')
  })

  it('filters out low-confidence segments', () => {
    expect(filterTranscriptionByConfidence(segments, -1)).toBe('Hello')
  })

  it('filters out all segments when threshold is 0', () => {
    expect(filterTranscriptionByConfidence(segments, 0)).toBe('')
  })

  it('returns empty string for empty segments', () => {
    expect(filterTranscriptionByConfidence([], -1)).toBe('')
  })

  it('trims whitespace from result', () => {
    expect(filterTranscriptionByConfidence([{ text: '  hello  ', avg_logprob: -0.5 }], -1)).toBe('hello')
  })
})

describe('resolveStreamTranscriptionExecutor', () => {
  /**
   * @example
   * resolveStreamTranscriptionExecutor('official-provider-transcription')
   */
  it('routes the official transcription provider through the Aliyun streaming executor', () => {
    const executor = resolveStreamTranscriptionExecutor('official-provider-transcription')

    expect(executor).toBe(resolveStreamTranscriptionExecutor('aliyun-nls-transcription'))
  })
})
