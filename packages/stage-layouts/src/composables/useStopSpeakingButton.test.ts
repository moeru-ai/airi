import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useStopSpeakingButton } from './useStopSpeakingButton'

const nowSpeaking = ref(false)
const speechMuted = ref(false)
const requestStopSpeakingMock = vi.fn()
const setSpeechMutedMock = vi.fn()
const trackSpeechMuteToggledMock = vi.fn()
const trackTtsStopClickedMock = vi.fn()

vi.mock('@proj-airi/stage-ui/stores/audio', () => ({
  useSpeakingStore: () => ({
    nowSpeaking,
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/speech-output-control', () => ({
  useSpeechOutputControlStore: () => ({
    requestStopSpeaking: requestStopSpeakingMock,
    setSpeechMuted: setSpeechMutedMock,
    speechMuted,
  }),
}))

vi.mock('@proj-airi/stage-ui/composables/use-analytics', () => ({
  useAnalytics: () => ({
    trackSpeechMuteToggled: trackSpeechMuteToggledMock,
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

  it('requests a manual-all stop without touching chat input state', () => {
    requestStopSpeakingMock.mockClear()
    trackTtsStopClickedMock.mockClear()

    const { stopAllSpeaking } = useStopSpeakingButton()

    stopAllSpeaking()

    expect(requestStopSpeakingMock).toHaveBeenCalledWith('manual-all')
    expect(trackTtsStopClickedMock).toHaveBeenCalledWith({
      reason: 'manual-all',
    })
  })

  it('tracks mute and unmute with the entry surface and active playback state', () => {
    speechMuted.value = false
    nowSpeaking.value = true
    setSpeechMutedMock.mockClear()
    trackSpeechMuteToggledMock.mockClear()

    const controls = useStopSpeakingButton()

    controls.toggleSpeechMuted('chat_toolbar')

    expect(setSpeechMutedMock).toHaveBeenCalledWith(true)
    expect(trackSpeechMuteToggledMock).toHaveBeenCalledWith({
      muted: true,
      source: 'chat_toolbar',
      was_speaking: true,
    })

    speechMuted.value = true
    nowSpeaking.value = false

    controls.toggleSpeechMuted('window_title_bar')

    expect(setSpeechMutedMock).toHaveBeenLastCalledWith(false)
    expect(trackSpeechMuteToggledMock).toHaveBeenLastCalledWith({
      muted: false,
      source: 'window_title_bar',
      was_speaking: false,
    })
  })
})
