import type { EmbeddingProvider } from './base'

import OpenAI from 'openai'

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey })
  }

  async generateEmbedding(text: string, dimensions: number): Promise<number[]> {
    // Select model based on dimensions
    const model = this.getModelForDimensions(dimensions)

    const response = await this.client.embeddings.create({
      model,
      input: text,
      dimensions, // Only supported by text-embedding-3 models
    })

    return response.data[0].embedding
  }

  private getModelForDimensions(dimensions: number): string {
    // text-embedding-3-small and text-embedding-3-large support 1536, 1024, 768
    if ([1536, 1024, 768].includes(dimensions)) {
      return 'text-embedding-3-small' // Could use large for better quality
    }

    // text-embedding-ada-002 only supports 1536
    if (dimensions === 1536) {
      return 'text-embedding-ada-002'
    }

    throw new Error(`OpenAI does not support ${dimensions} dimensions`)
  }
}
