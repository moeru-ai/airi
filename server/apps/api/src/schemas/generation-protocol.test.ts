import { parse, safeParse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { llmUpstreamSchema } from '../services/adapters/config-kv/definitions'
import { generationAdapters } from '../services/adapters/llm'
import { generationOperation, generationProtocolSchema } from './generation-protocol'

describe('server generation protocol contract', () => {
  it('rejects unimplemented protocols in both configuration and protocol selection', () => {
    expect(safeParse(generationProtocolSchema, 'messages').success).toBe(false)
    expect(safeParse(llmUpstreamSchema, { baseURL: 'https://example.com/v1', keys: [{ id: 'key', ciphertext: 'encrypted' }], protocols: ['messages'] }).success).toBe(false)
  })

  it.each([
    ['chat-completions', '/chat/completions'],
    ['responses', '/responses'],
  ] as const)('dispatches %s using its own path and upstream credentials', (protocol, path) => {
    const upstream = parse(llmUpstreamSchema, { baseURL: 'https://example.com/v1/', keys: [{ id: 'key', ciphertext: 'encrypted' }], overrideModel: 'upstream-model' })
    const built = generationAdapters[protocol].request({ upstream, apiKey: 'test-key', request: { protocol, modelName: 'alias', body: { stream: true }, headers: { authorization: 'caller-key' } } })
    expect(built.url).toBe(`https://example.com/v1${path}`)
    expect(new Headers(built.init.headers).get('authorization')).toBe('Bearer test-key')
    expect(JSON.parse(String(built.init.body))).toEqual({ stream: true, model: 'upstream-model' })
    expect(generationOperation(protocol)).toBe(`${protocol}.create`)
  })
})
