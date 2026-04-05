import type { DecodedChunk, InferenceBackend } from '../backends/common/backend-types'
import type { OllamaConfig } from './config'
import type { OllamaChatMessage } from './http-api'

import { readFileSync } from 'node:fs'

import { createInferenceLogger } from '@proj-airi/visual-chat-observability'

import { resolveOllamaConfig } from './config'
import { checkHealth, postChat } from './http-api'

const log = createInferenceLogger()
const MAX_HISTORY = 20

export class OllamaBackend implements InferenceBackend {
  readonly type = 'ollama'

  private baseUrl: string
  private model: string
  private systemPrompt = ''
  private history: OllamaChatMessage[] = []
  private pendingImageBase64: string | null = null

  constructor(config: OllamaConfig) {
    const resolved = resolveOllamaConfig(config)
    this.baseUrl = resolved.baseUrl
    this.model = resolved.model
  }

  async spawn(): Promise<void> {
    const ok = await this.health()
    if (!ok)
      throw new Error(`Ollama is not reachable at ${this.baseUrl}. Run: ollama serve`)

    log.withTag('ollama').log(`Connected to Ollama at ${this.baseUrl}, model: ${this.model}`)
  }

  async shutdown(): Promise<void> {
    this.history = []
    this.pendingImageBase64 = null
    log.withTag('ollama').log('Backend session cleared')
  }

  async health(): Promise<boolean> {
    return checkHealth(this.baseUrl)
  }

  async init(systemPrompt: string): Promise<void> {
    this.systemPrompt = systemPrompt
    this.history = []
    log.withTag('ollama').log('Session initialized')
  }

  async prefill(audioPath: string, imagePath?: string): Promise<void> {
    if (imagePath) {
      try {
        const data = readFileSync(imagePath)
        this.pendingImageBase64 = data.toString('base64')
      }
      catch {
        log.withTag('ollama').warn(`Could not read image: ${imagePath}`)
      }
    }
  }

  async* decode(): AsyncIterable<DecodedChunk> {
    const userMessage: OllamaChatMessage = {
      role: 'user',
      content: 'Describe what you observe in the image. Be concise.',
    }

    if (this.pendingImageBase64)
      userMessage.images = [this.pendingImageBase64]

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.history,
      userMessage,
    ]

    const response = await postChat(this.baseUrl, {
      model: this.model,
      messages,
    })

    const text = response.message?.content ?? ''

    this.history.push(userMessage)
    this.history.push({ role: 'assistant', content: text })

    if (this.history.length > MAX_HISTORY)
      this.history = this.history.slice(-MAX_HISTORY)

    this.pendingImageBase64 = null

    yield {
      text,
      audioFiles: [],
      isListening: false,
      done: true,
    }
  }

  writeTempWav(_data: Buffer, _name: string): string {
    return ''
  }

  writeTempImage(data: Buffer, _name: string): string {
    this.pendingImageBase64 = data.toString('base64')
    return 'ollama:memory'
  }

  readTempFile(_filePath: string): Buffer {
    return Buffer.alloc(0)
  }
}
