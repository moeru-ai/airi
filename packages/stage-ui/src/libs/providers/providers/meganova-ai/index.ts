import type { ModelInfo } from '../../types'

import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import meganovaIcon from '../../../../assets/meganova.svg'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const MEGANOVA_BASE_URL = 'https://api.meganova.ai/v1/'

const meganovaConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(MEGANOVA_BASE_URL),
})

type MeganovaConfig = z.input<typeof meganovaConfigSchema>

export const providerMeganovaAI = defineProvider<MeganovaConfig>({
  id: 'meganova-ai',
  name: 'MegaNova AI',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.meganova.title'),
  description: 'meganova.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.meganova.description'),
  tasks: ['chat'],
  iconImage: meganovaIcon,

  createProviderConfig: ({ t }) => meganovaConfigSchema.extend({
    apiKey: meganovaConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: meganovaConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createOpenAI(config.apiKey, config.baseUrl)
  },

  extraMethods: {
    async listModels(config): Promise<ModelInfo[]> {
      const baseUrl = (config.baseUrl || MEGANOVA_BASE_URL).replace(/\/$/, '')
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      })
      if (!res.ok) {
        const errorBody = await res.text().catch(() => 'Could not read error body')
        throw new Error(`Failed to list models: ${res.status} ${res.statusText} - ${errorBody}`)
      }
      const data = await res.json()
      const models = (data.data || []) as Array<{
        id: string
        name: string
        description?: string
        context_length?: number
        tags?: string[]
        architecture?: { modality?: string }
      }>

      return models
        .filter((m) => {
          const modality = m.architecture?.modality || ''
          return modality.endsWith('->text')
        })
        .sort((a, b) => {
          const aFeatured = a.tags?.includes('featured') ? 0 : 1
          const bFeatured = b.tags?.includes('featured') ? 0 : 1
          if (aFeatured !== bFeatured)
            return aFeatured - bFeatured
          return (a.name || a.id).localeCompare(b.name || b.id)
        })
        .map(m => ({
          id: m.id,
          name: m.name || m.id,
          provider: 'meganova-ai',
          description: m.description,
          contextLength: m.context_length,
        }))
    },
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: ['connectivity', 'model_list'],
    }),
  },
})
