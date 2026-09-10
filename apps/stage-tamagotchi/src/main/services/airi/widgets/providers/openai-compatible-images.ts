import type { ArtistryJob, ArtistryJobStatus, ArtistryProvider, ArtistryRequest } from './base'

import { useLogg } from '@guiiai/logg'

const log = useLogg('providers-openai-compatible-images').useGlobalConfig()

function normalizeBaseUrl(baseUrl: string) {
  const value = baseUrl.trim()
  if (!value)
    return ''
  return value.endsWith('/') ? value : `${value}/`
}

export class OpenAICompatibleImagesProvider implements ArtistryProvider {
  readonly id = 'openai-compatible-images'
  readonly name = 'OpenAI Compatible Images'
  private apiKey = ''
  private baseUrl = 'https://openrouter.ai/api/v1/'
  private defaultModel = 'google/gemini-2.5-flash-image'

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

  async initialize(config: Record<string, any>) {
    this.apiKey = config.openaiCompatibleImagesApiKey || config.apiKey || ''
    this.baseUrl = normalizeBaseUrl(config.openaiCompatibleImagesBaseUrl || this.baseUrl)
    if (config.openaiCompatibleImagesModel)
      this.defaultModel = config.openaiCompatibleImagesModel
    log.log(`[OpenAI Compatible Images] Initialized. API Key present: ${!!this.apiKey}`)
  }

  async generate(request: ArtistryRequest): Promise<ArtistryJob> {
    if (!this.apiKey)
      throw new Error('OpenAI Compatible Images API key not configured')
    if (!this.baseUrl)
      throw new Error('OpenAI Compatible Images base URL not configured')

    const jobId = request.extra?.internalJobId || `openai-compatible-images-${Date.now()}`
    const model = request.model || this.defaultModel
    this.runGeneration(jobId, model, request.prompt)
    return { jobId, providerJobId: jobId }
  }

  private async runGeneration(jobId: string, model: string, prompt: string) {
    this.updateStatus(jobId, { status: 'running', actionLabel: 'Generating image...' })

    try {
      const response = await fetch(new URL('images/generations', this.baseUrl), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
        }),
      })
      const json = await response.json() as {
        error?: { message?: string } | string
        data?: Array<{ b64_json?: string, url?: string }>
      }
      if (!response.ok || json.error) {
        const message = typeof json.error === 'string' ? json.error : json.error?.message || `HTTP ${response.status}`
        throw new Error(message)
      }

      const image = json.data?.[0]
      if (image?.b64_json) {
        this.updateStatus(jobId, {
          status: 'succeeded',
          progress: 100,
          imageUrl: `data:image/png;base64,${image.b64_json}`,
        })
        return
      }
      if (image?.url) {
        this.updateStatus(jobId, { status: 'succeeded', progress: 100, imageUrl: image.url })
        return
      }
      throw new Error('No image data returned from the images API')
    }
    catch (error: any) {
      log.error(`[OpenAI Compatible Images] Generation failed: ${error.message}`)
      this.updateStatus(jobId, { status: 'failed', error: error.message })
    }
    finally {
      setTimeout(() => {
        this.callbacks.delete(jobId)
        this.jobResults.delete(jobId)
      }, 10000)
    }
  }

  async getStatus(jobId: string): Promise<ArtistryJobStatus> {
    return this.jobResults.get(jobId) || { status: 'queued' }
  }
}
