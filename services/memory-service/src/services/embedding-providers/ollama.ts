import type { EmbeddingProvider } from './base'

interface OllamaEmbeddingResponse {
  embedding?: number[]
  error?: string
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly model: string
  private readonly baseUrl: string

  constructor(model: string, baseUrl?: string) {
    this.model = model
    this.baseUrl = (baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')
  }

  async generateEmbedding(text: string, dimensions: number): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Ollama embedding request failed (${response.status} ${response.statusText}): ${errorBody}`)
    }

    const data = await response.json() as OllamaEmbeddingResponse
    if (data.error) {
      throw new Error(`Ollama embedding error: ${data.error}`)
    }

    if (!Array.isArray(data.embedding)) {
      throw new Error('Ollama embedding response missing embedding vector')
    }

    if (data.embedding.length !== dimensions) {
      throw new Error(`Ollama embedding dimension mismatch. Expected ${dimensions}, received ${data.embedding.length}`)
    }

    return data.embedding
  }
}
