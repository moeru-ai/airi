import type { AiriCard } from './modules'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCharacterStore } from './character'
import { useAiriCardStore } from './modules'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

const writeLiteralSpy = vi.fn()
const writeFlushSpy = vi.fn()
const endSpy = vi.fn()
const cancelSpy = vi.fn()

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

vi.mock('../speech-runtime', () => ({
  useSpeechRuntimeStore: () => ({
    openIntent: openSpeechIntentSpy,
  }),
}))

describe('store character', () => {
  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)

    writeLiteralSpy.mockClear()
    writeFlushSpy.mockClear()
    endSpy.mockClear()
    cancelSpy.mockClear()
    openSpeechIntentSpy.mockClear()

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
              model: 'mock-model',
            },
            speech: {
              model: 'mock-speech-model',
              voice_id: 'alloy',
            },
          },
        },
      },
    } satisfies AiriCard
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

  it('records streamed reactions when the stream ends', () => {
    const store = useCharacterStore()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(123456)

    store.onSparkNotifyReactionStreamEvent('spark-1', 'Hello')
    store.onSparkNotifyReactionStreamEvent('spark-1', ' world')
    store.onSparkNotifyReactionStreamEnd('spark-1', 'Hello world')

    expect(store.reactions).toHaveLength(1)
    expect(store.reactions[0]?.message).toBe('Hello world')
    expect(store.reactions[0]?.sourceEventId).toBe('spark-1')
    expect(store.reactions[0]?.createdAt).toBe(123456)

    expect(writeLiteralSpy).toHaveBeenCalledWith('Hello')
    expect(writeLiteralSpy).toHaveBeenCalledWith(' world')
    expect(writeFlushSpy).toHaveBeenCalled()
    expect(endSpy).toHaveBeenCalled()

    nowSpy.mockRestore()
  })

  it('ignores stream end when no streaming reaction exists', () => {
    const store = useCharacterStore()

    store.onSparkNotifyReactionStreamEnd('missing', 'Ignored')

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
