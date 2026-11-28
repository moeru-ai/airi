import { defineInvokeHandler } from '@moeru/eventa'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { isCloudSyncableMessage } from '../libs/chat-sync/wire-message'
import { getSpeechBusContext, voiceSpeechCommand } from '../services/speech/bus'
import { useAuthStore } from './auth'
import { useAiriCardStore } from './modules/airi-card'

vi.mock('../database/repos/chat-sessions.repo', async () => (await import('../database/repos/testing/chat-sessions-repo')).createChatSessionsRepoMockModule())

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

  it('stores a reaction without an unfinished marker, as speech reads it', async () => {
    const sessions = useChatSessionStore()
    await sessions.initialize()
    const sessionId = sessions.activeSessionId
    const character = useCharacterStore()

    character.onSparkNotifyReactionStreamEvent('spark-5', 'Nice song!<|ACT:happy')
    character.onSparkNotifyReactionStreamEnd('spark-5', 'Nice song!<|ACT:happy')

    await vi.waitFor(() => expect(assistantTexts(sessionId)).toEqual(['Nice song!']))
  })

  it('stores a reaction without an escaped marker', async () => {
    const sessions = useChatSessionStore()
    await sessions.initialize()
    const sessionId = sessions.activeSessionId
    const character = useCharacterStore()
    const reaction = `<{'|'}ACT:{"emotion":"happy"}{'|'}>Love it.`

    character.onSparkNotifyReactionStreamEvent('spark-6', reaction)
    character.onSparkNotifyReactionStreamEnd('spark-6', reaction)

    await vi.waitFor(() => expect(assistantTexts(sessionId)).toEqual(['Love it.']))
  })

  it('stores the reaction as a proactive message, so it never syncs to the cloud', async () => {
    const sessions = useChatSessionStore()
    await sessions.initialize()
    const sessionId = sessions.activeSessionId
    const character = useCharacterStore()

    character.onSparkNotifyReactionStreamEvent('spark-7', 'Great track.')
    character.onSparkNotifyReactionStreamEnd('spark-7', 'Great track.')

    await vi.waitFor(() => expect(assistantTexts(sessionId)).toEqual(['Great track.']))
    const stored = sessions.sessionMessages[sessionId]!.find(message => message.role === 'assistant')!
    expect(stored).toMatchObject({ proactive: { turnId: 'spark:spark-7', source: 'spark:notify' } })
    expect(isCloudSyncableMessage(stored)).toBe(false)
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

    // Each reaction starts its storage when it ends, and both take the same steps. So the empty reaction reaches storage first.
    // The stored second reaction alone then proves that the first one was not stored.
    await vi.waitFor(() => expect(assistantTexts(sessionId)).toEqual(['Got it.']))
  })
})
