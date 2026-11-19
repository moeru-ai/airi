import type { LeadershipMode } from '@proj-airi/stage-ui/libs/pinia/setup-synced'

import { setupSynced, usePiniaSynced } from '@proj-airi/stage-ui/libs/pinia/setup-synced'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

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
      return () => null
    },
  })
  const host = document.createElement('div')
  document.body.append(host)
  app.use(pinia)
  app.use(plugins.vue)
  app.mount(host)
  windows.push({ app, pinia })

  return { pinia, runtime: runtime as SyncedRuntime }
}

afterEach(() => {
  for (const window of windows.splice(0)) {
    window.app.unmount()
    disposePinia(window.pinia)
  }
})

describe('tool selection', () => {
  it('gives spoken turns in the main window the computer use choice of the chat window', async () => {
    // ROOT CAUSE:
    //
    // The chat window composer held the choice in a component ref:
    //
    //   const computerUseEnabled = ref(true)
    //
    // Spoken turns start in the main window and could not read it, so they sent no tools.
    // The choice is replicated through `synced` now, and the main window reads `requestTools`.
    const mainWindow = openWindow('leader-only')
    await vi.waitFor(() => expect(mainWindow.runtime.isLeader()).toBe(true))
    setActivePinia(mainWindow.pinia)
    const main = useToolSelectionStore()

    const chatWindow = openWindow('follower-only')
    setActivePinia(chatWindow.pinia)
    const chat = useToolSelectionStore()
    await vi.waitFor(() => expect(chatWindow.runtime.getLeaderId()).toBe(mainWindow.runtime.participantId))

    expect(main.requestTools).toEqual([...artistryToolReferences, ...computerUseToolReferences])

    chat.computerUseEnabled = false

    await vi.waitFor(() => expect(main.requestTools).toEqual(artistryToolReferences))
  })

  it('takes a leader snapshot without proposing one back', async () => {
    const mainWindow = openWindow('leader-only')
    await vi.waitFor(() => expect(mainWindow.runtime.isLeader()).toBe(true))
    setActivePinia(mainWindow.pinia)
    const main = useToolSelectionStore()

    const chatWindow = openWindow('follower-only')
    setActivePinia(chatWindow.pinia)
    const chat = useToolSelectionStore()
    // Counting before the windows agree who leads would include the snapshots they exchange while settling that.
    await vi.waitFor(() => expect(chatWindow.runtime.getLeaderId()).toBe(mainWindow.runtime.participantId))

    let mainMutations = 0
    let chatMutations = 0
    main.$subscribe(() => mainMutations++, { flush: 'sync' })
    chat.$subscribe(() => chatMutations++, { flush: 'sync' })

    main.computerUseEnabled = false

    await vi.waitFor(() => expect(chat.computerUseEnabled).toBe(false))
    expect(mainMutations).toBe(1)
    expect(chatMutations).toBe(1)
  })
})
