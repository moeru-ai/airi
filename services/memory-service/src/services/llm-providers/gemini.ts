import type { ProcessingBatch } from '../background-trigger.js'
import type { StructuredLLMResponse } from '../llm-memory-manager.js'
import type { LLMProvider } from './base.js'

import { GoogleGenerativeAI } from '@google/generative-ai'

import { INGESTION_PROMPT } from '../prompts.js'

export class GeminiProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI
  private model: string

  constructor(apiKey: string, model: string = 'gemini-pro') {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.model = model
  }

  getProviderName(): string {
    return 'Gemini'
  }

  async processBatch(batch: ProcessingBatch): Promise<StructuredLLMResponse> {
    const model = this.genAI.getGenerativeModel({ model: this.model })

    const userMessages = batch.messages.map(msg => `User: ${msg.content}`).join('\n\n')
    const fullPrompt = `${INGESTION_PROMPT}\n\nMessages to analyze:\n\n${userMessages}`

    try {
      const result = await model.generateContent(fullPrompt)
      const response = result.response
      const text = response.text()

      if (!text) {
        throw new Error('No response text from Gemini')
      }

      // Extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON response found in Gemini response')
      }

      const parsed = JSON.parse(jsonMatch[0]) as StructuredLLMResponse

      // Validate the response structure
      this.validateResponse(parsed)

      return parsed
    }
    catch (error) {
      console.error('Gemini API error:', error)
      throw new Error(`Gemini processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
