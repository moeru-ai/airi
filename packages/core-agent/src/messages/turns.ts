import type { AssistantTurn, ContextSegment, GenerationRound, InputSegment, SegmentRefusal, SegmentText, SegmentToolCall, SegmentToolResult, Turn } from './types'

/** Adapter-local content records used while decoding and encoding protocol messages. Not stored in Conversation. */
export type ProjectionEntry = { id: string, source?: string, metadata?: Record<string, unknown> } & (
  | { role: 'user', segments: (InputSegment | ContextSegment)[] }
  | { role: 'assistant', segments: (SegmentText | SegmentRefusal | SegmentToolCall | ContextSegment)[] }
  | { role: 'tool', segments: SegmentToolResult[] }
  | { role: 'system' | 'developer' | 'context' | 'event' | 'summary', segments: (SegmentText | ContextSegment)[] }
)

/** Decodes one known model step. Tool results correlate only with calls in this round. */
export function readRound(id: string, entries: ProjectionEntry[]): GenerationRound {
  const round: GenerationRound = { id, content: [], toolInvocations: [], projectionIssues: [] }
  for (const entry of entries) {
    for (const segment of entry.segments) {
      if (segment.type === 'tool-call') {
        if (round.toolInvocations.some(call => call.callId === segment.callId)) {
          round.projectionIssues.push(`Duplicate tool call ${segment.callId} in round ${id}`)
          continue
        }
        const invocationId = `${id}/${segment.callId}`
        round.content.push({ type: 'tool', invocationId })
        round.toolInvocations.push({ id: invocationId, callId: segment.callId, name: segment.name, arguments: segment.arguments, execution: { status: 'pending' } })
      }
      else if (segment.type === 'tool-result') {
        const invocation = round.toolInvocations.find(call => call.callId === segment.callId)
        if (invocation)
          invocation.execution = { status: 'succeeded', output: segment.content }
        else
          round.projectionIssues.push(`Tool result ${segment.callId} has no call in round ${id}`)
      }
      else if (entry.role === 'assistant') {
        if (segment.type !== 'image' && segment.type !== 'audio' && segment.type !== 'file')
          round.content.push(segment)
      }
    }
  }
  return round
}

/**
 * Reads existing Chat-shaped history at its storage boundary. Each assistant message starts a
 * round; following tool results belong to it. Runtime adapters use SDK step boundaries instead.
 */
export function readTurns(entries: ProjectionEntry[]): Turn[] {
  const turns: Turn[] = []
  let assistant: AssistantTurn | undefined
  let pending: ProjectionEntry[] = []
  function flush() {
    if (assistant && pending.length) {
      assistant.rounds.push(readRound(`${assistant.id}/${assistant.rounds.length}`, pending))
      pending = []
    }
  }
  for (const entry of entries) {
    if (entry.role === 'assistant' || entry.role === 'tool') {
      if (!assistant) {
        assistant = { type: 'assistant', id: entry.id, status: 'completed', rounds: [] }
        turns.push(assistant)
      }
      if (entry.role === 'assistant')
        flush()
      pending.push(entry)
      continue
    }
    flush()
    assistant = undefined
    if (entry.role === 'user')
      turns.push({ type: 'user', id: entry.id, content: entry.segments })
    else
      turns.push({ type: 'system', id: entry.id, authority: entry.role === 'system' || entry.role === 'developer' ? entry.role : 'context', content: entry.segments })
  }
  flush()
  return turns
}

/** Expands one round for a protocol adapter without duplicating stored calls or results. */
export function projectRound(round: GenerationRound): ProjectionEntry[] {
  if (round.projectionIssues.length)
    throw new Error(`Round ${round.id} cannot be projected: ${round.projectionIssues.join('; ')}`)
  const entries: ProjectionEntry[] = []
  const segments: Extract<ProjectionEntry, { role: 'assistant' }>['segments'] = []
  for (const part of round.content) {
    if (part.type !== 'tool') {
      segments.push(part)
      continue
    }
    const invocation = round.toolInvocations.find(call => call.id === part.invocationId)
    if (!invocation)
      throw new Error(`Missing tool invocation ${part.invocationId}`)
    segments.push({ type: 'tool-call', callId: invocation.callId, name: invocation.name, arguments: invocation.arguments })
  }
  if (segments.length)
    entries.push({ id: round.id, role: 'assistant', segments })
  for (const invocation of round.toolInvocations) {
    if (invocation.execution.status === 'succeeded' || invocation.execution.status === 'failed')
      entries.push({ id: invocation.id, role: 'tool', segments: [{ type: 'tool-result', callId: invocation.callId, content: invocation.execution.output }] })
  }
  return entries
}

/** Application context becomes user-level data; trusted instructions retain their declared authority. */
export function projectInput(turn: Exclude<Turn, AssistantTurn>): ProjectionEntry {
  if (turn.type === 'user')
    return { id: turn.id, role: 'user', segments: turn.content }
  return { id: turn.id, role: turn.authority === 'context' ? 'context' : turn.authority, segments: turn.content }
}
