import type { JsonSchema } from 'xsschema'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSparkCommandTool } from '../../../../tools/character/orchestrator/spark-command'
import { providerOpenRouterAI } from './index'

interface ChatRequestBody {
  tools: Array<{
    function: {
      name: string
      parameters: JsonSchema
    }
  }>
}

function isJsonSchema(value: JsonSchema | boolean | undefined): value is JsonSchema {
  return Boolean(value && typeof value === 'object')
}

function getArraySchema(schema?: JsonSchema): JsonSchema | undefined {
  if (!schema)
    return undefined

  if (schema.type === 'array')
    return schema

  return schema.anyOf?.filter(isJsonSchema).find(candidate => candidate.type === 'array')
}

describe('providerOpenRouterAI tool schemas', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the canonical nullable anyOf when it sends a chat request', async () => {
    const tools = await createSparkCommandTool({
      sendSparkCommand: () => undefined,
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = providerOpenRouterAI.createProvider({
      apiKey: 'test-key',
    })
    if (!('chat' in provider))
      throw new Error('OpenRouter did not create a chat provider.')

    const providerFetch = provider.chat('google/gemini-test').fetch
    if (!providerFetch)
      throw new Error('OpenRouter did not create a fetch adapter.')

    await providerFetch(new URL('https://openrouter.ai/api/v1/chat/completions'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-test',
        messages: [],
        tools,
      }),
    })

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body
    if (typeof requestBody !== 'string')
      throw new Error('OpenRouter did not send a JSON request body.')

    const body = JSON.parse(requestBody) as ChatRequestBody
    const sparkTool = body.tools.find(tool => tool.function.name === 'builtIn_emitSparkCommand')
    const contexts = getArraySchema(sparkTool?.function.parameters.properties?.contexts as JsonSchema)
    const contextItem = contexts?.items as JsonSchema
    const metadata = getArraySchema(contextItem.properties?.metadata as JsonSchema)
    const metadataItem = metadata?.items as JsonSchema
    const metadataValue = metadataItem.properties?.value as JsonSchema

    expect(metadataValue.type).toBeUndefined()
    expect(metadataValue.anyOf).toEqual([
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'null' },
    ])
  })

  it('discovers which models expose a safe reasoning off mode', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [
        {
          id: 'openai/gpt-5.2',
          name: 'GPT-5.2',
          reasoning: { mandatory: false, supported_efforts: ['none', 'low', 'high'] },
        },
        {
          id: 'openai/o3',
          name: 'o3',
          reasoning: { mandatory: true, supported_efforts: ['low', 'high'] },
        },
        {
          id: 'openai/gpt-4o',
          name: 'GPT-4o',
        },
        {
          id: 'anthropic/claude-sonnet',
          name: 'Claude Sonnet',
          reasoning: { mandatory: false },
        },
      ],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const config = { apiKey: 'test-key' }
    const provider = providerOpenRouterAI.createProvider(config)
    const models = await providerOpenRouterAI.extraMethods?.listModels?.(config, provider)

    expect(models).toEqual([
      expect.objectContaining({ id: 'openai/gpt-5.2', thinking: { canDisable: true } }),
      expect.objectContaining({ id: 'openai/o3', thinking: { canDisable: false } }),
      expect.not.objectContaining({ thinking: expect.anything() }),
      expect.objectContaining({ id: 'anthropic/claude-sonnet', thinking: { canDisable: false } }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(new URL('https://openrouter.ai/api/v1/models'), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
    }))
  })
})
