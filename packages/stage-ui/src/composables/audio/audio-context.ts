import type { MaybeRefOrGetter } from 'vue'

import { until } from '@vueuse/core'
import { shallowRef, toRef } from 'vue'

export function useAudioContextFromStream(
  media: MaybeRefOrGetter<MediaStream | undefined>,
) {
  const mediaRef = toRef(media)
  const audioContext = shallowRef<AudioContext>()

  async function initialize() {
    await until(mediaRef).toBeTruthy()

    if (audioContext.value) {
      return audioContext.value
    }

    audioContext.value = new AudioContext()
    await audioContext.value.resume()

    return audioContext.value
  }

  function pause() {
    if (audioContext.value && audioContext.value.state === 'running') {
      audioContext.value.suspend()
    }
  }

  function resume() {
    if (audioContext.value && audioContext.value.state === 'suspended') {
      audioContext.value.resume()
    }
  }

  function dispose() {
    if (audioContext.value) {
      audioContext.value.close()
      audioContext.value = undefined
    }
  }

  return {
    audioContext,

    initialize,
    pause,
    resume,
    dispose,
  }
}
