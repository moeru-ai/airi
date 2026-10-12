import type { VoiceHostSnapshot, VoiceInputCommand } from '@proj-airi/stage-ui/services/speech/bus'

import { defineInvokeHandler } from '@moeru/eventa'
import { getSpeechBusContext, voiceInputCommand, voiceSnapshotChanged } from '@proj-airi/stage-ui/services/speech/bus'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import VoiceInlay from './voice-inlay.vue'

const { returnHome, setIgnoreMouseEvents, registerShortcut, unregisterShortcut, shortcutListeners } = vi.hoisted(() => ({
  returnHome: vi.fn(),
  setIgnoreMouseEvents: vi.fn(),
  registerShortcut: vi.fn(async () => ({ ok: true })),
  unregisterShortcut: vi.fn(async () => {}),
  /** Global shortcut triggers that the main process sends to this window. */
  shortcutListeners: new Set<(event: { body?: { id: string, phase: 'down' | 'up' } }) => void>(),
}))

// The inlay talks to its Electron window through these IPC composables. The cursor stays outside the page.
vi.mock('@proj-airi/electron-vueuse', async () => {
  const { shallowRef } = await import('vue')
  const { electronInlayReturnHome, electronShortcutRegister, electronShortcutUnregister } = await import('../../../shared/eventa')
  const invokes = new Map<unknown, unknown>([
    [electronInlayReturnHome, returnHome],
    [electronShortcutRegister, registerShortcut],
    [electronShortcutUnregister, unregisterShortcut],
  ])
  return {
    useElectronEventaInvoke: (eventa: unknown) => invokes.get(eventa) ?? setIgnoreMouseEvents,
    getElectronEventaContext: () => ({
      on: (_eventa: unknown, listener: Parameters<typeof shortcutListeners.add>[0]) => {
        shortcutListeners.add(listener)
        return () => shortcutListeners.delete(listener)
      },
    }),
    useElectronMouse: () => ({ x: shallowRef(-1), y: shallowRef(-1) }),
    useElectronRelativeMouse: () => ({ x: shallowRef(-1), y: shallowRef(-1) }),
  }
})

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  returnHome.mockReset()
  setIgnoreMouseEvents.mockReset()
  registerShortcut.mockClear()
  unregisterShortcut.mockClear()
})

/** The voice host of the main window. It records the commands that the inlay sends. */
function hostCommands() {
  const commands: VoiceInputCommand[] = []
  cleanups.push(defineInvokeHandler(getSpeechBusContext(), voiceInputCommand, (command) => {
    commands.push(command)
    return { status: 'accepted' as const }
  }))
  return commands
}

function renderInlay() {
  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  const view = render(VoiceInlay, { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] } })
  cleanups.push(() => view.unmount())
  return view
}

function publish(snapshot: Omit<VoiceHostSnapshot, 'connected'>) {
  getSpeechBusContext().emit(voiceSnapshotChanged, { connected: true, ...snapshot })
}

function inlayView() {
  return document.querySelector<HTMLElement>('[data-testid="voice-inlay"]')?.dataset.view ?? 'hidden'
}

const capturing = { requestId: 'speech', sessionId: 'alice', phase: 'capturing' as const }
const draft = { id: 'draft', sessionId: 'alice', rawText: 'hello', text: 'Hello there.' }

describe('voice inlay', () => {
  it('passes clicks through while it paints nothing', async () => {
    renderInlay()

    await expect.poll(() => setIgnoreMouseEvents.mock.calls.at(-1)).toEqual([[true, { forward: true }]])
    expect(inlayView()).toBe('hidden')
  })

  it('shows a capsule when capture starts, and grows into the card when text arrives', async () => {
    const view = renderInlay()

    publish({ drafts: [], input: { ...capturing, text: '', segments: [] } })
    await expect.poll(inlayView).toBe('capsule')
    await expect.element(view.getByRole('status')).toHaveTextContent('stage.chat.voice-draft.listening')

    publish({ drafts: [], input: { ...capturing, text: 'What time', segments: [{ id: 'speech-0', text: 'What time', final: false }] } })

    await expect.poll(inlayView).toBe('card')
    await expect.element(view.getByTestId('voice-draft-live')).toHaveTextContent('What time')
  })

  it('shows the sent text while the card moves out, then paints nothing', async () => {
    const view = renderInlay()
    publish({ drafts: [draft], frontDraftId: 'draft' })
    await expect.element(view.getByRole('textbox')).toHaveValue('Hello there.')

    publish({ drafts: [{ ...draft, sending: true }], frontDraftId: 'draft' })
    await expect.poll(inlayView).toBe('sent')
    await expect.element(view.getByRole('status')).toHaveTextContent('Hello there.')
    // Auto send can remove the draft before the animation ends. The card still finishes its motion.
    publish({ drafts: [] })
    expect(inlayView()).toBe('sent')

    await expect.poll(inlayView, { timeout: 3000 }).toBe('hidden')
  })

  it('keeps new speech that starts during the send animation', async () => {
    renderInlay()
    publish({ drafts: [{ ...draft, sending: true }] })
    await expect.poll(inlayView).toBe('sent')

    publish({ drafts: [], input: { ...capturing, text: '', segments: [] } })

    await expect.poll(inlayView).toBe('capsule')
  })

  it('returns home after it painted nothing for a while, but not while it shows speech', async () => {
    renderInlay()
    publish({ drafts: [], input: { ...capturing, text: '', segments: [] } })
    await expect.poll(inlayView).toBe('capsule')

    await new Promise(resolve => setTimeout(resolve, 5500))
    expect(returnHome).not.toHaveBeenCalled()

    publish({ drafts: [] })
    await expect.poll(() => returnHome.mock.calls.length, { timeout: 7000 }).toBe(1)
  })

  it('cancels live speech on Escape and shrinks away', async () => {
    const commands = hostCommands()
    renderInlay()
    publish({ drafts: [], input: { ...capturing, text: '', segments: [] } })
    await expect.poll(inlayView).toBe('capsule')

    await userEvent.keyboard('{Escape}')

    await expect.poll(() => commands).toEqual([{ type: 'cancel-presented', requestId: 'speech' }])
    await expect.poll(inlayView).toBe('hidden')
  })

  it('listens for a global Escape only while it shows speech, and interrupts with it', async () => {
    const commands = hostCommands()
    renderInlay()
    await expect.poll(() => unregisterShortcut.mock.calls.length).toBeGreaterThan(0)
    expect(registerShortcut).not.toHaveBeenCalled()

    publish({ drafts: [], input: { ...capturing, text: '', segments: [] } })
    await expect.poll(() => registerShortcut.mock.calls.length).toBe(1)
    expect(registerShortcut).toHaveBeenCalledWith(expect.objectContaining({ id: 'voice-inlay-dismiss', accelerator: { modifiers: [], key: 'Escape' }, receiveKeyUps: true }))

    shortcutListeners.forEach(listener => listener({ body: { id: 'voice-inlay-dismiss', phase: 'down' } }))

    await expect.poll(() => commands).toEqual([{ type: 'cancel-presented', requestId: 'speech' }])
    await expect.poll(inlayView).toBe('hidden')
    await expect.poll(() => unregisterShortcut.mock.calls.length).toBeGreaterThan(1)
  })

  it('ignores other global shortcuts', async () => {
    const commands = hostCommands()
    renderInlay()
    publish({ drafts: [], input: { ...capturing, text: '', segments: [] } })
    await expect.poll(inlayView).toBe('capsule')

    shortcutListeners.forEach(listener => listener({ body: { id: 'voice-push-to-talk', phase: 'down' } }))
    shortcutListeners.forEach(listener => listener({ body: { id: 'voice-inlay-dismiss', phase: 'up' } }))

    await new Promise(resolve => setTimeout(resolve, 200))
    expect(commands).toEqual([])
    expect(inlayView()).toBe('capsule')
  })

  it('keeps a dismissed draft hidden until its text changes', async () => {
    const commands = hostCommands()
    const view = renderInlay()
    publish({ drafts: [draft], frontDraftId: 'draft' })
    await expect.element(view.getByRole('textbox')).toHaveValue('Hello there.')

    await userEvent.keyboard('{Escape}')
    await expect.poll(inlayView).toBe('hidden')
    publish({ drafts: [draft], frontDraftId: 'draft' })
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(inlayView()).toBe('hidden')
    // The draft stays with the host. Escape never discards it.
    expect(commands).toEqual([])

    publish({ drafts: [{ ...draft, text: 'Hello there, again.' }], frontDraftId: 'draft' })
    await expect.poll(inlayView).toBe('card')
  })
})
