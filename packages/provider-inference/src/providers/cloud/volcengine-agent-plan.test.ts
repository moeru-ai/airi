import { createServer } from 'node:http'

import { describe, expect, it } from 'vitest'
import { parse } from 'zod/v4/core'

import { portableProviderDefinitions } from '..'
import { providerOpenAICompatible } from './openai-compatible'

// https://github.com/moeru-ai/airi/issues/3432
// ROOT CAUSE:
//
// The generic provider requests a remote model list that returns 404.
// A dedicated Agent Plan provider supplies its model catalog locally.
describe('volcengine Agent Plan (Issue #3432)', () => {
  it('validates chat with a local catalog when the models endpoint returns 404', async () => {
    const definition = portableProviderDefinitions.find(provider => provider.id === 'volcengine-agent-plan')
    expect(definition).toBeDefined()
    if (!definition)
      throw new Error('Agent Plan provider is missing')

    const requests: string[] = []
    const chatBodies: unknown[] = []
    const server = createServer(async (request, response) => {
      requests.push(`${request.method} ${request.url}`)
      if (request.method === 'POST' && request.url === '/api/plan/v3/chat/completions') {
        let body = ''
        for await (const chunk of request)
          body += chunk
        chatBodies.push(JSON.parse(body))
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({
          id: 'test-completion',
          object: 'chat.completion',
          created: 0,
          model: 'doubao-seed-2.0-mini',
          choices: [{ index: 0, message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }))
        return
      }
      response.writeHead(404)
      response.end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('Test server has no port')
      const t = (key: string) => key
      const schema = await definition.createProviderConfig({ t })
      const defaults = parse(schema, { apiKey: 'test-key' })
      expect(defaults.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/plan/v3')
      const config = { ...defaults, baseUrl: `http://127.0.0.1:${address.port}/api/plan/v3/` }
      const generic = await providerOpenAICompatible.createProvider(config)
      const genericValidators = await Promise.all(providerOpenAICompatible.validators!.validateProvider!.map(create => create({ t })))
      const modelValidator = genericValidators.find(validator => validator.id === 'openai-compatible:check-model-list')!
      const genericResult = await modelValidator.validator(config, generic, {}, { t })
      expect(genericResult.valid).toBe(false)
      expect(genericResult.reason).toContain('404')
      requests.length = 0

      const provider = await definition.createProvider(config)
      const models = await definition.extraMethods!.listModels!(config, provider)
      expect(models[0].id).toBe('volcengine-agent-plan/doubao-seed-2.0-mini')
      expect(models.some(model => model.name === 'ark-code-latest')).toBe(false)
      expect(requests).toEqual([])
      if (!('chat' in provider) || !provider.chat)
        throw new Error('Agent Plan must support chat')
      expect(provider.chat('volcengine-agent-plan/doubao-seed-2.0-mini').model).toBe('doubao-seed-2.0-mini')
      for (const create of definition.validators!.validateProvider!) {
        const validator = await create({ t })
        const result = await validator.validator(config, provider, definition.extraMethods!, { t })
        expect(result.valid, result.reason).toBe(true)
      }
      expect(requests).toContain('POST /api/plan/v3/chat/completions')
      expect(chatBodies).toContainEqual(expect.objectContaining({ model: 'doubao-seed-2.0-mini' }))
    }
    finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
