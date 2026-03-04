import type { ModelInfo } from '../../types'

import { createMinimax, createMinimaxCn } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'

const minimaxCnConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.minimaxi.com/v1/'),
})

type MinimaxCnConfig = z.input<typeof minimaxCnConfigSchema>

const minimaxGlobalConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.minimax.io/v1/'),
})

type MinimaxGlobalConfig = z.input<typeof minimaxGlobalConfigSchema>

const minimaxModels: ModelInfo[] = [
  {
    id: 'MiniMax-M2.5',
    name: 'MiniMax M2.5',
    provider: 'minimax',
    description: 'Top performance and cost-effectiveness for complex tasks',
  },
  {
    id: 'MiniMax-M2.5-highspeed',
    name: 'MiniMax M2.5 Highspeed',
    provider: 'minimax',
    description: 'M2.5 high-speed version with same quality',
  },
  {
    id: 'MiniMax-M2.1',
    name: 'MiniMax M2.1',
    provider: 'minimax',
    description: 'Strong multilingual programming capabilities',
  },
  {
    id: 'MiniMax-M2.1-highspeed',
    name: 'MiniMax M2.1 Highspeed',
    provider: 'minimax',
    description: 'M2.1 high-speed version with same quality',
  },
  {
    id: 'M2-her',
    name: 'MiniMax M2-her',
    provider: 'minimax',
    description: 'Specialized for roleplay and multi-turn dialogue',
  },
  {
    id: 'MiniMax-M2',
    name: 'MiniMax M2',
    provider: 'minimax',
    description: 'Designed for efficient coding and agent workflows',
  },
]

export const providerMinimax = defineProvider<MinimaxCnConfig>({
  id: 'minimax',
  name: 'MiniMax',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.minimax.title'),
  description: 'minimaxi.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.minimax.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:minimax',
  iconColor: 'i-lobe-icons:minimax-color',

  createProviderConfig: ({ t }) => minimaxCnConfigSchema.extend({
    apiKey: minimaxCnConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: minimaxCnConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createMinimaxCn(config.apiKey, config.baseUrl)
  },

  extraMethods: {
    listModels: async () => minimaxModels,
  },
  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: ['connectivity'],
    }),
  },
})

export const providerMinimaxGlobal = defineProvider<MinimaxGlobalConfig>({
  id: 'minimax-global',
  name: 'MiniMax Global',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.minimax-global.title'),
  description: 'minimax.io',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.minimax-global.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:minimax',
  iconColor: 'i-lobe-icons:minimax-color',

  createProviderConfig: ({ t }) => minimaxGlobalConfigSchema.extend({
    apiKey: minimaxGlobalConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: minimaxGlobalConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createMinimax(config.apiKey, config.baseUrl)
  },

  extraMethods: {
    listModels: async () => minimaxModels.map(m => ({ ...m, provider: 'minimax-global' })),
  },
  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: ['connectivity'],
    }),
  },
})
