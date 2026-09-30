import type { AiriCard } from './modules'

import { defineInvokeHandler } from '@moeru/eventa'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getSpeechBusContext, voiceSpeechCommand } from '../services/speech/bus'
import { setCharacterLlmMarkerParserFactoryForTest, useCharacterStore } from './character'
import { useChatSessionStore } from './chat/session-store'
import { useAiriCardStore } from './modules'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

const writeLiteralSpy = vi.fn()
const endSpy = vi.fn()
const finishSpy = vi.fn()
const parserConsumeSpy = vi.fn()
const parserEndSpy = vi.fn()
let stopHost: (() => void) | undefined

afterEach(() => stopHost?.())

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
        parserEndSpy()
      },
    }))

    writeLiteralSpy.mockClear()
    endSpy.mockClear()
    parserConsumeSpy.mockClear()
    parserEndSpy.mockClear()

    useChatSessionStore(pinia).activeSessionId = 'session-1'
    stopHost = defineInvokeHandler(getSpeechBusContext(), voiceSpeechCommand, (command) => {
      if (command.type === 'text')
        writeLiteralSpy(command.value)
      if (command.type === 'end')
        endSpy()
      if (command.type === 'finish')
        finishSpy()
      return { status: 'accepted' }
    })

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

    await vi.waitFor(() => {
      expect(parserConsumeSpy).toHaveBeenCalled()
      expect(parserEndSpy).toHaveBeenCalled()
      expect(writeLiteralSpy).toHaveBeenCalledWith('Hello')
      expect(writeLiteralSpy).toHaveBeenCalledWith(' world')
      expect(finishSpy).toHaveBeenCalled()
      expect(endSpy).toHaveBeenCalled()
    })

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
