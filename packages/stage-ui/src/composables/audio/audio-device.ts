import { useDevicesList, useUserMedia } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'

import { useAnalytics } from '../use-analytics'

const UNKNOWN_STT_PROVIDER_ID = 'unknown'

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
 * Provides microphone device selection, permission requests, and audio stream lifecycle state.
 */
export function useAudioDevice(requestPermission: boolean = false) {
  const { trackMicrophonePermissionDenied } = useAnalytics()
  const {
    audioInputs,
    devices,
    ensurePermissions,
    permissionGranted,
  } = useDevicesList({
    constraints: { audio: true },
    requestPermissions: requestPermission,
  })
  const audioInputOptions = computed(() => audioInputs.value
    .filter(device => device.deviceId)
    .map(device => ({
      label: device.label || device.deviceId,
      value: device.deviceId,
    })))
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
          autoGainControl: true,
          deviceId: { exact: selectedAudioInput.value },
          echoCancellation: true,
          noiseSuppression: true,
        }
      : {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
  }))
  const { start: startUserMediaStream, stop: stopStream, stream } = useUserMedia({ autoSwitch: true, constraints: deviceConstraints, enabled: false })

  watch(audioInputs, () => {
    selectAvailableAudioInput()
  })

  async function askPermission() {
    try {
      const granted = await ensurePermissions()

      if (granted) {
        // NOTICE:
        // VueUse starts its post-permission device refresh without awaiting it, so callers can
        // otherwise observe the anonymous pre-permission list after askPermission() resolves.
        // Source: `@vueuse/core` 14.2.1 `useDevicesList.ensurePermissions()`.
        // Remove this refresh when VueUse exposes or awaits its internal device-list update.
        devices.value = await navigator.mediaDevices.enumerateDevices()
      }

      selectAvailableAudioInput()
    }
    catch (error) {
      const errorCode = audioDeviceErrorCode(error)
      if (errorCode === 'permission_denied') {
        trackMicrophonePermissionDenied({
          error_code: errorCode,
          stt_provider_id: UNKNOWN_STT_PROVIDER_ID,
        })
      }
      console.error('Error ensuring permissions:', error)
      throw error
    }
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
    askPermission,
    audioInputOptions,
    audioInputs,
    deviceConstraints,
    permissionGranted,
    selectedAudioInput,

    startStream,
    stopStream,
    stream,
  }
}

/**
 * Normalizes browser microphone failures into low-cardinality analytics codes.
 */
function audioDeviceErrorCode(error: unknown): 'device_unavailable' | 'permission_denied' {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'))
    return 'permission_denied'

  return 'device_unavailable'
}

/**
 * Selects the default microphone when available, otherwise the first detected input.
 */
function resolvePreferredAudioInput(audioInputs: MediaDeviceInfo[]) {
  return audioInputs.find(device => device.deviceId === 'default')?.deviceId || audioInputs[0]?.deviceId || ''
}
