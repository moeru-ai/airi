import type { AudioStreamConfig } from '@proj-airi/audio/vue'
import type { MaybeRefOrGetter } from 'vue'

import { cleanupAudioContext, getAudioContext, getAudioContextState, isAudioContextReady } from '@proj-airi/audio/audio-context'
import { useAudioPlayback, useAudioStream } from '@proj-airi/audio/vue'
import { computed, readonly, shallowRef, toRef } from 'vue'

import { useVADAnalysis } from './analysis-vad'
import { useVolumeAnalysis } from './analysis-volume'
import { useWhisperTranscription } from './extract-whisper'

export interface AudioSource {
  id: string
  name: string
  deviceId: string
  type: 'microphone' | 'screen' | 'system'
  config: AudioStreamConfig
}

export function useAudioManager(locale: MaybeRefOrGetter<string> = 'en') {
  const audioContext = getAudioContext()

  const sources = shallowRef(new Map<string, AudioSource>())
  const activeStreams = shallowRef(new Map<string, ReturnType<typeof useAudioStream>>())
  const vadAnalyzers = shallowRef(new Map<string, ReturnType<typeof useVADAnalysis>>())
  const volumeAnalyzers = shallowRef(new Map<string, ReturnType<typeof useVolumeAnalysis>>())
  const playbackControllers = shallowRef(new Map<string, ReturnType<typeof useAudioPlayback>>())
  const whisperTranscribers = shallowRef(new Map<string, ReturnType<typeof useWhisperTranscription>>())

  const audioContextState = toRef(() => getAudioContextState())
  const localeRef = toRef(locale)

  function addSource(source: AudioSource) {
    sources.value.set(source.id, source)

    // Create composables
    const configRef = computed(() => sources.value.get(source.id)?.config)
    const stream = useAudioStream(configRef)
    const vadAnalyzer = useVADAnalysis()
    const volumeAnalyzer = useVolumeAnalysis()
    const whisperTranscriber = useWhisperTranscription({ modelSize: 'medium', temperature: 0.0 })

    whisperTranscriber.loadModel()

    // Store the composables FIRST
    activeStreams.value.set(source.id, stream)
    vadAnalyzers.value.set(source.id, vadAnalyzer)
    volumeAnalyzers.value.set(source.id, volumeAnalyzer)
    whisperTranscribers.value.set(source.id, whisperTranscriber)

    // NOW create the playback with the stream reference
    const streamRef = computed(() => activeStreams.value.get(source.id)?.mediaStream.value)
    const playback = useAudioPlayback(streamRef)
    playbackControllers.value.set(source.id, playback)

    // Connect analyzers
    stream.addChunkCallback(vadAnalyzer.audioChunkCallback)
    stream.addAnalysisCallback(volumeAnalyzer.audioAnalysisCallback)

    vadAnalyzer.onSegmentComplete((segment) => {
      whisperTranscriber.queueSegment(segment, localeRef.value)
    })

    return source.id
  }

  function removeSource(sourceId: string) {
    const stream = activeStreams.value.get(sourceId)
    if (stream) {
      stream.stop()
      activeStreams.value.delete(sourceId)
    }

    sources.value.delete(sourceId)
    vadAnalyzers.value.delete(sourceId)
    volumeAnalyzers.value.delete(sourceId)
    playbackControllers.value.delete(sourceId)
  }

  function getSourceData(sourceId: string) {
    return {
      source: sources.value.get(sourceId),
      stream: activeStreams.value.get(sourceId),
      vad: vadAnalyzers.value.get(sourceId),
      volume: volumeAnalyzers.value.get(sourceId),
      playback: playbackControllers.value.get(sourceId),
      whisper: whisperTranscribers.value.get(sourceId),
    }
  }

  async function startSource(sourceId: string) {
    const stream = activeStreams.value.get(sourceId)
    const vadAnalyzer = vadAnalyzers.value.get(sourceId)

    if (stream) {
      await stream.start()
    }

    if (vadAnalyzer) {
      vadAnalyzer.loadModel()
    }
  }

  async function stopSource(sourceId: string) {
    const stream = activeStreams.value.get(sourceId)
    if (stream) {
      await stream.stop()
    }
  }

  // Global audio context controls
  async function suspendGlobalAudio() {
    await audioContext?.suspend()
  }

  async function resumeGlobalAudio() {
    await audioContext?.resume()
  }

  async function cleanupGlobalAudio() {
    // Stop all sources first
    for (const sourceId of Object.keys(sources.value)) {
      await stopSource(sourceId)
    }

    // Cleanup global context
    await cleanupAudioContext()
  }

  // Convenience methods
  function addMicrophone(deviceId: string, name: string = 'Primary Microphone') {
    return addSource({
      id: `mic-${deviceId}`,
      name,
      deviceId,
      type: 'microphone',
      config: {
        deviceId,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
  }

  return {
    // State
    sources: readonly(sources.value),
    audioContextState: {
      isReady: isAudioContextReady,
      sampleRate: audioContext?.sampleRate ?? 0,
      error: audioContextState.value.error,
    },

    // Management
    addSource,
    removeSource,
    startSource,
    stopSource,
    getSourceData,

    // Global controls
    suspendGlobalAudio,
    resumeGlobalAudio,
    cleanupGlobalAudio,

    // Convenience
    addMicrophone,
  }
}
