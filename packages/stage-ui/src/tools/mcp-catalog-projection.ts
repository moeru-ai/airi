import type { Conversation, GenerationRound, ProviderContinuation } from '@proj-airi/core-agent'

import type { McpToolDescriptor } from '../types/mcp'

import { isPlainObject } from 'es-toolkit'

import { MCP_LIST_TOOL_NAME } from './mcp'

function isDescriptor(value: unknown): value is Pick<McpToolDescriptor, 'name' | 'serverName' | 'toolName' | 'inputSchema'> {
  return isPlainObject(value) && typeof value.name === 'string' && typeof value.serverName === 'string'
    && typeof value.toolName === 'string' && isPlainObject(value.inputSchema)
}

function projectCatalog(text: string): string {
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch {
    return text
  }
  if (!Array.isArray(value) || !value.length || !value.every(isDescriptor)) {
    return text
  }
  const projected = JSON.stringify({
    tools: value.map(({ inputSchema: _schema, ...metadata }) => metadata),
    schemasOmitted: true,
    snapshot: 'Historical discovery, not current service status or execution permission.',
    refresh: 'Call builtIn_mcpListTools with an exact name for its current schema, or name=null to refresh the catalog.',
  })
  return projected.length < text.length ? projected : text
}

function projectContinuation(continuation: ProviderContinuation, calls: Set<string>): ProviderContinuation {
  // Native replay can bypass portable content. Replace only the correlated catalog result,
  // leaving reasoning, provider extensions, unrelated results and every original call intact.
  if (continuation.protocol === 'chat-completions') {
    return { ...continuation, data: continuation.data.map(message => message.role === 'tool' && calls.has(message.tool_call_id)
      ? { ...message, content: typeof message.content === 'string'
          ? projectCatalog(message.content)
          : message.content.map(part => part.type === 'text' ? { ...part, text: projectCatalog(part.text) } : part) }
      : message) }
  }
  return { ...continuation, data: continuation.data.map(item => item.type === 'function_call_output' && calls.has(item.call_id)
    ? { ...item, output: typeof item.output === 'string'
        ? projectCatalog(item.output)
        : item.output.map(part => part.type === 'input_text' ? { ...part, text: projectCatalog(part.text) } : part) }
    : item) }
}

function projectRound(round: GenerationRound): GenerationRound {
  const calls = new Set<string>()
  const toolInvocations = round.toolInvocations.map((call) => {
    if (call.name !== MCP_LIST_TOOL_NAME || call.execution.status !== 'succeeded')
      return call
    const output = call.execution.output.map((part) => {
      if (part.type !== 'text')
        return part
      const text = projectCatalog(part.text)
      if (text === part.text)
        return part
      calls.add(call.callId)
      return { ...part, text }
    })
    return calls.has(call.callId) ? { ...call, execution: { ...call.execution, output } } : call
  })
  return calls.size ? { ...round, toolInvocations, continuation: round.continuation ? projectContinuation(round.continuation, calls) : undefined } : round
}

/**
 * Keeps fresh discovery intact for the next decision and reduces older catalogs in request copies.
 * Native and portable results keep their call identity. Stored records and unrelated output remain unchanged.
 */
export function projectMcpCatalogHistory(conversation: Conversation): Conversation {
  const last = conversation.turns.at(-1)
  const fresh = last?.type === 'assistant' ? last.rounds.at(-1) : undefined
  let changed = false
  const turns = conversation.turns.map((turn) => {
    if (turn.type !== 'assistant')
      return turn
    const rounds = turn.rounds.map(round => round === fresh ? round : projectRound(round))
    if (rounds.every((round, index) => round === turn.rounds[index]))
      return turn
    changed = true
    return { ...turn, rounds }
  })
  return changed ? { ...conversation, turns } : conversation
}
