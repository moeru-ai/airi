import type { EmbeddingProvider } from './base'

import { embedMany } from '@xsai/embed'

export class XsaiEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string = ''
  private model: string = ''
  private baseUrl: string = ''

  public provider: string
  public modelName: string

  constructor(provider: string, model: string, apiKey: string) {
    this.provider = provider // Provider URI or service name (e.g., 'gemini')
    this.modelName = model // Model name (e.g., 'embedding-001')
    this.model = model
    this.apiKey = apiKey

    // Sets the base URL based on the provider name
    if (provider === 'gemini') {
      this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/'
    }
    else if (provider === 'openai') {
      this.baseUrl = 'https://api.openai.com/v1/'
    }
  }

  async generateEmbedding(text: string, dimensions: number): Promise<number[]> {
    const dimensionOptions
      = this.provider === 'openai'
        ? { dimensions }
        : this.provider === 'gemini'
          ? { outputDimensionality: dimensions }
          : { dimensions } // assuimg as openai compatible
    const { embeddings } = await embedMany({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      input: text,
      model: this.model,
      dimensionOptions,
    })

    if (!embeddings || embeddings.length === 0) {
      throw new Error('Failed to generate embedding: API returned no results.')
    }

    return embeddings[0]
  }
}
