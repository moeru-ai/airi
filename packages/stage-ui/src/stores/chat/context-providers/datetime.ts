import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

const DATETIME_CONTEXT_ID = 'system:datetime'

/**
 * Creates a context message containing the current datetime information.
 * This context is injected before each chat message to provide temporal awareness.
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function getTimeOfDay(hour: number): string {
  if (hour < 6)
    return 'late night'
  if (hour < 12)
    return 'morning'
  if (hour < 14)
    return 'noon'
  if (hour < 18)
    return 'afternoon'
  if (hour < 21)
    return 'evening'
  return 'night'
}

export function createDatetimeContext(): ContextMessage {
  const now = new Date()
  const dayName = DAY_NAMES[now.getDay()]
  const timeOfDay = getTimeOfDay(now.getHours())

  return {
    id: nanoid(),
    contextId: DATETIME_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: `Current datetime: ${now.toISOString()} (${now.toLocaleString()}, ${dayName}, ${timeOfDay})`,
    createdAt: Date.now(),
    metadata: {
      source: {
        id: DATETIME_CONTEXT_ID,
        kind: 'plugin',
        plugin: {
          id: 'airi:system:datetime',
        },
      },
    },
  }
}
