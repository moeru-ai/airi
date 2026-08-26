import type { ChatRequestOptions } from '../../types'

import { createOllama } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

type OllamaReasoningEffort = 'high' | 'low' | 'medium' | 'none'
type OllamaThinkingMode = 'auto' | 'disable' | 'enable' | 'high' | 'low' | 'medium'

const ollamaConfigSchema = z.object({
  baseUrl: z.string()
    .default('http://localhost:11434/v1/'),
  headers: z.record(z.string(), z.string())
    .optional(),
  thinkingMode: z.enum(['auto', 'disable', 'enable', 'low', 'medium', 'high'])
    .default('auto'),
})

type OllamaConfig = z.input<typeof ollamaConfigSchema>

/**
 * Maps the persisted Ollama setting to its OpenAI-compatible effort value.
 *
 * @example
 * resolveOllamaReasoningEffort('disable')
 * // => 'none'
 */
export function resolveOllamaReasoningEffort(modeRaw: unknown): OllamaReasoningEffort | undefined {
  const mode = normalizeOllamaThinkingMode(modeRaw)

  switch (mode) {
    case 'auto':
      return undefined
    case 'disable':
      return 'none'
    case 'enable':
      return 'medium'
    case 'high':
    case 'low':
    case 'medium':
      return mode
    default:
      return undefined
  }
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

export const providerOllama = defineProvider<OllamaConfig>({
  business: ({ t }) => ({
    troubleshooting: {
      validators: {
        openaiCompatibleCheckConnectivity: {
          content: t('settings.pages.providers.catalog.edit.providers.provider.ollama.troubleshooting.validators.openai-compatible-check-connectivity.content'),
          label: t('settings.pages.providers.catalog.edit.providers.provider.ollama.troubleshooting.validators.openai-compatible-check-connectivity.label'),
        },
      },
    },
  }),
  capabilities: { chat: { reasoning: { modes: ['enabled', 'disabled'] } } },
  createProvider(config) {
    const baseProvider = createOllama('', config.baseUrl)

    return {
      ...baseProvider,
      chat(model: string, options?: ChatRequestOptions) {
        const chatOptions = baseProvider.chat(model)
        if (options?.reasoning) {
          return {
            ...chatOptions,
            reasoningEffort: options.reasoning === 'enabled' ? 'medium' : 'none',
          }
        }

        const reasoningEffort = resolveOllamaReasoningEffort(config.thinkingMode)

        if (reasoningEffort === undefined)
          return chatOptions

        return { ...chatOptions, reasoningEffort }
      },
    }
  },
  createProviderConfig: ({ t }) => ollamaConfigSchema.extend({
    baseUrl: ollamaConfigSchema.shape.baseUrl
      .meta({
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
        placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
      }),
    headers: ollamaConfigSchema.shape.headers
      .meta({
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.headers.description'),
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.headers.label'),
        section: 'advanced',
        type: 'key-values',
      }),
    thinkingMode: ollamaConfigSchema.shape.thinkingMode
      .meta({
        descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.description'),
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.label'),
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
        section: 'advanced',
        type: 'select',
      }),
  }),
  description: 'Local Ollama server for fast model iteration.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.ollama.description'),
  icon: 'i-lobe-icons:ollama',
  id: 'ollama',
  name: 'Ollama',

  nameLocalize: ({ t }) => t('settings.pages.providers.provider.ollama.title'),
  order: 2,
  tasks: ['chat'],
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
      connectivityFailureReason: ({ errorMessage }) =>
        `Failed to reach Ollama server, error: ${errorMessage} occurred.\n\nIf you are using Ollama locally, this is likely the CORS (Cross-Origin Resource Sharing) security issue, where you will need to set OLLAMA_ORIGINS=* or OLLAMA_ORIGINS=https://airi.moeru.ai,http://localhost environment variable before launching Ollama server to make this work.`,
      schedule: {
        intervalMs: 15_000,
        mode: 'interval',
      },
    })!.validateProvider,
  },
})
