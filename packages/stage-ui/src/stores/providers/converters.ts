import type { ComposerTranslation } from 'vue-i18n'

import type { ProviderDefinition } from '../../libs/providers/types'
import type { ProviderValidationPlan } from '../../libs/providers/validators/run'
import type { ProviderMetadata } from '../providers'

import { getValidatorsOfProvider, validateProvider } from '../../libs/providers/validators/run'

function getCategoryFromTasks(tasks: string[]): ProviderMetadata['category'] {
  if (tasks.some(task => ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'].includes(task.toLowerCase()))) {
    return 'transcription'
  }
  if (tasks.some(task => ['text-to-speech', 'speech', 'tts'].includes(task.toLowerCase()))) {
    return 'speech'
  }
  if (tasks.some(task => ['embed', 'embedding'].includes(task.toLowerCase()))) {
    return 'embed'
  }

  return 'chat'
}

function extractSchemaDefaults(definition: ProviderDefinition<any>, t: ComposerTranslation) {
  try {
    const schema = definition.createProviderConfig({ t })
    const parsed = (schema as any).safeParse?.({})
    if (parsed?.success && typeof parsed.data === 'object' && parsed.data !== null) {
      return parsed.data as Record<string, unknown>
    }
  }
  catch {
  }
  return {}
}

function buildConfigValidationResult(plan: ProviderValidationPlan) {
  const invalidSteps = plan.steps.filter(step => step.kind === 'config' && step.status === 'invalid')
  if (invalidSteps.length === 0) {
    return {
      errors: [],
      reason: '',
      valid: true,
    }
  }

  const reasons = invalidSteps.map(step => step.reason).filter(Boolean)
  return {
    errors: invalidSteps.map(step => new Error(step.reason || `${step.id} is invalid`)),
    reason: reasons.join('; '),
    valid: false,
  }
}

export function convertProviderDefinitionToMetadata(
  definition: ProviderDefinition<any>,
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
    defaultOptions: () => {
      if (Object.keys(schemaDefaults).length > 0) {
        return { ...schemaDefaults }
      }

      return options.fallbackDefaultOptions?.() || {}
    },
    createProvider: async config => await definition.createProvider(config as any) as any,
    capabilities: {
      listModels: definition.extraMethods?.listModels
        ? async (config) => {
          const provider = await definition.createProvider(config as any)
          try {
            return await definition.extraMethods!.listModels!(config as any, provider)
          }
          finally {
            await (provider as { dispose?: () => Promise<void> | void }).dispose?.()
          }
        }
        : undefined,
      listVoices: definition.extraMethods?.listVoices
        ? async (config) => {
          const provider = await definition.createProvider(config as any)
          try {
            return await definition.extraMethods!.listVoices!(config as any, provider)
          }
          finally {
            await (provider as { dispose?: () => Promise<void> | void }).dispose?.()
          }
        }
        : undefined,
      loadModel: definition.extraMethods?.loadModel
        ? async (config, hooks) => {
          const provider = await definition.createProvider(config as any)
          try {
            await definition.extraMethods!.loadModel!(config as any, provider, hooks)
          }
          finally {
            await (provider as { dispose?: () => Promise<void> | void }).dispose?.()
          }
        }
        : undefined,
    },
    validators: {
      validateProviderConfig: async (config) => {
        const plan = getValidatorsOfProvider({
          definition,
          config,
          schemaDefaults,
          contextOptions: { t },
        })

        // Run full validation pipeline (config + provider validators) only when required.
        // This preserves strict config checks while avoiding unnecessary network checks.
        if (plan.shouldValidate) {
          await validateProvider(plan, { t })
          const invalidSteps = plan.steps.filter(step => step.status === 'invalid')
          if (invalidSteps.length === 0) {
            return {
              errors: [],
              reason: '',
              valid: true,
            }
          }

          return {
            errors: invalidSteps.map(step => new Error(step.reason || `${step.id} is invalid`)),
            reason: invalidSteps.map(step => step.reason).filter(Boolean).join('; '),
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
  }
}

export function convertProviderDefinitionsToMetadata(
  definitions: ProviderDefinition<any>[],
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
