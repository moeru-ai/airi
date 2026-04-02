import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { describe, expect, it } from 'vitest'

import { isToolRelatedError, isTrustedOpenClawResultEvent, prepareSparkCommandForSend } from './llm'

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

describe('prepareSparkCommandForSend', () => {
  it('preserves OpenClaw destinations so the bridge can receive the task', () => {
    const command: WebSocketEvents['spark:command'] = {
      id: 'event-1',
      commandId: 'command-1',
      destinations: ['openclaw-bridge'],
      interrupt: false,
      priority: 'normal',
      intent: 'action',
      contexts: [{
        id: 'ctx-1',
        contextId: 'ctx-1',
        lane: 'openclaw:task',
        strategy: ContextUpdateStrategy.ReplaceSelf,
        text: 'pwd',
        metadata: {
          openclaw: {
            taskText: 'pwd',
          },
        },
      }],
    }

    expect(prepareSparkCommandForSend(command).destinations).toEqual(['openclaw-bridge'])
  })

  it('clears generic destinations to avoid accidental routing', () => {
    const command: WebSocketEvents['spark:command'] = {
      id: 'event-2',
      commandId: 'command-2',
      destinations: ['unknown-agent'],
      interrupt: false,
      priority: 'normal',
      intent: 'action',
      contexts: [{
        id: 'ctx-2',
        contextId: 'ctx-2',
        lane: 'general',
        strategy: ContextUpdateStrategy.ReplaceSelf,
        text: 'do something',
      }],
    }

    expect(prepareSparkCommandForSend(command).destinations).toEqual([])
  })
})

describe('isTrustedOpenClawResultEvent', () => {
  function createOpenClawResultEvent(pluginId: string): WebSocketBaseEvent<'context:update', WebSocketEvents['context:update']> {
    return {
      type: 'context:update',
      data: {
        id: 'ctx-event-1',
        contextId: 'ctx-1',
        lane: 'openclaw:result',
        text: '/workspace',
        strategy: ContextUpdateStrategy.ReplaceSelf,
        metadata: {
          openclaw: {
            commandId: 'command-1',
            request: {
              conversationId: 'conversation-1',
              source: 'stage-ui:chat-explicit-openclaw',
              userId: 'user-1',
            },
            status: 'completed',
          },
        },
      },
      metadata: {
        source: {
          kind: 'plugin',
          plugin: { id: pluginId },
          id: 'peer-1',
        },
        event: {
          id: 'evt-1',
        },
      },
    }
  }

  it('accepts results from the trusted OpenClaw bridge source', () => {
    const event = createOpenClawResultEvent('openclaw-bridge')

    expect(isTrustedOpenClawResultEvent(event, 'command-1', {
      conversationId: 'conversation-1',
      source: 'stage-ui:chat-explicit-openclaw',
      task: 'pwd',
      userId: 'user-1',
    })).toBe(true)
  })

  it('rejects results from an unexpected source', () => {
    const event = createOpenClawResultEvent('rogue-module')

    expect(isTrustedOpenClawResultEvent(event, 'command-1', {
      conversationId: 'conversation-1',
      source: 'stage-ui:chat-explicit-openclaw',
      task: 'pwd',
      userId: 'user-1',
    })).toBe(false)
  })

  it('rejects results when the delegated request does not match', () => {
    const event = createOpenClawResultEvent('openclaw-bridge')

    expect(isTrustedOpenClawResultEvent(event, 'command-1', {
      conversationId: 'conversation-2',
      source: 'stage-ui:chat-explicit-openclaw',
      task: 'pwd',
      userId: 'user-1',
    })).toBe(false)
  })
})
