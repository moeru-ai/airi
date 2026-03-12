import type { CommonContentPart } from '@xsai/shared-chat'

import type { McpCallToolResult, McpToolDescriptor } from '../stores/mcp-tool-bridge'
import type { WorkflowRerouteInstruction } from './mcp-reroute'

export type McpPromptContentMode = 'default' | 'tight' | 'tight-text-only'

export interface McpPromptContentOptions {
  imageMaxEdge: number
  imageQuality: number
  maxInlineImageChars: number
  maxTextChars: number
  inlineImages: boolean
}

const MCP_TEXT_TYPES = new Set(['text'])
const MCP_IMAGE_TYPES = new Set(['image'])
const SENSITIVE_VALUE_KEYS = new Set([
  'data',
  'dataBase64',
  'base64',
  'bytes',
  'buffer',
  'image',
])

export const defaultMcpPromptContentOptions: McpPromptContentOptions = {
  imageMaxEdge: 768,
  imageQuality: 0.65,
  maxInlineImageChars: 24_000,
  maxTextChars: 2_000,
  inlineImages: true,
}

export const tightMcpPromptContentOptions: McpPromptContentOptions = {
  imageMaxEdge: 384,
  imageQuality: 0.4,
  maxInlineImageChars: 12_000,
  maxTextChars: 1_200,
  inlineImages: true,
}

export const tightTextOnlyMcpPromptContentOptions: McpPromptContentOptions = {
  imageMaxEdge: 384,
  imageQuality: 0.4,
  maxInlineImageChars: 12_000,
  maxTextChars: 1_200,
  inlineImages: false,
}

export interface McpObservationContentOptions {
  toolName?: string
}

export function getMcpPromptContentOptions(mode: McpPromptContentMode = 'default'): McpPromptContentOptions {
  if (mode === 'tight-text-only') {
    return tightTextOnlyMcpPromptContentOptions
  }

  return mode === 'tight'
    ? tightMcpPromptContentOptions
    : defaultMcpPromptContentOptions
}

export function formatMcpToolListPromptContent(tools: McpToolDescriptor[]): CommonContentPart[] {
  if (tools.length === 0) {
    return [{ type: 'text', text: 'No MCP tools are currently available.' }]
  }

  const lines = tools.map((tool) => {
    const parameters = extractSchemaParameterSummary(tool.inputSchema)
    const signature = parameters.length > 0
      ? `${tool.name}(${parameters.join(', ')})`
      : `${tool.name}()`
    const description = truncateText(tool.description || 'No description provided.', 220)
    return `- ${signature}: ${description}`
  })

  return [{
    type: 'text',
    text: `Available MCP tools:\n${lines.join('\n')}`,
  }]
}

export async function formatMcpToolResultPromptContent(
  result: McpCallToolResult,
  options: McpPromptContentOptions,
): Promise<CommonContentPart[]> {
  const parts: CommonContentPart[] = []
  const content = Array.isArray(result.content)
    ? result.content
    : []

  for (const item of content) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const type = typeof item.type === 'string'
      ? item.type
      : undefined

    if (type && MCP_TEXT_TYPES.has(type)) {
      const text = typeof item.text === 'string'
        ? item.text
        : undefined
      if (text) {
        parts.push({
          type: 'text',
          text: truncateText(text, options.maxTextChars),
        })
      }
      continue
    }

    if (type && MCP_IMAGE_TYPES.has(type)) {
      const imageParts = await convertMcpImageToPromptContent(item, options)
      parts.push(...imageParts)
    }
  }

  if (parts.length > 0) {
    return parts
  }

  return [{
    type: 'text',
    text: buildFallbackSummary(result, options.maxTextChars),
  }]
}

export async function formatMcpObservationUserContent(
  result: McpCallToolResult,
  options: McpPromptContentOptions,
  observationOptions: McpObservationContentOptions = {},
): Promise<CommonContentPart[]> {
  const content = Array.isArray(result.content)
    ? result.content
    : []
  const textParts = content
    .filter(item => item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string')
    .map(item => truncateText(String(item.text), options.maxTextChars))

  const imageParts = await buildObservationImageParts(result, options)

  if (imageParts.length === 0) {
    return []
  }

  const label = observationOptions.toolName
    ? `New visual observation from ${observationOptions.toolName}.`
    : 'New visual observation.'
  const summary = textParts.length > 0
    ? `${label} ${textParts.join(' ')}`
    : label

  return [
    {
      type: 'text',
      text: truncateText(summary, options.maxTextChars),
    },
    ...imageParts,
  ]
}

async function buildObservationImageParts(
  result: McpCallToolResult,
  options: McpPromptContentOptions,
): Promise<CommonContentPart[]> {
  const externalUrls = extractObservationImageUrls(result.structuredContent)
  if (externalUrls.length > 0) {
    return externalUrls.map(url => ({
      type: 'image_url',
      image_url: { url },
    }))
  }

  if (!options.inlineImages) {
    return []
  }

  const content = Array.isArray(result.content)
    ? result.content
    : []
  const imageParts: CommonContentPart[] = []

  for (const item of content) {
    if (!item || typeof item !== 'object' || item.type !== 'image') {
      continue
    }

    const data = typeof item.data === 'string'
      ? item.data
      : undefined
    const mimeType = typeof item.mimeType === 'string'
      ? item.mimeType
      : 'image/png'
    if (!data) {
      continue
    }

    const sourceDataUrl = `data:${mimeType};base64,${data}`
    const compressedDataUrl = await compressImageDataUrl(sourceDataUrl, {
      ...options,
      inlineImages: true,
    })

    if (!compressedDataUrl) {
      continue
    }

    imageParts.push({
      type: 'image_url',
      image_url: {
        url: compressedDataUrl,
      },
    })
  }

  return imageParts
}

function extractObservationImageUrls(source: unknown): string[] {
  const urls = new Set<string>()
  collectObservationImageUrls(source, urls, 0)
  return Array.from(urls)
}

function collectObservationImageUrls(source: unknown, urls: Set<string>, depth: number) {
  if (depth > 5 || source == null) {
    return
  }

  if (Array.isArray(source)) {
    source.forEach(entry => collectObservationImageUrls(entry, urls, depth + 1))
    return
  }

  if (!isRecord(source)) {
    return
  }

  const publicUrl = typeof source.publicUrl === 'string'
    ? source.publicUrl.trim()
    : ''
  const observationUrl = typeof source.observationUrl === 'string'
    ? source.observationUrl.trim()
    : ''

  for (const candidate of [publicUrl, observationUrl]) {
    if (/^https?:\/\//i.test(candidate)) {
      urls.add(candidate)
    }
  }

  for (const value of Object.values(source)) {
    collectObservationImageUrls(value, urls, depth + 1)
  }
}

function extractSchemaParameterSummary(inputSchema: Record<string, unknown>): string[] {
  const properties = isRecord(inputSchema.properties)
    ? inputSchema.properties
    : {}
  const required = new Set(Array.isArray(inputSchema.required)
    ? inputSchema.required.filter((value): value is string => typeof value === 'string')
    : [])

  return Object.entries(properties).map(([name, schema]) => {
    const type = inferSchemaType(schema)
    return required.has(name)
      ? `${name}: ${type}`
      : `${name}?: ${type}`
  })
}

function inferSchemaType(schema: unknown): string {
  if (!isRecord(schema)) {
    return 'unknown'
  }

  if (typeof schema.type === 'string') {
    return schema.type
  }

  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((value): value is string => typeof value === 'string')
    if (types.length > 0) {
      return types.join(' | ')
    }
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const types = schema.anyOf
      .map(entry => inferSchemaType(entry))
      .filter(Boolean)
    if (types.length > 0) {
      return types.join(' | ')
    }
  }

  return 'unknown'
}

async function convertMcpImageToPromptContent(
  item: Record<string, unknown>,
  options: McpPromptContentOptions,
): Promise<CommonContentPart[]> {
  const data = typeof item.data === 'string'
    ? item.data
    : undefined
  const mimeType = typeof item.mimeType === 'string'
    ? item.mimeType
    : 'image/png'

  if (!data) {
    return [{
      type: 'text',
      text: 'MCP tool returned an image, but the image payload was missing.',
    }]
  }

  if (!options.inlineImages) {
    return [{
      type: 'text',
      text: `MCP tool returned an image (${mimeType}), but AIRI kept only a textual summary because this provider does not safely support inline images in tool-result messages.`,
    }]
  }

  const sourceDataUrl = `data:${mimeType};base64,${data}`
  const compressedDataUrl = await compressImageDataUrl(sourceDataUrl, options)

  if (compressedDataUrl) {
    return [{
      type: 'image_url',
      image_url: {
        url: compressedDataUrl,
      },
    }]
  }

  return [{
    type: 'text',
    text: `MCP tool returned an image (${mimeType}), but the inline image payload was omitted to stay within the model request budget.`,
  }]
}

async function compressImageDataUrl(
  sourceDataUrl: string,
  options: McpPromptContentOptions,
): Promise<string | undefined> {
  if (sourceDataUrl.length <= options.maxInlineImageChars) {
    return sourceDataUrl
  }

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return undefined
  }

  try {
    const image = await loadImage(sourceDataUrl)
    const maxDimension = Math.max(image.naturalWidth || image.width || 0, image.naturalHeight || image.height || 0)
    const scale = maxDimension > 0
      ? Math.min(1, options.imageMaxEdge / maxDimension)
      : 1
    const width = Math.max(1, Math.round((image.naturalWidth || image.width || 1) * scale))
    const height = Math.max(1, Math.round((image.naturalHeight || image.height || 1) * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      return undefined
    }

    context.drawImage(image, 0, 0, width, height)

    // NOTICE: Tight tool-result budgets are common across remote providers.
    // Converting screenshots to bounded JPEG thumbnails avoids blindly inlining
    // the original PNG payload into the next tool-followup request.
    const targetMimeType = 'image/jpeg'
    let quality = options.imageQuality
    let dataUrl = canvas.toDataURL(targetMimeType, quality)

    while (dataUrl.length > options.maxInlineImageChars && quality > 0.2) {
      quality = Number((quality - 0.1).toFixed(2))
      dataUrl = canvas.toDataURL(targetMimeType, quality)
    }

    if (dataUrl.length <= options.maxInlineImageChars) {
      return dataUrl
    }
  }
  catch (error) {
    console.warn('[mcp] failed to compress image tool result:', error)
  }

  return undefined
}

function buildFallbackSummary(result: McpCallToolResult, maxTextChars: number): string {
  const source = result.structuredContent ?? result.toolResult ?? result.content ?? null
  const summary = summarizeValue(source)
  const prefix = result.isError
    ? 'MCP tool returned an error.'
    : 'MCP tool returned structured content.'

  if (summary == null) {
    return prefix
  }

  return truncateText(`${prefix} ${JSON.stringify(summary)}`, maxTextChars)
}

function summarizeValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return truncateText(value, 160)
  }

  if (Array.isArray(value)) {
    return value.slice(0, 6).map(item => summarizeValue(item, depth + 1))
  }

  if (depth >= 2) {
    return '[truncated]'
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([key]) => !SENSITIVE_VALUE_KEYS.has(key))
      .slice(0, 10)
      .map(([key, nestedValue]) => [key, summarizeValue(nestedValue, depth + 1)])

    return Object.fromEntries(entries)
  }

  return String(value)
}

function truncateText(text: string, maxChars: number): string {
  return text.length > maxChars
    ? `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`
    : text
}

// ---------------------------------------------------------------------------
// Reroute observation template
// ---------------------------------------------------------------------------

/**
 * Format a workflow reroute instruction into a fixed observation template.
 *
 * All providers share this exact template so models see a consistent
 * signal regardless of which LLM is driving the conversation.
 */
export function formatRerouteObservation(instruction: WorkflowRerouteInstruction): CommonContentPart[] {
  const r = instruction.reroute
  const lines: string[] = [
    'Workflow reroute required.',
    'The workflow stopped safely before continuing on the wrong execution surface.',
    `Reason: ${r.strategyReason}`,
    ...(r.executionReason ? [`Execution detail: ${r.executionReason}`] : []),
    `Recommended surface: ${r.recommendedSurface}`,
    `Suggested next tool: ${r.suggestedTool}`,
    ...(r.availableSurfaces && r.availableSurfaces.length > 0
      ? [`Available surfaces: ${r.availableSurfaces.join(', ')}`]
      : []),
    ...(r.preferredSurface ? [`Preferred surface: ${r.preferredSurface}`] : []),
    ...(r.terminalSurface ? [`Terminal surface: ${r.terminalSurface}`] : []),
    ...(r.ptySessionId ? [`PTY session id: ${r.ptySessionId}`] : []),
    'Decide the next tool call based on this reroute instruction.',
  ]

  return [{ type: 'text', text: lines.join('\n') }]
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null
}

function loadImage(sourceDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = error => reject(error)
    image.src = sourceDataUrl
  })
}
