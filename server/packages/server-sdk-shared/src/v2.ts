import type { NewMessagesPayload, PullMessagesRequest, PullMessagesResponse, SendMessagesRequest, SendMessagesResponse } from './chat'

import { defineInvokeEventa, defineOutboundEventa } from '@moeru/eventa'

import * as v from 'valibot'

export type {
  MessageRole,
  NewMessagesPayload,
  PullMessagesRequest,
  PullMessagesResponse,
  SendMessagesRequest,
  SendMessagesResponse,
  WireMessage,
} from './chat'
export {
  parsePullMessagesRequest,
  parseSendMessagesRequest,
  PullMessagesRequestSchema,
  SendMessagesRequestSchema,
} from './chat'

export const AuthenticateRequestSchema = v.object({
  token: v.pipe(v.string(), v.minLength(1)),
})

export type AuthenticateRequest = v.InferOutput<typeof AuthenticateRequestSchema>

export interface AuthenticateResponse {
  userId: string
}

/** Parses a `chat:authenticate` payload at the WebSocket boundary. */
export function parseAuthenticateRequest(request: unknown): AuthenticateRequest {
  return v.parse(AuthenticateRequestSchema, request)
}

export const authenticate = defineInvokeEventa<AuthenticateResponse, AuthenticateRequest>('chat:authenticate')
export const sendMessages = defineInvokeEventa<SendMessagesResponse, SendMessagesRequest>('chat:send-messages')
export const pullMessages = defineInvokeEventa<PullMessagesResponse, PullMessagesRequest>('chat:pull-messages')
export const newMessages = defineOutboundEventa<NewMessagesPayload>('chat:new-messages')
