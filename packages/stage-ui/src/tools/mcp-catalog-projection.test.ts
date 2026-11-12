import type { Conversation, GenerationRound } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { McpToolDescriptor } from './mcp'

import { ConversationCompact, conversationToChatMessages, streamFrom } from '@proj-airi/core-agent'
import { describe, expect, it, vi } from 'vitest'

import { resolveLlmTools } from '../stores/ai/chat-llm/tool-resolver'
import { createMcpTools } from './mcp'
import { projectMcpCatalogHistory } from './mcp-catalog-projection'

const catalog: McpToolDescriptor[] = Array.from({ length: 71 }, (_, index) => ({
  serverName: 'fixture',
  name: `fixture::tool_${index}`,
  toolName: `tool_${index}`,
  inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Fixture schema. '.repeat(60) } } },
}))
const text = JSON.stringify(catalog)

function source(): Conversation {
  const round: GenerationRound = {
    id: 'run/0',
    content: [{ type: 'tool', invocationId: 'list' }],
    projectionIssues: [],
    toolInvocations: [{ id: 'list', callId: 'provider-list', name: 'builtIn_mcpListTools', arguments: '{}', execution: { status: 'succeeded', output: [{ type: 'text', text }] } }],
    continuation: { protocol: 'chat-completions', scope: 'same-scope', data: [
      { role: 'assistant', content: '', tool_calls: [{ id: 'provider-list', type: 'function', function: { name: 'builtIn_mcpListTools', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'provider-list', content: text },
    ] },
  }
  return { turns: [
    { type: 'user', id: 'goal', content: [{ type: 'text', text: 'Original goal.' }] },
    { type: 'assistant', id: 'run', status: 'completed', rounds: [round] },
  ] }
}

describe('catalog history projection', () => {
  it.each(['off', 'synchronous', 'background'] as const)('composes with %s Compact without changing notices or raw history', async (mode) => {
    const conversation = source()
    const assistant = conversation.turns[1]
    if (assistant.type !== 'assistant')
      throw new Error('Missing fixture assistant')
    assistant.rounds.push(...[1, 2, 3].map(index => ({ id: `run/${index}`, content: [{ type: 'text' as const, text: 'Earlier observation. '.repeat(100) }], toolInvocations: [], projectionIssues: [] })))
    conversation.turns.push({ type: 'user', id: 'notice', notice: { source: 'host' }, content: [{ type: 'text', text: 'status=unknown; noNewDispatch=false' }] })
    const original = structuredClone(conversation)
    const compact = new ConversationCompact({ softLimitBytes: 5000, hardLimitBytes: 25000, retainRounds: 1 })
    compact.setMode(mode)
    const summarize = vi.fn(async (snapshot: Conversation) => {
      expect(JSON.stringify(snapshot)).not.toContain('Fixture schema.')
      return 'Earlier observations retained.'
    })
    const projected = await compact.prepare(projectMcpCatalogHistory(conversation), { scope: 'fixture', measureContextBytes: value => new TextEncoder().encode(JSON.stringify(value)).byteLength, summarize })
    expect(JSON.stringify(projected)).toContain('status=unknown; noNewDispatch=false')
    expect(JSON.stringify(projected)).not.toContain('Fixture schema.')
    expect(summarize).toHaveBeenCalledTimes(mode === 'off' ? 0 : 1)
    expect(conversation).toEqual(original)
    compact.reset()
  })

  it.each(['chat-completions', 'responses'] as const)('preserves full records while reducing the next %s provider request', async (protocol) => {
    const requests: Record<string, unknown>[] = []
    let effects = 0
    const descriptors = [{ serverName: 'fixture', name: 'fixture::terminal_exec', toolName: 'terminal_exec', exposure: 'direct' as const, inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } }, ...catalog]
    const callTool = vi.fn(async () => {
      effects++
      return { structuredContent: { status: 'unknown', noNewDispatch: false }, content: [{ type: 'text', text: 'The effect occurred. Response confirmation was lost.' }] }
    })
    const tools = await resolveLlmTools({
      builtInTools: [],
      debugTools: [],
      sparkCommandTools: [],
      webSearchTools: [],
      activeTools: await createMcpTools({ listTools: async () => descriptors, callTool }, { direct: descriptors }),
      attribution: { sessionId: 'fixture-session', turnId: 'fixture-turn' },
    })
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      const index = requests.length
      const name = index === 1 ? 'builtIn_mcpListTools' : 'terminal_exec'
      const args = JSON.stringify(index === 1
        ? { name: null, call_summary: 'Discover tools', call_icon: [] }
        : { command: 'fixture', call_summary: 'Run fixture', call_icon: [] })
      const output = index < 3
        ? [{ type: 'function_call', call_id: `call-${index}`, name, arguments: args }]
        : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Stopped on uncertainty.' }] }]
      const events = protocol === 'responses'
        ? [...output.map(item => ({ type: 'response.output_item.done', item })), { type: 'response.completed', response: { output } }]
        : [{ choices: [{ index: 0, delta: index < 3
            ? { tool_calls: [{ index: 0, id: `call-${index}`, type: 'function', function: { name, arguments: args } }] }
            : { content: 'Stopped on uncertainty.' }, finish_reason: index < 3 ? 'tool_calls' : 'stop' }] }]
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
    }
    const chatProvider: GenerationProvider = { generation: model => protocol === 'responses'
      ? { protocol, webSearch: false, config: { model, baseURL: 'https://example.com/v1/', fetch } }
      : { protocol, config: { model, baseURL: 'https://example.com/v1/', fetch } } }
    let completed: Conversation | undefined
    await streamFrom({ model: 'fixture-model', chatProvider, conversation: { turns: [{ type: 'user', id: 'goal', content: [{ type: 'text', text: 'Use the fixture and stop on unknown results.' }] }] }, options: {
      tools,
      prepareConversation: async context => projectMcpCatalogHistory(context),
      onGeneratedTurn: (turn) => { completed = { turns: [turn] } },
    } })
    expect(requests).toHaveLength(3)
    expect(JSON.stringify(requests[1])).toContain('Fixture schema.')
    expect(JSON.stringify(requests[2])).not.toContain('Fixture schema.')
    expect(JSON.stringify(requests[2])).toContain('schemasOmitted')
    expect(JSON.stringify(requests[2])).toContain('noNewDispatch')
    expect(JSON.stringify(requests[2])).toContain('call-1')
    expect(JSON.stringify(requests[2])).toContain('call-2')
    expect(JSON.stringify(completed)).toContain('Fixture schema.')
    expect(callTool).toHaveBeenCalledOnce()
    expect(effects).toBe(1)
    console.info(JSON.stringify({ boundary: 'Real Core, SDK, Resolver, MCP factory and projection. Controlled provider and executor, no real approval or Shell.', protocol, effects, calls: callTool.mock.calls, requests, completed }))
  })

  it('keeps a just-discovered schema for the immediate next decision', () => {
    expect(projectMcpCatalogHistory(source())).toEqual(source())
  })

  it('shrinks an older catalog in portable and native replay without changing the stored result', () => {
    const conversation = source()
    conversation.turns.push({ type: 'user', id: 'notice', notice: { source: 'host' }, content: [{ type: 'text', text: 'status=unknown; noNewDispatch=false' }] })
    const before = structuredClone(conversation)
    const projected = projectMcpCatalogHistory(conversation)
    const native = conversationToChatMessages(projected, true, 'same-scope')
    const portable = conversationToChatMessages(projected)
    for (const messages of [native, portable]) {
      const result = messages.find(message => message.role === 'tool')
      expect(result).toMatchObject({ role: 'tool', tool_call_id: 'provider-list' })
      expect(JSON.stringify(result)).toContain('schemasOmitted')
      expect(JSON.stringify(result)).toContain('fixture::tool_70')
      expect(JSON.stringify(result)).not.toContain('Fixture schema.')
      expect(JSON.stringify(messages)).toContain('status=unknown; noNewDispatch=false')
      expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(text.length / 4)
    }
    expect(conversation).toEqual(before)
  })

  it('preserves failed results and arbitrary JSON from other tools', () => {
    const conversation = source()
    const assistant = conversation.turns[1]
    if (assistant.type !== 'assistant')
      throw new Error('Missing fixture assistant')
    assistant.rounds[0].toolInvocations[0].name = 'terminal_exec'
    conversation.turns.push({ type: 'user', id: 'next', content: [{ type: 'text', text: 'Next.' }] })
    expect(projectMcpCatalogHistory(conversation)).toEqual(conversation)
    assistant.rounds[0].toolInvocations[0].name = 'builtIn_mcpListTools'
    assistant.rounds[0].toolInvocations[0].execution.status = 'failed'
    expect(projectMcpCatalogHistory(conversation)).toEqual(conversation)
  })

  it('keeps native provider fields and isolates repeated call IDs to their owning round', () => {
    const conversation = source()
    const assistant = conversation.turns[1]
    if (assistant.type !== 'assistant')
      throw new Error('Missing fixture assistant')
    const original = assistant.rounds[0]
    const unrelated = structuredClone(original)
    unrelated.id = 'run/1'
    unrelated.toolInvocations[0].name = 'another-tool'
    if (unrelated.continuation?.protocol === 'chat-completions') {
      unrelated.continuation.data.unshift({ role: 'assistant', content: 'Opaque provider narrative.', refusal: 'Native refusal text.' })
    }
    assistant.rounds.push(unrelated)
    conversation.turns.push({ type: 'user', id: 'next', content: [{ type: 'text', text: 'Next.' }] })
    const projected = projectMcpCatalogHistory(conversation)
    const result = projected.turns[1]
    if (result.type !== 'assistant')
      throw new Error('Missing projected assistant')
    expect(result.rounds[1]).toEqual(unrelated)
    expect(JSON.stringify(result.rounds[0])).toContain('schemasOmitted')
    expect(JSON.stringify(result.rounds[1])).toContain('Fixture schema.')
    expect(result.rounds[0].toolInvocations[0].arguments).toBe('{}')
  })
})
