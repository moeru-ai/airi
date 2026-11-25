import type { ChatHistoryItem as CoreChatHistoryItem } from '@proj-airi/core-agent'
import type { WireAttachment } from '@proj-airi/server-sdk-shared/v2'

export type {
  ChatAssistantMessage,
  ChatMessage,
  ChatSlices,
  ChatSlicesCard,
  ChatSlicesSticker,
  ChatSlicesText,
  ChatSlicesToolCall,
  ChatSlicesToolCallResult,
  ChatStreamEvent,
  ChatStreamEventContext,
  ChatToolReference,
  ContextMessage,
  ErrorMessage,
  StreamingAssistantMessage,
} from '@proj-airi/core-agent'

export type CloudChatImage = WireAttachment & { assetRef?: string }

export type ChatHistoryItem = CoreChatHistoryItem & { cloudImages?: CloudChatImage[] }
/** Routing captured by the normal request closure. The Desktop Host separately issues and validates its request identity. */
export interface ToolAttributionContext {
  sessionId: string
  turnId?: string
}
