import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useStopSpeakingButton } from './useStopSpeakingButton'

const nowSpeaking = ref(false)
const requestStopSpeakingMock = vi.fn()
const trackTtsStopClickedMock = vi.fn()

vi.mock('@proj-airi/stage-ui/stores/audio', () => ({
  useSpeakingStore: () => ({
    nowSpeaking,
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/speech-output-control', () => ({
  useSpeechOutputControlStore: () => ({
    requestStopSpeaking: requestStopSpeakingMock,
  }),
}))

vi.mock('@proj-airi/stage-ui/composables/use-analytics', () => ({
  useAnalytics: () => ({
    trackTtsStopClicked: trackTtsStopClickedMock,
  }),
}))

vi.mock('pinia', () => ({
  storeToRefs: (store: object) => store,
}))

describe('useStopSpeakingButton', () => {
  it('shows the manual stop button only while the assistant is speaking', () => {
    nowSpeaking.value = false

    const { showStopSpeakingButton } = useStopSpeakingButton()

    expect(showStopSpeakingButton.value).toBe(false)

    nowSpeaking.value = true

    expect(showStopSpeakingButton.value).toBe(true)
  })

  it('requests a manual chat stop without touching chat input state', () => {
    requestStopSpeakingMock.mockClear()
    trackTtsStopClickedMock.mockClear()

    const { stopSpeakingFromChat } = useStopSpeakingButton()

    stopSpeakingFromChat()

    expect(requestStopSpeakingMock).toHaveBeenCalledWith('manual-chat')
    expect(trackTtsStopClickedMock).toHaveBeenCalledWith({
      reason: 'manual-chat',
    })
  })
})
