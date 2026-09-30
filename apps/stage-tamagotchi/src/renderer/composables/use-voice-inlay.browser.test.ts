import { useHearingDraftStore } from '@proj-airi/stage-ui/stores/hearing-drafts'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'

import { electronVoiceInlayShow } from '../../shared/eventa'
import { useVoiceInlay } from './use-voice-inlay'

const invokes = vi.hoisted(() => ({
  show: vi.fn().mockResolvedValue(undefined),
  hide: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (event: unknown) => event === electronVoiceInlayShow ? invokes.show : invokes.hide,
}))

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const dispose of cleanup.splice(0))
    dispose()
  vi.clearAllMocks()
})

it('focuses a completed draft once and keeps recording indicators inactive', async () => {
  const pinia = createPinia()
  let inlay!: ReturnType<typeof useVoiceInlay>
  let drafts!: ReturnType<typeof useHearingDraftStore>
  const app = createApp(defineComponent({
    setup() {
      inlay = useVoiceInlay()
      drafts = useHearingDraftStore()
      return () => h('div')
    },
  }))
  app.use(pinia)
  app.mount(document.createElement('div'))
  cleanup.push(() => {
    app.unmount()
    disposePinia(pinia)
  })
  const owner = { sessionId: 'session-a', segmentId: 'segment-a' }
  inlay.onRecordingChange({ ...owner, active: true })
  await vi.waitFor(() => expect(invokes.show).toHaveBeenLastCalledWith({ focus: false, presentation: 'listening' }))
  await drafts.append(owner.sessionId, 'Recognized phrase')
  inlay.onTranscriptionComplete({ ...owner, text: 'Recognized phrase' })
  await vi.waitFor(() => expect(invokes.show).toHaveBeenLastCalledWith({ focus: true, presentation: 'draft' }))
  const presentations = invokes.show.mock.calls.length
  await drafts.edit(owner.sessionId, 'Edited phrase')
  await drafts.promote(owner.sessionId)
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(invokes.show).toHaveBeenCalledTimes(presentations)

  inlay.onRecordingChange({ sessionId: owner.sessionId, segmentId: 'segment-b', active: true })
  await vi.waitFor(() => expect(invokes.show).toHaveBeenLastCalledWith({ focus: false, presentation: 'listening' }))
  const afterNextRecording = invokes.show.mock.calls.length
  inlay.onTranscriptionComplete({ ...owner, text: 'Late previous phrase' })
  await nextTick()
  expect(invokes.show).toHaveBeenCalledTimes(afterNextRecording)
})
