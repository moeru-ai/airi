import type { InferAnalyticsEventPayload } from './dsl'

import { describe, expect, it } from 'vitest'

import { defineEvent } from './dsl'

describe('defineEvent', () => {
  it('keeps the event name and infers its payload type', () => {
    const event = defineEvent<{ conversation_id: string }>('message_sent')
    const payload: InferAnalyticsEventPayload<typeof event> = {
      conversation_id: 'conversation-1',
    }

    expect(event.name).toBe('message_sent')
    expect(payload).toEqual({ conversation_id: 'conversation-1' })
  })
})
