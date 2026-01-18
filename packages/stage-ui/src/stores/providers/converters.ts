import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type {
  BaseSpeechProviderConfig,
  BaseSpeechProviderDefinition,
} from '../../libs/providers/base-speech'
import type {
  BaseTranscriptionProviderConfig,
  BaseTranscriptionProviderDefinition,
} from '../../libs/providers/base-transcription'
import type { ProviderDefinition } from '../../libs/providers/types'
import type { ProviderMetadata } from '../providers'

import { getValidatorsOfProvider } from '../../libs/providers/validators/run'

function getCategoryFromTasks(tasks: string[]): 'chat' | 'embed' | 'speech' | 'transcription' {
  if (tasks.some(t => ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'].includes(t.toLowerCase())))
    return 'transcription'
  if (tasks.some(t => ['text-to-speech', 'speech', 'tts'].includes(t.toLowerCase())))
    return 'speech'
  if (tasks.some(t => ['embed', 'embedding'].includes(t.toLowerCase())))
    return 'embed'
  return 'chat'
}

/**
 * Convert BaseSpeechProviderDefinition to ProviderMetadata
 *
 * This allows base provider implementations to be used with the existing
 * ProviderMetadata-based store system.
 */
export function convertSpeechProviderToMetadata(
  definition: BaseSpeechProviderDefinition,
  metadata: Pick<ProviderMetadata, 'nameKey' | 'name' | 'descriptionKey' | 'description' | 'icon' | 'order' | 'iconColor' | 'iconImage' | 'isAvailableBy'>,
): ProviderMetadata {
  return {
    id: definition.id,
    category: 'speech',
    tasks: ['text-to-speech'],
    ...metadata,
    defaultOptions: () => definition.getDefaultConfig?.() || {},
    createProvider: async (config: Record<string, unknown>) => {
      const result = await definition.createProvider(config as BaseSpeechProviderConfig)
      return result as SpeechProvider | SpeechProviderWithExtraOptions
    },
    capabilities: {
      listModels: definition.listModels ? (config: Record<string, unknown>) => definition.listModels!(config as BaseSpeechProviderConfig) : undefined,
      listVoices: definition.listVoices ? (config: Record<string, unknown>) => definition.listVoices!(config as BaseSpeechProviderConfig) : undefined,
    },
    validators: {
      validateProviderConfig: (config: Record<string, unknown>) => {
        return definition.validateConfig(config as BaseSpeechProviderConfig)
      },
    },
  }
}

/**
 * Convert BaseTranscriptionProviderDefinition to ProviderMetadata
 *
 * This allows base provider implementations to be used with the existing
 * ProviderMetadata-based store system.
 */
export function convertTranscriptionProviderToMetadata(
  definition: BaseTranscriptionProviderDefinition,
  metadata: Pick<ProviderMetadata, 'nameKey' | 'name' | 'descriptionKey' | 'description' | 'icon' | 'order' | 'iconColor' | 'iconImage' | 'isAvailableBy'>,
): ProviderMetadata {
  return {
    id: definition.id,
    category: 'transcription',
    tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
    ...metadata,
    defaultOptions: () => definition.getDefaultConfig?.() || {},
    createProvider: async (config: Record<string, unknown>) => {
      const result = await definition.createProvider(config as BaseTranscriptionProviderConfig)
      return result as TranscriptionProvider | TranscriptionProviderWithExtraOptions
    },
    capabilities: {
      listModels: definition.listModels ? (config: Record<string, unknown>) => definition.listModels!(config as BaseTranscriptionProviderConfig) : undefined,
    },
    validators: {
      validateProviderConfig: (config: Record<string, unknown>) => {
        return definition.validateConfig(config as BaseTranscriptionProviderConfig)
      },
    },
    transcriptionFeatures: definition.transcriptionFeatures,
  }
}

/**
 * Convert unified ProviderDefinition to ProviderMetadata
 *
 * This converts the unified defineProvider pattern to the store's ProviderMetadata format.
 */
export function convertProviderDefinitionToMetadata(
  definition: ProviderDefinition<any>,
  t: (key: string, fallback?: string) => string,
): ProviderMetadata {
  const category = getCategoryFromTasks(definition.tasks)

  // Extract transcription features from capabilities
  const transcriptionFeatures = definition.capabilities?.transcription
    ? {
        supportsGenerate: definition.capabilities.transcription.generateOutput,
        supportsStreamOutput: definition.capabilities.transcription.streamOutput,
        supportsStreamInput: definition.capabilities.transcription.streamInput,
      }
    : undefined

  return {
    id: definition.id,
    order: definition.order,
    category,
    tasks: definition.tasks,
    nameKey: definition.nameLocalize({ t }),
    name: definition.name,
    descriptionKey: definition.descriptionLocalize({ t }),
    description: definition.description,
    icon: definition.icon,
    iconColor: definition.iconColor,
    iconImage: definition.iconImage,
    isAvailableBy: definition.isAvailableBy,
    defaultOptions: () => {
      // Extract defaults from schema if possible
      // TODO: Extract defaults from Zod schema in the future
      // const schema = definition.createProviderConfig({ t })
      return {}
    },
    createProvider: async (config: Record<string, unknown>) => {
      const result = await definition.createProvider(config as any)
      return result
    },
    capabilities: {
      listModels: definition.extraMethods?.listModels
        ? async (config: Record<string, unknown>) => {
          // We need a provider instance to call listModels, but we can try without it
          // For most cases, listModels doesn't need the provider instance
          try {
            return await definition.extraMethods!.listModels!(config as any, {} as any)
          }
          catch {
            // If it fails without provider, we'd need to create one
            // For now, return empty array
            return []
          }
        }
        : undefined,
      listVoices: definition.extraMethods?.listVoices
        ? async (config: Record<string, unknown>) => {
          try {
            return await definition.extraMethods!.listVoices!(config as any, {} as any)
          }
          catch {
            return []
          }
        }
        : undefined,
      loadModel: definition.extraMethods?.loadModel
        ? async (config: Record<string, unknown>, hooks?) => {
          const provider = await definition.createProvider(config as any)
          return await definition.extraMethods!.loadModel!(config as any, provider, hooks)
        }
        : undefined,
    },
    validators: {
      validateProviderConfig: async (config: Record<string, unknown>) => {
        if (!definition.validators?.validateConfig) {
          return { errors: [], reason: '', valid: true }
        }

        // Use the validator system to run config validators
        const plan = getValidatorsOfProvider({
          definition,
          config,
          schemaDefaults: {},
          contextOptions: { t },
        })

        // Run only config validators
        const configValidators = plan.configValidators
        if (configValidators.length === 0) {
          return { errors: [], reason: '', valid: true }
        }

        const errors: unknown[] = []
        let reason = ''
        let valid = true

        for (const validatorDef of configValidators) {
          try {
            const result = await validatorDef.validator(config, { t, validationCache: new Map() })
            if (!result.valid) {
              valid = false
              errors.push(...result.errors)
              if (result.reason) {
                reason = reason ? `${reason}; ${result.reason}` : result.reason
              }
            }
          }
          catch (error) {
            valid = false
            errors.push(error)
            reason = reason ? `${reason}; ${String(error)}` : String(error)
          }
        }

        return { errors, reason, valid }
      },
    },
    transcriptionFeatures,
  }
}
