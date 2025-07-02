import type { AudioChunkCallback } from '@proj-airi/audio/vue'

import { onUnmounted, readonly, ref, watch } from 'vue'

import { useTauriCore } from '../tauri'

export interface VADSegment {
  id: string
  audioData: Float32Array
  startTime: number
  endTime: number
  probability: number
  isComplete: boolean
}

export interface VADConfig {
  threshold: number
  silenceGapMs: number // How long silence before ending segment
  minSpeechDurationMs: number // Minimum speech duration to be valid
  maxSpeechDurationMs: number // Maximum speech duration before forced split
  overlapMs: number // Overlap between segments for better transcription
  bufferSizeMs: number // How much audio to keep in memory
}

export function useVADAnalysis(config: Partial<VADConfig> = {}) {
  const { invoke } = useTauriCore()

  const isModelLoaded = ref(false)
  const isLoading = ref(false)
  const error = ref('')
  const isEnabled = ref(true)

  const probability = ref(0)
  const history = ref<number[]>([])
  const maxHistory = 50

  // Configuration with defaults
  const vadConfig = ref<VADConfig>({
    threshold: 0.5,
    silenceGapMs: 500, // 500ms of silence to end segment
    minSpeechDurationMs: 300, // Minimum 300ms speech
    maxSpeechDurationMs: 30000, // Max 30s per segment
    overlapMs: 200, // 200ms overlap
    bufferSizeMs: 60000, // Keep 60s of audio in memory
    ...config,
  })

  // Audio buffering
  const audioBuffer = ref<Float32Array>(new Float32Array(0))
  const chunkSize = 512
  const targetSampleRate = 16000
  let processingInterval: number | null = null

  // Segment management
  const currentSegment = ref<VADSegment | null>(null)
  const completedSegments = ref<VADSegment[]>([])
  const maxCompletedSegments = 10 // Keep last 10 completed segments

  // State tracking
  const isSpeaking = ref(false)
  const lastSpeechTime = ref(0)
  const lastSilenceTime = ref(0)
  const segmentStartTime = ref(0)
  const segmentAudioBuffer = ref<Float32Array>(new Float32Array(0))

  // Callbacks for segment events
  const segmentCallbacks = new Set<(segment: VADSegment) => void>()

  async function loadModel() {
    if (isModelLoaded.value || isLoading.value)
      return

    isLoading.value = true
    error.value = ''

    try {
      await invoke('plugin:proj-airi-tauri-plugin-audio-vad|load_model_silero_vad')
      isModelLoaded.value = true
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('Failed to load VAD model:', err)
    }
    finally {
      isLoading.value = false
    }
  }

  function resampleIfNeeded(chunk: Float32Array, sourceSampleRate: number): Float32Array {
    if (sourceSampleRate === targetSampleRate) {
      return chunk
    }

    const ratio = targetSampleRate / sourceSampleRate
    const outputLength = Math.floor(chunk.length * ratio)
    const resampled = new Float32Array(outputLength)

    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i / ratio
      const index = Math.floor(sourceIndex)
      const fraction = sourceIndex - index

      if (index + 1 < chunk.length) {
        resampled[i] = chunk[index] * (1 - fraction) + chunk[index + 1] * fraction
      }
      else {
        resampled[i] = chunk[index] || 0
      }
    }

    return resampled
  }

  async function processChunk(chunk: Float32Array) {
    if (!isModelLoaded.value || chunk.length !== chunkSize)
      return

    try {
      const chunkArray = Array.from(chunk)
      const prob = await invoke('plugin:proj-airi-tauri-plugin-audio-vad|audio_vad', {
        chunk: chunkArray,
      })

      if (typeof prob === 'number') {
        const now = performance.now()
        probability.value = prob

        // Update history
        history.value.push(prob)
        if (history.value.length > maxHistory) {
          history.value.shift()
        }

        // Process speech detection with hysteresis
        const wasSpeaking = isSpeaking.value
        const currentlySpeaking = prob > vadConfig.value.threshold

        if (currentlySpeaking) {
          lastSpeechTime.value = now
        }
        else {
          lastSilenceTime.value = now
        }

        // Handle speech state transitions
        if (!wasSpeaking && currentlySpeaking) {
          // Start of speech
          startSpeechSegment(now, chunk)
          isSpeaking.value = true
        }
        else if (wasSpeaking && !currentlySpeaking) {
          // Potential end of speech - wait for silence gap
          const silenceDuration = now - lastSpeechTime.value
          if (silenceDuration >= vadConfig.value.silenceGapMs) {
            await endSpeechSegment(now)
            isSpeaking.value = false
          }
        }
        else if (wasSpeaking && currentlySpeaking) {
          // Continuing speech - add to current segment
          addToCurrentSegment(chunk)

          // Check for max duration
          const segmentDuration = now - segmentStartTime.value
          if (segmentDuration >= vadConfig.value.maxSpeechDurationMs) {
            await endSpeechSegment(now, true) // Force end
            startSpeechSegment(now, chunk) // Start new segment
          }
        }

        // Always add audio to segment buffer when speaking or recently speaking
        const timeSinceLastSpeech = now - lastSpeechTime.value
        if (timeSinceLastSpeech <= vadConfig.value.silenceGapMs + vadConfig.value.overlapMs) {
          addToCurrentSegment(chunk)
        }
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('VAD processing error:', err)
    }
  }

  function startSpeechSegment(timestamp: number, initialChunk: Float32Array) {
    segmentStartTime.value = timestamp

    // Include some pre-speech audio for context (overlap)
    const overlapSamples = Math.floor((vadConfig.value.overlapMs / 1000) * targetSampleRate)
    const totalBufferLength = audioBuffer.value.length
    const startIndex = Math.max(0, totalBufferLength - overlapSamples)

    const preAudio = audioBuffer.value.slice(startIndex)
    segmentAudioBuffer.value = new Float32Array(preAudio.length + initialChunk.length)
    segmentAudioBuffer.value.set(preAudio, 0)
    segmentAudioBuffer.value.set(initialChunk, preAudio.length)

    currentSegment.value = {
      id: `segment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      audioData: new Float32Array(0), // Will be set when segment ends
      startTime: timestamp,
      endTime: 0,
      probability: probability.value,
      isComplete: false,
    }
  }

  function addToCurrentSegment(chunk: Float32Array) {
    if (!currentSegment.value)
      return

    // Append to segment buffer
    const oldBuffer = segmentAudioBuffer.value
    const newBuffer = new Float32Array(oldBuffer.length + chunk.length)
    newBuffer.set(oldBuffer, 0)
    newBuffer.set(chunk, oldBuffer.length)
    segmentAudioBuffer.value = newBuffer
  }

  async function endSpeechSegment(timestamp: number, forced = false) {
    if (!currentSegment.value)
      return

    const segmentDuration = timestamp - segmentStartTime.value

    // Check minimum duration requirement
    if (!forced && segmentDuration < vadConfig.value.minSpeechDurationMs) {
      // Too short, discard
      currentSegment.value = null
      segmentAudioBuffer.value = new Float32Array(0)
      return
    }

    // Add some post-speech audio for context
    const overlapSamples = Math.floor((vadConfig.value.overlapMs / 1000) * targetSampleRate)
    const postAudioLength = Math.min(overlapSamples, audioBuffer.value.length)
    const postAudio = audioBuffer.value.slice(-postAudioLength)

    // Final segment audio
    const finalAudioBuffer = new Float32Array(segmentAudioBuffer.value.length + postAudio.length)
    finalAudioBuffer.set(segmentAudioBuffer.value, 0)
    finalAudioBuffer.set(postAudio, segmentAudioBuffer.value.length)

    // Complete the segment
    const completedSegment: VADSegment = {
      ...currentSegment.value,
      audioData: finalAudioBuffer,
      endTime: timestamp,
      isComplete: true,
    }

    // Add to completed segments
    completedSegments.value.push(completedSegment)
    if (completedSegments.value.length > maxCompletedSegments) {
      completedSegments.value.shift()
    }

    // Notify callbacks
    segmentCallbacks.forEach((callback) => {
      try {
        callback(completedSegment)
      }
      catch (err) {
        console.error('Segment callback error:', err)
      }
    })

    // Reset for next segment
    currentSegment.value = null
    segmentAudioBuffer.value = new Float32Array(0)
  }

  function startProcessing() {
    if (processingInterval)
      return

    const intervalMs = (chunkSize / targetSampleRate) * 1000

    processingInterval = window.setInterval(async () => {
      if (audioBuffer.value.length >= chunkSize) {
        const chunk = audioBuffer.value.slice(0, chunkSize)
        await processChunk(chunk)

        const remaining = audioBuffer.value.slice(chunkSize)
        audioBuffer.value = remaining.length > 0 ? remaining : new Float32Array(0)
      }
    }, Math.max(1, intervalMs / 2))
  }

  function stopProcessing() {
    if (processingInterval) {
      clearInterval(processingInterval)
      processingInterval = null
    }

    // End current segment if active
    if (currentSegment.value) {
      endSpeechSegment(performance.now(), true)
    }

    audioBuffer.value = new Float32Array(0)
    probability.value = 0
    history.value = []
  }

  // Audio chunk callback
  const audioChunkCallback: AudioChunkCallback = (chunk: Float32Array, sampleRate: number) => {
    if (!isEnabled.value || !isModelLoaded.value)
      return

    const processedChunk = resampleIfNeeded(chunk, sampleRate)

    // Add to main buffer
    const currentBuffer = audioBuffer.value
    const newBuffer = new Float32Array(currentBuffer.length + processedChunk.length)
    newBuffer.set(currentBuffer, 0)
    newBuffer.set(processedChunk, currentBuffer.length)

    // Trim buffer to max size
    const maxBufferSamples = (vadConfig.value.bufferSizeMs / 1000) * targetSampleRate
    if (newBuffer.length > maxBufferSamples) {
      const trimAmount = newBuffer.length - maxBufferSamples
      audioBuffer.value = newBuffer.slice(trimAmount)
    }
    else {
      audioBuffer.value = newBuffer
    }
  }

  // Segment callback management
  function onSegmentComplete(callback: (segment: VADSegment) => void) {
    segmentCallbacks.add(callback)
    return () => segmentCallbacks.delete(callback)
  }

  // Manual segment control
  async function forceEndCurrentSegment() {
    if (currentSegment.value) {
      await endSpeechSegment(performance.now(), true)
      isSpeaking.value = false
    }
  }

  function clearCompletedSegments() {
    completedSegments.value = []
  }

  // Get segment by ID
  function getSegment(id: string): VADSegment | undefined {
    return completedSegments.value.find(s => s.id === id)
  }

  // Auto-start processing when enabled and model is loaded
  watch([isEnabled, isModelLoaded], ([enabled, loaded]) => {
    if (enabled && loaded) {
      startProcessing()
    }
    else {
      stopProcessing()
    }
  })

  onUnmounted(() => {
    stopProcessing()
  })

  return {
    // State
    isModelLoaded: readonly(isModelLoaded),
    isLoading: readonly(isLoading),
    error: readonly(error),
    isEnabled,

    // VAD data
    probability: readonly(probability),
    history: readonly(history),
    isSpeaking: readonly(isSpeaking),

    // Configuration
    config: vadConfig,

    // Segments
    currentSegment: readonly(currentSegment),
    completedSegments: readonly(completedSegments),

    // Controls
    loadModel,
    forceEndCurrentSegment,
    clearCompletedSegments,
    getSegment,

    // Events
    onSegmentComplete,

    // For audio stream integration
    audioChunkCallback,
  }
}
