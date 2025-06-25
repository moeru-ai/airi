import type { RealTimeVADOptions } from '@ricky0123/vad-web'
import type { MaybeRef } from '@vueuse/shared'

import { merge } from '@moeru/std'
import { getDefaultRealTimeVADOptions, MicVAD } from '@ricky0123/vad-web'
import { usePermission } from '@vueuse/core'
import { tryOnMounted } from '@vueuse/shared'
import { onUnmounted, ref, toRef, unref, watch } from 'vue'

export function useMicVAD(deviceId: MaybeRef<ConstrainDOMString | undefined>, options: Partial<RealTimeVADOptions> & { auto?: boolean } = {}) {
  const opts = merge<Omit<RealTimeVADOptions, 'stream'> & { auto?: boolean }, Partial<RealTimeVADOptions> & { auto?: boolean }>({
    ...getDefaultRealTimeVADOptions('v5'),
    preSpeechPadFrames: 30,
    positiveSpeechThreshold: 0.5, // default is 0.5
    negativeSpeechThreshold: 0.5 - 0.15, // default is 0.5 - 0.15
    minSpeechFrames: 30, // default is 9
    auto: true,
  }, options)

  const micVad = ref<MicVAD>()
  const microphoneAccess = usePermission('microphone')

  async function update() {
    if (micVad.value) {
      micVad.value.destroy()
      micVad.value = undefined
      console.warn('existing MicVAD destroyed')
    }
    if (!microphoneAccess.value)
      return

    const id = unref(deviceId)
    if (!id)
      return

    const media = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: id } })

    // Use of MicVAD is inspired by Open-LLM-VTuber
    // Source code reference: https://github.com/t41372/Open-LLM-VTuber/blob/92cbf4349b84a68b0035bc825bc3d1d61fd0f063/static/index.html#L119
    micVad.value = await MicVAD.new({
      ...opts,
      stream: media,
    })

    if (opts.auto)
      micVad.value.start()
  }

  watch(microphoneAccess, update, { immediate: true })
  watch(toRef(deviceId), update, { immediate: true })
  tryOnMounted(update)
  onUnmounted(() => {
    if (micVad.value) {
      micVad.value.destroy()
      micVad.value = undefined
    }
  })

  return {
    destroy: () => {
      if (micVad.value) {
        micVad.value.destroy()
        micVad.value = undefined
      }
    },
    start: () => {
      if (micVad.value) {
        micVad.value.start()
      }
    },
  }
}
