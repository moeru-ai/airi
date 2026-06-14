import type { MetadataEventSource } from '@proj-airi/server-sdk'

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

/**
 * Returns a human-readable source label for extension identities.
 *
 * Use when:
 * - UI stores need to display or compare websocket event sources
 * - Protocol metadata may come from extension, module, or kit peers
 *
 * Expects:
 * - `source` is a protocol metadata identity from server-shared/server-sdk
 *
 * Returns:
 * - A stable label, preferring extension-scoped module ids
 */
export function getMetadataSourceLabel(source?: MetadataEventSource) {
  if (!source)
    return undefined

  if (isExtensionModuleIdentity(source)) {
    return `${source.extension.id}:${source.id}`
  }

  return source.id
}

function formatMetadataSource(source?: MetadataEventSource) {
  if (!source)
    return undefined

  return getMetadataSourceLabel(source)
}

export function getEventSourceKey(event: EventSourcePayload, fallback = 'unknown') {
  return (
    formatMetadataSource(event.metadata?.source)
    ?? event.source
    ?? fallback
  )
}
