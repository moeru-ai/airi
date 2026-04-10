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
 * Web search via DuckDuckGo HTML lite endpoint.
 *
 * Uses DDG's lightweight HTML search page which requires no API key.
 * Parses result links, titles, and snippets from the HTML response.
 *
 * NOTICE: DuckDuckGo may rate-limit heavy usage. For production/high-volume
 * use, consider integrating a dedicated search API (SearXNG, Brave Search).
 */
export async function webSearch(params: {
  query: string
  maxResults?: number
}): Promise<WebSearchResult> {
  const startedAt = Date.now()
  const { query, maxResults = 10 } = params

  const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AIRI-ComputerUse/1.0 (MCP; +https://github.com/moeru-ai/airi)',
        'Accept': 'text/html',
      },
    }).finally(() => clearTimeout(timeout))

    if (!response.ok) {
      return {
        query,
        results: [],
        totalResults: 0,
        searchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        note: `Search request failed with status ${response.status}.`,
      }
    }

    const html = await response.text()

    // Parse DDG lite results — each result is in a table row with class "result-link"
    // Format: <a rel="nofollow" href="URL" class="result-link">TITLE</a>
    // Snippet follows in a <td class="result-snippet"> element
    const results: Array<{ url: string; title: string; snippet: string }> = []

    // Extract links and titles
    const linkRegex = /<a[^>]+class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
    const snippetRegex = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi

    const links: Array<{ url: string; title: string }> = []
    let linkMatch: RegExpExecArray | null = linkRegex.exec(html)
    while (linkMatch !== null) {
      const url = linkMatch[1] ?? ''
      const title = htmlToText(linkMatch[2] ?? '').trim()
      if (url && !url.startsWith('/') && title) {
        links.push({ url, title })
      }
      linkMatch = linkRegex.exec(html)
    }

    const snippets: string[] = []
    let snippetMatch: RegExpExecArray | null = snippetRegex.exec(html)
    while (snippetMatch !== null) {
      snippets.push(htmlToText(snippetMatch[1] ?? '').trim())
      snippetMatch = snippetRegex.exec(html)
    }

    // Pair links with snippets
    for (let i = 0; i < Math.min(links.length, maxResults); i++) {
      results.push({
        url: links[i]!.url,
        title: links[i]!.title,
        snippet: snippets[i] ?? '',
      })
    }

    return {
      query,
      results,
      totalResults: results.length,
      searchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      query,
      results: [],
      totalResults: 0,
      searchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      note: `Search failed: ${message}. Use web_fetch to directly fetch known URLs, or use terminal_exec with curl to query APIs.`,
    }
  }
}
