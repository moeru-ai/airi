import type { WebSocketEvents } from '@proj-airi/server-sdk'

type Optional<T> = T | undefined

export type FlowDirection = 'incoming' | 'outgoing'
export type FlowChannel = 'server' | 'broadcast' | 'chat' | 'devtools'

export interface FlowEntry {
  id: number
  timestamp: number
  direction: FlowDirection
  channel: FlowChannel
  type: string
  summary?: string
  payload?: unknown
  searchText: string
}

export interface PreviewItem {
  label: string
  value: string
}

export interface SparkNotifyEntryState {
  eventId: string
  sparkId?: string
  handling: boolean
  commands: WebSocketEvents['spark:command'][]
  reaction: string
  startedAt: number
  endedAt?: number
  error?: Optional<string>
}
