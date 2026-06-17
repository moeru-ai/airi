import type { ComposerTranslation } from 'vue-i18n'

import type { ModelInfo, ProviderDefinition } from '../../libs/providers/types'
import type { ProviderMetadata } from '../providers'
import type { ProviderValidationPlan, ProviderValidationStep } from '../../libs/providers/validators/run'

import { listModels } from '@xsai/model'

import { CHAT_COMPLETIONS_VALIDATOR_ID, isModelProvider } from '../../libs/providers/types'
import { getValidatorsOfProvider, validateProvider } from '../../libs/providers/validators/run'

function getCategoryFromTasks(tasks: string[]): ProviderMetadata['category'] {
  if (
    tasks.some((task) => ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'].includes(task.toLowerCase()))
  ) {
    return 'transcription'
  }
  if (tasks.some((task) => ['text-to-speech', 'speech', 'tts'].includes(task.toLowerCase()))) {
    return 'speech'
  }
  if (tasks.some((task) => ['embed', 'embedding'].includes(task.toLowerCase()))) {
    return 'embed'
  }

  return 'chat'
}

function extractSchemaDefaults<TConfig>(definition: ProviderDefinition<TConfig>, t: ComposerTranslation) {
  const defaults: Record<string, unknown> = {}

  try {
    const schema = definition.createProviderConfig({ t })
    const shape = (schema as { shape?: Record<string, unknown> })?.shape

    // Zod object-level parsing fails when required fields (for example apiKey) are missing.
    // Extract each field default individually to preserve default base URLs.
    if (shape && typeof shape === 'object') {
      for (const [key, fieldSchema] of Object.entries(shape)) {
        const parsedField = (
          fieldSchema as { safeParse?: (value: unknown) => { success: boolean; data?: unknown } }
        )?.safeParse?.(undefined)
        if (parsedField?.success) {
          defaults[key] = parsedField.data
        }
      }
    }

    const parsed = (schema as { safeParse?: (value: unknown) => { success: boolean; data?: unknown } })?.safeParse?.({})
    if (parsed?.success && typeof parsed.data === 'object' && parsed.data !== null) {
      Object.assign(defaults, parsed.data as Record<string, unknown>)
    }
    // eslint-disable-next-line no-empty
  } catch {
    // noop
  }

  return defaults
}

function buildConfigValidationResult(plan: ProviderValidationPlan) {
  const invalidSteps = plan.steps.filter(
    (step: ProviderValidationStep) => step.kind === 'config' && step.status === 'invalid',
  )
  if (invalidSteps.length === 0) {
    return {
      errors: [],
      reason: '',
      valid: true,
    }
  }

  const reasons = invalidSteps.map((step: ProviderValidationStep) => step.reason).filter(Boolean)
  return {
    errors: invalidSteps.map((step: ProviderValidationStep) => new Error(step.reason || `${step.id} is invalid`)),
    reason: reasons.join('; '),
    valid: false,
  }
}

function mapModelsToMetadataModels(providerId: string, models: ModelInfo[]) {
  return models.map((model: ModelInfo) => {
    return {
      id: model.id,
      name: model.name || model.id,
      provider: providerId,
      description: model.description || '',
      contextLength: model.contextLength ?? 0,
      deprecated: model.deprecated ?? false,
    }
  })
}

function appendUniqueReason(reasons: string[], next: string) {
  if (!next) return
  if (!reasons.includes(next)) reasons.push(next)
}

export function convertProviderDefinitionToMetadata<TConfig>(
  definition: ProviderDefinition<TConfig>,
  t: ComposerTranslation,
  options: {
    fallbackDefaultOptions?: ProviderMetadata['defaultOptions']
  } = {},
): ProviderMetadata {
  const keyExtractor = (input: string): string => input
  const category = getCategoryFromTasks(definition.tasks)
  const schemaDefaults = extractSchemaDefaults(definition, t)
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
    requiresCredentials: definition.requiresCredentials,
    onboardingFields: definition.onboardingFields?.({ t }),
    defaultOptions: () => {
      if (Object.keys(schemaDefaults).length > 0) {
        return { ...schemaDefaults }
      }

      return options.fallbackDefaultOptions?.() || {}
    },
    createProvider: async (config: TConfig) => await definition.createProvider(config),
    capabilities: {
      listModels: definition.extraMethods?.listModels
        ? async (config: TConfig) => {
            const provider = await definition.createProvider(config)
            try {
              const models = await definition.extraMethods!.listModels!(config, provider)
              return mapModelsToMetadataModels(definition.id, models)
            } finally {
              await (provider as { dispose?: () => Promise<void> | void }).dispose?.()
            }
          }
        : async (config: TConfig) => {
            const provider = await definition.createProvider(config)
            try {
              if (isModelProvider(provider)) {
                const models = await listModels(provider.model())
                return mapModelsToMetadataModels(definition.id, models as unknown as ModelInfo[])
              }

              const baseUrl =
                typeof (config as { baseUrl?: unknown }).baseUrl === 'string'
                  ? (config as { baseUrl?: string }).baseUrl.trim()
                  : ''
              const apiKey =
                typeof (config as { apiKey?: unknown }).apiKey === 'string'
                  ? (config as { apiKey?: string }).apiKey.trim()
                  : ''
              if (!baseUrl) return []

              const models = await listModels({
                baseURL: baseUrl,
                ...(apiKey ? { apiKey } : {}),
              })
              return mapModelsToMetadataModels(definition.id, models as ModelInfo[])
            } catch {
              return []
            } finally {
              await (provider as { dispose?: () => Promise<void> | void }).dispose?.()
            }
          },
      listVoices: definition.extraMethods?.listVoices
        ? async (config: TConfig, model?: string) => {
            const provider = await definition.createProvider(config)
            try {
              return await definition.extraMethods!.listVoices!(config, provider, model)
            } finally {
              await (provider as { dispose?: () => Promise<void> | void }).dispose?.()
            }
          }
        : undefined,
      loadModel: definition.extraMethods?.loadModel
        ? async (config: TConfig, hooks?: { onProgress?: (progress: unknown) => Promise<void> | void }) => {
            const provider = await definition.createProvider(config)
            try {
              await definition.extraMethods!.loadModel!(config, provider, hooks)
            } finally {
              await (provider as { dispose?: () => Promise<void> | void }).dispose?.()
            }
          }
        : undefined,
    },
    validators: {
      chatPingCheckAvailable:
        !definition.disableChatPingCheckUI &&
        (definition.validators?.validateProvider || []).some((creator) =>
          creator({ t }).id.includes(CHAT_COMPLETIONS_VALIDATOR_ID),
        ),
      validateProviderConfig: async (config, options) => {
        // onlyChatPingCheck: skip all validators except chat completions.
        // Used by the manual "Test Generation" button on settings pages.
        if (options?.onlyChatPingCheck) {
          const plan = getValidatorsOfProvider({
            definition,
            config,
            schemaDefaults,
            contextOptions: { t },
          })
          plan.configValidators = []
          plan.providerValidators = plan.providerValidators.filter((v) => v.id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))
          plan.steps = plan.steps.filter((s) => s.id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))

          if (plan.providerValidators.length === 0) {
            return { errors: [], reason: '', valid: true }
          }

          await validateProvider(plan, { t })
          const invalidSteps = plan.steps.filter((step) => step.status === 'invalid')
          return {
            errors: invalidSteps.map((step) => new Error(step.reason || `${step.id} is invalid`)),
            reason: invalidSteps
              .map((step) => step.reason)
              .filter(Boolean)
              .join('; '),
            valid: invalidSteps.length === 0,
          }
        }

        const plan = getValidatorsOfProvider({
          definition,
          config,
          schemaDefaults,
          contextOptions: { t },
        })

        if (options?.skipChatPingCheck) {
          plan.providerValidators = plan.providerValidators.filter((v) => !v.id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))
          plan.steps = plan.steps.filter((s) => !s.id.includes(CHAT_COMPLETIONS_VALIDATOR_ID))
        }

        // Run full validation pipeline (config + provider validators) only when required.
        // This preserves strict config checks while avoiding unnecessary network checks.
        if (plan.shouldValidate) {
          await validateProvider(plan, { t })
          const invalidSteps = plan.steps.filter((step) => step.status === 'invalid')
          if (invalidSteps.length === 0) {
            return {
              errors: [],
              reason: '',
              valid: true,
            }
          }

          const reasons = invalidSteps.map((step) => step.reason).filter(Boolean)
          const hasMissingBaseUrlError = reasons.some((reason) => reason.includes('Base URL is required'))
          const defaultBaseUrl = typeof schemaDefaults.baseUrl === 'string' ? schemaDefaults.baseUrl.trim() : ''
          if (hasMissingBaseUrlError && defaultBaseUrl) {
            appendUniqueReason(reasons, `Default to ${defaultBaseUrl}.`)
          }

          const connectivityFailed = invalidSteps.some((step) => step.id === 'openai-compatible:check-connectivity')
          if (connectivityFailed) {
            const troubleshooting =
              definition.business?.({ t })?.troubleshooting?.validators?.openaiCompatibleCheckConnectivity?.content ||
              ''
            if (troubleshooting) {
              appendUniqueReason(reasons, troubleshooting)
            }
          }

          return {
            errors: invalidSteps.map((step) => new Error(step.reason || `${step.id} is invalid`)),
            reason: reasons.join('; '),
            valid: false,
          }
        }

        await validateProvider(plan, { t })
        return buildConfigValidationResult(plan)
      },
    },
    transcriptionFeatures: definition.capabilities?.transcription
      ? {
          supportsGenerate: definition.capabilities.transcription.generateOutput,
          supportsStreamOutput: definition.capabilities.transcription.streamOutput,
          supportsStreamInput: definition.capabilities.transcription.streamInput,
        }
      : undefined,
  } as unknown as ProviderMetadata
}

export function convertProviderDefinitionsToMetadata<TConfig>(
  definitions: ProviderDefinition<TConfig>[],
  t: ComposerTranslation,
  currentMetadata: Record<string, ProviderMetadata>,
) {
  const translated: Record<string, ProviderMetadata> = {}

  for (const definition of definitions) {
    translated[definition.id] = convertProviderDefinitionToMetadata(definition, t, {
      fallbackDefaultOptions: currentMetadata[definition.id]?.defaultOptions,
    })
  }

  return translated
}
