export interface MemoryEmbeddingResult {
  model: string
  dimension: number
  vectors: number[][]
}

export interface MemoryEmbeddingProvider {
  embed: (input: { texts: string[] }) => Promise<MemoryEmbeddingResult>
}
