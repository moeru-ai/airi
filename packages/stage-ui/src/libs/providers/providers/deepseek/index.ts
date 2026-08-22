import { createDeepSeek } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { chatThinkingCapabilities } from '../../thinking'
import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

type DeepSeekThinkingMode = 'auto' | 'disable' | 'enable'

const deepSeekConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://api.deepseek.com/'),
  thinkingMode: z.enum(['auto', 'disable', 'enable'])
    .default('auto'),
})

type DeepSeekConfig = z.input<typeof deepSeekConfigSchema>

function normalizeDeepSeekThinkingMode(value: unknown): DeepSeekThinkingMode {
  switch (value) {
    case 'auto':
    case 'disable':
    case 'enable':
      return value
    default:
      return 'auto'
  }
}

function resolveDeepSeekThinking(modeRaw: unknown): { type: 'disabled' | 'enabled' } | undefined {
  const mode = normalizeDeepSeekThinkingMode(modeRaw)

  switch (mode) {
    case 'auto':
      return undefined
    case 'disable':
      return { type: 'disabled' }
    case 'enable':
      return { type: 'enabled' }
    default:
      return undefined
  }
}

export const providerDeepSeek = defineProvider<DeepSeekConfig>({
  id: 'deepseek',
  order: 4,
  name: 'DeepSeek',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.deepseek.title'),
  description: 'deepseek.com',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.deepseek.description'),
  tasks: ['chat'],
  capabilities: { chat: { thinking: chatThinkingCapabilities.deepSeek } },
  icon: 'i-lobe-icons:deepseek',
  iconColor: 'i-lobe-icons:deepseek-color',

  createProviderConfig: ({ t }) => deepSeekConfigSchema.extend({
    apiKey: deepSeekConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: deepSeekConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
    thinkingMode: deepSeekConfigSchema.shape.thinkingMode.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.label'),
      descriptionLocalized: t('settings.pages.providers.provider.deepseek.fields.field.thinking-mode.description'),
      section: 'advanced',
      type: 'select',
      options: [
        {
          label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.auto'),
          value: 'auto',
        },
        {
          label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.disable'),
          value: 'disable',
        },
        {
          label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.enable'),
          value: 'enable',
        },
      ],
    }),
  }),
  createProvider(config) {
    const baseProvider = createDeepSeek(config.apiKey, config.baseUrl)

    return {
      ...baseProvider,
      chat(model: string) {
        const chatOptions = baseProvider.chat(model)
        const thinking = resolveDeepSeekThinking(config.thinkingMode)

        if (thinking === undefined)
          return chatOptions

        return { ...chatOptions, thinking }
      },
    }
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
