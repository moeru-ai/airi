import type { ComposerTranslation } from 'vue-i18n'

import type { ProviderDeployment, ProviderPricing } from './attributes'
import type { ProviderDefinition, ProviderOnboardingField } from './types'

import { getSchemaDefault } from '../zod'
import { resolveProviderAttributes } from './attributes'

/** Inference category used to group provider definitions in the UI. */
export type ProviderCategory = 'chat' | 'embed' | 'speech' | 'transcription' | 'vision'

type ProviderMetadataField
  = | 'id'
    | 'order'
    | 'tasks'
    | 'name'
    | 'description'
    | 'icon'
    | 'iconColor'
    | 'iconImage'
    | 'requiresCredentials'

/**
 * Serializable UI metadata selected from a provider definition.
 *
 * Executable fields stay on {@link ProviderDefinition}. This object is safe to
 * store in Pinia state and copy across renderer contexts.
 */
export interface ProviderMetadata extends Pick<ProviderDefinition, ProviderMetadataField> {
  category: ProviderCategory
  to?: string
  nameKey: string
  localizedName: string
  descriptionKey: string
  localizedDescription: string
  configured: boolean
  defaultConfig: Record<string, unknown>
  onboardingFields?: ProviderOnboardingField[]
  transcriptionFeatures?: {
    supportsGenerate: boolean
    supportsStreamOutput: boolean
    supportsStreamInput: boolean
  }
  pricing?: ProviderPricing
  deployment?: ProviderDeployment
  beginnerRecommended?: boolean
}

/** Classifies a provider from its declared inference tasks. */
export function getProviderCategory(tasks: string[]): ProviderCategory {
  if (tasks.some(task => ['vision', 'image-understanding', 'image-to-text', 'multimodal'].includes(task.toLowerCase())))
    return 'vision'
  if (tasks.some(task => ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'].includes(task.toLowerCase())))
    return 'transcription'
  if (tasks.some(task => ['text-to-speech', 'speech', 'tts'].includes(task.toLowerCase())))
    return 'speech'
  if (tasks.some(task => ['embed', 'embedding'].includes(task.toLowerCase())))
    return 'embed'
  return 'chat'
}

/** Selects the serializable metadata fields of a provider definition. */
export function selectProviderMetadata(
  definition: ProviderDefinition,
  t: ComposerTranslation,
  options: {
    category?: ProviderCategory
    configured?: boolean
    id?: string
    tasks?: string[]
    to?: string
  } = {},
): ProviderMetadata {
  const key = (input: string): string => input
  const tasks = options.tasks ?? definition.tasks
  const transcription = definition.capabilities?.transcription

  return {
    id: options.id ?? definition.id,
    order: definition.order,
    tasks: [...tasks],
    category: options.category ?? getProviderCategory(tasks),
    ...(options.to ? { to: options.to } : {}),
    name: definition.name,
    nameKey: definition.nameLocalize({ t: key }),
    localizedName: definition.nameLocalize({ t }),
    description: definition.description,
    descriptionKey: definition.descriptionLocalize({ t: key }),
    localizedDescription: definition.descriptionLocalize({ t }),
    configured: options.configured ?? false,
    defaultConfig: getSchemaDefault(definition.createProviderConfig({ t })) as Record<string, unknown>,
    ...(definition.icon ? { icon: definition.icon } : {}),
    ...(definition.iconColor ? { iconColor: definition.iconColor } : {}),
    ...(definition.iconImage ? { iconImage: definition.iconImage } : {}),
    ...(definition.requiresCredentials !== undefined ? { requiresCredentials: definition.requiresCredentials } : {}),
    ...(definition.onboardingFields ? { onboardingFields: definition.onboardingFields({ t }) } : {}),
    ...(transcription
      ? {
          transcriptionFeatures: {
            supportsGenerate: transcription.generateOutput,
            supportsStreamOutput: transcription.streamOutput,
            supportsStreamInput: transcription.streamInput,
          },
        }
      : {}),
    ...resolveProviderAttributes(definition),
  }
}

/** Selects serializable metadata for a provider definition list. */
export function selectProvidersMetadata(definitions: ProviderDefinition[], t: ComposerTranslation) {
  return Object.fromEntries(definitions.map(definition => [
    definition.id,
    selectProviderMetadata(definition, t),
  ]))
}
