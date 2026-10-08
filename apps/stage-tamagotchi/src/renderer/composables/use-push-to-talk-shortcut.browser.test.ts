import type { createContext } from '@moeru/eventa'
import type { ShortcutBinding, ShortcutRegistrationResult } from '@proj-airi/stage-shared/global-shortcut'

import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'

import { electronShortcutRegister, electronShortcutTriggered } from '../../shared/eventa'
import { usePushToTalkShortcut } from './use-push-to-talk-shortcut'

const mocks = vi.hoisted(() => ({
  context: undefined as ReturnType<typeof createContext> | undefined,
  register: vi.fn<(binding: ShortcutBinding) => Promise<ShortcutRegistrationResult>>(),
  unregister: vi.fn<(payload: { id: string }) => Promise<void>>(),
}))

// NOTICE:
// The shortcut service runs in the Electron main process. The doubles answer for it: an in-memory Eventa context
// carries trigger events, and the register and unregister invokes are recorded.
// Removal condition: browser tests running inside an Electron renderer.
vi.mock('@proj-airi/electron-vueuse', async () => {
  const { createContext } = await import('@moeru/eventa')
  mocks.context = createContext()
  return {
    getElectronEventaContext: () => mocks.context,
    useElectronEventaInvoke: (event: unknown) => event === electronShortcutRegister ? mocks.register : mocks.unregister,
  }
})

beforeEach(() => {
  mocks.register.mockImplementation(async binding => ({ id: binding.id, ok: true }))
  mocks.unregister.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

async function mountShortcut() {
  const pinia = createPinia()
  const screen = await render(defineComponent({
    setup() {
      usePushToTalkShortcut()
      return () => null
    },
  }), { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] } })
  onTestFinished(() => {
    screen.unmount()
    disposePinia(pinia)
  })

  const voice = useVoiceStore()
  // The hold uses only `end` and `cancel` of the attempt. A real attempt would open the microphone and a transcriber.
  const attempt = { end: vi.fn(), cancel: vi.fn() }
  const beginManual = vi.spyOn(voice, 'beginManual').mockReturnValue(attempt as never)
  const hearing = useHearingStore()
  hearing.activeTranscriptionProvider = 'browser-web-speech-api'
  const sessions = useChatSessionStore()
  sessions.activeSessionId = 'alice'

  return { devices: useSettingsAudioDevice(), hearing, sessions, beginManual, attempt }
}

function trigger(phase: 'down' | 'up', id = 'voice-push-to-talk') {
  mocks.context!.emit(electronShortcutTriggered, { id, phase })
}

describe('usePushToTalkShortcut', () => {
  it('registers a global hold binding only in Push to Talk mode with the microphone on', async () => {
    const { devices, hearing } = await mountShortcut()
    expect(mocks.register).not.toHaveBeenCalled()

    devices.enabled = true
    hearing.inputMode = 'push-to-talk'

    await vi.waitFor(() => expect(mocks.register).toHaveBeenCalledOnce())
    expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({
      id: 'voice-push-to-talk',
      accelerator: { modifiers: ['ctrl', 'shift'], key: 'Space' },
      scope: 'global',
      receiveKeyUps: true,
    }))

    const unregisterCalls = mocks.unregister.mock.calls.length
    hearing.inputMode = 'always-on'
    await vi.waitFor(() => expect(mocks.unregister.mock.calls.length).toBeGreaterThan(unregisterCalls))
    expect(mocks.register).toHaveBeenCalledOnce()
  })

  it('records speech for the session that was active at key down', async () => {
    const { devices, hearing, sessions, beginManual, attempt } = await mountShortcut()
    devices.enabled = true
    hearing.inputMode = 'push-to-talk'

    trigger('down')
    trigger('down', 'toggle-main-window')
    sessions.activeSessionId = 'bob'
    await new Promise(resolve => setTimeout(resolve, 350))
    trigger('up')

    expect(beginManual).toHaveBeenCalledOnce()
    expect(beginManual).toHaveBeenCalledWith('alice')
    expect(attempt.end).toHaveBeenCalledOnce()
    expect(attempt.cancel).not.toHaveBeenCalled()
  })

  it('cancels a short tap', async () => {
    const { devices, hearing, attempt } = await mountShortcut()
    devices.enabled = true
    hearing.inputMode = 'push-to-talk'

    trigger('down')
    trigger('up')

    expect(attempt.cancel).toHaveBeenCalledOnce()
    expect(attempt.end).not.toHaveBeenCalled()
  })

  it('ignores the shortcut in Always on mode', async () => {
    const { devices, beginManual } = await mountShortcut()
    devices.enabled = true

    trigger('down')

    expect(beginManual).not.toHaveBeenCalled()
  })
})
