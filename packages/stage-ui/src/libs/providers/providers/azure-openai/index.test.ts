import type { JsonSchema } from 'xsschema'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSparkCommandTool } from '../../../../tools/character/orchestrator/spark-command'
import { providerAzureOpenAI } from './index'

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

describe('providerAzureOpenAI tool schemas', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // https://github.com/moeru-ai/airi/pull/2330#discussion_r3819919459
  it('converts every nullable scalar anyOf before it sends a chat request (PR #2330 review)', async () => {
    const tools = await createSparkCommandTool({
      sendSparkCommand: () => undefined,
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = providerAzureOpenAI.createProvider({
      apiKey: 'test-key',
      baseUrl: 'https://example.openai.azure.com/openai/',
    })
    if (!('chat' in provider))
      throw new Error('Azure OpenAI did not create a chat provider.')

    const providerFetch = provider.chat('test-deployment').fetch
    if (!providerFetch)
      throw new Error('Azure OpenAI did not create a fetch adapter.')

    await providerFetch(new URL('https://example.openai.azure.com/openai/v1/chat/completions'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'test-deployment',
        messages: [],
        tools,
      }),
    })

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body
    if (typeof requestBody !== 'string')
      throw new Error('Azure OpenAI did not send a JSON request body.')

    const body = JSON.parse(requestBody) as ChatRequestBody
    const sparkTool = body.tools.find(tool => tool.function.name === 'builtIn_emitSparkCommand')
    const contexts = getArraySchema(sparkTool?.function.parameters.properties?.contexts as JsonSchema)
    const contextItem = contexts?.items as JsonSchema
    const metadata = getArraySchema(contextItem.properties?.metadata as JsonSchema)
    const metadataItem = metadata?.items as JsonSchema
    const metadataValue = metadataItem.properties?.value as JsonSchema

    // ROOT CAUSE:
    //
    // The provider-neutral spark schema keeps this value as a nullable `anyOf`.
    // Azure OpenAI rejects that schema before generation and disables all tools.
    //
    // We fixed this in the Azure request adapter. It converts the union only for
    // Azure OpenAI and leaves the canonical tool schema unchanged.
    expect(metadataValue.type).toEqual(['string', 'number', 'boolean', 'null'])
    expect(metadataValue.anyOf).toBeUndefined()
  })
})
