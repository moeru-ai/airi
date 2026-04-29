import type { MetadataEventSource } from '@proj-airi/server-sdk'

interface EventSourcePayload {
  source?: string
  metadata?: { source?: MetadataEventSource }
}

function formatMetadataSource(source?: MetadataEventSource) {
  if (!source?.plugin)
    return undefined

  const pluginId = source.plugin.id
  const instanceId = source.id

  return instanceId ? `${pluginId}:${instanceId}` : pluginId
}

/**
 * Resolves a stable source key for websocket-originated events.
 *
 * Before:
 * - `{ source: "minecraft" }`
 * - `{ metadata: { source: { plugin: { id: "p" }, id: "i" } } }`
 *
 * After:
 * - `"minecraft"`
 * - `"p:i"`
 */
export function getEventSourceKey(event: EventSourcePayload, fallback = 'unknown') {
  return (
    formatMetadataSource(event.metadata?.source)
    ?? event.source
    ?? fallback
  )
}
