import type { MaybeRefOrGetter } from 'vue'

import { until } from '@vueuse/core'
import { ref, toRef } from 'vue'

export function useAudioRecorder(
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
    return new Promise<Blob>((resolve, reject) => {
      if (!audioRecorder.value) {
        return
      }

      audioRecorder.value.onerror = (event) => {
        console.error('Error recording audio:', event)
        reject(event)
      }
      audioRecorder.value.ondataavailable = (event) => {
        const audioBlob = event.data
        resolve(audioBlob)
      }

      audioRecorder.value.stop()
    })
  }

  return {
    startRecord,
    stopRecord,
  }
}
