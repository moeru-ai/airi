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
    .replace(/&#39;/g, '\'')
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
      if (done)
        break
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
 * Browser-like User-Agent for search engines.
 * Using a real browser UA dramatically reduces CAPTCHA/bot-detection.
 */
const SEARCH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/**
 * Parse Bing search results from HTML.
 *
 * Bing's HTML results follow this structure:
 *   <li class="b_algo">
 *     <div class="b_tpcn"><a ... href="https://bing.com/ck/a?...u=REAL_URL">
 *       <div class="b_title"><h2>TITLE</h2></div>
 *     </a></div>
 *     <div class="b_caption"><p ...>SNIPPET</p></div>
 *     <div class="b_attribution"><cite>VISIBLE_URL</cite></div>
 *   </li>
 *
 * NOTICE: Bing uses redirect URLs (bing.com/ck/a?...). We extract the
 * actual URL from the `u=` parameter, which is base64-encoded.
 */
function parseBingResults(html: string, maxResults: number): Array<{ url: string, title: string, snippet: string }> {
  const results: Array<{ url: string, title: string, snippet: string }> = []

  // Strategy 1: Extract cite tags (visible URLs) + h2 titles from b_algo blocks
  // Split HTML by b_algo blocks
  const algoBlocks = html.split(/class="b_algo"/)
  // Skip first chunk (before first result)
  for (let i = 1; i < algoBlocks.length && results.length < maxResults; i++) {
    const block = algoBlocks[i]!

    // Extract title from h2
    const h2Match = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
    const title = h2Match ? htmlToText(h2Match[1] ?? '') : ''

    // Extract URL from cite tag (visible URL, not the redirect)
    const citeMatch = block.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i)
    let url = citeMatch ? htmlToText(citeMatch[1] ?? '').replace(/\s+/g, '') : ''

    // If cite URL doesn't have protocol, try extracting from href
    if (url && !url.startsWith('http')) {
      url = `https://${url}`
    }

    // Also try to extract from the redirect URL's `u=` parameter
    if (!url || url.length < 10) {
      const hrefMatch = block.match(/href="[^"]*[?&]u=a1([^&"]+)/i)
      if (hrefMatch) {
        try {
          url = Buffer.from(hrefMatch[1]!, 'base64').toString('utf-8')
        }
        catch { /* ignore decode failures */ }
      }
    }

    // Extract snippet from p tag within b_caption
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    const snippet = snippetMatch ? htmlToText(snippetMatch[1] ?? '') : ''

    if (title && url && url.startsWith('http')) {
      // Clean up Bing's URL formatting (often has › separators in cite)
      const cleanUrl = url.split(' ')[0]!.replace(/›/g, '/').replace(/\s/g, '')
      results.push({ url: cleanUrl, title: title.trim(), snippet: snippet.trim() })
    }
  }

  return results
}

/**
 * Parse DuckDuckGo lite search results from HTML.
 * Returns empty array if CAPTCHA is detected.
 */
function parseDDGResults(html: string, maxResults: number): Array<{ url: string, title: string, snippet: string }> | null {
  // CAPTCHA detection
  if (html.includes('anomaly-modal') || html.includes('Select all squares')) {
    return null // CAPTCHA detected
  }

  const results: Array<{ url: string, title: string, snippet: string }> = []

  const linkRegex = /<a[^>]+class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRegex = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi

  const links: Array<{ url: string, title: string }> = []
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

  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    results.push({
      url: links[i]!.url,
      title: links[i]!.title,
      snippet: snippets[i] ?? '',
    })
  }

  return results
}

/**
 * Web search with multi-backend fallback strategy.
 *
 * Backends tried in order:
 * 1. Bing — SSR HTML, reliable, no CAPTCHA for moderate usage
 * 2. DuckDuckGo Lite — fails to CAPTCHA under bot detection
 *
 * NOTICE: For high-volume or production use, configure a dedicated search API
 * (Brave Search, SearXNG) via AIRI_SEARCH_API_URL environment variable.
 */
export async function webSearch(params: {
  query: string
  maxResults?: number
}): Promise<WebSearchResult> {
  const startedAt = Date.now()
  const { query, maxResults = 10 } = params

  // Try custom search API first if configured
  const customApiUrl = process.env.AIRI_SEARCH_API_URL
  if (customApiUrl) {
    try {
      const result = await searchViaCustomAPI(customApiUrl, query, maxResults, startedAt)
      if (result)
        return result
    }
    catch { /* Fall through to Bing */ }
  }

  // Backend 1: Bing
  try {
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    const response = await fetch(bingUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': SEARCH_UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }).finally(() => clearTimeout(timeout))

    if (response.ok) {
      const html = await response.text()
      const results = parseBingResults(html, maxResults)

      if (results.length > 0) {
        return {
          query,
          results,
          totalResults: results.length,
          searchedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        }
      }
    }
  }
  catch { /* Fall through to DDG */ }

  // Backend 2: DuckDuckGo Lite
  try {
    const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    const response = await fetch(ddgUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': SEARCH_UA,
        'Accept': 'text/html',
      },
    }).finally(() => clearTimeout(timeout))

    if (response.ok) {
      const html = await response.text()
      const results = parseDDGResults(html, maxResults)

      if (results !== null && results.length > 0) {
        return {
          query,
          results,
          totalResults: results.length,
          searchedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        }
      }

      if (results === null) {
        // CAPTCHA detected — don't retry DDG
      }
    }
  }
  catch { /* Fall through to fallback */ }

  // All backends failed
  return {
    query,
    results: [],
    totalResults: 0,
    searchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    note: 'All search backends returned no results. This may be due to bot detection or network issues. '
      + 'Use web_fetch to directly fetch known URLs, or use bash with `curl` to query APIs. '
      + 'For reliable search, configure AIRI_SEARCH_API_URL with a SearXNG or Brave Search API endpoint.',
  }
}

/**
 * Query a custom search API (SearXNG-compatible JSON format).
 */
async function searchViaCustomAPI(
  apiUrl: string,
  query: string,
  maxResults: number,
  startedAt: number,
): Promise<WebSearchResult | null> {
  const url = `${apiUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  const response = await fetch(url, {
    signal: controller.signal,
    headers: { Accept: 'application/json' },
  }).finally(() => clearTimeout(timeout))

  if (!response.ok)
    return null

  const data = await response.json() as {
    results?: Array<{ url: string, title: string, content: string }>
  }

  const results = (data.results ?? []).slice(0, maxResults).map(r => ({
    url: r.url,
    title: r.title,
    snippet: r.content,
  }))

  return {
    query,
    results,
    totalResults: results.length,
    searchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  }
}
