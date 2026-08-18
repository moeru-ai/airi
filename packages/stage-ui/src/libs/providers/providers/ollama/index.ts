import { createOllama } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

type OllamaThinkValue = boolean | 'high' | 'low' | 'medium'
type OllamaThinkingMode = 'auto' | 'disable' | 'enable' | 'high' | 'low' | 'medium'

const ollamaConfigSchema = z.object({
  baseUrl: z.string()
    .default('http://localhost:11434/v1/'),
  thinkingMode: z.enum(['auto', 'disable', 'enable', 'low', 'medium', 'high'])
    .default('auto'),
  headers: z.record(z.string(), z.string())
    .optional(),
})

type OllamaConfig = z.input<typeof ollamaConfigSchema>

function isGptOssModel(model: string): boolean {
  return model.toLowerCase().includes('gpt-oss')
}

function normalizeOllamaThinkingMode(value: unknown): OllamaThinkingMode {
  switch (value) {
    case 'auto':
    case 'disable':
    case 'enable':
    case 'high':
    case 'low':
    case 'medium':
      return value
    default:
      return 'auto'
  }
}

export function resolveOllamaThink(model: string, modeRaw: unknown): OllamaThinkValue | undefined {
  const mode = normalizeOllamaThinkingMode(modeRaw)
  const isGptOss = isGptOssModel(model)

  switch (mode) {
    case 'auto':
      return undefined
    case 'disable':
      // NOTICE: GPT-OSS ignores boolean `think`, so "disable" degrades to `low`.
      return isGptOss ? 'low' : false
    case 'enable':
      // NOTICE: GPT-OSS requires levels; map generic "enable" to medium effort.
      return isGptOss ? 'medium' : true
    case 'low':
    case 'medium':
    case 'high':
      return mode
    default:
      return undefined
  }
}

export const providerOllama = defineProvider<OllamaConfig>({
  id: 'ollama',
  order: 2,
  name: 'Ollama',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.ollama.title'),
  description: 'Local Ollama server for fast model iteration.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.ollama.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:ollama',

  createProviderConfig: ({ t }) => ollamaConfigSchema.extend({
    baseUrl: ollamaConfigSchema.shape.baseUrl
      .meta({
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
        placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
      }),
    thinkingMode: ollamaConfigSchema.shape.thinkingMode
      .meta({
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.label'),
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.description'),
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
          {
            label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.low'),
            value: 'low',
          },
          {
            label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.medium'),
            value: 'medium',
          },
          {
            label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.high'),
            value: 'high',
          },
        ],
      }),
    headers: ollamaConfigSchema.shape.headers
      .meta({
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.headers.label'),
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.headers.description'),
        section: 'advanced',
        type: 'key-values',
      }),
  }),
  createProvider(config) {
    const baseProvider = createOllama('', config.baseUrl)

    return {
      ...baseProvider,
      chat(model: string) {
        const chatOptions = baseProvider.chat(model)
        const think = resolveOllamaThink(model, config.thinkingMode)

        if (think === undefined)
          return chatOptions

        return { ...chatOptions, think }
      },
    }
  },
  validationRequiredWhen: () => true,
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'ollama:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const errors: Array<{ error: unknown }> = []
          const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

          if (!baseUrl)
            errors.push({ error: new Error('Base URL is required.') })

          if (baseUrl) {
            try {
              const parsed = new URL(baseUrl)
              if (!parsed.host)
                errors.push({ error: new Error('Base URL is not absolute. Check your input.') })
            }
            catch {
              errors.push({ error: new Error('Base URL is invalid. It must be an absolute URL.') })
            }
          }

          return {
            errors,
            reason: errors.length > 0 ? errors.map(item => (item.error as Error).message).join(', ') : '',
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
    validateProvider: createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
      schedule: {
        mode: 'interval',
        intervalMs: 15_000,
      },
      connectivityFailureReason: ({ errorMessage }) =>
        `Failed to reach Ollama server, error: ${errorMessage} occurred.\n\nIf you are using Ollama locally, this is likely the CORS (Cross-Origin Resource Sharing) security issue, where you will need to set OLLAMA_ORIGINS=* or OLLAMA_ORIGINS=https://airi.moeru.ai,http://localhost environment variable before launching Ollama server to make this work.`,
    })!.validateProvider,
  },
  business: ({ t }) => ({
    troubleshooting: {
      validators: {
        openaiCompatibleCheckConnectivity: {
          label: t('settings.pages.providers.catalog.edit.providers.provider.ollama.troubleshooting.validators.openai-compatible-check-connectivity.label'),
          content: t('settings.pages.providers.catalog.edit.providers.provider.ollama.troubleshooting.validators.openai-compatible-check-connectivity.content'),
        },
      },
    },
  }),
})
