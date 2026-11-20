import { measureContextBudget } from '@proj-airi/core-agent'

/** One slice of a serialized provider projection. Byte fields are UTF-8 sizes, not tokens. */
export type ContextProjectionSectionKind
  = | 'system-context'
    | 'conversation'
    | 'tool-call'
    | 'tool-result'
    | 'tool-schema'

export interface ContextProjectionSection {
  id: string
  kind: ContextProjectionSectionKind
  /** Short source label, such as a role or a tool name. */
  title: string
  /** UTF-8 bytes of this slice, excluding inline image data URLs. */
  textBytes: number
  /** UTF-8 bytes of inline image data URLs in this slice. */
  imageBytes: number
  /** `textBytes + imageBytes` for this slice. */
  totalBytes: number
  /** Expandable text. Inline image payloads are replaced so the preview stays text. */
  preview: string
}

/**
 * Byte breakdown of one serialized provider projection.
 * `totalBytes` is the UTF-8 size of the whole value. It is not a token count.
 */
export interface SerializedProjectionBreakdown {
  textBytes: number
  imageBytes: number
  totalBytes: number
  /**
   * Bytes in the whole serialization that no section claims.
   * Includes JSON keys, separators, and string quoting or escape overhead
   * when a section measures a raw string instead of its JSON form.
   */
  framingBytes: number
  sections: ContextProjectionSection[]
}

const CONTEXT_MARKER = '\n[Context]\n'
const MAX_PREVIEW = 8_000
const MAX_PREVIEW_STRING = 2_000
const MAX_PREVIEW_DEPTH = 6
const MAX_PREVIEW_ARRAY = 50
/** Skip pretty preview when a slice is larger than this many UTF-8 bytes. */
const MAX_PREVIEW_SLICE_BYTES = 1_048_576

/** Ring fill from the latest reported input tokens and the model context window. */
export interface ReportedWindowUsage {
  /** Percent with one decimal place. Values above 100 mean reported input exceeds the window. */
  label: string
  /** Fill percent, clamped from 0 to 100. */
  bar: number
  /** True when reported input tokens exceed the context window. */
  over: boolean
}

/**
 * Percent of the context window used by reported input tokens.
 * A missing window or a missing reported input has no percent.
 */
export function reportedWindowUsage(
  windowTokens: number | undefined,
  inputTokens: number | null | undefined,
): ReportedWindowUsage | undefined {
  const window = positiveTokenCount(windowTokens)
  if (!window || inputTokens == null || !Number.isFinite(inputTokens) || inputTokens < 0)
    return undefined
  const percent = (inputTokens / window) * 100
  return {
    label: percent.toFixed(1),
    bar: Math.min(100, Math.max(0, percent)),
    over: percent > 100,
  }
}

/** Category key for the summary list, including JSON framing. */
export type ContextProjectionGroupKind = ContextProjectionSectionKind | 'framing'

/** One category total for the summary view. Expand it to read the sections. */
export interface ContextProjectionGroup {
  kind: ContextProjectionGroupKind
  textBytes: number
  imageBytes: number
  totalBytes: number
  sections: ContextProjectionSection[]
}

const GROUP_KIND_ORDER: ContextProjectionSectionKind[] = [
  'system-context',
  'conversation',
  'tool-call',
  'tool-result',
  'tool-schema',
]

/**
 * Groups projection sections by kind for the summary list.
 * Framing is a separate row when it has bytes.
 */
export function groupProjectionSections(breakdown: SerializedProjectionBreakdown): ContextProjectionGroup[] {
  const buckets = new Map<ContextProjectionSectionKind, ContextProjectionSection[]>()
  for (const kind of GROUP_KIND_ORDER)
    buckets.set(kind, [])

  for (const section of breakdown.sections) {
    const list = buckets.get(section.kind)
    if (list)
      list.push(section)
  }

  const groups: ContextProjectionGroup[] = []
  for (const kind of GROUP_KIND_ORDER) {
    const sections = buckets.get(kind) ?? []
    if (sections.length === 0)
      continue
    const textBytes = sections.reduce((total, section) => total + section.textBytes, 0)
    const imageBytes = sections.reduce((total, section) => total + section.imageBytes, 0)
    groups.push({
      kind,
      textBytes,
      imageBytes,
      totalBytes: textBytes + imageBytes,
      sections,
    })
  }

  if (breakdown.framingBytes > 0) {
    groups.push({
      kind: 'framing',
      textBytes: breakdown.framingBytes,
      imageBytes: 0,
      totalBytes: breakdown.framingBytes,
      sections: [],
    })
  }

  return groups
}

const IMAGE_PART_TYPES = new Set(['image', 'image_url', 'input_image'])
const IMAGE_PAYLOAD_KEYS = new Set(['data', 'image_data', 'image_url', 'url'])
const TEXT_PART_TYPES = new Set(['text', 'input_text', 'output_text'])

/** A catalog context window is usable only as a positive safe integer. */
export function positiveTokenCount(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isImagePart(value: unknown) {
  return isRecord(value) && typeof value.type === 'string' && IMAGE_PART_TYPES.has(value.type)
}

function isInlineImageDataUrl(value: string) {
  return value.slice(0, 11).toLowerCase() === 'data:image/' && value.includes(';base64,')
}

/** Hides inline image bytes. A data URL in ordinary text stays visible and is still counted as text. */
function redactInlineImages(value: unknown, imageObject = false): unknown {
  if (typeof value === 'string' || value == null || typeof value !== 'object')
    return value
  if (Array.isArray(value))
    return value.map(item => redactInlineImages(item, imageObject))

  const record = value as Record<string, unknown>
  const isImage = imageObject || (typeof record.type === 'string' && IMAGE_PART_TYPES.has(record.type))
  return Object.fromEntries(Object.entries(record).map(([key, child]) => {
    if (typeof child === 'string' && isImage && IMAGE_PAYLOAD_KEYS.has(key) && isInlineImageDataUrl(child))
      return [key, '[inline image]']
    return [key, redactInlineImages(child, isImage)]
  }))
}

function truncatePreview(text: string) {
  if (text.length <= MAX_PREVIEW)
    return text
  let end = MAX_PREVIEW
  const unit = text.charCodeAt(end - 1)
  // Avoid splitting a UTF-16 surrogate pair at the cut point.
  if (unit >= 0xD800 && unit <= 0xDBFF)
    end -= 1
  return `${text.slice(0, end)}…`
}

/** Bounds a value before pretty-print so large tool results do not allocate a huge string. */
function shrinkForPreview(value: unknown, depth = 0): unknown {
  if (typeof value === 'string')
    return value.length > MAX_PREVIEW_STRING ? `${value.slice(0, MAX_PREVIEW_STRING)}…` : value
  if (value == null || typeof value !== 'object')
    return value
  if (depth > MAX_PREVIEW_DEPTH)
    return '[…]'
  if (Array.isArray(value))
    return value.slice(0, MAX_PREVIEW_ARRAY).map(item => shrinkForPreview(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, shrinkForPreview(child, depth + 1)]),
  )
}

function previewOf(value: unknown, totalBytes: number) {
  if (typeof value === 'string')
    return truncatePreview(value)
  if (totalBytes > MAX_PREVIEW_SLICE_BYTES)
    return `[preview omitted: ${totalBytes} bytes]`
  const text = JSON.stringify(shrinkForPreview(redactInlineImages(value)), null, 2) ?? ''
  return truncatePreview(text)
}

function toolTitle(tool: unknown) {
  if (!isRecord(tool))
    return 'Tool schema'
  if (isRecord(tool.function) && typeof tool.function.name === 'string' && tool.function.name)
    return tool.function.name
  if (typeof tool.name === 'string' && tool.name)
    return tool.name
  if (typeof tool.type === 'string' && tool.type)
    return tool.type
  return 'Tool schema'
}

function callTitle(call: unknown) {
  if (!isRecord(call))
    return 'Tool call'
  if (typeof call.name === 'string' && call.name)
    return call.name
  if (isRecord(call.function) && typeof call.function.name === 'string' && call.function.name)
    return call.function.name
  return 'Tool call'
}

function readList(value: unknown, key: string): unknown[] | undefined {
  if (!isRecord(value) || !Array.isArray(value[key]))
    return undefined
  return value[key]
}

/**
 * Conversation items from a provider request shape.
 * Responses API allows `input` as a string or as an item array.
 */
function readConversationItems(value: unknown): unknown[] | undefined {
  if (Array.isArray(value))
    return value
  const messages = readList(value, 'messages')
  if (messages)
    return messages
  const inputItems = readList(value, 'input')
  if (inputItems)
    return inputItems
  if (isRecord(value) && typeof value.input === 'string')
    return value.input === '' ? [] : [{ role: 'user', content: value.input }]
  return undefined
}

/** True when the value looks like a provider request, not a bare message. */
function isProviderRequestShape(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (
    'messages' in value
    || 'input' in value
    || 'tools' in value
    || 'system' in value
    || 'instructions' in value
  )
}

/**
 * Splits one provider projection into serialized UTF-8 byte sections.
 * Image bytes follow `measureContextBudget`: only inline image data URLs count.
 * The result has no token fields.
 */
export function classifySerializedProjection(value: unknown): SerializedProjectionBreakdown {
  if (value == null) {
    return { textBytes: 0, imageBytes: 0, totalBytes: 0, framingBytes: 0, sections: [] }
  }

  const sections: ContextProjectionSection[] = []
  let nextId = 0

  function push(kind: ContextProjectionSectionKind, title: string, slice: unknown) {
    if (slice == null || slice === '')
      return
    const budget = measureContextBudget(slice)
    sections.push({
      id: `${kind}-${nextId++}`,
      kind,
      title,
      textBytes: budget.textBytes,
      imageBytes: budget.imageBytes,
      totalBytes: budget.totalBytes,
      preview: previewOf(slice, budget.totalBytes),
    })
  }

  function classifyContent(kind: ContextProjectionSectionKind, content: unknown): void {
    if (content == null || content === '')
      return
    if (Array.isArray(content)) {
      for (const part of content)
        classifyContent(kind, part)
      return
    }
    if (typeof content === 'string' && kind === 'conversation' && content.includes(CONTEXT_MARKER)) {
      const index = content.indexOf(CONTEXT_MARKER)
      push('conversation', 'Message', content.slice(0, index))
      push('system-context', 'Context', content.slice(index))
      return
    }
    if (isRecord(content) && kind === 'conversation' && typeof content.text === 'string' && content.text.includes(CONTEXT_MARKER)) {
      classifyContent(kind, content.text)
      return
    }
    if (isRecord(content) && content.type === 'tool_use') {
      push('tool-call', callTitle(content), content)
      return
    }
    if (isRecord(content) && content.type === 'tool_result') {
      classifyContent('tool-result', content.content !== undefined ? content.content : content)
      return
    }
    if (isImagePart(content)) {
      push(kind, 'Inline image', content)
      return
    }
    const textPart = isRecord(content) && typeof content.type === 'string' && TEXT_PART_TYPES.has(content.type)
    const title = textPart
      ? 'Text'
      : kind === 'system-context'
        ? 'System'
        : kind === 'tool-result'
          ? 'Tool result'
          : 'Message'
    push(kind, title, content)
  }

  function classifyMessage(message: unknown) {
    if (!isRecord(message)) {
      push('conversation', 'Message', message)
      return
    }
    if (message.type === 'function_call') {
      push('tool-call', callTitle(message), message)
      return
    }
    if (message.type === 'function_call_output') {
      if (message.output !== undefined)
        classifyContent('tool-result', message.output)
      else
        push('tool-result', 'Tool result', message)
      return
    }

    const role = typeof message.role === 'string' ? message.role : ''
    const kind: ContextProjectionSectionKind = role === 'tool'
      ? 'tool-result'
      : role === 'system' || role === 'developer' || role === 'context'
        ? 'system-context'
        : 'conversation'

    if (kind === 'tool-result') {
      classifyContent('tool-result', message.content !== undefined ? message.content : message)
      return
    }

    if (message.content !== undefined)
      classifyContent(kind, message.content)
    else if (!Array.isArray(message.tool_calls))
      push(kind, kind === 'system-context' ? 'System' : 'Message', message)
    if (Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls)
        push('tool-call', callTitle(call), call)
    }
  }

  // Anthropic Messages uses top-level `system`. OpenAI Responses uses `instructions`.
  const topSystem = isRecord(value)
    ? (value.system ?? value.instructions)
    : undefined
  if (topSystem !== undefined)
    classifyContent('system-context', topSystem)

  const conversationItems = readConversationItems(value)
  if (conversationItems) {
    for (const message of conversationItems)
      classifyMessage(message)
  }
  else if (!isProviderRequestShape(value)) {
    // Bare message or non-request value.
    classifyMessage(value)
  }

  for (const tool of readList(value, 'tools') ?? [])
    push('tool-schema', toolTitle(tool), tool)

  const whole = measureContextBudget(value)
  const assigned = sections.reduce((total, section) => total + section.totalBytes, 0)
  if (import.meta.env.DEV && assigned > whole.totalBytes + 64) {
    console.warn('[context-projection] assigned exceeds whole', {
      assigned,
      whole: whole.totalBytes,
    })
  }
  return {
    textBytes: whole.textBytes,
    imageBytes: whole.imageBytes,
    totalBytes: whole.totalBytes,
    framingBytes: Math.max(0, whole.totalBytes - assigned),
    sections,
  }
}
