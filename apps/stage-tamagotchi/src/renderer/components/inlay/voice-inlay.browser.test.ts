import { getSpeechBusContext, voiceSnapshotChanged } from '@proj-airi/stage-ui/services/speech/bus'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import VoiceInlay from './voice-inlay.vue'

const hideInlay = vi.fn()

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: () => hideInlay,
}))

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  hideInlay.mockReset()
})

function renderInlay() {
  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  const view = render(VoiceInlay, { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] } })
  cleanups.push(() => view.unmount())
  return view
}

const draft = { id: 'draft', sessionId: 'alice', rawText: 'hello', text: 'Hello there.' }

describe('voice inlay', () => {
  it('hides itself after its draft is sent', async () => {
    const view = renderInlay()
    const context = getSpeechBusContext()
    context.emit(voiceSnapshotChanged, { connected: true, drafts: [draft], frontDraftId: 'draft' })
    await expect.element(view.getByRole('textbox')).toHaveValue('Hello there.')

    context.emit(voiceSnapshotChanged, { connected: true, drafts: [{ ...draft, sending: true }], frontDraftId: 'draft' })

    await expect.poll(() => hideInlay.mock.calls.length, { timeout: 3000 }).toBe(1)
  })

  it('stays open when new speech arrives before the hide delay ends', async () => {
    renderInlay()
    const context = getSpeechBusContext()
    context.emit(voiceSnapshotChanged, { connected: true, drafts: [draft], frontDraftId: 'draft' })
    context.emit(voiceSnapshotChanged, { connected: true, drafts: [] })
    context.emit(voiceSnapshotChanged, {
      connected: true,
      drafts: [],
      input: { requestId: 'speech', sessionId: 'alice', phase: 'capturing', text: 'Next', segments: [{ id: 'speech-0', text: 'Next', final: false }] },
    })

    await new Promise(resolve => setTimeout(resolve, 1600))
    expect(hideInlay).not.toHaveBeenCalled()
  })

  it('stays open when it opens without content', async () => {
    renderInlay()

    await new Promise(resolve => setTimeout(resolve, 1600))
    expect(hideInlay).not.toHaveBeenCalled()
  })
})
