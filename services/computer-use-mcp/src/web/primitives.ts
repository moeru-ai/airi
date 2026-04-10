/**
 * Web primitives — HTTP-based information gathering without browser surfaces.
 *
 * Provides web_fetch (URL content extraction) and web_search (web search).
 * These tools complement the browser DOM/CDP surfaces by enabling lightweight
 * HTTP access when JavaScript rendering is not required.
 */

/**
 * Maximum response body size to prevent context window bloat.
 * HTML pages are typically 50-200KB; we cap at 200KB before conversion.
 */
const MAX_RESPONSE_BYTES = 200_000

/**
 * Maximum characters to return after HTML-to-text conversion.
 */
const MAX_TEXT_CHARS = 50_000

/**
 * Default timeout for HTTP requests in milliseconds.
 */
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Blocked URL schemes that should not be fetched.
 */
const BLOCKED_SCHEMES = new Set(['file:', 'ftp:', 'data:', 'javascript:', 'blob:'])

/**
 * Minimal HTML-to-text converter.
 * Strips tags, decodes common entities, collapses whitespace.
 * Not a full parser — optimized for extracting readable content.
 */
function htmlToText(html: string): string {
  let text = html
    // Remove script, style, and head blocks entirely
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    // Replace block elements with newlines
    .replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    // Collapse whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}

export interface WebFetchResult {
  url: string
  statusCode: number
  contentType: string
  title: string
  text: string
  textLength: number
  truncated: boolean
  fetchedAt: string
  durationMs: number
}

export interface WebSearchResult {
  query: string
  results: Array<{
    url: string
    title: string
    snippet: string
  }>
  totalResults: number
  searchedAt: string
  durationMs: number
  note?: string
}

/**
 * Fetch content from a URL via HTTP.
 * Converts HTML to simplified text. No JavaScript execution.
 */
export async function webFetch(params: {
  url: string
  timeoutMs?: number
  maxChars?: number
}): Promise<WebFetchResult> {
  const { url, timeoutMs = DEFAULT_TIMEOUT_MS, maxChars = MAX_TEXT_CHARS } = params

  // Validate URL
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  }
  catch {
    throw new Error(`Invalid URL: ${url}`)
  }

  if (BLOCKED_SCHEMES.has(parsedUrl.protocol)) {
    throw new Error(`Blocked URL scheme: ${parsedUrl.protocol}`)
  }

  const startedAt = Date.now()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AIRI-ComputerUse/1.0 (MCP; +https://github.com/moeru-ai/airi)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8',
      },
      redirect: 'follow',
    })

    const contentType = response.headers.get('content-type') || 'unknown'
    const isHtml = contentType.includes('html')
    const isText = contentType.includes('text') || contentType.includes('json') || contentType.includes('xml')

    if (!isHtml && !isText) {
      return {
        url,
        statusCode: response.status,
        contentType,
        title: '',
        text: `[Binary content: ${contentType}. Use browser tools to interact with this page.]`,
        textLength: 0,
        truncated: false,
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      }
    }

    // Read body with size limit
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    const chunks: Uint8Array[] = []
    let totalBytes = 0

    while (totalBytes < MAX_RESPONSE_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      totalBytes += value.length
    }

    reader.cancel().catch(() => {})

    const rawText = new TextDecoder().decode(
      chunks.length === 1
        ? chunks[0]
        : new Uint8Array(await new Blob(chunks).arrayBuffer()),
    )

    // Convert HTML to text
    let text = isHtml ? htmlToText(rawText) : rawText

    // Extract title from HTML
    let title = ''
    if (isHtml) {
      const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      if (titleMatch) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim()
      }
    }

    // Truncate if needed
    const truncated = text.length > maxChars
    if (truncated) {
      text = `${text.slice(0, maxChars)}\n\n[... content truncated at ${maxChars} characters ...]`
    }

    return {
      url,
      statusCode: response.status,
      contentType,
      title,
      text,
      textLength: text.length,
      truncated,
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    }
  }
  finally {
    clearTimeout(timeout)
  }
}

/**
 * Web search using terminal-based search.
 * Delegates to a curl-based search API or falls back to a notice.
 *
 * NOTICE: This is a stub that returns a structured "not yet configured" response.
 * A full implementation would integrate with a search API (e.g., SearXNG, Brave Search).
 * The tool is registered now so the descriptor/contract chain is complete and ready
 * for the backend to be wired in.
 */
export async function webSearch(params: {
  query: string
  maxResults?: number
}): Promise<WebSearchResult> {
  const startedAt = Date.now()
  const { query, maxResults = 10 } = params

  // NOTICE: Stub — returns a structured response indicating no search backend is configured.
  // To enable: set AIRI_SEARCH_API_URL in the environment and implement the fetch call below.
  return {
    query,
    results: [],
    totalResults: 0,
    searchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    note: `Web search is not yet configured. To use this tool, configure a search API backend (e.g., SearXNG at AIRI_SEARCH_API_URL). Alternatively, use web_fetch to directly fetch known URLs, or use terminal_exec with curl to query APIs.`,
  }
}
