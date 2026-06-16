import type { WebSocketEventInputs } from '@proj-airi/server-shared/types'

/**
 * Channel-side user message accepted by the core agent ingress seam.
 *
 * @param TMetadata - Structured metadata preserved from the originating channel.
 */
export interface AgentChannelMessage<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  /** Channel-scoped message identifier. */
  id: string
  /** Logical channel that produced this message, for example `stage-ui` or `satori`. */
  channelId: string
  /** Core chat session that should receive this message. */
  sessionId: string
  /** User-authored ingress is the only supported channel role in this first seam. */
  role: 'user'
  /** Text payload forwarded into the existing chat orchestrator turn. */
  content: string
  /** Original channel timestamp. This does not replace persisted session message time. */
  createdAt: number
  /** Image attachments provided by the channel adapter. */
  attachments?: Array<{ type: 'image', data: string, mimeType: string }>
  /** Original transport input metadata used by bridge/devtools observers. */
  input?: WebSocketEventInputs
  /** Channel-specific metadata preserved for hooks, observability, and future runtimes. */
  metadata?: TMetadata
}

/**
 * Channel facts attached to a core chat turn context.
 *
 * @param TMetadata - Structured metadata preserved from the originating channel.
 */
export interface AgentChannelIngressContext<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  /** Logical channel that produced the user turn. */
  channelId: string
  /** Channel-scoped source message identifier. */
  channelMessageId: string
  /** Core chat session that owns the turn. */
  sessionId: string
  /** Original channel timestamp. This is informational for the turn context. */
  createdAt: number
  /** Channel-specific metadata preserved without interpretation by the chat runtime. */
  metadata?: TMetadata
}

/**
 * Assistant-authored message that core-agent can hand to a channel adapter for delivery.
 *
 * @param TMetadata - Structured metadata preserved for the destination channel.
 */
export interface AgentOutboundMessage<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  /** Core-generated outbound message identifier. */
  id: string
  /** Logical channel that should deliver this message, for example `stage-ui` or `satori`. */
  channelId: string
  /** Core chat session that owns this reply. */
  sessionId: string
  /** Assistant-authored outbound is the only supported channel reply role in this first seam. */
  role: 'assistant'
  /** Text payload to deliver through the destination channel adapter. */
  content: string
  /** Core outbound creation timestamp. */
  createdAt: number
  /** Optional source channel message identifier this outbound message replies to. */
  inReplyTo?: string
  /** Channel-specific metadata preserved for delivery and observability. */
  metadata?: TMetadata
}

/**
 * Destination facts used by channel adapters when delivering an outbound reply.
 *
 * @param TMetadata - Structured channel-specific reply target metadata.
 */
export interface AgentChannelReplyTarget<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  /** Logical channel that should receive the reply. */
  channelId: string
  /** Core chat session that owns the reply. */
  sessionId: string
  /** Optional channel-scoped message identifier to reply to. */
  channelMessageId?: string
  /** Channel-specific target metadata such as platform, guild, or user identifiers. */
  metadata?: TMetadata
}
