import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { defineProvider } from '../registry'

const AZURE_OPENAI_PROVIDER_ID = 'azure-openai' as const
const DEFAULT_COMPLETIONS_API_VERSION = '2024-04-01-preview'
const DEFAULT_RESPONSES_API_VERSION = '2025-04-01-preview'
const DEFAULT_AZURE_BASE_URL = 'https://YOUR_RESOURCE_NAME.cognitiveservices.azure.com/openai/'
const FALLBACK_AZURE_ORIGIN = 'https://YOUR_RESOURCE_NAME.cognitiveservices.azure.com'
const DEFAULT_AZURE_OPENAI_COMPATIBLE_BASE_URL = `${FALLBACK_AZURE_ORIGIN}/openai/v1/`

const azureOpenAIConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default(DEFAULT_AZURE_BASE_URL),
  apiMode: z
    .enum(['auto', 'responses', 'completions'])
    .optional()
    .default('auto'),
  completionsApiVersion: z
    .string('Completions API Version')
    .optional()
    .default(DEFAULT_COMPLETIONS_API_VERSION),
  responsesApiVersion: z
    .string('Responses API Version')
    .optional()
    .default(DEFAULT_RESPONSES_API_VERSION),
  manualModels: z
    .string('Manual Models')
    .optional()
    .default(''),
})

type AzureOpenAIConfig = z.input<typeof azureOpenAIConfigSchema>

interface AzureEndpointHints {
  origin: string
  inferredMode?: 'responses' | 'completions'
  responsesUrl?: string
  completionsUrl?: string
  completionsDeployment?: string
  apiVersionFromUrl?: string
}

interface AzureDeploymentItem {
  id?: string
  model?: string
}

function normalizeProviderBaseUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    return DEFAULT_AZURE_OPENAI_COMPATIBLE_BASE_URL
  }

  try {
    const parsed = new URL(trimmed)
    const lowerPath = parsed.pathname.toLowerCase()
    if (/^\/openai\/?$/i.test(parsed.pathname)) {
      return `${parsed.origin}/openai/v1/`
    }

    if (lowerPath.includes('/openai/responses') || /\/openai\/deployments\/[^/]+\/chat\/completions\/?$/i.test(parsed.pathname)) {
      return `${parsed.origin}/openai/v1/`
    }
  }
  catch {
  }

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function parseAzureEndpointHints(baseUrl: string | undefined): AzureEndpointHints {
  const raw = (baseUrl || '').trim()
  if (!raw) {
    return { origin: FALLBACK_AZURE_ORIGIN }
  }

  try {
    const parsed = new URL(raw)
    const lowerPath = parsed.pathname.toLowerCase()
    const apiVersionFromUrl = parsed.searchParams.get('api-version')?.trim()

    if (lowerPath.includes('/openai/responses')) {
      return {
        origin: parsed.origin,
        inferredMode: 'responses',
        responsesUrl: `${parsed.origin}${parsed.pathname}${parsed.search}`,
        apiVersionFromUrl,
      }
    }

    const deploymentMatch = parsed.pathname.match(/\/openai\/deployments\/([^/]+)\/chat\/completions\/?$/i)
    if (deploymentMatch?.[1]) {
      return {
        origin: parsed.origin,
        inferredMode: 'completions',
        completionsUrl: `${parsed.origin}${parsed.pathname}${parsed.search}`,
        completionsDeployment: decodeURIComponent(deploymentMatch[1]),
        apiVersionFromUrl,
      }
    }

    return {
      origin: parsed.origin,
      apiVersionFromUrl,
    }
  }
  catch {
    return { origin: FALLBACK_AZURE_ORIGIN }
  }
}

function normalizeApiMode(input: unknown, hints: AzureEndpointHints): 'responses' | 'completions' {
  if (input === 'completions') {
    return 'completions'
  }

  if (input === 'responses') {
    return 'responses'
  }

  return hints.inferredMode || 'responses'
}

function resolveCompletionsApiVersion(config: AzureOpenAIConfig, hints: AzureEndpointHints): string {
  return (hints.apiVersionFromUrl || config.completionsApiVersion || DEFAULT_COMPLETIONS_API_VERSION).trim()
}

function resolveResponsesApiVersion(config: AzureOpenAIConfig, hints: AzureEndpointHints): string {
  return (hints.apiVersionFromUrl || config.responsesApiVersion || DEFAULT_RESPONSES_API_VERSION).trim()
}

function resolveAzureApiVersionsForDeployments(config: AzureOpenAIConfig, hints: AzureEndpointHints): string[] {
  const versions = [
    hints.apiVersionFromUrl,
    config.completionsApiVersion,
    config.responsesApiVersion,
    DEFAULT_COMPLETIONS_API_VERSION,
    DEFAULT_RESPONSES_API_VERSION,
  ]
    .map(version => (version || '').trim())
    .filter(Boolean)

  return [...new Set(versions)]
}

function parseManualModels(input: unknown): string[] {
  if (typeof input !== 'string') {
    return []
  }

  const models = input
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  return [...new Set(models)]
}

function mapAzureDeploymentsToModels(deployments: AzureDeploymentItem[]): Array<{ id: string, name: string, provider: string, description: string }> {
  return deployments
    .filter(item => typeof item?.id === 'string' && item.id.trim().length > 0)
    .map((item) => {
      const deploymentName = item.id!.trim()
      const modelName = typeof item.model === 'string' && item.model.trim().length > 0
        ? item.model.trim()
        : deploymentName

      return {
        id: deploymentName,
        name: deploymentName,
        provider: AZURE_OPENAI_PROVIDER_ID,
        description: `Azure deployment (${modelName})`,
      }
    })
}

async function listAzureDeployments(config: AzureOpenAIConfig): Promise<Array<{ id: string, name: string, provider: string, description: string }>> {
  const endpointHints = parseAzureEndpointHints(config.baseUrl)
  const apiKey = (config.apiKey || '').trim()
  const versions = resolveAzureApiVersionsForDeployments(config, endpointHints)
  const allErrors: string[] = []

  for (const apiVersion of versions) {
    try {
      const url = new URL(`${endpointHints.origin}/openai/deployments`)
      url.searchParams.set('api-version', apiVersion)

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'api-key': apiKey,
        },
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => `(unable to read response body, status=${response.status})`)
        allErrors.push(`api-version '${apiVersion}' returned ${response.status}: ${errorText}`)
        continue
      }

      const payload = await response.json().catch((error) => {
        allErrors.push(`api-version '${apiVersion}' returned invalid JSON: ${(error as Error).message}`)
        return null
      }) as { data?: AzureDeploymentItem[] } | null

      if (!payload) {
        continue
      }

      return mapAzureDeploymentsToModels(Array.isArray(payload.data) ? payload.data : [])
    }
    catch (error) {
      allErrors.push(`api-version '${apiVersion}' request failed: ${(error as Error).message}`)
    }
  }

  if (allErrors.length > 0) {
    throw new Error(`Failed to list Azure deployments:\n- ${allErrors.join('\n- ')}`)
  }

  return []
}

function mergeAzureModels(
  deploymentModels: Array<{ id: string, name: string, provider: string, description: string }>,
  manualModels: string[],
) {
  const merged = new Map<string, { id: string, name: string, provider: string, description: string }>()

  for (const item of deploymentModels) {
    merged.set(item.id, item)
  }

  for (const model of manualModels) {
    if (merged.has(model)) {
      continue
    }

    merged.set(model, {
      id: model,
      name: model,
      provider: AZURE_OPENAI_PROVIDER_ID,
      description: 'Manual model/deployment',
    })
  }

  return Array.from(merged.values())
}

function mapMessagesToResponsesInput(messages: any[] | undefined): any[] {
  const input: any[] = []

  for (const msg of messages ?? []) {
    if (!msg || typeof msg !== 'object') {
      continue
    }

    if (msg.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: msg.tool_call_id,
        output: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? ''),
      })
      continue
    }

    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      for (const toolCall of msg.tool_calls) {
        input.push({
          type: 'function_call',
          call_id: toolCall.id,
          name: toolCall.function?.name,
          arguments: toolCall.function?.arguments ?? '',
        })
      }
      continue
    }

    const isAssistant = msg.role === 'assistant'
    const textType = isAssistant ? 'output_text' : 'input_text'

    const content = typeof msg.content === 'string'
      ? [{ type: textType, text: msg.content }]
      : Array.isArray(msg.content)
        ? msg.content
            .map((part: any) => {
              if (part?.type === 'text' || part?.type === 'input_text' || part?.type === 'output_text') {
                return { type: textType, text: String(part.text ?? '') }
              }

              if (part?.type === 'image_url' && part?.image_url?.url) {
                return { type: 'input_image', image_url: part.image_url.url }
              }

              return null
            })
            .filter(Boolean)
        : []

    input.push({
      role: msg.role,
      content,
    })
  }

  return input
}

function mapToolChoice(toolChoice: any): any {
  if (!toolChoice) {
    return undefined
  }

  if (typeof toolChoice === 'string') {
    return toolChoice
  }

  if (toolChoice?.type === 'function' && toolChoice?.function?.name) {
    return {
      type: 'function',
      name: toolChoice.function.name,
    }
  }

  return undefined
}

function mapResponsesInputToMessages(input: any[] | undefined): any[] {
  if (!Array.isArray(input)) {
    return []
  }

  const messages: any[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') {
      continue
    }

    if (item.type === 'function_call_output') {
      messages.push({
        role: 'tool',
        tool_call_id: item.call_id,
        content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? ''),
      })
      continue
    }

    if (!Array.isArray(item.content)) {
      continue
    }

    const text = item.content
      .filter((part: any) => part?.type === 'input_text')
      .map((part: any) => String(part.text ?? ''))
      .join('\n')

    messages.push({
      role: item.role || 'user',
      content: text,
    })
  }

  return messages
}

function mapChatBodyToResponses(body: any): Record<string, unknown> {
  return {
    model: body?.model,
    input: Array.isArray(body?.input)
      ? body.input
      : mapMessagesToResponsesInput(body?.messages),
    stream: !!body?.stream,
    max_output_tokens: body?.max_output_tokens ?? body?.max_completion_tokens ?? body?.max_tokens,
    temperature: body?.temperature,
    top_p: body?.top_p,
    presence_penalty: body?.presence_penalty,
    frequency_penalty: body?.frequency_penalty,
    seed: body?.seed,
    stop: body?.stop,
    tools: Array.isArray(body?.tools)
      ? body.tools
          .map((tool: any) => {
            if (tool?.type !== 'function' || !tool?.function?.name) {
              return null
            }

            return {
              type: 'function',
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters,
              strict: tool.function.strict,
            }
          })
          .filter(Boolean)
      : undefined,
    tool_choice: mapToolChoice(body?.tool_choice),
  }
}

function mapChatBodyToCompletions(body: any): Record<string, unknown> {
  const mappedBody: Record<string, unknown> = {
    ...body,
    messages: Array.isArray(body?.messages) && body.messages.length > 0
      ? body.messages
      : mapResponsesInputToMessages(body?.input),
    max_completion_tokens: body?.max_completion_tokens ?? body?.max_output_tokens ?? body?.max_tokens,
  }

  delete mappedBody.input
  delete mappedBody.max_output_tokens

  return mappedBody
}

function parseErrorCodeFromResponseText(responseText: string): string {
  if (!responseText) {
    return ''
  }

  try {
    const parsed = JSON.parse(responseText)
    const code = parsed?.error?.code
    return typeof code === 'string' ? code : ''
  }
  catch {
    return ''
  }
}

function extractAssistantText(output: any): string {
  if (!Array.isArray(output)) {
    return ''
  }

  let text = ''
  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item?.content)) {
      continue
    }

    for (const part of item.content) {
      if (part?.type === 'output_text') {
        text += String(part.text ?? '')
      }
    }
  }

  return text
}

function mapResponsesToChatJson(payload: any): Record<string, unknown> {
  const functionCalls = Array.isArray(payload?.output)
    ? payload.output.filter((item: any) => item?.type === 'function_call')
    : []

  const toolCalls = functionCalls.map((item: any, index: number) => ({
    id: item?.call_id ?? `call_${index}`,
    type: 'function',
    function: {
      name: item?.name ?? 'unknown_tool',
      arguments: typeof item?.arguments === 'string' ? item.arguments : JSON.stringify(item?.arguments ?? {}),
    },
  }))

  const usage = payload?.usage ?? {}
  return {
    id: payload?.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: payload?.model,
    choices: [{
      index: 0,
      finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      message: {
        role: 'assistant',
        content: extractAssistantText(payload?.output),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
    }],
    usage: {
      prompt_tokens: Number(usage?.input_tokens || 0),
      completion_tokens: Number(usage?.output_tokens || 0),
      total_tokens: Number(usage?.total_tokens || 0),
    },
  }
}

function createSSEParser(onEvent: (eventName: string, data: string) => void) {
  let buffer = ''

  return (chunk: string) => {
    buffer += chunk

    while (true) {
      const boundary = buffer.indexOf('\n\n')
      if (boundary === -1) {
        break
      }

      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)

      let eventName = ''
      const dataLines: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice('event:'.length).trim()
        }
        else if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trim())
        }
      }

      onEvent(eventName, dataLines.join('\n'))
    }
  }
}

function createResponsesToChatStream(response: Response): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body?.getReader()
      if (!reader) {
        controller.close()
        return
      }

      let toolCallIndex = 0
      const callIdToIndex = new Map<string, number>()
      let hasToolCalls = false
      let doneSent = false

      const emit = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      const emitDone = () => {
        if (doneSent) {
          return
        }

        doneSent = true
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      }

      const handleEvent = (eventName: string, data: string) => {
        if (!data || data === '[DONE]') {
          emitDone()
          return
        }

        let parsed: any
        try {
          parsed = JSON.parse(data)
        }
        catch {
          return
        }

        const type = parsed?.type || eventName

        if (type === 'error' || type === 'response.failed') {
          const errorMessage = parsed?.error?.message || parsed?.message || 'Unknown streaming error'
          emit({
            choices: [{
              index: 0,
              delta: { content: `[Error: ${errorMessage}]` },
              finish_reason: 'stop',
            }],
          })
          emitDone()
          return
        }

        if (type === 'response.output_text.delta' && parsed?.delta) {
          emit({
            choices: [{
              index: 0,
              delta: { content: String(parsed.delta) },
            }],
          })
          return
        }

        if (type === 'response.output_item.added' && parsed?.item?.type === 'function_call') {
          const callId = parsed.item.call_id || `call_${toolCallIndex}`
          callIdToIndex.set(callId, toolCallIndex)
          toolCallIndex += 1
          hasToolCalls = true

          emit({
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: callIdToIndex.get(callId),
                  id: callId,
                  type: 'function',
                  function: {
                    name: parsed.item.name || 'unknown_tool',
                    arguments: '',
                  },
                }],
              },
            }],
          })
          return
        }

        if (type === 'response.function_call_arguments.delta' && parsed?.call_id && parsed?.delta) {
          const index = callIdToIndex.get(parsed.call_id)
          if (index == null) {
            return
          }

          emit({
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index,
                  id: parsed.call_id,
                  type: 'function',
                  function: {
                    arguments: String(parsed.delta),
                  },
                }],
              },
            }],
          })
          return
        }

        if (type === 'response.completed') {
          const usage = parsed?.response?.usage ?? parsed?.usage
          emit({
            choices: [{
              index: 0,
              delta: {},
              finish_reason: hasToolCalls ? 'tool_calls' : 'stop',
            }],
            ...(usage
              ? {
                  usage: {
                    prompt_tokens: Number(usage?.input_tokens || 0),
                    completion_tokens: Number(usage?.output_tokens || 0),
                    total_tokens: Number(usage?.total_tokens || 0),
                  },
                }
              : {}),
          })
          emitDone()
        }
      }

      const parse = createSSEParser(handleEvent)

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            emitDone()
            controller.close()
            break
          }

          parse(decoder.decode(value, { stream: true }))
        }
      }
      catch (error) {
        controller.error(error)
      }
      finally {
        reader.releaseLock()
      }
    },
  })
}

function createAzureOpenAIFetch(config: AzureOpenAIConfig) {
  const endpointHints = parseAzureEndpointHints(config.baseUrl)
  const apiMode = normalizeApiMode(config.apiMode, endpointHints)
  const completionsApiVersion = resolveCompletionsApiVersion(config, endpointHints)
  const responsesApiVersion = resolveResponsesApiVersion(config, endpointHints)
  const apiKey = (config.apiKey || '').trim()

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const isChatCompletionsCall = request.method.toUpperCase() === 'POST' && /\/chat\/completions\/?$/i.test(url.pathname)

    if (!isChatCompletionsCall) {
      return fetch(request)
    }

    const requestBody = await request.clone().json().catch(() => null)
    if (!requestBody) {
      return fetch(request)
    }

    const headers = new Headers(request.headers)
    headers.set('api-key', apiKey)
    headers.set('content-type', 'application/json')

    if (apiMode === 'completions') {
      const deployment = endpointHints.completionsDeployment || (typeof requestBody?.model === 'string' ? requestBody.model.trim() : '')
      if (!deployment) {
        return fetch(request)
      }

      const completionsUrl = endpointHints.completionsUrl
        ? new URL(endpointHints.completionsUrl)
        : new URL(`${endpointHints.origin}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions`)

      if (!completionsUrl.searchParams.get('api-version')) {
        completionsUrl.searchParams.set('api-version', completionsApiVersion)
      }

      const mappedBody = mapChatBodyToCompletions(requestBody)
      return fetch(completionsUrl.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(mappedBody),
        signal: request.signal,
      })
    }

    const responsesUrl = endpointHints.responsesUrl
      ? new URL(endpointHints.responsesUrl)
      : new URL(`${endpointHints.origin}/openai/responses`)

    if (!responsesUrl.searchParams.get('api-version')) {
      responsesUrl.searchParams.set('api-version', responsesApiVersion)
    }

    const mappedBody = mapChatBodyToResponses(requestBody)
    const responsesResponse = await fetch(responsesUrl.toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify(mappedBody),
      signal: request.signal,
    })

    if (!responsesResponse.ok) {
      return responsesResponse
    }

    if (requestBody.stream) {
      return new Response(createResponsesToChatStream(responsesResponse), {
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive',
        },
      })
    }

    const payload = await responsesResponse.json()
    return new Response(JSON.stringify(mapResponsesToChatJson(payload)), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    })
  }
}

export const providerAzureOpenAI = defineProvider<AzureOpenAIConfig>({
  id: 'azure-openai',
  order: 2,
  name: 'Azure OpenAI',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.azure-openai.title'),
  description: 'Azure OpenAI API',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.azure-openai.description'),
  tasks: ['chat'],
  icon: 'i-simple-icons:microsoftazure',
  extraMethods: {
    listModels: async (config, _provider) => {
      const manualModels = parseManualModels(config.manualModels)

      try {
        const deploymentModels = await listAzureDeployments(config)
        return mergeAzureModels(deploymentModels, manualModels)
      }
      catch (error) {
        if (manualModels.length > 0) {
          return mergeAzureModels([], manualModels)
        }

        throw error
      }
    },
  },

  createProviderConfig: ({ t }) => azureOpenAIConfigSchema.extend({
    apiKey: azureOpenAIConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: azureOpenAIConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
    apiMode: azureOpenAIConfigSchema.shape.apiMode.meta({
      labelLocalized: 'API Mode',
      descriptionLocalized: 'auto (default) infers mode from full endpoint URL; you can also force responses/completions.',
      placeholderLocalized: 'auto',
      section: 'advanced',
    }),
    completionsApiVersion: azureOpenAIConfigSchema.shape.completionsApiVersion.meta({
      labelLocalized: 'Completions API Version',
      descriptionLocalized: 'Used when API Mode = completions.',
      placeholderLocalized: '2024-04-01-preview',
      section: 'advanced',
    }),
    responsesApiVersion: azureOpenAIConfigSchema.shape.responsesApiVersion.meta({
      labelLocalized: 'Responses API Version',
      descriptionLocalized: 'Used when API Mode = responses.',
      placeholderLocalized: '2025-04-01-preview',
      section: 'advanced',
    }),
    manualModels: azureOpenAIConfigSchema.shape.manualModels.meta({
      labelLocalized: 'Manual Models',
      descriptionLocalized: 'Optional. Comma-separated model/deployment names used as fallback in model selection.',
      placeholderLocalized: 'gpt-5.2-chat, gpt-4.1',
      section: 'advanced',
    }),
  }),
  createProvider(config) {
    const normalizedBaseUrl = normalizeProviderBaseUrl(config.baseUrl || DEFAULT_AZURE_BASE_URL)
    const provider = createOpenAI(config.apiKey || '', normalizedBaseUrl) as any
    const fetch = createAzureOpenAIFetch(config)

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
      embed: (...args: any[]) => ({
        ...provider.embed(...args),
        fetch,
      }),
      image: (...args: any[]) => ({
        ...provider.image(...args),
        fetch,
      }),
      speech: (...args: any[]) => ({
        ...provider.speech(...args),
        fetch,
      }),
      transcription: (...args: any[]) => ({
        ...provider.transcription(...args),
        fetch,
      }),
    }
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'azure-openai:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config) => {
          const errors: Array<{ error: unknown }> = []
          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

          if (!apiKey)
            errors.push({ error: new Error('API key is required.') })

          if (!baseUrl) {
            errors.push({ error: new Error('Base URL is required.') })
          }
          else {
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
    validateProvider: [
      ({ t }) => ({
        id: 'azure-openai:check-responses-connectivity',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
        validator: async (config) => {
          const errors: Array<{ error: unknown }> = []

          const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
          const baseUrlRaw = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
          const endpointHints = parseAzureEndpointHints(baseUrlRaw)
          const apiMode = normalizeApiMode(config.apiMode, endpointHints)
          const completionsApiVersion = resolveCompletionsApiVersion(config as AzureOpenAIConfig, endpointHints)
          const responsesApiVersion = resolveResponsesApiVersion(config as AzureOpenAIConfig, endpointHints)

          if (!apiKey || !baseUrlRaw) {
            return {
              errors: [{ error: new Error('API key and Base URL are required.') }],
              reason: 'API key and Base URL are required.',
              reasonKey: '',
              valid: false,
            }
          }

          try {
            const endpoint = new URL(baseUrlRaw)
            const response = apiMode === 'completions'
              ? await fetch(new URL(`${endpoint.origin}/openai/deployments?api-version=${encodeURIComponent(endpointHints.apiVersionFromUrl || completionsApiVersion)}`).toString(), {
                  method: 'GET',
                  headers: {
                    'api-key': apiKey,
                  },
                })
              : await fetch((endpointHints.responsesUrl
                  ? new URL(endpointHints.responsesUrl)
                  : new URL(`${endpoint.origin}/openai/responses?api-version=${encodeURIComponent(endpointHints.apiVersionFromUrl || responsesApiVersion)}`)
                ).toString(), {
                  method: 'POST',
                  headers: {
                    'api-key': apiKey,
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'connectivity-check',
                    input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
                    max_output_tokens: 1,
                  }),
                })

            if (response.status >= 400) {
              const responseText = await response.text()
              const errorCode = parseErrorCodeFromResponseText(responseText).toLowerCase()

              if (errorCode === 'deploymentnotfound' || errorCode === 'model_not_found') {
                return {
                  errors,
                  reason: '',
                  reasonKey: '',
                  valid: true,
                }
              }

              if (response.status === 401 || response.status === 403) {
                errors.push({ error: new Error(`Authentication failed (${response.status}). Check API key / endpoint. Response: ${responseText || 'empty'}`) })
              }
              else if (response.status >= 500) {
                errors.push({ error: new Error(`Server error (${response.status}). Response: ${responseText || 'empty'}`) })
              }
              else {
                errors.push({ error: new Error(`Responses API returned ${response.status}. Response: ${responseText || 'empty'}`) })
              }
            }
          }
          catch (error) {
            errors.push({ error: new Error(`Connectivity check failed: ${(error as Error).message}`) })
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
  },
})
