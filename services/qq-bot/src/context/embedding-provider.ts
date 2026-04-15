export interface EmbeddingProvider {
  embed: (text: string) => Promise<number[]>
  batchEmbed: (texts: string[]) => Promise<number[][]>
  readonly dimension: number
}

interface EmbeddingResponse {
  data: Array<{
    embedding: number[]
    index?: number
  }>
}

interface BailianEmbeddingProviderOptions {
  model?: string
  dimension?: number
  maxBatchSize?: number
  baseUrl?: string
}

export class BailianEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number

  private readonly baseUrl: string
  private readonly model: string
  private readonly maxBatchSize: number

  constructor(
    private readonly apiKey: string,
    options: BailianEmbeddingProviderOptions = {},
  ) {
    this.dimension = options.dimension ?? 1024
    this.baseUrl = options.baseUrl ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    this.model = options.model ?? 'text-embedding-v4'
    // NOTICE: 百炼 embedding 单次请求上限 10 条，这里强制钳制到 1~10。
    this.maxBatchSize = Math.max(1, Math.min(10, options.maxBatchSize ?? 10))
  }

  async embed(text: string): Promise<number[]> {
    const [result] = await this.batchEmbed([text])
    return result
  }

  async batchEmbed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0)
      return []

    const results: number[][] = []

    for (let index = 0; index < texts.length; index += this.maxBatchSize) {
      const batch = texts.slice(index, index + this.maxBatchSize)
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: batch,
          dimensions: this.dimension,
        }),
      })

      if (!response.ok)
        throw new Error(`Bailian embedding request failed (${response.status}): ${await response.text()}`)

      const json = await response.json() as EmbeddingResponse
      if (!Array.isArray(json.data))
        throw new Error('Bailian embedding response missing data array')

      const sorted = [...json.data]
        .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
        .map(item => item.embedding)

      results.push(...sorted)
    }

    return results
  }
}
