import type { ArtistryJob, ArtistryJobStatus, ArtistryProvider, ArtistryRequest } from './base'

import { useLogg } from '@guiiai/logg'

const log = useLogg('providers-nanobanana').useGlobalConfig()

export class NanoBananaProvider implements ArtistryProvider {
  readonly id = 'nanobanana'
  readonly name = 'Nano Banana (Google AI Studio)'
  private apiKey = ''
  private defaultModel = 'gemini-1.5-flash'
  private defaultResolution = '1K'

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

  async initialize(config: any) {
    this.apiKey = config.nanobananaApiKey || config.apiKey || ''
    if (config.nanobananaModel)
      this.defaultModel = config.nanobananaModel
    if (config.nanobananaResolution)
      this.defaultResolution = config.nanobananaResolution
    log.log(`[Nano Banana] Initialized. API Key present: ${!!this.apiKey}`)
  }

  async generate(request: ArtistryRequest): Promise<ArtistryJob> {
    if (!this.apiKey) {
      throw new Error('Nano Banana API Key not configured')
    }

    const jobId = request.extra?.internalJobId || `nanobanana-${Date.now()}`
    const model = request.model || this.defaultModel
    const resolution = request.extra?.resolution || this.defaultResolution

    // Robust image extraction & cleansing
    let base64Image = request.extra?.image || request.extra?.providerOptions?.image || ''
    if (base64Image.includes('base64,'))
      base64Image = base64Image.split('base64,')[1]

    this.runGeneration(jobId, model, resolution, request.prompt, base64Image)

    return {
      jobId,
      providerJobId: jobId,
    }
  }

  private async runGeneration(jobId: string, model: string, resolution: string, prompt: string, base64Image: string) {
    this.updateStatus(jobId, { status: 'running', actionLabel: 'Inscribing with Nano Banana...' })

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`
      const generationParts: any[] = [{ text: prompt }]
      if (base64Image) {
        generationParts.push({ inline_data: { mime_type: 'image/jpeg', data: base64Image } })
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: generationParts }],
          generationConfig: { imageConfig: { aspectRatio: '1:1', imageSize: resolution } },
        }),
      })

      const json = await response.json()
      if (json.error) {
        throw new Error(json.error.message || 'Nano Banana API Error')
      }

      // Search all parts for the first image
      const responseParts = json.candidates?.[0]?.content?.parts || []
      const imagePart = responseParts.find((p: any) => p.inlineData?.data)
      const inlineData = imagePart?.inlineData

      if (inlineData?.data) {
        const dataUrl = `data:${inlineData.mimeType};base64,${inlineData.data}`
        this.updateStatus(jobId, { status: 'succeeded', progress: 100, imageUrl: dataUrl })
      }
      else {
        throw new Error('No image data returned from Nano Banana')
      }
    }
    catch (e: any) {
      log.error(`[Nano Banana] Generation failed: ${e.message}`)
      this.updateStatus(jobId, { status: 'failed', error: e.message })
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
}
