import { useDevicesList, useUserMedia } from '@vueuse/core'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

export function useAudioDevice() {
  const devices = useDevicesList({ constraints: { audio: true }, requestPermissions: true })
  const audioInputs = computed(() => devices.audioInputs.value)
  const selectedAudioInput = ref<string>(devices.audioInputs.value[0]?.deviceId || '')
  const deviceConstraints = computed<MediaStreamConstraints>(() => ({ audio: { deviceId: { exact: selectedAudioInput.value }, autoGainControl: true, echoCancellation: true, noiseSuppression: true } }))
  const { stream, stop: stopStream, start: startStream } = useUserMedia({ constraints: deviceConstraints, enabled: false, autoSwitch: true })

  watch(audioInputs, () => {
    if (!selectedAudioInput.value && audioInputs.value.length > 0) {
      selectedAudioInput.value = audioInputs.value[0]?.deviceId
    }
  })

  // Lifecycle
  onMounted(() => {
    devices.ensurePermissions()
      .then(() => nextTick())
      .then(() => {
        if (audioInputs.value.length > 0 && !selectedAudioInput.value) {
          selectedAudioInput.value = audioInputs.value.find(input => input.deviceId === 'default')?.deviceId || audioInputs.value[0].deviceId
        }
      })
      .catch((error) => {
        console.error('Error ensuring permissions:', error)
      })
  })

  return {
    audioInputs,
    selectedAudioInput,
    stream,
    stopStream,
    startStream,
    deviceConstraints,
  }
}
