import { useDevicesList, useUserMedia } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'

export function useAudioDevice(requestPermission: boolean = false) {
  const { audioInputs, permissionGranted, ensurePermissions } = useDevicesList({ constraints: { audio: true }, requestPermissions: requestPermission })
  const selectedAudioInput = ref<string>(audioInputs.value.find(device => device.deviceId === 'default')?.deviceId || '')
  const deviceConstraints = computed<MediaStreamConstraints>(() => ({
    audio: {
      deviceId: { exact: selectedAudioInput.value },
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
  }))
  const { stream, stop: stopStream, start: startStream } = useUserMedia({ constraints: deviceConstraints, enabled: false, autoSwitch: true })

  watch(audioInputs, () => {
    if (selectedAudioInput.value === '' && audioInputs.value.length > 0) {
      selectedAudioInput.value = audioInputs.value.find(input => input.deviceId === 'default')?.deviceId || audioInputs.value[0].deviceId
    }
  })

  function askPermission() {
    return ensurePermissions()
      .then(() => nextTick())
      .then(() => {
        if (audioInputs.value.length > 0 && !selectedAudioInput.value) {
          selectedAudioInput.value = audioInputs.value.find(input => input.deviceId === 'default')?.deviceId || audioInputs.value[0].deviceId
        }
      })
      .catch((error) => {
        console.error('Error ensuring permissions:', error)
        throw error // Re-throw so callers can handle the error
      })
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
