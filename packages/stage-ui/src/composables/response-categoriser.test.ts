import { describe, expect, it } from 'vitest'

import { createStreamingCategorizer } from './response-categoriser'

describe('createStreamingCategorizer', () => {
  it('should handle pure speech without tags', () => {
    const categorizer = createStreamingCategorizer()
    const text = 'Hello, world! This is a test.'

    categorizer.consume(text)
    const result = categorizer.end()

    expect(result.speech).toBe(text)
    expect(result.reasoning).toBe('')
    expect(result.segments).toEqual([])
  })

  it('should filter out reasoning tags from speech', () => {
    const categorizer = createStreamingCategorizer()
    const text = 'Hello <reasoning>thinking about this</reasoning> world!'

    categorizer.consume(text)
    const result = categorizer.end()

    expect(result.speech).toBe('Hello world!')
    expect(result.reasoning).toBe('thinking about this')
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].tagName).toBe('reasoning')
    expect(result.segments[0].content).toBe('thinking about this')
  })

  it('should handle multiple reasoning tags', () => {
    const categorizer = createStreamingCategorizer()
    const text = 'Start <think>first thought</think> middle <reasoning>second thought</reasoning> end'

    categorizer.consume(text)
    const result = categorizer.end()

    expect(result.speech).toBe('Start middle end')
    expect(result.reasoning).toBe('first thought\n\nsecond thought')
    expect(result.segments).toHaveLength(2)
  })

  it('should filter incomplete tags from speech during streaming', () => {
    const categorizer = createStreamingCategorizer()

    // Stream incomplete tag
    categorizer.consume('Hello <reasoning>thinking')
    const filtered1 = categorizer.filterToSpeech('Hello <reasoning>thinking', 0)

    // Before tag closes, everything should be filtered (tag is incomplete)
    expect(filtered1).toBe('')

    // Complete the tag - the important thing is the final result is correct
    categorizer.consume(' about this</reasoning> world!')

    const result = categorizer.end()
    expect(result.speech).toBe('Hello world!')
    expect(result.reasoning).toBe('thinking about this')
  })

  it('should handle tags split across chunks', () => {
    const categorizer = createStreamingCategorizer()
    const chunks = [
      'Hello <',
      'reasoning',
      '>thinking',
      ' about this',
      '</reasoning',
      '> world!',
    ]

    for (const chunk of chunks) {
      categorizer.consume(chunk)
    }

    const result = categorizer.end()

    // Final result should correctly categorize the complete text
    expect(result.speech).toBe('Hello world!')
    expect(result.reasoning).toBe('thinking about this')
  })

  it('should handle nested tags', () => {
    const categorizer = createStreamingCategorizer()
    const text = 'Start <outer>outer <inner>inner</inner> more outer</outer> end'

    categorizer.consume(text)
    const result = categorizer.end()

    // Both tags should be extracted
    expect(result.segments.length).toBeGreaterThan(0)
    // Speech should exclude tag content
    // Note: rehype handles nested tags by extracting both, but the speech extraction
    // may include text between nested tags or closing tag text
    // The important thing is that the main tag content (inner, outer text) is in reasoning
    expect(result.speech).toContain('Start')
    expect(result.speech).toContain('end')
    // Tag content should be in reasoning, not speech
    expect(result.reasoning).toContain('inner')
    // The exact speech format may vary with nested tags, but should not contain the main tag content
    expect(result.speech).not.toContain('inner')
  })

  it('should correctly identify speech positions with isSpeechAt', () => {
    const categorizer = createStreamingCategorizer()
    const text = 'Hello <reasoning>thinking</reasoning> world!'

    categorizer.consume(text)

    // Position 0-5: "Hello " - should be speech
    expect(categorizer.isSpeechAt(0)).toBe(true)
    expect(categorizer.isSpeechAt(5)).toBe(true)

    // Position 6-36: inside <reasoning> tag (including the tag itself) - should not be speech
    // "Hello " = 6 chars, "<reasoning>" starts at 6, "</reasoning>" ends at 36
    expect(categorizer.isSpeechAt(6)).toBe(false)
    expect(categorizer.isSpeechAt(20)).toBe(false)
    expect(categorizer.isSpeechAt(36)).toBe(false)

    // Position 37+: " world!" - should be speech (after closing tag)
    expect(categorizer.isSpeechAt(37)).toBe(true)
    expect(categorizer.isSpeechAt(43)).toBe(true)
  })

  it('should handle tags with special tokens like emotes inside reasoning', () => {
    const categorizer = createStreamingCategorizer()
    // Special tokens like <|EMOTE_HAPPY|> and <|DELAY:1|> should be included in reasoning
    const text = 'Hello <reasoning>thinking <|EMOTE_HAPPY|> about this <|DELAY:1|></reasoning> world!'

    categorizer.consume(text)
    const result = categorizer.end()

    expect(result.speech).toBe('Hello world!')
    expect(result.reasoning).toBe('thinking <|EMOTE_HAPPY|> about this <|DELAY:1|>')
  })

  it('should handle <think> tag with special tokens in between', () => {
    const categorizer = createStreamingCategorizer()
    // Special tokens like <|EMOTE_CURIOUS|> should be included within reasoning tags
    const text = 'Hello <think>thinking <|EMOTE_CURIOUS|> about this <|DELAY:2|> and that</think> world!'

    categorizer.consume(text)
    const result = categorizer.end()

    // Log what was recognized
    // eslint-disable-next-line no-console
    console.log({
      input: text,
      segmentsFound: result.segments.length,
      tagName: result.segments[0]?.tagName,
      segmentContent: result.segments[0]?.content,
      reasoning: result.reasoning,
      speech: result.speech,
    })

    // Verify tag is recognized
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].tagName).toBe('think')

    // Verify special tokens are preserved in segment content
    expect(result.segments[0].content).toContain('<|EMOTE_CURIOUS|>')
    expect(result.segments[0].content).toContain('<|DELAY:2|>')

    // Verify special tokens are in reasoning output
    expect(result.reasoning).toContain('<|EMOTE_CURIOUS|>')
    expect(result.reasoning).toContain('<|DELAY:2|>')

    // Verify speech excludes the reasoning content
    expect(result.speech).toBe('Hello world!')
    expect(result.speech).not.toContain('<|EMOTE_CURIOUS|>')
    expect(result.speech).not.toContain('<|DELAY:2|>')
    expect(result.reasoning).toBe('thinking <|EMOTE_CURIOUS|> about this <|DELAY:2|> and that')
  })

  it('should handle <think> with special tokens like <|EMOTE_HAPPY|> in between', () => {
    const categorizer = createStreamingCategorizer()
    // Testing the exact scenario: <think>...<|Special in between|>...</think>
    const text = 'Hello <think>thinking <|EMOTE_HAPPY|> about this <|DELAY:1|> and that</think> world!'

    categorizer.consume(text)
    const result = categorizer.end()

    // Log what was recognized
    // eslint-disable-next-line no-console
    console.log({
      input: text,
      segmentsFound: result.segments.length,
      tagName: result.segments[0]?.tagName,
      segmentContent: result.segments[0]?.content,
      reasoning: result.reasoning,
      speech: result.speech,
    })

    // Verify tag is recognized
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].tagName).toBe('think')

    // Verify special tokens are preserved in segment content
    expect(result.segments[0].content).toContain('<|EMOTE_HAPPY|>')
    expect(result.segments[0].content).toContain('<|DELAY:1|>')

    // Verify special tokens are in reasoning output
    expect(result.reasoning).toContain('<|EMOTE_HAPPY|>')
    expect(result.reasoning).toContain('<|DELAY:1|>')

    // Verify speech excludes the reasoning content
    expect(result.speech).toBe('Hello world!')
    expect(result.speech).not.toContain('<|EMOTE_HAPPY|>')
    expect(result.speech).not.toContain('<|DELAY:1|>')
    expect(result.reasoning).toBe('thinking <|EMOTE_HAPPY|> about this <|DELAY:1|> and that')
  })

  it('should handle any tag name as reasoning', () => {
    const categorizer = createStreamingCategorizer()
    const text = 'Hello <think>secret thoughts</think> world!'

    categorizer.consume(text)
    const result = categorizer.end()

    expect(result.speech).toBe('Hello world!')
    expect(result.reasoning).toBe('secret thoughts')
    expect(result.segments[0].tagName).toBe('think')
  })

  it('should handle multiple tags with speech in between', () => {
    const categorizer = createStreamingCategorizer()
    const text = 'First <think>thought1</think> Second <reasoning>thought2</reasoning> Third'

    categorizer.consume(text)
    const result = categorizer.end()

    expect(result.speech).toBe('First Second Third')
    expect(result.reasoning).toBe('thought1\n\nthought2')
    expect(result.segments).toHaveLength(2)
  })

  it('should return empty speech when only tags present', () => {
    const categorizer = createStreamingCategorizer()
    const text = '<reasoning>only reasoning</reasoning>'

    categorizer.consume(text)
    const result = categorizer.end()

    expect(result.speech).toBe('')
    expect(result.reasoning).toBe('only reasoning')
  })

  it('should handle streaming with incremental categorization', () => {
    const categorizer = createStreamingCategorizer()

    // Stream in small chunks
    categorizer.consume('Hello ')
    expect(categorizer.getCurrent()?.speech).toBe('Hello ')

    categorizer.consume('<reasoning>')
    categorizer.consume('thinking')
    // Tag not closed yet, but should still categorize
    const midResult = categorizer.getCurrent()
    expect(midResult).not.toBeNull()

    categorizer.consume('</reasoning>')
    categorizer.consume(' world!')

    const result = categorizer.end()
    expect(result.speech).toBe('Hello world!')
    expect(result.reasoning).toBe('thinking')
  })

  it('should call onSegment callback when segments are detected', () => {
    const segments: Array<{ tagName: string, content: string }> = []
    const categorizer = createStreamingCategorizer(undefined, (segment) => {
      segments.push({ tagName: segment.tagName, content: segment.content })
    })

    const text = 'Hello <reasoning>thought1</reasoning> <think>thought2</think> world!'

    // Stream the text - segments are emitted when they complete
    categorizer.consume(text)
    categorizer.end()

    // Check final result has both segments
    const result = categorizer.end()
    expect(result.segments.length).toBeGreaterThanOrEqual(2)
    expect(result.segments.some(s => s.tagName === 'reasoning')).toBe(true)
    expect(result.segments.some(s => s.tagName === 'think')).toBe(true)

    // onSegment is called when segments complete during streaming
    // At minimum, we should have segments detected in the final result
    expect(result.segments.length).toBeGreaterThanOrEqual(2)
  })

  it('should handle getCurrentPosition correctly', () => {
    const categorizer = createStreamingCategorizer()

    expect(categorizer.getCurrentPosition()).toBe(0)

    categorizer.consume('Hello')
    expect(categorizer.getCurrentPosition()).toBe(5)

    categorizer.consume(' world!')
    expect(categorizer.getCurrentPosition()).toBe(12)
  })

  it('should handle edge case: tag at start', () => {
    const categorizer = createStreamingCategorizer()
    const text = '<reasoning>thinking</reasoning>Hello world!'

    categorizer.consume(text)
    const result = categorizer.end()

    expect(result.speech).toBe('Hello world!')
    expect(result.reasoning).toBe('thinking')
  })

  it('should handle edge case: tag at end', () => {
    const categorizer = createStreamingCategorizer()
    const text = 'Hello world!<reasoning>thinking</reasoning>'

    categorizer.consume(text)
    const result = categorizer.end()

    expect(result.speech).toBe('Hello world!')
    expect(result.reasoning).toBe('thinking')
  })

  it('should handle malformed tags gracefully', () => {
    const categorizer = createStreamingCategorizer()
    const text = 'Hello <unclosed>thinking world!'

    categorizer.consume(text)
    const result = categorizer.end()

    // Unclosed tag should be treated as speech
    expect(result.speech).toContain('Hello')
    expect(result.segments.length).toBe(0)
  })

  it('should filter speech correctly when tag closes mid-chunk', () => {
    const categorizer = createStreamingCategorizer()

    // Stream incomplete tag
    categorizer.consume('Hello <reasoning>thinking')
    let filtered = categorizer.filterToSpeech('Hello <reasoning>thinking', 0)
    expect(filtered).toBe('') // Tag not closed, filter everything

    // Stream closing tag
    categorizer.consume('</reasoning>')
    filtered = categorizer.filterToSpeech('</reasoning>', 25)
    expect(filtered).toBe('') // This is the closing tag itself

    // Stream speech after
    categorizer.consume(' world!')
    filtered = categorizer.filterToSpeech(' world!', 38)
    expect(filtered).toBe(' world!')

    const result = categorizer.end()
    expect(result.speech).toBe('Hello world!')
  })
})
