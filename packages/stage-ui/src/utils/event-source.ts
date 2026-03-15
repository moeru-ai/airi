import type { MetadataEventSource } from '@proj-airi/server-sdk'

interface EventSourcePayload {
  source?: string
  metadata?: { source?: MetadataEventSource }
  eventMetadata?: { source?: MetadataEventSource }
}

function formatMetadataSource(source?: MetadataEventSource) {
  if (!source?.plugin)
    return undefined

  const pluginId = source.plugin.id
  const instanceId = source.id

  return instanceId ? `${pluginId}:${instanceId}` : pluginId
}

export function getEventSourceKey(event: EventSourcePayload, fallback = 'unknown') {
  return (
    formatMetadataSource(event.eventMetadata?.source)
    ?? formatMetadataSource(event.metadata?.source)
    ?? event.source
    ?? fallback
  )
}
