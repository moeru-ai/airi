import type { RealTimeVADOptions } from '@ricky0123/vad-web'
import { getDefaultRealTimeVADOptions, MicVAD } from '@ricky0123/vad-web'
import { usePermission } from '@vueuse/core'
import { tryOnMounted } from '@vueuse/shared'
import { defu } from 'defu'

export function useMicVAD(deviceId: MaybeRef<ConstrainDOMString | undefined>, options?: Partial<RealTimeVADOptions> & { auto?: boolean }) {
  const opts = defu<Partial<RealTimeVADOptions> & { auto?: boolean }, Array<Omit<RealTimeVADOptions, 'stream'> & { auto?: boolean }>>(options ?? {}, {
    ...getDefaultRealTimeVADOptions('v5'),
    preSpeechPadFrames: 20,
    positiveSpeechThreshold: 0.5, // default is 0.5
    negativeSpeechThreshold: 0.5 - 0.15, // default is 0.5 - 0.15
    minSpeechFrames: 15, // default is 9
    // WORKAROUND: temporary workaround for onnxruntime-web, since @ricky0123/vad-web
    // uses hardcoded version of onnxruntime-web@1.14.0 to fetch the already non-existing
    // ort-wasm-simd-threaded.mjs file and its WASM binary, we are going to force
    // the onnxruntime-web to use the latest version of onnxruntime-web from jsdelivr
    // to fetch the correct ort-wasm-simd-threaded.wasm binary
    onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/',
    auto: true,
  })

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
