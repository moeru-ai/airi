import type Redis from 'ioredis'

import type { EngagementMetrics } from '../../otel'
import type { ChatBroadcastCoordinator } from './broadcast'
import type { ChatConnectionRegistry } from './connection-registry'

import { createChatBroadcastCoordinator } from './broadcast'
import { createChatConnectionRegistry } from './connection-registry'

export interface ChatWsRuntime {
  registry: ChatConnectionRegistry
  broadcast: ChatBroadcastCoordinator
}

/** Creates the shared fanout runtime used by both chat websocket versions. */
export function createChatWsRuntime(
  redis: Redis,
  instanceId: string,
  metrics?: EngagementMetrics | null,
): ChatWsRuntime {
  const registry = createChatConnectionRegistry()
  const broadcast = createChatBroadcastCoordinator({ redis, registry, instanceId })

  metrics?.wsConnectionsActive.addCallback((result) => {
    result.observe(registry.activeCount())
  })

  return { registry, broadcast }
}
