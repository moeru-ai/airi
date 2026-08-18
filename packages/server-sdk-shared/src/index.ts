import { defineInvokeEventa, defineOutboundEventa } from '@moeru/eventa'

export interface WireMessage {
  id: string
  chatId: string
  senderId: string | null
  role: 'system' | 'user' | 'assistant' | 'tool' | 'error'
  content: string
  seq: number
  createdAt: number
  updatedAt: number
}

export type MessageRole = WireMessage['role']

export interface SendMessagesRequest {
  chatId: string
  messages: { id: string, role: string, content: string }[]
}

export interface SendMessagesResponse {
  seq: number
}

export interface PullMessagesRequest {
  chatId: string
  afterSeq: number
  limit?: number
}

export interface PullMessagesResponse {
  messages: WireMessage[]
  seq: number
}

export interface NewMessagesPayload {
  chatId: string
  messages: WireMessage[]
  fromSeq: number
  toSeq: number
}

export const sendMessages = defineInvokeEventa<SendMessagesResponse, SendMessagesRequest>('chat:send-messages')
export const pullMessages = defineInvokeEventa<PullMessagesResponse, PullMessagesRequest>('chat:pull-messages')
export const newMessages = defineOutboundEventa<NewMessagesPayload>('chat:new-messages')
