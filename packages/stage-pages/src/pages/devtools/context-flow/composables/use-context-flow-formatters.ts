import type { WebSocketEvents } from '@proj-airi/server-sdk'

import type { FlowEntry, PreviewItem } from '../context-flow-types'

const previewMaxLength = 420

function truncateText(value: string, limit = 160) {
  if (value.length <= limit)
    return value
  return `${value.slice(0, limit)}...`
}

function formatDestinations(destinations: unknown) {
  if (!destinations)
    return ''
  if (Array.isArray(destinations))
    return destinations.join(', ')
  if (typeof destinations === 'string')
    return destinations
  try {
    return JSON.stringify(destinations)
  }
  catch {
    return String(destinations)
  }
}

function getPayloadData(entry: FlowEntry) {
  const payload = entry.payload as Record<string, any> | undefined
  if (!payload)
    return undefined
  return payload.data ?? payload
}

function getEventSource(entry: FlowEntry) {
  const payload = entry.payload as Record<string, any> | undefined
  if (!payload)
    return undefined
  return payload.source as string | undefined
}

function summarizeContextUpdate(update: { text?: string, content?: unknown, destinations?: unknown }) {
  const summaryParts: string[] = []
  if (update.text) {
    summaryParts.push(`text="${truncateText(update.text, 120)}"`)
  }
  if (update.content !== undefined) {
    const contentText = typeof update.content === 'string'
      ? update.content
      : (() => {
          try {
            return JSON.stringify(update.content)
          }
          catch {
            return '[unserializable]'
          }
        })()
    summaryParts.push(`content="${truncateText(contentText, 120)}"`)
  }
  if (update.destinations !== undefined) {
    summaryParts.push(`destinations="${truncateText(formatDestinations(update.destinations), 120)}"`)
  }
  return summaryParts.join(' ')
}

function toPreviewValue(value: unknown) {
  if (value === undefined || value === null)
    return ''
  if (typeof value === 'string')
    return value
  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return String(value)
  }
}

function formatPreviewValue(value: unknown) {
  const text = toPreviewValue(value)
  if (!text)
    return ''
  return truncateText(text, previewMaxLength)
}

function getContextUpdatePreview(entry: FlowEntry) {
  const candidate = getPayloadData(entry) as Record<string, any> | undefined
  if (!candidate || (candidate.text === undefined && candidate.content === undefined && candidate.destinations === undefined))
    return null
  return {
    text: candidate.text as string | undefined,
    content: candidate.content as unknown,
    destinations: candidate.destinations as unknown,
  }
}

function buildPreviewItems(entry: FlowEntry): PreviewItem[] {
  const items: PreviewItem[] = []
  const contextPreview = getContextUpdatePreview(entry)
  if (contextPreview) {
    if (contextPreview.text) {
      items.push({ label: 'Text', value: formatPreviewValue(contextPreview.text) })
    }
    if (contextPreview.content !== undefined) {
      items.push({ label: 'Content', value: formatPreviewValue(contextPreview.content) })
    }
    if (contextPreview.destinations !== undefined) {
      items.push({ label: 'Destinations', value: formatPreviewValue(formatDestinations(contextPreview.destinations)) })
    }
    return items
  }

  const payload = getPayloadData(entry) as Record<string, any> | undefined
  if (payload?.destinations !== undefined) {
    items.push({ label: 'Destinations', value: formatPreviewValue(formatDestinations(payload.destinations)) })
  }
  if (entry.type.startsWith('spark:')) {
    if (payload?.headline)
      items.push({ label: 'Headline', value: formatPreviewValue(payload.headline) })
    if (payload?.state)
      items.push({ label: 'State', value: formatPreviewValue(payload.state) })
    if (payload?.intent)
      items.push({ label: 'Intent', value: formatPreviewValue(payload.intent) })
  }
  if (payload?.messageText) {
    items.push({ label: 'Message', value: formatPreviewValue(payload.messageText) })
  }
  else if (payload?.literal) {
    items.push({ label: 'Token', value: formatPreviewValue(payload.literal) })
  }
  else if (payload?.special) {
    items.push({ label: 'Token', value: formatPreviewValue(payload.special) })
  }
  else if (payload?.message) {
    items.push({ label: 'Message', value: formatPreviewValue(payload.message) })
  }
  else if (payload?.name && entry.type === 'module:announce') {
    items.push({ label: 'Module', value: formatPreviewValue(payload.name) })
  }
  else if (payload?.text) {
    items.push({ label: 'Text', value: formatPreviewValue(payload.text) })
  }
  else if (payload?.transcription) {
    items.push({ label: 'Transcription', value: formatPreviewValue(payload.transcription) })
  }
  else if (entry.summary) {
    items.push({ label: 'Summary', value: formatPreviewValue(entry.summary) })
  }

  return items
}

function buildSparkCommandPreview(command: WebSocketEvents['spark:command']): PreviewItem[] {
  const items: PreviewItem[] = []
  if (command.intent)
    items.push({ label: 'Intent', value: formatPreviewValue(command.intent) })
  if (command.priority)
    items.push({ label: 'Priority', value: formatPreviewValue(command.priority) })
  if (command.interrupt !== undefined)
    items.push({ label: 'Interrupt', value: formatPreviewValue(command.interrupt) })
  if (command.destinations?.length)
    items.push({ label: 'Destinations', value: formatPreviewValue(formatDestinations(command.destinations)) })
  if (command.ack)
    items.push({ label: 'Ack', value: formatPreviewValue(command.ack) })
  if (command.guidance !== undefined)
    items.push({ label: 'Guidance', value: formatPreviewValue(command.guidance) })
  if (command.contexts !== undefined)
    items.push({ label: 'Contexts', value: formatPreviewValue(command.contexts) })
  return items
}

function formatTimestamp(value: number) {
  const date = new Date(value)
  return date.toLocaleTimeString('en-US', { hour12: false })
}

function formatPayload(payload: unknown) {
  if (payload === undefined)
    return '-'
  if (typeof payload === 'string')
    return payload
  try {
    return JSON.stringify(payload, null, 2)
  }
  catch {
    return String(payload)
  }
}

export function useContextFlowFormatters() {
  return {
    buildPreviewItems,
    buildSparkCommandPreview,
    formatDestinations,
    formatPayload,
    formatTimestamp,
    getEventSource,
    getPayloadData,
    summarizeContextUpdate,
    truncateText,
  }
}
