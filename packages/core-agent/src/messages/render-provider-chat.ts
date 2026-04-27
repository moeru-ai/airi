import type { HistoryItem, Message, MessageSegment, RawMessage } from './types'

function renderHistoryAction(item: HistoryItem) {
  if (item.type === 'summary') {
    return [
      'Summary:',
      item.text,
      item.fromTurnIndex != null || item.toTurnIndex != null
        ? `Window: ${item.fromTurnIndex ?? '?'} -> ${item.toTurnIndex ?? '?'}.`
        : undefined,
    ].filter(Boolean).join('\n')
  }

  if (item.type === 'reaction')
    return `${item.reactionType}: ${item.text}`

  if (item.type === 'domain-event') {
    return [
      `Domain event: ${item.eventType}`,
      JSON.stringify(item.payload, null, 2),
    ].join('\n')
  }

  if (item.action.kind === 'text')
    return item.action.text

  if (item.action.kind === 'event')
    return `${item.action.name}${item.action.payload ? ` ${JSON.stringify(item.action.payload)}` : ''}`

  if (item.action.kind === 'move-played' || item.action.kind === 'move-executed')
    return `${item.action.kind} ${item.action.san}`

  return JSON.stringify(item.action)
}

function renderSegmentText(segment: MessageSegment): string {
  if (segment.type === 'text')
    return segment.text

  if (segment.type === 'instruction') {
    return [
      segment.priority ? `Instruction [${segment.priority}]:` : 'Instruction:',
      segment.text,
    ].join('\n')
  }

  if (segment.type === 'tagged-text')
    return `<${segment.tag}>${segment.text}</${segment.tag}>`

  if (segment.type === 'domain-event') {
    return [
      `Domain event: ${segment.eventType}`,
      JSON.stringify(segment.payload, null, 2),
    ].join('\n')
  }

  if (segment.type === 'state-snapshot') {
    return [
      `State snapshot: ${segment.stateType}`,
      JSON.stringify(segment.payload, null, 2),
    ].join('\n')
  }

  if (segment.type === 'summary') {
    return [
      'Summary:',
      segment.text,
      segment.metadata ? JSON.stringify(segment.metadata, null, 2) : undefined,
    ].filter(Boolean).join('\n')
  }

  if (segment.type === 'reference') {
    return [
      `Reference: ${segment.refType} -> ${segment.targetId}`,
      segment.note,
    ].filter(Boolean).join('\n')
  }

  return segment.items.map(renderHistoryAction).join('\n')
}

function mapStructuredRole(role: Message['role']): RawMessage['role'] {
  if (role === 'context' || role === 'event' || role === 'summary')
    return 'system'

  return role
}

/**
 * Renders structured messages into provider chat messages with stable ordering.
 *
 * Use when:
 * - Preparing a chat completion input array
 * - Projected messages must be flattened into raw provider chat text without leaking domain-specific renderer logic
 *
 * Expects:
 * - Structured messages to contain renderable segments
 * - `mode` to describe the prompt surface, even when rendering stays identical
 *
 * Returns:
 * - Raw provider chat messages in the same order as the input entries
 */
export function renderProviderChatMessages(input: {
  entries: Array<Message | RawMessage>
  mode: 'session-main' | 'session-spark-notify' | 'session-spark-command' | 'eval-debug'
}): RawMessage[] {
  const attachSourceName = input.mode !== 'session-main'

  return input.entries.map((entry) => {
    if ('content' in entry)
      return entry

    return {
      role: mapStructuredRole(entry.role),
      content: entry.segments.map(renderSegmentText).join('\n'),
      name: attachSourceName ? entry.source : undefined,
      metadata: entry.metadata,
    }
  })
}
