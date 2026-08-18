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

  it('tracks mute and unmute with the active playback state', async () => {
    speechMuted.value = false
    nowSpeaking.value = true
    setSpeechMutedMock.mockClear()
    trackSpeechMuteToggledMock.mockClear()

    const controls = useStopSpeakingButton()

    await controls.toggleSpeechMuted()

    expect(setSpeechMutedMock).toHaveBeenCalledWith(true)
    expect(trackSpeechMuteToggledMock).toHaveBeenCalledWith({
      muted: true,
      was_speaking: true,
    })

    speechMuted.value = true
    nowSpeaking.value = false

    await controls.toggleSpeechMuted()

    expect(setSpeechMutedMock).toHaveBeenLastCalledWith(false)
    expect(trackSpeechMuteToggledMock).toHaveBeenLastCalledWith({
      muted: false,
      was_speaking: false,
    })
  })

  // ROOT CAUSE:
  //
  // Electron's auxiliary /chat renderer has its own Pinia instance, so its
  // local nowSpeaking value stays false while the main Stage renderer speaks.
  //
  // The title-bar mute control now resolves state from the output host before
  // capturing speech_mute_toggled.
  it('tracks the speaking state resolved from a remote output host', async () => {
    speechMuted.value = false
    nowSpeaking.value = false
    setSpeechMutedMock.mockClear()
    trackSpeechMuteToggledMock.mockClear()

    const resolveSpeakingState = vi.fn().mockResolvedValue(true)
    const controls = useStopSpeakingButton({ resolveSpeakingState })

    await controls.toggleSpeechMuted()

    expect(resolveSpeakingState).toHaveBeenCalledTimes(1)
    expect(setSpeechMutedMock).toHaveBeenCalledWith(true)
    expect(trackSpeechMuteToggledMock).toHaveBeenCalledWith({
      muted: true,
      was_speaking: true,
    })
  })

  it('still toggles mute without capturing a false metric when the output host is unavailable', async () => {
    speechMuted.value = false
    setSpeechMutedMock.mockClear()
    trackSpeechMuteToggledMock.mockClear()

    const controls = useStopSpeakingButton({
      resolveSpeakingState: () => Promise.reject(new Error('output host reloading')),
    })

    await controls.toggleSpeechMuted()

    expect(setSpeechMutedMock).toHaveBeenCalledWith(true)
    expect(trackSpeechMuteToggledMock).not.toHaveBeenCalled()
  })
})
