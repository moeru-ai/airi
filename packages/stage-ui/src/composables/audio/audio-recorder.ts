import type { MaybeRefOrGetter } from 'vue'

import { toWav } from '@proj-airi/audio/encoding'
import { until } from '@vueuse/core'
import { ref, shallowRef, toRef, watch } from 'vue'

export function useAudioRecorder(
  media: MaybeRefOrGetter<MediaStream | undefined>,
) {
  const mediaRef = toRef(media)
  const recording = shallowRef<Blob>()
  const isRecording = ref(false)

  // Audio processing variables
  const audioContext = ref<AudioContext>()
  const sourceNode = ref<MediaStreamAudioSourceNode>()
  const processorNode = ref<ScriptProcessorNode>() // Using ScriptProcessorNode for wider compatibility
  const audioData = ref<Float32Array<ArrayBufferLike>[]>([])

  const onStopRecordHooks = ref<Array<(recording: Blob | undefined) => Promise<void>>>([])

  function onStopRecord(callback: (recording: Blob | undefined) => Promise<void>) {
    onStopRecordHooks.value.push(callback)
  }

  // Convert audio buffer to WAV format
  function encodeWAV(samples: Float32Array[], sampleRate: number): Blob {
    const view = toWav(samples[0].buffer, sampleRate)
    return new Blob([view], { type: 'audio/wav' })
  }

  async function startRecord() {
    await until(mediaRef).toBeTruthy()
    if (!mediaRef.value) {
      return
    }

    // Reset recording state
    recording.value = undefined
    audioData.value = []
    isRecording.value = true

    try {
      // Create audio context and nodes
      audioContext.value = new AudioContext()
      sourceNode.value = audioContext.value.createMediaStreamSource(mediaRef.value)

      // Create script processor for audio processing
      processorNode.value = audioContext.value.createScriptProcessor(4096, 1, 1)

      // Process audio data
      processorNode.value.onaudioprocess = (e) => {
        if (isRecording.value) {
          const channelData = new Float32Array(e.inputBuffer.getChannelData(0))
          audioData.value.push(channelData)
        }
      }

      // Connect nodes
      sourceNode.value.connect(processorNode.value)
      processorNode.value.connect(audioContext.value.destination)
    }
    catch (error) {
      console.error('Error starting audio recording:', error)
      isRecording.value = false
    }
  }

  async function stopRecord() {
    if (!isRecording.value || !audioContext.value) {
      return
    }

    isRecording.value = false

    try {
      // Disconnect and clean up audio nodes
      if (processorNode.value) {
        processorNode.value.disconnect()
        processorNode.value = undefined
      }

      if (sourceNode.value) {
        sourceNode.value.disconnect()
        sourceNode.value = undefined
      }

      // Create WAV from recorded data
      if (audioData.value.length > 0) {
        recording.value = encodeWAV(audioData.value, audioContext.value.sampleRate)

        // Call hooks with the recording
        for (const hook of onStopRecordHooks.value) {
          await hook(recording.value)
        }
      }
      else {
        recording.value = undefined
      }

      // Close audio context
      await audioContext.value.close()
      audioContext.value = undefined
    }
    catch (error) {
      console.error('Error stopping audio recording:', error)
    }

    return audioData.value
  }

  watch(mediaRef, () => {
    if (isRecording.value) {
      stopRecord().then(() => {
        if (mediaRef.value && mediaRef.value.active) {
          startRecord()
        }
      })
    }
  })

  return {
    startRecord,
    stopRecord,
    onStopRecord,
    recording,
    isRecording,
  }
}
