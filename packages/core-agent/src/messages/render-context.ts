import type { HistoryItem, MessageSegment } from './types'

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

/** Renders domain context as text without assigning a provider role or wire format. */
export function renderSegmentText(segment: MessageSegment): string {
  if (segment.type === 'runtime-context')
    return segment.entries.length ? `\n[Context]\n${segment.entries.map(entry => `- ${entry.source}: ${entry.text}`).join('\n')}` : ''

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

  if (segment.type === 'history-block')
    return segment.items.map(renderHistoryAction).join('\n')

  throw new Error(`Cannot render ${segment.type} as context text`)
}
