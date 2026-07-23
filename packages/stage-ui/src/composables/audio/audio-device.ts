import { useDevicesList, useUserMedia } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'

import { useAnalytics } from '../use-analytics'

const UNKNOWN_STT_PROVIDER_ID = 'unknown'

/**
 * Selects the default microphone when available, otherwise the first detected input.
 */
function resolvePreferredAudioInput(audioInputs: MediaDeviceInfo[]) {
  return audioInputs.find(device => device.deviceId === 'default')?.deviceId || audioInputs[0]?.deviceId || ''
}

/**
 * Detects browser errors caused by a stale or unavailable microphone device.
 */
export function isMissingAudioInputDeviceError(error: unknown) {
  if (!error || typeof error !== 'object')
    return false

  const { message, name } = error as { message?: unknown, name?: unknown }

  return name === 'NotFoundError'
    || name === 'OverconstrainedError'
    || (typeof message === 'string' && message.includes('Requested device not found'))
}

/**
 * Normalizes browser microphone failures into low-cardinality analytics codes.
 */
function audioDeviceErrorCode(error: unknown): 'permission_denied' | 'device_unavailable' {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'))
    return 'permission_denied'

  return 'device_unavailable'
}

/**
 * Provides microphone device selection, permission requests, and audio stream lifecycle state.
 */
export function useAudioDevice(requestPermission: boolean = false) {
  const {
    trackAudioDeviceUnavailable,
    trackMicrophonePermissionDenied,
    trackMicrophonePermissionRequested,
  } = useAnalytics()
  const { audioInputs, permissionGranted, ensurePermissions } = useDevicesList({ constraints: { audio: true }, requestPermissions: requestPermission })
  const selectedAudioInput = ref<string>(audioInputs.value.find(device => device.deviceId === 'default')?.deviceId || '')
  /**
   * Keeps the selected microphone aligned with the currently available device list.
   */
  function selectAvailableAudioInput() {
    if (!audioInputs.value.length)
      return

    const selectedIsAvailable = audioInputs.value.some(device => device.deviceId === selectedAudioInput.value)
    if (!selectedAudioInput.value || !selectedIsAvailable)
      selectedAudioInput.value = resolvePreferredAudioInput(audioInputs.value)
  }

  const deviceConstraints = computed<MediaStreamConstraints>(() => ({
    audio: selectedAudioInput.value
      ? {
          deviceId: { exact: selectedAudioInput.value },
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        }
      : {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
  }))
  const { stream, stop: stopStream, start: startUserMediaStream } = useUserMedia({ constraints: deviceConstraints, enabled: false, autoSwitch: true })

  watch(audioInputs, () => {
    selectAvailableAudioInput()
  })

  function askPermission() {
    trackMicrophonePermissionRequested({ stt_provider_id: UNKNOWN_STT_PROVIDER_ID })

    return ensurePermissions()
      .then(() => nextTick())
      .then(() => {
        selectAvailableAudioInput()
        if (audioInputs.value.length <= 0) {
          trackAudioDeviceUnavailable({
            stt_provider_id: UNKNOWN_STT_PROVIDER_ID,
            error_code: 'device_unavailable',
          })
        }
      })
      .catch((error) => {
        const errorCode = audioDeviceErrorCode(error)
        if (errorCode === 'permission_denied') {
          trackMicrophonePermissionDenied({
            stt_provider_id: UNKNOWN_STT_PROVIDER_ID,
            error_code: errorCode,
          })
        }
        else {
          trackAudioDeviceUnavailable({
            stt_provider_id: UNKNOWN_STT_PROVIDER_ID,
            error_code: errorCode,
          })
        }
        console.error('Error ensuring permissions:', error)
        throw error // Re-throw so callers can handle the error
      })
  }

  async function startStream() {
    selectAvailableAudioInput()

    try {
      return await startUserMediaStream()
    }
    catch (error) {
      const fallbackDeviceId = resolvePreferredAudioInput(audioInputs.value)
      if (fallbackDeviceId && fallbackDeviceId !== selectedAudioInput.value) {
        selectedAudioInput.value = fallbackDeviceId
        await nextTick()
        return await startUserMediaStream()
      }

      if (selectedAudioInput.value && isMissingAudioInputDeviceError(error)) {
        selectedAudioInput.value = ''
        await nextTick()
        return await startUserMediaStream()
      }

      throw error
    }
  }

  return {
    audioInputs,
    selectedAudioInput,
    stream,
    deviceConstraints,
    permissionGranted,

    askPermission,
    startStream,
    stopStream,
  }
}
