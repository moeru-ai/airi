import { useDevicesList, useUserMedia } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'

function calculateVolumeWithLinearNormalize(analyser: AnalyserNode) {
  const dataBuffer = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(dataBuffer)

  const volumeVector: Array<number> = []
  for (let i = 0; i < 700; i += 80)
    volumeVector.push(dataBuffer[i])

  const volumeSum = dataBuffer
    // The volume changes flatten-ly, while the volume is often low, therefore we need to amplify it.
    // Applying a power function to amplify the volume is helpful, for example:
    // v ** 1.2 will amplify the volume by 1.2 times
    .map(v => v ** 1.2)
    // Scale up the volume values to make them more distinguishable
    .map(v => v * 1.2)
    .reduce((acc, cur) => acc + cur, 0)

  return (volumeSum / dataBuffer.length / 100)
}

function calculateVolumeWithMinMaxNormalize(analyser: AnalyserNode) {
  const dataBuffer = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(dataBuffer)

  const volumeVector: Array<number> = []
  for (let i = 0; i < 700; i += 80)
    volumeVector.push(dataBuffer[i])

  // The volume changes flatten-ly, while the volume is often low, therefore we need to amplify it.
  // We can apply a power function to amplify the volume, for example
  // v ** 1.2 will amplify the volume by 1.2 times
  const amplifiedVolumeVector = dataBuffer.map(v => v ** 1.5)

  // Normalize the amplified values using Min-Max scaling
  const min = Math.min(...amplifiedVolumeVector)
  const max = Math.max(...amplifiedVolumeVector)
  const range = max - min

  let normalizedVolumeVector
  if (range === 0) {
    // If range is zero, all values are the same, so normalization is not needed
    normalizedVolumeVector = amplifiedVolumeVector.map(() => 0) // or any default value
  }
  else {
    normalizedVolumeVector = amplifiedVolumeVector.map(v => (v - min) / range)
  }

  // Aggregate the volume values
  const volumeSum = normalizedVolumeVector.reduce((acc, cur) => acc + cur, 0)

  // Average the volume values
  return volumeSum / dataBuffer.length
}

function calculateVolume(analyser: AnalyserNode, mode: 'linear' | 'minmax' = 'linear') {
  switch (mode) {
    case 'linear':
      return calculateVolumeWithLinearNormalize(analyser)
    case 'minmax':
      return calculateVolumeWithMinMaxNormalize(analyser)
  }
}

export const useAudioContext = defineStore('audio-context', () => {
  const audioContext = shallowRef<AudioContext>(new AudioContext())

  return {
    audioContext,
    calculateVolume,
  }
})

export function useAudioDevice(requestPermission: boolean = false) {
  const devices = useDevicesList({ constraints: { audio: true }, requestPermissions: requestPermission })
  const audioInputs = computed(() => devices.audioInputs.value)

  const selectedAudioInput = ref<string>('')

  function findBestDevice(inputs: MediaDeviceInfo[]) {
    if (inputs.length === 0)
      return ''

    // 1. Look for "Microphone Array" that is NOT "Communications" (User's specific preference)
    const arrayMic = inputs.find(d => d.label.toLowerCase().includes('microphone array') && !d.label.toLowerCase().includes('communications'))
    if (arrayMic)
      return arrayMic.deviceId

    // 2. Fallback to any "Microphone Array"
    const anyArrayMic = inputs.find(d => d.label.toLowerCase().includes('microphone array'))
    if (anyArrayMic)
      return anyArrayMic.deviceId

    // 3. Look for "default"
    const defaultMic = inputs.find(d => d.deviceId === 'default')
    if (defaultMic)
      return defaultMic.deviceId

    // 4. Fallback to first available
    return inputs[0].deviceId
  }

  const selectedAudioInputLabel = computed(() => {
    const device = audioInputs.value.find(d => d.deviceId === selectedAudioInput.value)
    return device?.label || 'Unknown Device'
  })

  const deviceConstraints = computed<MediaStreamConstraints>(() => ({
    audio: {
      deviceId: selectedAudioInput.value ? { exact: selectedAudioInput.value } : undefined,
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
  }))

  const { stream, stop: stopStream, start: startStream } = useUserMedia({
    constraints: deviceConstraints,
    enabled: false,
    autoSwitch: true,
  })

  watch(audioInputs, (newInputs) => {
    const isCommunications = selectedAudioInputLabel.value.toLowerCase().includes('communications')
    const needsBest = !selectedAudioInput.value || selectedAudioInput.value === 'default' || isCommunications

    if (needsBest && newInputs.length > 0) {
      const best = findBestDevice(newInputs)
      if (best && best !== selectedAudioInput.value) {
        console.info('[Audio Store] Switching away from Communications/Default device to:', best)
        selectedAudioInput.value = best
      }
    }
  }, { immediate: true })

  function askPermission() {
    return devices.ensurePermissions()
      .then(() => nextTick())
      .then(() => {
        if (audioInputs.value.length > 0 && !selectedAudioInput.value) {
          selectedAudioInput.value = findBestDevice(audioInputs.value)
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
    selectedAudioInputLabel,
    stream,
    deviceConstraints,

    askPermission,
    startStream,
    stopStream,
  }
}

export const useSpeakingStore = defineStore('character-speaking', () => {
  const nowSpeakingAvatarBorderOpacityMin = 30
  const nowSpeakingAvatarBorderOpacityMax = 100
  const mouthOpenSize = ref(0)
  const nowSpeaking = ref(false)

  const nowSpeakingAvatarBorderOpacity = computed<number>(() => {
    if (!nowSpeaking.value)
      return nowSpeakingAvatarBorderOpacityMin

    return ((nowSpeakingAvatarBorderOpacityMin
      + (nowSpeakingAvatarBorderOpacityMax - nowSpeakingAvatarBorderOpacityMin) * mouthOpenSize.value) / 100)
  })

  return {
    mouthOpenSize,
    nowSpeaking,
    nowSpeakingAvatarBorderOpacity,
  }
})
