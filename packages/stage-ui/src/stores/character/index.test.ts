import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { setCharacterLlmMarkerParserFactoryForTest, useCharacterStore } from '.'
import { useSettingsBilingual } from '../settings/bilingual'

const mocks = vi.hoisted(() => ({
  spoken: [] as string[],
  /** Reason each speech intent was cancelled with. */
  cancelled: [] as (string | undefined)[],
  /** Everything the store broadcasts: a reaction's announcement, pairs, its end. */
  events: [] as Array<{ kind: string, turnId: string, [key: string]: unknown }>,
}))

/** Kinds the store broadcast, in order. */
function broadcastKinds() {
  return mocks.events.map(event => event.kind)
}

/** Only the sentence pairs among them. */
function broadcastPairs() {
  return mocks.events.filter(event => event.kind === 'pair')
}

vi.mock('../../composables/use-spark-translation-channel', () => ({
  useSparkTranslationChannel: () => ({
    post: (event: { kind: string, turnId: string, [key: string]: unknown }) => {
      mocks.events.push(event)
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
      cancel: (reason?: string) => {
        mocks.cancelled.push(reason)
      },
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
  store.prepareSparkNotifyReaction(sparkEventId)
  store.onSparkNotifyReactionStreamEvent(sparkEventId, '[EN]Hello the')
  store.onSparkNotifyReactionStreamEvent(sparkEventId, 're.[CN]你好')
  store.onSparkNotifyReactionStreamEvent(sparkEventId, '。')
  store.onSparkNotifyReactionStreamEnd(sparkEventId, '[EN]Hello there.[CN]你好。')
}

describe('useCharacterStore spark reactions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.spoken.length = 0
    mocks.cancelled.length = 0
    mocks.events.length = 0
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
    await vi.waitFor(() => expect(broadcastPairs()).toEqual([
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

    store.prepareSparkNotifyReaction('spark-3')
    store.onSparkNotifyReactionStreamEvent('spark-3', '[EN]First.')
    store.onSparkNotifyReactionStreamEvent('spark-3', '[CN]第一句。')
    store.onSparkNotifyReactionStreamEvent('spark-3', '[EN]Second.')
    store.onSparkNotifyReactionStreamEvent('spark-3', '[CN]第二句。')
    store.onSparkNotifyReactionStreamEnd('spark-3', '[EN]First.[CN]第一句。[EN]Second.[CN]第二句。')

    await vi.waitFor(() => expect(broadcastPairs()).toEqual([
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
    store.prepareSparkNotifyReaction('spark-4')
    store.onSparkNotifyReactionStreamEvent('spark-4', '[EN]Hello there.[CN]你好。')
    store.onSparkNotifyReactionStreamEnd('spark-4', '[EN]Hello there.[CN]你好。')

    await vi.waitFor(() => expect(broadcastPairs()).toHaveLength(1))
    expect(broadcastPairs()[0]).toMatchObject({
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

  // The window that plays the reaction picks its voice from this, so it has to
  // arrive before the reaction speaks: resolving the voice there reads the
  // settings again, which by then may already have changed.
  it('announces the language a requested reaction is spoken in', () => {
    const store = useCharacterStore()

    store.prepareSparkNotifyReaction('spark-7')

    expect(mocks.events).toEqual([
      { kind: 'turn', turnId: 'spark:spark-7', ttsLanguage: 'en' },
    ])
  })

  // A reaction composed without bilingual stays monolingual, so its playback has
  // to keep the configured voice even if the user switches bilingual on before
  // it speaks. Announcing no language lets the player hold that decision instead
  // of re-resolving from the settings as they are now.
  it('announces no language for a reaction requested without bilingual', () => {
    const store = useCharacterStore()
    useSettingsBilingual().enabled = false

    store.prepareSparkNotifyReaction('spark-8')

    expect(mocks.events).toEqual([
      { kind: 'turn', turnId: 'spark:spark-8', ttsLanguage: undefined },
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
    // The reaction still announces its turn so the player holds the configured
    // voice; with no language, it does not split the tagged line.
    expect(mocks.events).toEqual([
      { kind: 'turn', turnId: 'spark:spark-1', ttsLanguage: undefined },
    ])
  })

  // Every reaction reserves a turn when its request is composed, so it has to be
  // released however the reaction ends — silently, after it speaks, before it
  // runs, or mid-stream. Otherwise the window that plays reactions reserves a
  // turn per reaction for the life of the session, and one abandoned after it
  // streamed leaves its speech intent open for text that never comes.
  interface TurnReleaseScenario {
    /** What drives the reaction to its end. */
    drive: (store: ReturnType<typeof useCharacterStore>, id: string) => void
    /** Broadcast kinds expected once the reaction ends. */
    kinds: string[]
    /** Whether the expected kinds arrive only after the stream drains. */
    async?: boolean
    /** Speech intents that should have been cancelled. */
    cancelled?: string[]
  }

  const turnReleaseScenarios: Record<string, TurnReleaseScenario> = {
    'a prepared reaction that never speaks': {
      drive: (store, id) => store.onSparkNotifyReactionStreamEnd(id, ''),
      kinds: ['turn', 'turn-end'],
    },
    'a spoken reaction': {
      drive: (store, id) => streamBilingualReaction(store, id),
      kinds: ['turn', 'pair', 'turn-end'],
      async: true,
    },
    'a prepared reaction that will not run': {
      drive: (store, id) => store.abandonSparkNotifyReaction(id),
      kinds: ['turn', 'turn-end'],
    },
    'a reaction abandoned while streaming': {
      drive: (store, id) => {
        store.onSparkNotifyReactionStreamEvent(id, '[EN]Hello')
        store.abandonSparkNotifyReaction(id)
      },
      kinds: ['turn', 'turn-end'],
      cancelled: ['spark-notify-failed'],
    },
  }

  it.each(Object.entries(turnReleaseScenarios))('releases the turn of %s', async (name, scenario) => {
    const store = useCharacterStore()
    const id = `spark:${name}`

    store.prepareSparkNotifyReaction(id)
    scenario.drive(store, id)

    if (scenario.async)
      await vi.waitFor(() => expect(broadcastKinds()).toEqual(scenario.kinds))
    else
      expect(broadcastKinds()).toEqual(scenario.kinds)

    if (scenario.cancelled)
      expect(mocks.cancelled).toEqual(scenario.cancelled)
  })
})
