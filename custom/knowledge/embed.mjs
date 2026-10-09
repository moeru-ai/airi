// Voyage AI embeddings. Documents use `input_type: document`, questions use `input_type: query`,
// like WeKnora's WithEmbedQuery (internal/models/embedding/protocol.go).

const DEFAULT_BASE_URL = 'https://api.voyageai.com/v1'
const BATCH_SIZE = 64
// Voyage truncates long inputs itself. Cutting first keeps one request under its token limit.
const MAX_INPUT_CHARS = 16_000
const MAX_RETRIES = 4
const RETRY_BASE_MS = 1000
const REQUEST_TIMEOUT_MS = 60_000

/** The text WeKnora embeds for a chunk: title, heading breadcrumb, then the content. */
export function embeddingText({ title, header, content }) {
  return [title, header && `${header}\n`, content].filter(Boolean).join('\n')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Creates an embedder. Returns undefined without an API key, so callers fall back to keyword search.
 * `embed(texts, { model, inputType })` resolves to one Float32Array per text.
 */
export function createEmbedder({ apiKey, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch } = {}) {
  if (!apiKey)
    return undefined

  async function request(body) {
    for (let attempt = 0; ; attempt++) {
      const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/embeddings`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      // Rate limits and server errors are worth a retry with backoff.
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_MS * 2 ** attempt)
        continue
      }
      const json = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(`Voyage HTTP ${response.status}: ${json.detail ?? json.error?.message ?? 'lỗi không rõ'}`)
      return json
    }
  }

  return async function embed(texts, { model, inputType = 'document' }) {
    const vectors = []
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const input = texts.slice(start, start + BATCH_SIZE).map(text => text.slice(0, MAX_INPUT_CHARS) || ' ')
      const json = await request({ model, input, input_type: inputType })
      const ordered = [...json.data].sort((a, b) => a.index - b.index)
      vectors.push(...ordered.map(item => Float32Array.from(item.embedding)))
    }
    return vectors
  }
}
