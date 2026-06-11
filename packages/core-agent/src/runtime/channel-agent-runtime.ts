import type { AgentChannelMessage } from '../types/channel'
import type { ChatOrchestratorRuntime, ChatOrchestratorRuntimeDeps, ChatOrchestratorSendOptions } from './chat-orchestrator-runtime'

import { createChatOrchestratorRuntime } from './chat-orchestrator-runtime'

/**
 * Execution options supplied by a caller after channel message normalization.
 */
export type ChannelAgentExecutionOptions = Omit<ChatOrchestratorSendOptions, 'attachments' | 'input' | 'channel'>

/**
 * Channel-facing runtime that accepts normalized channel messages before delegating to chat orchestration.
 */
export interface ChannelAgentRuntime extends Pick<
  ChatOrchestratorRuntime,
  | 'cancelPendingSends'
  | 'getPendingQueuedSendSnapshot'
  | 'getPendingQueuedSendCount'
  | 'getSending'
  | 'setSending'
  | 'hooks'
> {
  /** Enqueues a normalized channel user message for the existing chat orchestrator runtime. */
  ingestMessage: (message: AgentChannelMessage, options: ChannelAgentExecutionOptions) => Promise<void>
}

/**
 * Creates a channel ingress runtime in front of the existing chat orchestrator.
 *
 * Use when:
 * - A platform has normalized inbound events into `AgentChannelMessage`.
 * - Channel facts must be preserved in turn context without changing session or streaming ownership.
 *
 * Expects:
 * - `message.sessionId` points at the core chat session that should receive the turn.
 * - Provider/model execution details are passed separately as execution options.
 *
 * Returns:
 * - A runtime with channel ingress plus the existing queue, hook, and state surfaces.
 */
export function createChannelAgentRuntime(deps: ChatOrchestratorRuntimeDeps): ChannelAgentRuntime {
  const chatRuntime = createChatOrchestratorRuntime(deps)

  function ingestMessage(message: AgentChannelMessage, options: ChannelAgentExecutionOptions) {
    return chatRuntime.ingest(message.content, {
      ...options,
      attachments: message.attachments,
      input: message.input,
      channel: {
        channelId: message.channelId,
        channelMessageId: message.id,
        sessionId: message.sessionId,
        createdAt: message.createdAt,
        metadata: message.metadata,
      },
    }, message.sessionId)
  }

  return {
    ingestMessage,
    cancelPendingSends: chatRuntime.cancelPendingSends,
    getPendingQueuedSendSnapshot: chatRuntime.getPendingQueuedSendSnapshot,
    getPendingQueuedSendCount: chatRuntime.getPendingQueuedSendCount,
    getSending: chatRuntime.getSending,
    setSending: chatRuntime.setSending,
    hooks: chatRuntime.hooks,
  }
}
