import type { SherpawModel } from '@proj-airi/provider-inference'
import type { ProbeResult, ProbeSettings } from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'

import type { ProbeDecoders } from './use-probe-decoders'

import { errorMessageFrom } from '@moeru/std'
import { probeClip } from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'
import { onScopeDispose, ref, shallowRef } from 'vue'

/** Settings of one probe run, with the decoders that run it. */
export interface ProbeRunSettings extends ProbeSettings {
  readonly model: SherpawModel
  /** Decoder Workers that run at the same time. Each one holds its own copy of the model. */
  readonly workers: number
}

/**
 * Runs the Monte Carlo probe on one clip and keeps the last finished result.
 *
 * Starting a run stops the previous one. Its decodes that still wait are dropped, and its running
 * decodes finish in their Workers without effect.
 */
export function useUncertaintyProbe(decoders: ProbeDecoders) {
  const status = ref<'idle' | 'loading' | 'decoding' | 'done' | 'error'>('idle')
  const progress = ref({ done: 0, total: 0 })
  const error = ref<string>()
  const result = shallowRef<ProbeResult>()

  let controller: AbortController | undefined

  async function run(clip: Float32Array, settings: ProbeRunSettings) {
    controller?.abort()
    const current = new AbortController()
    controller = current
    progress.value = { done: 0, total: 0 }
    error.value = undefined
    status.value = 'loading'

    try {
      const pool = await decoders.poolFor(settings.model, settings.workers)
      current.signal.throwIfAborted()
      status.value = 'decoding'
      const probed = await probeClip(pool, clip, settings, {
        signal: current.signal,
        onProgress: (done, total) => {
          if (controller === current)
            progress.value = { done, total }
        },
      })
      if (controller !== current)
        return
      result.value = probed
      status.value = 'done'
    }
    catch (cause) {
      if (current.signal.aborted)
        return
      error.value = errorMessageFrom(cause) ?? 'The probe failed.'
      status.value = 'error'
    }
  }

  function cancel() {
    controller?.abort()
    controller = undefined
    status.value = result.value ? 'done' : 'idle'
  }

  onScopeDispose(() => controller?.abort())

  return { status, progress, error, result, run, cancel }
}
