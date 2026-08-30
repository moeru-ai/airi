import { describe, expect, it } from 'vitest'

import {
  buildCustomModelRequestUrl,
  createDefaultCustomModelConnection,
  defaultCustomModelPaths,
  haveCustomModelRequestFieldsChanged,
  mergeCustomModelHeaders,
  redactCustomModelSecrets,
  resolveCustomModelValidationStatus,
  validateCustomModelConnection,
} from './config'

function validConnection() {
  return {
    protocol: 'openai-responses' as const,
    baseUrl: ' https://example.com/gateway/v1 ',
    generationPath: '/responses',
    modelListPath: '/models',
    auth: { type: 'bearer' as const, secret: ' secret ' },
    headers: { 'X-Client-Name': ' AIRI ' },
    models: [{ id: ' gpt-5 ' }],
  }
}

describe('custom model connection config', () => {
  it('normalizes a valid named connection', () => {
    expect(validateCustomModelConnection(validConnection())).toEqual({
      success: true,
      output: {
        protocol: 'openai-responses',
        baseUrl: 'https://example.com/gateway/v1/',
        generationPath: 'responses',
        modelListPath: 'models',
        auth: { type: 'bearer', secret: 'secret' },
        headers: { 'X-Client-Name': 'AIRI' },
        models: [{ id: 'gpt-5' }],
      },
    })
  })

  it('preserves the base path when it builds an operation URL', () => {
    expect(buildCustomModelRequestUrl('https://example.com/gateway/v1', '/responses'))
      .toBe('https://example.com/gateway/v1/responses')
  })

  it('returns protocol default paths', () => {
    expect(defaultCustomModelPaths('openai-chat-completions')).toEqual({
      generationPath: 'chat/completions',
      modelListPath: 'models',
    })
    expect(defaultCustomModelPaths('anthropic-messages').generationPath).toBe('messages')
    expect(createDefaultCustomModelConnection('openai-responses').generationPath).toBe('responses')
  })

  it('rejects reserved headers before a request can be sent', () => {
    expect(validateCustomModelConnection({
      protocol: 'anthropic-messages',
      baseUrl: 'https://example.com/v1',
      generationPath: 'messages',
      auth: { type: 'x-api-key', secret: 'secret' },
      headers: { 'Anthropic-Version': '2023-06-01' },
      models: [{ id: 'claude-sonnet' }],
    })).toEqual({
      success: false,
      code: 'reserved-header',
      field: 'headers.Anthropic-Version',
    })
  })

  // ROOT CAUSE:
  //
  // Discovery used the persistence validator. That validator required
  // models.minLength(1). A new OpenCode Go draft has empty model rows, so
  // Discover failed with invalid-structure at models and never sent GET /models.
  //
  // Persistence still requires a model ID. Discovery does not.
  it('allows an empty model list only when discovery validation is requested', () => {
    const connection = {
      protocol: 'openai-chat-completions' as const,
      baseUrl: 'https://opencode.ai/zen/go/v1',
      generationPath: 'chat/completions',
      modelListPath: 'models',
      auth: { type: 'bearer' as const, secret: 'sk-live' },
      headers: {},
      models: [],
    }

    expect(validateCustomModelConnection(connection)).toEqual({
      success: false,
      code: 'model-required',
      field: 'models',
    })
    expect(validateCustomModelConnection(connection, { requireModels: false })).toEqual({
      success: true,
      output: {
        protocol: 'openai-chat-completions',
        baseUrl: 'https://opencode.ai/zen/go/v1/',
        generationPath: 'chat/completions',
        modelListPath: 'models',
        auth: { type: 'bearer', secret: 'sk-live' },
        headers: {},
        models: [],
      },
    })
  })

  it('allows discovery from a Base URL before an API Key is entered', () => {
    const connection = {
      protocol: 'openai-chat-completions' as const,
      baseUrl: 'https://opencode.ai/zen/go/v1',
      generationPath: 'chat/completions',
      modelListPath: 'models',
      auth: { type: 'bearer' as const },
      headers: {},
      models: [],
    }

    expect(validateCustomModelConnection(connection, { requireModels: false })).toEqual({
      success: false,
      code: 'auth-secret-required',
      field: 'auth.secret',
    })
    expect(validateCustomModelConnection(connection, {
      requireModels: false,
      requireAuth: false,
    })).toEqual({
      success: true,
      output: {
        protocol: 'openai-chat-completions',
        baseUrl: 'https://opencode.ai/zen/go/v1/',
        generationPath: 'chat/completions',
        modelListPath: 'models',
        auth: { type: 'bearer' },
        headers: {},
        models: [],
      },
    })
  })

  it('rejects absolute operation paths and duplicate models', () => {
    expect(validateCustomModelConnection({
      protocol: 'openai-chat-completions',
      baseUrl: 'https://example.com/v1',
      generationPath: 'https://attacker.example/chat/completions',
      auth: { type: 'none' },
      headers: {},
      models: [{ id: 'model-a' }],
    })).toMatchObject({ success: false, code: 'invalid-path' })

    expect(validateCustomModelConnection({
      protocol: 'openai-chat-completions',
      baseUrl: 'https://example.com/v1',
      generationPath: 'chat/completions',
      auth: { type: 'none' },
      headers: {},
      models: [{ id: 'model-a' }, { id: ' model-a ' }],
    })).toEqual({
      success: false,
      code: 'duplicate-model',
      field: 'models.1.id',
    })
  })

  it('merges protocol, auth, and user headers in that order', () => {
    expect(mergeCustomModelHeaders({
      protocol: 'openai-chat-completions',
      auth: { type: 'bearer', secret: 'sk-test' },
      user: { 'X-Client-Name': 'AIRI' },
    })).toEqual({
      success: true,
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'authorization': 'Bearer sk-test',
        'X-Client-Name': 'AIRI',
      },
    })
  })

  it('accepts an arbitrary API Key string and sends it as-is', () => {
    const validated = validateCustomModelConnection({
      ...validConnection(),
      auth: { type: 'bearer', secret: ' local-gateway-token ' },
    })
    expect(validated.success).toBe(true)
    if (!validated.success)
      return

    expect(validated.output.auth.secret).toBe('local-gateway-token')
    expect(mergeCustomModelHeaders({
      protocol: 'openai-chat-completions',
      auth: validated.output.auth,
      user: {},
    })).toMatchObject({
      success: true,
      headers: {
        authorization: 'Bearer local-gateway-token',
      },
    })
  })

  it('rejects a user header that collides with a protocol or auth header', () => {
    expect(mergeCustomModelHeaders({
      protocol: 'anthropic-messages',
      auth: { type: 'x-api-key', secret: 'secret' },
      user: { Authorization: 'Bearer other' },
    })).toEqual({
      success: false,
      code: 'reserved-header',
      field: 'headers.Authorization',
    })
  })

  it('removes secrets from exported or logged connection snapshots', () => {
    const validated = validateCustomModelConnection({
      ...validConnection(),
      headers: { 'X-Token': 'abc123' },
    })
    expect(validated.success).toBe(true)
    if (!validated.success)
      return

    expect(redactCustomModelSecrets(validated.output)).toEqual({
      protocol: 'openai-responses',
      baseUrl: 'https://example.com/gateway/v1/',
      generationPath: 'responses',
      modelListPath: 'models',
      auth: { type: 'bearer' },
      headers: { 'X-Token': '' },
      models: [{ id: 'gpt-5' }],
    })
    expect(validated.output.auth.secret).toBe('secret')
  })

  it('resets configured status when request fields change', () => {
    const previous = validateCustomModelConnection(validConnection())
    expect(previous.success).toBe(true)
    if (!previous.success)
      return

    const next = {
      ...previous.output,
      baseUrl: 'https://example.com/v2/',
    }

    expect(haveCustomModelRequestFieldsChanged(previous.output, next)).toBe(true)
    expect(resolveCustomModelValidationStatus(previous.output, next, 'configured')).toBe('unconfigured')
    expect(resolveCustomModelValidationStatus(previous.output, next, 'bypassed')).toBe('bypassed')
    expect(resolveCustomModelValidationStatus(previous.output, next, 'configured', { validationResult: true })).toBe('configured')
  })
})
