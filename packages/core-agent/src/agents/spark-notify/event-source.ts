import type { MetadataEventSource } from '@proj-airi/server-sdk'

interface EventSourcePayload {
  source?: string
  metadata?: { source?: MetadataEventSource }
}

function formatMetadataSource(source?: MetadataEventSource) {
  if (!source)
    return undefined

  if ('extension' in source) {
    return `${source.extension.id}:${source.id}`
  }

  return source.id
}

/**
 * Resolves a stable source key for websocket-originated events.
 *
 * Before:
 * - `{ source: "minecraft" }`
 * - `{ metadata: { source: { extension: { id: "p" }, id: "i" } } }`
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
