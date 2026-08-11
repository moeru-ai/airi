import type { ModelInfo } from '../../types'

import { errorMessageFrom } from '@moeru/std'
import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const OPENCODE_GO_DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1/'
const OPENCODE_GO_MODEL_PREFIX = 'opencode-go/'
/** An impossible model id keeps credential validation from starting generation. */
const OPENCODE_GO_CREDENTIAL_CHECK_MODEL_ID = 'airi-credential-check-model-does-not-exist'

const opencodeGoConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(OPENCODE_GO_DEFAULT_BASE_URL),
})

type OpenCodeGoConfig = z.input<typeof opencodeGoConfigSchema>

// NOTICE:
// OpenCode Go mixes Chat Completions, Responses, and Messages models.
// AIRI currently sends Chat Completions requests for every model in one provider definition.
// Source: https://opencode.ai/docs/go/#endpoints
// Add the other models when AIRI can select a request protocol for each model.
const chatCompletionModels = [
  { id: 'grok-4.5', name: 'Grok 4.5' },
  { id: 'glm-5.2', name: 'GLM-5.2' },
  { id: 'glm-5.1', name: 'GLM-5.1' },
  { id: 'kimi-k3', name: 'Kimi K3' },
  { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code' },
  { id: 'kimi-k2.6', name: 'Kimi K2.6' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
  { id: 'mimo-v2.5', name: 'MiMo-V2.5' },
  { id: 'mimo-v2.5-pro', name: 'MiMo-V2.5-Pro' },
  { id: 'hy3', name: 'Hy3' },
]

function stripModelPrefix(modelId: string) {
  return modelId.startsWith(OPENCODE_GO_MODEL_PREFIX)
    ? modelId.slice(OPENCODE_GO_MODEL_PREFIX.length)
    : modelId
}

// NOTICE:
// OpenCode Go does not expose a non-billable credential endpoint, and its model list is public.
// A valid chat payload with a nonexistent model reaches credential validation
// but cannot start model generation.
// Source: https://opencode.ai/docs/go/#models
// Remove this probe when OpenCode Go exposes an authenticated account or usage endpoint.
async function validateOpenCodeGoCredentials(config: OpenCodeGoConfig) {
  const baseUrl = config.baseUrl?.trim() || OPENCODE_GO_DEFAULT_BASE_URL
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const credentialCheckUrl = new URL('chat/completions', normalizedBaseUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch(credentialCheckUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENCODE_GO_CREDENTIAL_CHECK_MODEL_ID,
        messages: [{ role: 'user', content: 'credential check' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    })
    const valid = response.ok || response.status === 400 || response.status === 422
    let reason = ''
    if (!valid) {
      reason = [401, 403].includes(response.status)
        ? `OpenCode Go rejected the API key (HTTP ${response.status}).`
        : `OpenCode Go credential check failed (HTTP ${response.status}).`
    }

    return {
      errors: valid ? [] : [{ error: new Error(reason) }],
      reason,
      reasonKey: '',
      valid,
    }
  }
  catch (error) {
    const reason = `OpenCode Go credential check failed: ${errorMessageFrom(error) ?? 'Unknown error.'}`
    return {
      errors: [{ error }],
      reason,
      reasonKey: '',
      valid: false,
    }
  }
  finally {
    clearTimeout(timeout)
  }
}

const openCodeGoValidators = createOpenAICompatibleValidators<OpenCodeGoConfig>({
  checks: [ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
  normalizeModelId: stripModelPrefix,
}) ?? {}

export const providerOpenCodeGo = defineProvider<OpenCodeGoConfig>({
  id: 'opencode-go',
  name: 'OpenCode Go',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.opencode-go.title'),
  description: 'OpenCode Go provides low-cost access to coding models.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.opencode-go.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:opencode',

  createProviderConfig: ({ t }) => opencodeGoConfigSchema.extend({
    apiKey: opencodeGoConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: opencodeGoConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const provider = createOpenAI(config.apiKey, config.baseUrl)
    const originalChat = provider.chat.bind(provider)

    return {
      ...provider,
      chat(model: string) {
        return originalChat(stripModelPrefix(model))
      },
    }
  },

  extraMethods: {
    listModels: async () => chatCompletionModels.map(model => ({
      ...model,
      id: `${OPENCODE_GO_MODEL_PREFIX}${model.id}`,
      provider: 'opencode-go',
    } satisfies ModelInfo)),
  },
  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...openCodeGoValidators,
    validateProvider: [
      ...(openCodeGoValidators.validateProvider ?? []),
      ({ t }) => ({
        id: 'opencode-go:check-credentials',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: validateOpenCodeGoCredentials,
      }),
    ],
  },
})
