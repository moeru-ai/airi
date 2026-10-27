import type { VoiceHostSnapshot, VoiceInputCommand } from '@proj-airi/stage-ui/services/speech/bus'

import { defineInvokeHandler } from '@moeru/eventa'
import { getSpeechBusContext, voiceInputCommand, voiceSnapshotChanged } from '@proj-airi/stage-ui/services/speech/bus'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import VoiceInlay from './voice-inlay.vue'

import 'virtual:uno.css'

const { returnHome, setPointerPassthrough, beginMove, cursor } = vi.hoisted(() => ({
  returnHome: vi.fn(async () => ({})),
  setPointerPassthrough: vi.fn(async (_enabled: boolean) => {}),
  beginMove: vi.fn(async () => {}),
  /** The cursor position that the main process reports. The mock factory fills it with refs. */
  cursor: {} as { x?: { value: number }, y?: { value: number } },
}))

// Native operations are the boundary. Vue, Pinia, the speech bus, and DOM hit testing remain real.
vi.mock('../../host-context', async () => {
  const { shallowRef } = await import('vue')
  return {
    useHostInlay: () => ({ returnHome }),
    useHostPointerPassthrough: () => setPointerPassthrough,
    useHostWindowMove: () => ({ beginMove }),
    useHostRelativeMouse: () => {
      cursor.x = shallowRef(-1)
      cursor.y = shallowRef(-1)
      return cursor
    },
  }
})

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  returnHome.mockReset()
  setPointerPassthrough.mockClear()
  beginMove.mockClear()
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
  // Test Utils stubs <Transition> by default. The inlay depends on its leave hooks, so the real component runs.
  const view = render(VoiceInlay, { global: { stubs: { transition: false }, plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] } })
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

    await expect.poll(() => setPointerPassthrough.mock.calls.at(-1)).toEqual([true])
    expect(inlayView()).toBe('hidden')
  })

  // Codex review on PR #2928: the hit test after a view change ran while the leaving card still covered the cursor.
  it('takes clicks after the capsule appears, and passes them through again after it leaves, under a still cursor', async () => {
    renderInlay()
    publish({ drafts: [], input: { ...capturing, text: '', segments: [] } })
    await expect.poll(inlayView).toBe('capsule')
    const rect = document.querySelector('[data-testid="voice-inlay"]')!.getBoundingClientRect()
    cursor.x!.value = Math.round(rect.left + rect.width / 2)
    cursor.y!.value = Math.round(rect.top + rect.height / 2)
    await expect.poll(() => setPointerPassthrough.mock.calls.at(-1)).toEqual([false])

    publish({ drafts: [] })

    await expect.poll(inlayView).toBe('hidden')
    await expect.poll(() => setPointerPassthrough.mock.calls.at(-1)).toEqual([true])
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

  it('moves the native window from its capsule without dragging draft controls', async () => {
    const commands = hostCommands()
    const view = renderInlay()
    publish({ drafts: [], input: { ...capturing, text: '', segments: [] } })
    await view.getByRole('status').click()
    expect(beginMove).toHaveBeenCalledOnce()

    publish({ drafts: [draft], frontDraftId: draft.id })
    const textbox = view.getByRole('textbox')
    await textbox.fill('Updated draft')
    await view.getByRole('button', { name: 'stage.chat.actions.send' }).click()

    expect(beginMove).toHaveBeenCalledOnce()
    await expect.poll(() => commands).toContainEqual({ type: 'edit-draft', draftId: draft.id, text: 'Updated draft' })
    await expect.poll(() => commands).toContainEqual({ type: 'send-draft', draftId: draft.id })
  })

  it('takes the pointer when a card expands under a stationary cursor', async () => {
    renderInlay()
    publish({ drafts: [], input: { ...capturing, text: '', segments: [] } })
    await expect.poll(inlayView).toBe('capsule')
    const capsule = document.querySelector<HTMLElement>('[data-inlay-surface]')!
    await expect.poll(() => capsule.getBoundingClientRect().width).toBe(176)
    const bounds = capsule.getBoundingClientRect()
    cursor.x!.value = bounds.left - 35
    cursor.y!.value = bounds.bottom - 20
    await expect.poll(() => setPointerPassthrough.mock.calls.at(-1)).toEqual([true])

    publish({ drafts: [draft], frontDraftId: draft.id })

    await expect.poll(() => setPointerPassthrough.mock.calls.at(-1)).toEqual([false])
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

  it('plays the rewrite of auto-sent speech on the sent card before the card moves out', async () => {
    const view = renderInlay()
    publish({ drafts: [], input: { ...capturing, text: 'hello their', segments: [{ id: 'speech-0', text: 'hello their', final: true }] } })
    await expect.element(view.getByTestId('voice-draft-live')).toHaveTextContent('hello their')

    // Auto send: the speech settles into a draft that the host sends at once.
    publish({ drafts: [{ ...draft, sending: true }], frontDraftId: 'draft' })
    await expect.poll(inlayView).toBe('sent')
    const card = document.querySelector('[data-testid="voice-inlay"]')!
    expect(card.classList.contains('inlay-send')).toBe(false)

    await expect.element(view.getByRole('status')).toHaveTextContent('Hello there.')
    publish({ drafts: [] })
    await expect.poll(() => card.classList.contains('inlay-send'), { timeout: 3000 }).toBe(true)
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
  }, 15000)

  it('cancels live speech on Escape and shrinks away', async () => {
    const commands = hostCommands()
    renderInlay()
    publish({ drafts: [], input: { ...capturing, text: '', segments: [] } })
    await expect.poll(inlayView).toBe('capsule')

    await userEvent.keyboard('{Escape}')

    await expect.poll(() => commands).toEqual([{ type: 'cancel-presented', requestId: 'speech' }])
    await expect.poll(inlayView).toBe('hidden')
  })

  it('leaves an IME Escape to composition instead of cancelling speech', async () => {
    const commands = hostCommands()
    renderInlay()
    publish({ drafts: [], input: { ...capturing, text: '', segments: [] } })
    await expect.poll(inlayView).toBe('capsule')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true }))

    expect(inlayView()).toBe('capsule')
    expect(commands).toEqual([])
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
