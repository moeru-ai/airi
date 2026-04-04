import type { ComposerTranslation } from 'vue-i18n'

import type { ProviderValidationResult } from '../../types'

import { errorMessageFrom } from '@moeru/std'
import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { defineProvider } from '../registry'
import { fetchNanobot } from './fetch'
import {
  buildNanobotSessionId,
  mapNanobotConfiguredModel,
  resolveNanobotApiBaseUrl,
  resolveNanobotHealthUrl,
  resolveNanobotModel,
} from './shared'

const NANOBOT_PROVIDER_ID = 'nanobot'
const NANOBOT_DEFAULT_BASE_URL = 'http://127.0.0.1:8900/v1'

const nanobotConfigSchema = z.object({
  apiKey: z.string('API Key').default('dummy'),
  baseUrl: z.string('Base URL').default(NANOBOT_DEFAULT_BASE_URL),
  model: z.string('Model').default('gemma-4-26B-A4B-it-heretic-ara.Q4_K_M.gguf'),
  sessionIdStrategy: z.enum(['auto', 'manual']).default('auto'),
  sessionId: z.string('Session ID').optional(),
})

type NanobotConfig = z.input<typeof nanobotConfigSchema>

function buildNanobotHeaders(config: NanobotConfig): HeadersInit {
  return {
    'Authorization': `Bearer ${(config.apiKey || '').trim() || 'dummy'}`,
    'Content-Type': 'application/json',
  }
}

async function runNanobotHealthCheck(config: NanobotConfig): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetchNanobot(resolveNanobotHealthUrl(config.baseUrl), {
      method: 'GET',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Nanobot health check failed: HTTP ${response.status}`)
    }
  }
  finally {
    clearTimeout(timeout)
  }
}

async function runNanobotChatCheck(config: NanobotConfig): Promise<void> {
  const model = resolveNanobotModel(config.model)
  if (!model) {
    throw new Error('Model is required.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetchNanobot(`${resolveNanobotApiBaseUrl(config.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: buildNanobotHeaders(config),
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: 'ping' },
        ],
        session_id: buildNanobotSessionId({
          fallbackSessionId: 'validation',
          platform: 'validation',
          sessionId: config.sessionId,
          sessionIdStrategy: config.sessionIdStrategy,
        }),
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Nanobot chat validation failed: HTTP ${response.status}${errorText ? ` - ${errorText}` : ''}`)
    }

    const payload = await response.json().catch(() => null) as any
    const content = payload?.choices?.[0]?.message?.content

    if (typeof content !== 'string') {
      throw new TypeError('Nanobot chat validation returned an invalid response payload.')
    }
  }
  finally {
    clearTimeout(timeout)
  }
}

function createNanobotConfigValidator(t: ComposerTranslation) {
  return async (config: NanobotConfig): Promise<ProviderValidationResult> => {
    const errors: Array<{ error: unknown }> = []
    const apiKey = (config.apiKey || '').trim()
    const baseUrl = (config.baseUrl || '').trim()
    const manualSessionId = (config.sessionId || '').trim()

    if (!apiKey) {
      errors.push({ error: new Error('API key is required.') })
    }

    if (!baseUrl) {
      errors.push({ error: new Error('Base URL is required.') })
    }
    else {
      try {
        const parsed = new URL(baseUrl)
        if (!parsed.host) {
          errors.push({ error: new Error('Base URL is not absolute. Check your input.') })
        }
      }
      catch {
        errors.push({ error: new Error('Base URL is invalid. It must be an absolute URL.') })
      }
    }

    if (config.sessionIdStrategy === 'manual' && !manualSessionId) {
      errors.push({ error: new Error('Session ID is required when session ID strategy is manual.') })
    }

    return {
      errors,
      reason: errors.length > 0 ? errors.map(item => errorMessageFrom(item.error) ?? String(item.error)).join(', ') : '',
      reasonKey: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
      valid: errors.length === 0,
    }
  }
}

export const providerNanobot = defineProvider<NanobotConfig>({
  id: NANOBOT_PROVIDER_ID,
  order: 3,
  name: 'Nanobot',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.nanobot.title'),
  description: 'Local Nanobot OpenAI-compatible bridge for AIRI chat.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.nanobot.description'),
  tasks: ['chat'],
  icon: 'i-solar:cpu-bolt-bold-duotone',
  disableChatPingCheckUI: false,
  createProviderConfig: ({ t }) => nanobotConfigSchema.extend({
    apiKey: nanobotConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.provider.nanobot.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: nanobotConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.provider.nanobot.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.provider.nanobot.fields.field.base-url.placeholder'),
    }),
    model: nanobotConfigSchema.shape.model.meta({
      labelLocalized: t('settings.pages.providers.provider.nanobot.fields.field.model.label'),
      descriptionLocalized: t('settings.pages.providers.provider.nanobot.fields.field.model.description'),
      placeholderLocalized: t('settings.pages.providers.provider.nanobot.fields.field.model.placeholder'),
    }),
    sessionIdStrategy: nanobotConfigSchema.shape.sessionIdStrategy.meta({
      labelLocalized: t('settings.pages.providers.provider.nanobot.fields.field.session-id-strategy.label'),
      descriptionLocalized: t('settings.pages.providers.provider.nanobot.fields.field.session-id-strategy.description'),
      options: [
        {
          label: t('settings.pages.providers.provider.nanobot.fields.field.session-id-strategy.options.auto'),
          value: 'auto',
        },
        {
          label: t('settings.pages.providers.provider.nanobot.fields.field.session-id-strategy.options.manual'),
          value: 'manual',
        },
      ],
    }),
    sessionId: nanobotConfigSchema.shape.sessionId.meta({
      labelLocalized: t('settings.pages.providers.provider.nanobot.fields.field.session-id.label'),
      descriptionLocalized: t('settings.pages.providers.provider.nanobot.fields.field.session-id.description'),
      placeholderLocalized: t('settings.pages.providers.provider.nanobot.fields.field.session-id.placeholder'),
    }),
  }),
  createProvider(config) {
    const baseUrl = resolveNanobotApiBaseUrl(config.baseUrl)
    const apiKey = (config.apiKey || '').trim() || 'dummy'
    return createOpenAI(apiKey, baseUrl)
  },
  extraMethods: {
    async listModels(config) {
      return mapNanobotConfiguredModel(NANOBOT_PROVIDER_ID, config.model || '')
    },
  },
  validationRequiredWhen(config) {
    return Boolean(config.baseUrl?.trim() || config.apiKey?.trim())
  },
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'nanobot:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: createNanobotConfigValidator(t),
      }),
    ],
    validateProvider: [
      ({ t }) => ({
        id: 'nanobot:check-connectivity',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
        schedule: { mode: 'interval', intervalMs: 60_000 },
        async validator(config) {
          try {
            await runNanobotHealthCheck(config)
            return {
              errors: [],
              reason: '',
              reasonKey: '',
              valid: true,
            }
          }
          catch (error) {
            return {
              errors: [{ error }],
              reason: errorMessageFrom(error) ?? 'Nanobot health check failed.',
              reasonKey: '',
              valid: false,
            }
          }
        },
      }),
      ({ t }) => ({
        id: 'nanobot:check-chat-completions',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-supports-chat-completion.title'),
        async validator(config) {
          try {
            await runNanobotChatCheck(config)
            return {
              errors: [],
              reason: '',
              reasonKey: '',
              valid: true,
            }
          }
          catch (error) {
            return {
              errors: [{ error }],
              reason: errorMessageFrom(error) ?? 'Nanobot chat validation failed.',
              reasonKey: '',
              valid: false,
            }
          }
        },
      }),
    ],
  },
  business: ({ t }) => ({
    troubleshooting: {
      validators: {
        openaiCompatibleCheckConnectivity: {
          label: t('settings.pages.providers.provider.nanobot.troubleshooting.validators.openai-compatible-check-connectivity.label'),
          content: t('settings.pages.providers.provider.nanobot.troubleshooting.validators.openai-compatible-check-connectivity.content'),
        },
      },
    },
  }),
})
