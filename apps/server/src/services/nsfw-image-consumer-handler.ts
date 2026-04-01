import type { Env } from '../libs/env'
import type { NsfwImageEvent } from './nsfw-image-events'
import type { NsfwMediaService } from './nsfw-media'

import { useLogger } from '@guiiai/logg'

import { buildDefaultComfyWorkflow } from './nsfw-image-workflow'

const logger = useLogger('nsfw-image-consumer').useGlobalConfig()

interface ComfyUiPromptSubmission {
  prompt_id?: string
  number?: number
  node_errors?: Record<string, unknown>
}

interface ComfyUiSubmitErrorResponse {
  error?: {
    type?: string
    message?: string
    details?: string
    extra_info?: Record<string, unknown>
  }
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

interface ParsedComfyHistoryStatus {
  state: 'running' | 'success' | 'error'
  errorMessage: string | null
  errorType?: string | null
  nodeType?: string | null
}

export class JobStillRunningError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JobStillRunningError'
  }
}

export function createNsfwImageConsumerHandler(mediaService: NsfwMediaService, env: Env) {
  async function fetchComfyHistory(promptId: string, baseUrl = env.COMFYUI_BASE_URL) {
    const response = await fetch(new URL(`/history/${promptId}`, baseUrl))
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

  function parseHistoryStatus(historyEntry: NonNullable<Awaited<ReturnType<typeof fetchComfyHistory>>>): ParsedComfyHistoryStatus {
    const status = historyEntry.status
    const statusStr = typeof status?.status_str === 'string' ? status.status_str : null

    if (statusStr === 'success') {
      return { state: 'success', errorMessage: null }
    }

    const messages = Array.isArray(status?.messages) ? status.messages : []
    for (const message of messages) {
      if (!Array.isArray(message) || message[0] !== 'execution_error') {
        continue
      }

      const payload = message[1]
      if (!payload || typeof payload !== 'object') {
        return { state: 'error', errorMessage: 'ComfyUI execution failed', errorType: null, nodeType: null }
      }

      const record = payload as Record<string, unknown>
      const nodeType = typeof record.node_type === 'string' ? record.node_type : ''
      const exceptionMessage = typeof record.exception_message === 'string' ? record.exception_message.trim() : ''
      const exceptionType = typeof record.exception_type === 'string' ? record.exception_type : ''
      const composed = [nodeType, exceptionMessage].filter(Boolean).join(': ').trim()
      return {
        state: 'error',
        errorMessage: composed || 'ComfyUI execution failed',
        errorType: exceptionType || null,
        nodeType: nodeType || null,
      }
    }

    if (statusStr === 'error') {
      return { state: 'error', errorMessage: 'ComfyUI execution failed', errorType: null, nodeType: null }
    }

    return { state: 'running', errorMessage: null, errorType: null, nodeType: null }
  }

  function shouldRetryOnFallback(parsedStatus: ParsedComfyHistoryStatus, comfyMeta: Record<string, unknown>) {
    if (!env.COMFYUI_FALLBACK_BASE_URL) {
      return false
    }

    if (typeof comfyMeta.fallbackUsed === 'boolean' && comfyMeta.fallbackUsed) {
      return false
    }

    const error = (parsedStatus.errorMessage ?? '').toLowerCase()
    return error.includes('no kernel image is available for execution on the device')
  }

  function resolveComfyBaseUrl(comfyMeta: Record<string, unknown>) {
    if (typeof comfyMeta.baseUrl === 'string' && comfyMeta.baseUrl) {
      return comfyMeta.baseUrl
    }

    return env.COMFYUI_BASE_URL
  }

  function buildFailedComfyMeta(comfyMeta: Record<string, unknown>, input: {
    promptId: string
    clientId: string
    errorMessage: string | null
    errorType?: string | null
    nodeType?: string | null
  }) {
    return {
      ...comfyMeta,
      promptId: input.promptId,
      clientId: input.clientId,
      executionStatus: 'error',
      errorMessage: input.errorMessage,
      errorType: input.errorType ?? null,
      errorNodeType: input.nodeType ?? null,
      historySeenAt: new Date().toISOString(),
      failedAt: new Date().toISOString(),
    }
  }

  function buildSuccessfulComfyMeta(comfyMeta: Record<string, unknown>, input: {
    promptId: string
    clientId: string
    mediaId: string
  }) {
    return {
      ...comfyMeta,
      promptId: input.promptId,
      clientId: input.clientId,
      executionStatus: 'success',
      outputMediaId: input.mediaId,
      historySeenAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    }
  }

  function extractWorkflow(params: Record<string, unknown>) {
    const workflow = params.workflow
    return workflow && typeof workflow === 'object' ? workflow as Record<string, unknown> : null
  }

  function stripWorkflow(params: Record<string, unknown>) {
    const { workflow: _workflow, ...rest } = params
    return rest
  }

  function getComfyMeta(params: Record<string, unknown>) {
    const comfy = params.comfy
    if (!comfy || typeof comfy !== 'object') {
      return {}
    }

    return comfy as Record<string, unknown>
  }

  function parseIsoTimestamp(value: unknown) {
    if (typeof value !== 'string') {
      return null
    }

    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp : null
  }

  function isTimedOut(jobStatus: string, comfyMeta: Record<string, unknown>) {
    const now = Date.now()
    const submittedAt = parseIsoTimestamp(comfyMeta.submittedAt)
    if (submittedAt !== null) {
      const timeoutMs = jobStatus === 'submitting'
        ? env.COMFYUI_SUBMIT_TIMEOUT_MS
        : env.COMFYUI_RUNNING_TIMEOUT_MS
      return now - submittedAt >= timeoutMs
    }

    const startedAt = parseIsoTimestamp(comfyMeta.startedAt)
    if (startedAt !== null) {
      return now - startedAt >= env.COMFYUI_RUNNING_TIMEOUT_MS
    }

    return false
  }

  function shouldRetryWithDefaultWorkflow(body: string, hadWorkflowOverride: boolean) {
    if (!hadWorkflowOverride) {
      return false
    }

    try {
      const parsed = JSON.parse(body) as ComfyUiSubmitErrorResponse
      return parsed.error?.type === 'prompt_outputs_failed_validation'
    }
    catch {
      return false
    }
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
      const comfyBaseUrl = resolveComfyBaseUrl(comfyMeta)

      if (job.status === 'running' || job.status === 'submitting') {
        const history = await fetchComfyHistory(promptId, comfyBaseUrl)
        if (!history) {
          if (isTimedOut(job.status, comfyMeta)) {
            const timeoutMs = job.status === 'submitting'
              ? env.COMFYUI_SUBMIT_TIMEOUT_MS
              : env.COMFYUI_RUNNING_TIMEOUT_MS

            await mediaService.updateImageJobStatus(jobId, 'failed', {
              errorMessage: `ComfyUI job ${promptId} timed out after ${timeoutMs}ms without producing history`,
              params: {
                ...job.params,
                comfy: {
                  ...comfyMeta,
                  promptId,
                  clientId,
                  timedOutAt: new Date().toISOString(),
                },
              },
            })
            return
          }

          throw new JobStillRunningError(`ComfyUI job ${promptId} has not produced history yet`)
        }

        const parsedStatus = parseHistoryStatus(history)
        logger.withFields({ jobId, promptId, parsedStatus }).debug('Resolved ComfyUI history status for existing image job')
        if (parsedStatus.state === 'running') {
          throw new JobStillRunningError(`ComfyUI job ${promptId} is still running`)
        }

        if (parsedStatus.state === 'error') {
          if (shouldRetryOnFallback(parsedStatus, comfyMeta)) {
            await mediaService.updateImageJobStatus(jobId, 'queued', {
              errorMessage: null,
              params: {
                ...job.params,
                comfy: {
                  ...comfyMeta,
                  baseUrl: env.COMFYUI_FALLBACK_BASE_URL,
                  fallbackUsed: true,
                  fallbackReason: parsedStatus.errorMessage,
                  fallbackQueuedAt: new Date().toISOString(),
                  promptId: job.id,
                  clientId,
                },
              },
            })
            logger.withFields({ jobId, promptId, fallbackBaseUrl: env.COMFYUI_FALLBACK_BASE_URL }).warn('Retrying image job on ComfyUI fallback host after GPU kernel failure')
            return
          }

          logger.withFields({ jobId, promptId, errorMessage: parsedStatus.errorMessage }).warn('Marking image job as failed from ComfyUI history status')
          await mediaService.updateImageJobStatus(jobId, 'failed', {
            errorMessage: parsedStatus.errorMessage,
            params: {
              ...job.params,
              comfy: buildFailedComfyMeta(comfyMeta, {
                promptId,
                clientId,
                errorMessage: parsedStatus.errorMessage,
                errorType: parsedStatus.errorType,
                nodeType: parsedStatus.nodeType,
              }),
            },
          })
          return
        }

        const mediaId = pickFirstImageFilename(history)
        if (!mediaId) {
          logger.withFields({ jobId, promptId }).warn('ComfyUI history completed without image output; marking job failed')
          await mediaService.updateImageJobStatus(jobId, 'failed', {
            errorMessage: `ComfyUI job ${promptId} completed without image output`,
            params: {
              ...job.params,
              comfy: {
                ...comfyMeta,
                promptId,
                clientId,
                executionStatus: 'missing_output',
                historySeenAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
            },
          })
          return
        }

        logger.withFields({ jobId, promptId, mediaId }).log('Marking image job done from existing ComfyUI history')
        await mediaService.updateImageJobStatus(jobId, 'done', {
          resultMediaId: mediaId,
          errorMessage: null,
          params: {
            ...job.params,
            comfy: buildSuccessfulComfyMeta(comfyMeta, {
              promptId,
              clientId,
              mediaId,
            }),
          },
        })

        await mediaService.updateGalleryItemByImageJobId(jobId, {
          mediaId,
          title: job.sceneType ? `${job.sceneType} scene` : undefined,
        })
        return
      }

      const workflowOverride = extractWorkflow(job.params)
      const workflow = workflowOverride ?? buildDefaultComfyWorkflow(job, env)

      await mediaService.updateImageJobStatus(jobId, 'submitting', {
        errorMessage: null,
        params: {
          ...job.params,
          workflow,
          comfy: {
            ...comfyMeta,
            baseUrl: comfyBaseUrl,
            promptId,
            clientId,
            submittedAt: new Date().toISOString(),
          },
        },
      })

      const submitResponse = await fetch(new URL('/prompt', comfyBaseUrl), {
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
        if (shouldRetryWithDefaultWorkflow(body, Boolean(workflowOverride))) {
          const fallbackParams = stripWorkflow(job.params)
          const fallbackWorkflow = buildDefaultComfyWorkflow({
            ...job,
            params: fallbackParams,
          }, env)

          await mediaService.updateImageJobStatus(jobId, 'queued', {
            errorMessage: null,
            params: fallbackParams,
          })

          logger.withFields({ jobId, promptId }).warn('Discarding invalid custom ComfyUI workflow override and retrying with default workflow')

          const fallbackResponse = await fetch(new URL('/prompt', env.COMFYUI_BASE_URL), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              prompt: fallbackWorkflow,
              prompt_id: promptId,
              client_id: clientId,
            }),
          })

          if (!fallbackResponse.ok) {
            const fallbackBody = await fallbackResponse.text()
            await mediaService.updateImageJobStatus(jobId, 'failed', {
              errorMessage: `ComfyUI fallback submit failed with status ${fallbackResponse.status}: ${fallbackBody}`.slice(0, 2000),
              params: {
                ...fallbackParams,
                workflow: fallbackWorkflow,
              },
            })
            return
          }

          const fallbackSubmission = await fallbackResponse.json() as ComfyUiPromptSubmission
          await mediaService.updateImageJobStatus(jobId, 'running', {
            params: {
              ...fallbackParams,
              workflow: fallbackWorkflow,
              comfy: {
                ...comfyMeta,
                baseUrl: env.COMFYUI_FALLBACK_BASE_URL ?? comfyBaseUrl,
                promptId: fallbackSubmission.prompt_id ?? promptId,
                clientId,
                queueNumber: fallbackSubmission.number,
                nodeErrors: fallbackSubmission.node_errors,
                submittedAt: new Date().toISOString(),
                startedAt: new Date().toISOString(),
              },
            },
          })

          const fallbackHistory = await fetchComfyHistory(promptId, env.COMFYUI_FALLBACK_BASE_URL ?? comfyBaseUrl)
          if (!fallbackHistory) {
            throw new JobStillRunningError(`ComfyUI job ${promptId} is still running`)
          }

          const fallbackStatus = parseHistoryStatus(fallbackHistory)
          logger.withFields({ jobId, promptId, parsedStatus: fallbackStatus }).debug('Resolved ComfyUI history status after fallback submit')
          if (fallbackStatus.state === 'running') {
            throw new JobStillRunningError(`ComfyUI job ${promptId} is still running`)
          }

          if (fallbackStatus.state === 'error') {
            logger.withFields({ jobId, promptId, errorMessage: fallbackStatus.errorMessage }).warn('Marking image job as failed from fallback ComfyUI history status')
            await mediaService.updateImageJobStatus(jobId, 'failed', {
              errorMessage: fallbackStatus.errorMessage,
              params: {
                ...fallbackParams,
                workflow: fallbackWorkflow,
                comfy: buildFailedComfyMeta(comfyMeta, {
                  promptId,
                  clientId,
                  errorMessage: fallbackStatus.errorMessage,
                  errorType: fallbackStatus.errorType,
                  nodeType: fallbackStatus.nodeType,
                }),
              },
            })
            return
          }

          const fallbackMediaId = pickFirstImageFilename(fallbackHistory)
          if (!fallbackMediaId) {
            logger.withFields({ jobId, promptId }).warn('Fallback ComfyUI history completed without image output; marking job failed')
            await mediaService.updateImageJobStatus(jobId, 'failed', {
              errorMessage: `ComfyUI job ${promptId} completed without image output`,
              params: {
                ...fallbackParams,
                workflow: fallbackWorkflow,
                comfy: {
                  ...comfyMeta,
                  promptId,
                  clientId,
                  executionStatus: 'missing_output',
                  historySeenAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                },
              },
            })
            return
          }

          logger.withFields({ jobId, promptId, mediaId: fallbackMediaId }).log('Marking image job done from fallback ComfyUI history')
          await mediaService.updateImageJobStatus(jobId, 'done', {
            resultMediaId: fallbackMediaId,
            params: {
              ...fallbackParams,
              workflow: fallbackWorkflow,
              comfy: buildSuccessfulComfyMeta(comfyMeta, {
                promptId,
                clientId,
                mediaId: fallbackMediaId,
              }),
            },
          })
          await mediaService.updateGalleryItemByImageJobId(jobId, {
            mediaId: fallbackMediaId,
            title: job.sceneType ? `${job.sceneType} scene` : undefined,
          })
          return
        }

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
            baseUrl: comfyBaseUrl,
            promptId: submission.prompt_id ?? promptId,
            clientId,
            queueNumber: submission.number,
            nodeErrors: submission.node_errors,
            submittedAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
          },
        },
      })

      const history = await fetchComfyHistory(promptId, comfyBaseUrl)
      if (!history) {
        throw new JobStillRunningError(`ComfyUI job ${promptId} is still running`)
      }

      const parsedStatus = parseHistoryStatus(history)
      logger.withFields({ jobId, promptId, parsedStatus }).debug('Resolved ComfyUI history status immediately after submit')
      if (parsedStatus.state === 'running') {
        throw new JobStillRunningError(`ComfyUI job ${promptId} is still running`)
      }

      if (parsedStatus.state === 'error') {
        if (shouldRetryOnFallback(parsedStatus, comfyMeta)) {
          await mediaService.updateImageJobStatus(jobId, 'queued', {
            errorMessage: null,
            params: {
              ...job.params,
              comfy: {
                ...comfyMeta,
                baseUrl: env.COMFYUI_FALLBACK_BASE_URL,
                fallbackUsed: true,
                fallbackReason: parsedStatus.errorMessage,
                fallbackQueuedAt: new Date().toISOString(),
                promptId: job.id,
                clientId,
              },
            },
          })
          logger.withFields({ jobId, promptId, fallbackBaseUrl: env.COMFYUI_FALLBACK_BASE_URL }).warn('Retrying image job on ComfyUI fallback host after immediate GPU kernel failure')
          return
        }

        logger.withFields({ jobId, promptId, errorMessage: parsedStatus.errorMessage }).warn('Marking image job as failed from immediate ComfyUI history status')
        await mediaService.updateImageJobStatus(jobId, 'failed', {
          errorMessage: parsedStatus.errorMessage,
          params: {
            ...job.params,
            comfy: buildFailedComfyMeta(comfyMeta, {
              promptId,
              clientId,
              errorMessage: parsedStatus.errorMessage,
              errorType: parsedStatus.errorType,
              nodeType: parsedStatus.nodeType,
            }),
          },
        })
        return
      }

      const mediaId = pickFirstImageFilename(history)
      if (!mediaId) {
        logger.withFields({ jobId, promptId }).warn('Immediate ComfyUI history completed without image output; marking job failed')
        await mediaService.updateImageJobStatus(jobId, 'failed', {
          errorMessage: `ComfyUI job ${promptId} completed without image output`,
          params: {
            ...job.params,
            comfy: {
              ...comfyMeta,
              promptId,
              clientId,
              executionStatus: 'missing_output',
              historySeenAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            },
          },
        })
        return
      }

      logger.withFields({ jobId, promptId, mediaId }).log('Marking image job done from immediate ComfyUI history')
      await mediaService.updateImageJobStatus(jobId, 'done', {
        resultMediaId: mediaId,
        params: {
          ...job.params,
          comfy: buildSuccessfulComfyMeta(comfyMeta, {
            promptId,
            clientId,
            mediaId,
          }),
        },
      })
      await mediaService.updateGalleryItemByImageJobId(jobId, {
        mediaId,
        title: job.sceneType ? `${job.sceneType} scene` : undefined,
      })
    },
  }
}

export type NsfwImageConsumerHandler = ReturnType<typeof createNsfwImageConsumerHandler>
