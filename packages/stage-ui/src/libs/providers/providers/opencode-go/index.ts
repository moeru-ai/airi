import type { ModelInfo } from '../../types'

import { IS_DEV } from '@proj-airi/stage-shared'
import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { SERVER_URL } from '../../../server'
import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

const OPENCODE_GO_DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1/'
const OPENCODE_GO_MODEL_PREFIX = 'opencode-go/'
const OPENCODE_GO_PROXY_PATH = '/api/v1/provider-proxy/opencode-go/'
/** Catalog display order must not select the model used for provider validation. */
const OPENCODE_GO_VALIDATION_MODEL_ID = 'kimi-k3'

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
  { id: OPENCODE_GO_VALIDATION_MODEL_ID, name: 'Kimi K3' },
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

function isDefaultOpenCodeGoUrl(url: URL) {
  const defaultUrl = new URL(OPENCODE_GO_DEFAULT_BASE_URL)
  return url.origin === defaultUrl.origin && url.pathname.startsWith(defaultUrl.pathname)
}

function proxyRequestUrl(url: URL) {
  const defaultUrl = new URL(OPENCODE_GO_DEFAULT_BASE_URL)
  const upstreamPath = url.pathname.slice(defaultUrl.pathname.length)
  const proxyPath = `${OPENCODE_GO_PROXY_PATH}${upstreamPath}${url.search}`

  if (IS_DEV)
    return proxyPath

  return new URL(proxyPath, SERVER_URL).toString()
}

function createOpenCodeGoFetch() {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const inputUrl = input instanceof Request ? input.url : input.toString()
    const url = new URL(inputUrl)
    if (!isDefaultOpenCodeGoUrl(url))
      return globalThis.fetch(input, init)

    const proxiedUrl = proxyRequestUrl(url)
    if (input instanceof Request)
      return globalThis.fetch(new Request(proxiedUrl, input), init)

    return globalThis.fetch(proxiedUrl, init)
  }
}

export const providerOpenCodeGo = defineProvider<OpenCodeGoConfig>({
  id: 'opencode-go',
  order: 8,
  name: 'OpenCode Go',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.opencode-go.title'),
  description: 'Low-cost subscription for open coding models.',
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
    const fetch = createOpenCodeGoFetch()

    return {
      ...provider,
      chat(model: string) {
        return {
          ...originalChat(stripModelPrefix(model)),
          fetch,
        }
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
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
      normalizeModelId: stripModelPrefix,
      validationModel: `${OPENCODE_GO_MODEL_PREFIX}${OPENCODE_GO_VALIDATION_MODEL_ID}`,
    }),
  },
})
