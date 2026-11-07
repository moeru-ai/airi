import type { LeadershipMode } from '@proj-airi/stage-ui/libs/pinia/setup-synced'

import { setupSynced, usePiniaSynced } from '@proj-airi/stage-ui/libs/pinia/setup-synced'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { artistryToolReferences, computerUseToolReferences } from './built-in'
import { useToolSelectionStore } from './selection'

type SyncedRuntime = ReturnType<typeof usePiniaSynced>
const windows: Array<{ app: ReturnType<typeof createApp>, pinia: ReturnType<typeof createPinia> }> = []

/** Opens one renderer window over the synchronization runtime of the application. */
function openWindow(leadership: LeadershipMode) {
  const plugins = setupSynced({ leadership })
  const pinia = createPinia()
  pinia.use(plugins.pinia)
  let runtime: SyncedRuntime | undefined
  const app = createApp({
    setup() {
      runtime = usePiniaSynced()
      useChatSessionStore()
      return () => null
    },
  })
  const host = document.createElement('div')
  document.body.append(host)
  app.use(pinia)
  app.use(plugins.vue)
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }))
  app.mount(host)
  windows.push({ app, pinia })

  return { pinia, runtime: runtime as SyncedRuntime }
}

afterEach(() => {
  for (const window of windows.splice(0)) {
    window.app.unmount()
    disposePinia(window.pinia)
  }
  localStorage.clear()
})

describe('tool selection', () => {
  it('shares one global computer-use choice across windows without storing conversation preferences', async () => {
    const mainWindow = openWindow('leader-only')
    await vi.waitFor(() => expect(mainWindow.runtime.isLeader()).toBe(true))
    const mainSessions = useChatSessionStore(mainWindow.pinia)
    await mainSessions.initialize()
    const first = await mainSessions.createSession('default')
    const second = await mainSessions.createSession('default', { setActive: false })
    const main = useToolSelectionStore(mainWindow.pinia)

    const chatWindow = openWindow('follower-only')
    await vi.waitFor(() => expect(chatWindow.runtime.getLeaderId()).toBe(mainWindow.runtime.participantId))
    const chatSessions = useChatSessionStore(chatWindow.pinia)
    await chatSessions.initialize()
    mainSessions.activeSessionId = first
    chatSessions.activeSessionId = first
    const chat = useToolSelectionStore(chatWindow.pinia)
    expect(main.requestTools).toEqual([...artistryToolReferences, ...computerUseToolReferences])
    await chat.setComputerUseEnabled(false)
    await vi.waitFor(() => expect(main.requestTools).toEqual(artistryToolReferences))
    expect(mainSessions.sessionMetas[first]?.features).toBeUndefined()
    chatSessions.activeSessionId = second
    expect(chat.computerUseEnabled).toBe(false)
    mainSessions.activeSessionId = second
    expect(main.requestTools).toEqual(artistryToolReferences)
    expect(mainSessions.sessionMetas[second]?.features).toBeUndefined()
    chatSessions.activeSessionId = first
    expect(chat.computerUseEnabled).toBe(false)
    await chatSessions.setSessionFeatures(first)
    mainSessions.activeSessionId = first
    expect(main.computerUseEnabled).toBe(false)
    await chat.setComputerUseEnabled(true)
    await vi.waitFor(() => expect(main.requestTools).toEqual([...artistryToolReferences, ...computerUseToolReferences]))
  })

  it('takes a global selection snapshot without proposing it back', async () => {
    const mainWindow = openWindow('leader-only')
    await vi.waitFor(() => expect(mainWindow.runtime.isLeader()).toBe(true))
    const mainSessions = useChatSessionStore(mainWindow.pinia)
    await mainSessions.initialize()
    const sessionId = await mainSessions.createSession('default')
    const main = useToolSelectionStore(mainWindow.pinia)
    const chatWindow = openWindow('follower-only')
    await vi.waitFor(() => expect(chatWindow.runtime.getLeaderId()).toBe(mainWindow.runtime.participantId))
    const chatSessions = useChatSessionStore(chatWindow.pinia)
    await chatSessions.initialize()
    chatSessions.activeSessionId = sessionId
    const chat = useToolSelectionStore(chatWindow.pinia)
    let mainMutations = 0
    let selectionMutations = 0
    main.$subscribe(() => mainMutations++, { flush: 'sync' })
    chat.$subscribe(() => selectionMutations++, { flush: 'sync' })
    await main.setComputerUseEnabled(false)
    await vi.waitFor(() => expect(chat.computerUseEnabled).toBe(false))
    expect(mainMutations).toBe(1)
    expect(selectionMutations).toBe(1)
  })
})
