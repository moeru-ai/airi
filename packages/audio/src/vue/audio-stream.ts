import type { MaybeRefOrGetter } from 'vue'

import { onUnmounted, ref, toRef } from 'vue'

import { createAudioAnalyser, createAudioSource, getAudioContext, getCurrentTime, initializeAudioContext } from '../audio-context'

export interface AudioStreamConfig {
  deviceId: string
  sampleRate?: number
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
}

export interface AudioAnalysisData {
  volumeLevel: number
  frequencyData: Uint8Array
  timeDomainData: Float32Array
  timestamp: number
}

export type AudioAnalysisCallback = (data: AudioAnalysisData) => void
export type AudioChunkCallback = (chunk: Float32Array, sampleRate: number) => void

export function useAudioStream(cfg: MaybeRefOrGetter<AudioStreamConfig | undefined>) {
  const config = toRef(cfg)

  const isActive = ref(false)
  const error = ref<string>('')
  const isInitializing = ref(false) // Add loading state

  // Stream-specific state
  const mediaStream = ref<MediaStream>()
  const source = ref<MediaStreamAudioSourceNode>()
  const analyser = ref<AnalyserNode>()

  // Callbacks for different types of analysis
  const analysisCallbacks = new Set<AudioAnalysisCallback>()
  const chunkCallbacks = new Set<AudioChunkCallback>()

  // Audio data arrays
  const dataArray = ref<Uint8Array>()
  const timeDataArray = ref<Float32Array>()

  // Helper function to wait for audio context
  async function waitForAudioContext(maxRetries = 10, delay = 100) {
    for (let i = 0; i < maxRetries; i++) {
      const audioContext = getAudioContext()
      if (audioContext && audioContext.state !== 'closed') {
        return audioContext
      }
      await new Promise(resolve => setTimeout(resolve, delay))
    }
    throw new Error('Audio context failed to initialize within timeout')
  }

  async function start() {
    if (isActive.value || isInitializing.value)
      return

    try {
      isInitializing.value = true
      error.value = ''

      // Initialize global audio context and wait for it
      await initializeAudioContext(config.value?.sampleRate || 16000)
      await waitForAudioContext()

      // Get user media
      mediaStream.value = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: config.value?.deviceId,
          sampleRate: config.value?.sampleRate || 16000,
          echoCancellation: config.value?.echoCancellation ?? true,
          noiseSuppression: config.value?.noiseSuppression ?? true,
          autoGainControl: config.value?.autoGainControl ?? true,
        },
      })

      // Ensure we still have a valid audio context after getUserMedia
      const currentAudioContext = getAudioContext()
      if (!currentAudioContext) {
        throw new Error('Audio context became unavailable')
      }

      // Create audio nodes using global context
      source.value = createAudioSource(mediaStream.value)
      analyser.value = createAudioAnalyser({
        fftSize: 512,
        smoothingTimeConstant: 0.1,
      })

      // Connect nodes
      source.value.connect(analyser.value)

      // Setup data arrays
      const bufferLength = analyser.value.frequencyBinCount
      dataArray.value = new Uint8Array(bufferLength)
      timeDataArray.value = new Float32Array(analyser.value.fftSize)

      isActive.value = true
      startAnalysis()
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('Failed to start audio stream:', err)
    }
    finally {
      isInitializing.value = false
    }
  }

  function startAnalysis() {
    const analyze = () => {
      const audioContext = getAudioContext()
      if (!audioContext || !analyser.value || !dataArray.value || !timeDataArray.value)
        return

      // Get frequency and time domain data
      analyser.value.getByteFrequencyData(dataArray.value)
      analyser.value.getFloatTimeDomainData(timeDataArray.value)

      // Calculate volume level
      let sum = 0
      for (let i = 0; i < dataArray.value.length; i++) {
        sum += dataArray.value[i] * dataArray.value[i]
      }
      const rms = Math.sqrt(sum / dataArray.value.length)
      const volumeLevel = Math.min(100, (rms / 255) * 100 * 3)

      // Create analysis data
      const analysisData: AudioAnalysisData = {
        volumeLevel,
        frequencyData: new Uint8Array(dataArray.value),
        timeDomainData: new Float32Array(timeDataArray.value),
        timestamp: getCurrentTime(),
      }

      // Notify analysis callbacks
      analysisCallbacks.forEach((callback) => {
        try {
          callback(analysisData)
        }
        catch (err) {
          console.error('Audio analysis callback error:', err)
        }
      })

      // Notify chunk callbacks with fresh audioContext reference
      chunkCallbacks.forEach((callback) => {
        try {
          callback(
            new Float32Array(timeDataArray.value),
            audioContext.sampleRate,
          )
        }
        catch (err) {
          console.error('Audio chunk callback error:', err)
        }
      })

      // Only continue if still active
      if (isActive.value) {
        requestAnimationFrame(analyze)
      }
    }

    analyze()
  }

  // Callback management
  function addAnalysisCallback(callback: AudioAnalysisCallback) {
    analysisCallbacks.add(callback)
    return () => analysisCallbacks.delete(callback)
  }

  function addChunkCallback(callback: AudioChunkCallback) {
    chunkCallbacks.add(callback)
    return () => chunkCallbacks.delete(callback)
  }

  function stop() {
    mediaStream.value?.getTracks().forEach(track => track.stop())
  }

  // Cleanup
  onUnmounted(() => {
    stop()
  })

  return {
    isActive,
    error,
    mediaStream,
    isInitializing,

    start,
    stop,

    addAnalysisCallback,
    addChunkCallback,
  }
}
