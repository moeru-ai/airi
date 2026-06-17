import { useDevicesList, useUserMedia } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'

function resolvePreferredAudioInput(audioInputs: MediaDeviceInfo[]) {
  return audioInputs.find(device => device.deviceId === 'default')?.deviceId || audioInputs[0]?.deviceId || ''
}

export function useAudioDevice(requestPermission: boolean = false) {
  const { audioInputs, permissionGranted, ensurePermissions } = useDevicesList({ constraints: { audio: true }, requestPermissions: requestPermission })
  const selectedAudioInput = ref<string>(audioInputs.value.find(device => device.deviceId === 'default')?.deviceId || '')
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
    return ensurePermissions()
      .then(() => nextTick())
      .then(() => {
        selectAvailableAudioInput()
      })
      .catch((error) => {
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
