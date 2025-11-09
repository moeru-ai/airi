import type { ProcessingBatch } from '../background-trigger.js'
import type { StructuredLLMResponse } from '../llm-memory-manager.js'
import type { LLMProvider } from './base.js'

import { INGESTION_PROMPT } from './prompts.js'

interface OllamaGenerateResponse {
  response?: string
  error?: string
}

export class OllamaLLMProvider implements LLMProvider {
  public readonly provider = 'ollama'
  public readonly model: string
  private readonly baseUrl: string

  constructor(model: string, baseUrl?: string) {
    this.model = model
    this.baseUrl = (baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')
  }

  getProviderName(): string {
    return 'Ollama'
  }

  async processBatch(batch: ProcessingBatch): Promise<StructuredLLMResponse> {
    const prompt = this.composePrompt(batch)

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Ollama request failed (${response.status} ${response.statusText}): ${errorBody}`)
    }

    const data = await response.json() as OllamaGenerateResponse
    if (data.error) {
      throw new Error(`Ollama error: ${data.error}`)
    }

    const content = data.response?.trim()
    if (!content) {
      throw new Error('Ollama returned an empty response for ingestion prompt')
    }

    try {
      const parsed = JSON.parse(content) as StructuredLLMResponse
      this.validateResponse(parsed)
      return parsed
    }
    catch (error) {
      console.error('Failed to parse Ollama JSON response:', error)
      throw new Error('Ollama response could not be parsed as valid structured memory JSON')
    }
  }

  private composePrompt(batch: ProcessingBatch): string {
    const header = `${INGESTION_PROMPT}\n\nModel Identifier: ${batch.modelName}`
    const formattedMessages = batch.messages
      .map((message, index) => `Message ${index + 1} (${new Date(message.created_at).toISOString()}): ${message.content}`)
      .join('\n')

    return `${header}\n${formattedMessages}\n`
  }

  private validateResponse(response: StructuredLLMResponse): void {
    if (!Array.isArray(response.memoryFragments)) {
      throw new TypeError('Invalid response: missing or invalid memoryFragments')
    }
    if (!Array.isArray(response.goals)) {
      throw new TypeError('Invalid response: missing or invalid goals')
    }
    if (!Array.isArray(response.ideas)) {
      throw new TypeError('Invalid response: missing or invalid ideas')
    }
    if (response.episodes && !Array.isArray(response.episodes)) {
      throw new Error('Invalid response: episodes must be an array if present')
    }
    if (response.entities && !Array.isArray(response.entities)) {
      throw new Error('Invalid response: entities must be an array if present')
    }
    if (response.entityRelations && !Array.isArray(response.entityRelations)) {
      throw new Error('Invalid response: entityRelations must be an array if present')
    }
    if (response.consolidatedMemories && !Array.isArray(response.consolidatedMemories)) {
      throw new Error('Invalid response: consolidatedMemories must be an array if present')
    }
  }
}
