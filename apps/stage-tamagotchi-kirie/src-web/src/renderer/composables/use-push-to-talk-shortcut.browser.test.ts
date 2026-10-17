import type { HostGlobalShortcuts } from '../host-context/global-shortcuts'

import { PiniaColada } from '@pinia/colada'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'

import { PUSH_TO_TALK_SHORTCUT_ID, usePushToTalkShortcut } from './use-push-to-talk-shortcut'

const native = vi.hoisted(() => ({
  register: vi.fn<HostGlobalShortcuts['register']>(),
  unregister: vi.fn<HostGlobalShortcuts['unregister']>(),
  list: vi.fn<HostGlobalShortcuts['list']>(),
  unregisterAll: vi.fn<HostGlobalShortcuts['unregisterAll']>(),
  onTriggered: vi.fn<HostGlobalShortcuts['onTriggered']>(),
  unsubscribe: vi.fn(),
}))

// The native global keyboard hook is outside this browser. The voice and settings stores remain real.
vi.mock('@proj-airi/stage-host-context', () => ({ useHostGlobalShortcuts: () => native }))

afterEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('kirie Push to Talk registration', () => {
  it('registers both key phases only while the microphone and Push to Talk mode are enabled', async () => {
    native.register.mockImplementation(async binding => ({ id: binding.id, ok: true }))
    native.unregister.mockResolvedValue(undefined)
    native.onTriggered.mockReturnValue(native.unsubscribe)
    const pinia = createPinia()
    const screen = await render(defineComponent({
      setup() {
        usePushToTalkShortcut()
        return () => null
      },
    }), {
      global: { plugins: [pinia, PiniaColada, createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })] },
    })
    onTestFinished(() => {
      screen.unmount()
      disposePinia(pinia)
    })
    const hearing = useHearingStore(pinia)
    const devices = useSettingsAudioDevice(pinia)
    expect(native.register).not.toHaveBeenCalled()
    hearing.inputMode = 'push-to-talk'
    devices.enabled = true
    await vi.waitFor(() => expect(native.register).toHaveBeenCalledOnce())
    expect(native.register).toHaveBeenCalledWith({
      id: PUSH_TO_TALK_SHORTCUT_ID,
      accelerator: { modifiers: ['ctrl', 'shift'], key: 'Space' },
      scope: 'global',
      receiveKeyUps: true,
      description: 'Push to Talk',
    })
    native.unregister.mockClear()
    devices.enabled = false
    await vi.waitFor(() => expect(native.unregister).toHaveBeenCalledWith(PUSH_TO_TALK_SHORTCUT_ID))
  })
})
