import type { ToolMessage } from '@xsai/shared-chat'

import type { ChatStreamEventContext, StreamingAssistantMessage } from '../types/chat'

export interface ChatHookRegistry {
  onBeforeMessageComposed: (cb: (message: string, context: Omit<ChatStreamEventContext, 'composedMessage'>) => Promise<void>) => () => void
  onAfterMessageComposed: (cb: (message: string, context: ChatStreamEventContext) => Promise<void>) => () => void
  onBeforeSend: (cb: (message: string, context: ChatStreamEventContext) => Promise<void>) => () => void
  onAfterSend: (cb: (message: string, context: ChatStreamEventContext) => Promise<void>) => () => void
  onTokenLiteral: (cb: (literal: string, context: ChatStreamEventContext) => Promise<void>) => () => void
  onTokenSpecial: (cb: (special: string, context: ChatStreamEventContext) => Promise<void>) => () => void
  onStreamEnd: (cb: (context: ChatStreamEventContext) => Promise<void>) => () => void
  onAssistantResponseEnd: (cb: (message: string, context: ChatStreamEventContext) => Promise<void>) => () => void
  onAssistantMessage: (cb: (message: StreamingAssistantMessage, messageText: string, context: ChatStreamEventContext) => Promise<void>) => () => void
  onChatTurnComplete: (cb: (chat: { output: StreamingAssistantMessage, outputText: string, toolCalls: ToolMessage[] }, context: ChatStreamEventContext) => Promise<void>) => () => void
  emitBeforeMessageComposedHooks: (message: string, context: Omit<ChatStreamEventContext, 'composedMessage'>) => Promise<void>
  emitAfterMessageComposedHooks: (message: string, context: ChatStreamEventContext) => Promise<void>
  emitBeforeSendHooks: (message: string, context: ChatStreamEventContext) => Promise<void>
  emitAfterSendHooks: (message: string, context: ChatStreamEventContext) => Promise<void>
  emitTokenLiteralHooks: (literal: string, context: ChatStreamEventContext) => Promise<void>
  emitTokenSpecialHooks: (special: string, context: ChatStreamEventContext) => Promise<void>
  emitStreamEndHooks: (context: ChatStreamEventContext) => Promise<void>
  emitAssistantResponseEndHooks: (message: string, context: ChatStreamEventContext) => Promise<void>
  emitAssistantMessageHooks: (message: StreamingAssistantMessage, messageText: string, context: ChatStreamEventContext) => Promise<void>
  emitChatTurnCompleteHooks: (chat: { output: StreamingAssistantMessage, outputText: string, toolCalls: ToolMessage[] }, context: ChatStreamEventContext) => Promise<void>
  clearHooks: () => void
}
export interface HookUnsubscribe {
  (): void
}

export interface AgentHookRegistry<TContext, TAssistantMessage, TToolCall> {
  onBeforeMessageComposed: (cb: (message: string, context: Omit<TContext, 'composedMessage'>) => Promise<void>) => HookUnsubscribe
  onAfterMessageComposed: (cb: (message: string, context: TContext) => Promise<void>) => HookUnsubscribe
  onBeforeSend: (cb: (message: string, context: TContext) => Promise<void>) => HookUnsubscribe
  onAfterSend: (cb: (message: string, context: TContext) => Promise<void>) => HookUnsubscribe
  onTokenLiteral: (cb: (literal: string, context: TContext) => Promise<void>) => HookUnsubscribe
  onTokenSpecial: (cb: (special: string, context: TContext) => Promise<void>) => HookUnsubscribe
  onStreamEnd: (cb: (context: TContext) => Promise<void>) => HookUnsubscribe
  onAssistantResponseEnd: (cb: (message: string, context: TContext) => Promise<void>) => HookUnsubscribe
  onAssistantMessage: (cb: (message: TAssistantMessage, messageText: string, context: TContext) => Promise<void>) => HookUnsubscribe
  onChatTurnComplete: (cb: (chat: { output: TAssistantMessage, outputText: string, toolCalls: TToolCall[] }, context: TContext) => Promise<void>) => HookUnsubscribe

  emitBeforeMessageComposedHooks: (message: string, context: Omit<TContext, 'composedMessage'>) => Promise<void>
  emitAfterMessageComposedHooks: (message: string, context: TContext) => Promise<void>
  emitBeforeSendHooks: (message: string, context: TContext) => Promise<void>
  emitAfterSendHooks: (message: string, context: TContext) => Promise<void>
  emitTokenLiteralHooks: (literal: string, context: TContext) => Promise<void>
  emitTokenSpecialHooks: (special: string, context: TContext) => Promise<void>
  emitStreamEndHooks: (context: TContext) => Promise<void>
  emitAssistantResponseEndHooks: (message: string, context: TContext) => Promise<void>
  emitAssistantMessageHooks: (message: TAssistantMessage, messageText: string, context: TContext) => Promise<void>
  emitChatTurnCompleteHooks: (chat: { output: TAssistantMessage, outputText: string, toolCalls: TToolCall[] }, context: TContext) => Promise<void>
  clearHooks: () => void
}
