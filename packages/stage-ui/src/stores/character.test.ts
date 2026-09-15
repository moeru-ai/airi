import type { StageTtsSession } from '../libs/speech/tts-session'
import type { AiriCard } from './modules'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { registerStageSpeechSessionOpener } from '../services/stage-speech-session-host'
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

const stubSession: StageTtsSession = {
  intentId: 'intent-test',
  appendText: writeLiteralSpy,
  appendSpecial: vi.fn(),
  finishInput: writeFlushSpy,
  end: endSpy,
  cancel: cancelSpy,
}

describe('store character', () => {
  let disposeOpener: (() => void) | undefined

  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)
    // Reactions only open speech in a renderer that mounts Stage.
    disposeOpener = registerStageSpeechSessionOpener(() => stubSession)

    writeLiteralSpy.mockClear()
    writeFlushSpy.mockClear()
    endSpy.mockClear()
    cancelSpy.mockClear()

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
    disposeOpener?.()
    disposeOpener = undefined
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
    store.onSparkNotifyReactionStreamEnd('spark-1', 'Hello world')

    expect(store.reactions).toHaveLength(1)
    expect(store.reactions[0]?.message).toBe('Hello world')
    expect(store.reactions[0]?.sourceEventId).toBe('spark-1')
    expect(store.reactions[0]?.createdAt).toBe(123456)

    // Parser delivery is asynchronous; it may batch fragments while
    // looking ahead for tags, so assert on the fully delivered text.
    await vi.waitFor(() => {
      expect(writeLiteralSpy.mock.calls.map(call => call[0]).join('')).toBe('Hello world')
      expect(writeFlushSpy).toHaveBeenCalled()
      expect(endSpy).toHaveBeenCalled()
    })

    nowSpy.mockRestore()
  })

  it('still records a reaction when only the stream end is observed', () => {
    const store = useCharacterStore()

    store.onSparkNotifyReactionStreamEnd('missing', 'Ignored')

    expect(store.reactions).toHaveLength(1)
    expect(store.reactions[0]?.message).toBe('Ignored')
  })

  it('clears reactions', () => {
    const store = useCharacterStore()

    store.recordSparkNotifyReaction('spark-event', 'Hello')
    store.recordSparkNotifyReaction('spark-event', 'World')
    store.clearReactions()

    expect(store.reactions).toHaveLength(0)
  })
})
