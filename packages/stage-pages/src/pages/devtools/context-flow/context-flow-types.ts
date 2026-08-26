import type { WebSocketEvents } from '@proj-airi/server-sdk'

export type FlowChannel = 'broadcast' | 'chat' | 'devtools' | 'server'

export type FlowDirection = 'incoming' | 'outgoing'
export interface FlowEntry {
  channel: FlowChannel
  direction: FlowDirection
  id: number
  payload?: unknown
  searchText: string
  summary?: string
  timestamp: number
  type: string
}

export interface PreviewItem {
  label: string
  value: string
}

export interface SparkNotifyEntryState {
  commands: WebSocketEvents['spark:command'][]
  endedAt?: number
  error?: Optional<string>
  eventId: string
  handling: boolean
  reaction: string
  sparkId?: string
  startedAt: number
}

type Optional<T> = T | undefined
