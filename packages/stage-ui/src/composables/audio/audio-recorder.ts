import type { MaybeRefOrGetter } from 'vue'

import { until } from '@vueuse/core'
import { ref, shallowRef, toRef, watch } from 'vue'

export function useDownload(url: string, fileName: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function useAudioRecorder(
  media: MaybeRefOrGetter<MediaStream | undefined>,
) {
  const audioRecorder = ref<MediaRecorder>()
  const mediaRef = toRef(media)
  const recordingChunk = shallowRef<Blob[]>([])
  const recording = ref<Blob>()

  const onStopHooks = ref<Array<(recording: Blob | undefined) => Promise<void>>>([])

  async function startRecord() {
    await until(mediaRef).toBeTruthy()
    if (!mediaRef.value) {
      return
    }

    recording.value = undefined
    recordingChunk.value = []

    audioRecorder.value = new MediaRecorder(mediaRef.value)
    audioRecorder.value.start()

    audioRecorder.value.onerror = (event) => {
      console.error('Error recording audio:', event)
    }

    audioRecorder.value.onstop = () => {
      if (recordingChunk.value.length > 0) {
        const blob = new Blob(recordingChunk.value, { type: audioRecorder.value?.mimeType })
        recording.value = blob

        if (blob.size > 0) {
          useDownload(URL.createObjectURL(blob), `recording-${Date.now()}.webm`)
        }
      }
      else {
        recording.value = undefined
      }

      for (const hook of onStopHooks.value) {
        hook(recording.value)
      }
    }

    audioRecorder.value.ondataavailable = (event) => {
      recordingChunk.value.push(event.data)
    }
  }

  function onStop(callback: (recording: Blob | undefined) => Promise<void>) {
    onStopHooks.value.push(callback)
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
    onStop,
    recordingChunk,
    recording,
  }
}
