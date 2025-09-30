import { SettingsService } from '../settings'
import { XsaiEmbeddingProvider } from './xsai'

export class EmbeddingProviderFactory {
  private static instance: EmbeddingProviderFactory
  private settingsService = SettingsService.getInstance()
  private currentProvider: XsaiEmbeddingProvider | null = null // Current active provider instance

  private constructor() {}

  static getInstance(): EmbeddingProviderFactory {
    if (!EmbeddingProviderFactory.instance) {
      EmbeddingProviderFactory.instance = new EmbeddingProviderFactory()
    }
    return EmbeddingProviderFactory.instance
  }

  /**
   * Initialize the embedding provider at startup.
   * This prevents delays on first user interaction.
   */
  async initializeProvider(): Promise<void> {
    try {
      const settings = await this.settingsService.getSettings()

      // Only initialize if we have API keys configured
      if (settings.mem_embedding_api_key) {
        await this.getProvider()
      }
      else {
        throw new Error('Embedding provider not initialized: some settings are not configured')
      }
    }
    catch (error) {
      console.error('Failed to initialize embedding provider at startup:', error)
      // Don't throw - we want the service to start even if embedding init fails
    }
  }

  private async getProvider(): Promise<XsaiEmbeddingProvider> {
    const settings = await this.settingsService.getSettings()
    const provider = settings.mem_embedding_provider.toLowerCase()
    const model = settings.mem_embedding_model.toLowerCase()
    const apiKey = settings.mem_embedding_api_key

    if (
      this.currentProvider instanceof XsaiEmbeddingProvider
      && this.currentProvider.provider === provider // Assumes public 'provider' property exists on XsaiEmbeddingProvider
      && this.currentProvider.modelName === model // Assumes public 'modelName' property exists on XsaiEmbeddingProvider
    ) {
      console.warn('Reusing existing embedding provider')
      return this.currentProvider
    }

    // Create a new instance using the parameters from settings.
    this.currentProvider = new XsaiEmbeddingProvider(provider, model, apiKey)
    return this.currentProvider
  }

  /**
   * Generate an embedding vector for the given text using the configured provider.
   * The result is mapped to the content_vector fields based on the configured dimension.
   * @param text The input string to embed.
   * @returns An object containing the embedding vector mapped to the correct dimension field, others being null.
   */
  async generateEmbedding(text: string): Promise<{
    content_vector_1536: number[] | null
    content_vector_1024: number[] | null
    content_vector_768: number[] | null
  }> {
    const settings = await this.settingsService.getSettings()
    const provider = await this.getProvider()
    const dimensions = settings.mem_embedding_dimensions

    console.warn(`Generating ${dimensions}-dimensional embedding...`)
    // Call the provider's method (which handles the dimension parameter logic)
    const mainEmbedding = await provider.generateEmbedding(text, dimensions)
    console.warn('Embedding generated successfully')

    // Map the single generated embedding to the correct dimension field based on the configured dimension.
    return {
      content_vector_1536: dimensions === 1536 ? mainEmbedding : null,
      content_vector_1024: dimensions === 1024 ? mainEmbedding : null,
      content_vector_768: dimensions === 768 ? mainEmbedding : null,
    }
  }
}
