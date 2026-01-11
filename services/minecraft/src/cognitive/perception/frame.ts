import type { RawPerceptionEvent } from './raw-events'

export type PerceptionFrameSource = 'minecraft'

export type PerceptionFrameKind =
  | 'world_raw'
  | 'chat_raw'

export interface PerceptionFrame {
  id: string
  ts: number
  source: PerceptionFrameSource
  kind: PerceptionFrameKind
  raw: RawPerceptionEvent | { username: string, message: string }
  norm?: {
    entityId?: string
    distance?: number
    within32?: boolean
    displayName?: string
  }
  signals: Array<{ type: string, payload: any }>
}

export function createPerceptionFrameFromRawEvent(event: RawPerceptionEvent): PerceptionFrame {
  return {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    ts: event.timestamp,
    source: 'minecraft',
    kind: 'world_raw',
    raw: event,
    signals: [],
  }
}

export function createPerceptionFrameFromChat(username: string, message: string): PerceptionFrame {
  return {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    ts: Date.now(),
    source: 'minecraft',
    kind: 'chat_raw',
    raw: {
      username,
      message,
    },
    signals: [],
  }
}
