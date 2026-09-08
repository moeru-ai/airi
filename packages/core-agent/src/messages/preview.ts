import type { Message as ChatMessage } from '@xsai/shared-chat'

import type { ConversationContext, MessageSegment } from './types'

import { renderSegmentText } from './render-context'

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
export function renderConversationPreview(context: ConversationContext): ChatMessage[] {
  return context.turns.flatMap(turn => turn.messages.map((message) => {
    const content = message.segments.map(describeSegment).join('')
    // Domain and tool activity is narrated as data for the existing display
    // consumers. Only protocol adapters assign actual API roles and call ids.
    const role = message.role === 'system' || message.role === 'developer' || message.role === 'assistant' ? message.role : 'user'
    return { role, content }
  }))
}
