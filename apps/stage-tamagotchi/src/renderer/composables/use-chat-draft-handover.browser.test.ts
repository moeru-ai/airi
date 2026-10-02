import type { createContext } from '@moeru/eventa'

import type { ChatDraftHandover } from '../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent } from 'vue'

import { electronChatWindowCollectDraft, electronChatWindowTakeDraft } from '../../shared/eventa'
import { useChatDraftHandover } from './use-chat-draft-handover'

const mocks = vi.hoisted(() => ({
  context: undefined as ReturnType<typeof createContext> | undefined,
  takeDraft: vi.fn<() => Promise<ChatDraftHandover | undefined>>(),
  settleDraft: vi.fn<(result: { restored: boolean }) => Promise<void>>(),
}))

// NOTICE:
// The draft handover talks to the Electron main process. The doubles answer
// for it: an in-memory Eventa context stands in for the IPC channel, and the
// take and settle invokes are recorded.
// Removal condition: browser tests running inside an Electron renderer.
vi.mock('@proj-airi/electron-vueuse', async () => {
  const { createContext } = await import('@moeru/eventa')
  mocks.context = createContext()
  return {
    getElectronEventaContext: () => mocks.context,
    useElectronEventaInvoke: (event: unknown) => event === electronChatWindowTakeDraft ? mocks.takeDraft : mocks.settleDraft,
  }
})

const draft: ChatDraftHandover = { sessionId: 'session', text: 'unsent', attachments: [] }

async function mountHandover(composer: { snapshotDraft: () => Promise<ChatDraftHandover | undefined>, restoreDraft: (draft: ChatDraftHandover) => Promise<boolean> }) {
  const screen = await render(defineComponent({
    setup() {
      useChatDraftHandover(composer)
      return () => null
    },
  }))
  onTestFinished(() => screen.unmount())
}

describe('useChatDraftHandover', () => {
  it('reports a failed restore, so the switch keeps the previous window', async () => {
    mocks.takeDraft.mockResolvedValue(draft)
    await mountHandover({ snapshotDraft: async () => undefined, restoreDraft: async () => false })

    await vi.waitFor(() => expect(mocks.settleDraft).toHaveBeenCalledWith({ restored: false }))
  })

  it('hands the composer draft to a switch that closes this window', async () => {
    mocks.takeDraft.mockResolvedValue(undefined)
    await mountHandover({ snapshotDraft: async () => draft, restoreDraft: async () => true })

    const collectDraft = defineInvoke(mocks.context!, electronChatWindowCollectDraft)
    await expect(collectDraft()).resolves.toEqual(draft)
  })
})
