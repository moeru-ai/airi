/**
 * Base interface for embedding providers
 */
export interface EmbeddingProvider {
  /**
   * Generate embeddings for a text string
   * @param text The text to generate embeddings for
   * @param dimensions The desired embedding dimensions (provider must support it)
   * @returns Array of numbers representing the embedding vector
   */
  generateEmbedding: (text: string, dimensions: number) => Promise<number[]>
}
