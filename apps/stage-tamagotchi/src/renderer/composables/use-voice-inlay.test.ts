import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { electronVoiceInlayShow } from '../../shared/eventa'
import { useVoiceInlayStore } from '../stores/voice-inlay'
import { useVoiceInlay } from './use-voice-inlay'

const invokes = vi.hoisted(() => ({
  show: vi.fn<(options: { focus: boolean, presentation: 'listening' | 'draft' }) => Promise<void>>(),
  hide: vi.fn<() => Promise<void>>(),
}))

// NOTICE:
// The test cannot open a native Electron window.
// The inlay composable sends these Eventa invokes to Electron main.
// Source: apps/stage-tamagotchi/src/main/windows/inlay/rpc/index.electron.ts.
// Remove this mock when this test runs inside an Electron renderer.
vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (event: unknown) => event === electronVoiceInlayShow ? invokes.show : invokes.hide,
}))

describe('voice inlay presentation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invokes.show.mockReset().mockResolvedValue(undefined)
    invokes.hide.mockReset().mockResolvedValue(undefined)
  })

  it('shows a listening capsule and restores a pending draft afterward', async () => {
    const inlay = useVoiceInlay()
    const store = useVoiceInlayStore()
    store.queueVoiceDraft({ cardId: 'a', sessionId: 'session-a', text: 'first' })

    await inlay.showRecording('b')
    expect(invokes.show).toHaveBeenCalledWith({ focus: false, presentation: 'listening' })
    expect(store.recordingCardId).toBe('b')

    await inlay.hideRecording()
    expect(invokes.show).toHaveBeenLastCalledWith({ focus: true, presentation: 'draft' })
    expect(store.activeDraft?.text).toBe('first')
    expect(invokes.hide).not.toHaveBeenCalled()
  })

  it('hides the capsule when there is no pending draft', async () => {
    const inlay = useVoiceInlay()

    await inlay.showRecording('a')
    await inlay.hideRecording()

    expect(invokes.hide).toHaveBeenCalledOnce()
  })

  it('switches from the listening capsule to the captured draft', async () => {
    const inlay = useVoiceInlay()
    const store = useVoiceInlayStore()

    await inlay.showRecording('b')
    await inlay.queueVoiceDraft({ cardId: 'b', sessionId: 'session-b', text: 'hello' })

    expect(store.recordingCardId).toBeUndefined()
    expect(store.activeDraft?.text).toBe('hello')
    expect(invokes.show).toHaveBeenLastCalledWith({ focus: true, presentation: 'draft' })
  })

  it('keeps listening when an earlier character receives a draft', async () => {
    const inlay = useVoiceInlay()
    const store = useVoiceInlayStore()

    await inlay.showRecording('b')
    await inlay.queueVoiceDraft({ cardId: 'a', sessionId: 'session-a', text: 'earlier' })

    expect(store.recordingCardId).toBe('b')
    expect(store.activeDraft?.text).toBe('earlier')
    expect(invokes.show).toHaveBeenCalledTimes(1)
  })
})
