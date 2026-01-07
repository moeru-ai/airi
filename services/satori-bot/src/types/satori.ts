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

// WebSocket Signal Structure
export interface SatoriSignal<T = any> {
  op: SatoriOpcode
  body?: T
}

// IDENTIFY signal body
export interface SatoriIdentifyBody {
  token?: string
  sn?: number
}

// READY signal body
export interface SatoriReadyBody {
  logins: SatoriLogin[]
  proxy_urls: string[]
}

// META signal body
export interface SatoriMetaBody {
  proxy_urls: string[]
}

// User resource
export interface SatoriUser {
  id: string
  name?: string
  nick?: string
  avatar?: string
  is_bot?: boolean
}

// Channel resource
export interface SatoriChannel {
  id: string
  type: number
  name?: string
  parent_id?: string
}

// Guild resource
export interface SatoriGuild {
  id: string
  name?: string
  avatar?: string
}

// Guild Member resource
export interface SatoriGuildMember {
  user?: SatoriUser
  nick?: string
  avatar?: string
  joined_at?: number
}

// Guild Role resource
export interface SatoriGuildRole {
  id: string
  name?: string
}

// Message resource
export interface SatoriMessage {
  id: string
  content: string
  channel?: SatoriChannel
  guild?: SatoriGuild
  member?: SatoriGuildMember
  user?: SatoriUser
  created_at?: number
  updated_at?: number
}

// Login resource
export interface SatoriLogin {
  user?: SatoriUser
  self_id?: string
  platform?: string
  status: number
  features?: string[]
  proxy_urls?: string[]
}

// Interaction Argv
export interface SatoriArgv {
  name: string
  arguments: any[]
  options: Record<string, any>
}

// Interaction Button
export interface SatoriButton {
  id: string
}

// Event structure
export interface SatoriEvent {
  id: number
  type: string
  platform: string
  self_id: string
  timestamp: number
  argv?: SatoriArgv
  button?: SatoriButton
  channel?: SatoriChannel
  guild?: SatoriGuild
  login?: SatoriLogin
  member?: SatoriGuildMember
  message?: SatoriMessage
  operator?: SatoriUser
  role?: SatoriGuildRole
  user?: SatoriUser
  _type?: string
  _data?: Record<string, any>
}

// API Request/Response types
export interface SatoriMessageCreateRequest {
  channel_id: string
  content: string
}

export interface SatoriMessageCreateResponse {
  id: string
  content: string
  channel?: SatoriChannel
  guild?: SatoriGuild
  member?: SatoriGuildMember
  user?: SatoriUser
  created_at?: number
  updated_at?: number
}

// Paginated list
export interface SatoriList<T> {
  data: T[]
  next?: string
}

// Bidirectional paginated list
export interface SatoriBidiList<T> {
  data: T[]
  prev?: string
  next?: string
}
