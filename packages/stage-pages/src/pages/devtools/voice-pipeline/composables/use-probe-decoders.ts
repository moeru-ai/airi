import type { SherpawModel } from '@proj-airi/provider-inference'

import { DecoderPool, fetchDecoderModel } from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'
import { onScopeDispose } from 'vue'

export type ProbeDecoders = ReturnType<typeof useProbeDecoders>

/**
 * Keeps one decoder pool for the page. Clip runs and live runs use the same Workers, and the Workers
 * keep the model loaded between runs.
 *
 * A pool stays alive while the model and the size stay the same. A change terminates the old Workers,
 * and their pending decodes never settle, so change them only between runs. A pool that fails to start
 * is not kept, so the next run tries again. Scope disposal terminates the Workers.
 */
export function useProbeDecoders() {
  let current: { key: string, pool: Promise<DecoderPool> } | undefined

  function poolFor(model: SherpawModel, size: number): Promise<DecoderPool> {
    const key = `${model.id}:${size}`
    if (current?.key !== key) {
      void current?.pool.then(pool => pool.dispose(), () => {})
      const created = { key, pool: fetchDecoderModel(model).then(decoderModel => DecoderPool.create(decoderModel, size)) }
      current = created
      created.pool.catch(() => {
        if (current === created)
          current = undefined
      })
    }
    return current.pool
  }

  onScopeDispose(() => {
    void current?.pool.then(pool => pool.dispose(), () => {})
    current = undefined
  })

  return { poolFor }
}
