import type { ArtistryJob, ArtistryJobStatus, ArtistryProvider, ArtistryRequest } from './base'

import { useLogg } from '@guiiai/logg'

const log = useLogg('providers-nanobanana').useGlobalConfig()

export class NanoBananaProvider implements ArtistryProvider {
  readonly id = 'nanobanana'
  readonly name = 'Nano Banana (Google AI Studio)'
  private apiKey = ''
  private callbacks = new Map<string, (status: ArtistryJobStatus) => void>()
  private defaultModel = 'gemini-1.5-flash'

  private defaultResolution = '1K'
  private jobResults = new Map<string, ArtistryJobStatus>()

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

  async getStatus(jobId: string): Promise<ArtistryJobStatus> {
    return this.jobResults.get(jobId) || { status: 'queued' }
  }

  async initialize(config: any) {
    this.apiKey = config.nanobananaApiKey || config.apiKey || ''
    if (config.nanobananaModel)
      this.defaultModel = config.nanobananaModel
    if (config.nanobananaResolution)
      this.defaultResolution = config.nanobananaResolution
    log.log(`[Nano Banana] Initialized. API Key present: ${!!this.apiKey}`)
  }

  setJobCallback(jobId: string, callback: (status: ArtistryJobStatus) => void) {
    this.callbacks.set(jobId, callback)
    const result = this.jobResults.get(jobId)
    if (result)
      callback(result)
  }

  private async runGeneration(jobId: string, model: string, resolution: string, prompt: string, base64Image: string) {
    this.updateStatus(jobId, { actionLabel: 'Inscribing with Nano Banana...', status: 'running' })

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`
      const generationParts: any[] = [{ text: prompt }]
      if (base64Image) {
        generationParts.push({ inline_data: { data: base64Image, mime_type: 'image/jpeg' } })
      }

      const response = await fetch(url, {
        body: JSON.stringify({
          contents: [{ parts: generationParts }],
          generationConfig: { imageConfig: { aspectRatio: '1:1', imageSize: resolution } },
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
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
        this.updateStatus(jobId, { imageUrl: dataUrl, progress: 100, status: 'succeeded' })
      }
      else {
        throw new Error('No image data returned from Nano Banana')
      }
    }
    catch (e: any) {
      log.error(`[Nano Banana] Generation failed: ${e.message}`)
      this.updateStatus(jobId, { error: e.message, status: 'failed' })
    }
    finally {
      // Clean up callback and job result after completion to prevent memory leaks
      setTimeout(() => {
        this.callbacks.delete(jobId)
        this.jobResults.delete(jobId)
      }, 10000)
    }
  }

  private updateStatus(jobId: string, status: ArtistryJobStatus) {
    this.jobResults.set(jobId, status)
    const callback = this.callbacks.get(jobId)
    if (callback)
      callback(status)
  }
}
