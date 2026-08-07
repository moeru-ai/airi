// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const componentMocks = vi.hoisted(() => ({
  configuredProviders: { value: { 'provider-id': false } },
  requestIngest: vi.fn<() => Promise<void>>(),
}))

vi.mock('pinia', async (importOriginal) => {
  const original = await importOriginal<typeof import('pinia')>()
  return {
    ...original,
    storeToRefs: (store: object) => store,
  }
})

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: () => vi.fn(),
}))

vi.mock('@proj-airi/stage-layouts/composables/useStopSpeakingButton', () => ({
  useStopSpeakingButton: () => ({
    showStopSpeakingButton: { value: false },
    stopSpeakingFromChat: vi.fn(),
  }),
}))

vi.mock('@proj-airi/stage-ui/components', () => ({
  ChatHistory: { name: 'ChatHistory', template: '<div />' },
  JournalPreviewModal: { name: 'JournalPreviewModal', template: '<div />' },
}))

vi.mock('@proj-airi/stage-ui/composables/use-analytics', () => ({
  useAnalytics: () => ({
    trackChatMessageDeleted: vi.fn(),
    trackChatMessageRetried: vi.fn(),
    trackChatMessagesCleared: vi.fn(),
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/background', () => ({
  useBackgroundStore: () => ({
    initializeStore: vi.fn(),
    journalEntries: [],
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat', () => ({
  useChatOrchestratorStore: () => ({
    sending: { value: false },
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat/session-store', () => ({
  useChatSessionStore: () => ({
    activeSessionId: 'session-id',
    messages: { value: [] },
    setSessionMessages: vi.fn(),
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat/stream-store', () => ({
  useChatStreamStore: () => ({
    streamingMessage: { value: undefined },
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/journal-preview', () => ({
  useJournalPreviewStore: () => ({
    downloadImage: vi.fn(),
    openImagePreview: vi.fn(),
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/modules/airi-card', () => ({
  useAiriCardStore: () => ({
    activeCard: { value: undefined },
    activeCardId: { value: undefined },
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/modules/consciousness', () => ({
  useConsciousnessStore: () => ({
    activeProvider: { value: 'provider-id' },
    activeModel: { value: 'model-id' },
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/providers', () => ({
  useProvidersStore: () => ({
    configuredProviders: componentMocks.configuredProviders,
  }),
}))

vi.mock('@proj-airi/ui', () => ({
  BasicTextarea: {
    name: 'BasicTextarea',
    props: ['modelValue'],
    emits: ['compositionstart', 'compositionend', 'keydown', 'paste-file', 'update:modelValue'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown="$emit(\'keydown\', $event)" />',
  },
  Button: { name: 'Button', template: '<button />' },
  Callout: { name: 'Callout', template: '<div><slot /></div>' },
}))

vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')
  return {
    useLocalStorage: () => ref('enter'),
  }
})

vi.mock('reka-ui', () => ({
  DropdownMenuContent: { name: 'DropdownMenuContent', template: '<div><slot /></div>' },
  DropdownMenuItem: { name: 'DropdownMenuItem', template: '<div><slot /></div>' },
  DropdownMenuPortal: { name: 'DropdownMenuPortal', template: '<div><slot /></div>' },
  DropdownMenuRoot: { name: 'DropdownMenuRoot', template: '<div><slot /></div>' },
  DropdownMenuTrigger: { name: 'DropdownMenuTrigger', template: '<div><slot /></div>' },
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('./chat-tool-renderers/journal-tool-call-block.vue', () => ({
  default: { name: 'JournalToolCallBlock', template: '<div />' },
}))

vi.mock('../stores/chat-sync', () => ({
  isChatProviderConfigurationError: () => false,
  useChatSyncStore: () => ({
    requestCleanup: vi.fn(),
    requestDeleteMessage: vi.fn(),
    requestIngest: componentMocks.requestIngest,
    requestRetry: vi.fn(),
    requestToolCallRerun: vi.fn(),
  }),
}))

describe('interactiveArea', async () => {
  const { default: InteractiveArea } = await import('./InteractiveArea.vue')

  beforeEach(() => {
    componentMocks.configuredProviders.value = { 'provider-id': false }
    componentMocks.requestIngest.mockReset()
    componentMocks.requestIngest.mockResolvedValue(undefined)
  })

  // ROOT CAUSE:
  //
  // The Provider store starts with an unconfigured runtime state and validates
  // persisted credentials asynchronously. Treating that pending state as a
  // confirmed setup failure prevented the first message from reaching the
  // existing Provider resolution path.
  //
  // We fixed this by letting requestIngest resolve the Provider and report an
  // actual configuration error before the setup prompt is shown.
  it('submits the first message while provider validation is still pending', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(InteractiveArea),
    })
    app.mount(host)

    const input = host.querySelector('textarea')
    expect(input).not.toBeNull()
    input!.value = 'Hello'
    input!.dispatchEvent(new Event('input'))
    await nextTick()
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await Promise.resolve()
    await nextTick()

    expect(componentMocks.requestIngest).toHaveBeenCalledTimes(1)
    expect(componentMocks.requestIngest).toHaveBeenCalledWith({
      text: 'Hello',
      attachments: [],
      toolset: 'artistry',
    })

    app.unmount()
    host.remove()
  })
})
