import type { NormalCapture } from '@proj-airi/stage-ui-live2d/lighting/attachment'
import type { NormalPipelineStatus } from '@proj-airi/stage-ui-live2d/lighting/channel'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { captureNormalReference } from '@proj-airi/stage-ui-live2d/lighting/capture'
import { normalCancel, normalCapture, normalChanged, normalCommit, normalStatus, openNormalChannel } from '@proj-airi/stage-ui-live2d/lighting/channel'
import { useObjectUrl } from '@vueuse/core'
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'

import { normalInference, normalInferenceStatus } from '../../shared/live2d-normal-generation'

/** Owns one devtool's explicit job. Closing it aborts inference and releases the model's job lease. */
export function useNormalGeneration() {
  const { context, close } = openNormalChannel()
  const status = shallowRef<NormalPipelineStatus>()
  const runtime = shallowRef<{ available: boolean, reason?: string }>()
  const error = shallowRef<string>()
  const phase = shallowRef<'idle' | 'capturing' | 'generating' | 'saving'>('idle')
  const requestCapture = defineInvoke(context, normalCapture)
  const capture = shallowRef<NormalCapture>()
  const generated = shallowRef<Blob>()
  const infer = useElectronEventaInvoke(normalInference)
  const checkRuntime = useElectronEventaInvoke(normalInferenceStatus)
  const requestStatus = defineInvoke(context, normalStatus)
  const requestCommit = defineInvoke(context, normalCommit)
  const cancelJob = defineInvoke(context, normalCancel)
  let controller: AbortController | undefined
  let jobId: string | undefined
  let disposed = false
  const stop = context.on(normalChanged, ({ body }) => {
    if (status.value?.fingerprint !== body.fingerprint) {
      capture.value = undefined
      generated.value = undefined
    }
    status.value = body
  })
  async function refresh() {
    error.value = undefined
    try {
      const [current, available] = await Promise.all([
        requestStatus(undefined, { signal: AbortSignal.timeout(5000) }),
        checkRuntime(undefined, { signal: AbortSignal.timeout(5000) }),
      ])
      if (!disposed) {
        status.value = current
        runtime.value = available
      }
    }
    catch (cause) {
      if (!disposed)
        error.value = errorMessageFrom(cause) ?? 'Could not contact the active Live2D model.'
    }
  }
  async function generate() {
    const current = status.value
    if (!current?.fingerprint || controller)
      return
    controller = new AbortController()
    jobId = crypto.randomUUID()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(240_000)])
    error.value = undefined
    capture.value = undefined
    generated.value = undefined
    try {
      phase.value = 'capturing'
      const source = await requestCapture({ modelId: current.modelId, fingerprint: current.fingerprint, jobId }, { signal })
      const reference = await captureNormalReference(source.source, source.modelId, source.fingerprint)
      signal.throwIfAborted()
      capture.value = reference
      phase.value = 'generating'
      const png = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(reference.neutral)
      })
      const result = await infer({ png }, { signal })
      const normal = await (await fetch(`data:image/png;base64,${result.png}`)).blob()
      generated.value = normal
      phase.value = 'saving'
      const { png: _png, ...generator } = result
      const saved = await requestCommit({ jobId, capture: reference, normal, generator }, { signal })
      if (!disposed)
        status.value = saved
    }
    catch (cause) {
      if (!disposed && !controller.signal.aborted)
        error.value = errorMessageFrom(cause) ?? 'Normal generation failed.'
      await cancelJob({ jobId }, { signal: AbortSignal.timeout(2000) }).catch(() => { /* The previous model can already be gone. */ })
    }
    finally {
      controller = undefined
      jobId = undefined
      phase.value = 'idle'
    }
  }
  onMounted(refresh)
  onUnmounted(() => {
    disposed = true
    controller?.abort()
    if (jobId)
      void cancelJob({ jobId }, { signal: AbortSignal.timeout(1000) }).catch(() => {})
    stop()
    close()
  })
  const busy = computed(() => phase.value !== 'idle' || ['capturing', 'generating', 'saving', 'checking'].includes(status.value?.phase ?? ''))
  const neutralUrl = useObjectUrl(computed(() => capture.value?.neutral ?? status.value?.attachment?.neutral))
  const normalUrl = useObjectUrl(computed(() => generated.value ?? status.value?.attachment?.normal))
  const coverageUrl = useObjectUrl(computed(() => capture.value?.coverage ?? status.value?.attachment?.coverage))
  return { status, runtime, error, phase, busy, neutralUrl, normalUrl, coverageUrl, refresh, generate, cancel: () => controller?.abort() }
}
