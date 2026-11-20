export type {
  ChatAssistantMessage,
  ChatHistoryItem,
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
/** Routing captured by the normal request closure. The Desktop Host separately issues and validates its request identity. */
export interface ToolAttributionContext {
  sessionId: string
  turnId?: string
}
