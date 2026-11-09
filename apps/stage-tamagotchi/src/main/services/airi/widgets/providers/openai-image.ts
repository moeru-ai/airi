import type { ArtistryJob, ArtistryJobStatus, ArtistryProvider, ArtistryRequest } from './base'

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'

import { errorMessageFrom } from '@moeru/std'
import { OPENAI_IMAGE_DEFAULTS } from '@proj-airi/stage-shared'

import * as v from 'valibot'

const configurationSchema = v.object({
  openaiImageApiKey: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  openaiImageBaseUrl: v.optional(v.pipe(v.string(), v.trim(), v.url()), OPENAI_IMAGE_DEFAULTS.baseUrl),
  openaiImageModel: v.optional(v.pipe(v.string(), v.trim(), v.nonEmpty()), OPENAI_IMAGE_DEFAULTS.model),
  openaiImageWidth: v.optional(v.pipe(v.string(), v.trim()), ''),
  openaiImageHeight: v.optional(v.pipe(v.string(), v.trim()), ''),
})

const responseSchema = v.object({
  data: v.pipe(v.array(v.object({ b64_json: v.pipe(v.string(), v.nonEmpty()) })), v.minLength(1)),
})

const extrasSchema = v.object({
  internalJobId: v.optional(v.string()),
  image: v.optional(v.string()),
  providerOptions: v.optional(v.object({ image: v.optional(v.string()) })),
})

interface JobState {
  status: ArtistryJobStatus
  controller: AbortController
  cleanup?: ReturnType<typeof setTimeout>
}

/**
 * Runs native Images API requests for Artistry. Each job captures its own credentials and endpoint.
 * The Artistry bridge polls jobs. Terminal results expire after one minute, and disposal aborts active requests.
 */
export class OpenAIImageProvider implements ArtistryProvider {
  readonly id = 'openai-image'
  readonly name = 'OpenAI GPT Image'
  private configuration?: v.InferOutput<typeof configurationSchema>
  private jobs = new Map<string, JobState>()

  async initialize(config: Record<string, unknown>) {
    this.configuration = undefined
    const configuration = v.parse(configurationSchema, config)
    const url = new URL(configuration.openaiImageBaseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error('Use an HTTP or HTTPS API base URL without credentials, query parameters, or a fragment.')
    this.configuration = configuration
  }

  async generate(request: ArtistryRequest): Promise<ArtistryJob> {
    const configuration = this.configuration
    if (!configuration)
      throw new Error('Configure the OpenAI image API key and base URL first.')
    const prompt = v.parse(v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(32000)), request.prompt)
    const extras = v.parse(extrasSchema, request.extra ?? {})
    const jobId = extras.internalJobId ?? randomUUID()
    if (this.jobs.has(jobId))
      throw new Error('This image generation job already exists.')

    const model = request.model?.trim() || configuration.openaiImageModel
    // A request overrides the complete default size. Do not combine a partial request with a saved dimension.
    let { width, height } = request
    if (width === undefined && height === undefined) {
      width = configuration.openaiImageWidth ? Number(configuration.openaiImageWidth) : undefined
      height = configuration.openaiImageHeight ? Number(configuration.openaiImageHeight) : undefined
    }
    let size: string | undefined
    if (width !== undefined || height !== undefined) {
      const parsed = v.safeParse(v.object({
        width: v.pipe(v.number(), v.safeInteger(), v.minValue(16), v.multipleOf(16)),
        height: v.pipe(v.number(), v.safeInteger(), v.minValue(16), v.multipleOf(16)),
      }), { width, height })
      if (!parsed.success)
        throw new Error(`Invalid image size ${width ?? 'blank'}x${height ?? 'blank'}. Set both width and height to positive multiples of 16, such as 1024x1024, or clear both defaults in image settings.`)
      const dimensions = parsed.output
      size = `${dimensions.width}x${dimensions.height}`
    }

    const sourceImage = extras.image || extras.providerOptions?.image
    const body = sourceImage
      ? this.editBody(sourceImage, prompt, model, size)
      : JSON.stringify({
          model,
          prompt,
          size,
          n: 1,
          output_format: 'png',
        })
    // Append to the configured API prefix. A leading slash would discard gateway paths such as /openai/v1.
    const endpoint = new URL(`images/${sourceImage ? 'edits' : 'generations'}`, `${configuration.openaiImageBaseUrl.replace(/\/+$/, '')}/`)
    const state: JobState = { status: { status: 'running' }, controller: new AbortController() }
    this.jobs.set(jobId, state)
    void this.run(jobId, state, endpoint, configuration.openaiImageApiKey, body)
    return { jobId, providerJobId: jobId }
  }

  private editBody(image: string, prompt: string, model: string, size?: string) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/.exec(image)
    const encoded = match ? match[2]! : image
    if (!/^[A-Z0-9+/]+={0,2}$/i.test(encoded))
      throw new Error('The source image must contain PNG, JPEG, or WebP base64 data.')
    const bytes = Buffer.from(encoded, 'base64')
    // Artistry texture edits also supply raw base64. Read its signature instead of assuming JPEG.
    let mimeType: string | undefined
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      mimeType = 'image/png'
    else if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF)
      mimeType = 'image/jpeg'
    else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
      mimeType = 'image/webp'
    if (!mimeType || (match && match[1] !== mimeType) || bytes.length >= 50 * 1024 * 1024)
      throw new Error('Use a PNG, JPEG, or WebP source image smaller than 50 MB.')
    const body = new FormData()
    body.set('model', model)
    body.set('prompt', prompt)
    if (size !== undefined)
      body.set('size', size)
    body.set('n', '1')
    body.set('output_format', 'png')
    body.set('image', new Blob([bytes], { type: mimeType }), `image.${mimeType.split('/')[1]}`)
    return body
  }

  private async run(jobId: string, state: JobState, endpoint: URL, apiKey: string, body: string | FormData) {
    // Match the bridge's five-minute deadline. Abort the HTTP request when the local deadline expires.
    const timeout = setTimeout(() => state.controller.abort(new Error('Image generation timed out.')), 300_000)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          ...(typeof body === 'string' ? { 'content-type': 'application/json' } : {}),
        },
        body,
        signal: state.controller.signal,
      })
      if (!response.ok)
        throw new Error(`OpenAI Images API returned HTTP ${response.status}.`)
      const json: unknown = await response.json().catch(() => {
        throw new Error('OpenAI Images API returned an invalid JSON response.')
      })
      const parsed = v.safeParse(responseSchema, json)
      if (!parsed.success)
        throw new Error('OpenAI Images API returned no valid base64 image.')
      state.controller.signal.throwIfAborted()
      this.finish(jobId, state, {
        status: 'succeeded',
        progress: 100,
        imageUrl: `data:image/png;base64,${parsed.output.data[0]!.b64_json}`,
      })
    }
    catch (error) {
      // A cancelled or disposed job is already terminal. Late responses cannot replace its result.
      if (state.status.status === 'running')
        this.finish(jobId, state, { status: 'failed', error: errorMessageFrom(error) ?? 'Image generation failed.' })
    }
    finally {
      clearTimeout(timeout)
    }
  }

  private finish(jobId: string, state: JobState, status: ArtistryJobStatus) {
    state.status = status
    state.cleanup = setTimeout(() => this.jobs.delete(jobId), 60_000)
    state.cleanup.unref()
  }

  async getStatus(jobId: string): Promise<ArtistryJobStatus> {
    return this.jobs.get(jobId)?.status ?? { status: 'failed', error: 'The image job does not exist or has expired.' }
  }

  async cancel(jobId: string) {
    const state = this.jobs.get(jobId)
    if (!state || state.status.status !== 'running')
      return
    state.controller.abort()
    // The Artistry bridge treats failed jobs as terminal when polling.
    this.finish(jobId, state, { status: 'failed', error: 'Image generation was cancelled.' })
  }

  dispose() {
    for (const [jobId, state] of this.jobs) {
      void this.cancel(jobId)
      clearTimeout(state.cleanup)
    }
    this.jobs.clear()
    this.configuration = undefined
  }
}
