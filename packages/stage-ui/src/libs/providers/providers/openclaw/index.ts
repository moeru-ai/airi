import type { ComposerTranslation } from 'vue-i18n'

import type { ModelInfo, ProviderRuntimeValidator } from '../../types'
import type { OpenClawApiMode } from './shared'

import { errorMessageFrom } from '@moeru/std'
import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'
import {
  buildOpenClawSessionHeaders,
  buildOpenClawValidationTarget,
  isOpenClawModelTarget,
  mapOpenClawModels,
  normalizeOpenClawTarget,

  resolveOpenClawAgentId,
  resolveOpenClawApiBaseUrl,
} from './shared'

const OPENCLAW_PROVIDER_ID = 'openclaw'
const OPENCLAW_DEFAULT_BASE_URL = 'http://localhost:18789'
const OPENCLAW_DEFAULT_SCOPES = 'operator.write'

function applyOpenClawDefaultHeaders(headers: Headers, config: OpenClawConfig) {
  if (config.apiKey?.trim()) {
    headers.set('authorization', `Bearer ${config.apiKey.trim()}`)
  }

  headers.set('content-type', 'application/json')
  headers.set('x-openclaw-scopes', OPENCLAW_DEFAULT_SCOPES)
}

const openClawConfigSchema = z.object({
  apiKey: z.string('API Key'),
  baseUrl: z.string('Base URL').default(OPENCLAW_DEFAULT_BASE_URL),
  agentId: z.string('Agent ID').default('default'),
  sessionStrategy: z.enum(['auto', 'manual']).default('auto'),
  sessionKey: z.string('Session Key').optional(),
  apiMode: z.enum(['chat_completions', 'responses']).default('chat_completions'),
})

type OpenClawConfig = z.input<typeof openClawConfigSchema>

function resolveOpenClawToolChoice(toolChoice: any): any {
  if (!toolChoice || typeof toolChoice === 'string') {
    return toolChoice
  }

  if (toolChoice.type === 'function' && toolChoice.function?.name) {
    return {
      type: 'function',
      name: toolChoice.function.name,
    }
  }

  return toolChoice
}

function mapChatMessagesToResponsesInput(messages: any[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    const content = Array.isArray(message?.content)
      ? message.content
      : [{ type: 'input_text', text: String(message?.content ?? '') }]

    return {
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content: content.map((item: any) => {
        if (item?.type === 'tool_result') {
          return {
            type: 'function_call_output',
            call_id: item.tool_call_id,
            output: typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? ''),
          }
        }

        if (item?.type === 'image_url') {
          return item
        }

        return {
          type: 'input_text',
          text: typeof item?.text === 'string' ? item.text : String(message?.content ?? ''),
        }
      }),
    }
  })
}

function mapChatToolsToResponsesTools(tools: any[] | undefined): Array<Record<string, unknown>> | undefined {
  if (!tools?.length) {
    return undefined
  }

  return tools.map((tool) => {
    if (tool?.type === 'function' && tool.function?.name) {
      return {
        type: 'function',
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        strict: tool.function.strict,
      }
    }

    return tool
  })
}

function normalizeResponsesOutputText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.length > 0) {
    return payload.output_text
  }

  return payload?.output
    ?.flatMap((entry: any) => entry?.content ?? [])
    ?.map((entry: any) => entry?.text)
    ?.find((text: unknown): text is string => typeof text === 'string' && text.length > 0)
    || ''
}

function mapResponsesPayloadToChatCompletions(payload: any): Record<string, unknown> {
  const outputText = normalizeResponsesOutputText(payload)
  return {
    id: payload?.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: payload?.model ?? 'openclaw/default',
    choices: [
      {
        index: 0,
        finish_reason: payload?.status === 'incomplete' ? 'tool_calls' : 'stop',
        message: {
          role: 'assistant',
          content: outputText,
        },
      },
    ],
  }
}

function createResponsesNotReadyResponse(): Response {
  return new Response(JSON.stringify({
    error: {
      message: 'OpenClaw responses mode streaming is not fully implemented yet. Switch to chat_completions for first-release streaming support.',
      type: 'not_supported',
    },
  }), {
    status: 501,
    headers: {
      'content-type': 'application/json',
    },
  })
}

function createOpenClawFetch(config: OpenClawConfig) {
  const baseUrl = resolveOpenClawApiBaseUrl(config.baseUrl)
  const apiMode = config.apiMode as OpenClawApiMode

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const headers = new Headers(request.headers)

    applyOpenClawDefaultHeaders(headers, config)

    if (config.sessionStrategy === 'manual' && config.sessionKey?.trim()) {
      const manualHeaders = buildOpenClawSessionHeaders({
        sessionStrategy: config.sessionStrategy,
        sessionKey: config.sessionKey,
      })
      for (const [key, value] of Object.entries(manualHeaders)) {
        headers.set(key, value)
      }
    }

    const isChatCompletionsCall = request.method.toUpperCase() === 'POST' && url.pathname.endsWith('/chat/completions')

    if (!isChatCompletionsCall) {
      return fetch(request)
    }

    const requestBody = await request.clone().json().catch(() => null)
    if (!requestBody) {
      return fetch(request)
    }

    const targetModel = normalizeOpenClawTarget(requestBody.model, resolveOpenClawAgentId(config.agentId))
    const continuityValue = headers.get('x-openclaw-session-key')?.trim() || undefined
    const sessionHeaders = buildOpenClawSessionHeaders({
      sessionStrategy: config.sessionStrategy,
      sessionKey: config.sessionKey,
    })

    for (const [key, value] of Object.entries(sessionHeaders)) {
      if (!headers.has(key)) {
        headers.set(key, value)
      }
    }

    if (apiMode === 'responses') {
      if (requestBody.stream) {
        return createResponsesNotReadyResponse()
      }

      const responsesBody = {
        model: targetModel,
        input: mapChatMessagesToResponsesInput(requestBody.messages ?? []),
        tools: mapChatToolsToResponsesTools(requestBody.tools),
        tool_choice: resolveOpenClawToolChoice(requestBody.tool_choice),
        max_output_tokens: requestBody.max_completion_tokens ?? requestBody.max_tokens,
        ...(continuityValue ? { user: continuityValue } : {}),
      }

      const response = await fetch(`${baseUrl}/responses`, {
        method: 'POST',
        headers,
        body: JSON.stringify(responsesBody),
        signal: request.signal,
      })

      if (!response.ok) {
        return response
      }

      const payload = await response.json()
      return new Response(JSON.stringify(mapResponsesPayloadToChatCompletions(payload)), {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'content-type': 'application/json',
        },
      })
    }

    const chatCompletionsBody = {
      ...requestBody,
      model: isOpenClawModelTarget(targetModel) ? targetModel : normalizeOpenClawTarget(targetModel, config.agentId),
      ...(continuityValue && !requestBody.user ? { user: continuityValue } : {}),
    }

    return fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(chatCompletionsBody),
      signal: request.signal,
    })
  }
}

async function fetchOpenClawModels(config: OpenClawConfig): Promise<ModelInfo[]> {
  const response = await fetch(`${resolveOpenClawApiBaseUrl(config.baseUrl)}/models`, {
    method: 'GET',
    headers: {
      ...(config.apiKey?.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
      'X-OpenClaw-Scopes': OPENCLAW_DEFAULT_SCOPES,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to list OpenClaw models: HTTP ${response.status}`)
  }

  const payload = await response.json()
  const models = mapOpenClawModels(OPENCLAW_PROVIDER_ID, payload)

  if (models.length > 0) {
    return models
  }

  return [{
    id: normalizeOpenClawTarget(config.agentId, config.agentId),
    name: resolveOpenClawAgentId(config.agentId),
    provider: OPENCLAW_PROVIDER_ID,
    description: 'OpenClaw agent target',
  }]
}

function createOpenClawConnectivityFailureReason({ errorMessage }: { errorMessage: string }) {
  const message = errorMessage.toLowerCase()
  if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
    return 'OpenClaw authentication failed. Check the API key or operator token.'
  }

  if (message.includes('fetch') || message.includes('network') || message.includes('econnrefused') || message.includes('failed to list')) {
    return 'Failed to reach the OpenClaw HTTP API. Make sure OpenClaw is running and its HTTP API is enabled.'
  }

  return `OpenClaw connectivity check failed: ${errorMessage}`
}

function createOpenClawModelListFailureReason({ errorMessage }: { errorMessage: string }) {
  const message = errorMessage.toLowerCase()
  if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
    return 'Failed to list OpenClaw agent targets because the API key is invalid or unauthorized.'
  }

  return `Failed to list OpenClaw agent targets: ${errorMessage}`
}

type OpenClawRuntimeValidatorFactory = (contextOptions: { t: ComposerTranslation }) => ProviderRuntimeValidator<OpenClawConfig>

function createOpenClawChatProbeValidator(): OpenClawRuntimeValidatorFactory {
  return ({ t }: { t: ComposerTranslation }) => ({
    id: 'openclaw:check-chat-completions',
    name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-supports-chat-completion.title'),
    validator: async (config) => {
      const targetModel = buildOpenClawValidationTarget(config)
      const baseUrl = resolveOpenClawApiBaseUrl(config.baseUrl)
      const endpoint = config.apiMode === 'responses' ? `${baseUrl}/responses` : `${baseUrl}/chat/completions`

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(config.apiKey?.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
            'X-OpenClaw-Scopes': OPENCLAW_DEFAULT_SCOPES,
          },
          body: JSON.stringify(config.apiMode === 'responses'
            ? {
                model: targetModel,
                input: [{
                  role: 'user',
                  content: [{ type: 'input_text', text: 'ping' }],
                }],
                max_output_tokens: 1,
              }
            : {
                model: targetModel,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1,
              }),
        })

        if (response.status === 400 || response.ok) {
          return {
            errors: [],
            reason: '',
            reasonKey: '',
            valid: true,
          }
        }

        const responseText = await response.text()
        return {
          errors: [{ error: new Error(responseText || `HTTP ${response.status}`) }],
          reason: response.status === 401 || response.status === 403
            ? 'OpenClaw chat probe failed because the API key is invalid or unauthorized.'
            : response.status === 404
              ? 'OpenClaw chat probe failed because the HTTP API endpoint is unavailable. Make sure the HTTP API is enabled.'
              : `OpenClaw chat probe failed: ${responseText || `HTTP ${response.status}`}`,
          reasonKey: '',
          valid: false,
        }
      }
      catch (error) {
        return {
          errors: [{ error }],
          reason: `OpenClaw chat probe failed: ${errorMessageFrom(error) ?? 'Unknown error.'}`,
          reasonKey: '',
          valid: false,
        }
      }
    },
  })
}

export const providerOpenClaw = defineProvider<OpenClawConfig>({
  id: OPENCLAW_PROVIDER_ID,
  order: 5,
  name: 'OpenClaw',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.openclaw.title'),
  description: 'Agent-first OpenClaw provider.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.openclaw.description'),
  tasks: ['chat'],
  icon: 'i-solar:cat-bold-duotone',

  createProviderConfig: ({ t }) => openClawConfigSchema.extend({
    apiKey: openClawConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.provider.openclaw.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: openClawConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.provider.openclaw.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.provider.openclaw.fields.field.base-url.placeholder'),
    }),
    agentId: openClawConfigSchema.shape.agentId.meta({
      labelLocalized: t('settings.pages.providers.provider.openclaw.fields.field.agent-id.label'),
      descriptionLocalized: t('settings.pages.providers.provider.openclaw.fields.field.agent-id.description'),
      placeholderLocalized: t('settings.pages.providers.provider.openclaw.fields.field.agent-id.placeholder'),
    }),
    sessionStrategy: openClawConfigSchema.shape.sessionStrategy.meta({
      labelLocalized: t('settings.pages.providers.provider.openclaw.fields.field.session-strategy.label'),
      descriptionLocalized: t('settings.pages.providers.provider.openclaw.fields.field.session-strategy.description'),
      section: 'advanced',
      type: 'select',
      options: [
        {
          label: t('settings.pages.providers.provider.openclaw.fields.field.session-strategy.options.auto'),
          value: 'auto',
        },
        {
          label: t('settings.pages.providers.provider.openclaw.fields.field.session-strategy.options.manual'),
          value: 'manual',
        },
      ],
    }),
    sessionKey: openClawConfigSchema.shape.sessionKey.meta({
      labelLocalized: t('settings.pages.providers.provider.openclaw.fields.field.session-key.label'),
      descriptionLocalized: t('settings.pages.providers.provider.openclaw.fields.field.session-key.description'),
      placeholderLocalized: t('settings.pages.providers.provider.openclaw.fields.field.session-key.placeholder'),
      section: 'advanced',
    }),
    apiMode: openClawConfigSchema.shape.apiMode.meta({
      labelLocalized: t('settings.pages.providers.provider.openclaw.fields.field.api-mode.label'),
      descriptionLocalized: t('settings.pages.providers.provider.openclaw.fields.field.api-mode.description'),
      section: 'advanced',
      type: 'select',
      options: [
        {
          label: t('settings.pages.providers.provider.openclaw.fields.field.api-mode.options.chat-completions'),
          value: 'chat_completions',
        },
        {
          label: t('settings.pages.providers.provider.openclaw.fields.field.api-mode.options.responses'),
          value: 'responses',
        },
      ],
    }),
  }),
  createProvider(config) {
    const provider = createOpenAI(config.apiKey?.trim() || '', resolveOpenClawApiBaseUrl(config.baseUrl)) as any
    const fetch = createOpenClawFetch(config)

    return {
      ...provider,
      model: (...args: any[]) => ({
        ...provider.model(...args),
        fetch,
      }),
      chat: (...args: any[]) => ({
        ...provider.chat(...args),
        fetch,
      }),
    }
  },

  extraMethods: {
    async listModels(config) {
      return await fetchOpenClawModels(config)
    },
  },
  validationRequiredWhen(config) {
    return !!config.apiKey?.trim() || !!config.baseUrl?.trim()
  },
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'openclaw:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const errors: Array<{ error: unknown }> = []
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
          const sessionKey = typeof config.sessionKey === 'string' ? config.sessionKey.trim() : ''

          if (!apiKey)
            errors.push({ error: new Error('API key is required.') })
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

          if (config.sessionStrategy === 'manual' && !sessionKey) {
            errors.push({ error: new Error('Session key is required when session strategy is manual.') })
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
    validateProvider: [
      ...(createOpenAICompatibleValidators<OpenClawConfig>({
        checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList],
        connectivityFailureReason: createOpenClawConnectivityFailureReason,
        modelListFailureReason: createOpenClawModelListFailureReason,
      })?.validateProvider ?? []),
      createOpenClawChatProbeValidator(),
    ],
  },
  business: ({ t }) => ({
    troubleshooting: {
      validators: {
        openaiCompatibleCheckConnectivity: {
          label: t('settings.pages.providers.provider.openclaw.troubleshooting.validators.openai-compatible-check-connectivity.label'),
          content: t('settings.pages.providers.provider.openclaw.troubleshooting.validators.openai-compatible-check-connectivity.content'),
        },
      },
    },
  }),
})
