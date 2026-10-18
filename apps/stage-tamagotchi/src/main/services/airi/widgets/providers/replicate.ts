import type Replicate from 'replicate'

import type { ArtistryJob, ArtistryJobStatus, ArtistryProvider, ArtistryRequest } from './base'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'

import { ReplicateClient } from './replicate-client'

const log = useLogg('providers-replicate').useGlobalConfig()

export class ReplicateProvider implements ArtistryProvider {
  readonly id = 'replicate'
  readonly name = 'Replicate.ai (Cloud)'

  private apiKey = ''
  private defaultModel = 'black-forest-labs/flux-schnell'
  private aspectRatio = '16:9'
  private inferenceSteps = 4
  private replicate: Replicate | null = null

  private jobResults = new Map<string, ArtistryJobStatus>()
  private callbacks = new Map<string, (status: ArtistryJobStatus) => void>()

  setJobCallback(jobId: string, callback: (status: ArtistryJobStatus) => void) {
    this.callbacks.set(jobId, callback)
    const result = this.jobResults.get(jobId)
    if (result)
      callback(result)
  }

  private updateStatus(jobId: string, status: ArtistryJobStatus) {
    this.jobResults.set(jobId, status)
    const callback = this.callbacks.get(jobId)
    if (callback)
      callback(status)
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    if (typeof config.replicateApiKey === 'string') {
      this.apiKey = config.replicateApiKey
      this.replicate = new ReplicateClient({ auth: this.apiKey, useFileOutput: false })
    }
    else {
      this.apiKey = ''
      this.replicate = null
    }
    if (typeof config.replicateDefaultModel === 'string')
      this.defaultModel = config.replicateDefaultModel
    if (typeof config.replicateAspectRatio === 'string')
      this.aspectRatio = config.replicateAspectRatio
    if (typeof config.replicateInferenceSteps === 'number')
      this.inferenceSteps = config.replicateInferenceSteps
  }

  async generate(request: ArtistryRequest): Promise<ArtistryJob> {
    if (!this.replicate) {
      throw new Error('Replicate provider is not configured. Missing API Key.')
    }

    const model = (request.model || request.extra?.model || this.defaultModel) as `${string}/${string}`
    const base64Image = request.extra?.image || ''

    // 1. Start with defaults
    const hasPromptPlaceholder = JSON.stringify(request.extra).includes('{{PROMPT}}')
    let inputOptions: Record<string, unknown> = {
      go_fast: request.extra?.go_fast ?? true,
      aspect_ratio: request.extra?.aspect_ratio ?? this.aspectRatio,
      output_format: request.extra?.output_format ?? 'png',
      output_quality: request.extra?.output_quality ?? 80,
      num_inference_steps: request.extra?.num_inference_steps ?? this.inferenceSteps,
    }

    // Default prompt injection if NO placeholder is used in overrides
    if (request.prompt && !hasPromptPlaceholder) {
      inputOptions.prompt = request.prompt
    }

    // 2. Merge overrides from the "JSON Parameters" textarea if present
    if (request.extra) {
      const { image: _image, internalJobId: _internalJobId, remixId: _remixId, ...rest } = request.extra
      // [BY DESIGN]: Strip 'prompt' from rest to avoid overwriting the prefixed version from the bridge.
      const { prompt: _overriddenPrompt, ...safeRest } = rest
      inputOptions = { ...inputOptions, ...safeRest }
    }

    // 3. Recursive placeholder replacement for {{IMAGE}} and {{PROMPT}}
    const replacePlaceholders = (obj: unknown): unknown => {
      if (typeof obj === 'string') {
        let result = obj
        // Handle image replacement
        if (result.includes('{{IMAGE}}')) {
          const dataUrl = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`
          result = result.replace(/\{\{IMAGE\}\}/g, dataUrl)
        }
        // Handle prompt replacement
        if (result.includes('{{PROMPT}}')) {
          const truncatedPrompt = this.truncatePrompt(request.prompt || '')
          result = result.replace(/\{\{PROMPT\}\}/g, truncatedPrompt)
        }
        return result
      }
      if (Array.isArray(obj))
        return obj.map(replacePlaceholders)
      if (typeof obj === 'object' && obj !== null) {
        const newObj: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(obj))
          newObj[key] = replacePlaceholders(value)
        return newObj
      }
      return obj
    }

    inputOptions = Object.fromEntries(Object.entries(inputOptions).map(([key, value]) => [key, replacePlaceholders(value)]))

    // Ensure main prompt is also truncated if not using a placeholder
    if (typeof inputOptions.prompt === 'string' && !hasPromptPlaceholder) {
      inputOptions.prompt = this.truncatePrompt(inputOptions.prompt)
    }

    log.log(`[Replicate] Generating with model ${model}. Input keys: ${Object.keys(inputOptions).join(', ')}`)

    // We don't await the result here because the interface expects us to return an ArtistryJob immediately.
    // However, replicate.run() blocks until completion. We'll run it in the background and store the result.
    const jobId = request.extra?.internalJobId || Math.random().toString(36).slice(2)

    // Start generation asynchronously
    this.runGeneration(jobId, model, inputOptions, request.signal)

    return { jobId, providerJobId: jobId }
  }

  private async runGeneration(jobId: string, model: `${string}/${string}`, input: object, signal?: AbortSignal) {
    this.updateStatus(jobId, { status: 'running', actionLabel: 'Requesting cloud generation...' })

    try {
      const output = await this.replicate!.run(model, { input, signal })

      if (!output) {
        throw new Error('No output received from Replicate.')
      }

      const result: unknown = Array.isArray(output) ? output[0] : output
      const imageUrl = typeof result === 'string' ? result : undefined
      if (!imageUrl || !['http:', 'https:', 'data:'].includes(new URL(imageUrl).protocol))
        throw new Error('Output does not contain an image URL.')
      this.updateStatus(jobId, { status: 'succeeded', progress: 100, imageUrl })
    }
    catch (error) {
      log.error(`[Replicate] Generation failed for ${jobId}.`)
      this.updateStatus(jobId, {
        status: 'failed',
        error: errorMessageFrom(error) ?? 'Image generation failed.',
      })
    }
    finally {
      // Clean up callback and job result after completion to prevent memory leaks
      setTimeout(() => {
        this.callbacks.delete(jobId)
        this.jobResults.delete(jobId)
      }, 10000)
    }
  }

  async getStatus(jobId: string): Promise<ArtistryJobStatus> {
    return this.jobResults.get(jobId) || { status: 'queued' }
  }

  private truncatePrompt(prompt: string, maxChars: number = 380): string {
    if (prompt.length <= maxChars)
      return prompt
    log.log(`[Replicate] Truncating prompt from ${prompt.length} to ${maxChars} chars.`)
    return `${prompt.slice(0, maxChars)}...`
  }
}
