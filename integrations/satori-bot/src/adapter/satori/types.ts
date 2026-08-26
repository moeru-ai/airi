/**
 * Satori Protocol Type Definitions
 * Based on Satori Protocol v1 specification
 */

// Opcode for WebSocket signaling
export enum SatoriOpcode {
  EVENT = 0, // 接收事件
  PING = 1, // 发送心跳
  PONG = 2, // 接收心跳回复
  IDENTIFY = 3, // 发送鉴权
  READY = 4, // 接收鉴权成功
  META = 5, // 接收元信息更新
}

// Interaction Argv
export interface SatoriArgv {
  arguments: unknown[]
  name: string
  options: Record<string, unknown>
}

// Bidirectional paginated list
export interface SatoriBidiList<T> {
  data: T[]
  next?: string
  prev?: string
}

// Interaction Button
export interface SatoriButton {
  id: string
}

// Channel resource
export interface SatoriChannel {
  id: string
  name?: string
  parent_id?: string
  type: number
}

// Event structure
export interface SatoriEvent {
  _data?: Record<string, unknown>
  _type?: string
  argv?: SatoriArgv
  button?: SatoriButton
  channel?: SatoriChannel
  guild?: SatoriGuild
  id: number
  login?: SatoriLogin
  member?: SatoriGuildMember
  message?: SatoriMessage
  operator?: SatoriUser
  platform: string
  role?: SatoriGuildRole
  self_id: string
  timestamp: number
  type: string
  user?: SatoriUser
}

// Guild resource
export interface SatoriGuild {
  avatar?: string
  id: string
  name?: string
}

// Guild Member resource
export interface SatoriGuildMember {
  avatar?: string
  joined_at?: number
  nick?: string
  user?: SatoriUser
}

// Guild Role resource
export interface SatoriGuildRole {
  id: string
  name?: string
}

// IDENTIFY signal body
export interface SatoriIdentifyBody {
  sn?: number
  token?: string
}

// Paginated list
export interface SatoriList<T> {
  data: T[]
  next?: string
}

// Login resource
export interface SatoriLogin {
  features?: string[]
  platform?: string
  proxy_urls?: string[]
  self_id?: string
  status: number
  user?: SatoriUser
}

// Message resource
export interface SatoriMessage {
  channel?: SatoriChannel
  content: string
  created_at?: number
  guild?: SatoriGuild
  id: string
  member?: SatoriGuildMember
  platform?: string
  updated_at?: number
  user?: SatoriUser
}

// API Request/Response types
export interface SatoriMessageCreateRequest {
  channel_id: string
  content: string
}

export interface SatoriMessageCreateResponse {
  channel?: SatoriChannel
  content?: string
  created_at?: number
  guild?: SatoriGuild
  id: string
  member?: SatoriGuildMember
  updated_at?: number
  user?: SatoriUser
}

// META signal body
export interface SatoriMetaBody {
  proxy_urls?: string[]
}

// READY signal body
export interface SatoriReadyBody {
  logins: SatoriLogin[]
  proxy_urls?: string[]
}

// WebSocket Signal Structure
export interface SatoriSignal<T = unknown> {
  body?: T
  op: SatoriOpcode
}

// User resource
export interface SatoriUser {
  avatar?: string
  id: string
  is_bot?: boolean
  name?: string
  nick?: string
}
