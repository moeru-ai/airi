import type { EventManager } from './event-manager'
import type { RawPerceptionEvent } from './raw-events'

import { LeakyBucket } from './leaky-bucket'

export interface AttentionEventPayload {
  raw: RawPerceptionEvent
  intensity: number
}

export class AttentionDetector {
  private readonly buckets = new Map<string, LeakyBucket>()

  constructor(private readonly deps: { eventManager: EventManager }) { }

  public tick(deltaMs: number): void {
    for (const bucket of this.buckets.values()) {
      bucket.tick(deltaMs)
    }
  }

  public ingest(event: RawPerceptionEvent): void {
    const key = this.keyOf(event)
    const bucket = this.getBucket(key)

    const weight = 1
    const { fired, value } = bucket.add(weight)

    if (!fired)
      return

    this.deps.eventManager.emit<AttentionEventPayload>({
      type: 'perception',
      payload: {
        raw: event,
        intensity: value,
      },
      source: { type: 'minecraft', id: 'perception' },
      timestamp: Date.now(),
    })
  }

  private getBucket(key: string): LeakyBucket {
    const existing = this.buckets.get(key)
    if (existing)
      return existing

    const created = new LeakyBucket({
      capacity: 10,
      leakPerSecond: 2,
      trigger: 3,
    })

    this.buckets.set(key, created)
    return created
  }

  private keyOf(event: RawPerceptionEvent): string {
    switch (event.modality) {
      case 'sighted':
        return `sighted:${event.kind}:${(event as any).entityId ?? 'unknown'}`
      case 'heard':
        return `heard:${event.kind}:${event.soundId}`
      case 'felt':
        return `felt:${event.kind}`
      default:
        return 'unknown'
    }
  }
}
