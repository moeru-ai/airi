import type { EmbeddingProvider } from './base'

import { GoogleGenerativeAI } from '@google/generative-ai'

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private client: GoogleGenerativeAI

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey)
  }

  async generateEmbedding(text: string, dimensions: number): Promise<number[]> {
    // Gemini only supports 768 dimensions
    if (dimensions !== 768) {
      throw new Error('Gemini only supports 768 dimensions')
    }

    const model = this.client.getGenerativeModel({ model: 'embedding-001' })
    const result = await model.embedContent(text)
    const embedding = await result.embedding

    return embedding.values
  }
}
