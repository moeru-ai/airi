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

import { electronShortcutList, electronShortcutRegister, electronShortcutTriggered } from '../../shared/eventa'
import { PUSH_TO_TALK_TRY_SHORTCUT_ID, usePushToTalkShortcut, usePushToTalkShortcutSettings, usePushToTalkTry } from './use-push-to-talk-shortcut'

const mocks = vi.hoisted(() => ({
  context: undefined as ReturnType<typeof createContext> | undefined,
  register: vi.fn<(binding: ShortcutBinding) => Promise<ShortcutRegistrationResult>>(),
  unregister: vi.fn<(payload: { id: string }) => Promise<void>>(),
  list: vi.fn<() => Promise<ShortcutBinding[]>>(),
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
    useElectronEventaInvoke: (event: unknown) => {
      if (event === electronShortcutRegister)
        return mocks.register
      return event === electronShortcutList ? mocks.list : mocks.unregister
    },
  }
})

beforeEach(() => {
  mocks.register.mockImplementation(async binding => ({ id: binding.id, ok: true }))
  mocks.unregister.mockResolvedValue(undefined)
  mocks.list.mockResolvedValue([])
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

  it('cancels the running hold when the shortcut changes during the hold', async () => {
    // Review: https://github.com/moeru-ai/airi/pull/2729#discussion_r4239147479
    const { devices, hearing, attempt } = await mountShortcut()
    devices.enabled = true
    hearing.inputMode = 'push-to-talk'
    await vi.waitFor(() => expect(mocks.register).toHaveBeenCalledOnce())

    trigger('down')
    usePushToTalkShortcutSettings().accelerator.value = { modifiers: ['alt'], key: 'KeyP' }

    await vi.waitFor(() => expect(attempt.cancel).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(mocks.register).toHaveBeenLastCalledWith(expect.objectContaining({ accelerator: { modifiers: ['alt'], key: 'KeyP' } })))
    // The old key up never arrives after rebinding. A later key up from the new binding must not end the cancelled attempt.
    trigger('up')
    expect(attempt.end).not.toHaveBeenCalled()
  })

  it('ignores the shortcut in Always on mode', async () => {
    const { devices, beginManual } = await mountShortcut()
    devices.enabled = true

    trigger('down')

    expect(beginManual).not.toHaveBeenCalled()
  })
})

describe('usePushToTalkTry', () => {
  async function startTry(trusted: boolean) {
    const events: string[] = []
    let stop: (() => void) | undefined
    const screen = await render(defineComponent({
      setup() {
        const tryShortcut = usePushToTalkTry(async () => trusted)
        stop = tryShortcut(event => events.push(event.phase))
        return () => null
      },
    }))
    onTestFinished(() => screen.unmount())
    return { events, stop: () => stop?.() }
  }

  it('registers nothing without Accessibility, because a registration would show the macOS prompt', async () => {
    const { events } = await startTry(false)

    trigger('down', PUSH_TO_TALK_TRY_SHORTCUT_ID)
    await Promise.resolve()

    expect(mocks.register).not.toHaveBeenCalled()
    expect(events).toEqual([])
  })

  it('registers a try binding with Accessibility, reports its triggers, and removes it when stopped', async () => {
    const { events, stop } = await startTry(true)
    await vi.waitFor(() => expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ id: PUSH_TO_TALK_TRY_SHORTCUT_ID, scope: 'global', receiveKeyUps: true })))

    trigger('down', PUSH_TO_TALK_TRY_SHORTCUT_ID)
    trigger('up', PUSH_TO_TALK_TRY_SHORTCUT_ID)
    // Triggers of other features do not count.
    trigger('down', 'spotlight')
    expect(events).toEqual(['down', 'up'])

    stop()
    expect(mocks.unregister).toHaveBeenLastCalledWith({ id: PUSH_TO_TALK_TRY_SHORTCUT_ID })
  })

  it('keeps the binding of a new try when an earlier try stops while it registers', async () => {
    // The page starts a new try when the status changes. Both tries use one ID, so their calls must not interleave.
    const registered = new Set<string>()
    mocks.register.mockImplementation(async (binding) => {
      registered.add(binding.id)
      return { id: binding.id, ok: true }
    })
    mocks.unregister.mockImplementation(async ({ id }) => {
      registered.delete(id)
    })
    let tryShortcut: ReturnType<typeof usePushToTalkTry> | undefined
    const screen = await render(defineComponent({
      setup() {
        tryShortcut = usePushToTalkTry(async () => true)
        return () => null
      },
    }))
    onTestFinished(() => screen.unmount())

    const stopFirst = tryShortcut!(() => {})
    stopFirst()
    tryShortcut!(() => {})

    await vi.waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(registered.has(PUSH_TO_TALK_TRY_SHORTCUT_ID)).toBe(true))
  })

  it('follows the Push to Talk binding when the stage window already holds the keys', async () => {
    mocks.register.mockImplementation(async binding => ({ id: binding.id, ok: false, reason: 'conflict' }))
    mocks.list.mockResolvedValue([{ id: 'voice-push-to-talk', accelerator: { modifiers: ['ctrl', 'shift'], key: 'Space' }, scope: 'global', receiveKeyUps: true }])
    const { events, stop } = await startTry(true)
    await vi.waitFor(() => expect(mocks.list).toHaveBeenCalled())
    await vi.waitFor(() => {
      trigger('down')
      expect(events).toContain('down')
    })

    stop()
    // The try does not own that binding, so it leaves it registered.
    expect(mocks.unregister).not.toHaveBeenCalledWith({ id: 'voice-push-to-talk' })
  })
})
