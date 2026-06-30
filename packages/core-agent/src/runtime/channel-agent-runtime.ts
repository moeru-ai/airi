import type { AgentChannelMessage } from '../types/channel'
import type { AgentRuntimeConfig } from './agent-runtime-config'
import type { ChatOrchestratorRuntime, ChatOrchestratorRuntimeDeps, ChatOrchestratorSendOptions } from './chat-orchestrator-runtime'

import { createChatOrchestratorRuntime } from './chat-orchestrator-runtime'

/**
 * Execution options supplied by a caller after channel message normalization.
 */
export type ChannelAgentExecutionOptions = Omit<ChatOrchestratorSendOptions, 'attachments' | 'input' | 'channel'>

/**
 * Dependencies for the channel-facing runtime facade.
 */
export interface ChannelAgentRuntimeDeps extends ChatOrchestratorRuntimeDeps {
  /** Optional core-owned runtime config for resolving execution options from channel messages. */
  runtimeConfig?: AgentRuntimeConfig
}

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
  ingestMessage: (message: AgentChannelMessage, options?: Partial<ChannelAgentExecutionOptions>) => Promise<void>
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
 * - Provider/model execution details are passed explicitly or resolved by one shared runtime config profile.
 *
 * Returns:
 * - A runtime with channel ingress plus the existing queue, hook, and state surfaces.
 */
export function createChannelAgentRuntime(deps: ChannelAgentRuntimeDeps): ChannelAgentRuntime {
  const chatRuntime = createChatOrchestratorRuntime(deps)

  async function resolveExecutionOptions(message: AgentChannelMessage, options?: Partial<ChannelAgentExecutionOptions>) {
    if (options?.model && options.chatProvider) {
      return options as ChannelAgentExecutionOptions
    }

    if (deps.runtimeConfig) {
      return deps.runtimeConfig.resolveExecutionOptions(message, options)
    }

    throw new Error(`Cannot ingest channel message "${message.id}" for channel "${message.channelId}" session "${message.sessionId}": pass model/chatProvider options or configure runtimeConfig`)
  }

  function ingestMessage(message: AgentChannelMessage, options?: Partial<ChannelAgentExecutionOptions>) {
    return chatRuntime.ingestWithQueuedPreparation(message.content, {
      resolveOptions: async () => {
        const executionOptions = await resolveExecutionOptions(message, options)

        return {
          ...executionOptions,
          attachments: message.attachments,
          input: message.input,
          channel: {
            channelId: message.channelId,
            channelMessageId: message.id,
            sessionId: message.sessionId,
            createdAt: message.createdAt,
            metadata: message.metadata,
          },
        }
      },
      snapshot: {
        attachments: message.attachments,
        input: message.input,
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
