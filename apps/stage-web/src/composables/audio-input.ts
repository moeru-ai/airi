import { useDevicesList, useUserMedia } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

export function useAudioInput() {
  const devices = useDevicesList({ constraints: { audio: true }, requestPermissions: false })

  const selectedAudioInputId = ref<string>(devices.audioInputs.value[0]?.deviceId || '')
  const selectedAudioInput = ref<MediaDeviceInfo>()
  const audioInputs = computed(() => devices.audioInputs.value)

  const constraints = ref<MediaStreamConstraints>({ audio: true })
  const media = useUserMedia({ constraints, autoSwitch: true, enabled: false })

  async function request() {
    if (devices.permissionGranted.value) {
      return
    }
    if (!devices.isSupported.value) {
      return
    }

    await devices.ensurePermissions()
  }

  watch(selectedAudioInputId, () => {
    if (selectedAudioInputId.value) {
      constraints.value = {
        audio: {
          deviceId: { exact: selectedAudioInputId.value! },
        },
      }
    }
  }, { immediate: true })

  watch(devices.audioInputs, () => {
    selectedAudioInput.value = audioInputs.value.find(device => device.deviceId === selectedAudioInputId.value)
  }, { immediate: true })

  watch([devices.permissionGranted, audioInputs, selectedAudioInputId], async () => {
    await request()
    if (!devices.permissionGranted.value) {
      return
    }
    if (audioInputs.value.length === 0) {
      return
    }
    if (!selectedAudioInput.value) {
      selectedAudioInput.value = audioInputs.value[0]
    }
  }, { immediate: true })

  async function start() {
    await request()

    if (!devices.permissionGranted.value) {
      return
    }
    if (!selectedAudioInput.value) {
      return
    }

    if (media.enabled.value) {
      media.restart()
    }

    media.start()
  }

  function stop() {
    media.stop()
  }

  return {
    selectedAudioInputId,
    selectedAudioInput,
    audioInputs,

    start,
    stop,
    request,
    media,
  }
}
