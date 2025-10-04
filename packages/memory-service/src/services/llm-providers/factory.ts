import type { LLMProvider } from './base'

import { SettingsService } from '../settings'
import { XsaiLLMProvider } from './xsai'

export class LLMProviderFactory {
  private static instance: LLMProviderFactory
  private settingsService = SettingsService.getInstance()
  private currentProvider: XsaiLLMProvider | null = null
  private providerUseCount = 0

  private constructor() {}

  static getInstance(): LLMProviderFactory {
    if (!LLMProviderFactory.instance) {
      LLMProviderFactory.instance = new LLMProviderFactory()
    }
    return LLMProviderFactory.instance
  }

  async getProvider(): Promise<LLMProvider> {
    const settings = await this.settingsService.getSettings()
    const provider = settings.mem_llm_provider.toLowerCase()
    const apiKey = settings.mem_llm_api_key
    const model = settings.mem_llm_model

    // Reuse Logic: Check if current provider exists AND its configuration matches the requested settings.
    if (
      this.currentProvider
      && this.currentProvider.provider === provider
      && this.currentProvider.model === model
    ) {
      this.providerUseCount++
      console.warn(`Reusing existing ${provider} provider (use count: ${this.providerUseCount})`)
      return this.currentProvider
    }

    // --- Creation Logic ---
    console.warn(`Creating new ${provider} provider with model: ${model}`)
    this.providerUseCount = 1

    // API Key Validation
    if (!apiKey) {
      console.warn(`${provider} provider requested but no API key provided in settings`)
      throw new Error(`${provider} API key is required`)
    }

    // Use the unified XsaiLLMProvider, passing all necessary configuration.
    console.warn(`Initializing ${provider} provider...`)
    this.currentProvider = new XsaiLLMProvider(provider, apiKey, model)

    return this.currentProvider
  }
}
