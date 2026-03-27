import { useDevicesList, useUserMedia } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'

export function pickAvailableAudioInputId(inputs: MediaDeviceInfo[], preferredDeviceId: string): string {
  if (inputs.length === 0)
    return ''

  const preferred = preferredDeviceId.trim()
  if (preferred && inputs.some(input => input.deviceId === preferred))
    return preferred

  if (inputs.some(input => input.deviceId === 'default'))
    return 'default'

  return inputs[0]?.deviceId ?? ''
}

export function useAudioDevice(requestPermission: boolean = false) {
  const devices = useDevicesList({ constraints: { audio: true }, requestPermissions: requestPermission })
  const audioInputs = computed(() => devices.audioInputs.value)
  const selectedAudioInput = ref<string>(pickAvailableAudioInputId(devices.audioInputs.value, 'default'))
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
    selectedAudioInput.value = pickAvailableAudioInputId(audioInputs.value, selectedAudioInput.value)
  })

  function askPermission() {
    return devices.ensurePermissions()
      .then(() => nextTick())
      .then(() => {
        selectedAudioInput.value = pickAvailableAudioInputId(audioInputs.value, selectedAudioInput.value)
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

    askPermission,
    startStream,
    stopStream,
  }
}
