import type {
  AgentChannelReplyTarget,
  AgentOutboundMessage,
} from '../types/channel'

/**
 * Runtime context that explains why a channel adapter lookup is required.
 */
export interface AgentChannelRegistryLookupContext {
  /** Core chat session involved in the outbound lookup. */
  sessionId?: string
  /** Source or outbound message identifier involved in the lookup. */
  messageId?: string
}

/**
 * Channel-owned delivery adapter registered with core-agent.
 *
 * @param TTargetMetadata - Metadata shape required by the destination channel target.
 * @param TMessageMetadata - Metadata shape attached to outbound messages for the destination channel.
 */
export interface AgentChannelAdapter<
  TTargetMetadata extends Record<string, unknown> = Record<string, unknown>,
  TMessageMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Stable logical channel id, for example `stage-ui` or `satori`. */
  channelId: string
  /** Delivers a core-agent outbound assistant message to this channel. */
  sendMessage: (
    target: AgentChannelReplyTarget<TTargetMetadata>,
    message: AgentOutboundMessage<TMessageMetadata>,
  ) => Promise<void>
}

/**
 * In-memory registry for channel delivery adapters.
 */
export interface AgentChannelRegistry {
  /** Registers a channel adapter by its `channelId`. */
  registerChannel: (adapter: AgentChannelAdapter) => void
  /** Returns a registered adapter, or `undefined` when the channel has not been registered. */
  getChannel: (channelId: string) => AgentChannelAdapter | undefined
  /** Returns a registered adapter or throws an error with lookup context. */
  requireChannel: (channelId: string, context?: AgentChannelRegistryLookupContext) => AgentChannelAdapter
}

function formatChannelLookupContext(channelId: string, context?: AgentChannelRegistryLookupContext) {
  const details = [`channel "${channelId}"`]

  if (context?.sessionId) {
    details.push(`session "${context.sessionId}"`)
  }

  if (context?.messageId) {
    details.push(`message "${context.messageId}"`)
  }

  return details.join(' ')
}

/**
 * Creates an in-memory registry for core-agent channel delivery adapters.
 *
 * Use when:
 * - Host apps need to register channel-specific outbound delivery adapters.
 * - Core-agent needs to look up adapters by inbound or explicit reply channel.
 *
 * Expects:
 * - Each `channelId` is registered at most once.
 * - Missing channels should fail explicitly when required for delivery.
 *
 * Returns:
 * - A registry that stores adapters by channel id without owning delivery retries or receipts.
 */
export function createAgentChannelRegistry(): AgentChannelRegistry {
  const channels = new Map<string, AgentChannelAdapter>()

  function registerChannel(adapter: AgentChannelAdapter) {
    if (channels.has(adapter.channelId)) {
      throw new Error(`Cannot register channel adapter for channel "${adapter.channelId}": channel is already registered`)
    }

    channels.set(adapter.channelId, adapter)
  }

  function getChannel(channelId: string) {
    return channels.get(channelId)
  }

  function requireChannel(channelId: string, context?: AgentChannelRegistryLookupContext) {
    const adapter = getChannel(channelId)

    if (!adapter) {
      throw new Error(`Cannot resolve channel adapter for ${formatChannelLookupContext(channelId, context)}: channel is not registered`)
    }

    return adapter
  }

  return {
    registerChannel,
    getChannel,
    requireChannel,
  }
}
