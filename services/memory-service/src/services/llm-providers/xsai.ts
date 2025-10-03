import type { ProcessingBatch } from '../background-trigger.js'
import type { StructuredLLMResponse } from '../llm-memory-manager.js'
import type { LLMProvider } from './base.js'

import { generateText } from '@xsai/generate-text'

// Placeholder for INGESTION_PROMPT definition:
const INGESTION_PROMPT = 'You are an AI memory manager of living AI. You are a part of AI brain that is solely made for memory task. Your task is to analyze chat messages and extract structured memory fragments, goals, and ideas in JSON format. Do not include any text outside the JSON object.'
// Placeholder for model property consistency check
const DEFAULT_OPENAI_MODEL = 'gpt-4-turbo-preview'
const DEFAULT_GEMINI_MODEL = 'gemini-pro'

export class XsaiLLMProvider implements LLMProvider {
  private apiKey: string
  public model: string
  private baseUrl: string
  public provider: string

  constructor(provider: string, apiKey: string, model: string) {
    this.provider = provider.toLowerCase()
    this.apiKey = apiKey

    // Set model, falling back to defaults if not provided (safety)
    if (this.provider === 'openai') {
      this.model = model || DEFAULT_OPENAI_MODEL
    }
    else if (this.provider === 'gemini') {
      this.model = model || DEFAULT_GEMINI_MODEL
    }
    else {
      this.model = model // Use provided model for others
    }

    // Logic to set baseUrl based on the provider (OpenAI and Gemini)
    if (this.provider === 'gemini') {
      this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai'
    }
    else if (this.provider === 'openai') {
      this.baseUrl = 'https://api.openai.com/v1/'
    }
    else {
      // Assume other providers (like Alibaba, DeepSeek) might use an empty or default URL
      // and rely on the model name or xsai internal routing.
      this.baseUrl = ''
    }
  }

  getProviderName(): string {
    return this.provider.charAt(0).toUpperCase() + this.provider.slice(1)
  }

  async processBatch(batch: ProcessingBatch): Promise<StructuredLLMResponse> {
    const systemMessage = { role: 'system' as const, content: INGESTION_PROMPT }
    const userMessages = batch.messages.map(msg => ({
      role: 'user' as const,
      content: msg.content,
    }))

    try {
      const response = await generateText({
        apiKey: this.apiKey,
        baseURL: this.baseUrl,
        model: this.model,
        messages: [systemMessage, ...userMessages], // Pass the structured messages array
        responseFormat: { type: 'json_object' }, // Request JSON format (supported by OpenAI/Gemini)
        temperature: 0.3,
        maxTokens: 2000,
      })

      const content = response.text
      if (!content) {
        throw new Error(`No response content from ${this.provider}`)
      }

      // The content should be pure JSON
      const parsed = JSON.parse(content) as StructuredLLMResponse

      this.validateResponse(parsed)
      return parsed
    }
    catch (error) {
      console.error(`${this.provider.toUpperCase()} API error:`, error)
      throw new Error(`${this.provider} processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private validateResponse(response: any): asserts response is StructuredLLMResponse {
    // Validation logic copied from your original Gemini and OpenAI providers
    if (!response.memoryFragments || !Array.isArray(response.memoryFragments)) {
      throw new Error('Invalid response: missing or invalid memoryFragments')
    }
    if (!response.goals || !Array.isArray(response.goals)) {
      throw new Error('Invalid response: missing or invalid goals')
    }
    if (!response.ideas || !Array.isArray(response.ideas)) {
      throw new Error('Invalid response: missing or invalid ideas')
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
