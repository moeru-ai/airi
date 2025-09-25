import type { LLMProvider } from './base'

import { SettingsService } from '../settings'
import { GeminiProvider } from './gemini'
import { OpenAIProvider } from './openai'

export class LLMProviderFactory {
  private static instance: LLMProviderFactory
  private settingsService = SettingsService.getInstance()
  private currentProvider: OpenAIProvider | GeminiProvider | null = null
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

    // If we already have a provider of the right type, reuse it
    if (
      (this.currentProvider instanceof OpenAIProvider && provider === 'openai')
      || (this.currentProvider instanceof GeminiProvider && provider === 'gemini')
    ) {
      this.providerUseCount++
      console.warn(`Reusing existing ${provider} provider (use count: ${this.providerUseCount})`)
      return this.currentProvider
    }

    console.warn(`Creating new ${provider} provider with model: ${model}`)
    this.providerUseCount = 1

    switch (provider) {
      case 'openai':
        if (!apiKey) {
          console.warn('OpenAI provider requested but no API key provided in settings')
          throw new Error('OpenAI API key is required')
        }
        console.warn('Initializing OpenAI provider...')
        this.currentProvider = new OpenAIProvider(apiKey, model)
        return this.currentProvider

      case 'gemini':
        if (!apiKey) {
          console.warn('Gemini provider requested but no API key provided in settings')
          throw new Error('Gemini API key is required')
        }
        console.warn('Initializing Gemini provider...')
        this.currentProvider = new GeminiProvider(apiKey, model)
        return this.currentProvider

      default:
        console.warn(`Unknown LLM provider in settings: ${provider}`)
        throw new Error(`Unsupported LLM provider: ${provider}`)
    }
  }
}
