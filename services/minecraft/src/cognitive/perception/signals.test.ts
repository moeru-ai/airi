import type { RawPerceptionEvent } from './types/raw-events'

import { describe, expect, it, vi } from 'vitest'

import { AttentionDetector } from './attention-detector'

function makeLogger() {
  const logger: any = {
    withFields: () => logger,
    withError: () => logger,
    log: () => { },
    warn: () => { },
    error: () => { },
  }
  return logger
}

describe('attentionDetector (Signals)', () => {
  it('emits entity_attention signal for punch', () => {
    const onAttention = vi.fn()
    const detector = new AttentionDetector({ logger: makeLogger(), onAttention })

    const event: RawPerceptionEvent = {
      modality: 'sighted',
      kind: 'arm_swing',
      entityId: '123',
      entityType: 'player',
      displayName: 'Steve',
      distance: 5,
      hasLineOfSight: true,
      timestamp: Date.now(),
      pos: { x: 0, y: 0, z: 0 } as any,
      source: 'minecraft',
    } as any

    // Trigger 3 times
    detector.ingest(event)
    detector.ingest(event)
    detector.ingest(event)

    expect(onAttention).toHaveBeenCalledTimes(1)
    const signal = onAttention.mock.calls[0][0]

    expect(signal).toMatchObject({
      type: 'entity_attention',
      sourceId: '123',
      confidence: 1.0,
      metadata: {
        kind: 'player',
        action: 'punch',
        displayName: 'Steve',
      },
    })
    expect(signal.description).toContain('Steve')
    expect(signal.description).toContain('punching')
  })

  it('emits environmental_anomaly signal for sound', () => {
    const onAttention = vi.fn()
    const detector = new AttentionDetector({ logger: makeLogger(), onAttention })

    const event: RawPerceptionEvent = {
      modality: 'heard',
      kind: 'sound',
      soundId: 'entity.zombie.ambient',
      distance: 10,
      timestamp: Date.now(),
      source: 'minecraft',
      pos: { x: 0, y: 0, z: 0 } as any,
    } as any

    detector.ingest(event)

    expect(onAttention).toHaveBeenCalledTimes(1)
    const signal = onAttention.mock.calls[0][0]

    expect(signal).toMatchObject({
      type: 'environmental_anomaly',
      sourceId: 'entity.zombie.ambient',
      confidence: 1.0,
      metadata: {
        kind: 'sound',
        action: 'sound',
        soundId: 'entity.zombie.ambient',
      },
    })
  })
})
