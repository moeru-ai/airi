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
  token: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)),
})

export type AuthenticateRequest = v.InferOutput<typeof AuthenticateRequestSchema>

export const AuthenticateResponseSchema = v.object({
  userId: v.pipe(v.string(), v.minLength(1)),
})

export type AuthenticateResponse = v.InferOutput<typeof AuthenticateResponseSchema>

/** Parses a `chat:authenticate` payload at the WebSocket boundary. */
export function parseAuthenticateRequest(request: unknown): AuthenticateRequest {
  return v.parse(AuthenticateRequestSchema, request)
}

/** Parses a `chat:authenticate` response at the WebSocket boundary. */
export function parseAuthenticateResponse(response: unknown): AuthenticateResponse {
  return v.parse(AuthenticateResponseSchema, response)
}

export const authenticate = defineInvokeEventa<AuthenticateResponse, AuthenticateRequest>('chat:authenticate')
export const sendMessages = defineInvokeEventa<SendMessagesResponse, SendMessagesRequest>('chat:send-messages')
export const pullMessages = defineInvokeEventa<PullMessagesResponse, PullMessagesRequest>('chat:pull-messages')
export const newMessages = defineOutboundEventa<NewMessagesPayload>('chat:new-messages')
