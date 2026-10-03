import type { InferOutput } from 'valibot'

import { boolean, looseObject, object, optional, picklist, safeParse, string } from 'valibot'

/** Stored diagnostic content is independent of the request's delivery outcome. */
export const requestContentSchema = object({
  format: picklist(['json', 'text', 'sse']),
  text: string(),
  state: picklist(['complete', 'partial', 'truncated']),
  omittedMedia: boolean(),
})

export type RequestContent = InferOutput<typeof requestContentSchema>

/** Bounds each diagnostic payload without limiting the upstream response. */
const contentLimit = 8 * 1024 * 1024
const encoder = new TextEncoder()
const mediaContainerSchema = object({
  type: optional(string()),
  format: optional(string()),
  mime_type: optional(string()),
  media_type: optional(string()),
})
const embeddedMediaSchema = looseObject({ data: string() })

function serializeContent(value: unknown) {
  let omittedMedia = false
  const text = JSON.stringify(value, function (this: unknown, key, field: unknown) {
    if (['audio', 'input_audio', 'inline_data', 'inlineData'].includes(key)) {
      const embedded = safeParse(embeddedMediaSchema, field)
      if (embedded.success) {
        omittedMedia = true
        return { ...embedded.output, data: { omitted: 'inline_media', encodedLength: embedded.output.data.length } }
      }
    }
    const content = safeParse(string(), field)
    if (!content.success)
      return field
    const parent = safeParse(mediaContainerSchema, this)
    const inline = content.output.match(/^data:([^;,]*)(?:;[^,]*)?,/)
    const mediaData = key === 'b64_json' || key === 'file_data' || key === 'image_base64'
      || (key === 'data' && parent.success && (parent.output.type === 'base64' || parent.output.mime_type || parent.output.media_type))
      || (key === 'delta' && parent.success && ['response.audio.delta', 'response.output_audio.delta'].includes(parent.output.type ?? ''))
      || key === 'partial_image_b64'
      || (key === 'result' && parent.success && parent.output.type === 'image_generation_call')
    if (inline || mediaData) {
      omittedMedia = true
      return { omitted: 'inline_media', mimeType: inline?.[1] ?? (parent.success ? parent.output.media_type ?? parent.output.mime_type : undefined), encodedLength: content.output.length }
    }
    return field
  })
  return { text: text ?? 'null', omittedMedia }
}

/** Captures JSON without inline media bytes. Oversized JSON becomes an explicitly truncated text preview. */
export function captureRequestContent(value: unknown): RequestContent {
  const serialized = serializeContent(value)
  const bytes = encoder.encode(serialized.text)
  if (bytes.byteLength > contentLimit)
    return { format: 'text', text: new TextDecoder().decode(bytes.subarray(0, contentLimit), { stream: true }), state: 'truncated', omittedMedia: serialized.omittedMedia }
  return { format: 'json', ...serialized, state: 'complete' }
}

/** Preserves non-JSON upstream errors as text instead of replacing their diagnostic body. */
export function captureResponseText(text: string, partial = false): RequestContent {
  try {
    const value: unknown = JSON.parse(text)
    const content = captureRequestContent(value)
    if (partial && content.state === 'complete')
      content.state = 'partial'
    return content
  }
  catch {
    const sanitized = text.replace(/data:([^;,\s]*);base64,[a-z0-9+/=]+/gi, '[inline media omitted: $1]')
    const bytes = encoder.encode(sanitized)
    return { format: 'text', text: new TextDecoder().decode(bytes.subarray(0, contentLimit), { stream: bytes.byteLength > contentLimit }), state: bytes.byteLength > contentLimit ? 'truncated' : partial ? 'partial' : 'complete', omittedMedia: sanitized !== text }
  }
}

/** The operation owns this accumulator. Snapshots retain only received SSE data events, including tool and reasoning deltas. */
export function createResponseContentCapture() {
  const events: string[] = []
  let bytes = 0
  let truncated = false
  let omittedMedia = false
  return {
    append(data: string) {
      if (truncated)
        return
      const content = captureResponseText(data)
      const size = encoder.encode(content.text).byteLength + 2
      omittedMedia ||= content.omittedMedia
      if (content.state === 'truncated' || bytes + size > contentLimit) {
        truncated = true
        return
      }
      events.push(content.text)
      bytes += size
    },
    snapshot(complete: boolean): RequestContent {
      return { format: 'sse', text: events.join('\n\n'), state: truncated ? 'truncated' : complete ? 'complete' : 'partial', omittedMedia }
    },
  }
}

/** Reads a diagnostic copy for at most five seconds. A stalled or broken body yields partial content; the caller retains the original response. */
export async function captureErrorResponse(response: Response): Promise<RequestContent> {
  const mimeType = response.headers.get('content-type')?.split(';')[0].trim()
  if (mimeType && /^(?:image\/|audio\/|video\/|application\/octet-stream$)/i.test(mimeType)) {
    void response.body?.cancel().catch(() => {})
    return { ...captureRequestContent({ omitted: 'inline_media', mimeType, contentLength: response.headers.get('content-length') }), omittedMedia: true }
  }
  const reader = response.body?.getReader()
  if (!reader)
    return captureResponseText('')
  const chunks: Uint8Array[] = []
  let size = 0
  let complete = false
  let timedOut = false
  const deadline = setTimeout(() => {
    timedOut = true
    void reader.cancel().catch(() => {})
  }, 5000)
  try {
    while (size <= contentLimit) {
      const result = await reader.read()
      if (result.done) {
        complete = !timedOut
        break
      }
      const remaining = contentLimit + 1 - size
      chunks.push(result.value.subarray(0, remaining))
      size += Math.min(remaining, result.value.byteLength)
    }
  }
  catch {
    complete = false
  }
  finally {
    clearTimeout(deadline)
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const joined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  if (size > contentLimit)
    return { format: 'text', text: 'Upstream error body exceeds the capture limit.', state: 'truncated', omittedMedia: false }
  const content = captureResponseText(new TextDecoder().decode(joined), !complete)
  return content
}
