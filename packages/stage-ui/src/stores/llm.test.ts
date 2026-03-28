import { describe, expect, it } from 'vitest'

import { isToolRelatedError } from './llm'

describe('isToolRelatedError', () => {
  const positives: [provider: string, msg: string][] = [
    ['ollama', 'llama3 does not support tools'],
    ['ollama', 'phi does not support tools'],
    ['openrouter', 'No endpoints found that support tool use'],
    ['openai-compatible', 'Invalid schema for function \'myFunc\': \'dict\' is not valid under any of the given schemas'],
    ['openai-compatible', 'invalid_function_parameters'],
    ['openai-compatible', 'invalid function parameters'],
    ['azure', 'Functions are not supported at this time'],
    ['azure', 'Unrecognized request argument supplied: tools'],
    ['azure', 'Unrecognized request arguments supplied: tool_choice, tools'],
    ['google', 'Tool use with function calling is unsupported'],
    ['groq', 'tool_use_failed'],
    ['groq', 'Error code: tool_use_failed - Failed to call a function'],
    ['anthropic', 'This model does not support function calling'],
    ['anthropic', 'does not support function_calling'],
    ['cloudflare', 'tools is not supported'],
    ['cloudflare', 'tool is not supported for this model'],
    ['cloudflare', 'tools are not supported'],
  ]

  const negatives = [
    'network error',
    'timeout',
    'rate limit exceeded',
    'invalid api key',
    'model not found',
    'context length exceeded',
    '',
  ]

  for (const [provider, msg] of positives) {
    it(`matches [${provider}]: "${msg}"`, () => {
      expect(isToolRelatedError(msg)).toBe(true)
      expect(isToolRelatedError(new Error(msg))).toBe(true)
    })
  }

  for (const msg of negatives) {
    it(`rejects: "${msg}"`, () => {
      expect(isToolRelatedError(msg)).toBe(false)
      expect(isToolRelatedError(new Error(msg))).toBe(false)
    })
  }
})
