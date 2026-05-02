import type { Buffer } from 'node:buffer'

export type { SourceDescriptor, SourceSwitchRequest } from '@proj-airi/visual-chat-protocol'
export type { RoomCreateRequest, RoomInfo } from '@proj-airi/visual-chat-protocol'

export type SessionId = string
export type RoomName = string
export type SourceId = string
export type WorkerId = string

export interface VideoFrame {
  sourceId: string
  timestamp: number
  data: Buffer
  width: number
  height: number
}

export interface AudioChunk {
  sourceId: string
  timestamp: number
  data: Buffer
  sampleRate: 16000
  channels: 1
  durationMs: 1000
}

export interface SourceMetadata {
  sourceId: string
  participantIdentity: string
  deviceLabel?: string
  firstSeenAt: number
  lastSeenAt: number
  frameCount: number
}
