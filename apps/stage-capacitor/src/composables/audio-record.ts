import type { MaybeRefOrGetter } from 'vue'

import { until } from '@vueuse/core'
import { ref, toRef } from 'vue'

export function useAudioRecord(
  media: MaybeRefOrGetter<MediaStream | undefined>,
  start: () => Promise<void> = () => Promise.resolve(),
) {
  const audioRecorder = ref<MediaRecorder>()
  const mediaRef = toRef(media)

  async function startRecord() {
    await start()
    await until(mediaRef).toBeTruthy()

    if (!mediaRef.value) {
      console.error('No media media available')
      return
    }

    audioRecorder.value = new MediaRecorder(mediaRef.value)
    audioRecorder.value.start()
  }

  function stopRecord() {
    if (audioRecorder.value) {
      audioRecorder.value.stop()
      audioRecorder.value.ondataavailable = (event) => {
        const audioBlob = event.data
        const audioUrl = URL.createObjectURL(audioBlob)
        const audioElement = new Audio(audioUrl)
        audioElement.play()
      }
    }
  }

  return {
    startRecord,
    stopRecord,
  }
}
