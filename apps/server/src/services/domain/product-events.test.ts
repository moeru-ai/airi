import type { Database } from '../../libs/db'
import type { ProductMetrics } from '../../otel'

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createProductEventService } from './product-events'

import * as schema from '../../schemas'

describe('productEventService', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  beforeEach(async () => {
    await db.delete(schema.productEvents)
  })

  it('writes first-party events and increments only low-cardinality metric labels', async () => {
    const events = { add: vi.fn() }
    const service = createProductEventService(db, { events } as unknown as ProductMetrics)

    await service.track({
      userId: 'user-1',
      feature: 'gen_ai_chat',
      action: 'completion_succeeded',
      status: 'succeeded',
      source: 'openai.chat.completions',
      model: 'openrouter/anthropic/claude-sonnet-4',
      provider: 'openrouter',
      metadata: {
        stream: false,
        flux_consumed: 3,
      },
    })

    const rows = await db.select().from(schema.productEvents)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: 'user-1',
      feature: 'gen_ai_chat',
      action: 'completion_succeeded',
      status: 'succeeded',
      source: 'openai.chat.completions',
      model: 'openrouter/anthropic/claude-sonnet-4',
      provider: 'openrouter',
    })

    expect(events.add).toHaveBeenCalledWith(1, {
      feature: 'gen_ai_chat',
      action: 'completion_succeeded',
      status: 'succeeded',
      source: 'openai.chat.completions',
    })
  })

  it('aggregates event volume and distinct users by feature/action/status', async () => {
    const service = createProductEventService(db)
    const createdAt = new Date('2026-06-03T00:00:00.000Z')

    await service.track({
      userId: 'user-1',
      feature: 'tts',
      action: 'speech_succeeded',
      status: 'succeeded',
      source: 'audio.speech',
      createdAt,
    })
    await service.track({
      userId: 'user-1',
      feature: 'tts',
      action: 'speech_succeeded',
      status: 'succeeded',
      source: 'audio.speech.ws',
      createdAt,
    })
    await service.track({
      userId: 'user-2',
      feature: 'tts',
      action: 'speech_succeeded',
      status: 'succeeded',
      source: 'audio.speech',
      createdAt,
    })

    const rows = await service.countDistinctUsersByFeature({
      from: new Date('2026-06-02T00:00:00.000Z'),
      to: new Date('2026-06-04T00:00:00.000Z'),
    })

    expect(rows).toEqual([{
      feature: 'tts',
      action: 'speech_succeeded',
      status: 'succeeded',
      eventCount: 3,
      distinctUsers: 2,
    }])
  })

  it('writes blocked TTS events for server-side preflight decisions', async () => {
    const events = { add: vi.fn() }
    const service = createProductEventService(db, { events } as unknown as ProductMetrics)

    await service.track({
      userId: 'user-1',
      feature: 'tts',
      action: 'speech_blocked',
      status: 'blocked',
      source: 'chat_auto_tts',
      reason: 'insufficient_balance',
      metadata: {
        trigger: 'auto',
        balance_state: 'insufficient',
      },
    })

    const rows = await db.select().from(schema.productEvents)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      feature: 'tts',
      action: 'speech_blocked',
      status: 'blocked',
      source: 'chat_auto_tts',
      reason: 'insufficient_balance',
    })
    expect(events.add).toHaveBeenCalledWith(1, {
      feature: 'tts',
      action: 'speech_blocked',
      status: 'blocked',
      source: 'chat_auto_tts',
    })
  })
})
