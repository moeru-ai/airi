import type { ArtistryJob, ArtistryJobStatus, ArtistryProvider, ArtistryRequest } from './base'

import Replicate from 'replicate'

import { useLogg } from '@guiiai/logg'

const log = useLogg('replicate-provider').useGlobalConfig()

export class ReplicateProvider implements ArtistryProvider {
  readonly id = 'replicate'
  readonly name = 'Replicate.ai (Cloud)'

  private apiKey = ''
  private defaultModel = 'black-forest-labs/flux-schnell'
  private aspectRatio = '16:9'
  private inferenceSteps = 4
  private replicate: Replicate | null = null

  async initialize(config: any): Promise<void> {
    if (config?.replicateApiKey) {
      this.apiKey = config.replicateApiKey
      this.replicate = new Replicate({ auth: this.apiKey })
    }
    if (config?.replicateDefaultModel)
      this.defaultModel = config.replicateDefaultModel
    if (config?.replicateAspectRatio)
      this.aspectRatio = config.replicateAspectRatio
    if (config?.replicateInferenceSteps)
      this.inferenceSteps = config.replicateInferenceSteps
  }

  async generate(request: ArtistryRequest): Promise<ArtistryJob> {
    if (!this.replicate) {
      throw new Error('Replicate provider is not configured. Missing API Key.')
    }

    const model = (request.model || request.extra?.model || this.defaultModel) as `${string}/${string}`
    const inputOptions = {
      prompt: request.prompt || '',
      go_fast: request.extra?.go_fast ?? true,
      megapixels: request.extra?.megapixels ?? '1',
      num_outputs: request.extra?.num_outputs ?? 1,
      aspect_ratio: request.extra?.aspect_ratio ?? this.aspectRatio,
      output_format: request.extra?.output_format ?? 'jpg',
      output_quality: request.extra?.output_quality ?? 80,
      num_inference_steps: request.extra?.num_inference_steps ?? this.inferenceSteps,
      ...request.extra?.providerOptions, // Allow direct passthrough from AiriCard options
    }

    log.log(`[Replicate] Generating with model ${model}...`)

    // We don't await the result here because the interface expects us to return an ArtistryJob immediately.
    // However, replicate.run() blocks until completion. We'll run it in the background and store the result.
    const jobId = request.extra?.internalJobId || Math.random().toString(36).slice(2)

    // Start generation asynchronously
    this.runGeneration(jobId, model, inputOptions)

    return { jobId, providerJobId: jobId }
  }

  // Track async jobs internally since the provider interface expects polling
  private jobResults = new Map<string, ArtistryJobStatus>()

  private async runGeneration(jobId: string, model: `${string}/${string}`, input: object) {
    this.jobResults.set(jobId, { status: 'running', actionLabel: 'Requesting cloud generation...' })

    try {
      const output = await this.replicate!.run(model, { input })

      if (!output) {
        throw new Error('No output received from Replicate.')
      }

      if (Array.isArray(output) && output.length > 0) {
        const fileOutput = output[0] as any
        if (fileOutput.url) {
          const imageUrl = typeof fileOutput.url === 'function' ? fileOutput.url().href : fileOutput.url
          log.log(`[Replicate] EXTRACTED IMAGE: ${imageUrl}`)
          this.jobResults.set(jobId, { status: 'succeeded', progress: 100, imageUrl })
        }
        else if (typeof output[0] === 'string' && output[0].startsWith('http')) {
          const imageUrl = output[0]
          log.log(`[Replicate] EXTRACTED IMAGE: ${imageUrl}`)
          this.jobResults.set(jobId, { status: 'succeeded', progress: 100, imageUrl })
        }
        else {
          throw new Error('Output does not contain a recognizable URL.')
        }
      }
      else {
        throw new Error(`Unexpected output format: ${JSON.stringify(output)}`)
      }
    }
    catch (error: any) {
      log.error(`[Replicate] Error: ${error.message}`)
      this.jobResults.set(jobId, { status: 'failed', error: error.message, actionLabel: `Error: ${error.message}` })
    }
  }

  async getStatus(jobId: string): Promise<ArtistryJobStatus> {
    return this.jobResults.get(jobId) || { status: 'queued' }
  }
}
