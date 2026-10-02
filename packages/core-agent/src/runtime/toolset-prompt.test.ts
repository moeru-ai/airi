import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { Tool } from '@xsai/shared-chat'

import type { AssistantTurn, Conversation } from '../messages/types'

import { expect, it, vi } from 'vitest'

import { createSparkCommandTool, SPARK_COMMAND_TOOLSET_PROMPT } from '../agents/spark-command/tools'
import { streamFrom } from './llm-service'

interface RequestBody {
  messages?: Array<{ role: string, content?: unknown }>
  input?: Array<{ type: string, role?: string, content?: unknown }>
  tools?: unknown[]
}

/** Request items that carry the guidance: a `developer` item for Responses, and the system message for Chat Completions. */
function guidanceOf(protocol: string, items: Array<{ role?: string, content?: unknown }> | undefined, guidance: string) {
  const role = protocol === 'responses' ? 'developer' : 'system'
  return (items ?? []).filter(item => item.role === role && JSON.stringify(item.content).includes(JSON.stringify(guidance).slice(1, 60)))
}

const relay: Tool = {
  type: 'function',
  function: { name: 'builtIn_emitSparkCommand', parameters: { type: 'object', properties: {} } },
  execute: async () => 'submitted',
}

for (const protocol of ['chat-completions', 'responses'] as const) {
  it.each([true, false])(`${protocol}: relays without persistent guidance after tool revocation: %s`, async (revoked) => {
    let granted = true
    const sent = vi.fn(() => {
      granted = !revoked
    })
    const tools = await createSparkCommandTool({ sendSparkCommand: sent })
    const requests: RequestBody[] = []
    const payload = {
      destinations: ['minecraft-bot'],
      intent: 'action',
      guidance: { type: 'instruction', persona: null, options: [{
        label: 'Build a shelter',
        steps: ['Build a shelter near the spawn point.'],
        rationale: null,
        possibleOutcome: null,
        risk: null,
        fallback: null,
        triggers: null,
      }] },
      interrupt: null,
      priority: null,
      ack: null,
      parentEventId: null,
      contexts: null,
    }
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      const event = protocol === 'responses'
        ? { type: 'response.completed', response: {
            output: requests.length === 1 ? [{ type: 'function_call', call_id: 'relay-1', name: 'builtIn_emitSparkCommand', arguments: JSON.stringify(payload) }] : [],
          } }
        : { choices: [{ index: 0, delta: requests.length === 1
            ? { tool_calls: [{ index: 0, id: 'relay-1', type: 'function', function: { name: 'builtIn_emitSparkCommand', arguments: JSON.stringify(payload) } }] }
            : { content: 'Submitted.' }, finish_reason: requests.length === 1 ? 'tool_calls' : 'stop' }] }
      const events = 'response' in event && event.response
        ? [...event.response.output.map(item => ({ type: 'response.output_item.done', item })), event]
        : [event]
      return new Response(events.map(item => `data: ${JSON.stringify(item)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
    }
    const chatProvider: GenerationProvider = {
      generation: model => protocol === 'responses'
        ? { protocol, webSearch: false, config: { model, baseURL: 'https://example.test/v1/', fetch } }
        : { protocol, config: { model, baseURL: 'https://example.test/v1/', fetch } },
    }
    const prompt = vi.fn(() => SPARK_COMMAND_TOOLSET_PROMPT)
    let generated: AssistantTurn | undefined
    await streamFrom({
      model: 'test',
      chatProvider,
      conversation: { turns: [] },
      options: {
        resolveToolsetPrompt: prompt,
        resolveStep: async () => ({ model: 'test', chatProvider, providerId: 'test', systemPrompt: 'Task instructions.', tools: granted ? tools : [] }),
        onGeneratedTurn: (turn) => { generated = turn },
      },
    })
    expect(sent).toHaveBeenCalledOnce()
    expect(sent).toHaveBeenCalledWith(expect.objectContaining({
      destinations: ['minecraft-bot'],
      intent: 'action',
      guidance: expect.objectContaining({ type: 'instruction', options: [expect.objectContaining({ label: payload.guidance.options[0].label, steps: payload.guidance.options[0].steps })] }),
    }))
    expect(requests).toHaveLength(2)
    const first = protocol === 'responses' ? requests[0].input : requests[0].messages
    const second = protocol === 'responses' ? requests[1].input : requests[1].messages
    expect(guidanceOf(protocol, first, SPARK_COMMAND_TOOLSET_PROMPT)).toHaveLength(1)
    expect(guidanceOf(protocol, second, SPARK_COMMAND_TOOLSET_PROMPT)).toHaveLength(revoked ? 0 : 1)
    expect(requests[1].tools?.length ?? 0).toBe(revoked ? 0 : 1)
    expect(prompt).toHaveBeenCalledTimes(revoked ? 1 : 2)
    expect(generated?.rounds[0].toolInvocations[0].execution.status).toBe('succeeded')
    expect(JSON.stringify(generated)).not.toContain('guidance.options[0].label')
  })

  for (const admission of ['granted', 'empty', 'disabled', 'cached-disabled'] as const) {
    it(`${protocol}: keeps relay guidance request-owned with ${admission} tools`, async () => {
      const requests: RequestBody[] = []
      const fetch: typeof globalThis.fetch = async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)))
        const event = protocol === 'responses'
          ? { type: 'response.completed', response: { output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }
          : { choices: [{ index: 0, delta: { content: 'Done.' }, finish_reason: 'stop' }] }
        return new Response(`data: ${JSON.stringify(event)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
      }
      const chatProvider: GenerationProvider = {
        generation: model => protocol === 'responses'
          ? { protocol, webSearch: false, config: { model, baseURL: 'https://example.test/v1/', fetch } }
          : { protocol, config: { model, baseURL: 'https://example.test/v1/', fetch } },
      }
      const conversation: Conversation = { turns: [{ id: 'user', type: 'user', content: [{ type: 'text', text: 'Relay this instruction.' }] }] }
      const original = structuredClone(conversation)
      const prompt = vi.fn(() => SPARK_COMMAND_TOOLSET_PROMPT)
      let generated: AssistantTurn | undefined
      await streamFrom({
        model: 'test',
        chatProvider,
        conversation,
        options: {
          tools: admission === 'empty' ? [] : [relay],
          supportsTools: admission === 'disabled' ? false : undefined,
          toolsCompatibility: new Map([[`${protocol === 'responses' ? 'responses:' : ''}https://example.test/v1/-test`, admission !== 'cached-disabled']]),
          resolveToolsetPrompt: prompt,
          onGeneratedTurn: (turn) => { generated = turn },
        },
      })
      const input = protocol === 'responses' ? requests[0].input : requests[0].messages
      expect(guidanceOf(protocol, input, SPARK_COMMAND_TOOLSET_PROMPT)).toHaveLength(admission === 'granted' ? 1 : 0)
      // Chat Completions never sends a `developer` message, because some providers reject the role.
      if (protocol === 'chat-completions')
        expect(input?.filter(item => item.role === 'developer')).toEqual([])
      expect(requests[0].tools?.length ?? 0).toBe(admission === 'granted' ? 1 : 0)
      expect(prompt).toHaveBeenCalledTimes(admission === 'granted' ? 1 : 0)
      expect(conversation).toEqual(original)
      expect(JSON.stringify(generated)).not.toContain('guidance.options[0]')
    })
  }
}
