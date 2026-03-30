import type {
  HermesCharacterContext,
  HermesConversationMessage,
  HermesImagePromptRequest,
  HermesReplyRequest,
  HermesUserContext,
} from '@proj-airi/server-sdk-shared'
import type { ChatHistoryItem } from '../types/chat'
import type { Character } from '../types/character'

import { nanoid } from 'nanoid'

function stringifyContent(content: ChatHistoryItem['content']) {
  if (typeof content === 'string')
    return content

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part !== 'object' || part == null)
          return ''
        if ('text' in part && typeof part.text === 'string')
          return part.text
        if ('type' in part && part.type === 'image_url')
          return '[image]'
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

function mapRole(role: ChatHistoryItem['role']): HermesConversationMessage['role'] {
  if (role === 'system' || role === 'user' || role === 'assistant' || role === 'tool' || role === 'error')
    return role
  return 'user'
}

export function toHermesConversationMessage(message: ChatHistoryItem): HermesConversationMessage {
  return {
    id: message.id,
    role: mapRole(message.role),
    content: stringifyContent(message.content),
  }
}

export function toHermesCharacterContext(character: Character): HermesCharacterContext {
  return {
    id: character.id,
    visibility: character.visibility,
    relationshipMode: character.relationshipMode,
    nsfwEnabled: character.nsfwEnabled,
    nsfwLevel: character.nsfwLevel,
    personaProfile: {
      personality: character.personaProfile?.personality,
      scenario: character.personaProfile?.scenario,
      speakingStyle: character.personaProfile?.speakingStyle,
      starterMessages: character.personaProfile?.starterMessages,
      boundaries: character.personaProfile?.boundaries,
      memoryProfile: character.personaProfile?.memoryProfile,
    },
  }
}

export interface BuildHermesReplyRequestOptions {
  route?: HermesReplyRequest['route']
  requestId?: string
  user: Partial<HermesUserContext> & Pick<HermesUserContext, 'id'>
  character: Character
  conversationId: string
  recentMessages: ChatHistoryItem[]
  message: ChatHistoryItem
}

export interface BuildHermesImagePromptRequestOptions {
  route?: HermesImagePromptRequest['route']
  requestId?: string
  user: Partial<HermesUserContext> & Pick<HermesUserContext, 'id'>
  character: Character
  prompt: string
  style?: string
  mood?: string
  framing?: string
  aspectRatio?: string
}

export function buildHermesReplyRequest(options: BuildHermesReplyRequestOptions): HermesReplyRequest {
  return {
    requestId: options.requestId ?? nanoid(),
    route: options.route ?? (options.character.nsfwEnabled && options.character.nsfwLevel !== 'none' ? 'nsfw' : 'normal'),
    user: {
      id: options.user.id,
      adultVerified: options.user.adultVerified ?? false,
      allowSensitiveContent: options.user.allowSensitiveContent ?? false,
      subscriptionTier: options.user.subscriptionTier ?? 'free',
      contentTier: options.user.contentTier ?? 'standard',
    },
    character: toHermesCharacterContext(options.character),
    conversation: {
      id: options.conversationId,
      recentMessages: options.recentMessages.map(toHermesConversationMessage),
    },
    message: toHermesConversationMessage(options.message),
  }
}

export function buildHermesImagePromptRequest(options: BuildHermesImagePromptRequestOptions): HermesImagePromptRequest {
  return {
    requestId: options.requestId ?? nanoid(),
    route: options.route ?? (options.character.nsfwEnabled && options.character.nsfwLevel !== 'none' ? 'nsfw' : 'normal'),
    user: {
      id: options.user.id,
      adultVerified: options.user.adultVerified ?? false,
      allowSensitiveContent: options.user.allowSensitiveContent ?? false,
      subscriptionTier: options.user.subscriptionTier ?? 'free',
      contentTier: options.user.contentTier ?? 'standard',
    },
    character: toHermesCharacterContext(options.character),
    prompt: options.prompt,
    style: options.style,
    mood: options.mood,
    framing: options.framing,
    aspectRatio: options.aspectRatio,
  }
}
