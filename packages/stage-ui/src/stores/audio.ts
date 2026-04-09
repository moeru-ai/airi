import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

// PERF: Reusable buffer pool for audio frequency data to reduce allocations
class AudioBufferPool {
  private buffers: Uint8Array[] = []

  acquireBuffer(size: number): Uint8Array {
    // Find or create buffer matching required size
    const buffer = this.buffers.find(b => b.length === size)
    if (buffer) {
      this.buffers = this.buffers.filter(b => b !== buffer)
      return buffer
    }
    return new Uint8Array(size)
  }

  releaseBuffer(buffer: Uint8Array): void {
    // Pool up to 4 reusable buffers per size
    if (this.buffers.filter(b => b.length === buffer.length).length < 4) {
      this.buffers.push(buffer)
    }
  }
}

const bufferPool = new AudioBufferPool()

function calculateVolumeWithLinearNormalize(analyser: AnalyserNode) {
  const dataBuffer = bufferPool.acquireBuffer(analyser.frequencyBinCount)
  try {
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
  finally {
    bufferPool.releaseBuffer(dataBuffer)
  }
}

function calculateVolumeWithMinMaxNormalize(analyser: AnalyserNode) {
  const dataBuffer = bufferPool.acquireBuffer(analyser.frequencyBinCount)
  try {
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
  finally {
    bufferPool.releaseBuffer(dataBuffer)
  }
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
