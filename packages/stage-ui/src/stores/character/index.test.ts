import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { setCharacterLlmMarkerParserFactoryForTest, useCharacterStore } from '.'
import { useSettingsBilingual } from '../settings/bilingual'

const mocks = vi.hoisted(() => ({
  spoken: [] as string[],
  /** Everything the store broadcasts: a reaction's announcement, then its pairs. */
  pairs: [] as Array<{ kind: string, turnId: string, [key: string]: unknown }>,
}))

vi.mock('../../composables/use-spark-translation-channel', () => ({
  useSparkTranslationChannel: () => ({
    post: (event: { kind: string, turnId: string, [key: string]: unknown }) => {
      mocks.pairs.push(event)
    },
  }),
}))

vi.mock('../speech-runtime', () => ({
  useSpeechRuntimeStore: () => ({
    openIntent: () => ({
      writeLiteral: (text: string) => {
        mocks.spoken.push(text)
      },
      writeSpecial: () => {},
      writeFlush: () => {},
      end: () => {},
    }),
  }),
}))

vi.mock('../modules', () => ({
  useAiriCardStore: () => ({ activeCard: ref(undefined), systemPrompt: ref('') }),
  useConsciousnessStore: () => ({ activeProvider: ref(''), activeModel: ref('') }),
}))

/**
 * Streams the marker parser's literals straight through, so a test never has to
 * wait for the real parser's async pipeline to drain.
 */
function markerParser(options: { onLiteral?: (literal: string) => void | Promise<void> }) {
  return {
    consume: async (chunk: string) => {
      await options.onLiteral?.(chunk)
    },
    end: async () => {},
  }
}

/**
 * Delivers literals only once the stream ends, the way the real parser drains.
 * Text that arrives after the split has ended can never be broadcast, so this
 * pins which of the two ends has to run first.
 */
function drainingMarkerParser(options: { onLiteral?: (literal: string) => void | Promise<void> }) {
  const chunks: string[] = []

  return {
    consume: async (chunk: string) => {
      chunks.push(chunk)
    },
    end: async () => {
      for (const chunk of chunks)
        await options.onLiteral?.(chunk)
    },
  }
}

/** Feeds one reaction in three chunks so a tag is split across chunk bounds. */
function streamBilingualReaction(store: ReturnType<typeof useCharacterStore>, sparkEventId = 'spark-1') {
  store.onSparkNotifyReactionStreamEvent(sparkEventId, '[EN]Hello the')
  store.onSparkNotifyReactionStreamEvent(sparkEventId, 're.[CN]你好')
  store.onSparkNotifyReactionStreamEvent(sparkEventId, '。')
  store.onSparkNotifyReactionStreamEnd(sparkEventId, '[EN]Hello there.[CN]你好。')
}

describe('useCharacterStore spark reactions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.spoken.length = 0
    mocks.pairs.length = 0
    setCharacterLlmMarkerParserFactoryForTest(markerParser as unknown as Parameters<typeof setCharacterLlmMarkerParserFactoryForTest>[0])

    const bilingual = useSettingsBilingual()
    bilingual.enabled = true
    bilingual.ttsLanguage = 'en'
    bilingual.translationLanguage = 'zh'
  })

  afterEach(() => {
    setCharacterLlmMarkerParserFactoryForTest(null)
  })

  // The window that plays the reaction publishes its translation, so the store
  // only hands over the pairs and keeps the tags off the speech engine. The
  // trailing pair is broadcast once the stream drains, which is asynchronous.
  it('speaks only the spoken language and broadcasts the sentence pair', async () => {
    streamBilingualReaction(useCharacterStore())

    expect(mocks.spoken.join('')).toBe('Hello there.')
    await vi.waitFor(() => expect(mocks.pairs).toEqual([
      {
        kind: 'pair',
        turnId: 'spark:spark-1',
        spoken: 'Hello there.',
        translation: '你好。',
        label: '中文',
      },
    ]))
  })

  it('broadcasts one pair per sentence', async () => {
    const store = useCharacterStore()

    store.onSparkNotifyReactionStreamEvent('spark-3', '[EN]First.')
    store.onSparkNotifyReactionStreamEvent('spark-3', '[CN]第一句。')
    store.onSparkNotifyReactionStreamEvent('spark-3', '[EN]Second.')
    store.onSparkNotifyReactionStreamEvent('spark-3', '[CN]第二句。')
    store.onSparkNotifyReactionStreamEnd('spark-3', '[EN]First.[CN]第一句。[EN]Second.[CN]第二句。')

    await vi.waitFor(() => expect(mocks.pairs).toEqual([
      { kind: 'pair', turnId: 'spark:spark-3', spoken: 'First.', translation: '第一句。', label: '中文' },
      { kind: 'pair', turnId: 'spark:spark-3', spoken: 'Second.', translation: '第二句。', label: '中文' },
    ]))
  })

  // The real marker parser hands literals over while its own end() is awaited,
  // so the trailing sentence only reaches the split then. Closing the split
  // before that drain broadcasts the last translation half-written.
  it('broadcasts the trailing pair after the stream has drained', async () => {
    setCharacterLlmMarkerParserFactoryForTest(drainingMarkerParser as unknown as Parameters<typeof setCharacterLlmMarkerParserFactoryForTest>[0])

    const store = useCharacterStore()
    store.onSparkNotifyReactionStreamEvent('spark-4', '[EN]Hello there.[CN]你好。')
    store.onSparkNotifyReactionStreamEnd('spark-4', '[EN]Hello there.[CN]你好。')

    await vi.waitFor(() => expect(mocks.pairs).toHaveLength(1))
    expect(mocks.pairs[0]).toMatchObject({
      turnId: 'spark:spark-4',
      spoken: 'Hello there.',
      translation: '你好。',
    })
  })

  it('records the reaction without the language control tags', () => {
    const store = useCharacterStore()
    streamBilingualReaction(store)

    const recorded = store.reactions.at(-1)?.message ?? ''
    expect(recorded).toBe('Hello there.')
    expect(recorded).not.toContain('[EN]')
    expect(recorded).not.toContain('[CN]')
  })

  // The split runs with the settings the reaction started with, so the recorded
  // text is projected with those too. Reading the settings at the end would keep
  // the wrong language, or leave the tags in, once they change mid-reaction.
  it('records the reaction in the languages the split started with', () => {
    const store = useCharacterStore()

    store.onSparkNotifyReactionStreamEvent('spark-5', '[EN]Hello there.[CN]你好。')
    useSettingsBilingual().ttsLanguage = 'zh'
    store.onSparkNotifyReactionStreamEnd('spark-5', '[EN]Hello there.[CN]你好。')

    expect(store.reactions.at(-1)?.message).toBe('Hello there.')
  })

  // The window that plays the reaction picks its voice from this, so it has to
  // arrive before the reaction speaks: resolving the voice there reads the
  // settings again, which by then may already have changed.
  it('announces the language a requested reaction is spoken in', () => {
    const store = useCharacterStore()

    store.prepareSparkNotifyReaction('spark-7')

    expect(mocks.pairs).toEqual([
      { kind: 'turn', turnId: 'spark:spark-7', ttsLanguage: 'en' },
    ])
  })

  // The request is composed before the model answers, so the settings recorded
  // then are the ones the reply was asked for. A change made while the model is
  // still thinking must not leave the tagged text unparsed.
  it('splits with the settings the request was composed with', () => {
    const store = useCharacterStore()

    store.prepareSparkNotifyReaction('spark-6')
    useSettingsBilingual().enabled = false
    store.onSparkNotifyReactionStreamEvent('spark-6', '[EN]Hello there.[CN]你好。')
    store.onSparkNotifyReactionStreamEnd('spark-6', '[EN]Hello there.[CN]你好。')

    expect(mocks.spoken.join('')).toBe('Hello there.')
    expect(store.reactions.at(-1)?.message).toBe('Hello there.')
  })

  it('leaves the reaction untouched while bilingual subtitles are off', () => {
    useSettingsBilingual().enabled = false

    streamBilingualReaction(useCharacterStore())

    expect(mocks.spoken.join('')).toBe('[EN]Hello there.[CN]你好。')
    expect(mocks.pairs).toEqual([])
  })
})
