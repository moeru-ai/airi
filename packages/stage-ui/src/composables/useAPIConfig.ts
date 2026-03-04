import { ref, computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useProvidersStore } from '../stores/providers'
import { useLLM } from '../stores/llm'

interface APIConfig {
  provider: string
  apiKey: string
  baseUrl: string
  [key: string]: any
}

export function useAPIConfig() {
  const providersStore = useProvidersStore()
  const llmStore = useLLM()

  const config = useLocalStorage<APIConfig>('api-config', {
    provider: '',
    apiKey: '',
    baseUrl: '',
  })

  const isConfigured = computed(() => {
    return config.value.provider &&
           config.value.apiKey &&
           config.value.baseUrl
  })

  const currentProvider = computed(() => {
    if (!config.value.provider) return null
    return providersStore.providerMetadata[config.value.provider]
  })

  async function saveConfig(newConfig: APIConfig) {
    // Validate config
    if (!newConfig.provider || !newConfig.apiKey || !newConfig.baseUrl) {
      throw new Error('Invalid API configuration')
    }

    // Test connection
    const provider = providersStore.providerMetadata[newConfig.provider]
    if (!provider) {
      throw new Error('Invalid provider')
    }

    const validation = await provider.validators.validateProviderConfig(newConfig)
    if (!validation.valid) {
      throw new Error(validation.reason || 'Invalid configuration')
    }

    // Save config
    config.value = newConfig

    // Apply config
    await applyConfig(newConfig)

    return { success: true, message: 'API configuration saved and applied successfully' }
  }

  async function applyConfig(apiConfig: APIConfig) {
    try {
      // Create provider instance
      const provider = await providersStore.createProviderInstance(apiConfig.provider, apiConfig)

      // Test model list
      if (currentProvider.value?.capabilities?.listModels) {
        const models = await currentProvider.value.capabilities.listModels(apiConfig)
        if (models.length > 0) {
          // Set default model if not set
          if (!apiConfig.model) {
            config.value.model = models[0].id
          }
        }
      }

      // Test LLM connection
      if (apiConfig.model) {
        await llmStore.discoverToolsCompatibility(
          apiConfig.model,
          provider as any,
          [{ role: 'user', content: 'Hello' }]
        )
      }

      return { success: true }
    } catch (error) {
      console.error('Failed to apply API config:', error)
      throw error
    }
  }

  function resetConfig() {
    config.value = {
      provider: '',
      apiKey: '',
      baseUrl: '',
    }
  }

  async function testConnection(config: APIConfig) {
    if (!config.provider || !config.apiKey || !config.baseUrl) {
      return { success: false, message: 'Missing required fields' }
    }

    const provider = providersStore.providerMetadata[config.provider]
    if (!provider) {
      return { success: false, message: 'Invalid provider' }
    }

    try {
      const validation = await provider.validators.validateProviderConfig(config)
      if (validation.valid) {
        // Test model list
        if (provider.capabilities?.listModels) {
          const models = await provider.capabilities.listModels(config)
          if (models.length > 0) {
            return {
              success: true,
              message: `Connection successful! Found ${models.length} models.`,
              models
            }
          } else {
            return {
              success: true,
              message: 'Connection successful, but no models found.'
            }
          }
        } else {
          return {
            success: true,
            message: 'Connection successful!'
          }
        }
      } else {
        return {
          success: false,
          message: validation.reason || 'Connection failed'
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${String(error)}`
      }
    }
  }

  return {
    config,
    isConfigured,
    currentProvider,
    saveConfig,
    applyConfig,
    resetConfig,
    testConnection,
  }
}
