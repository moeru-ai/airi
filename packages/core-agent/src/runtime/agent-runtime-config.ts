import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { AgentChannelMessage } from '../types/channel'
import type { ChannelAgentExecutionOptions } from './channel-agent-runtime'
import type { ChatOrchestratorSendOptions } from './chat-orchestrator-runtime'

/**
 * Default execution identity shared by all channels in the first runtime config seam.
 */
export interface AgentExecutionProfile {
  /** Host-owned provider identifier used to resolve a concrete chat provider. */
  providerId: string
  /** Provider model identifier used for chat turns. */
  model: string
}

/**
 * Host-provided provider lookup for runtime execution.
 */
export type AgentProviderResolver = (providerId: string) => Promise<{
  /** Concrete chat provider instance for the requested provider id. */
  chatProvider: ChatProvider
  /** Optional provider request options, currently used for headers. */
  providerConfig?: Record<string, unknown>
}>

/**
 * In-memory execution config used by channel runtimes before chat orchestration.
 */
export interface AgentRuntimeConfig {
  /** Replaces the default profile shared by every channel. */
  setDefaultExecutionProfile: (profile: AgentExecutionProfile) => void
  /** Replaces the host-owned resolver that turns provider ids into provider instances. */
  setProviderResolver: (resolver: AgentProviderResolver) => void
  /**
   * Resolves concrete chat send options for a normalized channel message.
   *
   * `message` is used for error context and future expansion only; PR1 does
   * not route provider/model choices by channel or session.
   */
  resolveExecutionOptions: (
    message: AgentChannelMessage,
    overrides?: Partial<ChannelAgentExecutionOptions>,
  ) => Promise<ChatOrchestratorSendOptions>
}

/**
 * Initial values for {@link createAgentRuntimeConfig}.
 */
export interface CreateAgentRuntimeConfigOptions {
  /** Initial default profile shared by every channel. */
  defaultExecutionProfile?: AgentExecutionProfile
  /** Initial provider resolver owned by the host app. */
  providerResolver?: AgentProviderResolver
}

function formatChannelMessageContext(message: AgentChannelMessage) {
  return `channel "${message.channelId}" session "${message.sessionId}" message "${message.id}"`
}

/**
 * Normalizes execution overrides by treating undefined values as omitted fields.
 *
 * Before:
 * - `{ model: undefined, providerId: "openai" }`
 *
 * After:
 * - `{ providerId: "openai" }`
 */
function normalizeExecutionOverrides(overrides: Partial<ChannelAgentExecutionOptions>): Partial<ChannelAgentExecutionOptions> {
  const normalized: Partial<ChannelAgentExecutionOptions> = {}

  if (overrides.providerId !== undefined)
    normalized.providerId = overrides.providerId
  if (overrides.model !== undefined)
    normalized.model = overrides.model
  if (overrides.chatProvider !== undefined)
    normalized.chatProvider = overrides.chatProvider
  if (overrides.providerConfig !== undefined)
    normalized.providerConfig = overrides.providerConfig
  if (overrides.tools !== undefined)
    normalized.tools = overrides.tools

  return normalized
}

/**
 * Creates an in-memory runtime config for resolving core-agent execution options.
 *
 * Use when:
 * - A host app owns provider/model settings and provider instance creation.
 * - Channel adapters should submit messages without owning provider/model selection.
 *
 * Expects:
 * - One default execution profile is shared across all channels in PR1.
 * - The provider resolver is injected by the host and owns credentials/cache access.
 *
 * Returns:
 * - A mutable runtime config that resolves chat send options for channel messages.
 */
export function createAgentRuntimeConfig(options: CreateAgentRuntimeConfigOptions = {}): AgentRuntimeConfig {
  let defaultExecutionProfile = options.defaultExecutionProfile
  let providerResolver = options.providerResolver

  function setDefaultExecutionProfile(profile: AgentExecutionProfile) {
    defaultExecutionProfile = { ...profile }
  }

  function setProviderResolver(resolver: AgentProviderResolver) {
    providerResolver = resolver
  }

  async function resolveExecutionOptions(
    message: AgentChannelMessage,
    overrides: Partial<ChannelAgentExecutionOptions> = {},
  ): Promise<ChatOrchestratorSendOptions> {
    const executionOverrides = normalizeExecutionOverrides(overrides)
    const providerId = executionOverrides.providerId ?? defaultExecutionProfile?.providerId
    const model = executionOverrides.model ?? defaultExecutionProfile?.model

    if (!model) {
      throw new Error(`Cannot resolve execution model for ${formatChannelMessageContext(message)}: no default execution profile or model override was provided`)
    }

    if (executionOverrides.chatProvider) {
      return {
        ...executionOverrides,
        providerId,
        model,
        chatProvider: executionOverrides.chatProvider,
      }
    }

    if (!providerId) {
      throw new Error(`Cannot resolve execution provider for ${formatChannelMessageContext(message)}: no default execution profile or providerId override was provided`)
    }

    if (!providerResolver) {
      throw new Error(`Cannot resolve chat provider for ${formatChannelMessageContext(message)}: no provider resolver was configured`)
    }

    const resolved = await providerResolver(providerId)

    return {
      providerId,
      model,
      chatProvider: resolved.chatProvider,
      providerConfig: resolved.providerConfig,
      ...executionOverrides,
    }
  }

  return {
    setDefaultExecutionProfile,
    setProviderResolver,
    resolveExecutionOptions,
  }
}
