import type { MetadataEventSource } from '@proj-airi/server-sdk'

interface EventSourcePayload {
  source?: string
  metadata?: { source?: MetadataEventSource }
  eventMetadata?: { source?: MetadataEventSource }
}

function formatMetadataSource(source?: MetadataEventSource) {
  if (!source?.plugin)
    return undefined

  return source.instanceId ? `${source.plugin}:${source.instanceId}` : source.plugin
}

export function getEventSourceKey(event: EventSourcePayload, fallback = 'unknown') {
  return (
    formatMetadataSource(event.eventMetadata?.source)
    ?? formatMetadataSource(event.metadata?.source)
    ?? event.source
    ?? fallback
  )
}
