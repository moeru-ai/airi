import type { ModelInfo } from '../../../types'

import { createOpenAI } from '@xsai-ext/providers/create'
import { array, number, object, optional, parse, string } from 'valibot'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

/** Default OpenAI-compatible Chat Completions endpoint for OpenCode Go. */
const DEFAULT_BASE_URL = 'https://opencode.ai/inference/go/openai/v1/'

const configSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(DEFAULT_BASE_URL),
})

type Config = z.input<typeof configSchema>

const modelSchema = object({
  id: string(),
  name: optional(string()),
  type: optional(string()),
  description: optional(string()),
  modalities: optional(object({
    input: optional(array(string())),
  })),
  limit: optional(object({
    context: optional(number()),
  })),
})

const modelListResponseSchema = object({
  data: optional(array(modelSchema)),
})

type CatalogModel = ReturnType<typeof parse<typeof modelSchema>>

/**
 * Keeps chat models from the OpenCode Go catalog and normalizes input MIME types.
 *
 * OpenCode Go `/models` also lists decision and embedding models.
 * It reports input modalities as MIME types, for example `image/png`, while `use-chat-vision` checks for `image` and `metadata.abilities.vision`.
 *
 * @example
 * toChatModels([{ id: 'kimi-k3', type: 'chat', modalities: { input: ['text', 'image/png'] } }])
 * // => [{ id: 'kimi-k3', name: 'kimi-k3', provider: 'opencode-go', inputModalities: ['text', 'image'], metadata: { abilities: { vision: true } } }]
 */
function toChatModels(models: CatalogModel[]): ModelInfo[] {
  return models
    .filter(model => model.type === 'chat')
    .map((model) => {
      const inputModalities = model.modalities?.input
        ? [...new Set(model.modalities.input.map(type => type.split('/')[0]))]
        : undefined

      return {
        id: model.id,
        name: model.name || model.id,
        provider: 'opencode-go',
        description: model.description,
        inputModalities,
        contextLength: model.limit?.context,
        ...(inputModalities?.includes('image') && { metadata: { abilities: { vision: true } } }),
      }
    })
}

export const providerOpenCodeGo = defineProvider<Config, 'opencode-go'>({
  id: 'opencode-go',
  name: 'OpenCode Go',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.opencode-go.title'),
  description: 'OpenCode Go provides low-cost access to coding models.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.opencode-go.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:opencode',

  createProviderConfig: ({ t }) => configSchema.extend({
    apiKey: configSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: configSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const provider = createOpenAI(config.apiKey.trim(), config.baseUrl?.trim() || DEFAULT_BASE_URL)
    // NOTICE:
    // Chat requests need a per-instance `x-opencode-session` header, while `/models` requests cannot send it.
    // OpenCode Go returns HTTP 400 `MissingSessionID` on `/chat/completions` without this header, and `/models` CORS preflight rejects the header.
    // Source/context: https://opencode.ai/docs/console/harnesses/#sessions and `packages/provider-inference/src/validators/openai-compatible.ts`.
    // Removal condition: OpenCode Go makes `x-opencode-session` optional on `/chat/completions`, or `@xsai-ext/providers` accepts chat-only headers.
    const sessionId = `ses_${crypto.randomUUID()}`

    return {
      ...provider,
      chat(model: string) {
        return {
          ...provider.chat(model),
          fetch: (input: RequestInfo | URL, init?: RequestInit) => {
            const headers = new Headers(input instanceof Request ? input.headers : undefined)
            if (init?.headers) {
              for (const [key, value] of new Headers(init.headers).entries())
                headers.set(key, value)
            }
            if (!headers.has('x-opencode-session'))
              headers.set('x-opencode-session', sessionId)
            return globalThis.fetch(input, { ...init, headers })
          },
        }
      },
    }
  },

  extraMethods: {
    async listModels(config) {
      const baseUrl = (config.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/?$/, '/')
      const response = await fetch(`${baseUrl}models`, {
        headers: { Authorization: `Bearer ${config.apiKey.trim()}` },
      })
      if (!response.ok)
        throw new Error(`Failed to list OpenCode Go models: ${response.status} ${response.statusText}`)

      const body = parse(modelListResponseSchema, await response.json())
      if (!body.data)
        return []

      return toChatModels(body.data)
    },
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList],
    }),
  },
})
