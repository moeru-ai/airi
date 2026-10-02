import type { Message as ChatMessage } from '@xsai/shared-chat'

import type { Conversation, MessageSegment } from './types'

import { renderSegmentText } from './render-context'
import { projectInput } from './turns'

function describeSegment(segment: MessageSegment): string {
  switch (segment.type) {
    case 'tool-call': return `${segment.name}(${segment.arguments})`
    case 'tool-result': return segment.content.map(describeSegment).join('')
    case 'image': return '[Image]'
    case 'audio': return '[Audio]'
    case 'file': return `[File: ${segment.name ?? 'attachment'}]`
    case 'refusal': return segment.text
    default: return renderSegmentText(segment)
  }
}

/**
 * Builds text-only hook and devtools records, excluding native state and media payloads.
 * Media becomes a label, including media in tool results. These records must not feed inference.
 */
export function renderConversationPreview(context: Conversation): ChatMessage[] {
  return context.turns.flatMap<ChatMessage>((turn) => {
    if (turn.type !== 'assistant') {
      const entry = projectInput(turn)
      return [{ role: entry.role === 'system' || entry.role === 'developer' ? entry.role : 'user', content: entry.segments.map(describeSegment).join('') }]
    }
    return turn.rounds.map(round => ({
      role: 'assistant',
      content: round.content.map((part) => {
        if (part.type !== 'tool')
          return describeSegment(part)
        const invocation = round.toolInvocations.find(call => call.id === part.invocationId)
        if (!invocation)
          return '[Unknown tool]'
        const output = invocation.execution.status === 'succeeded' || invocation.execution.status === 'failed'
          ? invocation.execution.output.map(describeSegment).join('')
          : `[${invocation.execution.status}]`
        return `${invocation.name}(${invocation.arguments}): ${output}`
      }).join(''),
    }))
  })
}
