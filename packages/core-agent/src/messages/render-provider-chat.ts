import type { ProjectionEntry } from './turns'
import type { RawMessage } from './types'

import { renderSegmentText } from './render-context'

function mapStructuredRole(role: ProjectionEntry['role']): RawMessage['role'] {
  if (role === 'context' || role === 'event' || role === 'summary')
    return 'system'

  if (role === 'developer')
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
  entries: Array<ProjectionEntry | RawMessage>
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
