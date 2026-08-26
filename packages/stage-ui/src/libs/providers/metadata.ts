import type { ComposerTranslation } from 'vue-i18n'

import type { ProviderDeployment, ProviderPricing } from './attributes'
import type { ProviderDefinition, ProviderOnboardingField } from './types'

import { getSchemaDefault } from '../zod'
import { resolveProviderAttributes } from './attributes'

/** Inference category used to group provider definitions in the UI. */
export type ProviderCategory = 'chat' | 'embed' | 'speech' | 'transcription' | 'vision'

/**
 * Serializable UI metadata selected from a provider definition.
 *
 * Executable fields stay on {@link ProviderDefinition}. This object is safe to
 * store in Pinia state and copy across renderer contexts.
 */
export interface ProviderMetadata extends Pick<ProviderDefinition, ProviderMetadataField> {
  beginnerRecommended?: boolean
  category: ProviderCategory
  configured: boolean
  defaultConfig: Record<string, unknown>
  deployment?: ProviderDeployment
  descriptionKey: string
  localizedDescription: string
  localizedName: string
  nameKey: string
  onboardingFields?: ProviderOnboardingField[]
  pricing?: ProviderPricing
  to?: string
  transcriptionFeatures?: {
    supportsGenerate: boolean
    supportsStreamInput: boolean
    supportsStreamOutput: boolean
  }
}

type ProviderMetadataField
  = | 'description'
    | 'icon'
    | 'iconColor'
    | 'iconImage'
    | 'id'
    | 'name'
    | 'order'
    | 'requiresCredentials'
    | 'tasks'

/** Classifies a provider from its declared inference tasks. */
export function getProviderCategory(tasks: string[]): ProviderCategory {
  if (tasks.some(task => ['image-to-text', 'image-understanding', 'multimodal', 'vision'].includes(task.toLowerCase())))
    return 'vision'
  if (tasks.some(task => ['asr', 'automatic-speech-recognition', 'speech-to-text', 'stt'].includes(task.toLowerCase())))
    return 'transcription'
  if (tasks.some(task => ['speech', 'text-to-speech', 'tts'].includes(task.toLowerCase())))
    return 'speech'
  if (tasks.some(task => ['embed', 'embedding'].includes(task.toLowerCase())))
    return 'embed'
  return 'chat'
}

/** Selects the serializable metadata fields of a provider definition. */
export async function selectProviderMetadata(
  definition: ProviderDefinition,
  t: ComposerTranslation,
  options: {
    category?: ProviderCategory
    configured?: boolean
    id?: string
    tasks?: string[]
    to?: string
  } = {},
): Promise<ProviderMetadata> {
  const key = (input: string): string => input
  const tasks = options.tasks ?? definition.tasks
  const transcription = definition.capabilities?.transcription

  const schema = await definition.createProviderConfig({ t })
  const onboardingFields = definition.onboardingFields
    ? await definition.onboardingFields({ t })
    : undefined

  return {
    category: options.category ?? getProviderCategory(tasks),
    id: options.id ?? definition.id,
    order: definition.order,
    tasks: [...tasks],
    ...(options.to ? { to: options.to } : {}),
    configured: options.configured ?? false,
    defaultConfig: getSchemaDefault(schema) as Record<string, unknown>,
    description: definition.description,
    descriptionKey: definition.descriptionLocalize({ t: key }),
    localizedDescription: definition.descriptionLocalize({ t }),
    localizedName: definition.nameLocalize({ t }),
    name: definition.name,
    nameKey: definition.nameLocalize({ t: key }),
    ...(definition.icon ? { icon: definition.icon } : {}),
    ...(definition.iconColor ? { iconColor: definition.iconColor } : {}),
    ...(definition.iconImage ? { iconImage: definition.iconImage } : {}),
    ...(definition.requiresCredentials !== undefined ? { requiresCredentials: definition.requiresCredentials } : {}),
    ...(onboardingFields ? { onboardingFields } : {}),
    ...(transcription
      ? {
          transcriptionFeatures: {
            supportsGenerate: transcription.generateOutput,
            supportsStreamInput: transcription.streamInput,
            supportsStreamOutput: transcription.streamOutput,
          },
        }
      : {}),
    ...resolveProviderAttributes(definition),
  }
}

/** Selects serializable metadata for a provider definition list. */
export async function selectProvidersMetadata(definitions: ProviderDefinition[], t: ComposerTranslation) {
  return Object.fromEntries(await Promise.all(definitions.map(async definition => [
    definition.id,
    await selectProviderMetadata(definition, t),
  ] as const)))
}
