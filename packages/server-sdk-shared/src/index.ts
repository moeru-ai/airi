import { defineInvokeEventa, defineOutboundEventa } from '@moeru/eventa'

export interface HermesUserContext {
  id: string
  adultVerified: boolean
  allowSensitiveContent: boolean
  subscriptionTier: 'free' | 'premium' | 'vip'
  contentTier: 'standard' | 'sensitive' | 'explicit'
}

export interface HermesPersonaProfile {
  personality?: string
  scenario?: string
  speakingStyle?: string
  starterMessages?: string[]
  boundaries?: string[]
  memoryProfile?: 'light' | 'standard' | 'deep'
}

export interface HermesCharacterContext {
  id: string
  visibility: 'private' | 'public' | 'unlisted'
  relationshipMode: 'companion' | 'romance' | 'roleplay'
  nsfwEnabled: boolean
  nsfwLevel: 'none' | 'suggestive' | 'explicit'
  personaProfile: HermesPersonaProfile
}

export interface HermesConversationMessage {
  id?: string
  role: 'system' | 'user' | 'assistant' | 'tool' | 'error'
  content: string
}

export interface HermesReplyRequest {
  requestId: string
  route: 'normal' | 'nsfw'
  user: HermesUserContext
  character: HermesCharacterContext
  conversation: {
    id: string
    recentMessages: HermesConversationMessage[]
  }
  message: HermesConversationMessage
}

export interface HermesImagePromptRequest {
  requestId: string
  route: 'normal' | 'nsfw'
  user: HermesUserContext
  character: HermesCharacterContext
  prompt: string
  style?: string
  mood?: string
  framing?: string
  aspectRatio?: string
}

export interface HermesReplyResponse {
  requestId: string
  route: 'normal' | 'nsfw'
  reply: HermesConversationMessage
  runtime: {
    replyModel: string
    routerModel: string
    memoryModel: string
  }
  memoryUpdates: {
    summaryAppend?: string
    factsAdd: string[]
    factsRemove: string[]
  }
  judge: {
    score: number | null
    flags: string[]
  }
  sceneType?: 'general' | 'romance' | 'roleplay' | 'nsfw' | 'support'
}

export interface HermesImagePromptResponse {
  requestId: string
  route: 'normal' | 'nsfw'
  prompt: string
  negativePrompt: string
  tags: string[]
  sceneType?: 'general' | 'romance' | 'roleplay' | 'nsfw' | 'support'
}

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
export const generateHermesReply = defineInvokeEventa<HermesReplyResponse, HermesReplyRequest>('hermes:generate-reply')
export const generateHermesImagePrompt = defineInvokeEventa<HermesImagePromptResponse, HermesImagePromptRequest>('hermes:generate-image-prompt')
