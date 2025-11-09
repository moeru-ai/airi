import type { LLMProvider } from './base'

import { SettingsService } from '../settings'
import { OllamaLLMProvider } from './ollama'
import { XsaiLLMProvider } from './xsai'

export class LLMProviderFactory {
  private static instance: LLMProviderFactory
  private settingsService = SettingsService.getInstance()
  private currentProvider: { instance: LLMProvider, key: string } | null = null
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
    const key = `${provider}:${model}:${apiKey ?? ''}`

    // Reuse Logic: Check if current provider exists AND its configuration matches the requested settings.
    if (this.currentProvider && this.currentProvider.key === key) {
      this.providerUseCount++
      console.warn(`Reusing existing ${provider} provider (use count: ${this.providerUseCount})`)
      return this.currentProvider.instance
    }

    // --- Creation Logic ---
    console.warn(`Creating new ${provider} provider with model: ${model}`)
    this.providerUseCount = 1

    // API Key Validation
    if (provider !== 'ollama' && !apiKey) {
      console.warn(`${provider} provider requested but no API key provided in settings`)
      throw new Error(`${provider} API key is required`)
    }

    console.warn(`Initializing ${provider} provider...`)

    if (provider === 'ollama') {
      const instance = new OllamaLLMProvider(model, process.env.OLLAMA_BASE_URL)
      this.currentProvider = { key, instance }
      return instance
    }

    const instance = new XsaiLLMProvider(provider, apiKey, model)
    this.currentProvider = { key, instance }
    return instance
  }
}
