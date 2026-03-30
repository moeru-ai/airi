import type { Env } from '../libs/env'
import type { NsfwMediaService } from './nsfw-media'
import type { NsfwImageEvent } from './nsfw-image-events'

import { useLogger } from '@guiiai/logg'

const logger = useLogger('nsfw-image-consumer').useGlobalConfig()

interface ComfyUiPromptSubmission {
  prompt_id?: string
  number?: number
  node_errors?: Record<string, unknown>
}

interface ComfyUiHistoryResponse {
  [promptId: string]: {
    outputs?: Record<string, {
      images?: Array<{
        filename: string
        subfolder?: string
        type?: string
      }>
    }>
    status?: {
      status_str?: string
      completed?: boolean
      messages?: unknown[]
    }
  }
}

class JobStillRunningError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JobStillRunningError'
  }
}

export function createNsfwImageConsumerHandler(mediaService: NsfwMediaService, env: Env) {
  async function fetchComfyHistory(promptId: string) {
    const response = await fetch(new URL(`/history/${promptId}`, env.COMFYUI_BASE_URL))
    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new Error(`ComfyUI history lookup failed with status ${response.status}`)
    }

    const history = await response.json() as ComfyUiHistoryResponse
    return history[promptId] ?? null
  }

  function pickFirstImageFilename(historyEntry: NonNullable<Awaited<ReturnType<typeof fetchComfyHistory>>>) {
    const outputs = historyEntry.outputs ?? {}
    for (const output of Object.values(outputs)) {
      const image = output.images?.[0]
      if (image?.filename) {
        return image.subfolder
          ? `${image.subfolder}/${image.filename}`
          : image.filename
      }
    }

    return null
  }

  function extractWorkflow(params: Record<string, unknown>) {
    const workflow = params.workflow
    return workflow && typeof workflow === 'object' ? workflow as Record<string, unknown> : null
  }

  function getComfyMeta(params: Record<string, unknown>) {
    const comfy = params.comfy
    if (!comfy || typeof comfy !== 'object') {
      return {}
    }

    return comfy as Record<string, unknown>
  }

  return {
    async handleMessage(event: NsfwImageEvent) {
      const jobId = event.payload.jobId
      const job = await mediaService.getImageJob(jobId)
      if (!job) {
        logger.withFields({ jobId }).warn('Skipping NSFW image event because the job no longer exists')
        return
      }

      if (job.status === 'done' || job.status === 'failed') {
        return
      }

      const comfyMeta = getComfyMeta(job.params)
      const promptId = typeof comfyMeta.promptId === 'string' ? comfyMeta.promptId : job.id
      const clientId = typeof comfyMeta.clientId === 'string' ? comfyMeta.clientId : `airi-${job.userId}`

      if (job.status === 'running' || job.status === 'submitting') {
        const history = await fetchComfyHistory(promptId)
        if (!history) {
          throw new JobStillRunningError(`ComfyUI job ${promptId} has not produced history yet`)
        }

        const mediaId = pickFirstImageFilename(history)
        await mediaService.updateImageJobStatus(jobId, 'done', {
          resultMediaId: mediaId ?? job.resultMediaId,
          errorMessage: null,
          params: {
            ...job.params,
            comfy: {
              ...comfyMeta,
              promptId,
              clientId,
              completedAt: new Date().toISOString(),
            },
          },
        })

        await mediaService.updateGalleryItemByImageJobId(jobId, {
          mediaId: mediaId ?? undefined,
          title: job.sceneType ? `${job.sceneType} scene` : undefined,
        })
        return
      }

      const workflow = extractWorkflow(job.params)
      if (!workflow) {
        await mediaService.updateImageJobStatus(jobId, 'failed', {
          errorMessage: 'No ComfyUI API workflow was attached to this job. Add params.workflow before enqueueing execution.',
        })
        return
      }

      await mediaService.updateImageJobStatus(jobId, 'submitting', {
        errorMessage: null,
        params: {
          ...job.params,
          comfy: {
            ...comfyMeta,
            promptId,
            clientId,
            submittedAt: new Date().toISOString(),
          },
        },
      })

      const submitResponse = await fetch(new URL('/prompt', env.COMFYUI_BASE_URL), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: workflow,
          prompt_id: promptId,
          client_id: clientId,
        }),
      })

      if (!submitResponse.ok) {
        const body = await submitResponse.text()
        await mediaService.updateImageJobStatus(jobId, 'failed', {
          errorMessage: `ComfyUI submit failed with status ${submitResponse.status}: ${body}`.slice(0, 2000),
        })
        return
      }

      const submission = await submitResponse.json() as ComfyUiPromptSubmission
      await mediaService.updateImageJobStatus(jobId, 'running', {
        params: {
          ...job.params,
          comfy: {
            ...comfyMeta,
            promptId: submission.prompt_id ?? promptId,
            clientId,
            queueNumber: submission.number,
            nodeErrors: submission.node_errors,
            submittedAt: new Date().toISOString(),
          },
        },
      })

      const history = await fetchComfyHistory(promptId)
      if (!history) {
        throw new JobStillRunningError(`ComfyUI job ${promptId} is still running`)
      }

      const mediaId = pickFirstImageFilename(history)
      await mediaService.updateImageJobStatus(jobId, 'done', {
        resultMediaId: mediaId ?? job.resultMediaId,
        params: {
          ...job.params,
          comfy: {
            ...comfyMeta,
            promptId,
            clientId,
            completedAt: new Date().toISOString(),
          },
        },
      })
      await mediaService.updateGalleryItemByImageJobId(jobId, {
        mediaId: mediaId ?? undefined,
        title: job.sceneType ? `${job.sceneType} scene` : undefined,
      })
    },
  }
}

export type NsfwImageConsumerHandler = ReturnType<typeof createNsfwImageConsumerHandler>
