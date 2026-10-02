import type { AiriCard } from './modules'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setCharacterLlmMarkerParserFactoryForTest, useCharacterStore } from './character'
import { useAiriCardStore } from './modules'
import { useSpeechRuntimeStore } from './speech-runtime'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

const writeLiteralSpy = vi.fn()
const writeFlushSpy = vi.fn()
const endSpy = vi.fn()
const cancelSpy = vi.fn()
const parserConsumeSpy = vi.fn()
const parserEndSpy = vi.fn()

const openSpeechIntentSpy = vi.fn(() => ({
  intentId: 'intent-test',
  streamId: 'stream-test',
  priority: 100,
  stream: new ReadableStream(),
  writeLiteral: writeLiteralSpy,
  writeSpecial: vi.fn(),
  writeFlush: writeFlushSpy,
  end: endSpy,
  cancel: cancelSpy,
}))

describe('store character', () => {
  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)

    setCharacterLlmMarkerParserFactoryForTest(options => ({
      async consume(textPart: string) {
        parserConsumeSpy(textPart)
        if (textPart)
          await options.onLiteral?.(textPart)
      },
      async end() {
        await parserEndSpy()
      },
    }))

    writeLiteralSpy.mockClear()
    writeFlushSpy.mockClear()
    endSpy.mockClear()
    cancelSpy.mockClear()
    openSpeechIntentSpy.mockClear()
    parserConsumeSpy.mockClear()
    parserEndSpy.mockReset()

    const speechRuntimeStore = useSpeechRuntimeStore(pinia)
    speechRuntimeStore.openIntent = openSpeechIntentSpy

    const airiCardStore = useAiriCardStore(pinia)
    // @ts-expect-error - testing purpose
    airiCardStore.systemPrompt = 'You are a brave adventurer in Minecraft.'
    // @ts-expect-error - testing purpose
    airiCardStore.activeCard = {
      name: 'Hero',
      version: '1.0',
      extensions: {
        airi: {
          agents: {},
          modules: {
            consciousness: {
              provider: 'mock-provider',
              model: 'mock-model',
            },
            vision: {
              provider: 'mock-vision-provider',
              model: 'mock-vision-model',
            },
            speech: {
              provider: 'mock-speech-provider',
              model: 'mock-speech-model',
              voice_id: 'alloy',
            },
          },
        },
      },
    } satisfies AiriCard
  })

  afterEach(() => {
    setCharacterLlmMarkerParserFactoryForTest(null)
    vi.restoreAllMocks()
  })

  it('exposes name and system prompt from the active card', () => {
    const store = useCharacterStore()

    expect(store.name).toBe('Hero')
    expect(store.systemPrompt).toBe('You are a brave adventurer in Minecraft.')
  })

  it('records reactions and trims to the max size', () => {
    const store = useCharacterStore()

    for (let index = 0; index < 201; index += 1) {
      store.recordSparkNotifyReaction('spark-event', `message-${index}`)
    }

    expect(store.reactions).toHaveLength(200)
    expect(store.reactions[0]?.message).toBe('message-1')
    expect(store.reactions[199]?.message).toBe('message-200')
  })

  it('records streamed reactions when the stream ends', async () => {
    const store = useCharacterStore()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(123456)

    store.onSparkNotifyReactionStreamEvent('spark-1', 'Hello')
    store.onSparkNotifyReactionStreamEvent('spark-1', ' world')
    await store.onSparkNotifyReactionStreamEnd('spark-1', 'Hello world')

    expect(store.reactions).toHaveLength(1)
    expect(store.reactions[0]?.message).toBe('Hello world')
    expect(store.reactions[0]?.sourceEventId).toBe('spark-1')
    expect(store.reactions[0]?.createdAt).toBe(123456)

    await vi.waitFor(() => {
      expect(parserConsumeSpy).toHaveBeenCalled()
      expect(parserEndSpy).toHaveBeenCalled()
      expect(writeLiteralSpy).toHaveBeenCalledWith('Hello')
      expect(writeLiteralSpy).toHaveBeenCalledWith(' world')
      expect(writeFlushSpy).toHaveBeenCalled()
      expect(endSpy).toHaveBeenCalled()
    })

    nowSpy.mockRestore()
  })

  it('waits for parser closure before recording or closing a streamed reaction', async () => {
    const closed = Promise.withResolvers<void>()
    parserEndSpy.mockReturnValueOnce(closed.promise)
    const store = useCharacterStore()
    store.onSparkNotifyReactionStreamEvent('spark-1', 'Hello')

    const ending = store.onSparkNotifyReactionStreamEnd('spark-1', 'Hello')
    expect(parserEndSpy).toHaveBeenCalledOnce()
    expect(store.reactions).toHaveLength(0)
    expect(writeFlushSpy).not.toHaveBeenCalled()
    expect(endSpy).not.toHaveBeenCalled()

    closed.resolve()
    await ending
    expect(store.reactions[0]?.message).toBe('Hello')
    expect(writeFlushSpy).toHaveBeenCalledOnce()
    expect(endSpy).toHaveBeenCalledOnce()
  })

  it('does not record a reaction cancelled during parser closure', async () => {
    const closed = Promise.withResolvers<void>()
    parserEndSpy.mockReturnValueOnce(closed.promise)
    const store = useCharacterStore()
    store.onSparkNotifyReactionStreamEvent('spark-1', 'Hello')

    const ending = store.onSparkNotifyReactionStreamEnd('spark-1', 'Hello')
    store.cancelSparkNotifyReaction('spark-1')
    closed.resolve()
    await ending

    expect(cancelSpy).toHaveBeenCalledWith('notify-owner-stopped')
    expect(store.reactions).toHaveLength(0)
    expect(writeFlushSpy).not.toHaveBeenCalled()
    expect(endSpy).not.toHaveBeenCalled()
  })

  it('ignores stream end when no streaming reaction exists', async () => {
    const store = useCharacterStore()

    await store.onSparkNotifyReactionStreamEnd('missing', 'Ignored')

    expect(store.reactions).toHaveLength(0)
  })

  it('clears reactions', () => {
    const store = useCharacterStore()

    store.recordSparkNotifyReaction('spark-event', 'Hello')
    store.recordSparkNotifyReaction('spark-event', 'World')
    store.clearReactions()

    expect(store.reactions).toHaveLength(0)
  })
})
