import type { ProcessingBatch } from '../background-trigger.js'
import type { StructuredLLMResponse } from '../llm-memory-manager.js'
import type { LLMProvider } from './base.js'

import OpenAI from 'openai'

import { INGESTION_PROMPT } from '../prompts.js'

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model: string = 'gpt-4-turbo-preview') {
    this.client = new OpenAI({ apiKey })
    this.model = model
  }

  getProviderName(): string {
    return 'OpenAI'
  }

  async processBatch(batch: ProcessingBatch): Promise<StructuredLLMResponse> {
    const messages = batch.messages.map(msg => ({
      role: 'user' as const,
      content: msg.content,
    }))

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: INGESTION_PROMPT },
          ...messages,
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3, // Lower temperature for more consistent structured output
        max_tokens: 2000,
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('No response content from OpenAI')
      }

      const parsed = JSON.parse(content) as StructuredLLMResponse

      // Validate the response structure
      this.validateResponse(parsed)

      return parsed
    }
    catch (error) {
      console.error('OpenAI API error:', error)
      throw new Error(`OpenAI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private validateResponse(response: any): asserts response is StructuredLLMResponse {
    if (!response.memoryFragments || !Array.isArray(response.memoryFragments)) {
      throw new Error('Invalid response: missing or invalid memoryFragments')
    }
    if (!response.goals || !Array.isArray(response.goals)) {
      throw new Error('Invalid response: missing or invalid goals')
    }
    if (!response.ideas || !Array.isArray(response.ideas)) {
      throw new Error('Invalid response: missing or invalid ideas')
    }
    // Optional fields - validate if present
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
