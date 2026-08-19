import type { NewMessagesPayload, PullMessagesRequest, PullMessagesResponse, SendMessagesRequest, SendMessagesResponse } from './chat'

import { defineInvokeEventa, defineOutboundEventa } from '@moeru/eventa'

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

export const sendMessages = defineInvokeEventa<SendMessagesResponse, SendMessagesRequest>('chat:send-messages')
export const pullMessages = defineInvokeEventa<PullMessagesResponse, PullMessagesRequest>('chat:pull-messages')
export const newMessages = defineOutboundEventa<NewMessagesPayload>('chat:new-messages')
