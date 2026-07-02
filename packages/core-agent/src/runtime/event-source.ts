import type { MetadataEventSource } from '@proj-airi/server-shared/types'

interface EventSourcePayload {
  source?: string
  metadata?: { source?: MetadataEventSource }
}

type ExtensionModuleEventSource = MetadataEventSource & {
  extension: { id: string }
}

/**
 * Checks whether a protocol source belongs to a module owned by an extension.
 */
function isExtensionModuleIdentity(source: MetadataEventSource): source is ExtensionModuleEventSource {
  return (
    'extension' in source
    && typeof source.extension === 'object'
    && source.extension !== null
    && 'id' in source.extension
    && typeof source.extension.id === 'string'
  )
}

function formatMetadataSource(source?: MetadataEventSource) {
  if (!source)
    return undefined

  if (isExtensionModuleIdentity(source)) {
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
