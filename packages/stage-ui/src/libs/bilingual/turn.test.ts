import { describe, expect, it } from 'vitest'

import { createBilingualTurn } from './turn'

/** Feeds every chunk through one turn and returns what it produced. */
function collect(chunks: string[]) {
  const spoken: string[] = []
  const pairs: Array<{ spoken: string, translation: string, label: string }> = []

  const turn = createBilingualTurn({
    languages: ['en', 'zh'],
    ttsLanguage: 'en',
    onSpoken: text => spoken.push(text),
    onPair: pair => pairs.push(pair),
  })

  for (const chunk of chunks)
    turn.push(chunk)
  turn.end()

  return { spoken: spoken.join(''), pairs }
}

describe('createBilingualTurn', () => {
  it('routes the spoken language to onSpoken without its tag', () => {
    const { spoken } = collect(['[EN]Hello there.[CN]你好。'])

    expect(spoken).toBe('Hello there.')
  })

  it('pairs each sentence with the translation that follows it', () => {
    const { pairs } = collect(['[EN]First.[CN]第一句。[EN]Second.[CN]第二句。'])

    expect(pairs).toEqual([
      { spoken: 'First.', translation: '第一句。', label: '中文' },
      { spoken: 'Second.', translation: '第二句。', label: '中文' },
    ])
  })

  // A sentence can reach the splitter in several chunks, and the chunk before a
  // translation is not a sentence boundary: the text collected so far has to be
  // kept, or the pair loses the beginning of the sentence.
  it('keeps a sentence that arrives in several chunks', () => {
    const { spoken, pairs } = collect(['[EN]Hello the', 're.[CN]你好', '。'])

    expect(spoken).toBe('Hello there.')
    expect(pairs).toEqual([{ spoken: 'Hello there.', translation: '你好。', label: '中文' }])
  })

  // The last sentence has no following sentence to close it, so end() has to.
  it('closes the trailing sentence at the end of the stream', () => {
    const { pairs } = collect(['[EN]Only one.[CN]只有一句。'])

    expect(pairs).toEqual([{ spoken: 'Only one.', translation: '只有一句。', label: '中文' }])
  })

  // Untagged output is entirely spoken, so nothing is translated. The trailing
  // sentence is still closed as a pair without a translation, which consumers
  // publish nothing for.
  it('treats untagged output as spoken', () => {
    const { spoken, pairs } = collect(['Hello there.'])

    expect(spoken).toBe('Hello there.')
    expect(pairs).toEqual([{ spoken: 'Hello there.', translation: '', label: '' }])
  })
})
