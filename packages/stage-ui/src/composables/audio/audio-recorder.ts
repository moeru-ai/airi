import type { MaybeRefOrGetter } from 'vue'

import { until } from '@vueuse/core'
import { ref, shallowRef, toRef, watch } from 'vue'

export function useAudioRecorder(
  media: MaybeRefOrGetter<MediaStream | undefined>,
) {
  const audioRecorder = ref<MediaRecorder>()
  const mediaRef = toRef(media)
  const recordingChunk = shallowRef<Blob[]>([])
  const recording = shallowRef<Blob>()

  const onStopRecordHooks = ref<Array<(recording: Blob | undefined) => Promise<void>>>([])

  async function startRecord() {
    await until(mediaRef).toBeTruthy()
    if (!mediaRef.value) {
      return
    }

    recording.value = undefined
    recordingChunk.value = []

    audioRecorder.value = new MediaRecorder(mediaRef.value)
    // Whisper: problem with audio/mp4 blobs from Safari
    // https://community.openai.com/t/whisper-problem-with-audio-mp4-blobs-from-safari/322252
    audioRecorder.value.start(1000)

    audioRecorder.value.onerror = (event) => {
      console.error('Error recording audio:', event)
    }

    audioRecorder.value.onstop = () => {
      if (recordingChunk.value.length > 0) {
        const blob = new Blob(recordingChunk.value, { type: audioRecorder.value?.mimeType })
        recording.value = blob
      }
      else {
        recording.value = undefined
      }

      for (const hook of onStopRecordHooks.value) {
        hook(recording.value)
      }
    }

    audioRecorder.value.ondataavailable = (event) => {
      recordingChunk.value.push(event.data)
    }
  }

  function onStopRecord(callback: (recording: Blob | undefined) => Promise<void>) {
    onStopRecordHooks.value.push(callback)
  }

  async function stopRecord() {
    if (!audioRecorder.value) {
      return []
    }

    audioRecorder.value?.stop()
    return recordingChunk.value
  }

  watch(mediaRef, () => {
    if (audioRecorder.value && audioRecorder.value.state === 'recording') {
      audioRecorder.value.stop()
    }

    audioRecorder.value = undefined

    if (mediaRef.value && mediaRef.value.active) {
      startRecord()
    }
  })

  return {
    startRecord,
    stopRecord,
    onStopRecord,
    recordingChunk,
    recording,
  }
}
