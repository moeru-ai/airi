import { defineInvokeHandler } from '@moeru/eventa'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { getSpeechBusContext, voiceSpeechCommand } from '../services/speech/bus'
import { useAuthStore } from './auth'
import { useAiriCardStore } from './modules/airi-card'

vi.mock('../database/repos/chat-sessions.repo', () => ({
  chatSessionsRepo: {
    addTombstone: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    dequeueOutbox: vi.fn().mockResolvedValue(undefined),
    dropOutboxForSession: vi.fn().mockResolvedValue(undefined),
    enqueueOutbox: vi.fn().mockResolvedValue(undefined),
    getIndex: vi.fn().mockResolvedValue(null),
    getOutbox: vi.fn().mockResolvedValue([]),
    getSession: vi.fn().mockResolvedValue(null),
    getTombstones: vi.fn().mockResolvedValue([]),
    removeTombstones: vi.fn().mockResolvedValue(undefined),
    saveIndex: vi.fn().mockResolvedValue(undefined),
    saveSession: vi.fn().mockResolvedValue(undefined),
    updateOutboxEntries: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../libs/auth-fetch', () => ({
  authedFetch: vi.fn(),
}))

vi.mock('../libs/server', () => ({
  SERVER_URL: 'http://test',
}))

const { useCharacterStore } = await import('./character')
const { useChatSessionStore } = await import('./chat/session-store')

let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof createApp>
let container: HTMLDivElement
let stopSpeechHost: (() => void) | undefined

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  localStorage.clear()
  app = createApp(defineComponent({ setup() {
    useAuthStore()
    const cards = useAiriCardStore()
    cards.cards.set('default', {
      name: 'Test character',
      version: '1.0',
      extensions: { airi: { avatarModels: [], agents: {}, modules: {
        consciousness: { provider: '', model: '' },
        vision: { provider: '', model: '' },
        speech: { provider: '', model: '', voice_id: '' },
      } } },
    })
    cards.activeCardId = 'default'
    return () => h('div')
  } }))
  app.use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }))
  container = document.createElement('div')
  document.body.append(container)
  app.mount(container)

  // Spark notify reactions speak through the speech bus. Accept every command so that speech ends.
  stopSpeechHost = defineInvokeHandler(getSpeechBusContext(), voiceSpeechCommand, () => ({ status: 'accepted' }))
})

afterEach(() => {
  stopSpeechHost?.()
  app.unmount()
  container.remove()
  disposePinia(pinia)
  localStorage.clear()
})

function assistantTexts(sessionId: string) {
  const sessions = useChatSessionStore()
  return (sessions.sessionMessages[sessionId] ?? [])
    .filter(message => message.role === 'assistant')
    .map(message => message.content)
}

describe('character spark notify reactions in chat', () => {
  it('stores a streamed reaction as an assistant message without control markers', async () => {
    const sessions = useChatSessionStore()
    await sessions.initialize()
    const sessionId = sessions.activeSessionId
    const character = useCharacterStore()

    character.onSparkNotifyReactionStreamEvent('spark-1', '<|ACT:{"emotion":"happy"}|>Nice ')
    character.onSparkNotifyReactionStreamEvent('spark-1', 'song!')
    character.onSparkNotifyReactionStreamEnd('spark-1', '<|ACT:{"emotion":"happy"}|>Nice song!')

    await vi.waitFor(() => expect(assistantTexts(sessionId)).toEqual(['Nice song!']))
  })

  it('stores the reaction in the current session of the character when this window selects an older session', async () => {
    const sessions = useChatSessionStore()
    await sessions.initialize()
    const olderSessionId = sessions.activeSessionId
    const currentSessionId = await sessions.createSession('default')
    // The window that runs notifications keeps its own selection. It can still select the older session.
    sessions.activeSessionId = olderSessionId
    const character = useCharacterStore()

    character.onSparkNotifyReactionStreamEvent('spark-2', 'I like this one.')
    character.onSparkNotifyReactionStreamEnd('spark-2', 'I like this one.')

    await vi.waitFor(() => expect(assistantTexts(currentSessionId)).toEqual(['I like this one.']))
    expect(assistantTexts(olderSessionId)).toEqual([])
  })

  it('does not store a reaction that has only control markers', async () => {
    const sessions = useChatSessionStore()
    await sessions.initialize()
    const sessionId = sessions.activeSessionId
    const character = useCharacterStore()

    character.onSparkNotifyReactionStreamEvent('spark-3', '<|ACT:{"emotion":"neutral"}|>')
    character.onSparkNotifyReactionStreamEnd('spark-3', '<|ACT:{"emotion":"neutral"}|>')
    character.onSparkNotifyReactionStreamEvent('spark-4', 'Got it.')
    character.onSparkNotifyReactionStreamEnd('spark-4', 'Got it.')

    // The empty reaction is skipped before its first await. So the stored second reaction proves that the first one was not stored.
    await vi.waitFor(() => expect(assistantTexts(sessionId)).toEqual(['Got it.']))
  })
})
