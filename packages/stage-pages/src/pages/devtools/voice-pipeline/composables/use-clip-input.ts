import { errorMessageFrom } from '@moeru/std'
import { fileSource, Pcm16Encoder, toFloat32FromPCM16 } from '@proj-airi/audio/encoding'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'

import { microphoneChunks } from './audio-chunks'

function concat(parts: readonly Float32Array[]) {
  const output = new Float32Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

/**
 * Holds one clip as mono samples at `sampleRate`, from a selected file or a microphone recording.
 *
 * A new file selection aborts the read of the previous one, so an older file cannot replace a newer one.
 * The recording has no echo cancellation, noise suppression, or gain control, so the probe sees the raw input.
 * Scope disposal stops a recording that is still open.
 */
export function useClipInput(sampleRate: number) {
  const clip = shallowRef<Float32Array<ArrayBuffer>>()
  const error = ref<string>()
  const files = ref<File[]>()
  const recording = shallowRef<AbortController>()

  let fileRead: AbortController | undefined

  watch(files, async (selected) => {
    const file = selected?.[0]
    if (!file)
      return
    fileRead?.abort()
    const controller = new AbortController()
    fileRead = controller
    const { signal } = controller
    error.value = undefined
    try {
      const reader = new Pcm16Encoder(fileSource(file).open(signal), { sampleRate, signal }).stream.getReader()
      const parts: Float32Array[] = []
      for (;;) {
        const { done, value } = await reader.read()
        if (done)
          break
        parts.push(toFloat32FromPCM16(value))
      }
      if (!signal.aborted)
        clip.value = concat(parts)
    }
    catch (cause) {
      if (!signal.aborted)
        error.value = errorMessageFrom(cause) ?? 'Could not read the file.'
    }
  })

  async function record() {
    error.value = undefined
    const controller = new AbortController()
    recording.value = controller
    try {
      const parts: Float32Array[] = []
      for await (const part of microphoneChunks(sampleRate, controller.signal))
        parts.push(part)
      clip.value = concat(parts)
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Could not record from the microphone.'
    }
    finally {
      recording.value = undefined
    }
  }

  onScopeDispose(() => recording.value?.abort())

  return { clip, error, files, recording, record, stop: () => recording.value?.abort() }
}
