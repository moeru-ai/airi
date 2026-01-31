import type {
  SpeechProvider,
  SpeechProviderWithExtraOptions,
  TranscriptionProvider,
  TranscriptionProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'
import type { ComposerTranslation } from 'vue-i18n'

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
  t: ComposerTranslation,
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

  // Create an identity function that returns the i18n key string without translating it.
  // Provider definitions call t(key) which would normally translate, but we need the key itself.
  // The identity function ensures that t('settings.pages.providers.provider.openai.title')
  // returns 'settings.pages.providers.provider.openai.title' instead of the translated string.
  const keyExtractor = (input: string): string => {
    return input
  }

  return {
    id: definition.id,
    order: definition.order,
    category,
    tasks: definition.tasks,
    nameKey: definition.nameLocalize({ t: keyExtractor }),
    name: definition.name,
    descriptionKey: definition.descriptionLocalize({ t: keyExtractor }),
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
    createProvider: (async (config: Record<string, unknown>) => {
      const result = await definition.createProvider(config as any)
      // Cast to the expected union type for ProviderMetadata
      // TypeScript can't infer that Promise<Union> is assignable to Union | Promise<Union>
      // so we cast as any to satisfy the type checker
      return result as any
    }) as ProviderMetadata['createProvider'],
    capabilities: {
      listModels: definition.extraMethods?.listModels
        ? async (config: Record<string, unknown>) => {
          // extraMethods.listModels requires a valid provider instance.
          // Create one (like loadModel does) to avoid fragile `{}` placeholders.
          const provider = await Promise.resolve(definition.createProvider(config as any))
          try {
            return await definition.extraMethods!.listModels!(config as any, provider)
          }
          finally {
            // Avoid leaking resources in case provider allocates connections/workers.
            await (provider as any)?.dispose?.()
          }
        }
        : undefined,
      listVoices: definition.extraMethods?.listVoices
        ? async (config: Record<string, unknown>) => {
          // extraMethods.listVoices requires a valid provider instance.
          // Create one (like loadModel does) to avoid fragile `{}` placeholders.
          const provider = await Promise.resolve(definition.createProvider(config as any))
          try {
            return await definition.extraMethods!.listVoices!(config as any, provider)
          }
          finally {
            await (provider as any)?.dispose?.()
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
          contextOptions: { t } as { t: ComposerTranslation },
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
            const result = await validatorDef.validator(config, { t: t as ComposerTranslation } as any)
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
