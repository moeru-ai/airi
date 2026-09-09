import type { Cubism4InternalModel } from 'pixi-live2d-display/cubism4'

import type { SurfaceLighting } from '../filters/surface-lighting'
import type { NormalAttachment, NormalCapture } from './attachment'

import { defineEventa, defineInvokeEventa, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/broadcast-channel'
import { errorMessageFrom } from '@moeru/std'

import { fingerprintModel, readNormalAttachment, saveNormalAttachment, validateNormalBinding } from './attachment'

export interface NormalPipelineStatus {
  modelId: string
  fingerprint?: string
  phase: 'checking' | 'ready' | 'capturing' | 'generating' | 'saving' | 'error' | 'unloaded'
  binding: 'proxy' | 'generated'
  attachment?: NormalAttachment
  error?: string
}

export const normalStatus = defineInvokeEventa<NormalPipelineStatus>('live2d:normal:status')
export const normalChanged = defineEventa<NormalPipelineStatus>('live2d:normal:changed')
export const normalCapture = defineInvokeEventa<{ source: string, modelId: string, fingerprint: string }, { modelId: string, fingerprint: string, jobId: string }>('live2d:normal:capture')
export const normalCommit = defineInvokeEventa<NormalPipelineStatus, { jobId: string, capture: NormalCapture, normal: Blob, generator: NormalAttachment['generator'] }>('live2d:normal:commit')
export const normalImport = defineInvokeEventa<NormalPipelineStatus, { modelId: string, attachment: NormalAttachment }>('live2d:normal:import')
export const normalCancel = defineInvokeEventa<void, { jobId: string }>('live2d:normal:cancel')

/** Each caller owns its channel and must close it on scene/devtool teardown. */
export function openNormalChannel() {
  const channel = new BroadcastChannel('airi:live2d-normal-pipeline')
  const { context, dispose } = createContext(channel, { closeOnDispose: true })
  return { context, close: () => dispose() }
}

/**
 * The active model owns job leases, attachment lookup, and binding. The devtool
 * captures a separate rig and requests local inference; opening it never starts inference. Job IDs reject stale results
 * after model switches, cancellation, or a competing devtool's request.
 */
export function registerNormalPipeline(model: Cubism4InternalModel, lighting: SurfaceLighting, source: string, modelId: string) {
  const { context, close } = openNormalChannel()
  let disposed = false
  let pending: { jobId: string } | undefined
  let status: NormalPipelineStatus = { modelId, phase: 'checking', binding: lighting.profile }
  function publish(update: Partial<NormalPipelineStatus>) {
    status = { ...status, ...update }
    if (!disposed)
      context.emit(normalChanged, status)
  }
  const stops = [
    defineInvokeHandler(context, normalStatus, () => status),
    defineInvokeHandler(context, normalImport, async ({ modelId: target, attachment }) => {
      if (disposed || pending || status.phase === 'checking' || target !== modelId || attachment.fingerprint !== status.fingerprint)
        throw new Error('The lighting attachment does not belong to the active model, or a job is running.')
      // The lease excludes competing imports and generation until the atomic save
      // finishes. Model disposal invalidates live application, never retargets it.
      const job = { jobId: crypto.randomUUID() }
      pending = job
      try {
        publish({ phase: 'saving', error: undefined })
        validateNormalBinding(model, attachment)
        const images = await Promise.all([attachment.normal, attachment.ownership].map(blob => createImageBitmap(blob)))
        const valid = images.every(image => image.width === attachment.width && image.height === attachment.height)
        images.forEach(image => image.close())
        if (!valid)
          throw new Error('The normal images do not match their binding dimensions.')
        if (disposed || pending !== job)
          throw new Error('The model changed before the attachment was saved.')
        await saveNormalAttachment(attachment)
        if (disposed || pending !== job)
          throw new Error('The attachment was saved for the previous model; it was not bound to the new model.')
        await lighting.applyAttachment(attachment)
        publish({ attachment, phase: 'ready', binding: lighting.profile })
        return status
      }
      catch (error) {
        if (!disposed)
          publish({ phase: 'error', error: errorMessageFrom(error) ?? 'Could not import the lighting attachment.' })
        throw error
      }
      finally {
        if (pending === job)
          pending = undefined
      }
    }),
    defineInvokeHandler(context, normalCapture, async (request) => {
      if (pending || request.modelId !== modelId || !status.fingerprint || request.fingerprint !== status.fingerprint)
        throw new Error('The model changed or a normal generation job is already running.')
      pending = { jobId: request.jobId }
      publish({ phase: 'capturing', error: undefined })
      return { source, modelId, fingerprint: status.fingerprint }
    }),
    defineInvokeHandler(context, normalCancel, ({ jobId }) => {
      if (pending?.jobId !== jobId)
        return
      pending = undefined
      publish({ phase: 'ready' })
    }),
    defineInvokeHandler(context, normalCommit, async ({ jobId, capture, normal, generator }) => {
      const job = pending
      if (!job || job.jobId !== jobId || disposed || capture.fingerprint !== status.fingerprint)
        throw new Error('This normal result no longer belongs to the active generation job.')
      const attachment: NormalAttachment = { ...capture, schema: 1, space: 'x-right-y-up-z-viewer', createdAt: Date.now(), normal, generator }
      try {
        publish({ phase: 'saving' })
        validateNormalBinding(model, attachment)
        const image = await createImageBitmap(normal)
        const valid = image.width === attachment.width && image.height === attachment.height
        image.close()
        if (!valid)
          throw new Error('The generated normal image has the wrong dimensions.')
        if (disposed || pending !== job)
          throw new Error('The model changed before the attachment was saved.')
        await saveNormalAttachment(attachment)
        if (disposed || pending !== job)
          throw new Error('The attachment was saved for the previous model; it was not bound to the new model.')
        await lighting.applyAttachment(attachment)
        pending = undefined
        publish({ attachment, phase: 'ready', binding: lighting.profile, error: undefined })
        return status
      }
      catch (error) {
        if (!disposed && pending === job) {
          pending = undefined
          publish({ phase: 'error', error: errorMessageFrom(error) ?? 'Could not save or bind the normal map.' })
        }
        throw error
      }
    }),
  ]
  void (async () => {
    try {
      const fingerprint = await fingerprintModel(model)
      if (disposed)
        return
      publish({ fingerprint })
      const attachment = await readNormalAttachment(fingerprint)
      if (disposed)
        return
      if (attachment)
        await lighting.applyAttachment(attachment)
      if (!disposed)
        publish({ fingerprint, attachment, phase: 'ready', binding: lighting.profile })
    }
    catch (error) {
      publish({ phase: 'error', error: errorMessageFrom(error) ?? 'Could not load the normal attachment.' })
    }
  })()
  return () => {
    publish({ phase: 'unloaded' })
    disposed = true
    pending = undefined
    stops.forEach(stop => stop())
    close()
  }
}
